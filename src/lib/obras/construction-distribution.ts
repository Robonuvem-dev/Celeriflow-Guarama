import { and, asc, count, desc, eq, gte, inArray, isNull, lte, notInArray, or, sql } from "drizzle-orm";
import type { DatabaseTransaction } from "@/db/transaction";
import { constructionCases, constructionDistributionVersions } from "@/db/schema/construction-core";
import { constructionStaffRoles } from "@/db/schema/construction-portal";
import { employees } from "@/db/schema/administration";
import { processes, processEvents } from "@/db/schema/processes";

export async function assignConstructionCase(tx: DatabaseTransaction, input: { caseId: string; processId: string; departmentId: string; today: Date }) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`CONSTRUCTION_DISTRIBUTION:${input.departmentId}`}))`);
  const [rule] = await tx.select().from(constructionDistributionVersions).where(eq(constructionDistributionVersions.departmentId, input.departmentId)).orderBy(desc(constructionDistributionVersions.version)).limit(1);
  if (!rule || rule.strategy === "SECTOR") return null;
  const links = await tx.select({ employeeId: constructionStaffRoles.employeeId }).from(constructionStaffRoles).innerJoin(employees, eq(employees.id, constructionStaffRoles.employeeId)).where(and(eq(constructionStaffRoles.departmentId, input.departmentId), eq(constructionStaffRoles.isActive, true), eq(constructionStaffRoles.role, rule.strategy === "MANAGER" ? "MANAGER" : "ANALYST"), lte(constructionStaffRoles.startsAt, input.today), or(isNull(constructionStaffRoles.endsAt), gte(constructionStaffRoles.endsAt, input.today)), eq(employees.isActive, true), eq(employees.departmentId, input.departmentId), rule.strategy === "USER" ? eq(constructionStaffRoles.employeeId, rule.employeeId || "") : undefined)).orderBy(asc(constructionStaffRoles.employeeId));
  const employeeIds = [...new Set(links.map((link) => link.employeeId))];
  if (!employeeIds.length) throw new Error("A distribuição configurada não possui profissional elegível no setor.");
  const workload = await tx.select({ assignedEmployeeId: constructionCases.assignedEmployeeId, total: count() }).from(constructionCases).innerJoin(processes, eq(processes.id, constructionCases.processId)).where(and(inArray(constructionCases.assignedEmployeeId, employeeIds), eq(processes.currentDepartmentId, input.departmentId), isNull(processes.completedAt), notInArray(processes.status, ["Arquivado", "Cancelado", "Rejeitado"]))).groupBy(constructionCases.assignedEmployeeId);
  const counts = new Map(workload.map((row) => [row.assignedEmployeeId, row.total]));
  const selected = rule.strategy === "LOWEST_LOAD" ? employeeIds.sort((a,b) => (counts.get(a) || 0) - (counts.get(b) || 0) || a.localeCompare(b))[0] : employeeIds[0];
  await tx.update(constructionCases).set({ assignedEmployeeId: selected }).where(eq(constructionCases.id, input.caseId));
  await tx.update(processes).set({ currentResponsibleEmployeeId: selected }).where(eq(processes.id, input.processId));
  await tx.insert(processEvents).values({ processId: input.processId, eventType: "CONSTRUCTION_DISTRIBUTED", description: `Distribuição ${rule.strategy}, versão ${rule.version}.`, departmentId: input.departmentId, employeeId: selected });
  return selected;
}
