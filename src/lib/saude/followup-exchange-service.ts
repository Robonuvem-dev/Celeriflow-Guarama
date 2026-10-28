import { randomUUID } from "node:crypto";
import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { databaseConnection } from "@/db/client";
import type { DatabaseConnection } from "@/db/connection";
import type { JsonValue } from "@/db/json";
import { withDatabaseTransaction, type DatabaseExecutor, type DatabaseTransaction } from "@/db/transaction";
import { integrationConnections } from "@/db/schema/integrations";
import { healthUnits } from "@/db/schema/health-workforce";
import { healthFollowupBindings, healthFollowupReceivers, healthFollowupBatches, healthFollowupBatchItems } from "@/db/schema/health-followup";
import { followupRow, readFollowupBinding, readFollowupBatch, readFollowupGeneration } from "@/db/repositories/health-followup/exchange";
import { insertAuditEvent } from "@/db/repositories/platform/audit";
import type { HealthFollowupContext } from "@/lib/contracts/health-followup";
import { auditEventTypes } from "@/lib/contracts/audit";
import { assertHealthUnitAccess } from "@/lib/platform/tenant-context";
import { getIntegrationDefinition } from "@/lib/integrations/registry";
import { canonicalFollowupJson, followupContractNameSchema, followupEnvelopeSchema, followupHash, followupSchemaVersion, type FollowupContractName } from "./followup-contract";
import { collectFollowupSources, type FollowupSourceRecord } from "./followup-source-service";

const id = z.string().min(1).max(200);
const json = (value: unknown): JsonValue => JSON.parse(JSON.stringify(value));
export const followupReceiverPath = (contract: FollowupContractName) => `/api/saude/acompanhamento/receptores/${contract}`;
const connectionConfiguration = z.object({ transport: z.literal("IN_PROCESS"), contract: followupContractNameSchema, schemaVersion: z.literal(followupSchemaVersion), receiverId: id, unitId: id, endpoint: z.string() }).strict();

export async function followupBindingForActor(tx: DatabaseExecutor, context: HealthFollowupContext, bindingId: string) {
  const binding = await readFollowupBinding(tx, bindingId);
  assertHealthUnitAccess(context.user, binding.unitId);
  return binding;
}
export function assertFollowupConnection(binding: { unitId: string; contractName: string; schemaVersion: string; receiverId: string; connection: { provider: string; category: string; environment: string; status: string; baseUrl: string | null; configuration: unknown }; receiver: { contractName: string; schemaVersion: string; unitId: string } }) {
  const contract = followupContractNameSchema.parse(binding.contractName), configuration = connectionConfiguration.parse(binding.connection.configuration);
  if (binding.connection.provider !== "CELERIFLOW_ACOMPANHAMENTO" || binding.connection.category !== "SAUDE" || binding.connection.environment !== "PRODUCAO" || binding.connection.status !== "ATIVA" || binding.schemaVersion !== followupSchemaVersion || binding.receiver.contractName !== contract || binding.receiver.schemaVersion !== followupSchemaVersion || binding.receiver.unitId !== binding.unitId || configuration.contract !== contract || configuration.receiverId !== binding.receiverId || configuration.unitId !== binding.unitId || configuration.endpoint !== followupReceiverPath(contract) || binding.connection.baseUrl !== configuration.endpoint) throw new Error("Conexão de acompanhamento inativa ou incompatível com o receptor e a versão do contrato.");
  return contract;
}

export async function configureHealthFollowup(context: HealthFollowupContext, raw: unknown, connection: DatabaseConnection = databaseConnection) {
  return withDatabaseTransaction(connection, tx => configureHealthFollowupInTransaction(tx, context, raw), { timeoutMs: 5_000 });
}

