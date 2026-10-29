import Link from "next/link";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { inspectPositionPlan } from "@/lib/rh/position-plan";
import { ErpPageTitle } from "@/components/app-ui/erp/ErpPageTitle";
import { OperationalLinkPagination } from "@/components/app-ui/operational/OperationalListFrame";
import { RhTablePanel } from "../_components/RhTablePanel";
import { rhColumn } from "../_components/operational-columns";
import { db } from "@/db/client";
import { readPositionPlanRules } from "@/db/repositories/personnel-pages/catalog";

export const dynamic = "force-dynamic";
export default async function PositionPlanPage({ searchParams }: { searchParams: Promise<{ ruleId?: string; q?: string; page?: string }> }) {
   const context = await getTenantContextForModule("RH"); const database = context.database ?? db; const params = await searchParams;
   const rules = await readPositionPlanRules(database);
  const ruleId = params.ruleId || rules[0]?.id;
  let data: Awaited<ReturnType<typeof inspectPositionPlan>> | undefined;
  let error = "";
   if (ruleId) try { data = await inspectPositionPlan(database, ruleId); } catch (failure) { error = failure instanceof Error ? failure.message : "Falha na conferência do quadro."; }
  const names = new Map(data?.roles.map(role => [role.id, role.name]) || []);
  const q = (params.q || "").trim().toLocaleLowerCase("pt-BR");
  const filtered = (data?.rows || []).filter(row => !q || `${names.get(row.roleId) || row.roleId} ${row.startsAt}`.toLocaleLowerCase("pt-BR").includes(q));
  const total = filtered.length; const page = Math.min(Math.max(1, Number.parseInt(params.page || "1") || 1), Math.max(1, Math.ceil(total / 20)));
  return <div className="flex min-h-0 flex-1 flex-col gap-2 p-3"><ErpPageTitle title="Quadro de cargos, vagas e níveis" description="Ocupação temporal por contrato, agregada entre regimes do mesmo conjunto." action={<Link href="/rh/parametrizacoes">Parametrizações</Link>} />
    <Link href="/rh/quadro-cargos/historico-legal" className="text-xs underline">Histórico legal de criação, alterações e extinção de cargos</Link>
    <form className="flex flex-wrap gap-2 text-xs"><select name="ruleId" defaultValue={ruleId} className="h-8 rounded border px-2">{rules.map(rule => <option key={rule.id} value={rule.id}>{rule.ruleSet.name} · {rule.ruleSet.scope} · {rule.isActive ? "ativa" : "inativa"}</option>)}</select><input name="q" defaultValue={params.q} placeholder="Cargo / início de vigência" className="h-8 rounded border px-2" /><button className="rounded border px-3">Conferir</button></form>
    {error && <p role="alert" className="rounded border border-red-300 p-3 text-sm">{error}</p>}
    {data && <p className="rounded border bg-white p-3 text-xs">{data.rule.ruleSet.scope} · {data.plan.legalReference} · {total} registros no filtro. Ocupação máxima e disponibilidade mínima consideram toda a vigência, inclusive contratos futuros. Vagas de outros conjuntos não são somadas a este quadro.</p>}
    {filtered.slice((page - 1) * 20, page * 20).map(row => {
      const role = data!.plan.periods.find(period => period.startsAt === row.startsAt)!.roles.find(role => role.roleId === row.roleId)!;
      return <details key={`${row.startsAt}:${row.roleId}`} className="rounded border bg-white p-3 text-xs"><summary>{names.get(row.roleId) || row.roleId} · {row.startsAt} a {row.endsAt || "indeterminado"} · autorizadas {row.authorized} · pico ocupado {row.peakOccupied} · mínimo disponível {row.minimumAvailable}</summary><p>{role.classification} · CBO {role.cbo} · escolaridade {role.education}</p><p>{role.legalReference}</p><p>Atribuições: {role.duties}</p><p>Competências: {role.competencies}</p><p>Níveis inicial/final: {role.initialLevel} / {role.finalLevel} · GED: {role.documentIds.join(", ") || "sem documentos vinculados"}</p>
        <RhTablePanel title={`Níveis de ${names.get(row.roleId) || row.roleId}`} triggerLabel="Consultar níveis em tela cheia" description={`Vigência ${row.startsAt} a ${row.endsAt || "indeterminado"} · ${role.legalReference}`} preferenceId="rh-quadro-niveis"
          columns={[rhColumn("code", "Nível", 180, 100, "identifier"), rhColumn("vertical", "Vertical", 140, 90), rhColumn("horizontal", "Horizontal", 140, 90), rhColumn("salary", "Salário BRL", 180, 110, "text", "right"), rhColumn("hours", "Jornada", 130, 90, "text", "right")]}
          rows={role.levels.map(level => ({ id: level.code, label: level.code, values: { code: level.code, vertical: String(level.vertical), horizontal: String(level.horizontal), salary: String(level.salary), hours: `${level.monthlyHours}h` } }))} />
      </details>;
    })}
    {!rules.length && <p className="text-sm">Cadastre a regra JSON QUADRO_CARGOS no conjunto do regime para controlar vagas e enquadramento.</p>}
    <OperationalLinkPagination page={page} total={total} pathname="/rh/quadro-cargos" values={{ ruleId, q: params.q }} />
  </div>;
}
