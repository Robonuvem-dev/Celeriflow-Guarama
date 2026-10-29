"use client";

import { startTransition, useDeferredValue, useRef, useState } from "react";
import { Download, FileSpreadsheet, FileText, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OperationalListFrame, OperationalFilters } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalTable, OperationalPagination } from "@/components/app-ui/operational/OperationalTable";
import { OPERATIONAL_PAGE_SIZE as PAGE_SIZE } from "@/lib/operational-tables";
import { healthColumn } from "../operational-columns";
import { HealthReadTable } from "../HealthReadTable";
import { OperationalTablePanel } from "@/components/app-ui/operational/OperationalTablePanel";
import { OperationalHeaderActions } from "@/components/app-ui/operational/OperationalWorkspace";
import styles from "@/components/app-ui/operational/operational.module.css";
import { getHealthReportOption, healthAdministrativeReportOptions, type HealthAdministrativeReportType, type HealthReportFilter } from "@/lib/saude/health-report-catalog";

type Option = { id: string; name: string };
type Filters = { from: string; to: string; unitId: string; professionalId: string; specialtyId: string; teamId: string; municipality: string; status: string; cid: string; procedure: string; financing: string; covenant: string; query: string; recordId: string };
type ReportRow = Record<string, string | number>;
type Preview = { reportType: HealthAdministrativeReportType; requirement: string; report: { title: string; warnings: string[]; metadata: { scope: string; referencePeriod: string }; sections: { title: string; rows: ReportRow[] }[] }; chart?: { label: string; value: number; percentage: number }[] };
type ReferenceOptions = { units: Option[]; specialties: Option[]; professionals: Option[]; teams: Option[]; financing: string[]; municipalities: { value: string; label: string }[]; covenantStatuses: string[]; appointmentStatuses: string[] };
const initialFilters: Filters = { from: "", to: "", unitId: "", professionalId: "", specialtyId: "", teamId: "", municipality: "", status: "", cid: "", procedure: "", financing: "", covenant: "", query: "", recordId: "" };

function queryString(reportType: HealthAdministrativeReportType, filters: Filters, format: string) {
  return new URLSearchParams({ reportType, format, ...Object.fromEntries(Object.entries(filters).filter(([, value]) => value)) }).toString();
}

