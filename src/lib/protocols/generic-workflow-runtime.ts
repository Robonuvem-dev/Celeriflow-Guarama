import "server-only";

import { asc, eq, sql } from "drizzle-orm";
import type { DatabaseTransaction } from "@/db/transaction";
import { processes, processMovements, processEvents, genericWorkflowInstances, genericWorkflowStages, genericWorkflowEvents } from "@/db/schema/processes";
import { notifyProtocolDepartment } from "./notifications";
import { auditEventTypes } from "@/lib/contracts/audit";
import { insertAuditEvent } from "@/db/repositories/platform/audit";
import { assertGenericWorkflowTransition, assertRequiredSignedProcessDocument, calculateGenericWorkflowDeadline } from "./generic-workflow-policy";

const AWAITING_RECEIPT = "Aguardando Recebimento";

type WorkflowActor = { usuarioId: string; employeeId: string; departmentId: string };

async function loadActiveInstance(tx: DatabaseTransaction, processId: string, actor: WorkflowActor) {
  const [row] = await tx.select({ instance: genericWorkflowInstances, process: { id: processes.id, protocolNumber: processes.protocolNumber, status: processes.status, currentDepartmentId: processes.currentDepartmentId } }).from(genericWorkflowInstances).innerJoin(processes, eq(processes.id, genericWorkflowInstances.processId)).where(eq(genericWorkflowInstances.processId, processId)).limit(1);
  const instance = row ? { ...row.instance, process: row.process, definition: { stages: await tx.select().from(genericWorkflowStages).where(eq(genericWorkflowStages.definitionId, row.instance.definitionId)).orderBy(asc(genericWorkflowStages.position)) } } : null;
  if (!instance) throw new Error("Este processo nao usa o fluxo generico.");
  if (instance.status !== "ACTIVE") throw new Error("O fluxo generico deste processo ja foi encerrado.");
  if (instance.process.currentDepartmentId !== actor.departmentId) throw new Error("Este processo nao pertence ao seu setor.");
  if (instance.process.status === AWAITING_RECEIPT) throw new Error("Receba o processo antes de decidir a etapa.");
  const stage = instance.definition.stages.find((item) => item.position === instance.currentPosition);
  if (!stage) throw new Error("A etapa atual nao existe na versao publicada do fluxo.");
  return { instance, stage };
}

async function assertStageDocument(tx: DatabaseTransaction, processId: string, stage: { requiresSignedDocument: boolean; requiredDocumentClassId: string | null }) {
  if (!stage.requiresSignedDocument) return;
  const documents = await tx.execute<{ documentClassId: string | null; hasSignedFinalVersion: boolean }>(sql`SELECT d."documentClassId", EXISTS(SELECT 1 FROM "DocumentVersion" v JOIN "DocumentSignature" s ON s."documentVersionId"=v.id WHERE v."documentId"=d.id AND v.status='SIGNED' AND s.status='SIGNED') AS "hasSignedFinalVersion" FROM "ProcessDocument" pd JOIN "Document" d ON d.id=pd."documentId" WHERE pd."processId"=${processId}`);
  assertRequiredSignedProcessDocument(stage, documents.rows);
}

export async function isGenericWorkflowProcess(tx: DatabaseTransaction, processId: string) {
  return Boolean((await tx.select({ id: genericWorkflowInstances.id }).from(genericWorkflowInstances).where(eq(genericWorkflowInstances.processId, processId)).limit(1))[0]);
}

export async function recordGenericWorkflowReceipt(tx: DatabaseTransaction, processId: string, actorUsuarioId: string) {
  const [instance] = await tx.select({ id: genericWorkflowInstances.id, currentPosition: genericWorkflowInstances.currentPosition, status: genericWorkflowInstances.status }).from(genericWorkflowInstances).where(eq(genericWorkflowInstances.processId, processId)).limit(1);
  if (instance?.status === "ACTIVE") {
    await tx.insert(genericWorkflowEvents).values({ instanceId: instance.id, eventType: "RECEIVED", fromPosition: instance.currentPosition, toPosition: instance.currentPosition, actorUsuarioId });
  }
}

