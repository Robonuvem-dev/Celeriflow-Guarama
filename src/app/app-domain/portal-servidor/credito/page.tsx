import Link from "next/link";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import type { JsonValue } from "@/db/json";
import { portalRows } from "@/db/repositories/portal-servidor/records";
import { getEmployeePortalAccess } from "@/lib/portal-servidor/access";
import { arePortalPayrollStatementsEnabled } from "@/lib/rh/payroll-configuration";
import { payrollPeriod } from "@/lib/rh/calculation-engine";
import { ErpPageTitle } from "@/components/app-ui/erp/ErpPageTitle";
import { CreditRequestForm, type CreditReference } from "./CreditRequestForm";

export const dynamic = "force-dynamic";
export default async function MyCreditPage() {
  const access = await getEmployeePortalAccess();
  if (access.status !== "AVAILABLE") return <p className="p-4">Cadastro funcional indisponível.</p>;
  const executor = access.context.database ?? db;
  if (!await arePortalPayrollStatementsEnabled(executor)) return <p className="p-4">Demonstrativos desabilitados pelo RH.</p>;
  const runRows = await portalRows<{ id: string; scope: string; ruleSetId: string; competence: string }>(executor, sql`SELECT r.id,r.scope,r."ruleSetId",p.competence FROM "HrPayrollRun" r JOIN "Payroll" p ON p.id=r."payrollId" WHERE r.mode='OFICIAL' AND r.status='FECHADA' AND p.type='Mensal' AND EXISTS(SELECT 1 FROM "HrPayrollStatement" s JOIN "HrEmploymentContract" c ON c.id=s."contractId" WHERE s."runId"=r.id AND c."employeeId"=${access.employee.id})`);
  const statementRows = await portalRows<{ runId: string; id: string; registration: string }>(executor, sql`SELECT s."runId",c.id,c.registration FROM "HrPayrollStatement" s JOIN "HrEmploymentContract" c ON c.id=s."contractId" WHERE s."runId"=ANY(${sql.param(runRows.map(row => row.id))}::text[]) AND c."employeeId"=${access.employee.id} AND s."releaseAt"<=${new Date()} AND s."revokedAt" IS NULL`);
  const runs = runRows.map(({ competence, ...row }) => ({ ...row, payroll: { competence }, statements: statementRows.filter(statement => statement.runId === row.id).map(statement => ({ contract: { id: statement.id, registration: statement.registration } })) }));
  const references: CreditReference[] = [];
  for (const scope of [...new Set(runs.map(run => run.scope))]) {
    const run = runs.filter(run => run.scope === scope).sort((a, b) => payrollPeriod(b.payroll.competence).start.getTime() - payrollPeriod(a.payroll.competence).start.getTime())[0];
    if (!run?.statements.length) continue;
    const rules = await portalRows<{ id: string; value: JsonValue }>(executor, sql`SELECT id,value FROM "HrPayrollRule" WHERE "ruleSetId"=${run.ruleSetId} AND code='CONSIGNACAO_CONTRATOS' AND "isActive"`);
    for (const rule of rules) {
      const policy = z.object({ origin: z.literal("CONSIGNACAO_CONTRATOS"), supplierIds: z.array(z.string()) }).safeParse(rule.value);
      if (!policy.success) continue;
      const supplierRows = await portalRows<{ id: string; companyId: string | null; corporateName: string | null; personId: string | null; fullName: string | null }>(executor, sql`SELECT s.id,c.id AS "companyId",c."corporateName",p.id AS "personId",p."fullName" FROM "Supplier" s LEFT JOIN "Company" c ON c.id=s."companyId" LEFT JOIN "Person" p ON p.id=s."personId" WHERE s.id=ANY(${sql.param(policy.data.supplierIds)}::text[]) AND s.status='Ativo' ORDER BY s.id`);
      const suppliers = supplierRows.map(row => ({ id: row.id, company: row.companyId ? { corporateName: row.corporateName! } : null, person: row.personId ? { fullName: row.fullName! } : null }));
      if (!suppliers.length) continue;
      references.push({ id: run.id, ruleId: rule.id, label: `${run.payroll.competence} · ${scope}`, contracts: run.statements.map(row => ({ id: row.contract.id, label: row.contract.registration })), suppliers: suppliers.map(row => ({ id: row.id, label: row.company?.corporateName || row.person?.fullName || row.id })) });
    }
  }
  return <div className="flex flex-1 flex-col gap-2 p-3"><ErpPageTitle title="Solicitar crédito consignado" description="Pedido do titular, com referência publicada e consignatária habilitada." action={<Link href="/portal-servidor/solicitacoes-rh">Meus pedidos</Link>} /><CreditRequestForm requestKey={randomUUID()} references={references} /></div>;
}
