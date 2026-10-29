import Link from "next/link";
import { Landmark } from "lucide-react";
import { notFound } from "next/navigation";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PlanningWorkspace } from "./PlanningWorkspace";
import { PlanningList, planningColumn as col } from "./PlanningList";
import { OperationalFilters } from "@/components/app-ui/operational/OperationalListFrame";
import styles from "@/components/app-ui/operational/operational.module.css";
import { PlanningForm, type PlanningField } from "./PlanningForm";
import { PlanningMovementHistory } from "./PlanningMovementHistory";
import { PlanningVersionPage } from "./PlanningVersionPage";
import { planningManagementSections } from "./PlanningManagementPage";
import { getPlanningContext } from "@/lib/planejamento/access";
import { pageDatabase, pageEntityOptions, pageUnitOptions } from "@/db/repositories/planning-pages/shared";
import { pageCounterparties, pageEntities, pageParentOptions, pagePrograms } from "@/db/repositories/planning-pages/navigation";
import { pageClassifiers, pagePublishedCatalogs } from "@/db/repositories/planning-pages/catalogs";
import { getPlanningInstrument, listPlanningInstruments } from "@/lib/planejamento/service";
import { planningBasePath, type PlanningJurisdiction } from "@/lib/planejamento/policy";
import { canPerformModuleOperation, isSystemAdministrator } from "@/lib/platform/tenant-context";

type Filters = { q?: string; page?: string; entityId?: string };
const labels = { ppa: "Plano Plurianual — PPA", ldo: "Lei de Diretrizes Orçamentárias — LDO", loa: "Lei Orçamentária Anual — LOA" };
const money = (value: { toString(): string }) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value.toString()));
const statusLabel = (status: string | undefined) => ({ DRAFT: "Em elaboração", SUBMITTED: "Encaminhada", APPROVED: "Aprovada", SANCTIONED: "Sancionada", PUBLISHED: "Publicada" }[status ?? ""] ?? status);
const field = (name: string, label: string, extra: Partial<PlanningField> = {}): PlanningField => ({
  name, label, ...extra,
  ...(["originalValue", "baseValue", "estimatedValue", "compensationValue"].includes(name) ? { type: "money" as const } : {}),
});

export async function PlanningDashboard({ jurisdiction }: { jurisdiction: PlanningJurisdiction }) {
  const context = await getPlanningContext(jurisdiction);
  const base = planningBasePath(jurisdiction);
  const data = await listPlanningInstruments(context, {});
  return <PageFrame className="space-y-3 p-3">
    <PageHeader title="Planejamento e Orçamento" icon={<Landmark className="size-4 text-indigo-700" />} />
    <p className="text-sm text-muted-foreground">{jurisdiction === "LEGISLATIVE" ? "Câmara Municipal" : "Prefeitura Municipal"} · Elaboração dos instrumentos e acompanhamento orçamentário</p>
    <div className="grid gap-3 md:grid-cols-3">{Object.entries(labels).map(([key, label]) => <Link href={`${base}/${key}`} key={key} className="rounded-lg border bg-card p-4 transition-colors hover:bg-accent"><h2 className="font-semibold">{label}</h2><p className="mt-2 text-xs text-muted-foreground">Consultar peças, previsões, programas e metas</p></Link>)}</div>
    <Card><CardHeader><CardTitle>Instrumentos cadastrados</CardTitle></CardHeader><CardContent><p className="text-2xl font-semibold">{data.total}</p><Link href={`${base}/entidades`} className="text-sm text-indigo-700 underline">Entidades e unidades orçamentárias</Link></CardContent></Card>
  </PageFrame>;
}

