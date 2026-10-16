import type { Prisma } from "@prisma/client";

export async function assignConstructionCase(tx: Prisma.TransactionClient, input: { caseId: string; processId: string; departmentId: string; today: Date }) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`CONSTRUCTION_DISTRIBUTION:${input.departmentId}`}))`;
  const rule = await tx.constructionDistributionVersion.findFirst({ where: { departmentId: input.departmentId }, orderBy: { version: "desc" } });
  if (!rule || rule.strategy === "SECTOR") return null;
  const links = await tx.constructionStaffRole.findMany({ where: { departmentId: input.departmentId, isActive: true, role: rule.strategy === "MANAGER" ? "MANAGER" : "ANALYST", startsAt: { lte: input.today }, OR: [{ endsAt: null }, { endsAt: { gte: input.today } }], employee: { isActive: true, departmentId: input.departmentId }, ...(rule.strategy === "USER" ? { employeeId: rule.employeeId || "" } : {}) }, select: { employeeId: true }, orderBy: { employeeId: "asc" } });
  const employeeIds = [...new Set(links.map((link) => link.employeeId))];
  if (!employeeIds.length) throw new Error("A distribuição configurada não possui profissional elegível no setor.");
  const workload = await tx.constructionCase.groupBy({ by: ["assignedEmployeeId"], where: { assignedEmployeeId: { in: employeeIds }, process: { currentDepartmentId: input.departmentId, completedAt: null, status: { notIn: ["Arquivado", "Cancelado", "Rejeitado"] } } }, _count: { _all: true } });
  const counts = new Map(workload.map((row) => [row.assignedEmployeeId, row._count._all]));
  const selected = rule.strategy === "LOWEST_LOAD" ? employeeIds.sort((a,b) => (counts.get(a) || 0) - (counts.get(b) || 0) || a.localeCompare(b))[0] : employeeIds[0];
  await tx.constructionCase.update({ where: { id: input.caseId }, data: { assignedEmployeeId: selected } });
  await tx.process.update({ where: { id: input.processId }, data: { currentResponsibleEmployeeId: selected }, select: { id: true } });
  await tx.processEvent.create({ data: { processId: input.processId, eventType: "CONSTRUCTION_DISTRIBUTED", description: `Distribuição ${rule.strategy}, versão ${rule.version}.`, departmentId: input.departmentId, employeeId: selected }, select: { id: true } });
  return selected;
}
