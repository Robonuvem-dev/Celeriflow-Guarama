import { z } from "zod";
import { and, count, eq, inArray, sql } from "drizzle-orm";
import { databaseConnection } from "@/db/client";
import type { DatabaseConnection } from "@/db/connection";
import { getPostgresError } from "@/db/errors";
import type { JsonValue } from "@/db/json";
import { withDatabaseTransaction, type DatabaseTransaction } from "@/db/transaction";
import { patients } from "@/db/schema/health-registration";
import { healthProfessionals } from "@/db/schema/health-workforce";
import { healthPregnancies } from "@/db/schema/health-care-lines";
import { medicalRecords } from "@/db/schema/health-care";
import { healthRegulationRequests } from "@/db/schema/health-regulation";
import { healthWaitlists, healthAppointments } from "@/db/schema/health-agenda";
import { integrationRuns } from "@/db/schema/integrations";
import { healthFollowupReceivers, healthFollowupRecords, healthFollowupProcessedKeys, healthFollowupReceipts, healthFollowupResults, healthFollowupBatches } from "@/db/schema/health-followup";
import { followupRow } from "@/db/repositories/health-followup/exchange";
import { insertAuditEvent } from "@/db/repositories/platform/audit";
import type { HealthFollowupContext } from "@/lib/contracts/health-followup";
import { auditEventTypes } from "@/lib/contracts/audit";
import { assertFollowupConnection, followupBatchForActor } from "./followup-exchange-service";
import { canonicalFollowupJson, followupEnvelopeSchema, followupHash, followupRecordKey, followupRecordSchemas, followupRecordVersion, type FollowupContractName, type FollowupRecord } from "./followup-contract";

type HealthFollowupReceipt = typeof healthFollowupReceipts.$inferSelect;
type ReceiptDto = Pick<HealthFollowupReceipt, "id" | "batchId" | "receiverId" | "protocol" | "status" | "total" | "accepted" | "rejected" | "unchanged"> & { createdAt: string };
const receiptDto = (receipt: HealthFollowupReceipt): ReceiptDto => ({ id: receipt.id, batchId: receipt.batchId, receiverId: receipt.receiverId, protocol: receipt.protocol, status: receipt.status, total: receipt.total, accepted: receipt.accepted, rejected: receipt.rejected, unchanged: receipt.unchanged, createdAt: receipt.createdAt.toISOString() });
const json = (value: unknown): JsonValue => JSON.parse(JSON.stringify(value));

function validationMessage(error: z.ZodError) {
  return error.issues.map(issue => `${issue.path.join(".") || "registro"}: ${issue.code === "custom" ? issue.message : issue.code === "invalid_type" || issue.code === "too_small" ? "Campo obrigatório ausente, vazio ou de tipo incompatível." : issue.code === "too_big" ? "Valor excede o limite dessa versão do contrato." : "Formato ou valor incompatível com o contrato."}`).join("; ");
}