export function HealthReportsClient({ canIssue, options }: { canIssue: boolean; options: ReferenceOptions }) {
  const [reportType, setReportType] = useState<HealthAdministrativeReportType>("CID_LIST");
  const [filters, setFilters] = useState(initialFilters);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [page, setPage] = useState(1);
  const requestVersion = useRef(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const deferredPreview = useDeferredValue(preview);
  const definition = getHealthReportOption(reportType);
  const rows = preview && deferredPreview?.reportType === reportType ? deferredPreview.report.sections.flatMap(section => section.rows) : [];
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const visibleRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const allHeaders = [...new Set(rows.flatMap(row => Object.keys(row)))];
  const headers = allHeaders;
  // Header details provide the complete label when many result fields share
  // the notebook area. Keep every field and the central 13px font unchanged.
  const columnMinimum = Math.max(40, Math.min(110, Math.floor(1200 / Math.max(1, headers.length))));
  const filterSet = new Set<HealthReportFilter>(definition.filters);

  function update(name: keyof Filters, value: string) { requestVersion.current++; setPending(false); setPreview(null); setPage(1); setError(""); setFilters(current => ({ ...current, [name]: value })); }
  function changeReport(value: HealthAdministrativeReportType) { requestVersion.current++; setPending(false); setReportType(value); setFilters(initialFilters); setPreview(null); setPage(1); setError(""); }

  async function generate() {
    const version = ++requestVersion.current;
    setPending(true); setError("");
    try {
      const response = await fetch(`/api/saude/relatorios?${queryString(reportType, filters, "preview")}`, { cache: "no-store" });
      const body = await response.json() as { dataset?: Preview; error?: string };
      if (version !== requestVersion.current) return;
      if (!response.ok || !body.dataset) throw new Error(body.error || "Não foi possível gerar o relatório.");
      startTransition(() => { setPreview(body.dataset!); setPage(1); });
    } catch (cause) { if (version === requestVersion.current) setError(cause instanceof Error ? cause.message : "Não foi possível gerar o relatório."); }
    finally { if (version === requestVersion.current) setPending(false); }
  }

  function exportUrl(format: string) { return `/api/saude/relatorios?${queryString(reportType, filters, format)}`; }

  return <OperationalListFrame label="Relatórios da Saúde" toolbar={<>
    <OperationalFilters label="Relatório e filtros" activeCount={Object.values(filters).filter(Boolean).length}>
      <div className={styles.filterFields}>
        <label className="grid gap-1 text-[11px] font-bold text-slate-600">Relatório<select value={reportType} onChange={event => changeReport(event.target.value as HealthAdministrativeReportType)} className="h-8 min-w-0 rounded border bg-white px-2 text-xs">{healthAdministrativeReportOptions.map(option => <option key={option.type} value={option.type}>{option.requirement} · {option.label}</option>)}</select></label>
        {filterSet.has("period") && <><label className="grid gap-1 text-[11px] font-bold text-slate-600">De<input type="date" value={filters.from} onChange={event => update("from", event.target.value)} className="h-8 rounded border px-2 text-xs" /></label><label className="grid gap-1 text-[11px] font-bold text-slate-600">Até<input type="date" value={filters.to} onChange={event => update("to", event.target.value)} className="h-8 rounded border px-2 text-xs" /></label></>}
        {filterSet.has("unit") && <FilterSelect label="Unidade" value={filters.unitId} onChange={value => update("unitId", value)} options={options.units} />}
        {filterSet.has("professional") && <FilterSelect label="Profissional" value={filters.professionalId} onChange={value => update("professionalId", value)} options={options.professionals} />}
        {filterSet.has("specialty") && <FilterSelect label="Especialidade" value={filters.specialtyId} onChange={value => update("specialtyId", value)} options={options.specialties} />}
        {filterSet.has("team") && <FilterSelect label="Equipe" value={filters.teamId} onChange={value => update("teamId", value)} options={options.teams} />}
        {filterSet.has("municipality") && <label className="grid gap-1 text-[11px] font-bold text-slate-600">Município<select value={filters.municipality} onChange={event => update("municipality", event.target.value)} className="h-8 rounded border bg-white px-2 text-xs"><option value="">Todos</option>{options.municipalities.map(option => <option key={option.label} value={option.value}>{option.label}</option>)}</select></label>}
        {filterSet.has("financing") && <label className="grid gap-1 text-[11px] font-bold text-slate-600">Financiamento<select value={filters.financing} onChange={event => update("financing", event.target.value)} className="h-8 rounded border bg-white px-2 text-xs"><option value="">Todos</option>{options.financing.map(value => <option key={value}>{value}</option>)}</select></label>}
        {filterSet.has("status") && <StatusFilter reportType={reportType} value={filters.status} onChange={value => update("status", value)} covenantStatuses={options.covenantStatuses} appointmentStatuses={options.appointmentStatuses} />}
        {filterSet.has("cid") && <TextFilter label="CID" value={filters.cid} onChange={value => update("cid", value)} />}
        {filterSet.has("procedure") && <TextFilter label="Procedimento" value={filters.procedure} onChange={value => update("procedure", value)} />}
        {filterSet.has("covenant") && <TextFilter label="Convênio" value={filters.covenant} onChange={value => update("covenant", value)} />}
        {filterSet.has("query") && <TextFilter label="Busca" value={filters.query} onChange={value => update("query", value)} />}
        {filterSet.has("record") && <TextFilter label="Registro (ID ou protocolo)" value={filters.recordId} onChange={value => update("recordId", value)} />}
        <div className="flex items-end"><Button className="h-8 w-full" onClick={generate} disabled={!canIssue || pending}>{pending ? "Gerando..." : "Gerar"}</Button></div>
      </div>
      {error && <p role="alert" className="mt-2 text-xs font-semibold text-rose-700">{error}</p>}
      {!canIssue && <p className="mt-2 text-xs font-semibold text-amber-700">Seu perfil não possui permissão para emitir relatórios.</p>}
    </OperationalFilters>
    <span className="truncate text-xs" role="status">{error || (preview ? `${preview.requirement} · ${preview.report.title}` : "Selecione os filtros e gere o relatório.")}</span>
    <Button className="h-7" onClick={generate} disabled={!canIssue || pending}>{pending ? "Gerando..." : "Gerar"}</Button>
    {preview && <OperationalFilters label="Contexto"><p>{preview.report.metadata.scope} · {preview.report.metadata.referencePeriod}</p>{preview.report.warnings.map(warning => <p key={warning}>{warning}</p>)}</OperationalFilters>}
    {preview?.chart && <OperationalTablePanel title="Distribuição por município" triggerLabel="Distribuição por município"><PercentageChart rows={preview.chart} /></OperationalTablePanel>}
  </>} actions={preview && canIssue && <><ExportButton href={exportUrl("pdf")} label="PDF" icon={<FileText className="size-4" />} /><ExportButton href={exportUrl("xlsx")} label="Excel" icon={<FileSpreadsheet className="size-4" />} /><ExportButton href={exportUrl("csv")} label="CSV" icon={<Download className="size-4" />} /><button type="button" onClick={() => window.open(exportUrl("print"), "_blank", "noopener,noreferrer")}><Printer className="inline size-4" />Imprimir</button></>} pagination={<OperationalPagination page={page} total={rows.length} pending={pending} onPageChange={next => setPage(Math.min(Math.max(1, next), pageCount))} />}>
    <OperationalTable preferenceId={`saude-relatorios-${reportType}`} caption={preview?.report.title || "Prévia do relatório"} columns={headers.length ? headers.map(header => healthColumn(header, header, 180, columnMinimum)) : [healthColumn("record", "Registro", 240, 120)]} rows={visibleRows.map((row, index) => ({ id: `${page}-${index}`, label: String(Object.values(row)[0] || index + 1), values: Object.fromEntries(Object.entries(row).map(([key, value]) => [key, String(value)])) }))} state={pending ? "loading" : error ? "error" : "ready"} onRetry={() => void generate()} emptyMessage={preview ? "Nenhum registro encontrado para os filtros informados." : "Selecione os filtros e gere o relatório."} errorMessage={error} />
  </OperationalListFrame>;
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Option[] }) { return <label className="grid gap-1 text-[11px] font-bold text-slate-600">{label}<select value={value} onChange={event => onChange(event.target.value)} className="h-8 min-w-0 rounded border bg-white px-2 text-xs"><option value="">Todos</option>{options.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label>; }
function TextFilter({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="grid gap-1 text-[11px] font-bold text-slate-600">{label}<input value={value} onChange={event => onChange(event.target.value)} className="h-8 min-w-0 rounded border px-2 text-xs" /></label>; }
function StatusFilter({ reportType, value, onChange, covenantStatuses, appointmentStatuses }: { reportType: HealthAdministrativeReportType; value: string; onChange: (value: string) => void; covenantStatuses: string[]; appointmentStatuses: string[] }) { const values = reportType === "COVENANT_LIST" ? covenantStatuses : reportType === "EXTERNAL_DEMAND_BY_SPECIALTY" ? appointmentStatuses : ["active", "inactive"]; return <label className="grid gap-1 text-[11px] font-bold text-slate-600">Situação<select value={value} onChange={event => onChange(event.target.value)} className="h-8 rounded border bg-white px-2 text-xs"><option value="">Todas</option>{values.map(item => <option key={item} value={item}>{item === "active" ? "Ativo" : item === "inactive" ? "Inativo" : item}</option>)}</select></label>; }
function ExportButton({ href, label, icon }: { href: string; label: string; icon: React.ReactNode }) { return <a href={href} className="inline-flex h-7 items-center gap-1 rounded border border-slate-300 bg-white px-2 text-[11px] font-bold">{icon}{label}</a>; }
function PercentageChart({ rows }: { rows: { label: string; value: number; percentage: number }[] }) {
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  return <><OperationalHeaderActions><span>{total} atendimento(s) · 100,00%</span></OperationalHeaderActions><HealthReadTable id="saude-relatorios-distribuicao" label="Distribuição por município" columns={[healthColumn("city", "Município", 300, 130), healthColumn("count", "Atendimentos", 150, 100, "text", "right"), healthColumn("percentage", "Percentual", 150, 90, "text", "right"), { ...healthColumn("chart", "Distribuição", 360, 160), details: "none" }]} rows={rows.map((row, index) => ({ id: `${index}:${row.label}`, label: row.label, values: { city: row.label, count: String(row.value), percentage: `${row.percentage.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}%`, chart: `${row.percentage}%` }, cells: { chart: <div className="h-3 w-full rounded bg-slate-100" role="img" aria-label={`${row.percentage}%`}><div className="h-full rounded bg-emerald-600" style={{ width: `${Math.min(100, row.percentage)}%` }} /></div> } }))} /></>;
}
