import { and, asc, desc, eq, getTableColumns, gt, gte, inArray, isNull, ne, notInArray, or, sql, sum } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import * as f from "@/db/schema/fleet";
import { departments, employees } from "@/db/schema/administration";
import { assets } from "@/db/schema/assets";
import { suppliers, companies } from "@/db/schema/registry";
import { people } from "@/db/schema/people";
import { materials, materialStocks, materialMovements, warehouses } from "@/db/schema/assets-stock";
import { countFleetRecords, fleetDatabase, fleetDepartmentFilter, fleetUnitScope, readFleetAssetEvents, readFleetUnit, readFleetUnits } from "@/db/repositories/fleet/records";
import { fleetDates, fleetSearch } from "@/db/repositories/fleet/filters";
import type { FleetContext as AppContext } from "@/lib/contracts/fleet";
import { dateOnly, labels, todayInBrazil, type FleetArea, type FleetQuery } from "./contract";
import { fleetScope } from "./service";

export type FleetColumn = { key: string; label: string; numeric?: boolean };
export type FleetRow = { id: string; unitId?: string; cells: Record<string, string>; detail: Record<string, string>; data?: Record<string, string>; status?: string; actions: string[] };
export type FleetList = { rows: FleetRow[]; columns: FleetColumn[]; total: number; page: number; pageSize: number; amount: string | null; missingCosts: number; quantities: Record<string, string> };
export type ReferenceOption = { id: string; label: string };
export const areaTitles: Record<FleetArea, string> = { frota: "Frota", utilizacao: "Utilização", rotas: "Rotas", planos: "Planos de manutenção", ordens: "Ordens de serviço", manutencoes: "Manutenções efetuadas", consumos: "Abastecimentos e lubrificantes", gastos: "Gastos realizados", seguros: "Seguros", obrigacoes: "Obrigações", documentos: "Documentos", ocorrencias: "Ocorrências", relatorios: "Relatórios" };
const day = (v: Date | null | undefined) => v ? v.toISOString().slice(0, 10).split("-").reverse().join("/") : "—";
const dateTime = (v: Date) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(v);
export const money = (v: Decimal | null | undefined) => v == null ? "Não informado" : `R$ ${v.toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
const label = (v: string) => labels[v] || v;
const unitLabel = (v: { code: string; name: string }) => `${v.code} · ${v.name}`;
const str = (v: unknown) => v instanceof Date ? v.toISOString().slice(0, 10) : v == null ? "" : String(v);
const dataStrings = (v: object) => Object.fromEntries(Object.entries(v).map(([k, value]) => [k, str(value)]));
const c = (key: string, label: string, numeric = false): FleetColumn => ({ key, label, numeric });
const common = [c("unit", "Unidade da frota"), c("date", "Data")];
function row(id: string, cells: Record<string, string>, detail: Record<string, string>, actions: string[], unitId?: string, data?: Record<string, string>, status?: string): FleetRow { return { id, cells, detail, actions, unitId, data, status }; }
function documentStatus(v: { kind: string; status: string; dueAt: Date; startsAt: Date | null }) {
  const today = dateOnly(todayInBrazil());
  if (v.status === "CUMPRIDA") return "Cumprida";
  if (v.dueAt < today) return "Vencido";
  if (v.kind === "SEGURO") return v.startsAt && v.startsAt > today ? "Vigência futura" : "Vigente";
  return "Pendente";
}

export async function queryFleet(context: AppContext, q: FleetQuery, full = false): Promise<FleetList> {
  const db = fleetDatabase(context), scope = fleetScope(context);
  const area = q.area === "relatorios" ? ({ frota: "frota", vencimentos: "documentos", abastecimentos: "consumos", gastos: "gastos", manutencoes: "manutencoes" } as const)[q.report] : q.area;
  const unit = and(fleetDepartmentFilter(scope), q.unitId ? eq(f.fleetUnits.id, q.unitId) : undefined, q.unitIds ? inArray(f.fleetUnits.id, q.unitIds.split(",")) : undefined, q.category ? eq(f.fleetUnits.category, q.category) : undefined);
  const unitIds = db.select({ id: f.fleetUnits.id }).from(f.fleetUnits).where(unit);
  const byUnitSearch = db.select({ id: f.fleetUnits.id }).from(f.fleetUnits).where(fleetSearch(q.q, f.fleetUnits.code, f.fleetUnits.name, f.fleetUnits.plate));
  let total = 0, rows: FleetRow[] = [], columns: FleetColumn[] = [], amount: string | null = null, missingCosts = 0, quantities: Record<string, string> = {};
  let page = q.page;
  const paginate = (count: number) => { total = count; page = Math.min(q.page, Math.max(1, Math.ceil(count / q.pageSize))); return { offset: full ? 0 : (page - 1) * q.pageSize, limit: full ? 2147483647 : q.pageSize }; };
  if (area === "frota") {
    const where = and(unit, q.area === "relatorios" ? fleetDates(f.fleetUnits.createdAt, q.from, q.to) : undefined, q.status ? eq(f.fleetUnits.status, q.status) : undefined, fleetSearch(q.q, f.fleetUnits.code, f.fleetUnits.name, f.fleetUnits.plate));
    const paging = paginate(await countFleetRecords(db, f.fleetUnits, where));
    const records = await readFleetUnits(db, where, { ...paging, byId: true });
    const events = await readFleetAssetEvents(db, records.map(v => v.id));
    const items = records.map(v => ({ ...v, assetEvents: events.filter(e => e.unitId === v.id) }));
    const departmentRows = await db.select({ id: departments.id, name: departments.name }).from(departments).where(inArray(departments.id, [...new Set(items.flatMap(v => v.departmentId ? [v.departmentId] : []))]));
    const departmentNames = new Map(departmentRows.map(d => [d.id, d.name]));
    columns = [c("code", "Código / placa"), c("name", "Descrição"), c("category", "Categoria"), c("department", "Setor"), c("status", "Situação")];
    rows = items.map(v => row(v.id, { code: `${v.code}${v.plate ? ` / ${v.plate}` : ""}`, name: v.name, category: label(v.category), department: departmentNames.get(v.departmentId || "") || "Sem setor", status: label(v.status) }, {
      "Código": v.code, "Descrição operacional": v.name, "Categoria": label(v.category), "Situação efetiva": label(v.status), "Disponibilidade operacional": label(v.operationalStatus), "Setor · Organograma / Patrimônio": departmentNames.get(v.departmentId || "") || "Sem setor", "Placa": v.plate || "Não aplicável / não informada", "RENAVAM": v.renavam || "—", "Marca / modelo / ano": [v.asset?.brand || v.brand, v.asset?.model || v.model, v.year].filter(Boolean).join(" / ") || "—", "Bem · Patrimônio": v.asset ? `${v.asset.patrimonyNumber} · ${v.asset.name}` : "Cadastro operacional de Frotas", "Situação · Patrimônio": v.patrimonyStatus || "Sem vínculo", "Responsável · Patrimônio": v.asset?.responsible?.name || "Não informado", "Documento de aquisição · Patrimônio": v.asset?.invoiceNumber || "—", "Recebimento de compra · Patrimônio": v.asset?.purchaseReceiptItemId || "—", "Unidade principal": v.parent ? unitLabel(v.parent) : "—", "Últimas 20 alterações de origem · Patrimônio": v.assetEvents.map(e => `${dateTime(e.createdAt)} · setor ${e.fromDepartmentId || "sem setor"} → ${e.toDepartmentId || "sem setor"} · ${e.fromStatus || "—"} → ${e.toStatus || "—"}`).join("\n") || "Nenhuma alteração após o vínculo", "Observações": v.notes || "—"
    }, ["detail", "editUnit", "history", ...(v.assetId && scope.canReadAssets ? ["asset"] : [])], v.id, { ...dataStrings(v), status: v.operationalStatus, departmentLabel: departmentNames.get(v.departmentId || "") || "Sem setor", responsibleLabel: v.asset?.responsible?.name || "Sem responsável", version: v.updatedAt.toISOString() }, v.status));
  } else if (area === "rotas") {
    const where = and(fleetDepartmentFilter(scope, f.fleetRoutes.departmentId), q.status ? eq(f.fleetRoutes.active, q.status === "ATIVO") : undefined, fleetSearch(q.q, f.fleetRoutes.code, f.fleetRoutes.name, f.fleetRoutes.itinerary, f.fleetRoutes.origin, f.fleetRoutes.destination));
    const paging = paginate(await countFleetRecords(db, f.fleetRoutes, where));
    const items = await db.select().from(f.fleetRoutes).where(where).orderBy(asc(f.fleetRoutes.code), asc(f.fleetRoutes.id)).limit(paging.limit).offset(paging.offset);
    columns = [c("code", "Código"), c("name", "Nome"), c("origin", "Origem"), c("destination", "Destino"), c("status", "Situação")];
    rows = items.map(v => row(v.id, { code: v.code, name: v.name, origin: v.origin, destination: v.destination, status: v.active ? "Ativa" : "Inativa" }, { "Nome": v.name, "Origem": v.origin, "Destino": v.destination, "Percurso": v.itinerary, "Origem dos dados": "Frotas" }, ["detail", "editRoute"], undefined, { ...dataStrings(v), version: v.updatedAt.toISOString() }));
  } else if (area === "utilizacao") {
    const where = and(inArray(f.fleetUsages.unitId, unitIds), fleetDates(f.fleetUsages.startedAt, q.from, q.to, true), q.q ? or(inArray(f.fleetUsages.unitId, byUnitSearch), fleetSearch(q.q, f.fleetUsages.purpose, f.fleetUsages.routeSnapshot, f.fleetUsages.employeeName)) : undefined);
    const paging = paginate(await countFleetRecords(db, f.fleetUsages, where));
    const items = await db.select({ ...getTableColumns(f.fleetUsages), unit: getTableColumns(f.fleetUnits) }).from(f.fleetUsages).innerJoin(f.fleetUnits, eq(f.fleetUnits.id, f.fleetUsages.unitId)).where(where).orderBy(desc(f.fleetUsages.startedAt), desc(f.fleetUsages.id)).limit(paging.limit).offset(paging.offset);
    columns = [c("unit", "Unidade da frota"), c("date", "Início / fim"), c("purpose", "Finalidade"), c("distance", "Utilização do marcador", true)];
    rows = items.map(v => {
      const noMeter = v.meterType === "SEM_MARCADOR", suffix = v.meterType === "HORIMETRO" ? "h" : "km";
      const reading = (value: Decimal | null) => noMeter ? "Não aplicável" : value === null ? "Não informada" : `${value} ${suffix}`;
      return row(v.id, { unit: unitLabel(v.unit), date: `${dateTime(v.startedAt)} → ${dateTime(v.endedAt)}`, purpose: v.purpose, distance: noMeter ? "Não aplicável" : v.initialReading !== null && v.finalReading !== null ? `${v.finalReading.minus(v.initialReading)} ${suffix}` : "Não informada" }, { "Unidade da frota": unitLabel(v.unit), "Início": dateTime(v.startedAt), "Fim": dateTime(v.endedAt), "Finalidade": v.purpose, "Rota · Frotas (registro histórico)": v.routeSnapshot || "—", "Condutor (registro histórico)": v.employeeName || "Não informado", "Cadastro canônico do condutor": v.driverId || "Registro legado", "Marcador histórico": noMeter ? "Sem marcador" : v.meterType === "HORIMETRO" ? "Horímetro" : "Hodômetro", "Leitura inicial": reading(v.initialReading), "Leitura final": reading(v.finalReading) }, ["detail"], v.unitId);
    });
  } else if (area === "planos") {
    const where = and(inArray(f.fleetPlans.unitId, unitIds), fleetDates(f.fleetPlans.nextDueAt, q.from, q.to), q.type ? eq(f.fleetPlans.type, q.type) : undefined, q.q ? or(inArray(f.fleetPlans.unitId, byUnitSearch), fleetSearch(q.q, f.fleetPlans.title, f.fleetPlans.services)) : undefined);
    const paging = paginate(await countFleetRecords(db, f.fleetPlans, where));
    const items = await db.select({ ...getTableColumns(f.fleetPlans), unit: getTableColumns(f.fleetUnits) }).from(f.fleetPlans).innerJoin(f.fleetUnits, eq(f.fleetUnits.id, f.fleetPlans.unitId)).where(where).orderBy(asc(f.fleetPlans.nextDueAt), asc(f.fleetPlans.id)).limit(paging.limit).offset(paging.offset);
    columns = [c("unit", "Unidade da frota"), c("title", "Plano"), c("type", "Tipo"), c("date", "Próxima ocorrência"), c("interval", "Periodicidade"), c("estimate", "Previsto", true)];
    rows = items.map(v => row(v.id, { unit: unitLabel(v.unit), title: v.title, type: label(v.type), date: day(v.nextDueAt), interval: `${v.intervalDays} dias`, estimate: money(v.estimatedCost) }, { "Unidade": unitLabel(v.unit), "Plano": v.title, "Tipo": label(v.type), "Primeira ocorrência": day(v.firstDueAt), "Próxima ocorrência": day(v.nextDueAt), "Intervalo": `${v.intervalDays} dias`, "Serviços": v.services, "Previsto (não realizado)": money(v.estimatedCost) }, ["detail", "generate", "emitPlan"], v.unitId, { scheduledAt: str(v.nextDueAt) }));
  } else if (area === "ordens") {
    const where = and(inArray(f.fleetWorkOrders.unitId, unitIds), fleetDates(f.fleetWorkOrders.scheduledAt, q.from, q.to), q.status ? eq(f.fleetWorkOrders.status, q.status) : undefined, q.q ? or(inArray(f.fleetWorkOrders.unitId, byUnitSearch), fleetSearch(q.q, f.fleetWorkOrders.title, f.fleetWorkOrders.services, f.fleetWorkOrders.id)) : undefined);
    const paging = paginate(await countFleetRecords(db, f.fleetWorkOrders, where));
    const items = await db.select({ ...getTableColumns(f.fleetWorkOrders), unit: getTableColumns(f.fleetUnits) }).from(f.fleetWorkOrders).innerJoin(f.fleetUnits, eq(f.fleetUnits.id, f.fleetWorkOrders.unitId)).where(where).orderBy(desc(f.fleetWorkOrders.scheduledAt), desc(f.fleetWorkOrders.id)).limit(paging.limit).offset(paging.offset);
    const authorizedOrders = new Set((await db.select({ workOrderId: f.fleetAuthorizations.workOrderId }).from(f.fleetAuthorizations).where(inArray(f.fleetAuthorizations.workOrderId, items.map(v => v.id)))).map(v => v.workOrderId));
    columns = [c("unit", "Unidade da frota"), c("title", "Ordem de serviço"), c("date", "Programação"), c("status", "Situação"), c("estimate", "Previsto", true), c("actual", "Serviço realizado", true)];
    rows = items.map(v => row(v.id, { unit: unitLabel(v.unit), title: v.title, date: day(v.scheduledAt), status: label(v.status), estimate: money(v.estimatedCost), actual: v.status === "CONCLUIDA" ? money(v.actualCost) : "Ainda não realizado" }, { "OS": v.id, "Unidade": unitLabel(v.unit), "Plano de origem": v.planId || "Serviço avulso autorizado", "Tipo": label(v.type), "Programação": day(v.scheduledAt), "Serviços programados (cópia da emissão)": v.services, "Situação": label(v.status), "Início da execução": v.startedAt ? dateTime(v.startedAt) : "—", "Conclusão": day(v.completedAt), "Serviços executados": v.performed || "—", "Resultado": v.result || "—", "Custo realizado dos serviços": v.status === "CONCLUIDA" ? money(v.actualCost) : "Ainda não realizado", "Conclusão da OS": authorizedOrders.has(v.id) ? "Gestão de Frota → Autorizações de serviço, após conferência da oficina quando terceirizada." : "Rotina de Ordens de serviço", "Observação de custos": "Consumos vinculados são apropriados separadamente; não redigite esses valores no custo dos serviços." }, ["detail", "emitOrder", ...(v.status === "EMITIDA" ? ["start"] : []), ...(v.status === "EM_EXECUCAO" && !authorizedOrders.has(v.id) ? ["complete"] : [])], v.unitId, { performed: v.services }, v.status));
  } else if (area === "consumos") {
    const fuelReport = q.area === "relatorios" && q.report === "abastecimentos";
    const where = and(inArray(f.fleetConsumptions.unitId, unitIds), fuelReport ? inArray(f.fleetConsumptions.unitId, db.select({ id: f.fleetUnits.id }).from(f.fleetUnits).where(eq(f.fleetUnits.category, "VEICULO"))) : undefined, fleetDates(f.fleetConsumptions.occurredAt, q.from, q.to), fuelReport || q.type ? eq(f.fleetConsumptions.type, fuelReport ? "COMBUSTIVEL" : q.type) : undefined, q.origin ? eq(f.fleetConsumptions.origin, q.origin) : undefined, q.q ? or(inArray(f.fleetConsumptions.unitId, byUnitSearch), fleetSearch(q.q, f.fleetConsumptions.material, f.fleetConsumptions.supplierName, f.fleetConsumptions.reference)) : undefined);
    const count = await countFleetRecords(db, f.fleetConsumptions, where);
    const [sums] = await db.select({ cost: sum(f.fleetConsumptions.cost).as("totalCost") }).from(f.fleetConsumptions).where(where);
    const groups = await db.select({ measurementUnit: f.fleetConsumptions.measurementUnit, quantity: sum(f.fleetConsumptions.quantity).as("totalQuantity") }).from(f.fleetConsumptions).where(where).groupBy(f.fleetConsumptions.measurementUnit);
    missingCosts = await countFleetRecords(db, f.fleetConsumptions, and(where, isNull(f.fleetConsumptions.cost))); amount = new Decimal(sums.cost || 0).toFixed(2);
    quantities = Object.fromEntries(groups.map(g => [g.measurementUnit, new Decimal(g.quantity || 0).toString()]));
    const paging = paginate(count);
    const items = await db.select({ ...getTableColumns(f.fleetConsumptions), unit: getTableColumns(f.fleetUnits) }).from(f.fleetConsumptions).innerJoin(f.fleetUnits, eq(f.fleetUnits.id, f.fleetConsumptions.unitId)).where(where).orderBy(desc(f.fleetConsumptions.occurredAt), desc(f.fleetConsumptions.id)).limit(paging.limit).offset(paging.offset);
    columns = [...common, c("material", "Material / tipo"), c("origin", "Origem"), c("quantity", "Quantidade", true), c("amount", "Custo realizado", true)];
    rows = items.map(v => row(v.id, { unit: unitLabel(v.unit), date: day(v.occurredAt), material: `${v.material} · ${label(v.type)}`, origin: v.stockMovementId ? "Próprio · Almoxarifado" : label(v.origin), quantity: `${v.quantity} ${v.measurementUnit}`, amount: money(v.cost) }, { "Unidade": unitLabel(v.unit), "Data do consumo": day(v.occurredAt), "Material": v.material, "Tipo": label(v.type), "Origem do material": label(v.origin), "Quantidade": `${v.quantity} ${v.measurementUnit}`, "Custo realizado": money(v.cost), "Fornecedor · Cadastros": v.supplierName || "Não informado", "Referência informada": v.reference || "—", "OS vinculada": v.workOrderId || "—", "Saída · Almoxarifado": v.stockMovementId || "Sem vínculo de estoque", "Origem do registro": v.stockMovementId ? "Consumo apropriado de uma saída real; quantidade e custo de origem, sem segunda baixa." : "Frotas · registro operacional sem baixa de estoque ou pagamento." }, ["detail", ...(v.stockMovementId && scope.canReadAssets ? ["stock"] : [])], v.unitId, { stockMovementId: v.stockMovementId || "" }));
  } else if (area === "gastos" || area === "manutencoes") {
    const where = and(inArray(f.fleetExpenses.unitId, unitIds), fleetDates(f.fleetExpenses.occurredAt, q.from, q.to), area === "manutencoes" || q.type ? eq(f.fleetExpenses.nature, area === "manutencoes" ? "MANUTENCAO" : q.type) : undefined, q.q ? or(inArray(f.fleetExpenses.unitId, byUnitSearch), fleetSearch(q.q, f.fleetExpenses.description, f.fleetExpenses.reference)) : undefined);
    const [count, [sums], unknown] = await Promise.all([countFleetRecords(db, f.fleetExpenses, where), db.select({ amount: sum(f.fleetExpenses.amount) }).from(f.fleetExpenses).where(where), countFleetRecords(db, f.fleetExpenses, and(where, isNull(f.fleetExpenses.amount)))]);
    amount = new Decimal(sums.amount || 0).toFixed(2); missingCosts = unknown;
    const paging = paginate(count);
    const items = await db.select({ ...getTableColumns(f.fleetExpenses), unit: getTableColumns(f.fleetUnits) }).from(f.fleetExpenses).innerJoin(f.fleetUnits, eq(f.fleetUnits.id, f.fleetExpenses.unitId)).where(where).orderBy(desc(f.fleetExpenses.occurredAt), desc(f.fleetExpenses.id)).limit(paging.limit).offset(paging.offset);
    columns = [...common, c("description", "Descrição"), c("nature", "Natureza / origem"), c("amount", "Realizado", true)];
    rows = items.map(v => row(v.id, { unit: unitLabel(v.unit), date: day(v.occurredAt), description: v.description, nature: `${label(v.nature)} / ${label(v.sourceType)}`, amount: money(v.amount) }, { "Unidade": unitLabel(v.unit), "Data do fato": day(v.occurredAt), "Descrição": v.description, "Natureza": label(v.nature), "Valor realizado (não significa pago)": money(v.amount), "Origem": label(v.sourceType), "Identificação do fato": v.sourceId, "Referência informada": v.reference || "—" }, ["detail", "source"], v.unitId, { sourceType: v.sourceType, sourceId: v.sourceId }));
  } else if (["seguros", "obrigacoes", "documentos"].includes(area)) {
    const kind = area === "seguros" ? "SEGURO" : area === "obrigacoes" ? "OBRIGACAO" : undefined;
    const where = and(inArray(f.fleetDocuments.unitId, unitIds), kind ? eq(f.fleetDocuments.kind, kind) : undefined, fleetDates(f.fleetDocuments.dueAt, q.from, q.to), q.status ? eq(f.fleetDocuments.status, q.status) : undefined, q.type ? eq(f.fleetDocuments.type, q.type) : undefined, q.q ? or(inArray(f.fleetDocuments.unitId, byUnitSearch), fleetSearch(q.q, f.fleetDocuments.title, f.fleetDocuments.reference, f.fleetDocuments.insurerName)) : undefined);
    const paging = paginate(await countFleetRecords(db, f.fleetDocuments, where));
    const items = await db.select({ ...getTableColumns(f.fleetDocuments), unit: getTableColumns(f.fleetUnits) }).from(f.fleetDocuments).innerJoin(f.fleetUnits, eq(f.fleetUnits.id, f.fleetDocuments.unitId)).where(where).orderBy(asc(f.fleetDocuments.dueAt), asc(f.fleetDocuments.id)).limit(paging.limit).offset(paging.offset);
    columns = [c("unit", "Unidade da frota"), c("title", "Documento / referência"), c("kind", "Tipo"), c("scheduled", "Agendamento"), c("date", "Vencimento"), c("status", "Situação")];
    rows = items.map(v => row(v.id, { unit: unitLabel(v.unit), title: `${v.title} / ${v.reference}`, kind: `${label(v.kind)} · ${label(v.type)}`, scheduled: day(v.scheduledAt), date: day(v.dueAt), status: documentStatus(v) }, { "Unidade": unitLabel(v.unit), "Título": v.title, "Tipo": `${label(v.kind)} / ${label(v.type)}`, "Referência / exercício": v.reference, "Seguradora · Cadastros": v.insurerName || "—", "Início da vigência": day(v.startsAt), "Agendamento": day(v.scheduledAt), "Vencimento": day(v.dueAt), "Situação": documentStatus(v), "Cumprimento administrativo": day(v.fulfilledAt), "Referência do cumprimento": v.fulfillmentNote || "—", "Valor informado (não apropriado como gasto)": money(v.value), "Observações": v.notes || "—" }, ["detail", ...(v.status !== "CUMPRIDA" ? ["editDocument", ...(v.kind !== "SEGURO" ? ["fulfill"] : [])] : [])], v.unitId, { ...dataStrings(v), version: v.updatedAt.toISOString() }, v.status));
  } else if (area === "ocorrencias") {
    const where = and(inArray(f.fleetOccurrences.unitId, unitIds), fleetDates(f.fleetOccurrences.occurredAt, q.from, q.to), q.type ? eq(f.fleetOccurrences.type, q.type) : undefined, q.q ? or(inArray(f.fleetOccurrences.unitId, byUnitSearch), fleetSearch(q.q, f.fleetOccurrences.description, f.fleetOccurrences.reference)) : undefined);
    const paging = paginate(await countFleetRecords(db, f.fleetOccurrences, where));
    const items = await db.select({ ...getTableColumns(f.fleetOccurrences), unit: getTableColumns(f.fleetUnits) }).from(f.fleetOccurrences).innerJoin(f.fleetUnits, eq(f.fleetUnits.id, f.fleetOccurrences.unitId)).where(where).orderBy(desc(f.fleetOccurrences.occurredAt), desc(f.fleetOccurrences.id)).limit(paging.limit).offset(paging.offset);
    columns = [...common, c("type", "Tipo"), c("description", "Descrição"), c("value", "Valor envolvido", true)];
    rows = items.map(v => row(v.id, { unit: unitLabel(v.unit), date: day(v.occurredAt), type: label(v.type), description: v.description, value: money(v.involvedValue) }, { "Unidade": unitLabel(v.unit), "Tipo": label(v.type), "Data": day(v.occurredAt), "Descrição": v.description, "Valor envolvido (não é gasto realizado)": money(v.involvedValue), "Referência": v.reference || "—" }, ["detail", "recognizeExpense"], v.unitId, { occurrenceId: v.id }));
  }
  return { rows, columns, total, page, pageSize: q.pageSize, amount, missingCosts, quantities };
}

export async function fleetReferences(context: AppContext, kind: string, search: string, unitId = ""): Promise<ReferenceOption[]> {
  const db = fleetDatabase(context), scope = fleetScope(context), text = search.slice(0, 100);
  const limit = 20, unit = unitId ? await readFleetUnit(db, scope, unitId) : null;
  if (unitId && !unit) return [];
  const departmentId = unit?.departmentId;
  if (kind === "drivers") {
    return db.select({ id: f.fleetDrivers.id, label: people.fullName }).from(f.fleetDrivers).innerJoin(people, eq(people.id, f.fleetDrivers.personId)).leftJoin(employees, eq(employees.id, f.fleetDrivers.employeeId)).where(and(eq(f.fleetDrivers.active, true), eq(people.status, "Ativo"), scope.administrator ? undefined : sql`coalesce(${employees.departmentId},${f.fleetDrivers.departmentId})=${scope.departmentId}`, departmentId ? sql`coalesce(${employees.departmentId},${f.fleetDrivers.departmentId})=${departmentId}` : undefined, fleetSearch(text, people.fullName))).orderBy(asc(people.fullName), asc(f.fleetDrivers.id)).limit(limit);
  }
  if (["units", "allUnits", "vehicles", "allVehicles", "principals"].includes(kind)) {
    const records = await db.select().from(f.fleetUnits).where(and(fleetDepartmentFilter(scope), ["allUnits", "allVehicles"].includes(kind) ? undefined : ne(f.fleetUnits.status, "INATIVO"), departmentId ? eq(f.fleetUnits.departmentId, departmentId) : undefined, ["vehicles", "allVehicles"].includes(kind) ? eq(f.fleetUnits.category, "VEICULO") : kind === "principals" ? ne(f.fleetUnits.category, "AGREGADO") : undefined, fleetSearch(text, f.fleetUnits.code, f.fleetUnits.name, f.fleetUnits.plate))).orderBy(asc(f.fleetUnits.code), asc(f.fleetUnits.id)).limit(limit);
    return records.map(v => ({ id: v.id, label: `${unitLabel(v)} · ${label(v.category)}` }));
  }
  if (kind === "departments") return db.select({ id: departments.id, label: departments.name }).from(departments).where(and(eq(departments.isActive, true), scope.administrator ? undefined : eq(departments.id, scope.departmentId!), fleetSearch(text, departments.name))).orderBy(asc(departments.name), asc(departments.id)).limit(limit);
  if (kind === "employees") return db.select({ id: employees.id, label: employees.name }).from(employees).where(and(eq(employees.isActive, true), fleetDepartmentFilter(scope, employees.departmentId), departmentId ? eq(employees.departmentId, departmentId) : undefined, fleetSearch(text, employees.name))).orderBy(asc(employees.name), asc(employees.id)).limit(limit);
  if (kind === "routes") { const records = await db.select().from(f.fleetRoutes).where(and(fleetDepartmentFilter(scope, f.fleetRoutes.departmentId), departmentId ? eq(f.fleetRoutes.departmentId, departmentId) : undefined, eq(f.fleetRoutes.active, true), fleetSearch(text, f.fleetRoutes.code, f.fleetRoutes.name))).orderBy(asc(f.fleetRoutes.code), asc(f.fleetRoutes.id)).limit(limit); return records.map(v => ({ id: v.id, label: `${v.code} · ${v.name}` })); }
  if (kind === "suppliers") { const records = await db.select({ id: suppliers.id, fullName: people.fullName, tradeName: companies.tradeName, corporateName: companies.corporateName }).from(suppliers).leftJoin(people, eq(people.id, suppliers.personId)).leftJoin(companies, eq(companies.id, suppliers.companyId)).where(and(eq(suppliers.status, "Ativo"), fleetSearch(text, people.fullName, companies.tradeName, companies.corporateName))).orderBy(asc(suppliers.id)).limit(limit); return records.map(v => ({ id: v.id, label: v.fullName || v.tradeName || v.corporateName || "Fornecedor" })); }
  if (kind === "assets") {
    if (!scope.canReadAssets) return [];
    const records = await db.select({ id: assets.id, patrimonyNumber: assets.patrimonyNumber, name: assets.name }).from(assets).where(and(notInArray(assets.status, ["Baixado", "Inativo"]), fleetDepartmentFilter(scope, assets.departmentId), departmentId ? eq(assets.departmentId, departmentId) : undefined, fleetSearch(text, assets.patrimonyNumber, assets.name))).orderBy(asc(assets.patrimonyNumber)).limit(limit); return records.map(v => ({ id: v.id, label: `${v.patrimonyNumber} · ${v.name}` }));
  }
  if (kind === "stocks") {
    if (!scope.canReadAssets || !scope.canIssueStock || !unit) return [];
    const records = await db.select({ ...getTableColumns(materialStocks), material: getTableColumns(materials), warehouse: { name: warehouses.name } }).from(materialStocks).innerJoin(materials, eq(materials.id, materialStocks.materialId)).innerJoin(warehouses, eq(warehouses.id, materialStocks.warehouseId)).where(and(gt(materialStocks.quantity, 0), eq(warehouses.isActive, true), eq(materials.isActive, true), inArray(materials.unitOfMeasure, ["L", "KG", "UN"]), fleetSearch(text, materials.name, materials.code), or(isNull(materialStocks.expirationDate), gte(materialStocks.expirationDate, dateOnly(todayInBrazil()))))).orderBy(asc(materials.code), asc(materialStocks.id)).limit(limit);
    return records.map(v => ({ id: v.id, label: `${v.material.code} · ${v.material.name} · ${v.warehouse.name} · lote ${v.batchNumber || "sem lote"} · ${v.quantity} ${v.material.unitOfMeasure} · custo unitário ${v.unitCost == null ? "não informado" : `R$ ${v.unitCost.toFixed(2)}`}` }));
  }
  if (kind === "stockMovements") {
    if (!scope.canReadAssets || !unit) return [];
    const records = await db.select({ ...getTableColumns(materialMovements), material: getTableColumns(materials) }).from(materialMovements).innerJoin(materials, eq(materials.id, materialMovements.materialId)).where(and(eq(materialMovements.type, "Saída"), unit.departmentId ? eq(materialMovements.departmentId, unit.departmentId) : isNull(materialMovements.departmentId), isNull(materialMovements.obrasServicoId), sql`not exists (select 1 from "Asset" a where a."stockMovementId"=${materialMovements.id})`, sql`not exists (select 1 from "FleetConsumption" c where c."stockMovementId"=${materialMovements.id})`, eq(materials.isActive, true), inArray(materials.unitOfMeasure, ["L", "KG", "UN"]), fleetSearch(text, materials.name, materials.code))).orderBy(desc(materialMovements.date), desc(materialMovements.id)).limit(limit);
    return records.map(v => ({ id: v.id, label: `${day(v.date)} · ${v.material.code} · ${v.material.name} · ${v.quantity} ${v.material.unitOfMeasure}` }));
  }
  if (kind === "orders") { const records = await db.select({ ...getTableColumns(f.fleetWorkOrders), unit: { code: f.fleetUnits.code, name: f.fleetUnits.name } }).from(f.fleetWorkOrders).innerJoin(f.fleetUnits, eq(f.fleetUnits.id, f.fleetWorkOrders.unitId)).where(and(fleetDepartmentFilter(scope), unitId ? eq(f.fleetWorkOrders.unitId, unitId) : undefined, fleetSearch(text, f.fleetWorkOrders.title, f.fleetWorkOrders.id))).orderBy(desc(f.fleetWorkOrders.scheduledAt), desc(f.fleetWorkOrders.id)).limit(limit); return records.map(v => ({ id: v.id, label: `${unitLabel(v.unit)} · ${v.title} · ${day(v.scheduledAt)}` })); }
  if (kind === "occurrences") { const records = await db.select().from(f.fleetOccurrences).where(and(inArray(f.fleetOccurrences.unitId, fleetUnitScope(scope)), unitId ? eq(f.fleetOccurrences.unitId, unitId) : undefined, fleetSearch(text, f.fleetOccurrences.description))).orderBy(desc(f.fleetOccurrences.occurredAt), desc(f.fleetOccurrences.id)).limit(limit); return records.map(v => ({ id: v.id, label: `${day(v.occurredAt)} · ${label(v.type)} · ${v.description}` })); }
  return [];
}