export async function PlanningEntitiesPage({ jurisdiction }: { jurisdiction: PlanningJurisdiction }) {
  const context = await getPlanningContext(jurisdiction);
  const admin = isSystemAdministrator(context.user) && canPerformModuleOperation(context.user, "PLANEJAMENTO", "update");
  const { entities, allEntities, units } = await pageEntities(pageDatabase(context), context, admin);
  return <PageFrame className="space-y-3 p-3"><PageHeader title="Entidades e unidades orçamentárias" />
    <Card><CardContent className="pt-3">{entities.map((entity) => <section key={entity.id} className="border-b py-3"><h2 className="font-semibold">{entity.name}</h2><p className="text-sm text-muted-foreground">{entity.planningUnits.map((unit) => unit.budgetUnit.name).join(" · ") || "Nenhuma unidade vinculada"}</p></section>)}{!entities.length && <p className="text-sm">Nenhuma entidade autorizada vinculada nesta área.</p>}</CardContent></Card>
    {admin && <Card><CardHeader><CardTitle>Vincular entidade e unidade</CardTitle></CardHeader><CardContent><PlanningForm jurisdiction={jurisdiction} operation="scope" fields={[field("governmentEntityId", "Entidade", { type: "select", options: allEntities }), field("budgetUnitId", "Unidade orçamentária", { type: "select", options: units })]} /></CardContent></Card>}
  </PageFrame>;
}

export async function PlanningInstrumentsPage({ jurisdiction, kind, filters }: { jurisdiction: PlanningJurisdiction; kind: string; filters: Filters }) {
  if (!Object.hasOwn(labels, kind)) notFound();
  const key = kind as keyof typeof labels;
  const context = await getPlanningContext(jurisdiction);
  const base = `${planningBasePath(jurisdiction)}/${kind}`;
  const [data, entities, parents] = await Promise.all([
    listPlanningInstruments(context, { ...filters, kind: kind.toUpperCase() }),
    pageEntityOptions(pageDatabase(context), context, 20),
    kind === "ppa" ? Promise.resolve([]) : pageParentOptions(pageDatabase(context), context, kind === "ldo" ? "PPA" : "LDO"),
  ]);
  const fields: PlanningField[] = [field("governmentEntityId", "Entidade", { type: "select", options: entities }), field("code", "Código / número"), field("title", "Título"), field("startYear", "Exercício inicial", { type: "number" }), field("endYear", "Exercício final", { type: "number" }), field("revenueDegree", "Grau da receita", { type: "number", value: "6" }), field("expenseLevel", "Detalhamento da despesa", { type: "select", value: "ELEMENT_SOURCE", options: [{ id: "ELEMENT_SOURCE", name: "Elemento e fonte de recursos" }, { id: "SOURCE", name: "Fonte de recursos" }] }), field("projectNumber", "Projeto de lei", { required: false }), field("legalText", "Texto jurídico", { type: "textarea", required: false })];
  const catalogs = await pagePublishedCatalogs(pageDatabase(context));
  fields.push(field("expenseDegree", "Grau da despesa", { type: "number", value: "6" }), field("catalogVersionId", "Catálogo normativo vigente", { type: "select", required: false, options: catalogs.map((catalog) => ({ id: catalog.id, name: `${catalog.year} · ${catalog.label}` })) }));
  if (kind !== "ppa") fields.push(field("parentId", kind === "ldo" ? "PPA vinculado" : "LDO vinculada", { type: "select", options: parents.map((row) => ({ id: row.id, name: `${row.governmentEntity.name} · ${row.title}` })) }));
  return <PlanningWorkspace><PageHeader title={labels[key]} />
    <section data-table-area="instruments" aria-label={labels[key]}><PlanningList id={`planning:${jurisdiction}:instruments:${kind}`} label={labels[key]} pathname={base} page={data.page} total={data.total} values={{ q: filters.q, entityId: filters.entityId }}
      toolbar={<><form method="get" className={styles.searchForm}><input aria-label="Buscar instrumento" name="q" defaultValue={filters.q} className={styles.searchInput} /><input type="hidden" name="entityId" value={filters.entityId ?? ""} /><button className={styles.dialogButton}>Consultar</button><Link href={base} className={styles.dialogButton}>Limpar</Link></form><OperationalFilters activeCount={filters.entityId ? 1 : 0}><form method="get" className={styles.filterFields}><input type="hidden" name="q" value={filters.q ?? ""} /><label>Entidade<select name="entityId" defaultValue={filters.entityId}><option value="">Todas autorizadas</option>{entities.map(entity => <option key={entity.id} value={entity.id}>{entity.name}</option>)}</select></label><button className={styles.dialogButton}>Aplicar filtros</button><Link href={base}>Limpar</Link></form></OperationalFilters></>}
      columns={[col("code", "Código", 80, 110, { type: "identifier" }), col("title", "Instrumento", 160, 340), col("entity", "Entidade", 140, 260), col("period", "Vigência", 90, 110), col("status", "Situação", 110, 140, { type: "status" }), col("actions", "Ações", 70, 80, { type: "actions", details: "none", resizable: false })]}
      rows={data.records.map(record => ({ id: record.id, label: record.title, values: { code: record.code, title: record.title, entity: record.governmentEntity.name, period: `${record.startYear}–${record.endYear}`, status: statusLabel(record.multiYearPlan?.status ?? record.budgetGuideline?.status ?? record.annualBudgetLaw?.status) ?? "—" }, actions: <Link className={styles.dialogButton} href={`${base}/${record.id}`}>Abrir</Link> }))} emptyMessage="Nenhuma peça encontrada." /></section>
    {canPerformModuleOperation(context.user, "PLANEJAMENTO", "create") && <Card><CardHeader><CardTitle>Nova peça orçamentária</CardTitle></CardHeader><CardContent><PlanningForm jurisdiction={jurisdiction} operation="instrument" hidden={{ kind: kind.toUpperCase() }} redirectTo={base} fields={fields} /></CardContent></Card>}
  </PlanningWorkspace>;
}