export async function configureHealthFollowupInTransaction(tx: DatabaseTransaction, context: HealthFollowupContext, raw: unknown) {
  const input = z.object({ unitId: id, contract: followupContractNameSchema, code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{1,80}$/), name: z.string().trim().min(3).max(200) }).strict().parse(raw);
  assertHealthUnitAccess(context.user, input.unitId);
  if (getIntegrationDefinition(input.code)) throw new Error("Código reservado a um conector da plataforma. Informe código próprio para esse acompanhamento.");
  for (const key of [`HEALTH_FOLLOWUP_CONFIG:${input.unitId}:${input.contract}`, `HEALTH_FOLLOWUP_CODE:${input.code}`].sort()) await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${key}))`);
  if (!(await tx.select({ id: healthUnits.id }).from(healthUnits).where(and(eq(healthUnits.id, input.unitId), eq(healthUnits.isActive, true))).limit(1))[0]) throw new Error("Selecione uma unidade ativa para o acompanhamento.");
  const [existingRow] = await tx.select().from(healthFollowupBindings).where(and(eq(healthFollowupBindings.unitId, input.unitId), eq(healthFollowupBindings.contractName, input.contract))).limit(1);
  const existing = existingRow ? await readFollowupBinding(tx, existingRow.id) : null;
  if (existing && existing.connection.code !== input.code) throw new Error("Use o código da conexão já vinculada para atualizar o nome desse acompanhamento.");
  const [usedCode] = await tx.select({ id: integrationConnections.id }).from(integrationConnections).where(eq(integrationConnections.code, input.code)).limit(1);
  if (usedCode && usedCode.id !== existing?.connectionId) throw new Error("Código de conexão já utilizado por outro destino.");
  const receiver = followupRow((await (existing ? tx.update(healthFollowupReceivers).set({ name: input.name }).where(eq(healthFollowupReceivers.id, existing.receiverId)).returning() : tx.insert(healthFollowupReceivers).values({ code: `RECEPTOR_${input.code}`, name: input.name, contractName: input.contract, schemaVersion: followupSchemaVersion, unitId: input.unitId }).returning()))[0]);
  const endpoint = followupReceiverPath(input.contract), configuration = { transport: "IN_PROCESS", contract: input.contract, schemaVersion: followupSchemaVersion, receiverId: receiver.id, unitId: input.unitId, endpoint };
  const connection = followupRow((await tx.insert(integrationConnections).values({ code: input.code, name: input.name, provider: "CELERIFLOW_ACOMPANHAMENTO", category: "SAUDE", environment: "PRODUCAO", status: "ATIVA", baseUrl: endpoint, configuration }).onConflictDoUpdate({ target: integrationConnections.code, set: { name: input.name, provider: "CELERIFLOW_ACOMPANHAMENTO", category: "SAUDE", environment: "PRODUCAO", status: "ATIVA", baseUrl: endpoint, configuration } }).returning())[0]);
  const binding = existing || followupRow((await tx.insert(healthFollowupBindings).values({ connectionId: connection.id, receiverId: receiver.id, unitId: input.unitId, contractName: input.contract, schemaVersion: followupSchemaVersion, createdByUsuarioId: context.user.id }).returning())[0]);
  await insertAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "HEALTH_FOLLOWUP_BINDING", targetId: binding.id });
  return { id: binding.id, connectionId: connection.id, receiverId: receiver.id };
}

export async function followupBatchForActor(tx: DatabaseExecutor, context: HealthFollowupContext, batchId: string) {
  const batch = await readFollowupBatch(tx, batchId);
  assertHealthUnitAccess(context.user, batch.binding.unitId);
  return batch;
}

const generateSchema = z.object({ bindingId: id, requestKey: z.uuid(), fromDate: z.iso.date(), toDate: z.iso.date(), reprocessOfId: id.nullable().default(null), onlyRejected: z.boolean().default(true) }).strict().refine(input => input.fromDate <= input.toDate, "Confira as datas da seleção de origens.");
function splitSources(records: FollowupSourceRecord[]) {
  const groups: FollowupSourceRecord[][] = []; let group: FollowupSourceRecord[] = [], bytes = 0;
  for (const record of records) {
    const size = Buffer.byteLength(canonicalFollowupJson(record), "utf8");
    if (size > 16 * 1024 * 1024 - 65536) throw new Error("Uma origem excede o tamanho do contrato. Revise o conteúdo clínico antes de gerar a remessa.");
    if (group.length >= 500 || bytes + size > 16 * 1024 * 1024 - 65536) { groups.push(group); group = []; bytes = 0; }
    group.push(record); bytes += size;
  }
  if (group.length) groups.push(group);
  return groups;
}

export async function generateHealthFollowupBatches(context: HealthFollowupContext, raw: unknown, connection: DatabaseConnection = databaseConnection): Promise<{ batchIds: string[]; total: number }> {
  return withDatabaseTransaction(connection, tx => generateHealthFollowupBatchesInTransaction(tx, context, raw), { timeoutMs: 120_000 });
}

export async function generateHealthFollowupBatchesInTransaction(tx: DatabaseTransaction, context: HealthFollowupContext, raw: unknown): Promise<{ batchIds: string[]; total: number }> {
  const input = generateSchema.parse(raw), binding = await followupBindingForActor(tx, context, input.bindingId), contract = assertFollowupConnection(binding);
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`HEALTH_FOLLOWUP_GENERATE:${binding.id}:${input.requestKey}`}))`);
  const onlyRejected = Boolean(input.reprocessOfId && input.onlyRejected);
  const recover = async (executor: DatabaseExecutor) => {
    const existing = await readFollowupGeneration(executor, binding.id, input.requestKey);
    if (!existing.length) return null;
    if (existing.some(batch => batch.fromDate.toISOString().slice(0, 10) !== input.fromDate || batch.toDate.toISOString().slice(0, 10) !== input.toDate || batch.reprocessOfId !== input.reprocessOfId || batch.onlyRejected !== onlyRejected)) throw new Error("Chave de geração já utilizada com outras datas ou seleção de reprocessamento.");
    return { batchIds: existing.map(batch => batch.id), total: existing.reduce((sum, batch) => sum + batch.items, 0) };
  };
  const prior = await recover(tx); if (prior) return prior;
  let originKeys: { originType: string; originId: string }[] | undefined;
  if (input.reprocessOfId) {
    const previous = await followupBatchForActor(tx, context, input.reprocessOfId);
    if (previous.bindingId !== binding.id) throw new Error("O reprocessamento deve usar a conexão e unidade da remessa anterior.");
    const rejected = new Set(previous.receipt?.results.filter(result => ["REJEITADO", "VERSAO_ANTERIOR"].includes(result.status)).map(result => result.batchItemId) || []);
    originKeys = previous.items.filter(item => !onlyRejected || rejected.has(item.id)).map(item => ({ originType: item.originType, originId: item.originId }));
    if (!originKeys.length) throw new Error("Não há origens rejeitadas nessa remessa para reprocessar.");
  }
  const records = await collectFollowupSources(context, { contract, unitId: binding.unitId, fromDate: input.fromDate, toDate: input.toDate, originKeys }, tx);
  if (!records.length) throw new Error("Não foram localizadas origens de acompanhamento nesse recorte.");
  const groups = splitSources(records);
  const currentBinding = await followupBindingForActor(tx, context, binding.id); assertFollowupConnection(currentBinding);
  const batchIds: string[] = [];
  for (const [index, group] of groups.entries()) {
    const batchId = randomUUID();
    const envelope = followupEnvelopeSchema.parse({ contract, schemaVersion: followupSchemaVersion, batchId, sender: { connectionId: binding.connectionId, code: binding.connection.code, unitId: binding.unitId }, receiver: { id: binding.receiverId, code: binding.receiver.code, name: binding.receiver.name }, fromDate: input.fromDate, toDate: input.toDate, generatedAt: new Date().toISOString(), reprocessOfId: input.reprocessOfId, records: group });
    const batch = followupRow((await tx.insert(healthFollowupBatches).values({ id: batchId, bindingId: binding.id, idempotencyKey: `${input.requestKey}:${String(index + 1).padStart(6, "0")}`, fromDate: new Date(`${input.fromDate}T00:00:00Z`), toDate: new Date(`${input.toDate}T00:00:00Z`), contractName: contract, schemaVersion: followupSchemaVersion, reprocessOfId: input.reprocessOfId, onlyRejected, hashSha256: followupHash(envelope), payload: json(envelope), createdByUsuarioId: context.user.id }).returning())[0]);
    await tx.insert(healthFollowupBatchItems).values(group.map((record, ordinal) => ({ batchId: batch.id, ordinal: ordinal + 1, originType: record.originType, originId: record.originId, idempotencyKey: record.idempotencyKey, sourceVersion: record.sourceVersion, payload: json(record) })));
    batchIds.push(batch.id);
  }
  await insertAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "HEALTH_FOLLOWUP_GENERATION", targetId: input.requestKey });
  return { batchIds, total: records.length };
}
