import Link from "next/link";
import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { accessiblePayrollWhere } from "@/lib/rh/payroll-access";
import { portalPayrollPublicationPolicySchema } from "@/lib/portal-servidor/payroll-publication";
import { ErpPageTitle } from "@/components/app-ui/erp/ErpPageTitle";
import { ErpListFrame } from "@/components/app-ui/erp/ErpListFrame";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";
import { PayrollPolicyForm, PayrollReleaseForm, StatementRevocationForm } from "./PublicationForms";

export const dynamic = "force-dynamic";

export default async function FunctionalPayrollPublicationPage({ searchParams }: { searchParams: Promise<{ edit?: string; new?: string; page?: string }> }) {
  const context = await getTenantContextForModule("RH"), params = await searchParams;
  const payrollScope = accessiblePayrollWhere(context.user);
  const rules = await context.prisma.hrPayrollRule.findMany({ where: { category: "PORTAL", valueType: "JSON", code: { startsWith: "PORTAL_FOLHA_" } }, orderBy: { name: "asc" } });
  const policies = rules.filter(rule => { const policy = portalPayrollPublicationPolicySchema.safeParse(rule.value); return policy.success && (isSystemAdministrator(context.user) || context.user.allowedBudgetUnitIds.includes(policy.data.budgetUnitId)); });
  const selected = policies.find(policy => policy.id === params.edit);
  const ruleSets = await context.prisma.hrPayrollRuleSet.findMany({ where: { status: "ATIVA" }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  const runs = await context.prisma.hrPayrollRun.findMany({ where: { mode: "OFICIAL", status: { in: ["CALCULADA", "FECHADA"] }, payroll: payrollScope }, include: { payroll: { select: { competence: true, type: true } } }, orderBy: { createdAt: "desc" } });
  const where = { releaseAt: { not: null }, revokedAt: null, run: { payroll: payrollScope } };
  const total = await context.prisma.hrPayrollStatement.count({ where });
  const page = Math.min(Math.max(1, Number.parseInt(params.page || "1") || 1), Math.max(1, Math.ceil(total / 20)));
  const statements = await context.prisma.hrPayrollStatement.findMany({ where, include: { contract: { select: { registration: true, employee: { select: { name: true } } } }, run: { include: { payroll: { select: { competence: true, type: true } } } } }, orderBy: [{ releaseAt: "desc" }, { id: "asc" }], take: 20, skip: (page - 1) * 20 });
  return <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
    <ErpPageTitle title="Disponibilização funcional da folha" description="Políticas por tipo, regime e escopo; data de liberação e revogação dos demonstrativos pessoais." action={<Link href="?new=1">Nova política</Link>} />
    {params.new || selected ? <PayrollPolicyForm key={selected?.id || "new"} ruleSets={ruleSets} values={selected ? { id: selected.id, ruleSetId: selected.ruleSetId, code: selected.code, name: selected.name, isActive: selected.isActive, value: selected.value } : undefined} /> : <section className="rounded border border-slate-300 bg-white p-3 text-xs"><h2 className="mb-2 font-semibold">Políticas configuradas</h2>{policies.map(policy => <p key={policy.id}><Link href={`?edit=${policy.id}`} className="text-emerald-800 underline">{policy.name}</Link> · {policy.isActive ? "Ativa" : "Inativa"}</p>)}{!policies.length && <p>Nenhuma política no seu escopo.</p>}</section>}
    <PayrollReleaseForm policies={policies.filter(policy => policy.isActive).map(policy => ({ id: policy.id, name: policy.name }))} runs={runs.map(run => ({ id: run.id, name: `${run.payroll.competence} · ${run.payroll.type} · ${run.scope} · ${run.status} · ${run.id}` }))} />
    <ErpListFrame summary={<p className="text-xs">{total} demonstrativos com liberação registrada</p>} pagination={<ErpPagination page={page} total={total} pageSize={20} label="demonstrativos" previousHref={`?page=${page - 1}`} nextHref={`?page=${page + 1}`} />}><table className="w-full text-left text-xs"><thead><tr><th className="p-2">Servidor / matrícula</th><th>Competência / tipo</th><th>Liberação</th><th className="p-2">Revogação</th></tr></thead><tbody>{statements.map(statement => <tr key={statement.id} className="border-t"><td className="p-2">{statement.contract.employee.name}<p>{statement.contract.registration}</p></td><td>{statement.run.payroll.competence}<p>{statement.run.payroll.type}</p></td><td>{statement.releaseAt?.toLocaleString("pt-BR")}</td><td className="p-2"><StatementRevocationForm statementId={statement.id} /></td></tr>)}</tbody></table>{!total && <p className="p-4 text-sm">Nenhum demonstrativo com liberação registrada.</p>}</ErpListFrame>
  </div>;
}
