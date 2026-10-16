import Link from "next/link";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { inspectPositionPlan } from "@/lib/rh/position-plan";
import { ErpPageTitle } from "@/components/app-ui/erp/ErpPageTitle";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";

export const dynamic = "force-dynamic";
export default async function PositionPlanPage({ searchParams }: { searchParams: Promise<{ ruleId?: string; q?: string; page?: string }> }) {
  const { prisma } = await getTenantContextForModule("RH"); const params = await searchParams;
  const rules = await prisma.hrPayrollRule.findMany({ where: { code: "QUADRO_CARGOS" }, include: { ruleSet: { select: { name: true, scope: true } } }, orderBy: { id: "asc" } });
  const ruleId = params.ruleId || rules[0]?.id;
  let data: Awaited<ReturnType<typeof inspectPositionPlan>> | undefined;
  let error = "";
  if (ruleId) try { data = await inspectPositionPlan(prisma, ruleId); } catch (failure) { error = failure instanceof Error ? failure.message : "Falha na conferência do quadro."; }
  const names = new Map(data?.roles.map(role => [role.id, role.name]) || []);
  const q = (params.q || "").trim().toLocaleLowerCase("pt-BR");
  const filtered = (data?.rows || []).filter(row => !q || `${names.get(row.roleId) || row.roleId} ${row.startsAt}`.toLocaleLowerCase("pt-BR").includes(q));
  const total = filtered.length; const page = Math.min(Math.max(1, Number.parseInt(params.page || "1") || 1), Math.max(1, Math.ceil(total / 20)));
  const href = (value: number) => `?${new URLSearchParams({ ruleId: ruleId || "", q: params.q || "", page: String(value) })}`;
  return <div className="flex min-h-0 flex-1 flex-col gap-2 p-3"><ErpPageTitle title="Quadro de cargos, vagas e níveis" description="Ocupação temporal por contrato, agregada entre regimes do mesmo conjunto." action={<Link href="/rh/parametrizacoes">Parametrizações</Link>} />
    <Link href="/rh/quadro-cargos/historico-legal" className="text-xs underline">Histórico legal de criação, alterações e extinção de cargos</Link>
    <form className="flex flex-wrap gap-2 text-xs"><select name="ruleId" defaultValue={ruleId} className="h-8 rounded border px-2">{rules.map(rule => <option key={rule.id} value={rule.id}>{rule.ruleSet.name} · {rule.ruleSet.scope} · {rule.isActive ? "ativa" : "inativa"}</option>)}</select><input name="q" defaultValue={params.q} placeholder="Cargo / início de vigência" className="h-8 rounded border px-2" /><button className="rounded border px-3">Conferir</button></form>
    {error && <p role="alert" className="rounded border border-red-300 p-3 text-sm">{error}</p>}
    {data && <p className="rounded border bg-white p-3 text-xs">{data.rule.ruleSet.scope} · {data.plan.legalReference} · {total} registros no filtro. Ocupação máxima e disponibilidade mínima consideram toda a vigência, inclusive contratos futuros. Vagas de outros conjuntos não são somadas a este quadro.</p>}
    {filtered.slice((page - 1) * 20, page * 20).map(row => {
      const role = data!.plan.periods.find(period => period.startsAt === row.startsAt)!.roles.find(role => role.roleId === row.roleId)!;
      return <details key={`${row.startsAt}:${row.roleId}`} className="rounded border bg-white p-3 text-xs"><summary>{names.get(row.roleId) || row.roleId} · {row.startsAt} a {row.endsAt || "indeterminado"} · autorizadas {row.authorized} · pico ocupado {row.peakOccupied} · mínimo disponível {row.minimumAvailable}</summary><p>{role.classification} · CBO {role.cbo} · escolaridade {role.education}</p><p>{role.legalReference}</p><p>Atribuições: {role.duties}</p><p>Competências: {role.competencies}</p><p>Níveis inicial/final: {role.initialLevel} / {role.finalLevel} · GED: {role.documentIds.join(", ") || "sem documentos vinculados"}</p><table className="mt-2 w-full text-left"><thead><tr><th>Nível</th><th>Vertical / horizontal</th><th>Salário BRL</th><th>Jornada</th></tr></thead><tbody>{role.levels.map(level => <tr key={level.code}><td>{level.code}</td><td>{level.vertical} / {level.horizontal}</td><td>{level.salary}</td><td>{level.monthlyHours}h</td></tr>)}</tbody></table></details>;
    })}
    {!rules.length && <p className="text-sm">Cadastre a regra JSON QUADRO_CARGOS no conjunto do regime para controlar vagas e enquadramento.</p>}
    <ErpPagination page={page} total={total} pageSize={20} label="cargos/vigências" previousHref={href(page - 1)} nextHref={href(page + 1)} />
  </div>;
}
