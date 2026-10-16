import { Prisma, type HealthFollowupReceipt } from "@prisma/client";
import { z } from "zod";
import type { AppContext } from "@/lib/platform/tenant-context";
import { auditEventTypes, writeAuditEvent } from "@/lib/platform/audit-evidence";
import { assertFollowupConnection, followupBatchForActor } from "./followup-exchange-service";
import { canonicalFollowupJson, followupEnvelopeSchema, followupHash, followupRecordKey, followupRecordSchemas, followupRecordVersion, type FollowupContractName, type FollowupRecord } from "./followup-contract";

type ReceiptDto = Pick<HealthFollowupReceipt, "id" | "batchId" | "receiverId" | "protocol" | "status" | "total" | "accepted" | "rejected" | "unchanged"> & { createdAt: string };
const receiptDto = (receipt: HealthFollowupReceipt): ReceiptDto => ({ id: receipt.id, batchId: receipt.batchId, receiverId: receipt.receiverId, protocol: receipt.protocol, status: receipt.status, total: receipt.total, accepted: receipt.accepted, rejected: receipt.rejected, unchanged: receipt.unchanged, createdAt: receipt.createdAt.toISOString() });
const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value));

function validationMessage(error: z.ZodError) {
  return error.issues.map(issue => `${issue.path.join(".") || "registro"}: ${issue.code === "custom" ? issue.message : issue.code === "invalid_type" || issue.code === "too_small" ? "Campo obrigatório ausente, vazio ou de tipo incompatível." : issue.code === "too_big" ? "Valor excede o limite dessa versão do contrato." : "Formato ou valor incompatível com o contrato."}`).join("; ");
}

async function validateSourceOwnership(tx: Prisma.TransactionClient, record: FollowupRecord): Promise<string | null> {
  const patient = await tx.patient.findUnique({ where: { id: record.patientId }, select: { personId: true } });
  if (!patient || patient.personId !== record.patient.personId) return "Paciente/identidade de origem alterado ou não localizado. Atualize a origem e gere nova remessa.";
  if (record.professionalId && !await tx.healthProfessional.count({ where: { id: record.professionalId, employeeId: record.professional?.employeeId } })) return "Profissional de origem não corresponde ao cadastro compartilhado.";
  if (record.originType === "HEALTH_PREGNANCY") {
    if (!await tx.healthPregnancy.count({ where: { id: record.originId, patientId: record.patientId, unitId: record.unitId } })) return "Gestação não pertence ao paciente e unidade informados na origem.";
    const ids = [...new Set([record.data.openedMedicalRecordId, ...record.data.visits.map(visit => visit.medicalRecordId), ...record.data.postpartumVisits.map(visit => visit.medicalRecordId), ...record.data.exams.map(exam => exam.medicalRecordId)])];
    if (await tx.medicalRecord.count({ where: { id: { in: ids }, patientId: record.patientId } }) !== ids.length) return "Há atendimento gestacional/exame sem vínculo ao paciente da origem.";
  } else if (record.originType === "CHRONIC_PATIENT") {
    if (record.originId !== record.patientId) return "A origem do acompanhamento crônico deve identificar o paciente acompanhado.";
    const ids = [...new Set([record.data.originMedicalRecordId, ...record.data.conditions.map(condition => condition.medicalRecordId).filter((id): id is string => Boolean(id)), ...record.data.assessments.map(assessment => assessment.medicalRecordId)])];
    if (await tx.medicalRecord.count({ where: { id: { in: ids }, patientId: record.patientId } }) !== ids.length) return "Há condição/avaliação clínica vinculada a outro paciente ou sem atendimento de origem.";
    const assessmentIds = [...new Set(record.data.assessments.map(assessment => assessment.medicalRecordId))];
    if (assessmentIds.length && await tx.medicalRecord.count({ where: { id: { in: assessmentIds }, unitId: record.unitId } }) !== assessmentIds.length) return "Avaliação clínica fora da unidade de origem do acompanhamento.";
  } else {
    const sourceExists = record.originType === "REGULATION_REQUEST"
      ? await tx.healthRegulationRequest.count({ where: { id: record.originId, patientId: record.patientId, requestUnitId: record.unitId } })
      : await tx.healthWaitlist.count({ where: { id: record.originId, patientId: record.patientId, unitId: record.unitId } });
    if (!sourceExists) return "Pedido/espera não pertence ao paciente e à unidade de origem.";
    if (record.data.waitlist && !await tx.healthWaitlist.count({ where: { id: record.data.waitlist.id, patientId: record.patientId } })) return "A espera informada não pertence ao paciente da regulação.";
    if (record.data.appointment && !await tx.healthAppointment.count({ where: { id: record.data.appointment.id, patientId: record.patientId, unitId: record.data.appointment.unitId } })) return "Agendamento informado não pertence ao paciente/unidade declarados.";
  }
  return null;
}

