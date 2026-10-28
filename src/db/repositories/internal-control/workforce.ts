import { and, asc, eq, sql } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import { Decimal } from "@/db/decimal";
import { roles } from "@/db/schema/administration";
import type { EmploymentContract, EmploymentRevision } from "@/lib/contracts/personnel";

type ContractRow = Omit<EmploymentContract, "salary" | "admittedAt" | "appointedAt" | "swornAt" | "endsAt" | "createdAt" | "updatedAt"> & {
  salary: string; admittedAt: string; appointedAt: string | null; swornAt: string | null; endsAt: string | null; createdAt: string; updatedAt: string; employeeName: string;
};
type RevisionRow = Omit<EmploymentRevision, "effectiveFrom" | "createdAt"> & { effectiveFrom: string; createdAt: string };
type WorkforceContract = EmploymentContract & { employee: { id: string; name: string }; revisions: EmploymentRevision[] };

export async function listControlWorkforceYears(db: DatabaseExecutor, allowedBudgetUnitIds?: string[]) {
  return (await db.execute<{ id: string; year: number; governmentEntity: { name: string } }>(sql`
    SELECT y.id, y.year, jsonb_build_object('name', e.name) AS "governmentEntity" FROM "FinancialYear" y JOIN "GovernmentEntity" e ON e.id=y."governmentEntityId"
    WHERE EXISTS (SELECT 1 FROM "PlanningEntityUnit" p WHERE p."governmentEntityId"=e.id
      ${allowedBudgetUnitIds ? sql`AND p."budgetUnitId" IN (${sql.join(allowedBudgetUnitIds.length ? allowedBudgetUnitIds.map(id => sql`${id}`) : [sql`NULL`], sql`, `)})` : sql``})
    ORDER BY y.year DESC, y.id ASC`)).rows;
}

export async function listControlWorkforceCenters(db: DatabaseExecutor, governmentEntityId: string, allowedBudgetUnitIds?: string[]) {
  return (await db.execute<{ id: string; name: string }>(sql`SELECT c.id, c.name FROM "CostCenter" c WHERE c."governmentEntityId"=${governmentEntityId}
    AND EXISTS (SELECT 1 FROM "PlanningEntityUnit" p JOIN "BudgetUnit" b ON b.id=p."budgetUnitId"
      WHERE p."governmentEntityId"=${governmentEntityId} AND b."secretariatId"=c."secretariatId"
      ${allowedBudgetUnitIds ? sql`AND p."budgetUnitId" IN (${sql.join(allowedBudgetUnitIds.length ? allowedBudgetUnitIds.map(id => sql`${id}`) : [sql`NULL`], sql`, `)})` : sql``})`)).rows;
}

export async function listControlWorkforceContracts(db: DatabaseExecutor, input: { centerIds: string[]; reference: Date; employeeId?: string }): Promise<WorkforceContract[]> {
  if (!input.centerIds.length) return [];
  const rows = (await db.execute<ContractRow>(sql`SELECT c.id, c."employeeId", c.registration, c."regimeId", c."roleId", c."departmentId", c."costCenterId", c."workLocation", c."salaryLevel",
    to_char(c."admittedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "admittedAt", to_char(c."appointedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "appointedAt",
    to_char(c."swornAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "swornAt", to_char(c."endsAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "endsAt",
    c."monthlyHours", c.salary::text AS salary, c.status, c.version, c.details,
    to_char(c."createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt", to_char(c."updatedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "updatedAt", e.name AS "employeeName"
    FROM "HrEmploymentContract" c JOIN "Employee" e ON e.id=c."employeeId"
    WHERE (c."costCenterId" IN (${sql.join(input.centerIds.map(id => sql`${id}`), sql`, `)}) OR EXISTS (
      SELECT 1 FROM "HrEmploymentRevision" r WHERE r."contractId"=c.id AND r."effectiveFrom" <= ${input.reference}
        AND r.snapshot->'costCenterId' IN (${sql.join(input.centerIds.map(id => sql`to_jsonb(${id}::text)`), sql`, `)})
    )) ${input.employeeId ? sql`AND c."employeeId"=${input.employeeId}` : sql``} ORDER BY c.registration ASC, c.id ASC`)).rows;
  if (!rows.length) return [];
  const revisions = (await db.execute<RevisionRow>(sql`SELECT id, "contractId", version, snapshot, "actorId", reason,
    to_char("effectiveFrom", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "effectiveFrom", to_char("createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt"
    FROM "HrEmploymentRevision" WHERE "contractId" IN (${sql.join(rows.map(row => sql`${row.id}`), sql`, `)}) AND "effectiveFrom" <= ${input.reference}
    ORDER BY "effectiveFrom" DESC, version DESC`)).rows.map(row => ({ ...row, effectiveFrom: new Date(row.effectiveFrom), createdAt: new Date(row.createdAt) }));
  return rows.map(({ employeeName, ...row }) => ({ ...row, salary: new Decimal(row.salary), admittedAt: new Date(row.admittedAt), appointedAt: row.appointedAt === null ? null : new Date(row.appointedAt), swornAt: row.swornAt === null ? null : new Date(row.swornAt), endsAt: row.endsAt === null ? null : new Date(row.endsAt), createdAt: new Date(row.createdAt), updatedAt: new Date(row.updatedAt), employee: { id: row.employeeId, name: employeeName }, revisions: revisions.filter(revision => revision.contractId === row.id) }));
}

export async function listControlWorkforceRoles(db: DatabaseExecutor, input: { roleId?: string; roleStatus: "ALL" | "ACTIVE" | "INACTIVE" }) {
  return db.select({ id: roles.id, name: roles.name, isActive: roles.isActive }).from(roles)
    .where(and(input.roleId ? eq(roles.id, input.roleId) : undefined, input.roleStatus === "ALL" ? undefined : eq(roles.isActive, input.roleStatus === "ACTIVE")))
    .orderBy(asc(roles.name), asc(roles.id));
}

export async function listControlRoleLegalHistory(db: DatabaseExecutor, input: { governmentEntityId: string; reference: Date; roleId?: string }) {
  const rows = (await db.execute<{ id: string; roleId: string; state: string; designation: string; authorizedSeats: number; effectiveFrom: string; legalReference: string; documentVersionId: string; documentHash: string }>(sql`
    SELECT id, "roleId", state, designation, "authorizedSeats", to_char("effectiveFrom", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "effectiveFrom", "legalReference", "documentVersionId", "documentHash"
    FROM "HrRoleLegalHistory" WHERE "governmentEntityId"=${input.governmentEntityId} AND "effectiveFrom" <= ${input.reference}
    ${input.roleId ? sql`AND "roleId"=${input.roleId}` : sql``} ORDER BY "effectiveFrom" DESC, version DESC`)).rows;
  return rows.map(row => ({ ...row, effectiveFrom: new Date(row.effectiveFrom) }));
}