export async function approveGenericWorkflowProcess(tx: DatabaseTransaction, processId: string, actor: WorkflowActor, note: string | null) {
  const { instance, stage } = await loadActiveInstance(tx, processId, actor);
  const transition = assertGenericWorkflowTransition({ action: "APPROVE", currentPosition: instance.currentPosition, totalStages: instance.definition.stages.length, openedByUsuarioId: instance.openedByUsuarioId, actorUsuarioId: actor.usuarioId });
  await assertStageDocument(tx, processId, stage);
  const nextStage = instance.definition.stages.find((item) => item.position === transition.toPosition);
  if (!nextStage) throw new Error("A proxima etapa publicada nao foi encontrada.");
  const dueAt = calculateGenericWorkflowDeadline(new Date(), nextStage.slaCalendarDays, instance.instanceTimeZone);
  await tx.update(genericWorkflowInstances).set({ currentPosition: nextStage.position, dueAt }).where(eq(genericWorkflowInstances.id, instance.id));
  const [movement] = await tx.insert(processMovements).values({ processId, fromDepartmentId: actor.departmentId, toDepartmentId: nextStage.departmentId, employeeId: actor.employeeId, reason: note, status: "AWAITING_RECEIPT", dueAt }).returning({ id: processMovements.id });
  await tx.update(processes).set({ status: AWAITING_RECEIPT, currentDepartmentId: nextStage.departmentId, currentResponsibleEmployeeId: null, expectedCompletionAt: dueAt }).where(eq(processes.id, processId));
  await tx.insert(processEvents).values({ processId, eventType: "GENERIC_WORKFLOW_APPROVED", description: note || "Etapa aprovada e encaminhada para a proxima etapa.", previousStatus: instance.process.status, newStatus: AWAITING_RECEIPT, departmentId: actor.departmentId, employeeId: actor.employeeId });
  await insertAuditEvent(tx, { actorUsuarioId: actor.usuarioId, eventType: auditEventTypes.processUpdated, targetType: "PROCESS", targetId: processId });
  await tx.insert(genericWorkflowEvents).values({ instanceId: instance.id, eventType: "APPROVED", fromPosition: transition.fromPosition, toPosition: nextStage.position, actorUsuarioId: actor.usuarioId, note });
  await notifyProtocolDepartment(tx, actor.usuarioId, nextStage.departmentId, { processId, type: "GENERIC_WORKFLOW_STAGE", title: `Nova etapa: ${instance.process.protocolNumber}`, message: `O processo aguarda recebimento na etapa ${nextStage.label}.`, priority: "NORMAL", dedupeDiscriminator: movement.id });
}

export async function returnGenericWorkflowProcess(tx: DatabaseTransaction, processId: string, actor: WorkflowActor, note: string) {
  const { instance } = await loadActiveInstance(tx, processId, actor);
  const transition = assertGenericWorkflowTransition({ action: "RETURN", currentPosition: instance.currentPosition, totalStages: instance.definition.stages.length, openedByUsuarioId: instance.openedByUsuarioId, actorUsuarioId: actor.usuarioId });
  const previousStage = instance.definition.stages.find((item) => item.position === transition.toPosition);
  if (!previousStage) throw new Error("A etapa anterior publicada nao foi encontrada.");
  const dueAt = calculateGenericWorkflowDeadline(new Date(), previousStage.slaCalendarDays, instance.instanceTimeZone);
  await tx.update(genericWorkflowInstances).set({ currentPosition: previousStage.position, dueAt }).where(eq(genericWorkflowInstances.id, instance.id));
  const [movement] = await tx.insert(processMovements).values({ processId, fromDepartmentId: actor.departmentId, toDepartmentId: previousStage.departmentId, employeeId: actor.employeeId, reason: note, status: "AWAITING_RECEIPT", dueAt }).returning({ id: processMovements.id });
  await tx.update(processes).set({ status: AWAITING_RECEIPT, currentDepartmentId: previousStage.departmentId, currentResponsibleEmployeeId: null, expectedCompletionAt: dueAt }).where(eq(processes.id, processId));
  await tx.insert(processEvents).values({ processId, eventType: "GENERIC_WORKFLOW_RETURNED", description: note, previousStatus: instance.process.status, newStatus: AWAITING_RECEIPT, departmentId: actor.departmentId, employeeId: actor.employeeId });
  await insertAuditEvent(tx, { actorUsuarioId: actor.usuarioId, eventType: auditEventTypes.processUpdated, targetType: "PROCESS", targetId: processId });
  await tx.insert(genericWorkflowEvents).values({ instanceId: instance.id, eventType: "RETURNED", fromPosition: transition.fromPosition, toPosition: previousStage.position, actorUsuarioId: actor.usuarioId, note });
  await notifyProtocolDepartment(tx, actor.usuarioId, previousStage.departmentId, { processId, type: "GENERIC_WORKFLOW_RETURNED", title: `Processo devolvido: ${instance.process.protocolNumber}`, message: `O processo retornou para a etapa ${previousStage.label}.`, priority: "ALTA", dedupeDiscriminator: movement.id });
}

