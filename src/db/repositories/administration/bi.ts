import { and, asc, eq, sql } from "drizzle-orm";
import type { AdministrationBiSource } from "@/lib/contracts/administration-bi";
import type { DatabaseExecutor } from "../../transaction";
import { administrativeUnits, departments, employees, institutions, internalDemands, roles, secretariats } from "../../schema/administration";

export async function loadAdministrationBiSource(db: DatabaseExecutor, selection: string): Promise<AdministrationBiSource> {
  const [institutionRows, secretariatRows, departmentRows, roleResult, demandRows, employeeGroups] = await Promise.all([
    db.select({ name: institutions.name }).from(institutions).limit(1),
    db.select({
      id: secretariats.id, name: secretariats.name, acronym: secretariats.acronym, isActive: secretariats.isActive,
      manager: { id: employees.id, name: employees.name, isActive: employees.isActive, secretariatId: employees.secretariatId },
      role: { name: roles.name, isActive: roles.isActive },
      employeeCount: sql<number>`(SELECT count(*)::int FROM ${employees} e WHERE e."secretariatId"=${secretariats.id} AND e."isActive"=true)`,
      departmentCount: sql<number>`(SELECT count(*)::int FROM ${departments} d WHERE d."secretariatId"=${secretariats.id} AND d."isActive"=true)`,
      unitCount: sql<number>`(SELECT count(*)::int FROM ${administrativeUnits} u WHERE u."secretariatId"=${secretariats.id} AND u."isActive"=true)`,
    }).from(secretariats).leftJoin(employees, eq(secretariats.managerId, employees.id))
      .leftJoin(roles, eq(employees.roleId, roles.id)).orderBy(asc(secretariats.name)),
    db.select({
      id: departments.id, name: departments.name,
      employeeCount: sql<number>`count(${employees.id})::int`,
    }).from(departments).leftJoin(employees, and(eq(employees.departmentId, departments.id), eq(employees.isActive, true)))
      .where(sql`${departments.isActive}=true AND (${selection}='' OR ${departments.secretariatId}=${selection})`)
      .groupBy(departments.id, departments.name).orderBy(asc(departments.name)),
    db.execute<{ name: string; employees: number }>(sql`SELECT COALESCE(r.name, 'Sem cargo informado') AS name, count(*)::int AS employees FROM "Employee" e LEFT JOIN "Role" r ON r.id=e."roleId" WHERE e."isActive"=true AND (${selection}='' OR e."secretariatId"=${selection}) GROUP BY r.name ORDER BY count(*) DESC, r.name`),
    db.select({
      secretariatId: internalDemands.secretariatId, department: { secretariatId: departments.secretariatId },
      status: internalDemands.status, deadline: internalDemands.deadline, createdAt: internalDemands.createdAt,
    }).from(internalDemands).leftJoin(departments, eq(internalDemands.departmentId, departments.id)),
    db.select({ secretariatId: employees.secretariatId, isActive: employees.isActive, employeeCount: sql<number>`count(*)::int` })
      .from(employees).groupBy(employees.secretariatId, employees.isActive),
  ]);
  return {
    institution: institutionRows[0] ?? null,
    secretariats: secretariatRows.map(row => ({
      id: row.id, name: row.name, acronym: row.acronym, isActive: row.isActive,
      manager: row.manager ? { name: row.manager.name, isActive: row.manager.isActive, secretariatId: row.manager.secretariatId, role: row.role } : null,
      _count: { employees: row.employeeCount, departments: row.departmentCount, units: row.unitCount },
    })),
    departments: departmentRows.map(row => ({ id: row.id, name: row.name, _count: { employees: row.employeeCount } })),
    roles: roleResult.rows,
    demands: demandRows,
    unassignedEmployees: employeeGroups.map(row => ({ secretariatId: row.secretariatId, isActive: row.isActive, _count: { _all: row.employeeCount } })),
  };
}
