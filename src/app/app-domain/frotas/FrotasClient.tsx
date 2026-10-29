"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, FileText, Plus, Search, X } from "lucide-react";
import Link from "next/link";
import { OperationalListFrame, OperationalFilters } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalTable, OperationalPagination } from "@/components/app-ui/operational/OperationalTable";
import { operationalColumns } from "../patrimonio/_components/operational-columns";
import styles from "@/components/app-ui/operational/operational.module.css";
import { categories, labels, type FleetArea, type FleetQuery } from "@/lib/frotas/contract";
import type { FleetList, FleetRow } from "@/lib/frotas/queries";
import { FleetEditor, type Editor } from "./FleetEditor";
import { fieldClass, ReferencePicker } from "./ReferencePicker";
import { mutateFleetAction } from "./actions";
import { fleetAreaTitle } from "./navigation";
const creation: Partial<Record<FleetArea, { title: string; kind: Editor["kind"]; initial?: Record<string, string> }>> = {
  frota: { title: "Nova unidade da frota", kind: "unit" }, rotas: { title: "Nova rota", kind: "route" }, utilizacao: { title: "Registrar utilização", kind: "usage" }, planos: { title: "Programar plano", kind: "plan" }, consumos: { title: "Registrar consumo", kind: "consumption" }, gastos: { title: "Registrar outro gasto", kind: "expense" }, seguros: { title: "Registrar seguro", kind: "document", initial: { kind: "SEGURO", type: "SEGURO" } }, obrigacoes: { title: "Agendar obrigação", kind: "document", initial: { kind: "OBRIGACAO", type: "LICENCIAMENTO" } }, documentos: { title: "Registrar documento", kind: "document", initial: { kind: "DOCUMENTO", type: "OUTRO" } }, ocorrencias: { title: "Registrar ocorrência", kind: "occurrence" },
};
const rowActionLabels: Record<string, string> = { detail: "Abrir ficha", editUnit: "Editar cadastro", editRoute: "Editar rota", history: "Consultar históricos", asset: "Abrir bem em Patrimônio", stock: "Abrir saída em Almoxarifado", generate: "Gerar OS", emitPlan: "Emitir plano", emitOrder: "Emitir OS", start: "Iniciar execução", complete: "Concluir execução", fulfill: "Registrar cumprimento", editDocument: "Editar documento", source: "Consultar origem", recognizeExpense: "Registrar gasto decorrente" };
function href(query: FleetQuery, patch: Partial<FleetQuery> = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...query, ...patch })) if (value !== "" && value != null) params.set(key, String(value));
  return `/frotas?${params}`;
}
function DetailDialog({ row, onClose, onAction, canCreate, canUpdate, canIssue }: { row: FleetRow; onClose: () => void; onAction: (action: string, row: FleetRow) => void; canCreate: boolean; canUpdate: boolean; canIssue: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} onCancel={e => { e.preventDefault(); onClose(); }} className="m-auto max-h-[92dvh] w-[min(760px,calc(100%_-_24px))] rounded-lg border border-slate-300 bg-white p-0 text-slate-900 shadow-xl backdrop:bg-slate-950/35" aria-labelledby="fleet-detail-title">
    <header className="flex items-center justify-between border-b border-slate-200 p-4"><h2 id="fleet-detail-title" className="text-base font-semibold">Ficha do registro</h2><button aria-label="Fechar ficha" onClick={onClose} className="rounded p-2 focus-visible:ring-2 focus-visible:ring-teal-600"><X className="size-5" /></button></header>
    <dl className="grid max-h-[65dvh] gap-4 overflow-y-auto p-5 md:grid-cols-2">{Object.entries(row.detail).map(([key, value]) => <div key={key} className={value.length > 140 ? "md:col-span-2" : ""}><dt className="text-xs font-semibold leading-4 text-slate-500">{key}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm leading-5">{value}</dd></div>)}</dl>
    <footer className="flex flex-wrap gap-2 border-t border-slate-200 bg-slate-50 p-4">{row.actions.filter(action => action !== "detail" && (action.startsWith("emit") ? canIssue : ["history", "source", "asset", "stock"].includes(action) ? true : ["generate", "recognizeExpense"].includes(action) ? canCreate : canUpdate)).map(action => <button key={action} className="min-h-11 rounded border border-slate-300 bg-white px-3 text-sm font-medium outline-none hover:border-teal-500 focus-visible:ring-2 focus-visible:ring-teal-600 md:min-h-9" onClick={() => onAction(action, row)}>{rowActionLabels[action]}</button>)}<button onClick={onClose} className="min-h-11 rounded bg-teal-700 px-4 text-sm font-semibold text-white md:min-h-9">Fechar</button></footer>
  </dialog>;
}

export function FrotasClient({ query, list, selectedUnit, selectedUnits = [], permissions, departmentId }: { query: FleetQuery; list: FleetList; selectedUnit: { id: string; code: string; name: string; category: string } | null; selectedUnits?: { id: string; label: string }[]; permissions: { create: boolean; update: boolean; issueReports: boolean }; departmentId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition(), [editor, setEditor] = useState<Editor | null>(null), [detail, setDetail] = useState<FleetRow | null>(null), [message, setMessage] = useState(""), [error, setError] = useState(""), [exporting, setExporting] = useState(false);
  const [filters, setFilters] = useState(query), [format, setFormat] = useState("pdf");
  const [units, setUnits] = useState(selectedUnits);
  const create = creation[query.area];
  function navigate(patch: Partial<FleetQuery>) { startTransition(() => router.push(href(query, patch))); }
  function applyFilters(event: React.FormEvent) { event.preventDefault(); setError(""); if (filters.from && filters.to && filters.from > filters.to) { setError("A data final deve ser igual ou posterior à inicial."); return; } navigate({ ...filters, page: 1 }); }
  async function emit(extra: Record<string, string> = {}) {
    if (exporting) return; setExporting(true); setError("");
    try {
      const params = new URLSearchParams(href(query).split("?")[1]); params.set("format", format);
      for (const [key, value] of Object.entries(extra)) params.set(key, value);
      const response = await fetch(`/api/frotas/relatorios?${params}`);
      if (!response.ok) { const result = await response.json(); throw new Error(result.error || "Falha na emissão."); }
      const blob = await response.blob(), url = URL.createObjectURL(blob);
      const link = document.createElement("a"); link.href = url;
      link.download = `celeriflow-frotas-${extra.documentType || (query.area === "relatorios" ? query.report : query.area)}.${format === "print" ? "html" : format}`;
      document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
      setMessage(format === "print" ? "Documento de impressão gerado. Abra o HTML e use a impressão do navegador." : "Relatório emitido com todos os registros do filtro.");
    } catch (err) { setError(err instanceof Error ? err.message : "Falha na emissão."); }
    finally { setExporting(false); }
  }
  function act(action: string, row: FleetRow) {
    if (action === "asset") { router.push(`/patrimonio/bens/${encodeURIComponent(row.data?.assetId || "")}`); return; }
    if (action === "stock") { router.push(`/patrimonio/materiais/movimentos/${encodeURIComponent(row.data?.stockMovementId || "")}`); return; }
    if (action === "detail") { setDetail(row); return; }
    setDetail(null); setError("");
    const context = row.cells.unit || row.cells.name || row.cells.title;
    if (action === "editUnit") setEditor({ kind: "unit", title: "Editar unidade da frota", initial: row.data!, context });
    if (action === "editRoute") setEditor({ kind: "route", title: "Editar rota", initial: row.data!, context });
    if (action === "editDocument") setEditor({ kind: "document", title: "Editar documento", initial: row.data!, context });
    if (action === "generate") setEditor({ kind: "generateOrder", title: "Gerar OS a partir do plano", initial: { planId: row.id, scheduledAt: row.data!.scheduledAt }, context: `${context} · ${row.cells.title}` });
    if (action === "complete") setEditor({ kind: "completeOrder", title: "Concluir execução da ordem", initial: { orderId: row.id, performed: row.data?.performed || "" }, context: `${context} · ${row.cells.title}` });
    if (action === "fulfill") setEditor({ kind: "fulfillDocument", title: "Registrar cumprimento administrativo", initial: { documentId: row.id }, context });
    if (action === "recognizeExpense") setEditor({ kind: "expense", title: "Registrar gasto decorrente da ocorrência", initial: { unitId: row.unitId!, occurrenceId: row.id }, context });
    if (action === "history") navigate({ unitId: row.unitId!, area: "utilizacao", page: 1, q: "", type: "", status: "", from: "", to: "" });
    if (action === "source") {
      if (row.data?.sourceType === "PATRIMONIO") { router.push(`/patrimonio/manutencoes/${encodeURIComponent(row.data.sourceId)}`); return; }
      const area = row.data?.sourceType === "CONSUMO" ? "consumos" : row.data?.sourceType === "OS" ? "ordens" : row.data?.sourceType === "OCORRENCIA" ? "ocorrencias" : "gastos";
      if (area === "gastos") setDetail(row); else navigate({ area, unitId: row.unitId!, q: "", page: 1, type: "", status: "" });
    }
    if (action === "emitPlan" || action === "emitOrder") void emit({ documentType: action === "emitPlan" ? "plan" : "order", documentId: row.id });
    if (action === "start") startTransition(async () => { try { const result = await mutateFleetAction({ kind: "startOrder", requestId: crypto.randomUUID(), orderId: row.id }); if (result.error) setError(result.error); else { setMessage("Execução iniciada."); router.refresh(); } } catch { setError("Não foi possível iniciar a execução."); } });
  }
  const filterTypes = query.area === "consumos" ? ["COMBUSTIVEL", "LUBRIFICANTE"] : query.area === "ocorrencias" ? ["MULTA", "ACIDENTE", "OUTRO"] : ["gastos", "manutencoes"].includes(query.area) ? ["MANUTENCAO", "COMBUSTIVEL", "LUBRIFICANTE", "OUTROS"] : query.area === "planos" ? ["REVISAO", "PREVENTIVA"] : [];
  const statuses = query.area === "ordens" ? ["EMITIDA", "EM_EXECUCAO", "CONCLUIDA"] : ["documentos", "obrigacoes", "seguros"].includes(query.area) ? ["PENDENTE", "CUMPRIDA"] : ["frota", "rotas"].includes(query.area) ? ["ATIVO", "INATIVO", ...(query.area === "frota" ? ["EM_MANUTENCAO"] : [])] : [];
  const dateCaption = ["documentos", "seguros", "obrigacoes"].includes(query.area) || (query.area === "relatorios" && query.report === "vencimentos") ? "Vencimento" : query.area === "ordens" || query.area === "planos" ? "Programação" : "Data do fato";
  const moneyText = (value: string) => `R$ ${value.replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
  const notice = error || message;
  const selectedUnitLabel = selectedUnit ? `${selectedUnit.code} · ${selectedUnit.name}` : "";
  const currentTitle = fleetAreaTitle[query.area];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <OperationalListFrame actions={<>
        <Link href="/frotas/gestao" className={styles.dialogButton}>Gestão da frota</Link>
        {create && permissions.create ? (
          <button
            type="button"
            onClick={() => setEditor({ ...create, initial: { unitId: query.unitId, ...create.initial }, context: selectedUnitLabel || undefined })}
            className="inline-flex h-8 items-center gap-1.5 rounded bg-emerald-700 px-3 text-xs font-semibold text-white outline-none hover:bg-emerald-800 focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
          >
            <Plus className="size-3.5" />
            {create.title}
          </button>
        ) : undefined}
        {permissions.issueReports && <><label className="sr-only" htmlFor="fleet-format">Formato da emissão</label><select id="fleet-format" className="h-7 rounded border px-1" value={format} onChange={e => setFormat(e.target.value)}>{["pdf", "xlsx", "csv", "txt", "print"].map(value => <option key={value} value={value}>{value === "print" ? "Impressão" : value.toUpperCase()}</option>)}</select><button type="button" disabled={exporting} onClick={() => void emit()} className={styles.dialogButton}><Download />{exporting ? "Emitindo" : "Emitir"}</button></>}
        <OperationalFilters label={notice ? "Resultado da operação" : "Resumo do recorte"}><div className="space-y-2"><p role={error ? "alert" : "status"}>{notice || `${currentTitle} · ${list.total} registro(s) no recorte`}</p>{selectedUnit && <><p>{selectedUnitLabel}</p><button type="button" onClick={() => navigate({ unitId: "", page: 1 })}>Toda a frota</button></>}{query.area === "ordens" && <p>Novas emissões são geradas nos planos de manutenção.</p>}{list.amount !== null && <p>Total conhecido: {moneyText(list.amount)}</p>}{Object.entries(list.quantities).map(([unit, quantity]) => <p key={unit}>{quantity} {unit}</p>)}{list.missingCosts > 0 && <p>Parcial · {list.missingCosts} sem custo</p>}</div></OperationalFilters>
      </>}
        toolbar={
          <>
          <form id="fleet-filters" key={href(query)} onSubmit={applyFilters} className={styles.searchForm}>
            <input name="q" aria-label="Buscar código, descrição ou referência" type="search" className={styles.searchInput} value={filters.q} onChange={e => setFilters({ ...filters, q: e.target.value })} placeholder="Código, descrição ou referência" />
            <button type="submit" disabled={pending} className={styles.iconButton} aria-label="Aplicar filtros"><Search /></button>
          </form>
          <OperationalFilters activeCount={[query.category, query.status, query.type, query.origin, query.from, query.to, query.unitId, query.unitIds].filter(Boolean).length}>
            <div className={styles.filterFields}>
              {query.area === "relatorios" && (
                <label className="min-w-44 flex-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500 xl:max-w-72">
                  Relatório
                  <select className="mt-0.5 h-7 w-full rounded border border-slate-300 bg-white px-2 text-[11px] text-slate-800 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600" value={filters.report} onChange={e => setFilters({ ...filters, report: e.target.value as FleetQuery["report"] })}>
                    {Object.entries({ frota: "Listagem geral da frota", vencimentos: "Vencimentos de documentos", abastecimentos: "Abastecimentos por veículo", gastos: "Gastos realizados", manutencoes: "Manutenções efetuadas" }).map(([key, title]) => <option key={key} value={key}>{title}</option>)}
                  </select>
                </label>
              )}
              {!["frota", "rotas"].includes(query.area) && <>
                <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  {dateCaption} inicial
                  <input type="date" className="mt-0.5 h-7 rounded border border-slate-300 bg-white px-2 text-[11px] text-slate-800 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600" value={filters.from} onChange={e => setFilters({ ...filters, from: e.target.value })} />
                </label>
                <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  {dateCaption} final
                  <input type="date" className="mt-0.5 h-7 rounded border border-slate-300 bg-white px-2 text-[11px] text-slate-800 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600" value={filters.to} onChange={e => setFilters({ ...filters, to: e.target.value })} />
                </label>
              </>}
              <button type="submit" form="fleet-filters" disabled={pending} className={styles.primaryButton}>{pending ? "Consultando" : "Aplicar"}</button>
              <button type="button" onClick={() => navigate({ q: "", category: "", status: "", type: "", origin: "", from: "", to: "", unitId: "", unitIds: "", page: 1 })} className="h-7 px-1 text-[11px] font-semibold text-slate-600 outline-none hover:text-emerald-800 focus-visible:ring-2 focus-visible:ring-emerald-600">Limpar</button>
            </div>
              <div className={styles.filterFields}>
                {query.area !== "rotas" && (query.area === "relatorios" ? <div className="sm:col-span-2"><span className="mb-1 block text-[11px] font-semibold text-slate-600">Unidades para o relatório</span><ReferencePicker kind={filters.report === "abastecimentos" ? "allVehicles" : "allUnits"} label="Adicionar unidade ao relatório" value="" onChange={(id, label) => { if (!id || units.some(v => v.id === id)) return; if (units.length >= 50) { setError("Selecione até 50 unidades."); return; } const next = [...units, { id, label: label || id }]; setUnits(next); setFilters({ ...filters, unitId: "", unitIds: next.map(v => v.id).join(",") }); }} /><div className="mt-2 flex flex-wrap gap-1">{units.map(v => <button type="button" key={v.id} aria-label={`Remover ${v.label}`} className="inline-flex h-7 max-w-full items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-2 text-[11px] text-emerald-900" onClick={() => { const next = units.filter(u => u.id !== v.id); setUnits(next); setFilters({ ...filters, unitIds: next.map(u => u.id).join(",") }); }}><span className="truncate">{v.label}</span><X className="size-3.5 shrink-0" /></button>)}</div></div> : <div><span className="mb-1 block text-[11px] font-semibold text-slate-600">Unidade da frota</span><ReferencePicker kind="allUnits" label="Filtro de unidade da frota" value={filters.unitId} selectedLabel={selectedUnitLabel || undefined} onChange={value => setFilters({ ...filters, unitId: value, unitIds: "" })} /></div>)}
                {query.area !== "rotas" && <label className="text-[11px] font-semibold text-slate-600">Categoria<select className={fieldClass + " mt-1"} value={filters.category} onChange={e => setFilters({ ...filters, category: e.target.value as FleetQuery["category"] })}><option value="">Todas</option>{categories.map(value => <option key={value} value={value}>{labels[value]}</option>)}</select></label>}
                {!!statuses.length && <label className="text-[11px] font-semibold text-slate-600">Situação<select className={fieldClass + " mt-1"} value={filters.status} onChange={e => setFilters({ ...filters, status: e.target.value })}><option value="">Todas</option>{statuses.map(value => <option key={value} value={value}>{labels[value]}</option>)}</select></label>}
                {!!filterTypes.length && <label className="text-[11px] font-semibold text-slate-600">Tipo / natureza<select className={fieldClass + " mt-1"} value={filters.type} onChange={e => setFilters({ ...filters, type: e.target.value })}><option value="">Todos</option>{filterTypes.map(value => <option key={value} value={value}>{labels[value]}</option>)}</select></label>}
                {query.area === "consumos" && <label className="text-[11px] font-semibold text-slate-600">Origem do material<select className={fieldClass + " mt-1"} value={filters.origin} onChange={e => setFilters({ ...filters, origin: e.target.value as FleetQuery["origin"] })}><option value="">Todas</option>{["PROPRIO", "TERCEIRO"].map(value => <option key={value} value={value}>{labels[value]}</option>)}</select></label>}
              </div>
          </OperationalFilters>
          </>
        }
        pagination={
          <OperationalPagination page={list.page} total={list.total} pending={pending} onPageChange={page => navigate({ page })} />
        }
      >
        <OperationalTable columns={operationalColumns([...list.columns.map(col => [col.key, col.label, col.numeric ? 150 : 200, col.numeric ? 95 : 80, col.key === "status" ? "status" : "text", col.numeric ? "right" : "left"] as const), ["actions", "Ação", 70, 65, "actions"]])} preferenceId={`frotas-${query.area}-${query.report}`} caption={currentTitle} emptyMessage="Nenhum registro encontrado. Ajuste os filtros ou registre a primeira operação." rows={list.rows.map(row => ({ id: row.id, label: row.cells.unit || row.cells.name || row.cells.title || row.cells.code || row.id, values: row.cells, actions: <button type="button" onClick={() => act("detail", row)} className={styles.iconButton} aria-label={`Abrir ficha de ${row.cells.unit || row.cells.name || row.cells.title || row.cells.code}`}><FileText /></button> }))} />
      </OperationalListFrame>
      {detail && <DetailDialog row={detail} onClose={() => setDetail(null)} onAction={act} canCreate={permissions.create} canUpdate={permissions.update} canIssue={permissions.issueReports} />}
      {editor && <FleetEditor editor={editor} onClose={() => setEditor(null)} onSuccess={value => { setMessage(value); router.refresh(); }} defaultDepartment={departmentId} />}
    </div>
  );
}
