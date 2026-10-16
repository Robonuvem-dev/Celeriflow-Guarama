import type { Prisma } from "@prisma/client";
import type { ProcessOpeningInput } from "@/lib/protocols/service";

// Shares the central sequence and published stage routing. External actors never become employees.
export async function createConstructionExternalProcess(tx: Prisma.TransactionClient, identityId: string, input: ProcessOpeningInput) {
  if (!identityId || !input.processTypeId || !input.subjectId) throw new Error("Informe identidade, tipo e assunto da abertura externa.");
  if (input.personId && input.companyId) throw new Error("Selecione um único interessado.");
  const subject = await tx.subject.findFirst({ where: { id: input.subjectId, processTypeId: input.processTypeId, isActive: true, processType: { isActive: true } }, include: { processType: true } });
  if (!subject) throw new Error("Assunto/tipo indisponível.");
  if ((subject.requiresInterested || subject.processType.requiresInterested) && !input.personId && !input.companyId) throw new Error("Este processo exige interessado.");
  // The generic engine currently requires Usuario FKs for every opening/event. Do not impersonate an administrator.
  if (subject.processType.genericWorkflowEnabled) throw new Error("Este fluxo genérico ainda exige ator interno. Escolha um assunto autorizado com etapas de protocolo para abertura externa.");
  const subjectStages = await tx.processWorkflowStage.findMany({ where: { processTypeId: input.processTypeId, subjectId: input.subjectId, isActive: true }, orderBy: { position: "asc" } });
  const stages = subjectStages.length ? subjectStages : await tx.processWorkflowStage.findMany({ where: { processTypeId: input.processTypeId, subjectId: null, isActive: true }, orderBy: { position: "asc" } });
  const initial = stages[0];
  const departmentId = initial?.departmentId || subject.initialDepartmentId || subject.processType.initialDepartmentId;
  if (!departmentId || !await tx.department.findFirst({ where: { id: departmentId, isActive: true }, select: { id: true } })) throw new Error("Configure um setor inicial ativo para o assunto.");
  const year = new Date().getFullYear();
  const sequence = await tx.processSequence.upsert({ where: { year }, create: { year, nextNumber: 2 }, update: { nextNumber: { increment: 1 } }, select: { nextNumber: true } });
  const protocolNumber = `PROC-${year}-${String(sequence.nextNumber - 1).padStart(6, "0")}`;
  const slaDays = initial?.slaDays ?? subject.slaDays ?? subject.processType.defaultSlaDays;
  const expectedCompletionAt = slaDays ? new Date(Date.now() + slaDays * 86400000) : null;
  return tx.process.create({ data: {
    protocolNumber, processTypeId: input.processTypeId, subjectId: input.subjectId, personId: input.personId, companyId: input.companyId,
    description: input.description, priority: subject.defaultPriority || subject.processType.defaultPriority || "Normal",
    status: "Aguardando Recebimento", currentDepartmentId: departmentId, currentWorkflowStageId: initial?.id || null, expectedCompletionAt,
    movements: { create: { toDepartmentId: departmentId, reason: "Abertura externa — Construção Civil", status: "AWAITING_RECEIPT", dueAt: expectedCompletionAt } },
    events: { create: { eventType: "OPENED", description: "Processo protocolado no portal profissional externo.", newStatus: "Aguardando Recebimento", departmentId, metadata: JSON.stringify({ actorType: "CONSTRUCTION_PORTAL_IDENTITY", identityId }) } },
  }, select: { id: true, protocolNumber: true, currentDepartmentId: true } });
}