async function receiveRecord(tx: Prisma.TransactionClient, input: { receiverId: string; batchId: string; unitId: string; contract: FollowupContractName; value: unknown }): Promise<{ status: string; message: string; recordId: string | null }> {
  const parsed = followupRecordSchemas[input.contract].safeParse(input.value);
  if (!parsed.success) return { status: "REJEITADO", message: validationMessage(parsed.error), recordId: null };
  const record: FollowupRecord = parsed.data;
  if (record.unitId !== input.unitId) return { status: "REJEITADO", message: "Unidade de origem diferente da conexão e do receptor.", recordId: null };
  if (followupRecordVersion(record) !== record.sourceVersion || followupRecordKey(input.contract, record.originType, record.originId, record.sourceVersion) !== record.idempotencyKey) return { status: "REJEITADO", message: "Versão ou chave de repetição não corresponde ao conteúdo da origem.", recordId: null };
  const knownKey = await tx.healthFollowupProcessedKey.findUnique({ where: { receiverId_key: { receiverId: input.receiverId, key: record.idempotencyKey } }, include: { record: { select: { id: true, sourceVersion: true, snapshotAt: true } } } });
  if (knownKey) {
    const refreshSnapshot = knownKey.record.sourceVersion === record.sourceVersion && knownKey.record.snapshotAt <= new Date(record.snapshotAt);
    await tx.healthFollowupRecord.update({ where: { id: knownKey.recordId }, data: { lastReceivedAt: new Date(), ...(refreshSnapshot ? { snapshotAt: new Date(record.snapshotAt), payload: json(record), lastBatchId: input.batchId } : {}) } });
    return { status: "JA_RECEBIDO", message: "Chave de origem já processada; conteúdo atual preservado, sem repetir o registro.", recordId: knownKey.recordId };
  }
  const ownership = await validateSourceOwnership(tx, record);
  if (ownership) return { status: "REJEITADO", message: ownership, recordId: null };
  const current = await tx.healthFollowupRecord.findUnique({ where: { receiverId_originType_originId: { receiverId: input.receiverId, originType: record.originType, originId: record.originId } }, select: { id: true, sourceUpdatedAt: true, snapshotAt: true, sourceVersion: true } });
  const sourceUpdatedAt = new Date(record.sourceUpdatedAt), snapshotAt = new Date(record.snapshotAt);
  if (current && current.sourceVersion !== record.sourceVersion && (current.sourceUpdatedAt > sourceUpdatedAt || current.sourceUpdatedAt.valueOf() === sourceUpdatedAt.valueOf() && current.snapshotAt >= snapshotAt)) return { status: "VERSAO_ANTERIOR", message: "Há versão da origem já recebida com data igual ou posterior. Gere remessa atualizada para reprocessar.", recordId: current.id };
  const data = { patientId: record.patientId, professionalId: record.professionalId, unitId: record.unitId, sourceVersion: record.sourceVersion, sourceUpdatedAt, snapshotAt, payload: json(record), lastBatchId: input.batchId, lastReceivedAt: new Date() };
  const received = await tx.healthFollowupRecord.upsert({ where: { receiverId_originType_originId: { receiverId: input.receiverId, originType: record.originType, originId: record.originId } }, create: { receiverId: input.receiverId, originType: record.originType, originId: record.originId, ...data }, update: data, select: { id: true } });
  await tx.healthFollowupProcessedKey.create({ data: { receiverId: input.receiverId, key: record.idempotencyKey, recordId: received.id, sourceVersion: record.sourceVersion } });
  return { status: current?.sourceVersion === record.sourceVersion ? "JA_RECEBIDO" : "VALIDADO", message: current ? "Origem validada e acompanhamento atualizado no receptor." : "Origem validada e acompanhamento registrado no receptor.", recordId: received.id };
}

