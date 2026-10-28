import { and, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import type { DatabaseTransaction } from "@/db/transaction";
import { constructionAnalystReplacements, constructionCases } from "@/db/schema/construction-core";
import { constructionStaffRoles } from "@/db/schema/construction-portal";
import { departments, employees } from "@/db/schema/administration";
import { processes, processEvents } from "@/db/schema/processes";
import { findConstructionCaseForAccess } from "@/db/repositories/infrastructure/construction-access";
import { z } from "zod";
import type { ConstructionAccess } from "./construction-policy";

export const constructionReplacementSchema = z.object({ caseId: z.string().min(1), requestKey: z.uuid(), expectedAnalystId: z.string().nullable(), expectedAssignedId: z.string().nullable(), employeeId: z.string().min(1), reason: z.string().trim().min(10, "Informe um motivo com pelo menos dez caracteres.").max(4000) });

export async function replaceConstructionAnalyst(tx: DatabaseTransaction, access: ConstructionAccess, actorId: string, input: unknown) {
  const data = constructionReplacementSchema.parse(input);
  if (!access.administrator && !access.roles.includes("MANAGER")) throw new Error("Substituição restrita ao gestor urbanístico.");
  await tx.execute(sql`SELECT "id" FROM "ConstructionCase" WHERE "id"=${data.caseId} FOR UPDATE`);
  const record = await findConstructionCaseForAccess(tx, data.caseId, access);
  if (!record) throw new Error("Solicitação indisponível no seu setor.");
  const [existing] = await tx.select({ id: constructionAnalystReplacements.id, caseId: constructionAnalystReplacements.caseId, createdBy: constructionAnalystReplacements.createdBy }).from(constructionAnalystReplacements).where(eq(constructionAnalystReplacements.requestKey, data.requestKey)).limit(1);
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
  const [eligible] = await tx.select({ id: constructionStaffRoles.id }).from(constructionStaffRoles).innerJoin(employees, eq(employees.id, constructionStaffRoles.employeeId)).innerJoin(departments, eq(departments.id, employees.departmentId)).where(and(eq(constructionStaffRoles.employeeId, data.employeeId), eq(constructionStaffRoles.departmentId, departmentId), inArray(constructionStaffRoles.role, ["ANALYST", "MANAGER"]), eq(constructionStaffRoles.isActive, true), lte(constructionStaffRoles.startsAt, today), or(isNull(constructionStaffRoles.endsAt), gte(constructionStaffRoles.endsAt, today)), eq(employees.isActive, true), eq(employees.departmentId, departmentId), eq(departments.isActive, true))).limit(1);
  if (!eligible) throw new Error("Selecione analista ou gestor ativo com vínculo vigente no setor do processo.");
  const [replacement] = await tx.insert(constructionAnalystReplacements).values({ caseId: record.id, requestKey: data.requestKey, previousAnalystId: record.firstAnalystId, previousAssignedId: record.assignedEmployeeId, replacementEmployeeId: data.employeeId, departmentId, reason: data.reason, createdBy: actorId }).returning({ id: constructionAnalystReplacements.id });
  await tx.update(constructionCases).set({ firstAnalystId: data.employeeId, assignedEmployeeId: data.employeeId }).where(eq(constructionCases.id, record.id));
  await tx.update(processes).set({ currentResponsibleEmployeeId: data.employeeId }).where(eq(processes.id, record.processId));
  await tx.insert(processEvents).values({ processId: record.processId, eventType: "CONSTRUCTION_ANALYST_REPLACED", description: data.reason, departmentId, employeeId: access.employeeId, metadata: JSON.stringify({ replacementId: replacement.id, previousAnalystId: record.firstAnalystId, previousAssignedId: record.assignedEmployeeId, replacementEmployeeId: data.employeeId }) });
  return replacement.id;
}
