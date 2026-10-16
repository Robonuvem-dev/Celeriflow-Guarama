import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { assertHealthUnitAccess, type AppContext } from "@/lib/platform/tenant-context";
import { auditEventTypes, writeAuditEvent } from "@/lib/platform/audit-evidence";
import { getIntegrationDefinition } from "@/lib/integrations/registry";
import { canonicalFollowupJson, followupContractNameSchema, followupEnvelopeSchema, followupHash, followupSchemaVersion, type FollowupContractName } from "./followup-contract";
import { collectFollowupSources, type FollowupSourceRecord } from "./followup-source-service";

const id = z.string().min(1).max(200);
const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value));
export const followupReceiverPath = (contract: FollowupContractName) => `/api/saude/acompanhamento/receptores/${contract}`;
const connectionConfiguration = z.object({ transport: z.literal("IN_PROCESS"), contract: followupContractNameSchema, schemaVersion: z.literal(followupSchemaVersion), receiverId: id, unitId: id, endpoint: z.string() }).strict();

export async function followupBindingForActor(tx: Pick<Prisma.TransactionClient, "healthFollowupBinding">, context: AppContext, bindingId: string) {
  const binding = await tx.healthFollowupBinding.findUniqueOrThrow({ where: { id: bindingId }, include: { connection: true, receiver: true, unit: { select: { name: true } } } });
  assertHealthUnitAccess(context.user, binding.unitId);
  return binding;
}
export function assertFollowupConnection(binding: { unitId: string; contractName: string; schemaVersion: string; receiverId: string; connection: { provider: string; category: string; environment: string; status: string; baseUrl: string | null; configuration: unknown }; receiver: { contractName: string; schemaVersion: string; unitId: string } }) {
  const contract = followupContractNameSchema.parse(binding.contractName), configuration = connectionConfiguration.parse(binding.connection.configuration);
  if (binding.connection.provider !== "CELERIFLOW_ACOMPANHAMENTO" || binding.connection.category !== "SAUDE" || binding.connection.environment !== "PRODUCAO" || binding.connection.status !== "ATIVA" || binding.schemaVersion !== followupSchemaVersion || binding.receiver.contractName !== contract || binding.receiver.schemaVersion !== followupSchemaVersion || binding.receiver.unitId !== binding.unitId || configuration.contract !== contract || configuration.receiverId !== binding.receiverId || configuration.unitId !== binding.unitId || configuration.endpoint !== followupReceiverPath(contract) || binding.connection.baseUrl !== configuration.endpoint) throw new Error("Conexão de acompanhamento inativa ou incompatível com o receptor e a versão do contrato.");
  return contract;
}

export async function configureHealthFollowup(context: AppContext, raw: unknown) {
  const input = z.object({ unitId: id, contract: followupContractNameSchema, code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{1,80}$/), name: z.string().trim().min(3).max(200) }).strict().parse(raw);
  assertHealthUnitAccess(context.user, input.unitId);
  if (getIntegrationDefinition(input.code)) throw new Error("Código reservado a um conector da plataforma. Informe código próprio para esse acompanhamento.");
  return context.prisma.$transaction(async tx => {
    for (const key of [`HEALTH_FOLLOWUP_CONFIG:${input.unitId}:${input.contract}`, `HEALTH_FOLLOWUP_CODE:${input.code}`].sort()) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
    if (!await tx.healthUnit.count({ where: { id: input.unitId, isActive: true } })) throw new Error("Selecione uma unidade ativa para o acompanhamento.");
    const existing = await tx.healthFollowupBinding.findUnique({ where: { unitId_contractName: { unitId: input.unitId, contractName: input.contract } }, include: { connection: true } });
    if (existing && existing.connection.code !== input.code) throw new Error("Use o código da conexão já vinculada para atualizar o nome desse acompanhamento.");
    const usedCode = await tx.integrationConnection.findUnique({ where: { code: input.code }, select: { id: true } });
    if (usedCode && usedCode.id !== existing?.connectionId) throw new Error("Código de conexão já utilizado por outro destino.");
    const receiver = existing ? await tx.healthFollowupReceiver.update({ where: { id: existing.receiverId }, data: { name: input.name } }) : await tx.healthFollowupReceiver.create({ data: { code: `RECEPTOR_${input.code}`, name: input.name, contractName: input.contract, schemaVersion: followupSchemaVersion, unitId: input.unitId } });
    const endpoint = followupReceiverPath(input.contract), configuration = { transport: "IN_PROCESS", contract: input.contract, schemaVersion: followupSchemaVersion, receiverId: receiver.id, unitId: input.unitId, endpoint };
    const connection = await tx.integrationConnection.upsert({ where: { code: input.code }, create: { code: input.code, name: input.name, provider: "CELERIFLOW_ACOMPANHAMENTO", category: "SAUDE", environment: "PRODUCAO", status: "ATIVA", baseUrl: endpoint, configuration }, update: { name: input.name, provider: "CELERIFLOW_ACOMPANHAMENTO", category: "SAUDE", environment: "PRODUCAO", status: "ATIVA", baseUrl: endpoint, configuration } });
    const binding = existing || await tx.healthFollowupBinding.create({ data: { connectionId: connection.id, receiverId: receiver.id, unitId: input.unitId, contractName: input.contract, schemaVersion: followupSchemaVersion, createdByUsuarioId: context.user.id } });
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "HEALTH_FOLLOWUP_BINDING", targetId: binding.id });
    return { id: binding.id, connectionId: connection.id, receiverId: receiver.id };
  });
}

