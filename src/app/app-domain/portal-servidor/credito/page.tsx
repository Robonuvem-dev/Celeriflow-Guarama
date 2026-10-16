import Link from "next/link";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getEmployeePortalAccess } from "@/lib/portal-servidor/access";
import { arePortalPayrollStatementsEnabled } from "@/lib/rh/payroll-configuration";
import { payrollPeriod } from "@/lib/rh/calculation-engine";
import { ErpPageTitle } from "@/components/app-ui/erp/ErpPageTitle";
import { CreditRequestForm, type CreditReference } from "./CreditRequestForm";

export const dynamic = "force-dynamic";
export default async function MyCreditPage() {
  const access = await getEmployeePortalAccess();
  if (access.status !== "AVAILABLE") return <p className="p-4">Cadastro funcional indisponível.</p>;
  const { prisma } = access.context;
  if (!await arePortalPayrollStatementsEnabled(prisma)) return <p className="p-4">Demonstrativos desabilitados pelo RH.</p>;
  const runs = await prisma.hrPayrollRun.findMany({ where: { mode: "OFICIAL", status: "FECHADA", payroll: { type: "Mensal" }, statements: { some: { contract: { employeeId: access.employee.id } } } }, include: { payroll: { select: { competence: true } }, statements: { where: { contract: { employeeId: access.employee.id }, releaseAt: { lte: new Date() }, revokedAt: null }, select: { contract: { select: { id: true, registration: true } } } } } });
  const references: CreditReference[] = [];
  for (const scope of [...new Set(runs.map(run => run.scope))]) {
    const run = runs.filter(run => run.scope === scope).sort((a, b) => payrollPeriod(b.payroll.competence).start.getTime() - payrollPeriod(a.payroll.competence).start.getTime())[0];
    if (!run?.statements.length) continue;
    const rules = await prisma.hrPayrollRule.findMany({ where: { ruleSetId: run.ruleSetId, code: "CONSIGNACAO_CONTRATOS", isActive: true } });
    for (const rule of rules) {
      const policy = z.object({ origin: z.literal("CONSIGNACAO_CONTRATOS"), supplierIds: z.array(z.string()) }).safeParse(rule.value);
      if (!policy.success) continue;
      const suppliers = await prisma.supplier.findMany({ where: { id: { in: policy.data.supplierIds }, status: "Ativo" }, select: { id: true, company: { select: { corporateName: true } }, person: { select: { fullName: true } } }, orderBy: { id: "asc" } });
      if (!suppliers.length) continue;
      references.push({ id: run.id, ruleId: rule.id, label: `${run.payroll.competence} · ${scope}`, contracts: run.statements.map(row => ({ id: row.contract.id, label: row.contract.registration })), suppliers: suppliers.map(row => ({ id: row.id, label: row.company?.corporateName || row.person?.fullName || row.id })) });
    }
  }
  return <div className="flex flex-1 flex-col gap-2 p-3"><ErpPageTitle title="Solicitar crédito consignado" description="Pedido do titular, com referência publicada e consignatária habilitada." action={<Link href="/portal-servidor/solicitacoes-rh">Meus pedidos</Link>} /><CreditRequestForm requestKey={randomUUID()} references={references} /></div>;
}
