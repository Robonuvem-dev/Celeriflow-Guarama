import Link from "next/link";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { managedPortalPolicySchemas } from "@/lib/portal-servidor/management";
import { generatedArtifactSchema } from "@/lib/portal-servidor/generated-documents";
import { ErpPageTitle } from "@/components/app-ui/erp/ErpPageTitle";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";
import { PortalPolicyForm, FunctionalSourceForm } from "./ManagementForms";
import { db } from "@/db/client";
import { readPersonnelBudgetUnits, readActiveRuleSets, readPortalRules } from "@/db/repositories/personnel-pages/catalog";
import { readGeneratedFunctionalDocuments } from "@/db/repositories/personnel-pages/requests";
export const dynamic = "force-dynamic";
export default async function PortalManagement({ searchParams }: { searchParams: Promise<{ edit?: string; new?: string; page?: string; kind?: string }> }) {
  const context = await getTenantContextForModule("RH"), params = await searchParams;
  const units = await readPersonnelBudgetUnits(context.database ?? db, context.user);
  const ruleSets = await readActiveRuleSets(context.database ?? db);
  const rules = await readPortalRules(context.database ?? db, "management");
  const policies = rules.flatMap(rule => { const value = rule.value as { origin?: keyof typeof managedPortalPolicySchemas; budgetUnitId?: string }; const schema = value.origin && managedPortalPolicySchemas[value.origin]; const unitId = value.budgetUnitId || rule.unit; return schema && schema.safeParse(value).success && unitId && units.some(unit => unit.id === unitId) ? [{ rule, kind: value.origin!, unitId }] : []; });
  const selected = policies.find(policy => policy.rule.id === params.edit);
  const emissions = await readGeneratedFunctionalDocuments(context.database ?? db);
  const visible = emissions.flatMap(event => { const artifact = generatedArtifactSchema.parse(event.payload); return units.some(unit => unit.id === artifact.policy.budgetUnitId) ? [{ event, artifact }] : []; });
  const filtered = visible.filter(row => !params.kind || row.artifact.input.kind === params.kind);
  const page = Math.min(Math.max(1, Number.parseInt(params.page || "1") || 1), Math.max(1, Math.ceil(filtered.length / 20)));
  const href = (value: number) => `?${new URLSearchParams({ page: String(value), kind: params.kind || "" })}`;
  return <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3"><ErpPageTitle title="Gestão do Portal funcional" description="Modelos, totalizadores, marcação, campanhas, fontes de pagamento, PPP e liberação/revogação de emissões." action={<Link href="?new=1">Nova configuração</Link>} />
    {params.new || selected ? <PortalPolicyForm key={selected?.rule.id || "new"} units={units} ruleSets={ruleSets} values={selected ? { id: selected.rule.id, code: selected.rule.code, name: selected.rule.name, ruleSetId: selected.rule.ruleSetId, kind: selected.kind, budgetUnitId: selected.unitId, isActive: selected.rule.isActive, value: selected.rule.value } : undefined} /> : <section className="rounded border bg-white p-3 text-xs">{policies.map(({ rule, kind }) => <p key={rule.id}><Link href={`?edit=${rule.id}`} className="font-semibold text-emerald-800 underline">{rule.name}</Link> · {kind} · {rule.isActive ? "Disponível" : "Indisponível"}</p>)}{!policies.length && <p>Nenhuma configuração gerenciada no seu escopo.</p>}</section>}
    <FunctionalSourceForm command="RETENCAO" title="Retenção dos uploads sem requerimento concluído (horas)" example={{ hours: "Informe o parâmetro de retenção aprovado" }} />
    <FunctionalSourceForm command="PAGAMENTO_INDIVIDUAL" title="Conciliação individual para o informe anual — exige RH e Financeiro" example={{ statementId: "", proofVersionId: "", reference: "", allocations: [{ paymentId: "", amount: "" }] }} />
    <FunctionalSourceForm command="CALCULO_ESPECIAL" title="Conferência definitiva de férias/rescisão — documento de cálculo assinado, valores de origem preservados" example={{ statementId: "", proofVersionId: "", reference: "" }} />
    <FunctionalSourceForm command="PPP_TECNICO" title="Reconhecimento técnico PPP — exige emissão/alteração SST e fonte assinada" example={{ employeeId: "", budgetUnitId: "", from: "", until: "", proofVersionId: "", nit: "", cnae: "", establishmentAddress: "", occupations: [{ functionalPeriodId: "", cbo: "", activities: "" }], groups: [{ programGroupId: "", programVersion: 1, risks: [{ sourceRiskIndex: 0, type: "", code: "", agent: "", intensity: "", unit: "", technique: "", epcEffective: false, epiEffective: false, ca: [], legalReference: "" }] }] }} />
    <FunctionalSourceForm command="EMISSAO" title="Gerenciar emissão — REVOGAR, LIBERAR_MARGEM ou SOLICITAR_ASSINATURA" example={{ id: "", operation: "LIBERAR_MARGEM", reason: "" }} />
    <section className="rounded border bg-white p-3 text-xs"><h2 className="mb-2 font-semibold">Emissões no escopo — {filtered.length} no filtro</h2><form className="mb-3 flex gap-2"><select name="kind" defaultValue={params.kind || ""} aria-label="Tipo da emissão" className="h-8 rounded border px-2"><option value="">Todos os tipos</option>{[...new Set(visible.map(row => row.artifact.input.kind))].map(kind => <option key={kind}>{kind}</option>)}</select><button className="rounded border px-3">Filtrar</button></form>{filtered.slice((page - 1) * 20, page * 20).map(({ event, artifact }) => <p key={event.id} className="mb-2">{artifact.policy.title} · {artifact.employeeId} · {artifact.issuedAt.slice(0, 10)} · {event.status}<br /><span className="font-mono">{event.id}</span></p>)}<ErpPagination page={page} total={filtered.length} pageSize={20} label="emissões" previousHref={href(page - 1)} nextHref={href(page + 1)} /></section>
  </div>;
}