export async function PlanningDetailPage({ jurisdiction, kind, id, page, asOf, movementPage, version }: { jurisdiction: PlanningJurisdiction; kind: string; id: string; page?: string; asOf?: string; movementPage?: string; version?: string }) {
  const context = await getPlanningContext(jurisdiction);
  if (version) return <PlanningVersionPage context={context} id={id} kind={kind} number={Number(version)} asOf={asOf} pageInput={page} />;
  const data = await getPlanningInstrument(context, id, page, asOf);
  if (data.instrument.kind.toLowerCase() !== kind) notFound();
  const base = `${planningBasePath(jurisdiction)}/${kind}`;
  const ppaId = data.instrument.multiYearPlanId ?? data.instrument.parent?.multiYearPlanId ?? data.instrument.parent?.parent?.multiYearPlanId;
  const database = pageDatabase(context);
  const [units, { sources, revenues, expenses }, programs, counterparties] = await Promise.all([
    pageUnitOptions(database, context, data.instrument.governmentEntityId, 20),
    pageClassifiers(database, 20),
    ppaId ? pagePrograms(database, ppaId) : Promise.resolve([]),
    pageCounterparties(database, data.instrument.governmentEntityId),
  ]);
  const canCreate = canPerformModuleOperation(context.user, "PLANEJAMENTO", "create") && (data.instrument.multiYearPlan?.status ?? data.instrument.budgetGuideline?.status ?? data.instrument.annualBudgetLaw?.status) === "DRAFT";
  const canRevise = canPerformModuleOperation(context.user, "PLANEJAMENTO", "update") && ["SANCTIONED", "PUBLISHED"].includes(data.instrument.multiYearPlan?.status ?? data.instrument.budgetGuideline?.status ?? data.instrument.annualBudgetLaw?.status ?? "");
  const common = [field("code", "Código"), field("description", "Descrição"), field("year", "Exercício", { type: "number", value: String(data.instrument.startYear) }), field("budgetUnitId", "Unidade orçamentária", { type: "select", options: units }), field("resourceSourceId", "Fonte de recursos", { type: "select", options: sources }), field("originalValue", "Valor previsto (R$)", { type: "number", step: "0.01" })];
  const form = (title: string, operation: string, fields: PlanningField[], hidden: Record<string, string> = {}) => canCreate && <details className="rounded-lg border bg-card p-3"><summary className="cursor-pointer text-sm font-semibold">{title}</summary><div className="pt-3"><PlanningForm jurisdiction={jurisdiction} operation={operation} hidden={{ instrumentId: id, ...hidden }} fields={fields} /></div></details>;
  return <PlanningWorkspace><Link href={base} className="text-xs text-indigo-700 underline">← {labels[kind as keyof typeof labels]}</Link><PageHeader title={data.instrument.title} /><p className="text-xs text-muted-foreground">{data.instrument.governmentEntity.name} · {data.instrument.startYear}–{data.instrument.endYear} · {statusLabel(data.instrument.multiYearPlan?.status ?? data.instrument.budgetGuideline?.status ?? data.instrument.annualBudgetLaw?.status)}</p>
    <nav className="flex flex-wrap gap-2">{Object.entries(planningManagementSections).map(([key, label]) => <Link key={key} href={`${base}/${id}/gestao/${key}`} className="rounded border px-3 py-1 text-xs">{label}</Link>)}</nav>
    <p className="text-xs text-muted-foreground">Valores originais acrescidos das alterações legais vigentes na data selecionada. O histórico lista também os atos posteriores ao corte.</p>
    <div className="grid gap-2 md:grid-cols-3">{data.revisedSums.map((sum) => <div key={sum.kind} className="rounded border bg-card p-3"><p className="text-xs text-muted-foreground">{sum.kind === "REVENUE" ? "Receita prevista" : sum.kind === "EXPENSE" ? "Despesa fixada" : "Transferências"}</p><p className="font-semibold">{money(sum.value)}</p></div>)}</div>
    <section data-table-area="lines" aria-label="Previsões e metas"><PlanningList id={`planning:${jurisdiction}:lines`} label="Previsões e metas por exercício" pathname={`${base}/${id}`} page={data.page} total={data.total} values={{ asOf: data.asOf, movementPage: movementPage ?? "1" }}
      toolbar={<form method="get" className={styles.searchForm}><label className="flex items-center gap-2">Valores vigentes até<input aria-label="Valores vigentes até" name="asOf" type="date" defaultValue={data.asOf} required className={styles.searchInput} /></label><button className={styles.dialogButton}>Consultar</button></form>}
      columns={[col("code", "Código", 70, 100), col("description", "Descrição", 110, 240), col("kind", "Tipo", 70, 90), col("year", "Ano", 50, 65), col("unit", "Unidade", 100, 170), col("source", "Fonte", 100, 170), col("target", "Meta física", 90, 110, { align: "right" }), col("productUnit", "Unid. produto", 105, 130), col("original", "Original", 100, 130, { align: "right" }), col("revised", "Vigente no corte", 130, 170, { align: "right" })]}
      rows={data.lines.map(line => ({ id: line.id, label: line.code, values: { code: line.code, description: line.description, kind: line.kind === "REVENUE" ? "Receita" : "Despesa", year: String(line.year), unit: line.budgetUnit.name, source: line.resourceSource.name, target: line.physicalTarget.toString(), productUnit: line.productUnit ?? "—", original: money(line.originalValue), revised: money(line.revisedValue) } }))} emptyMessage="Nenhuma previsão cadastrada." /></section>
    {kind === "ppa" && form("Cadastrar programa, objetivo e indicador", "program", [field("code", "Código"), field("name", "Programa"), field("type", "Tipo", { type: "select", options: ["Finalístico", "Gestão", "Serviço ao Estado"].map((name) => ({ id: name, name })) }), field("origin", "Origem"), field("objectiveCode", "Código do objetivo"), field("objective", "Objetivo", { type: "textarea" }), field("guidelines", "Diretrizes", { type: "textarea" }), field("targetAudience", "Público-alvo"), field("financing", "Financiamento"), field("managerName", "Gerente responsável"), field("indicatorName", "Indicador"), field("indicatorUnit", "Unidade do indicador"), field("baselineValue", "Valor de referência", { type: "number", step: "any" }), field("targetValue", "Meta do indicador", { type: "number", step: "any" })])}
    {kind === "ppa" && form("Cadastrar ação", "action", [field("programId", "Programa", { type: "select", options: programs.map((p) => ({ id: p.id, name: p.name })) }), field("code", "Código"), field("name", "Ação"), field("type", "Tipo", { type: "select", options: ["Projeto", "Atividade", "Operação Especial"].map((name) => ({ id: name, name })) })])}
    {form("Cadastrar receita prevista", "line", [...common, field("revenueNatureId", "Natureza de receita", { type: "select", options: revenues })], { kind: "REVENUE" })}
    {form("Ratear receita entre fontes", "allocatedRevenue", common.filter((row) => row.name !== "resourceSourceId").concat([field("revenueNatureId", "Natureza de receita", { type: "select", options: revenues })]))}
    {form("Cadastrar transferência financeira prevista", "transfer", [...common, field("destinationEntityId", "Entidade contraparte", { type: "select", options: counterparties }), field("transferDirection", "Direção", { type: "select", options: [{ id: "OUT", name: "Transferência concedida" }, { id: "IN", name: "Transferência recebida" }] })])}
    {form("Cadastrar despesa e meta física", "line", [...common, field("expenseNatureId", "Natureza de despesa", { type: "select", options: expenses, required: data.instrument.expenseLevel !== "SOURCE" || kind === "loa" }), field("programId", "Programa", { type: "select", options: programs.map((p) => ({ id: p.id, name: p.name })) }), field("actionId", "Ação", { type: "select", options: programs.flatMap((p) => p.actions.map((a) => ({ id: a.id, name: `${p.name} · ${a.name}` }))) }), field("functionCode", "Função (2 dígitos)"), field("subfunctionCode", "Subfunção (3 dígitos)"), field("product", "Produto"), field("productUnit", "Unidade do produto"), field("physicalTarget", "Meta física", { type: "number", step: "0.0001", value: "0" })], { kind: "EXPENSE" })}
    {form("Cadastrar memória de cálculo", "memory", [field("title", "Título"), field("normativeReference", "Referência normativa"), field("methodology", "Metodologia", { type: "textarea" }), field("assumptions", "Premissas", { type: "textarea" }), field("baseValue", "Valor base (R$)", { type: "number", step: "0.01" }), field("rate", "Variação (%)", { type: "number", step: "0.000001" })])}
    {data.memories.map((memory) => <article key={memory.id} className="rounded border bg-card p-3"><h2 className="text-sm font-semibold">{memory.title}</h2><p className="text-xs">{memory.normativeReference} · Base {money(memory.baseValue)} · Variação {memory.rate.toString()}% · Resultado {money(memory.resultValue)}</p><p className="mt-2 whitespace-pre-wrap text-xs">{memory.methodology}<br />{memory.assumptions}</p></article>)}
    {form("Cadastrar renúncia e compensação", "waiver", [field("year", "Exercício", { type: "number", value: String(data.instrument.startYear) }), field("description", "Descrição"), field("legalReference", "Fundamento legal"), field("modality", "Modalidade"), field("estimatedValue", "Renúncia estimada (R$)", { type: "number", step: "0.01" }), field("compensation", "Medida de compensação", { type: "textarea" }), field("compensationValue", "Compensação prevista (R$)", { type: "number", step: "0.01" }), field("methodology", "Metodologia", { type: "textarea" })])}
    {data.waivers.map((waiver) => <article key={waiver.id} className="rounded border bg-card p-3"><h2 className="text-sm font-semibold">{waiver.description} · {waiver.year}</h2><p className="text-xs">{waiver.legalReference} · Renúncia {money(waiver.estimatedValue)} · Compensação {money(waiver.compensationValue)}</p><p className="mt-2 whitespace-pre-wrap text-xs">{waiver.compensation}</p></article>)}
    {canPerformModuleOperation(context.user, "PLANEJAMENTO", "update") && ["SANCTIONED", "PUBLISHED"].includes(data.instrument.multiYearPlan?.status ?? data.instrument.budgetGuideline?.status ?? data.instrument.annualBudgetLaw?.status ?? "") && <Card><CardHeader><CardTitle>Registrar alteração legal</CardTitle></CardHeader><CardContent><PlanningForm jurisdiction={jurisdiction} operation="movement" hidden={{ instrumentId: id }} fields={[field("lineId", "Previsão da página atual", { type: "select", options: data.lines.map((line) => ({ id: line.id, name: `${line.code} · ${line.description}` })) }), field("effectiveAt", "Data de vigência do ato", { type: "date" }), field("direction", "Tipo de alteração", { type: "select", options: [{ id: "INCREASE", name: "Acréscimo" }, { id: "DECREASE", name: "Redução" }] }), field("amount", "Valor (R$)", { type: "money" }), field("legalActNumber", "Número do ato"), field("reason", "Motivo"), field("legalText", "Texto jurídico", { type: "textarea" })]} /></CardContent></Card>}
    <section data-table-area="movements" aria-label="Alterações legais"><PlanningMovementHistory context={context} instrumentId={id} pathname={`${base}/${id}`} asOf={data.asOf} page={movementPage} linePage={data.page} /></section>
    {canRevise && <details className="rounded border bg-card p-3"><summary className="cursor-pointer text-sm font-semibold">Incluir natureza de receita não prevista no orçamento aprovado</summary><div className="pt-3"><PlanningForm jurisdiction={jurisdiction} operation="approvedLine" hidden={{ instrumentId: id, kind: "REVENUE" }} fields={[...common, field("revenueNatureId", "Natureza de receita", { type: "select", options: revenues }), field("effectiveAt", "Vigência do ato", { type: "date" }), field("legalActNumber", "Número do ato"), field("reason", "Justificativa", { type: "textarea" }), field("legalText", "Texto jurídico", { type: "textarea" })]} /></div></details>}
    {canRevise && kind === "loa" && <details className="rounded border bg-card p-3"><summary className="cursor-pointer text-sm font-semibold">Preparar nova dotação para crédito especial</summary><p className="py-2 text-xs text-muted-foreground">A classificação inicia sem saldo e recebe recursos somente após a efetivação do crédito.</p><PlanningForm jurisdiction={jurisdiction} operation="approvedLine" hidden={{ instrumentId: id, kind: "EXPENSE", originalValue: "0" }} fields={[...common.filter((row) => row.name !== "originalValue"), field("expenseNatureId", "Natureza da despesa", { type: "select", options: expenses }), field("programId", "Programa", { type: "select", options: programs.map((row) => ({ id: row.id, name: row.name })) }), field("actionId", "Ação", { type: "select", options: programs.flatMap((row) => row.actions.map((action) => ({ id: action.id, name: `${row.name} · ${action.name}` }))) }), field("functionCode", "Função"), field("subfunctionCode", "Subfunção"), field("product", "Produto"), field("productUnit", "Unidade do produto"), field("physicalTarget", "Meta física", { type: "number", step: "0.0001" }), field("effectiveAt", "Data do ato", { type: "date" }), field("legalActNumber", "Número do ato"), field("reason", "Justificativa", { type: "textarea" }), field("legalText", "Texto jurídico", { type: "textarea" })]} /></details>}
  </PlanningWorkspace>;
}
