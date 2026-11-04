import { sql } from "drizzle-orm";
import { z } from "zod";
import type { DatabaseExecutor } from "@/db/transaction";
import type { JsonValue } from "@/db/json";
import { portalFirst, portalRows } from "@/db/repositories/portal-servidor/records";

export const portalDataAccessPolicySchema = z.object({
  origin: z.literal("CONTROLE_ACESSO_DADOS_FUNCIONAIS"),
  budgetUnitId: z.string().min(1),
  year: z.number().int().min(1900).max(2200),
  month: z.number().int().min(1).max(12).nullable(),
  payrollType: z.string().trim().min(1).nullable(),
  departmentIds: z.array(z.string().min(1)).min(1),
  allowed: z.boolean(),
}).strict();

/** This gate supplements the original publication/ownership checks; it never releases an unpublished document. */
export async function portalDataAccessAllowed(database: DatabaseExecutor, employeeId: string, year: number, month: number | null = null, payrollType: string | null = null, departmentId?: string | null) {
  const employee = await portalFirst<{ departmentId: string | null; secretariatId: string | null }>(database, sql`SELECT "departmentId","secretariatId" FROM "Employee" WHERE id=${employeeId} AND "isActive"`);
  if (!employee) return false;
  const rows = await portalRows<{ value: JsonValue; secretariatId: string | null }>(database, sql`SELECT r.value,u."secretariatId" FROM "HrPayrollRule" r JOIN "HrPayrollRuleSet" s ON s.id=r."ruleSetId" JOIN "BudgetUnit" u ON u.id=r.value->>'budgetUnitId' WHERE r.category='PORTAL' AND r."isActive" AND r.value->>'origin'='CONTROLE_ACESSO_DADOS_FUNCIONAIS' AND s.status='ATIVA' AND s."effectiveFrom"<=${new Date()} AND (s."effectiveUntil" IS NULL OR s."effectiveUntil">=${new Date()})`);
  for (const row of rows) {
    const policy = portalDataAccessPolicySchema.parse(row.value);
    if (policy.year !== year || !policy.departmentIds.includes(departmentId ?? employee.departmentId ?? "")) continue;
    if (policy.month !== null && policy.month !== month || policy.payrollType !== null && policy.payrollType !== payrollType) continue;
    if (!policy.allowed) return false;
  }
  return true;
}

export async function statementDataAccessAllowed(database: DatabaseExecutor, statementId: string, employeeId: string) {
  const source = await portalFirst<{ allowed: boolean }>(database, sql`SELECT NOT EXISTS (
    SELECT 1 FROM "HrPayrollRule" rule JOIN "HrPayrollRuleSet" config ON config.id=rule."ruleSetId"
    WHERE rule.category='PORTAL' AND rule."isActive" AND rule.value->>'origin'='CONTROLE_ACESSO_DADOS_FUNCIONAIS'
      AND config.status='ATIVA' AND config."effectiveFrom"<=${new Date()} AND (config."effectiveUntil" IS NULL OR config."effectiveUntil">=${new Date()})
      AND rule.value->>'year'=split_part(p.competence,'/',2)
      AND (rule.value->'departmentIds') ? COALESCE(c."departmentId",e."departmentId",'')
      AND (rule.value->>'month' IS NULL OR (rule.value->>'month')::integer=split_part(p.competence,'/',1)::integer)
      AND (rule.value->>'payrollType' IS NULL OR rule.value->>'payrollType'=p.type)
      AND rule.value->>'allowed'='false'
  ) AS allowed FROM "HrPayrollStatement" s JOIN "HrPayrollRun" run ON run.id=s."runId" JOIN "Payroll" p ON p.id=run."payrollId"
    JOIN "HrEmploymentContract" c ON c.id=s."contractId" JOIN "Employee" e ON e.id=c."employeeId"
    WHERE s.id=${statementId} AND e.id=${employeeId} AND e."isActive"`);
  return source?.allowed === true;
}
