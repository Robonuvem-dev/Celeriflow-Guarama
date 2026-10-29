import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { coursePolicySchema, evaluationPolicySchema } from "@/lib/portal-servidor/career-service";
import { assessmentPayloadSchema } from "@/lib/portal-servidor/evaluation-results";
import { ErpPageTitle } from "@/components/app-ui/erp/ErpPageTitle";
import { CareerPolicyForm, EvaluationPublicationForm } from "./ActivityForms";
import { CareerEnrollments } from "./CareerEnrollments";
import { db } from "@/db/client";
import { readActiveRuleSets, readPortalRules, readCareerRequests } from "@/db/repositories/personnel-pages/catalog";
import { OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { OperationalLinkPagination, OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import { OPERATIONAL_PAGE_SIZE } from "@/lib/operational-tables";
import styles from "@/components/app-ui/operational/operational.module.css";
import { rhColumn } from "../_components/operational-columns";
import { RhNewLink } from "../_components/RhNewLink";

export const dynamic = "force-dynamic";
const enrollmentSchema = z.object({ courseName: z.string(), employeeName: z.string(), policy: coursePolicySchema });

export default async function CareerAdministrationPage({ searchParams }: { searchParams: Promise<{ edit?: string; new?: string; page?: string; tab?: string; view?: string }> }) {
  const context = await getTenantContextForModule("RH"), params = await searchParams;
  const inScope = (budgetUnitId: string) => isSystemAdministrator(context.user) || context.user.allowedBudgetUnitIds.includes(budgetUnitId);
  const rules = await readPortalRules(context.database ?? db, "career");
  const activities = rules.flatMap(rule => { const policy = rule.code.startsWith("PORTAL_CURSO_") ? coursePolicySchema.safeParse(rule.value) : evaluationPolicySchema.safeParse(rule.value); return policy.success && inScope(policy.data.budgetUnitId) ? [{ rule, policy: policy.data }] : []; });
  const selected = activities.find(item => item.rule.id === params.edit);
  if ((params.new || selected) && params.view !== "manage") redirect(`/rh/atividades-funcionais?${new URLSearchParams({ ...Object.fromEntries(Object.entries(params).filter((entry): entry is [string, string] => typeof entry[1] === "string")), view: "manage" })}`);
  if (params.view === "manage" && !params.new && !selected && params.tab !== "inscricoes") redirect("/rh/atividades-funcionais");
  const ruleSets = await readActiveRuleSets(context.database ?? db);
  const requests = await readCareerRequests(context.database ?? db, "enrollments");
  const enrollments = requests.flatMap(request => { const parsed = enrollmentSchema.safeParse(request.payload); return parsed.success && inScope(parsed.data.policy.budgetUnitId) ? [{ request, payload: parsed.data }] : []; });
  const assessed = await readCareerRequests(context.database ?? db, "assessments");
  const results = assessed.flatMap(request => { const parsed = assessmentPayloadSchema.safeParse(request.payload); return parsed.success && inScope(parsed.data.policy.budgetUnitId) ? [{ request, payload: parsed.data }] : []; });
  if (!params.new && !selected && params.tab !== "inscricoes") {
    const activityPage = Math.min(Math.max(1, Number.parseInt(params.page || "1") || 1), Math.max(1, Math.ceil(activities.length / OPERATIONAL_PAGE_SIZE)));
    const columns = [rhColumn("name", "Atividade", 360, 180), rhColumn("type", "Tipo", 200, 120), rhColumn("status", "Situação", 160, 115, "status"), rhColumn("actions", "Ações", 90, 80, "actions")];
    return <OperationalListFrame label="Capacitação e avaliações funcionais" actions={<><RhNewLink href="?view=manage&new=1">Nova atividade</RhNewLink><Link href="?tab=inscricoes" className={styles.filterButton}>Conclusões e publicações</Link></>}
      pagination={<OperationalLinkPagination page={activityPage} total={activities.length} pathname="/rh/atividades-funcionais" />}>
      <OperationalTable columns={columns} preferenceId="rh-atividades" caption="Atividades funcionais configuradas no escopo do RH" emptyMessage="Nenhuma atividade configurada no seu escopo." rows={activities.slice((activityPage - 1) * OPERATIONAL_PAGE_SIZE, activityPage * OPERATIONAL_PAGE_SIZE).map(({ rule, policy }) => ({ id: rule.id, label: rule.name, values: { name: rule.name, type: policy.origin === "CAPACITACAO_FUNCIONAL" ? "Curso" : policy.kind, status: rule.isActive ? "Disponível" : "Indisponível" }, actions: <Link href={`?edit=${rule.id}`}>Editar</Link> }))} />
    </OperationalListFrame>;
  }
  return <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
    <ErpPageTitle title="Capacitação e avaliações funcionais" description="Instrumentos, públicos, janelas e reconhecimento de conclusão no escopo do RH." action={<Link href="?new=1">Nova atividade</Link>} />
    <Link href="/rh/atividades-funcionais" className="text-xs underline">Voltar às atividades configuradas</Link>
    {(params.new || selected) && <CareerPolicyForm key={selected?.rule.id || "new"} ruleSets={ruleSets} values={selected ? { id: selected.rule.id, ruleSetId: selected.rule.ruleSetId, code: selected.rule.code, name: selected.rule.name, isActive: selected.rule.isActive, value: selected.rule.value } : undefined} />}
    <h2 className="text-sm font-semibold">Inscrições aguardando reconhecimento de conclusão</h2>
    <CareerEnrollments initialPage={Math.max(1, Number.parseInt(params.page || "1") || 1)} items={enrollments.map(({ request, payload }) => ({ id: request.id, employee: payload.employeeName, course: payload.courseName, endsAt: new Date(payload.policy.endsAt).toLocaleDateString("pt-BR") }))} />
    <h2 className="text-sm font-semibold">Avaliações concluídas aguardando publicação</h2>
    {results.map(({ request, payload }) => <section key={request.id} className="rounded border border-slate-300 bg-white p-3"><h3 className="mb-3 text-sm font-semibold">{payload.employeeName} · {payload.cycleName}</h3><p className="mb-3 text-xs text-slate-600">Publique a conclusão fundamentada após conferir os registros da comissão. Não há classificação automática presumida.</p><EvaluationPublicationForm requestId={request.id} /></section>)}
    {!results.length && <p className="text-xs text-slate-600">Nenhum resultado aguardando publicação no seu escopo.</p>}
  </div>;
}
