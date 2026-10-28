import { and, asc, count, desc, eq, ilike, inArray, ne, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { DatabaseExecutor } from "../../transaction";
import { processes, processTypes, processSubjects, processMovements } from "../../schema/processes";
import { departments, employees } from "../../schema/administration";
import { companies } from "../../schema/registry";
import { people } from "../../schema/people";

export function processSearchCondition(query: string, identifiers = false) {
  if (!query) return undefined;
  const pattern = `%${query.replace(/[\\%_]/g, "\\$&")}%`;
  return or(ilike(processes.protocolNumber, pattern), ilike(processes.description, pattern),
    sql`EXISTS(SELECT 1 FROM ${processTypes} WHERE ${processTypes.id}=${processes.processTypeId} AND ${ilike(processTypes.name, pattern)})`,
    sql`EXISTS(SELECT 1 FROM ${processSubjects} WHERE ${processSubjects.id}=${processes.subjectId} AND ${ilike(processSubjects.name, pattern)})`,
    sql`EXISTS(SELECT 1 FROM ${people} WHERE ${people.id}=${processes.personId} AND ${or(ilike(people.fullName, pattern), identifiers ? ilike(people.cpf, pattern) : undefined)})`,
    sql`EXISTS(SELECT 1 FROM ${companies} WHERE ${companies.id}=${processes.companyId} AND ${or(ilike(companies.corporateName, pattern), identifiers ? ilike(companies.cnpj, pattern) : undefined)})`);
}

export function processListCondition(scope: SQL, filters: { status?: string; q: string }) {
  return and(scope, filters.status === "ATIVOS" ? ne(processes.status, "Arquivado") : filters.status ? eq(processes.status, filters.status) : undefined, processSearchCondition(filters.q));
}

export async function countProcesses(db: DatabaseExecutor, condition: SQL | undefined) {
  return (await db.select({ total: count() }).from(processes).where(condition))[0].total;
}

export async function listOperationalProcesses(db: DatabaseExecutor, condition: SQL | undefined, options: { limit: number; offset?: number; order?: "created" | "archived" | "updated" | "unspecified" }) {
  const ordering = options.order === "archived" ? processes.archivedAt : options.order === "updated" ? processes.updatedAt : processes.createdAt;
  const rows = await db.select({ process: processes, processType: { name: processTypes.name }, subject: { name: processSubjects.name }, person: { fullName: people.fullName }, company: { corporateName: companies.corporateName }, currentDepartment: { name: departments.name }, currentResponsibleEmployee: { name: employees.name } }).from(processes)
    .innerJoin(processTypes, eq(processTypes.id, processes.processTypeId)).innerJoin(processSubjects, eq(processSubjects.id, processes.subjectId))
    .leftJoin(people, eq(people.id, processes.personId)).leftJoin(companies, eq(companies.id, processes.companyId))
    .leftJoin(departments, eq(departments.id, processes.currentDepartmentId)).leftJoin(employees, eq(employees.id, processes.currentResponsibleEmployeeId))
    .where(condition).orderBy(...(options.order === "unspecified" ? [] : [desc(ordering), desc(processes.id)])).limit(options.limit).offset(options.offset || 0);
  return rows.map(row => ({ ...row.process, processType: row.processType, subject: row.subject, person: row.person, company: row.company, currentDepartment: row.currentDepartment, currentResponsibleEmployee: row.currentResponsibleEmployee }));
}

export async function listProcessTracking(db: DatabaseExecutor, condition: SQL | undefined, options: { limit: number; offset: number }) {
  const rows = await listOperationalProcesses(db, condition, { ...options, order: "updated" });
  const from = alias(departments, "tracking_from_department"), to = alias(departments, "tracking_to_department");
  const movements = rows.length ? await db.selectDistinctOn([processMovements.processId], { movement: processMovements, fromDepartment: { name: from.name }, toDepartment: { name: to.name } }).from(processMovements)
    .leftJoin(from, eq(from.id, processMovements.fromDepartmentId)).innerJoin(to, eq(to.id, processMovements.toDepartmentId))
    .where(inArray(processMovements.processId, rows.map(row => row.id))).orderBy(asc(processMovements.processId), desc(processMovements.movedAt)) : [];
  return rows.map(row => ({ ...row, movements: movements.filter(item => item.movement.processId === row.id).map(item => ({ ...item.movement, fromDepartment: item.fromDepartment, toDepartment: item.toDepartment })) }));
}