export async function rejectGenericWorkflowProcess(tx: DatabaseTransaction, processId: string, actor: WorkflowActor, note: string) {
  const { instance } = await loadActiveInstance(tx, processId, actor);
  const transition = assertGenericWorkflowTransition({ action: "REJECT", currentPosition: instance.currentPosition, totalStages: instance.definition.stages.length, openedByUsuarioId: instance.openedByUsuarioId, actorUsuarioId: actor.usuarioId });
  await tx.update(genericWorkflowInstances).set({ status: "REJECTED" }).where(eq(genericWorkflowInstances.id, instance.id));
  await tx.update(processes).set({ status: "Rejeitado", expectedCompletionAt: null }).where(eq(processes.id, processId));
  await tx.insert(processEvents).values({ processId, eventType: "GENERIC_WORKFLOW_REJECTED", description: note, previousStatus: instance.process.status, newStatus: "Rejeitado", departmentId: actor.departmentId, employeeId: actor.employeeId });
  await insertAuditEvent(tx, { actorUsuarioId: actor.usuarioId, eventType: auditEventTypes.processUpdated, targetType: "PROCESS", targetId: processId });
  await tx.insert(genericWorkflowEvents).values({ instanceId: instance.id, eventType: "REJECTED", fromPosition: transition.fromPosition, actorUsuarioId: actor.usuarioId, note });
}

export async function concludeGenericWorkflowProcess(tx: DatabaseTransaction, processId: string, actor: WorkflowActor, note: string) {
  const { instance, stage } = await loadActiveInstance(tx, processId, actor);
  const transition = assertGenericWorkflowTransition({ action: "CONCLUDE", currentPosition: instance.currentPosition, totalStages: instance.definition.stages.length, openedByUsuarioId: instance.openedByUsuarioId, actorUsuarioId: actor.usuarioId });
  await assertStageDocument(tx, processId, stage);
  const completedAt = new Date();
  await tx.update(genericWorkflowInstances).set({ status: "CONCLUDED", dueAt: null }).where(eq(genericWorkflowInstances.id, instance.id));
  await tx.update(processes).set({ status: "Concluido", completedAt, expectedCompletionAt: null }).where(eq(processes.id, processId));
  await tx.insert(processEvents).values({ processId, eventType: "GENERIC_WORKFLOW_CONCLUDED", description: note, previousStatus: instance.process.status, newStatus: "Concluido", departmentId: actor.departmentId, employeeId: actor.employeeId });
  await insertAuditEvent(tx, { actorUsuarioId: actor.usuarioId, eventType: auditEventTypes.processUpdated, targetType: "PROCESS", targetId: processId });
  await tx.insert(genericWorkflowEvents).values({ instanceId: instance.id, eventType: "CONCLUDED", fromPosition: transition.fromPosition, actorUsuarioId: actor.usuarioId, note });
}