export async function processHealthFollowupBatch(context: AppContext, batchId: string, expectedContract?: FollowupContractName): Promise<ReceiptDto> {
  const initial = await followupBatchForActor(context.prisma, context, batchId);
  if (expectedContract && initial.contractName !== expectedContract) throw new Error("A remessa não utiliza o contrato desse receptor.");
  if (initial.receipt) return receiptDto(initial.receipt);
  try {
    return await context.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`HEALTH_FOLLOWUP_RECEIVER:${initial.binding.receiverId}`}))`;
      const batch = await followupBatchForActor(tx, context, batchId);
      if (batch.receipt) return receiptDto(batch.receipt);
      const contract = assertFollowupConnection(batch.binding);
      const envelope = followupEnvelopeSchema.parse(batch.payload);
      if (followupHash(batch.payload) !== batch.hashSha256 || envelope.batchId !== batch.id || envelope.contract !== contract || envelope.schemaVersion !== batch.schemaVersion || envelope.sender.connectionId !== batch.binding.connectionId || envelope.sender.code !== batch.binding.connection.code || envelope.sender.unitId !== batch.binding.unitId || envelope.receiver.id !== batch.binding.receiverId || envelope.receiver.code !== batch.binding.receiver.code || envelope.records.length !== batch.items.length || batch.items.some((item, index) => item.ordinal !== index + 1 || canonicalFollowupJson(item.payload) !== canonicalFollowupJson(envelope.records[index]))) throw new Error("Conteúdo, integridade ou destino da remessa não corresponde à evidência gerada.");
      const receiver = await tx.healthFollowupReceiver.findUniqueOrThrow({ where: { id: batch.binding.receiverId } });
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
      const run = await tx.integrationRun.create({ data: { connectionId: batch.binding.connectionId, operation: `RECEBER_${contract}`, environment: "PRODUCAO", status, message: `${receiver.name}: ${accepted} registros validados, ${rejected} rejeitados, ${unchanged} já recebidos.`, externalId: protocol, payload: { batchId: batch.id, receiverId: receiver.id, contract, schemaVersion: envelope.schemaVersion, protocol, accepted, rejected, unchanged }, createdAt: processedAt } });
      const receipt = await tx.healthFollowupReceipt.create({ data: { receiverId: receiver.id, batchId: batch.id, integrationRunId: run.id, protocol, receiverSnapshot: { id: receiver.id, code: receiver.code, name: receiver.name, contract, schemaVersion: envelope.schemaVersion, unitId: receiver.unitId, transport: "IN_PROCESS" }, status, total: batch.items.length, accepted, rejected, unchanged, processedByUsuarioId: context.user.id, results: { create: results }, createdAt: processedAt } });
      await tx.healthFollowupReceiver.update({ where: { id: receiver.id }, data: { nextSequence: { increment: 1 } } });
      await tx.healthFollowupBatch.update({ where: { id: batch.id }, data: { status } });
      await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "HEALTH_FOLLOWUP_RECEIPT", targetId: receipt.id });
      return receiptDto(receipt);
    }, { timeout: 120000 });
  } catch (cause) {
    const technicalCode = cause instanceof Prisma.PrismaClientKnownRequestError ? cause.code : cause instanceof Error ? cause.name : "ERROR";
    await context.prisma.integrationRun.create({ data: { connectionId: initial.binding.connectionId, operation: `RECEBER_${initial.contractName}`, environment: "PRODUCAO", status: "ERRO", message: "Processamento do acompanhamento não concluído. Nenhum protocolo de recebimento foi emitido nesta tentativa.", payload: { batchId, receiverId: initial.binding.receiverId, technicalCode } } });
    throw cause;
  }
}
