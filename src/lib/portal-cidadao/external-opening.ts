import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import type { DatabaseTransaction } from "@/db/transaction";
import { processTypes, processSubjects, processSequences, processes, processMovements, processEvents, processWorkflowStages, genericWorkflowDefinitions, genericWorkflowStages, genericWorkflowInstances, genericWorkflowEvents } from "@/db/schema/processes";
import { departments } from "@/db/schema/administration";
import { calculateGenericWorkflowDeadline } from "@/lib/protocols/generic-workflow-policy";
import { getGenericWorkflowInstanceTimeZone } from "@/lib/protocols/generic-workflow-definition-service";
import { notifyProtocolDepartment } from "@/lib/protocols/notifications";
import { auditEventTypes } from "@/lib/contracts/audit";
import { insertAuditEvent } from "@/db/repositories/platform/audit";

// External authors are real Usuario accounts, never fabricated Employee identities.
export async function openExternalServiceProcess(tx: DatabaseTransaction, input: { actorId: string | null; processTypeId: string; subjectId: string; personId?: string | null; companyId?: string | null; description: string; purpose?: string; dueAt?: Date }): Promise<{ id: string; protocolNumber: string; currentDepartmentId: string | null; expectedCompletionAt: Date | null }> {
  const [source] = await tx.select({ subject: processSubjects, processType: processTypes }).from(processSubjects).innerJoin(processTypes, eq(processTypes.id, processSubjects.processTypeId)).where(and(eq(processSubjects.id, input.subjectId), eq(processSubjects.processTypeId, input.processTypeId), eq(processSubjects.isActive, true), eq(processTypes.isActive, true))).limit(1);
  const subject = source ? { ...source.subject, processType: source.processType } : null;
  if (!subject) throw new Error("Configure tipo e assunto ativos para este serviço.");
  if ((subject.requiresInterested || subject.processType.requiresInterested) && !input.personId && !input.companyId) throw new Error("O serviço exige vínculo validado com o interessado.");
  if (input.personId && input.companyId) throw new Error("Informe um único interessado.");
  const [storedDefinition] = subject.processType.genericWorkflowEnabled ? await tx.select().from(genericWorkflowDefinitions).where(and(eq(genericWorkflowDefinitions.processTypeId, input.processTypeId), eq(genericWorkflowDefinitions.status, "PUBLISHED"))).orderBy(desc(genericWorkflowDefinitions.version)).limit(1) : [];
  const definition = storedDefinition ? { ...storedDefinition, stages: await tx.select().from(genericWorkflowStages).where(eq(genericWorkflowStages.definitionId, storedDefinition.id)).orderBy(asc(genericWorkflowStages.position)) } : null;
  if (subject.processType.genericWorkflowEnabled && (!definition?.stages.length || !input.actorId)) throw new Error("Fluxo genérico exige versão publicada e autor identificado.");
  const ownStages = definition ? [] : await tx.select().from(processWorkflowStages).where(and(eq(processWorkflowStages.processTypeId, input.processTypeId), eq(processWorkflowStages.subjectId, input.subjectId), eq(processWorkflowStages.isActive, true))).orderBy(asc(processWorkflowStages.position));
  const stages = definition || ownStages.length ? ownStages : await tx.select().from(processWorkflowStages).where(and(eq(processWorkflowStages.processTypeId, input.processTypeId), isNull(processWorkflowStages.subjectId), eq(processWorkflowStages.isActive, true))).orderBy(asc(processWorkflowStages.position));
  const first = definition?.stages[0];
  const departmentId = first?.departmentId || stages[0]?.departmentId || subject.initialDepartmentId || subject.processType.initialDepartmentId;
  if (!departmentId || !(await tx.select({ id: departments.id }).from(departments).where(and(eq(departments.id, departmentId), eq(departments.isActive, true))).limit(1))[0]) throw new Error("Configure setor inicial ativo para o serviço.");
  const zone = definition ? await getGenericWorkflowInstanceTimeZone(tx) : null;
  const sla = stages[0]?.slaDays ?? subject.slaDays ?? subject.processType.defaultSlaDays;
  const dueAt = input.dueAt || (first && zone ? calculateGenericWorkflowDeadline(new Date(), first.slaCalendarDays, zone) : sla ? new Date(Date.now() + sla * 86400000) : null);
  const year = new Date().getFullYear();
  const [sequence] = await tx.insert(processSequences).values({ year, nextNumber: 2 }).onConflictDoUpdate({ target: processSequences.year, set: { nextNumber: sql`${processSequences.nextNumber} + 1`, updatedAt: new Date() } }).returning({ nextNumber: processSequences.nextNumber });
  const [process] = await tx.insert(processes).values({
    protocolNumber: `PROC-${year}-${String(sequence.nextNumber - 1).padStart(6, "0")}`, processTypeId: input.processTypeId, subjectId: input.subjectId,
    personId: input.personId, companyId: input.companyId, description: input.description, priority: subject.defaultPriority || subject.processType.defaultPriority || "Normal",
    portalOrigin: "AUTOATENDIMENTO", portalPurpose: input.purpose || "SERVICO_EXTERNO", status: "Aguardando Recebimento", currentDepartmentId: departmentId, currentWorkflowStageId: stages[0]?.id, expectedCompletionAt: dueAt,
  }).returning({ id: processes.id, protocolNumber: processes.protocolNumber, currentDepartmentId: processes.currentDepartmentId, expectedCompletionAt: processes.expectedCompletionAt });
  await tx.insert(processMovements).values({ processId: process.id, toDepartmentId: departmentId, reason: "Solicitação externa", status: "AWAITING_RECEIPT", dueAt });
  await tx.insert(processEvents).values({ processId: process.id, eventType: "EXTERNAL_SERVICE_OPENED", description: "Solicitação protocolada no Autoatendimento.", newStatus: "Aguardando Recebimento", departmentId, metadata: JSON.stringify({ actorType: input.actorId ? "CITIZEN_ACCOUNT" : "ANONYMOUS", actorId: input.actorId }) });
  if (definition && first && zone && input.actorId) {
    const [instance] = await tx.insert(genericWorkflowInstances).values({ processId: process.id, definitionId: definition.id, definitionVersion: definition.version, currentPosition: first.position, dueAt, instanceTimeZone: zone, openedByUsuarioId: input.actorId }).returning({ id: genericWorkflowInstances.id });
    await tx.insert(genericWorkflowEvents).values({ instanceId: instance.id, eventType: "OPENED", toPosition: first.position, actorUsuarioId: input.actorId });
  }
  if (input.actorId) {
    await notifyProtocolDepartment(tx, input.actorId, departmentId, { processId: process.id, type: "RECEIVE", title: `Solicitação ${process.protocolNumber}`, message: "Novo serviço solicitado no Autoatendimento.", dedupeDiscriminator: "EXTERNAL_OPENED", priority: "NORMAL" });
    await insertAuditEvent(tx, { actorUsuarioId: input.actorId, eventType: auditEventTypes.processOpened, targetType: "EXTERNAL_SERVICE_PROCESS", targetId: process.id });
  }
  return process;
}
