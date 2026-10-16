import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { assertBudgetUnitAccess, canPerformModuleOperation, canViewModule, isSystemAdministrator, AccessError, type AppContext } from "@/lib/platform/tenant-context";
import { auditEventTypes, writeAuditEvent } from "@/lib/platform/audit-evidence";
import { functionalPeriodInput, type FunctionalScope, type HistoricalTechnicalResponsibility, historicalIntersection, matchesHistoricalExposure } from "./functional-policy";
import { SstValidationError } from "./errors";

export function functionalAuthorizedScope(context: AppContext, budgetUnitId?: string) {
  if (!canViewModule(context.user, "SST")) throw new AccessError("Acesso SST necessário.", 403);
  if (budgetUnitId) assertBudgetUnitAccess(context.user, budgetUnitId);
  return budgetUnitId ? Prisma.sql`p."budgetUnitId" = ${budgetUnitId}` : isSystemAdministrator(context.user) ? Prisma.sql`TRUE` : context.user.allowedBudgetUnitIds.length ? Prisma.sql`p."budgetUnitId" IN (${Prisma.join(context.user.allowedBudgetUnitIds)})` : Prisma.sql`FALSE`;
}

export async function registerVerifiedEntityMapping(context: AppContext, raw: unknown) {
  if (!isSystemAdministrator(context.user)) throw new AccessError("Mapeamento exige administrador técnico e fonte oficial.", 403);
  const input = z.object({ budgetUnitId: z.string().min(1), governmentEntityId: z.string().min(1), sourceReference: z.string().trim().min(10).max(1000) }).parse(raw);
  return context.prisma.$transaction(async (tx) => {
    const [unit, entity] = await Promise.all([tx.budgetUnit.findUnique({ where: { id: input.budgetUnitId } }), tx.governmentEntity.findUnique({ where: { id: input.governmentEntityId } })]);
    if (!unit || entity?.status !== "ATIVA") throw new SstValidationError("UG ou entidade inválida.");
    const id = randomUUID();
    await tx.$executeRaw`INSERT INTO "HrBudgetUnitEntityMapping" (id,"budgetUnitId","governmentEntityId","sourceReference","createdById") VALUES (${id},${unit.id},${entity.id},${input.sourceReference},${context.user.id})`;
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "HR_VERIFIED_UG_ENTITY", targetId: id });
    return id;
  });
}

