import Link from "next/link";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { z } from "zod";
import { canPerformModuleOperation, getTenantContextForModule } from "@/lib/platform/tenant-context";
import { structureConfig, structureFilters } from "@/lib/cemeteries/structure-config";
import { getStructure, listStructure, type StructureRecord } from "@/lib/cemeteries/structure-service";
import { OperationalListFrame, OperationalLinkPagination, OperationalFilters } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { ContextualTables } from "@/components/app-ui/planejamento/ContextualTables";
import type { OperationalColumn } from "@/lib/operational-tables";
import { OPERATIONAL_PAGE_SIZE } from "@/lib/operational-tables";
import styles from "@/components/app-ui/operational/operational.module.css";
import { StructureForm } from "./StructureForm";
import { StructureCemeteryFilter } from "./StructureFilters";
import { databaseConnection, db } from "@/db/client";
import { readLotGraves, readStructureFields, readStructureHistory, readStructureOperators, readStructureTaxpayers } from "@/db/repositories/cemeteries/structure";

export type StructureSearch = Record<string, string | string[] | undefined>;
const scalar = (search: StructureSearch) => Object.fromEntries(Object.entries(search).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
const column = (key: string, label: string, minWidth: number, initialWidth: number, extra: Partial<OperationalColumn> = {}): OperationalColumn => ({ key, label, minWidth, initialWidth, type: "text", resizable: true, sortable: false, details: "overflow", ...extra });
export async function StructureListPage({ search, occupancy = false }: { search: StructureSearch; occupancy?: boolean }) {
  const c = await getTenantContextForModule("CEMITERIOS");
  const input = scalar(search);
  if (!input.tipo) input.tipo = occupancy ? "LOTE" : "CEMITERIO";
  const { filters, rows, total } = await listStructure(databaseConnection, input);
  const config = structureConfig[filters.tipo];
  const path = occupancy ? "/cemiterios/ocupacao" : "/cemiterios/estrutura";
  const values = { tipo: filters.tipo, q: filters.q, cemeteryId: filters.cemeteryId, active: filters.active, status: filters.status };
  const context = new URLSearchParams({ ...values, page: String(filters.page) }).toString();
  return <OperationalListFrame label={config.title}
    actions={canPerformModuleOperation(c.user, "CEMITERIOS", "create") && <Link className={styles.newButton} href={`${path}/novo?${context}`}>Novo</Link>}
    toolbar={<><form method="get" className={styles.searchForm}>
      <input type="hidden" name="tipo" value={filters.tipo} /><input type="hidden" name="cemeteryId" value={filters.cemeteryId} /><input type="hidden" name="active" value={filters.active} /><input type="hidden" name="status" value={filters.status} />
      <input aria-label="Buscar estrutura" name="q" defaultValue={filters.q} className={styles.searchInput} /><button className={styles.dialogButton}>Consultar</button>
    </form><OperationalFilters activeCount={[filters.cemeteryId, filters.active, filters.status].filter(Boolean).length}><form method="get" className={styles.filterFields}>
      <input type="hidden" name="tipo" value={filters.tipo} /><input type="hidden" name="q" value={filters.q} />
      {config.fields.some(f => f.key === "cemeteryId") && <StructureCemeteryFilter value={filters.cemeteryId} />}
      {config.fields.some(f => f.key === "active") && <label>Ativação<select name="active" defaultValue={filters.active}><option value="">Todos</option><option value="true">Ativos</option><option value="false">Inativos</option></select></label>}
      {occupancy && <label>Situação<select name="status" defaultValue={filters.status}><option value="">Todas</option>{(filters.tipo === "LOTE" ? ["LIVRE", "OCUPADO"] : ["LIVRE", "OCUPADA", "RESERVADA", "INTERDITADA"]).map(s => <option key={s}>{s}</option>)}</select></label>}
      <button className={styles.dialogButton}>Aplicar filtros</button><Link href={`${path}?tipo=${filters.tipo}`}>Limpar filtros</Link>
    </form></OperationalFilters></>}
    pagination={<OperationalLinkPagination page={filters.page} total={total} pathname={path} values={values} />}>
    <OperationalTable preferenceId={`cemeteries:structure:${filters.tipo}:${occupancy}`} caption={config.title}
      columns={[column("name", "Identificação", 150, 300, { type: "identifier" }), column("status", "Situação", 100, 140, { type: "status" }), column("active", "Ativação", 90, 110),
        ...(occupancy && filters.tipo === "LOTE" ? [column("registered", "Cadastradas", 100, 120), column("limit", "Limite", 65, 80), column("occupied", "Ocupadas", 85, 100), column("vacancies", "Vagas cadastro", 120, 140)] : []),
        ...(occupancy && filters.tipo !== "LOTE" ? [column("occupants", "Ocupantes", 90, 110), column("capacity", "Capacidade", 100, 120), column("type", "Tipo", 90, 130)] : []),
        column("actions", "Ações", 70, 80, { type: "actions", details: "none", resizable: false })]}
      rows={rows.map(row => ({ id: row.id, label: String(row.name ?? row.identifier ?? row.label ?? row.description ?? row.code), values: { name: String(row.name ?? row.identifier ?? row.label ?? row.description ?? row.code), status: String(row.status ?? "Cadastrado"), active: row.active === undefined ? "—" : row.active ? "Ativo" : "Inativo", registered: String(row.registered ?? "—"), limit: String(row.graveLimit ?? "—"), occupied: String(row.occupied ?? "—"), vacancies: String(Number(row.graveLimit) - Number(row.registered)), occupants: String(row.occupantCount ?? "—"), capacity: String(row.capacity ?? "—"), type: String(row.graveType === "GAVETA" ? "Lóculo" : row.graveType ?? "—") }, actions: <Link className={styles.dialogButton} href={`${path}/${row.id}?${context}`}>Abrir</Link> }))} emptyMessage="Nenhum registro encontrado." />
  </OperationalListFrame>;
}

export async function StructureDetailPage({ id, search, occupancy = false, contextContent }: { id: string; search: StructureSearch; occupancy?: boolean; contextContent?: ReactNode }) {
  const c = await getTenantContextForModule("CEMITERIOS");
  const input = scalar(search);
  const filters = structureFilters.parse({ ...input, tipo: input.tipo ?? (occupancy ? "LOTE" : "CEMITERIO") });
  const database = c.database ?? db;
  const record: StructureRecord = id === "novo" ? { id: "" } : await getStructure(database, filters.tipo, id) ?? notFound();
  const path = occupancy ? "/cemiterios/ocupacao" : "/cemiterios/estrutura";
  const returnHref = `${path}?${new URLSearchParams({ ...scalar(search), tipo: filters.tipo })}`;
  const fields = ["LOTE", "SEPULTURA"].includes(filters.tipo) ? await readStructureFields(database, filters.tipo, record.cemeteryId ? String(record.cemeteryId) : undefined) : [];
  const requestedHistory = z.coerce.number().int().min(1).max(1000000).default(1).parse(input.historyPage);
  let historyResult = id === "novo" ? { total: 0, history: [] } : await readStructureHistory(database, filters.tipo, id, requestedHistory);
  const historyPage = Math.min(requestedHistory, Math.max(1, Math.ceil(historyResult.total / OPERATIONAL_PAGE_SIZE)));
  if (id !== "novo" && historyPage !== requestedHistory) historyResult = await readStructureHistory(database, filters.tipo, id, historyPage);
  const { total: historyTotal, history } = historyResult;
  const users = await readStructureOperators(database, history.map(h => h.actorUsuarioId));
  const taxpayerIds = structureConfig[filters.tipo].fields.filter(f => f.lookup === "taxpayer").map(f => String(record[f.key] ?? "")).filter(Boolean);
  const taxpayers = await readStructureTaxpayers(database, taxpayerIds);
  const serialized = JSON.parse(JSON.stringify({ ...record, cemeteryId: record.cemeteryId ?? filters.cemeteryId })) as Record<string, unknown>;
  const requestedLot = z.coerce.number().int().min(1).max(1000000).default(1).parse(input.lotPage);
  let lotResult = filters.tipo === "LOTE" && id !== "novo" ? await readLotGraves(database, id, requestedLot) : { total: 0, graves: [] };
  const lotPage = Math.min(requestedLot, Math.max(1, Math.ceil(lotResult.total / OPERATIONAL_PAGE_SIZE)));
  if (filters.tipo === "LOTE" && id !== "novo" && requestedLot !== lotPage) lotResult = await readLotGraves(database, id, lotPage);
  const { total: graveTotal, graves } = lotResult;
  return <ContextualTables initialArea="context" areas={id === "novo" ? [] : [{ id: "history", label: "Histórico por campo", content: <OperationalListFrame label="Histórico imutável por campo" pagination={<OperationalLinkPagination page={historyPage} total={historyTotal} pathname={`${path}/${id}`} values={{ ...scalar(search), tipo: filters.tipo }} pageParam="historyPage" />}>
    <OperationalTable preferenceId="cemeteries:structure-history" caption="Histórico imutável por campo" columns={[column("date", "Data / hora", 150, 180), column("field", "Campo", 100, 150), column("before", "Antes", 130, 230), column("after", "Depois", 130, 230), column("actor", "Operador", 120, 190)]}
      rows={history.map(h => ({ id: h.id, label: h.fieldName, values: { date: h.createdAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }), field: h.fieldName, before: JSON.stringify(h.previousValue) ?? "—", after: JSON.stringify(h.newValue) ?? "—", actor: users.find(u => u.id === h.actorUsuarioId)?.nome ?? h.actorUsuarioId } }))} emptyMessage="Nenhuma alteração registrada." />
  </OperationalListFrame> }, ...(filters.tipo === "LOTE" ? [{ id: "graves", label: "Sepulturas do lote", content: <OperationalListFrame label="Sepulturas do lote" pagination={<OperationalLinkPagination page={lotPage} total={graveTotal} pathname={`${path}/${id}`} values={{ ...scalar(search), tipo: filters.tipo }} pageParam="lotPage" />}>
    <OperationalTable preferenceId="cemeteries:lot-graves" caption="Sepulturas do lote" columns={[column("code", "Código", 100, 180), column("type", "Tipo", 100, 170), column("occupants", "Ocupantes", 90, 120), column("capacity", "Capacidade", 100, 130), column("status", "Situação", 100, 170), column("active", "Ativação", 90, 120), column("actions", "Ações", 70, 80, { type: "actions", details: "none", resizable: false })]}
      rows={graves.map(g => ({ id: g.id, label: g.code, values: { code: g.code, type: g.graveType === "GAVETA" ? "Lóculo" : g.graveType, occupants: String(g.occupantCount), capacity: String(g.capacity), status: g.status, active: g.active ? "Ativa" : "Inativa" }, actions: <Link className={styles.dialogButton} href={`/cemiterios/ocupacao/${g.id}?tipo=SEPULTURA&cemeteryId=${g.cemeteryId}`}>Abrir</Link> }))} />
  </OperationalListFrame> }] : [])]}>
    <Link href={returnHref} className="text-sm text-emerald-700">← Voltar à lista</Link><h1 className="text-xl font-semibold">{id === "novo" ? "Novo cadastro" : "Ficha / editar"} · {structureConfig[filters.tipo].title}</h1>
    {record.status !== undefined && <p className="text-sm">Situação: {String(record.status)}{record.occupantCount !== undefined && ` · Ocupação: ${record.occupantCount}/${record.capacity}`}</p>}
    {taxpayers.length > 0 && <dl className="grid gap-2 text-sm">{structureConfig[filters.tipo].fields.filter(f => f.lookup === "taxpayer").map(f => { const t = taxpayers.find(t => t.id === record[f.key]); return <div key={f.key}><dt className="font-medium">{f.label}</dt><dd>{t?.person?.fullName ?? t?.company?.corporateName ?? "Não vinculado"} · {t?.person?.cpf ?? t?.company?.cnpj ?? ""}</dd></div>; })}</dl>}
    <section className="rounded-lg border bg-white p-4">{canPerformModuleOperation(c.user, "CEMITERIOS", id === "novo" ? "create" : "update") ? <StructureForm kind={filters.tipo} record={serialized} fields={fields} returnHref={returnHref} /> : <dl className="grid gap-3 text-sm md:grid-cols-2">{structureConfig[filters.tipo].fields.map(f => <div key={f.key}><dt className="font-medium">{f.label}</dt><dd>{typeof record[f.key] === "boolean" ? record[f.key] ? "Sim" : "Não" : String(record[f.key] ?? "—")}</dd></div>)}{fields.map(f => <div key={f.fieldKey}><dt className="font-medium">{f.label}</dt><dd>{String(((record.additionalData ?? {}) as Record<string, unknown>)[f.fieldKey] ?? "—")}</dd></div>)}</dl>}</section>
    {filters.tipo === "LOTE" && id !== "novo" && <section className="space-y-3"><h2 className="font-semibold">Sepulturas do lote · {graveTotal}/{String(record.graveLimit)} cadastradas</h2><p className="text-sm">{Number(record.graveLimit) - graveTotal} vagas para cadastrar sepulturas. Ocupação do lote: {String(record.status)}. Consulte os registros na área Sepulturas do lote.</p></section>}
    {contextContent}
  </ContextualTables>;
}