async function validateSourceOwnership(tx: DatabaseTransaction, record: FollowupRecord): Promise<string | null> {
  const [patient] = await tx.select({ personId: patients.personId }).from(patients).where(eq(patients.id, record.patientId)).limit(1);
  if (!patient || patient.personId !== record.patient.personId) return "Paciente/identidade de origem alterado ou não localizado. Atualize a origem e gere nova remessa.";
  if (record.professionalId && !(await tx.select({ id: healthProfessionals.id }).from(healthProfessionals).where(and(eq(healthProfessionals.id, record.professionalId), record.professional?.employeeId ? eq(healthProfessionals.employeeId, record.professional.employeeId) : undefined)).limit(1))[0]) return "Profissional de origem não corresponde ao cadastro compartilhado.";
  if (record.originType === "HEALTH_PREGNANCY") {
    if (!(await tx.select({ id: healthPregnancies.id }).from(healthPregnancies).where(and(eq(healthPregnancies.id, record.originId), eq(healthPregnancies.patientId, record.patientId), eq(healthPregnancies.unitId, record.unitId))).limit(1))[0]) return "Gestação não pertence ao paciente e unidade informados na origem.";
    const ids = [...new Set([record.data.openedMedicalRecordId, ...record.data.visits.map(visit => visit.medicalRecordId), ...record.data.postpartumVisits.map(visit => visit.medicalRecordId), ...record.data.exams.map(exam => exam.medicalRecordId)])];
    if ((await tx.select({ total: count() }).from(medicalRecords).where(and(inArray(medicalRecords.id, ids), eq(medicalRecords.patientId, record.patientId))))[0].total !== ids.length) return "Há atendimento gestacional/exame sem vínculo ao paciente da origem.";
  } else if (record.originType === "CHRONIC_PATIENT") {
    if (record.originId !== record.patientId) return "A origem do acompanhamento crônico deve identificar o paciente acompanhado.";
    const ids = [...new Set([record.data.originMedicalRecordId, ...record.data.conditions.map(condition => condition.medicalRecordId).filter((id): id is string => Boolean(id)), ...record.data.assessments.map(assessment => assessment.medicalRecordId)])];
    if ((await tx.select({ total: count() }).from(medicalRecords).where(and(inArray(medicalRecords.id, ids), eq(medicalRecords.patientId, record.patientId))))[0].total !== ids.length) return "Há condição/avaliação clínica vinculada a outro paciente ou sem atendimento de origem.";
    const assessmentIds = [...new Set(record.data.assessments.map(assessment => assessment.medicalRecordId))];
    if (assessmentIds.length && (await tx.select({ total: count() }).from(medicalRecords).where(and(inArray(medicalRecords.id, assessmentIds), eq(medicalRecords.unitId, record.unitId))))[0].total !== assessmentIds.length) return "Avaliação clínica fora da unidade de origem do acompanhamento.";
  } else {
    const sourceExists = record.originType === "REGULATION_REQUEST"
      ? (await tx.select({ id: healthRegulationRequests.id }).from(healthRegulationRequests).where(and(eq(healthRegulationRequests.id, record.originId), eq(healthRegulationRequests.patientId, record.patientId), eq(healthRegulationRequests.requestUnitId, record.unitId))).limit(1))[0]
      : (await tx.select({ id: healthWaitlists.id }).from(healthWaitlists).where(and(eq(healthWaitlists.id, record.originId), eq(healthWaitlists.patientId, record.patientId), eq(healthWaitlists.unitId, record.unitId))).limit(1))[0];
    if (!sourceExists) return "Pedido/espera não pertence ao paciente e à unidade de origem.";
    if (record.data.waitlist && !(await tx.select({ id: healthWaitlists.id }).from(healthWaitlists).where(and(eq(healthWaitlists.id, record.data.waitlist.id), eq(healthWaitlists.patientId, record.patientId))).limit(1))[0]) return "A espera informada não pertence ao paciente da regulação.";
    if (record.data.appointment && !(await tx.select({ id: healthAppointments.id }).from(healthAppointments).where(and(eq(healthAppointments.id, record.data.appointment.id), eq(healthAppointments.patientId, record.patientId), eq(healthAppointments.unitId, record.data.appointment.unitId))).limit(1))[0]) return "Agendamento informado não pertence ao paciente/unidade declarados.";
  }
  return null;
}

