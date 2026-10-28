import { sql, type SQL } from "drizzle-orm";
import { Decimal } from "../../decimal";
import type { DatabaseExecutor } from "../../transaction";
import type { JsonValue } from "../../json";
import { portalRows } from "./records";

type StatementRow = {
  id: string; runId: string; contractId: string; snapshot: JsonValue; gross: string; deductions: string; net: string; employer: string;
  releaseAt: Date | null; revokedAt: Date | null; employeeId: string; registration: string; contractStatus: string;
  admittedAt: Date; endsAt: Date | null; mode: string; runStatus: string; scope: string; payrollId: string; ruleSetId: string;
  runCreatedAt: Date; competence: string; payrollType: string;
};
export type PortalStatement = {
  id: string; runId: string; contractId: string; snapshot: JsonValue; gross: Decimal; deductions: Decimal; net: Decimal; employer: Decimal;
  releaseAt: Date | null; revokedAt: Date | null;
  contract: { id: string; employeeId: string; registration: string; status: string; admittedAt: Date; endsAt: Date | null };
  run: { id: string; mode: string; status: string; scope: string; payrollId: string; ruleSetId: string; createdAt: Date; payroll: { competence: string; type: string } };
};
/** Filters use the explicit s(statement), c(contract), r(run), p(payroll) aliases. */
export async function portalStatements(db: DatabaseExecutor, filter: SQL, order: SQL = sql`s.id ASC`): Promise<PortalStatement[]> {
  const rows = await portalRows<StatementRow>(db, sql`SELECT s.*, c."employeeId",c.registration,c.status AS "contractStatus",c."admittedAt",c."endsAt",
    r.mode,r.status AS "runStatus",r.scope,r."payrollId",r."ruleSetId",r."createdAt" AS "runCreatedAt",p.competence,p.type AS "payrollType"
    FROM "HrPayrollStatement" s JOIN "HrEmploymentContract" c ON c.id=s."contractId" JOIN "HrPayrollRun" r ON r.id=s."runId" JOIN "Payroll" p ON p.id=r."payrollId"
    WHERE ${filter} ORDER BY ${order}`);
  return rows.map(row => ({ id: row.id, runId: row.runId, contractId: row.contractId, snapshot: row.snapshot,
    gross: new Decimal(row.gross), deductions: new Decimal(row.deductions), net: new Decimal(row.net), employer: new Decimal(row.employer), releaseAt: row.releaseAt, revokedAt: row.revokedAt,
    contract: { id: row.contractId, employeeId: row.employeeId, registration: row.registration, status: row.contractStatus, admittedAt: row.admittedAt, endsAt: row.endsAt },
    run: { id: row.runId, mode: row.mode, status: row.runStatus, scope: row.scope, payrollId: row.payrollId, ruleSetId: row.ruleSetId, createdAt: row.runCreatedAt, payroll: { competence: row.competence, type: row.payrollType } } }));
}
