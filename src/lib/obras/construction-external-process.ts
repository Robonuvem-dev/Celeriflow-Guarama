import { and, asc, eq, getTableColumns, isNull, sql } from "drizzle-orm";
import type { DatabaseTransaction } from "@/db/transaction";
import { departments } from "@/db/schema/administration";
import { processSubjects, processTypes, processWorkflowStages, processSequences, processes, processMovements, processEvents } from "@/db/schema/processes";
import type { ProcessOpeningInput } from "@/lib/protocols/service";

// Shares the central sequence and published stage routing. External actors never become employees.
export async function createConstructionExternalProcess(tx: DatabaseTransaction, identityId: string, input: ProcessOpeningInput) {
  if (!identityId || !input.processTypeId || !input.subjectId) throw new Error("Informe identidade, tipo e assunto da abertura externa.");
  if (input.personId && input.companyId) throw new Error("Selecione um único interessado.");
  const [subject] = await tx.select({ ...getTableColumns(processSubjects), processType: getTableColumns(processTypes) }).from(processSubjects).innerJoin(processTypes, eq(processTypes.id, processSubjects.processTypeId)).where(and(eq(processSubjects.id, input.subjectId), eq(processSubjects.processTypeId, input.processTypeId), eq(processSubjects.isActive, true), eq(processTypes.isActive, true))).limit(1);
  if (!subject) throw new Error("Assunto/tipo indisponível.");
  if ((subject.requiresInterested || subject.processType.requiresInterested) && !input.personId && !input.companyId) throw new Error("Este processo exige interessado.");
  // The generic engine currently requires Usuario FKs for every opening/event. Do not impersonate an administrator.
  if (subject.processType.genericWorkflowEnabled) throw new Error("Este fluxo genérico ainda exige ator interno. Escolha um assunto autorizado com etapas de protocolo para abertura externa.");
  const subjectStages = await tx.select().from(processWorkflowStages).where(and(eq(processWorkflowStages.processTypeId, input.processTypeId), eq(processWorkflowStages.subjectId, input.subjectId), eq(processWorkflowStages.isActive, true))).orderBy(asc(processWorkflowStages.position));
  const stages = subjectStages.length ? subjectStages : await tx.select().from(processWorkflowStages).where(and(eq(processWorkflowStages.processTypeId, input.processTypeId), isNull(processWorkflowStages.subjectId), eq(processWorkflowStages.isActive, true))).orderBy(asc(processWorkflowStages.position));
  const initial = stages[0];
  const departmentId = initial?.departmentId || subject.initialDepartmentId || subject.processType.initialDepartmentId;
  if (!departmentId || !(await tx.select({ id: departments.id }).from(departments).where(and(eq(departments.id, departmentId), eq(departments.isActive, true))).limit(1)).length) throw new Error("Configure um setor inicial ativo para o assunto.");
  const year = new Date().getFullYear();
  const [sequence] = await tx.insert(processSequences).values({ year, nextNumber: 2 }).onConflictDoUpdate({ target: processSequences.year, set: { nextNumber: sql`${processSequences.nextNumber} + 1` } }).returning({ nextNumber: processSequences.nextNumber });
  const protocolNumber = `PROC-${year}-${String(sequence.nextNumber - 1).padStart(6, "0")}`;
  const slaDays = initial?.slaDays ?? subject.slaDays ?? subject.processType.defaultSlaDays;
  const expectedCompletionAt = slaDays ? new Date(Date.now() + slaDays * 86400000) : null;
  const [process] = await tx.insert(processes).values({
    protocolNumber, processTypeId: input.processTypeId, subjectId: input.subjectId, personId: input.personId, companyId: input.companyId,
    description: input.description, priority: subject.defaultPriority || subject.processType.defaultPriority || "Normal",
    status: "Aguardando Recebimento", currentDepartmentId: departmentId, currentWorkflowStageId: initial?.id || null, expectedCompletionAt,
  }).returning({ id: processes.id, protocolNumber: processes.protocolNumber, currentDepartmentId: processes.currentDepartmentId });
  await tx.insert(processMovements).values({ processId: process.id, toDepartmentId: departmentId, reason: "Abertura externa — Construção Civil", status: "AWAITING_RECEIPT", dueAt: expectedCompletionAt });
  await tx.insert(processEvents).values({ processId: process.id, eventType: "OPENED", description: "Processo protocolado no portal profissional externo.", newStatus: "Aguardando Recebimento", departmentId, metadata: JSON.stringify({ actorType: "CONSTRUCTION_PORTAL_IDENTITY", identityId }) });
  return process;
}
