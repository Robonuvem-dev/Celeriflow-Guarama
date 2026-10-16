import Link from "next/link";
import { z } from "zod";
import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { coursePolicySchema, evaluationPolicySchema } from "@/lib/portal-servidor/career-service";
import { assessmentPayloadSchema } from "@/lib/portal-servidor/evaluation-results";
import { ErpPageTitle } from "@/components/app-ui/erp/ErpPageTitle";
import { ErpListFrame } from "@/components/app-ui/erp/ErpListFrame";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";
import { CareerPolicyForm, CourseCompletionForm, EvaluationPublicationForm } from "./ActivityForms";

export const dynamic = "force-dynamic";
const enrollmentSchema = z.object({ courseName: z.string(), employeeName: z.string(), policy: coursePolicySchema });

export default async function CareerAdministrationPage({ searchParams }: { searchParams: Promise<{ edit?: string; new?: string; page?: string }> }) {
  const context = await getTenantContextForModule("RH"), params = await searchParams;
  const inScope = (budgetUnitId: string) => isSystemAdministrator(context.user) || context.user.allowedBudgetUnitIds.includes(budgetUnitId);
  const rules = await context.prisma.hrPayrollRule.findMany({ where: { category: "PORTAL", valueType: "JSON", OR: [{ code: { startsWith: "PORTAL_CURSO_" } }, { code: { startsWith: "PORTAL_AVALIACAO_" } }] }, orderBy: [{ name: "asc" }, { id: "asc" }] });
  const activities = rules.flatMap(rule => { const policy = rule.code.startsWith("PORTAL_CURSO_") ? coursePolicySchema.safeParse(rule.value) : evaluationPolicySchema.safeParse(rule.value); return policy.success && inScope(policy.data.budgetUnitId) ? [{ rule, policy: policy.data }] : []; });
  const selected = activities.find(item => item.rule.id === params.edit);
  const ruleSets = await context.prisma.hrPayrollRuleSet.findMany({ where: { status: "ATIVA" }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  const requests = await context.prisma.hrPortalRequest.findMany({ where: { kind: "CAPACITACAO_INSCRICAO", status: "INSCRITA" }, orderBy: [{ createdAt: "desc" }, { id: "asc" }] });
  const enrollments = requests.flatMap(request => { const parsed = enrollmentSchema.safeParse(request.payload); return parsed.success && inScope(parsed.data.policy.budgetUnitId) ? [{ request, payload: parsed.data }] : []; });
  const page = Math.min(Math.max(1, Number.parseInt(params.page || "1") || 1), Math.max(1, Math.ceil(enrollments.length / 20)));
  const assessed = await context.prisma.hrPortalRequest.findMany({ where: { kind: "AVALIACAO_FUNCIONAL", status: "AVALIADA" }, orderBy: [{ createdAt: "desc" }, { id: "asc" }] });
  const results = assessed.flatMap(request => { const parsed = assessmentPayloadSchema.safeParse(request.payload); return parsed.success && inScope(parsed.data.policy.budgetUnitId) ? [{ request, payload: parsed.data }] : []; });
  return <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
    <ErpPageTitle title="Capacitação e avaliações funcionais" description="Instrumentos, públicos, janelas e reconhecimento de conclusão no escopo do RH." action={<Link href="?new=1">Nova atividade</Link>} />
    {params.new || selected ? <CareerPolicyForm key={selected?.rule.id || "new"} ruleSets={ruleSets} values={selected ? { id: selected.rule.id, ruleSetId: selected.rule.ruleSetId, code: selected.rule.code, name: selected.rule.name, isActive: selected.rule.isActive, value: selected.rule.value } : undefined} /> : <ErpListFrame summary={<p className="text-xs">{activities.length} atividades configuradas</p>}><table className="w-full text-left text-xs"><thead><tr><th className="p-2">Atividade</th><th>Tipo</th><th>Situação</th></tr></thead><tbody>{activities.map(({ rule, policy }) => <tr key={rule.id} className="border-t"><td className="p-2"><Link href={`?edit=${rule.id}`} className="font-semibold text-emerald-800 underline">{rule.name}</Link></td><td>{policy.origin === "CAPACITACAO_FUNCIONAL" ? "Curso" : policy.kind}</td><td>{rule.isActive ? "Disponível" : "Indisponível"}</td></tr>)}</tbody></table>{!activities.length && <p className="p-4 text-sm">Nenhuma atividade configurada no seu escopo.</p>}</ErpListFrame>}
    <h2 className="text-sm font-semibold">Inscrições aguardando reconhecimento de conclusão</h2>
    <ErpListFrame summary={<p className="text-xs">{enrollments.length} inscrições</p>} pagination={<ErpPagination page={page} total={enrollments.length} pageSize={20} label="inscrições" previousHref={`?page=${page - 1}`} nextHref={`?page=${page + 1}`} />}>
      <table className="w-full text-left text-xs"><thead><tr><th className="p-2">Servidor / curso</th><th className="p-2">Conclusão</th></tr></thead><tbody>{enrollments.slice((page - 1) * 20, page * 20).map(({ request, payload }) => <tr key={request.id} className="border-t"><td className="p-2"><p className="font-semibold">{payload.employeeName}</p><p>{payload.courseName}</p><p>Encerramento: {new Date(payload.policy.endsAt).toLocaleDateString("pt-BR")}</p></td><td className="p-2"><CourseCompletionForm requestId={request.id} /></td></tr>)}</tbody></table>
      {!enrollments.length && <p className="p-4 text-sm">Nenhuma inscrição aguardando reconhecimento no seu escopo.</p>}
    </ErpListFrame>
    <h2 className="text-sm font-semibold">Avaliações concluídas aguardando publicação</h2>
    {results.map(({ request, payload }) => <section key={request.id} className="rounded border border-slate-300 bg-white p-3"><h3 className="mb-3 text-sm font-semibold">{payload.employeeName} · {payload.cycleName}</h3><p className="mb-3 text-xs text-slate-600">Publique a conclusão fundamentada após conferir os registros da comissão. Não há classificação automática presumida.</p><EvaluationPublicationForm requestId={request.id} /></section>)}
    {!results.length && <p className="text-xs text-slate-600">Nenhum resultado aguardando publicação no seu escopo.</p>}
  </div>;
}