export async function registerFunctionalPeriod(context: AppContext, raw: unknown) {
  const input = functionalPeriodInput.parse(raw);
  assertBudgetUnitAccess(context.user, input.budgetUnitId);
  if (!canPerformModuleOperation(context.user, "RH", input.supersedesId ? "update" : "create")) throw new AccessError("Histórico contratual exige permissão RH.", 403);
  const hash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  return context.prisma.$transaction(async (tx) => {
    const active = await tx.configuracaoModulo.findUnique({ where: { codigo: "RH" } });
    if (active?.ativo === false) throw new SstValidationError("RH desativado.");
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`HR_FUNCTIONAL:${input.employeeId}`}))`;
    const existing = await tx.$queryRaw<{ id: string; requestHash: string; createdById: string }[]>`SELECT id,"requestHash","createdById" FROM "HrEmployeeFunctionalPeriod" WHERE id=${input.submissionKey}`;
    if (existing[0]) {
      if (existing[0].requestHash !== hash || existing[0].createdById !== context.user.id) throw new SstValidationError("Submissão já utilizada com outros dados.");
      return existing[0].id;
    }
    const [employee, regime, role, functionRole, department, local, center] = await Promise.all([
      tx.employee.findUnique({ where: { id: input.employeeId }, select: { id: true, registration: true } }),
      tx.hrEmploymentRegime.findUnique({ where: { id: input.employmentRegimeId }, include: { ruleSet: true } }),
      tx.role.findUnique({ where: { id: input.roleId } }),
      input.functionRoleId ? tx.role.findUnique({ where: { id: input.functionRoleId } }) : null,
      tx.department.findUnique({ where: { id: input.departmentId } }), tx.administrativeUnit.findUnique({ where: { id: input.localId } }), tx.costCenter.findUnique({ where: { id: input.costCenterId } }),
    ]);
    if (!employee || !regime?.isActive || !role?.isActive || !department?.isActive || !local?.isActive || !center?.isActive || (input.functionRoleId && !functionRole?.isActive)) throw new SstValidationError("Referências funcionais canônicas inválidas/inativas.");
    if (regime.ruleSet.effectiveFrom > input.startsAt || (regime.ruleSet.effectiveUntil && regime.ruleSet.effectiveUntil < input.endsAt)) throw new SstValidationError("Regime fora da vigência da parametrização RH.");
    const snapshot = { registration: employee.registration, regime: { id: regime.id, code: regime.code, name: regime.name, employmentNature: regime.employmentNature }, role: role.name, functionRole: functionRole?.name || null, department: department.name, local: local.name, costCenter: { code: center.code, name: center.name } };
    await tx.$executeRaw`INSERT INTO "HrEmployeeFunctionalPeriod" (id,"employeeId","budgetUnitId","governmentEntityId","employmentRegimeId","roleId","functionRoleId","departmentId","localId","costCenterId","startsAt","endsAt","contractReference","sourceReference","supersedesId",voided,snapshot,"requestHash","createdById") VALUES (${input.submissionKey},${employee.id},${input.budgetUnitId},${input.governmentEntityId},${regime.id},${role.id},${functionRole?.id || null},${department.id},${local.id},${center.id},${input.startsAt},${input.endsAt},${input.contractReference},${input.sourceReference},${input.supersedesId || null},${input.voided},${JSON.stringify(snapshot)}::jsonb,${hash},${context.user.id})`;
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "HR_FUNCTIONAL_PERIOD", targetId: input.submissionKey });
    return input.submissionKey;
  });
}

export type FunctionalFilters = { budgetUnitId?: string; employeeId?: string; employmentRegimeId?: string; localId?: string; costCenterId?: string; startsAt?: Date; endsAt?: Date; page?: number };
export async function listFunctionalPeriods(context: AppContext, filters: FunctionalFilters = {}) {
  const scope = functionalAuthorizedScope(context, filters.budgetUnitId);
  const conditions = [scope, Prisma.sql`NOT p.voided AND NOT EXISTS (SELECT 1 FROM "HrEmployeeFunctionalPeriod" n WHERE n."supersedesId"=p.id)`];
  if (filters.employeeId) conditions.push(Prisma.sql`p."employeeId"=${filters.employeeId}`);
  if (filters.employmentRegimeId) conditions.push(Prisma.sql`p."employmentRegimeId"=${filters.employmentRegimeId}`);
  if (filters.localId) conditions.push(Prisma.sql`p."localId"=${filters.localId}`);
  if (filters.costCenterId) conditions.push(Prisma.sql`p."costCenterId"=${filters.costCenterId}`);
  if (filters.startsAt) conditions.push(Prisma.sql`p."endsAt">${filters.startsAt}`);
  if (filters.endsAt) conditions.push(Prisma.sql`p."startsAt"<${filters.endsAt}`);
  const where = Prisma.join(conditions, " AND ");
  const [count] = await context.prisma.$queryRaw<{ total: number }[]>(Prisma.sql`SELECT count(*)::int AS total FROM "HrEmployeeFunctionalPeriod" p WHERE ${where}`);
  const total = count.total;
  const page = Math.min(Math.max(1, Math.trunc(filters.page || 1)), Math.max(1, Math.ceil(total / 20)));
  const records = await context.prisma.$queryRaw<(FunctionalScope & { employeeName: string })[]>(Prisma.sql`SELECT p.*,e.name AS "employeeName" FROM "HrEmployeeFunctionalPeriod" p JOIN "Employee" e ON e.id=p."employeeId" WHERE ${where} ORDER BY p."startsAt" DESC,p.id ASC LIMIT 20 OFFSET ${(page - 1) * 20}`);
  return { records, total, page };
}

// Authorized F8 source: historical periods + immutable program/GHE snapshots, not today's lotação.
export async function getAuthorizedHistoricalExposure(context: AppContext, employeeId: string, budgetUnitId: string, startsAt: Date, endsAt: Date) {
  const scope = functionalAuthorizedScope(context, budgetUnitId);
  if (!(startsAt < endsAt)) throw new SstValidationError("Intervalo histórico inválido.");
  const periods = await context.prisma.$queryRaw<FunctionalScope[]>(Prisma.sql`SELECT p.* FROM "HrEmployeeFunctionalPeriod" p WHERE ${scope} AND p."employeeId"=${employeeId} AND NOT p.voided AND NOT EXISTS (SELECT 1 FROM "HrEmployeeFunctionalPeriod" n WHERE n."supersedesId"=p.id) AND p."startsAt"<${endsAt} AND p."endsAt">${startsAt} ORDER BY p."startsAt",p.id`);
  const programs = await context.prisma.sstProgramExposureGroup.findMany({ where: { program: { budgetUnitId, startsAt: { lt: endsAt }, endsAt: { gt: startsAt } } }, include: { program: true }, orderBy: { id: "asc" } });
  const criteria = z.object({ departmentIds: z.array(z.string()), roleIds: z.array(z.string()), startsAt: z.coerce.date(), endsAt: z.coerce.date().nullable() });
  const exposure = periods.flatMap((period) => programs.flatMap((group) => {
    const rule = criteria.parse(group.groupSnapshot);
    if (!matchesHistoricalExposure(period, rule)) return [];
    let interval = historicalIntersection(period, { startsAt, endsAt });
    if (interval) interval = historicalIntersection(interval, group.program);
    if (interval) interval = historicalIntersection(interval, { startsAt: rule.startsAt, endsAt: rule.endsAt || endsAt });
    return interval ? [{ ...interval, functionalPeriodId: period.id, programGroupId: group.id, programId: group.programId, version: group.program.version, kind: group.program.kind, groupId: group.groupId, groupSnapshot: group.groupSnapshot, risks: group.risks }] : [];
  }));
  const responsibilities = await context.prisma.$queryRaw<HistoricalTechnicalResponsibility[]>`SELECT r.*,v."createdAt" AS "revokedAt",LEAST(r."endsAt",COALESCE(v."createdAt",r."endsAt")) AS "effectiveEndsAt" FROM "SstTechnicalResponsibility" r LEFT JOIN "SstFoundationalRevocation" v ON v."responsibilityId"=r.id WHERE r."budgetUnitId"=${budgetUnitId} AND r."startsAt"<${endsAt} AND LEAST(r."endsAt",COALESCE(v."createdAt",r."endsAt"))>${startsAt} ORDER BY r."startsAt",r.id`;
  let coveredUntil = startsAt.getTime();
  let historyGap = false;
  for (const period of periods) {
    if (period.startsAt.getTime() > coveredUntil) historyGap = true;
    coveredUntil = Math.max(coveredUntil, period.endsAt.getTime());
  }
  historyGap ||= coveredUntil < endsAt.getTime();
  const versionConflict = exposure.some((a, i) => exposure.slice(i + 1).some((b) => a.kind === b.kind && a.groupId === b.groupId && a.programId !== b.programId && !!historicalIntersection(a, b)));
  const blockers = [...(historyGap ? ["FUNCTIONAL_HISTORY_GAP"] : []), ...(versionConflict ? ["OVERLAPPING_PROGRAM_VERSIONS"] : [])];
  await writeAuditEvent(context.prisma, { actorUsuarioId: context.user.id, eventType: auditEventTypes.pageView, targetType: "SST_AUTHORIZED_FUNCTIONAL_HISTORY", targetId: employeeId });
  return { periods, exposure, responsibilities, source: "HR_EMPLOYEE_FUNCTIONAL_HISTORY" as const, missingHistory: !periods.length, blockers };
}
