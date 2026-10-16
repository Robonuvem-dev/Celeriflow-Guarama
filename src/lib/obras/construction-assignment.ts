import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { constructionCaseWhere, type ConstructionAccess } from "./construction-policy";

export const constructionReplacementSchema = z.object({ caseId: z.string().min(1), requestKey: z.uuid(), expectedAnalystId: z.string().nullable(), expectedAssignedId: z.string().nullable(), employeeId: z.string().min(1), reason: z.string().trim().min(10, "Informe um motivo com pelo menos dez caracteres.").max(4000) });

export async function replaceConstructionAnalyst(tx: Prisma.TransactionClient, access: ConstructionAccess, actorId: string, input: unknown) {
  const data = constructionReplacementSchema.parse(input);
  if (!access.administrator && !access.roles.includes("MANAGER")) throw new Error("Substituição restrita ao gestor urbanístico.");
  await tx.$queryRaw`SELECT "id" FROM "ConstructionCase" WHERE "id"=${data.caseId} FOR UPDATE`;
  const record = await tx.constructionCase.findFirst({ where: { AND: [{ id: data.caseId }, constructionCaseWhere(access)] }, select: { id: true, processId: true, firstAnalystId: true, assignedEmployeeId: true, reviewStatus: true, process: { select: { status: true, currentDepartmentId: true, completedAt: true } } } });
  if (!record) throw new Error("Solicitação indisponível no seu setor.");
  const existing = await tx.constructionAnalystReplacement.findUnique({ where: { requestKey: data.requestKey }, select: { id: true, caseId: true, createdBy: true } });
  if (existing) {
    if (existing.caseId !== record.id || existing.createdBy !== actorId) throw new Error("Referência de substituição indisponível.");
    return existing.id;
  }
  if (record.firstAnalystId !== data.expectedAnalystId || record.assignedEmployeeId !== data.expectedAssignedId) throw new Error("O responsável mudou. Atualize a página antes de substituir.");
  if (["APPROVED", "DENIED"].includes(record.reviewStatus) || record.process.completedAt || ["Aguardando Recebimento", "Arquivado", "Cancelado", "Rejeitado", "Concluido", "Concluído"].includes(record.process.status)) throw new Error("Substituição exige solicitação em análise e protocolo recebido/ativo.");
  if (record.firstAnalystId === data.employeeId && record.assignedEmployeeId === data.employeeId) throw new Error("O servidor selecionado já é o responsável.");
  const departmentId = record.process.currentDepartmentId;
  if (!departmentId) throw new Error("O processo não possui setor responsável.");
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
  const eligible = await tx.constructionStaffRole.findFirst({ where: { employeeId: data.employeeId, departmentId, role: { in: ["ANALYST", "MANAGER"] }, isActive: true, startsAt: { lte: today }, OR: [{ endsAt: null }, { endsAt: { gte: today } }], employee: { isActive: true, departmentId, department: { isActive: true } } }, select: { id: true } });
  if (!eligible) throw new Error("Selecione analista ou gestor ativo com vínculo vigente no setor do processo.");
  const replacement = await tx.constructionAnalystReplacement.create({ data: { caseId: record.id, requestKey: data.requestKey, previousAnalystId: record.firstAnalystId, previousAssignedId: record.assignedEmployeeId, replacementEmployeeId: data.employeeId, departmentId, reason: data.reason, createdBy: actorId }, select: { id: true } });
  await tx.constructionCase.update({ where: { id: record.id }, data: { firstAnalystId: data.employeeId, assignedEmployeeId: data.employeeId }, select: { id: true } });
  await tx.process.update({ where: { id: record.processId }, data: { currentResponsibleEmployeeId: data.employeeId }, select: { id: true } });
  await tx.processEvent.create({ data: { processId: record.processId, eventType: "CONSTRUCTION_ANALYST_REPLACED", description: data.reason, departmentId, employeeId: access.employeeId, metadata: JSON.stringify({ replacementId: replacement.id, previousAnalystId: record.firstAnalystId, previousAssignedId: record.assignedEmployeeId, replacementEmployeeId: data.employeeId }) }, select: { id: true } });
  return replacement.id;
}
