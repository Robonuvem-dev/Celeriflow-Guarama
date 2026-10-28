import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import type { DatabaseTransaction } from "@/db/transaction";
import { processTypes, processSubjects, processes, processSequences, processMovements, processEvents, processWorkflowStages, genericWorkflowDefinitions, genericWorkflowStages, genericWorkflowInstances, genericWorkflowEvents } from "@/db/schema/processes";
import { departments } from "@/db/schema/administration";
import { getGenericWorkflowInstanceTimeZone } from "@/lib/protocols/generic-workflow-definition-service";
import { calculateGenericWorkflowDeadline } from "@/lib/protocols/generic-workflow-policy";
import { notifyProtocolDepartment } from "@/lib/protocols/notifications";
import { auditEventTypes } from "@/lib/contracts/audit";
import { insertAuditEvent } from "@/db/repositories/platform/audit";

const AWAITING_RECEIPT = "Aguardando Recebimento";

export type ProcessOpeningInput = {
  processTypeId: string;
  subjectId: string;
  personId?: string | null;
  companyId?: string | null;
  initialDepartmentId?: string | null;
  priority?: string | null;
  description?: string | null;
};

type OperationalEmployee = { id: string };

// This is the only process-opening path used by Protocols and its integrations.
export async function createValidatedProcess(tx: DatabaseTransaction, employee: OperationalEmployee, actorUsuarioId: string, input: ProcessOpeningInput): Promise<{ id: string; protocolNumber: string; expectedCompletionAt: Date | null }> {
  const { processTypeId, subjectId, personId = null, companyId = null, initialDepartmentId: selectedDepartmentId = null, priority: requestedPriority = null, description = null } = input;
  if (!processTypeId || !subjectId) throw new Error("Selecione o Tipo e o Assunto do processo.");
  if (personId && companyId) throw new Error("Selecione apenas um interessado: pessoa ou empresa.");

  const [subjectRow] = await tx.select({ subject: processSubjects, processType: processTypes }).from(processSubjects).innerJoin(processTypes, eq(processTypes.id, processSubjects.processTypeId)).where(and(eq(processSubjects.id, subjectId), eq(processSubjects.processTypeId, processTypeId), eq(processSubjects.isActive, true))).limit(1);
  const subject = subjectRow ? { ...subjectRow.subject, processType: subjectRow.processType } : null;
  if (!subject || !subject.processType.isActive) throw new Error("O Assunto selecionado nao pertence a um Tipo de Processo ativo.");
  if (!subject.allowsInternalOpening || !subject.processType.allowsInternalOpening) throw new Error("Este processo nao permite abertura interna.");
  if ((subject.requiresInterested || subject.processType.requiresInterested) && !personId && !companyId) {
    throw new Error("Este processo exige a selecao de um interessado.");
  }

  const genericDefinition = subject.processType.genericWorkflowEnabled
    ? await tx.select().from(genericWorkflowDefinitions).where(and(eq(genericWorkflowDefinitions.processTypeId, processTypeId), eq(genericWorkflowDefinitions.status, "PUBLISHED"))).orderBy(desc(genericWorkflowDefinitions.version)).limit(1).then(rows => rows[0] ?? null)
    : null;
  if (subject.processType.genericWorkflowEnabled && !genericDefinition) {
    throw new Error("Este tipo usa o fluxo generico e precisa de uma versao publicada antes da abertura.");
  }
  if (genericDefinition && selectedDepartmentId) {
    throw new Error("O setor inicial do fluxo generico e definido pela versao publicada.");
  }
  const subjectStages = genericDefinition ? [] : await tx.select().from(processWorkflowStages).where(and(eq(processWorkflowStages.processTypeId, processTypeId), eq(processWorkflowStages.subjectId, subjectId), eq(processWorkflowStages.isActive, true))).orderBy(asc(processWorkflowStages.position));
  const workflowStages = genericDefinition || subjectStages.length
    ? subjectStages
    : await tx.select().from(processWorkflowStages).where(and(eq(processWorkflowStages.processTypeId, processTypeId), isNull(processWorkflowStages.subjectId), eq(processWorkflowStages.isActive, true))).orderBy(asc(processWorkflowStages.position));
  const initialStage = workflowStages[0] || null;
  const initialGenericStage = genericDefinition ? await tx.select().from(genericWorkflowStages).where(eq(genericWorkflowStages.definitionId, genericDefinition.id)).orderBy(asc(genericWorkflowStages.position)).limit(1).then(rows => rows[0] ?? null) : null;
  const initialDepartmentId = initialGenericStage?.departmentId || initialStage?.departmentId || subject.initialDepartmentId || subject.processType.initialDepartmentId || selectedDepartmentId;
  if (!initialDepartmentId) throw new Error("Selecione o setor inicial responsavel pelo processo.");

  const [department] = await tx.select({ id: departments.id }).from(departments).where(and(eq(departments.id, initialDepartmentId), eq(departments.isActive, true))).limit(1);
  if (!department) throw new Error("O setor inicial selecionado nao esta ativo.");

  const year = new Date().getFullYear();
  const [sequence] = await tx.insert(processSequences).values({ year, nextNumber: 2 }).onConflictDoUpdate({ target: processSequences.year, set: { nextNumber: sql`${processSequences.nextNumber} + 1`, updatedAt: new Date() } }).returning({ nextNumber: processSequences.nextNumber });
  const protocolNumber = `PROC-${year}-${String(sequence.nextNumber - 1).padStart(6, "0")}`;
  const instanceTimeZone = genericDefinition ? await getGenericWorkflowInstanceTimeZone(tx) : null;
  const slaDays = initialStage?.slaDays ?? subject.slaDays ?? subject.processType.defaultSlaDays;
  const expectedCompletionAt = initialGenericStage && instanceTimeZone
    ? calculateGenericWorkflowDeadline(new Date(), initialGenericStage.slaCalendarDays, instanceTimeZone)
    : slaDays ? new Date(Date.now() + slaDays * 86_400_000) : null;
  const priority = requestedPriority || subject.defaultPriority || subject.processType.defaultPriority || "Normal";
  const [process] = await tx.insert(processes).values({
      protocolNumber, personId, companyId, processTypeId, subjectId, priority, description,
      status: AWAITING_RECEIPT, currentDepartmentId: department.id, currentWorkflowStageId: initialStage?.id || null, expectedCompletionAt,
  }).returning({ id: processes.id, protocolNumber: processes.protocolNumber, expectedCompletionAt: processes.expectedCompletionAt });
  await tx.insert(processMovements).values({ processId: process.id, toDepartmentId: department.id, employeeId: employee.id, reason: "Distribuicao inicial", status: "AWAITING_RECEIPT", dueAt: expectedCompletionAt });
  await tx.insert(processEvents).values({ processId: process.id, eventType: "OPENED", description: "Processo protocolado e encaminhado ao setor inicial.", newStatus: AWAITING_RECEIPT, departmentId: department.id, employeeId: employee.id });
  if (genericDefinition && initialGenericStage && instanceTimeZone) {
    const [instance] = await tx.insert(genericWorkflowInstances).values({ processId: process.id, definitionId: genericDefinition.id, definitionVersion: genericDefinition.version, currentPosition: initialGenericStage.position, dueAt: expectedCompletionAt, instanceTimeZone, openedByUsuarioId: actorUsuarioId }).returning({ id: genericWorkflowInstances.id });
    await tx.insert(genericWorkflowEvents).values({ instanceId: instance.id, eventType: "OPENED", toPosition: initialGenericStage.position, actorUsuarioId });
  }
  await notifyProtocolDepartment(tx, actorUsuarioId, department.id, {
    processId: process.id, type: "RECEIVE", title: `Novo processo ${process.protocolNumber}`, message: "Um processo aguarda recebimento no seu setor.", priority: "NORMAL", dedupeDiscriminator: "OPENED",
  });
  await insertAuditEvent(tx, {
    actorUsuarioId,
    eventType: auditEventTypes.processOpened,
    targetType: "PROCESS",
    targetId: process.id,
  });
  if (process.expectedCompletionAt) {
    await notifyProtocolDepartment(tx, actorUsuarioId, department.id, {
      processId: process.id, type: "DEADLINE", title: `Prazo definido: ${process.protocolNumber}`,
      message: `Prazo da etapa: ${process.expectedCompletionAt.toLocaleDateString("pt-BR")}.`, priority: "ALTA", dedupeDiscriminator: `DEADLINE:${process.expectedCompletionAt.toISOString()}`,
    });
  }
  return process;
}