async function receiveRecord(tx: DatabaseTransaction, input: { receiverId: string; batchId: string; unitId: string; contract: FollowupContractName; value: unknown }): Promise<{ status: string; message: string; recordId: string | null }> {
  const parsed = followupRecordSchemas[input.contract].safeParse(input.value);
  if (!parsed.success) return { status: "REJEITADO", message: validationMessage(parsed.error), recordId: null };
  const record: FollowupRecord = parsed.data;
  if (record.unitId !== input.unitId) return { status: "REJEITADO", message: "Unidade de origem diferente da conexão e do receptor.", recordId: null };
  if (followupRecordVersion(record) !== record.sourceVersion || followupRecordKey(input.contract, record.originType, record.originId, record.sourceVersion) !== record.idempotencyKey) return { status: "REJEITADO", message: "Versão ou chave de repetição não corresponde ao conteúdo da origem.", recordId: null };
  const [knownRow] = await tx.select({ key: healthFollowupProcessedKeys, record: { id: healthFollowupRecords.id, sourceVersion: healthFollowupRecords.sourceVersion, snapshotAt: healthFollowupRecords.snapshotAt } }).from(healthFollowupProcessedKeys).innerJoin(healthFollowupRecords, eq(healthFollowupRecords.id, healthFollowupProcessedKeys.recordId)).where(and(eq(healthFollowupProcessedKeys.receiverId, input.receiverId), eq(healthFollowupProcessedKeys.key, record.idempotencyKey))).limit(1);
  const knownKey = knownRow ? { ...knownRow.key, record: knownRow.record } : null;
  if (knownKey) {
    const refreshSnapshot = knownKey.record.sourceVersion === record.sourceVersion && knownKey.record.snapshotAt <= new Date(record.snapshotAt);
    await tx.update(healthFollowupRecords).set({ lastReceivedAt: new Date(), ...(refreshSnapshot ? { snapshotAt: new Date(record.snapshotAt), payload: json(record), lastBatchId: input.batchId } : {}) }).where(eq(healthFollowupRecords.id, knownKey.recordId));
    return { status: "JA_RECEBIDO", message: "Chave de origem já processada; conteúdo atual preservado, sem repetir o registro.", recordId: knownKey.recordId };
  }
  const ownership = await validateSourceOwnership(tx, record);
  if (ownership) return { status: "REJEITADO", message: ownership, recordId: null };
  const [current] = await tx.select({ id: healthFollowupRecords.id, sourceUpdatedAt: healthFollowupRecords.sourceUpdatedAt, snapshotAt: healthFollowupRecords.snapshotAt, sourceVersion: healthFollowupRecords.sourceVersion }).from(healthFollowupRecords).where(and(eq(healthFollowupRecords.receiverId, input.receiverId), eq(healthFollowupRecords.originType, record.originType), eq(healthFollowupRecords.originId, record.originId))).limit(1);
  const sourceUpdatedAt = new Date(record.sourceUpdatedAt), snapshotAt = new Date(record.snapshotAt);
  if (current && current.sourceVersion !== record.sourceVersion && (current.sourceUpdatedAt > sourceUpdatedAt || current.sourceUpdatedAt.valueOf() === sourceUpdatedAt.valueOf() && current.snapshotAt >= snapshotAt)) return { status: "VERSAO_ANTERIOR", message: "Há versão da origem já recebida com data igual ou posterior. Gere remessa atualizada para reprocessar.", recordId: current.id };
  const data = { patientId: record.patientId, professionalId: record.professionalId, unitId: record.unitId, sourceVersion: record.sourceVersion, sourceUpdatedAt, snapshotAt, payload: json(record), lastBatchId: input.batchId, lastReceivedAt: new Date() };
  const received = followupRow((await tx.insert(healthFollowupRecords).values({ receiverId: input.receiverId, originType: record.originType, originId: record.originId, ...data }).onConflictDoUpdate({ target: [healthFollowupRecords.receiverId, healthFollowupRecords.originType, healthFollowupRecords.originId], set: data }).returning({ id: healthFollowupRecords.id }))[0]);
  await tx.insert(healthFollowupProcessedKeys).values({ receiverId: input.receiverId, key: record.idempotencyKey, recordId: received.id, sourceVersion: record.sourceVersion });
  return { status: current?.sourceVersion === record.sourceVersion ? "JA_RECEBIDO" : "VALIDADO", message: current ? "Origem validada e acompanhamento atualizado no receptor." : "Origem validada e acompanhamento registrado no receptor.", recordId: received.id };
}

export async function processHealthFollowupBatch(context: HealthFollowupContext, batchId: string, expectedContract?: FollowupContractName, connection: DatabaseConnection = databaseConnection): Promise<ReceiptDto> {
  const initial = await followupBatchForActor(connection.db, context, batchId);
  if (expectedContract && initial.contractName !== expectedContract) throw new Error("A remessa não utiliza o contrato desse receptor.");
  if (initial.receipt) return receiptDto(initial.receipt);
  try {
    return await withDatabaseTransaction(connection, tx => processHealthFollowupBatchInTransaction(tx, context, batchId, expectedContract), { timeoutMs: 120_000 });
  } catch (cause) {
    const technicalCode = getPostgresError(cause)?.code ?? (cause instanceof Error ? cause.name : "ERROR");
    // Preserve the failed-attempt evidence only after the clinical transaction
    // rolled back, using its owner's connection rather than a global client.
    await withDatabaseTransaction(connection, async tx => {
      await tx.insert(integrationRuns).values({ connectionId: initial.binding.connectionId, operation: `RECEBER_${initial.contractName}`, environment: "PRODUCAO", status: "ERRO", message: "Processamento do acompanhamento não concluído. Nenhum protocolo de recebimento foi emitido nesta tentativa.", payload: { batchId, receiverId: initial.binding.receiverId, technicalCode } });
    }, { timeoutMs: 5_000 });
    throw cause;
  }
}

