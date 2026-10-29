import Link from "next/link";
import { redirect } from "next/navigation";
import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { db } from "@/db/client";
import { readPortalRules, readActiveRuleSets } from "@/db/repositories/personnel-pages/catalog";
import { readPublishedPayrollPage } from "@/db/repositories/personnel-pages/workforce";
import { portalPayrollPublicationPolicySchema } from "@/lib/portal-servidor/payroll-publication";
import { ErpPageTitle } from "@/components/app-ui/erp/ErpPageTitle";
import { OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { OperationalLinkPagination, OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import styles from "@/components/app-ui/operational/operational.module.css";
import { rhColumn } from "../_components/operational-columns";
import { RhNewLink } from "../_components/RhNewLink";
import { PayrollPolicyForm, PayrollReleaseForm, StatementRevocationForm } from "./PublicationForms";

export const dynamic = "force-dynamic";

export default async function FunctionalPayrollPublicationPage({ searchParams }: { searchParams: Promise<{ edit?: string; new?: string; page?: string; view?: string }> }) {
  const context = await getTenantContextForModule("RH"), params = await searchParams;
  const rules = await readPortalRules(context.database ?? db, "payroll");
  const policies = rules.filter(rule => { const policy = portalPayrollPublicationPolicySchema.safeParse(rule.value); return policy.success && (isSystemAdministrator(context.user) || context.user.allowedBudgetUnitIds.includes(policy.data.budgetUnitId)); });
  const selected = policies.find(policy => policy.id === params.edit);
  if ((params.new || selected) && params.view !== "manage") redirect(`/rh/publicacao-funcional?${new URLSearchParams({ ...Object.fromEntries(Object.entries(params).filter((entry): entry is [string, string] => typeof entry[1] === "string")), view: "manage" })}`);
  const ruleSets = await readActiveRuleSets(context.database ?? db);
  const { runs, total, page, statements } = await readPublishedPayrollPage(context.database ?? db, context.user, params.page);
  if (!params.new && !selected && params.view !== "manage") {
    const columns = [rhColumn("employee", "Servidor", 240, 140), rhColumn("registration", "Matrícula", 110, 90, "identifier"), rhColumn("competence", "Competência", 130, 110), rhColumn("type", "Tipo", 150, 100), rhColumn("releaseAt", "Liberação", 190, 150), rhColumn("actions", "Revogação", 120, 110, "actions")];
    return <OperationalListFrame label="Disponibilização funcional da folha" actions={<><RhNewLink href="?view=manage&new=1">Nova política</RhNewLink><Link href="?view=manage" className={styles.filterButton}>Políticas e liberação</Link></>}
      pagination={<OperationalLinkPagination page={page} total={total} pathname="/rh/publicacao-funcional" />}>
      <OperationalTable columns={columns} preferenceId="rh-publicacao-funcional" caption="Demonstrativos com liberação registrada" emptyMessage="Nenhum demonstrativo com liberação registrada." rows={statements.map(statement => ({ id: statement.id, label: statement.contract.employee.name, values: { employee: statement.contract.employee.name, registration: statement.contract.registration, competence: statement.run.payroll.competence, type: statement.run.payroll.type, releaseAt: statement.releaseAt?.toLocaleString("pt-BR") || "—" }, actions: <Link href={`?view=manage&page=${page}#statement-${statement.id}`}>Revogar</Link> }))} />
    </OperationalListFrame>;
  }
  return <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
    <ErpPageTitle title="Disponibilização funcional da folha" description="Políticas por tipo, regime e escopo; data de liberação e revogação dos demonstrativos pessoais." action={<Link href="?new=1">Nova política</Link>} />
    <Link href="/rh/publicacao-funcional" className="text-xs underline">Voltar à listagem</Link>
    {params.new || selected ? <PayrollPolicyForm key={selected?.id || "new"} ruleSets={ruleSets} values={selected ? { id: selected.id, ruleSetId: selected.ruleSetId, code: selected.code, name: selected.name, isActive: selected.isActive, value: selected.value } : undefined} /> : <section className="rounded border border-slate-300 bg-white p-3 text-xs"><h2 className="mb-2 font-semibold">Políticas configuradas</h2>{policies.map(policy => <p key={policy.id}><Link href={`?edit=${policy.id}`} className="text-emerald-800 underline">{policy.name}</Link> · {policy.isActive ? "Ativa" : "Inativa"}</p>)}{!policies.length && <p>Nenhuma política no seu escopo.</p>}</section>}
    <PayrollReleaseForm policies={policies.filter(policy => policy.isActive).map(policy => ({ id: policy.id, name: policy.name }))} runs={runs.map(run => ({ id: run.id, name: `${run.payroll.competence} · ${run.payroll.type} · ${run.scope} · ${run.status} · ${run.id}` }))} />
    {statements.map(statement => <section key={statement.id} id={`statement-${statement.id}`} className="rounded border bg-white p-3"><h2>{statement.contract.employee.name} · {statement.contract.registration}</h2><p>{statement.run.payroll.competence} · {statement.run.payroll.type} · {statement.releaseAt?.toLocaleString("pt-BR")}</p><StatementRevocationForm statementId={statement.id} /></section>)}
    {!total && <p>Nenhum demonstrativo com liberação registrada.</p>}
    <OperationalLinkPagination page={page} total={total} pathname="/rh/publicacao-funcional" values={{ view: "manage" }} />
  </div>;
}
