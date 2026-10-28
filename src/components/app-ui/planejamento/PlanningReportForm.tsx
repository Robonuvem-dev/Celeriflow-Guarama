import { planningReportCatalog } from "@/lib/planejamento/report-catalog";
import type { PlanningContext } from "@/lib/planejamento/access";
import { pageReportOptions } from "@/db/repositories/planning-pages/management";
import { pageDatabase, pageUnitOptions } from "@/db/repositories/planning-pages/shared";
import { planningBasePath } from "@/lib/planejamento/policy";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PlanningReportSubmission } from "./PlanningReportSubmission";
import { PlanningLookupField } from "./PlanningLookupField";
import { canDecidePlanningLegally } from "@/lib/planejamento/access";
import { canPerformModuleOperation } from "@/lib/platform/tenant-context";

export async function PlanningReportForm({ context, instrumentId, creditId }: { context: PlanningContext; instrumentId: string; creditId?: string }) {
  const database = pageDatabase(context);
  const [{ pieces, dimensions, credits, sources }, units] = await Promise.all([
    pageReportOptions(database, context, instrumentId),
    pageUnitOptions(database, context, undefined, 20),
  ]);
  const selectedKind = pieces.find((piece) => piece.id === instrumentId)?.kind;
  const programs = [...new Map(dimensions.filter((row) => row.program).map((row) => [row.program!.id, row.program!])).values()];
  const actions = [...new Map(dimensions.filter((row) => row.action).map((row) => [row.action!.id, row.action!])).values()];
  const select = (name: string, label: string, values: { id: string; name: string }[], defaultValue?: string) => <label className="text-sm">{label}<select name={name} defaultValue={defaultValue} className="mt-1 w-full rounded border bg-background p-2"><option value="">Todos / não selecionar</option>{values.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>;
  return <Card><CardHeader><CardTitle>Catálogo de relatórios</CardTitle></CardHeader><CardContent><PlanningReportSubmission action={`${planningBasePath(context.jurisdiction)}/relatorios/emitir`}>
    <input type="hidden" name="instrumentIds" value={instrumentId} />
    <label className="text-sm">Relatório<select name="type" required className="mt-1 w-full rounded border bg-background p-2">{planningReportCatalog.map((row) => <option key={row.type} value={row.type}>{row.title}</option>)}</select></label>
    <label className="text-sm">Formato<select name="format" className="mt-1 w-full rounded border bg-background p-2"><option value="PDF">PDF</option><option value="CSV">CSV</option></select></label>
    {[["asOf", "Data de corte", "date"], ["from", "Data inicial das alterações", "date"], ["year", "Exercício (vazio: toda vigência)", "number"], ["version", "Versão (vazio: posição atual)", "number"], ["revenueDegree", "Grau da receita", "number"], ["nature", "Prefixo da natureza", "text"], ["functionCode", "Função", "text"], ["subfunctionCode", "Subfunção", "text"], ["product", "Produto", "text"]].map(([name, label, type]) => <label key={name} className="text-sm">{label}<input name={name} type={type} required={name === "asOf"} defaultValue={name === "asOf" ? new Date().toISOString().slice(0, 10) : undefined} className="mt-1 w-full rounded border bg-background p-2" /></label>)}
    <PlanningLookupField jurisdiction={context.jurisdiction} name="budgetUnitId" submitAs="unitId" label="Unidade" options={units} hidden={{ instrumentId }} /><PlanningLookupField jurisdiction={context.jurisdiction} name="resourceSourceId" submitAs="sourceId" label="Fonte" options={sources} hidden={{ instrumentId }} /><PlanningLookupField jurisdiction={context.jurisdiction} name="programId" label="Programa" options={programs} hidden={{ instrumentId }} /><PlanningLookupField jurisdiction={context.jurisdiction} name="actionId" label="Ação" options={actions} hidden={{ instrumentId }} /><PlanningLookupField jurisdiction={context.jurisdiction} name="creditId" label="Lote de crédito" value={creditId} options={credits.map((row) => ({ id: row.id, name: row.creditRequest.number }))} hidden={{ instrumentId }} />
    {select("origin", "Origem dos recursos", [{ id: "CANCELLATION", name: "Anulação" }, { id: "SURPLUS", name: "Superávit" }, { id: "EXCESS", name: "Excesso de arrecadação" }, { id: "LOAN", name: "Operação de crédito" }])}
    <label className="text-sm">Agrupamento<select name="groupBy" className="mt-1 w-full rounded border bg-background p-2">{[["ENTITY", "Entidade"], ["CONSOLIDATED", "Consolidado"], ["UNIT", "Órgão/unidade"], ["PROGRAM", "Programa"], ["ACTION", "Ação"], ["FUNCTION", "Função"], ["SUBFUNCTION", "Subfunção"], ["SOURCE", "Fonte"], ["NATURE", "Natureza"]].map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
    {select("transferPresentation", "Transferências", [{ id: "GROSS", name: "Valores brutos" }, { id: "NET", name: "Eliminar transferências internas conciliadas" }], "GROSS")}
    <PlanningLookupField jurisdiction={context.jurisdiction} name="targetInstrumentId" submitAs="targetId" label="Peça de comparação" options={pieces.filter((piece) => piece.id !== instrumentId).map((piece) => ({ id: piece.id, name: `${piece.governmentEntity.name} · ${piece.title}` }))} />
    <PlanningLookupField jurisdiction={context.jurisdiction} name="sourceInstrumentId" submitAs="additionalInstrumentIds" label="Consolidar peças adicionais do mesmo tipo" multiple options={pieces.filter((piece) => piece.id !== instrumentId && piece.kind === selectedKind).map((piece) => ({ id: piece.id, name: `${piece.governmentEntity.name} · ${piece.title}` }))} />
    {canDecidePlanningLegally(context) && canPerformModuleOperation(context.user, "TRANSPARENCIA", "create") && <div className="space-y-2 rounded border p-3 text-sm md:col-span-2"><label className="flex items-center gap-2"><input type="checkbox" name="publishSimultaneous" value="true" />Publicar simultaneamente o documento para conferência no portal</label><p className="text-xs text-muted-foreground">A publicação conserva o aviso de leiaute não homologado. Somente arquivos confirmados e peças publicadas no fluxo legal ficam acessíveis.</p><input name="publicationReason" placeholder="Fundamento da publicação" className="w-full rounded border p-2" /></div>}
    <button className="rounded border bg-primary p-2 text-sm text-primary-foreground">Gerar documento</button>
  </PlanningReportSubmission></CardContent></Card>;
}