export async function processHealthFollowupBatchInTransaction(tx: DatabaseTransaction, context: HealthFollowupContext, batchId: string, expectedContract?: FollowupContractName): Promise<ReceiptDto> {
  const initial = await followupBatchForActor(tx, context, batchId);
  if (expectedContract && initial.contractName !== expectedContract) throw new Error("A remessa não utiliza o contrato desse receptor.");
  if (initial.receipt) return receiptDto(initial.receipt);
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`HEALTH_FOLLOWUP_RECEIVER:${initial.binding.receiverId}`}))`);
  const batch = await followupBatchForActor(tx, context, batchId);
  if (batch.receipt) return receiptDto(batch.receipt);
  const contract = assertFollowupConnection(batch.binding);
  const envelope = followupEnvelopeSchema.parse(batch.payload);
  if (followupHash(batch.payload) !== batch.hashSha256 || envelope.batchId !== batch.id || envelope.contract !== contract || envelope.schemaVersion !== batch.schemaVersion || envelope.sender.connectionId !== batch.binding.connectionId || envelope.sender.code !== batch.binding.connection.code || envelope.sender.unitId !== batch.binding.unitId || envelope.receiver.id !== batch.binding.receiverId || envelope.receiver.code !== batch.binding.receiver.code || envelope.records.length !== batch.items.length || batch.items.some((item, index) => item.ordinal !== index + 1 || canonicalFollowupJson(item.payload) !== canonicalFollowupJson(envelope.records[index]))) throw new Error("Conteúdo, integridade ou destino da remessa não corresponde à evidência gerada.");
  const receiver = followupRow((await tx.select().from(healthFollowupReceivers).where(eq(healthFollowupReceivers.id, batch.binding.receiverId)).limit(1))[0]);
  const results: { batchItemId: string; status: string; message: string; recordId: string | null }[] = [];
  let accepted = 0, rejected = 0, unchanged = 0;
  for (const item of batch.items) {
    const result = await receiveRecord(tx, { receiverId: receiver.id, batchId: batch.id, unitId: batch.binding.unitId, contract, value: item.payload });
    results.push({ batchItemId: item.id, ...result });
    if (["VALIDADO", "JA_RECEBIDO"].includes(result.status)) accepted += 1; else rejected += 1;
    if (result.status === "JA_RECEBIDO") unchanged += 1;
  }
  const status = rejected === 0 ? "PROCESSADA" : accepted === 0 ? "REJEITADA" : "PARCIAL";
  const processedAt = new Date();
  const protocol = `CF-${receiver.code}-${processedAt.getUTCFullYear()}-${String(receiver.nextSequence).padStart(8, "0")}`;
  const run = followupRow((await tx.insert(integrationRuns).values({ connectionId: batch.binding.connectionId, operation: `RECEBER_${contract}`, environment: "PRODUCAO", status, message: `${receiver.name}: ${accepted} registros validados, ${rejected} rejeitados, ${unchanged} já recebidos.`, externalId: protocol, payload: { batchId: batch.id, receiverId: receiver.id, contract, schemaVersion: envelope.schemaVersion, protocol, accepted, rejected, unchanged }, createdAt: processedAt }).returning())[0]);
  const receipt = followupRow((await tx.insert(healthFollowupReceipts).values({ receiverId: receiver.id, batchId: batch.id, integrationRunId: run.id, protocol, receiverSnapshot: { id: receiver.id, code: receiver.code, name: receiver.name, contract, schemaVersion: envelope.schemaVersion, unitId: receiver.unitId, transport: "IN_PROCESS" }, status, total: batch.items.length, accepted, rejected, unchanged, processedByUsuarioId: context.user.id, createdAt: processedAt }).returning())[0]);
  if (results.length) await tx.insert(healthFollowupResults).values(results.map(result => ({ ...result, receiptId: receipt.id })));
  await tx.update(healthFollowupReceivers).set({ nextSequence: sql`${healthFollowupReceivers.nextSequence}+1` }).where(eq(healthFollowupReceivers.id, receiver.id));
  await tx.update(healthFollowupBatches).set({ status }).where(eq(healthFollowupBatches.id, batch.id));
  await insertAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "HEALTH_FOLLOWUP_RECEIPT", targetId: receipt.id });
  return receiptDto(receipt);
}
