import { createHash, randomUUID } from "node:crypto";
import { asc, desc, eq, sql } from "drizzle-orm";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction } from "@/db/transaction";
import { administrativeUnits, departments, employees, roles } from "@/db/schema/administration";
import { costCenters, governmentEntities } from "@/db/schema/master-data";
import { hrEmploymentRegimes, hrPayrollRuleSets } from "@/db/schema/personnel-configuration";
import { findModuleActivation } from "@/db/repositories/platform/identity";
import { findSstUnit, sstParameters } from "@/db/repositories/sst/scope";
import { sstRows } from "@/db/repositories/sst/sql";
import { sstPeriod, readSstFunctionalPeriods, readSstHistoricalProgramGroups, readSstHistoricalResponsibilities } from "@/db/repositories/sst/functional";
import { insertAuditEvent as writeAuditEvent } from "@/db/repositories/platform/audit";
import { sstContextConnection, sstDatabase } from "./database";
import { z } from "zod";
import { assertBudgetUnitAccess, canPerformModuleOperation, canViewModule, isSystemAdministrator, AccessError, type AppContext } from "@/lib/platform/tenant-context";
import { auditEventTypes } from "@/lib/platform/audit-evidence";
import { functionalPeriodInput, historicalIntersection, matchesHistoricalExposure } from "./functional-policy";
import { SstValidationError } from "./errors";

export function functionalAuthorizedScope(context: AppContext, budgetUnitId?: string) {
  if (!canViewModule(context.user, "SST")) throw new AccessError("Acesso SST necessário.", 403);
  if (budgetUnitId) assertBudgetUnitAccess(context.user, budgetUnitId);
  return budgetUnitId ? sql`p."budgetUnitId" = ${budgetUnitId}` : isSystemAdministrator(context.user) ? sql`TRUE` : sql`p."budgetUnitId" IN (${sstParameters(context.user.allowedBudgetUnitIds)})`;
}

export async function registerVerifiedEntityMapping(context: AppContext, raw: unknown, connection: DatabaseConnection = sstContextConnection(context)) {
  if (!isSystemAdministrator(context.user)) throw new AccessError("Mapeamento exige administrador técnico e fonte oficial.", 403);
  const input = z.object({ budgetUnitId: z.string().min(1), governmentEntityId: z.string().min(1), sourceReference: z.string().trim().min(10).max(1000) }).parse(raw);
  return withDatabaseTransaction(connection, async (tx) => {
    const [unit, entity] = await Promise.all([findSstUnit(tx, input.budgetUnitId), tx.select().from(governmentEntities).where(eq(governmentEntities.id, input.governmentEntityId)).then(rows => rows[0])]);
    if (!unit || entity?.status !== "ATIVA") throw new SstValidationError("UG ou entidade inválida.");
    const id = randomUUID();
    await tx.execute(sql`INSERT INTO "HrBudgetUnitEntityMapping" (id,"budgetUnitId","governmentEntityId","sourceReference","createdById") VALUES (${id},${unit.id},${entity.id},${input.sourceReference},${context.user.id})`);
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "HR_VERIFIED_UG_ENTITY", targetId: id });
    return id;
  });
}