export async function followupBatchForActor(tx: Pick<Prisma.TransactionClient, "healthFollowupBatch">, context: AppContext, batchId: string) {
  const batch = await tx.healthFollowupBatch.findUniqueOrThrow({ where: { id: batchId }, include: { binding: { include: { connection: true, receiver: true } }, items: { orderBy: { ordinal: "asc" } }, receipt: { include: { results: { orderBy: { batchItem: { ordinal: "asc" } }, include: { batchItem: { select: { ordinal: true, originType: true, originId: true } } } } } } } });
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

export async function generateHealthFollowupBatches(context: AppContext, raw: unknown): Promise<{ batchIds: string[]; total: number }> {
  const input = generateSchema.parse(raw), binding = await followupBindingForActor(context.prisma, context, input.bindingId), contract = assertFollowupConnection(binding);
  const onlyRejected = Boolean(input.reprocessOfId && input.onlyRejected);
  const recover = async (tx: Pick<Prisma.TransactionClient, "healthFollowupBatch">) => {
    const existing = await tx.healthFollowupBatch.findMany({ where: { bindingId: binding.id, idempotencyKey: { startsWith: `${input.requestKey}:` } }, orderBy: { idempotencyKey: "asc" }, select: { id: true, fromDate: true, toDate: true, reprocessOfId: true, onlyRejected: true, _count: { select: { items: true } } } });
    if (!existing.length) return null;
    if (existing.some(batch => batch.fromDate.toISOString().slice(0, 10) !== input.fromDate || batch.toDate.toISOString().slice(0, 10) !== input.toDate || batch.reprocessOfId !== input.reprocessOfId || batch.onlyRejected !== onlyRejected)) throw new Error("Chave de geração já utilizada com outras datas ou seleção de reprocessamento.");
    return { batchIds: existing.map(batch => batch.id), total: existing.reduce((sum, batch) => sum + batch._count.items, 0) };
  };
  const prior = await recover(context.prisma); if (prior) return prior;
  let originKeys: { originType: string; originId: string }[] | undefined;
  if (input.reprocessOfId) {
    const previous = await followupBatchForActor(context.prisma, context, input.reprocessOfId);
    if (previous.bindingId !== binding.id) throw new Error("O reprocessamento deve usar a conexão e unidade da remessa anterior.");
    const rejected = new Set(previous.receipt?.results.filter(result => ["REJEITADO", "VERSAO_ANTERIOR"].includes(result.status)).map(result => result.batchItemId) || []);
    originKeys = previous.items.filter(item => !onlyRejected || rejected.has(item.id)).map(item => ({ originType: item.originType, originId: item.originId }));
    if (!originKeys.length) throw new Error("Não há origens rejeitadas nessa remessa para reprocessar.");
  }
  const records = await collectFollowupSources(context, { contract, unitId: binding.unitId, fromDate: input.fromDate, toDate: input.toDate, originKeys });
  if (!records.length) throw new Error("Não foram localizadas origens de acompanhamento nesse recorte.");
  const groups = splitSources(records);
  return context.prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`HEALTH_FOLLOWUP_GENERATE:${binding.id}:${input.requestKey}`}))`;
    const existing = await recover(tx); if (existing) return existing;
    const currentBinding = await followupBindingForActor(tx, context, binding.id); assertFollowupConnection(currentBinding);
    const batchIds: string[] = [];
    for (const [index, group] of groups.entries()) {
      const batchId = randomUUID();
      const envelope = followupEnvelopeSchema.parse({ contract, schemaVersion: followupSchemaVersion, batchId, sender: { connectionId: binding.connectionId, code: binding.connection.code, unitId: binding.unitId }, receiver: { id: binding.receiverId, code: binding.receiver.code, name: binding.receiver.name }, fromDate: input.fromDate, toDate: input.toDate, generatedAt: new Date().toISOString(), reprocessOfId: input.reprocessOfId, records: group });
      const batch = await tx.healthFollowupBatch.create({ data: { id: batchId, bindingId: binding.id, idempotencyKey: `${input.requestKey}:${String(index + 1).padStart(6, "0")}`, fromDate: new Date(`${input.fromDate}T00:00:00Z`), toDate: new Date(`${input.toDate}T00:00:00Z`), contractName: contract, schemaVersion: followupSchemaVersion, reprocessOfId: input.reprocessOfId, onlyRejected, hashSha256: followupHash(envelope), payload: json(envelope), createdByUsuarioId: context.user.id } });
      await tx.healthFollowupBatchItem.createMany({ data: group.map((record, ordinal) => ({ batchId: batch.id, ordinal: ordinal + 1, originType: record.originType, originId: record.originId, idempotencyKey: record.idempotencyKey, sourceVersion: record.sourceVersion, payload: json(record) })) });
      batchIds.push(batch.id);
    }
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "HEALTH_FOLLOWUP_GENERATION", targetId: input.requestKey });
    return { batchIds, total: records.length };
  }, { timeout: 120000 });
}
