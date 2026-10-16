import type { Prisma } from "@prisma/client";
import { calculateGenericWorkflowDeadline } from "@/lib/protocols/generic-workflow-policy";
import { getGenericWorkflowInstanceTimeZone } from "@/lib/protocols/generic-workflow-definition-service";
import { notifyProtocolDepartment } from "@/lib/protocols/notifications";
import { auditEventTypes, writeAuditEvent } from "@/lib/platform/audit-evidence";

// External authors are real Usuario accounts, never fabricated Employee identities.
export async function openExternalServiceProcess(tx: Prisma.TransactionClient, input: { actorId: string | null; processTypeId: string; subjectId: string; personId?: string | null; companyId?: string | null; description: string; purpose?: string; dueAt?: Date }) {
  const subject = await tx.subject.findFirst({ where: { id: input.subjectId, processTypeId: input.processTypeId, isActive: true, processType: { isActive: true } }, include: { processType: true } });
  if (!subject) throw new Error("Configure tipo e assunto ativos para este serviço.");
  if ((subject.requiresInterested || subject.processType.requiresInterested) && !input.personId && !input.companyId) throw new Error("O serviço exige vínculo validado com o interessado.");
  if (input.personId && input.companyId) throw new Error("Informe um único interessado.");
  const definition = subject.processType.genericWorkflowEnabled ? await tx.genericProcessWorkflowDefinition.findFirst({ where: { processTypeId: input.processTypeId, status: "PUBLISHED" }, orderBy: { version: "desc" }, include: { stages: { orderBy: { position: "asc" } } } }) : null;
  if (subject.processType.genericWorkflowEnabled && (!definition?.stages.length || !input.actorId)) throw new Error("Fluxo genérico exige versão publicada e autor identificado.");
  const ownStages = definition ? [] : await tx.processWorkflowStage.findMany({ where: { processTypeId: input.processTypeId, subjectId: input.subjectId, isActive: true }, orderBy: { position: "asc" } });
  const stages = definition || ownStages.length ? ownStages : await tx.processWorkflowStage.findMany({ where: { processTypeId: input.processTypeId, subjectId: null, isActive: true }, orderBy: { position: "asc" } });
  const first = definition?.stages[0];
  const departmentId = first?.departmentId || stages[0]?.departmentId || subject.initialDepartmentId || subject.processType.initialDepartmentId;
  if (!departmentId || !await tx.department.findFirst({ where: { id: departmentId, isActive: true }, select: { id: true } })) throw new Error("Configure setor inicial ativo para o serviço.");
  const zone = definition ? await getGenericWorkflowInstanceTimeZone(tx) : null;
  const sla = stages[0]?.slaDays ?? subject.slaDays ?? subject.processType.defaultSlaDays;
  const dueAt = input.dueAt || (first && zone ? calculateGenericWorkflowDeadline(new Date(), first.slaCalendarDays, zone) : sla ? new Date(Date.now() + sla * 86400000) : null);
  const year = new Date().getFullYear();
  const sequence = await tx.processSequence.upsert({ where: { year }, create: { year, nextNumber: 2 }, update: { nextNumber: { increment: 1 } }, select: { nextNumber: true } });
  const process = await tx.process.create({ data: {
    protocolNumber: `PROC-${year}-${String(sequence.nextNumber - 1).padStart(6, "0")}`, processTypeId: input.processTypeId, subjectId: input.subjectId,
    personId: input.personId, companyId: input.companyId, description: input.description, priority: subject.defaultPriority || subject.processType.defaultPriority || "Normal",
    portalOrigin: "AUTOATENDIMENTO", portalPurpose: input.purpose || "SERVICO_EXTERNO", status: "Aguardando Recebimento", currentDepartmentId: departmentId, currentWorkflowStageId: stages[0]?.id, expectedCompletionAt: dueAt,
    movements: { create: { toDepartmentId: departmentId, reason: "Solicitação externa", status: "AWAITING_RECEIPT", dueAt } },
    events: { create: { eventType: "EXTERNAL_SERVICE_OPENED", description: "Solicitação protocolada no Autoatendimento.", newStatus: "Aguardando Recebimento", departmentId, metadata: JSON.stringify({ actorType: input.actorId ? "CITIZEN_ACCOUNT" : "ANONYMOUS", actorId: input.actorId }) } },
    ...(definition && first && zone && input.actorId ? { genericWorkflowInstance: { create: { definitionId: definition.id, definitionVersion: definition.version, currentPosition: first.position, dueAt, instanceTimeZone: zone, openedByUsuarioId: input.actorId, events: { create: { eventType: "OPENED", toPosition: first.position, actorUsuarioId: input.actorId } } } } } : {}),
  }, select: { id: true, protocolNumber: true, currentDepartmentId: true, expectedCompletionAt: true } });
  if (input.actorId) {
    await notifyProtocolDepartment(tx, input.actorId, departmentId, { processId: process.id, type: "RECEIVE", title: `Solicitação ${process.protocolNumber}`, message: "Novo serviço solicitado no Autoatendimento.", dedupeDiscriminator: "EXTERNAL_OPENED", priority: "NORMAL" });
    await writeAuditEvent(tx, { actorUsuarioId: input.actorId, eventType: auditEventTypes.processOpened, targetType: "EXTERNAL_SERVICE_PROCESS", targetId: process.id });
  }
  return process;
}