export async function registerFunctionalPeriod(context: AppContext, raw: unknown, connection: DatabaseConnection = sstContextConnection(context)) {
  const input = functionalPeriodInput.parse(raw);
  assertBudgetUnitAccess(context.user, input.budgetUnitId);
  if (!canPerformModuleOperation(context.user, "RH", input.supersedesId ? "update" : "create")) throw new AccessError("Histórico contratual exige permissão RH.", 403);
  const hash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  return withDatabaseTransaction(connection, async (tx) => {
    const active = await findModuleActivation(tx, "RH");
    if (active?.ativo === false) throw new SstValidationError("RH desativado.");
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`HR_FUNCTIONAL:${input.employeeId}`}))`);
    const existing = await sstRows<{ id: string; requestHash: string; createdById: string }>(tx, sql`SELECT id,"requestHash","createdById" FROM "HrEmployeeFunctionalPeriod" WHERE id=${input.submissionKey}`);
    if (existing[0]) {
      if (existing[0].requestHash !== hash || existing[0].createdById !== context.user.id) throw new SstValidationError("Submissão já utilizada com outros dados.");
      return existing[0].id;
    }
    const [employee, regime, role, functionRole, department, local, center] = await Promise.all([
      tx.select({ id: employees.id, registration: employees.registration }).from(employees).where(eq(employees.id, input.employeeId)).then(rows => rows[0]),
      tx.select({ regime: hrEmploymentRegimes, ruleSet: hrPayrollRuleSets }).from(hrEmploymentRegimes).innerJoin(hrPayrollRuleSets, eq(hrEmploymentRegimes.ruleSetId, hrPayrollRuleSets.id)).where(eq(hrEmploymentRegimes.id, input.employmentRegimeId)).then(rows => rows[0] ? { ...rows[0].regime, ruleSet: rows[0].ruleSet } : null),
      tx.select().from(roles).where(eq(roles.id, input.roleId)).then(rows => rows[0]),
      input.functionRoleId ? tx.select().from(roles).where(eq(roles.id, input.functionRoleId)).then(rows => rows[0]) : null,
      tx.select().from(departments).where(eq(departments.id, input.departmentId)).then(rows => rows[0]), tx.select().from(administrativeUnits).where(eq(administrativeUnits.id, input.localId)).then(rows => rows[0]), tx.select().from(costCenters).where(eq(costCenters.id, input.costCenterId)).then(rows => rows[0]),
    ]);
    if (!employee || !regime?.isActive || !role?.isActive || !department?.isActive || !local?.isActive || !center?.isActive || (input.functionRoleId && !functionRole?.isActive)) throw new SstValidationError("Referências funcionais canônicas inválidas/inativas.");
    if (regime.ruleSet.effectiveFrom > input.startsAt || (regime.ruleSet.effectiveUntil && regime.ruleSet.effectiveUntil < input.endsAt)) throw new SstValidationError("Regime fora da vigência da parametrização RH.");
    const snapshot = { registration: employee.registration, regime: { id: regime.id, code: regime.code, name: regime.name, employmentNature: regime.employmentNature }, role: role.name, functionRole: functionRole?.name || null, department: department.name, local: local.name, costCenter: { code: center.code, name: center.name } };
    await tx.execute(sql`INSERT INTO "HrEmployeeFunctionalPeriod" (id,"employeeId","budgetUnitId","governmentEntityId","employmentRegimeId","roleId","functionRoleId","departmentId","localId","costCenterId","startsAt","endsAt","contractReference","sourceReference","supersedesId",voided,snapshot,"requestHash","createdById") VALUES (${input.submissionKey},${employee.id},${input.budgetUnitId},${input.governmentEntityId},${regime.id},${role.id},${functionRole?.id || null},${department.id},${local.id},${center.id},${input.startsAt},${input.endsAt},${input.contractReference},${input.sourceReference},${input.supersedesId || null},${input.voided},${JSON.stringify(snapshot)}::jsonb,${hash},${context.user.id})`);
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "HR_FUNCTIONAL_PERIOD", targetId: input.submissionKey });
    return input.submissionKey;
  });
}

export type FunctionalFilters = { budgetUnitId?: string; employeeId?: string; employmentRegimeId?: string; localId?: string; costCenterId?: string; startsAt?: Date; endsAt?: Date; page?: number };
export async function listFunctionalPeriods(context: AppContext, filters: FunctionalFilters = {}) {
  const scope = functionalAuthorizedScope(context, filters.budgetUnitId);
  const conditions = [scope, sql`NOT p.voided AND NOT EXISTS (SELECT 1 FROM "HrEmployeeFunctionalPeriod" n WHERE n."supersedesId"=p.id)`];
  if (filters.employeeId) conditions.push(sql`p."employeeId"=${filters.employeeId}`);
  if (filters.employmentRegimeId) conditions.push(sql`p."employmentRegimeId"=${filters.employmentRegimeId}`);
  if (filters.localId) conditions.push(sql`p."localId"=${filters.localId}`);
  if (filters.costCenterId) conditions.push(sql`p."costCenterId"=${filters.costCenterId}`);
  if (filters.startsAt) conditions.push(sql`p."endsAt">${filters.startsAt}`);
  if (filters.endsAt) conditions.push(sql`p."startsAt"<${filters.endsAt}`);
  const where = sql.join(conditions, sql` AND `);
  const [count] = await sstRows<{ total: number }>(sstDatabase(context), sql`SELECT count(*)::int AS total FROM "HrEmployeeFunctionalPeriod" p WHERE ${where}`);
  const total = count.total;
  const page = Math.min(Math.max(1, Math.trunc(filters.page || 1)), Math.max(1, Math.ceil(total / 20)));
  const records = await sstDatabase(context).select({ period: sstPeriod, employeeName: employees.name }).from(sstPeriod).innerJoin(employees, eq(employees.id, sstPeriod.employeeId)).where(where).orderBy(desc(sstPeriod.startsAt), asc(sstPeriod.id)).limit(20).offset((page - 1) * 20).then(rows => rows.map(row => ({ ...row.period, employeeName: row.employeeName })));
  return { records, total, page };
}

// Authorized F8 source: historical periods + immutable program/GHE snapshots, not today's lotação.
export async function getAuthorizedHistoricalExposure(context: AppContext, employeeId: string, budgetUnitId: string, startsAt: Date, endsAt: Date) {
  const scope = functionalAuthorizedScope(context, budgetUnitId);
  if (!(startsAt < endsAt)) throw new SstValidationError("Intervalo histórico inválido.");
  const periods = await readSstFunctionalPeriods(sstDatabase(context), sql`${scope} AND p."employeeId"=${employeeId} AND NOT p.voided AND NOT EXISTS (SELECT 1 FROM "HrEmployeeFunctionalPeriod" n WHERE n."supersedesId"=p.id) AND p."startsAt"<${endsAt} AND p."endsAt">${startsAt}`);
  const programs = await readSstHistoricalProgramGroups(sstDatabase(context), { budgetUnitId, from: startsAt, until: endsAt });
  const criteria = z.object({ departmentIds: z.array(z.string()).nullable(), roleIds: z.array(z.string()).nullable(), startsAt: z.coerce.date(), endsAt: z.coerce.date().nullable() });
  const exposure = periods.flatMap((period) => programs.flatMap((group) => {
    const rule = criteria.parse(group.groupSnapshot);
    if (!matchesHistoricalExposure(period, rule)) return [];
    let interval = historicalIntersection(period, { startsAt, endsAt });
    if (interval) interval = historicalIntersection(interval, group.program);
    if (interval) interval = historicalIntersection(interval, { startsAt: rule.startsAt, endsAt: rule.endsAt || endsAt });
    return interval ? [{ ...interval, functionalPeriodId: period.id, programGroupId: group.id, programId: group.programId, version: group.program.version, kind: group.program.kind, groupId: group.groupId, groupSnapshot: group.groupSnapshot, risks: group.risks }] : [];
  }));
  const responsibilities = await readSstHistoricalResponsibilities(sstDatabase(context), { budgetUnitId, from: startsAt, until: endsAt });
  let coveredUntil = startsAt.getTime();
  let historyGap = false;
  for (const period of periods) {
    if (period.startsAt.getTime() > coveredUntil) historyGap = true;
    coveredUntil = Math.max(coveredUntil, period.endsAt.getTime());
  }
  historyGap ||= coveredUntil < endsAt.getTime();
  const versionConflict = exposure.some((a, i) => exposure.slice(i + 1).some((b) => a.kind === b.kind && a.groupId === b.groupId && a.programId !== b.programId && !!historicalIntersection(a, b)));
  const blockers = [...(historyGap ? ["FUNCTIONAL_HISTORY_GAP"] : []), ...(versionConflict ? ["OVERLAPPING_PROGRAM_VERSIONS"] : [])];
  await writeAuditEvent(sstDatabase(context), { actorUsuarioId: context.user.id, eventType: auditEventTypes.pageView, targetType: "SST_AUTHORIZED_FUNCTIONAL_HISTORY", targetId: employeeId });
  return { periods, exposure, responsibilities, source: "HR_EMPLOYEE_FUNCTIONAL_HISTORY" as const, missingHistory: !periods.length, blockers };
}
