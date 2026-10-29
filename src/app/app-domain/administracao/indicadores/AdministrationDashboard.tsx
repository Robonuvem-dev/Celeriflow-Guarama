"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { BarChart3, Building2, Download, FileSpreadsheet, Printer, Users } from "lucide-react";
import { summarizeAdministrationData, type AdministrationBiData } from "@/lib/administration/bi-model";
import { OperationalTablePanel } from "@/components/app-ui/operational/OperationalTablePanel";
import { OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalPagination, OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { OPERATIONAL_PAGE_SIZE } from "@/lib/operational-tables";
import { registryColumns } from "../../cadastros/operational-registry";
import operationalStyles from "@/components/app-ui/operational/operational.module.css";
import styles from "./administration-bi.module.css";

const number = (value: number) => value.toLocaleString("pt-BR");
const short = (label: string, max = 27) => label.length > max ? `${label.slice(0, max - 1)}…` : label;
const colors = ["#2563eb", "#059669", "#7c3aed", "#d97706", "#0891b2", "#e11d48"];

const numericColumns = new Set(["employees", "inactiveEmployees", "departments", "units", "demands", "openDemands", "completedDemands", "overdueDemands"]);
const comparisonColumns = registryColumns([
  ["id", "Código", 90, 60, "identifier"], ["name", "Secretaria", 180, 100], ["acronym", "Sigla", 60, 40],
  ["active", "Status", 75, 55, "status"], ["managerName", "Responsável", 160, 90], ["managerRole", "Cargo do responsável", 140, 80],
  ["managerValid", "Vínculo válido", 90, 65, "status"], ["employees", "Servidores ativos", 100, 60],
  ["inactiveEmployees", "Servidores inativos", 100, 60], ["departments", "Departamentos", 85, 55], ["units", "Unidades", 85, 55],
  ["demands", "Demandas", 85, 55], ["openDemands", "Abertas", 85, 55], ["completedDemands", "Encerradas/canceladas", 110, 65],
  ["overdueDemands", "Vencidas", 85, 60], ["actions", "Ações", 40, 40, "actions"],
]).map(column => numericColumns.has(column.key) ? { ...column, align: "right" as const } : column);

function AdministrationComparison({ data, pending, onSelect, actions, search, onSearch, page, onPageChange }: {
  data: AdministrationBiData; pending: boolean; onSelect: (id: string) => void; actions: ReactNode;
  search: string; onSearch: (value: string) => void; page: number; onPageChange: (page: number) => void;
}) {
  const query = search.trim().toLocaleLowerCase("pt-BR");
  const filtered = data.rows.filter(row => !query || [row.id, row.name, row.acronym, row.managerName, row.managerRole].some(value => value?.toLocaleLowerCase("pt-BR").includes(query)));
  const activePage = Math.min(page, Math.max(1, Math.ceil(filtered.length / OPERATIONAL_PAGE_SIZE)));
  return <OperationalListFrame label="Comparativo completo das secretarias" actions={actions} toolbar={<>
    <select aria-label="Selecionar secretaria ou prefeitura inteira no comparativo" className={operationalStyles.filterButton} value={data.selection} disabled={pending} onChange={event => onSelect(event.target.value)}><option value="">Prefeitura inteira</option>{data.options.map(option => <option key={option.id} value={option.id}>{option.name}{option.active ? "" : " (inativa)"}</option>)}</select>
    <input type="search" className={operationalStyles.searchInput} aria-label="Buscar secretaria, código, sigla ou responsável" placeholder="Buscar secretaria ou responsável" value={search} onChange={event => onSearch(event.target.value)} />
  </>} pagination={<OperationalPagination page={activePage} total={filtered.length} pending={pending} onPageChange={onPageChange} />}>
    <OperationalTable columns={comparisonColumns} preferenceId="administracao-bi-comparativo" caption="Comparativo completo das secretarias na seleção atual" emptyMessage="Nenhuma secretaria encontrada."
      rows={filtered.slice((activePage - 1) * OPERATIONAL_PAGE_SIZE, activePage * OPERATIONAL_PAGE_SIZE).map(row => ({ id: row.id, label: row.name, values: {
        id: row.id, name: row.name, acronym: row.acronym || "—", active: row.active ? "Ativa" : "Inativa",
        managerName: row.managerName || "Responsável não vinculado", managerRole: row.managerRole || "Sem cargo", managerValid: row.managerValid ? "Sim" : row.managerName ? "Revisar vínculo" : "Não",
        employees: number(row.employees), inactiveEmployees: number(row.inactiveEmployees), departments: number(row.departments), units: number(row.units),
        demands: number(row.demands), openDemands: number(row.openDemands), completedDemands: number(row.completedDemands), overdueDemands: number(row.overdueDemands),
      }, actions: <div className={operationalStyles.rowActions}><button type="button" disabled={pending} className={operationalStyles.iconButton} aria-label={`Selecionar ${row.name} nos indicadores`} onClick={() => onSelect(row.id)}><Building2 /></button></div> }))} />
  </OperationalListFrame>;
}

function Bars({ values, label }: { values: { name: string; value: number }[]; label: string }) {
  const max = Math.max(1, ...values.map(v => v.value));
  if (!values.length) return <p className={styles.empty}>Nenhum registro para esta seleção.</p>;
  return <svg className={styles.chart} viewBox={`0 0 430 ${Math.max(1, values.length) * 32}`} role="img" aria-label={label} preserveAspectRatio="xMidYMid meet">
    <title>{label}</title>
    {values.map((item, i) => <g key={`${item.name}-${i}`} transform={`translate(0,${i * 32})`}>
      <title>{`${item.name}: ${number(item.value)}`}</title>
      <text x="0" y="13" fontSize="11" fill="#475569">{short(item.name, 30)}</text>
      <rect x="208" y="2" width="185" height="17" rx="4" fill="#f1f5f9" />
      <rect x="208" y="2" width={185 * item.value / max} height="17" rx="4" fill={colors[i % colors.length]} />
      <text x="425" y="15" textAnchor="end" fontSize="12" fontWeight="700" fill="#0f172a">{number(item.value)}</text>
    </g>)}
  </svg>;
}

export default function AdministrationDashboard({ data }: { data: AdministrationBiData }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [comparisonSearch, setComparisonSearch] = useState("");
  const [comparisonPage, setComparisonPage] = useState(1);
  const [height, setHeight] = useState(650);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!root.current) return;
    const observer = new ResizeObserver(([entry]) => setHeight(entry.contentRect.height));
    observer.observe(root.current);
    return () => observer.disconnect();
  }, []);
  const summary = summarizeAdministrationData(data);
  const totalEmployees = summary.employees;
  const totalDemands = summary.demands;
  const selected = data.rows.find(s => s.id === data.selection);
  const ranked = data.selection ? data.roles.map(r => ({ name: r.name, value: r.employees })) : [...data.rows].sort((a, b) => b.employees - a.employees).map(s => ({ name: s.acronym || s.name, value: s.employees }));
  const chartCount = height < 350 ? 2 : height < 520 ? 4 : 6;
  const metrics = [
    { title: "Servidores ativos", value: number(totalEmployees), detail: `${number(summary.inactiveEmployees)} inativos vinculados`, icon: Users },
    { title: "Secretarias ativas", value: number(summary.secretariats), detail: data.selection ? "Unidade selecionada" : "Estrutura institucional", icon: Building2 },
    { title: "Departamentos", value: number(summary.departments), detail: "Departamentos ativos", icon: BarChart3 },
    { title: "Unidades", value: number(summary.units), detail: "Unidades administrativas ativas", icon: Building2 },
    { title: "Gestores vinculados", value: `${summary.managers}/${summary.secretariats}`, detail: "Servidor ativo com cargo e lotação", icon: Users },
    { title: "Demandas vencidas", value: number(summary.overdueDemands), detail: `${number(summary.openDemands)} demandas em aberto`, icon: BarChart3 },
  ];
  const finished = summary.completedDemands;
  const open = summary.openDemands;
  const rate = summary.demands ? finished / summary.demands : 0;
  const exportUrl = (format: string) => `/api/administracao/indicadores/exportar?${new URLSearchParams({ format, secretariatId: data.selection })}`;
  const [exportFormat, setExportFormat] = useState("xlsx");
  function selectSecretariat(id: string) {
    setComparisonPage(1);
    startTransition(() => router.replace(`${pathname}${id ? `?secretariatId=${encodeURIComponent(id)}` : ""}`));
  }

  return <div ref={root} data-administration-bi className={styles.page} aria-busy={pending}>
    <header className={styles.header}>
      <div className={styles.heading}><span className={styles.eyebrow}>ADMINISTRAÇÃO · BUSINESS INTELLIGENCE</span><h1>Painel de gestão <span>municipal</span></h1><p title={data.institution}>{data.institution}</p></div>
      <div className={styles.controls}>
        <label className={styles.scope}><span>Visão dos indicadores</span><select aria-label="Selecionar secretaria ou prefeitura inteira" value={data.selection} disabled={pending} onChange={event => selectSecretariat(event.target.value)}><option value="">Prefeitura inteira</option>{data.options.map(s => <option key={s.id} value={s.id}>{s.name}{!s.active ? " (inativa)" : ""}</option>)}</select></label>
        <div className={styles.exportControls}>
          <select aria-label="Formato de exportação" value={exportFormat} onChange={event => setExportFormat(event.target.value)}><option value="xlsx">Excel (.xlsx)</option><option value="csv">CSV (.csv)</option><option value="powerbi">Power BI (.zip)</option></select>
          <a aria-label={`Exportar indicadores selecionados para ${exportFormat === "xlsx" ? "Excel" : exportFormat === "csv" ? "CSV" : "Power BI"}`} title={exportFormat === "powerbi" ? "Pacote CSV + consulta Power Query para importar no Power BI" : "Exportar dados da seleção atual"} href={exportUrl(exportFormat)}><Download size={15} /><span>Exportar</span></a>
          <button type="button" onClick={() => window.print()} title="Imprimir esta tela ou salvar como PDF" aria-label="Imprimir ou salvar a tela selecionada em PDF"><Printer size={15} /><span>PDF</span></button>
        </div>
      </div>
    </header>

    <div className={styles.scopeLine}><strong title={selected?.name}>{pending ? "Atualizando indicadores…" : selected?.name || "Visão consolidada da prefeitura"}</strong><span>{new Date(data.capturedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })}</span></div>
    <section className={styles.metrics} aria-label="Indicadores principais">{metrics.map(metric => <article key={metric.title} className={styles.metric}><div><span>{metric.title}</span><strong>{metric.value}</strong><small>{metric.detail}</small></div><metric.icon size={20} aria-hidden="true" /></article>)}</section>

    <div className={styles.visuals}>
      <section className={`${styles.panel} ${styles.workforce}`}><div className={styles.panelTitle}><h2>{data.selection ? "Equipe por cargo" : "Servidores por secretaria"}</h2><span>Top {Math.min(chartCount, ranked.length)}</span></div><Bars values={ranked.slice(0, chartCount)} label={data.selection ? "Distribuição dos servidores ativos por cargo" : "Secretarias com mais servidores ativos"} /></section>
      <section className={`${styles.panel} ${styles.demandPanel}`}><div className={styles.panelTitle}><h2>Demandas internas</h2><span>{number(totalDemands)} registros</span></div><div className={styles.donutContent}><svg viewBox="0 0 160 160" className={styles.donut} role="img" aria-label={`${open} demandas abertas; ${finished} encerradas ou canceladas`}><circle cx="80" cy="80" r="59" fill="none" stroke="#e2e8f0" strokeWidth="17" /><circle cx="80" cy="80" r="59" fill="none" stroke="#059669" strokeWidth="17" pathLength="100" strokeDasharray={`${rate * 100} 100`} transform="rotate(-90 80 80)" /><text x="80" y="80" textAnchor="middle" fontSize="28" fontWeight="700" fill="#0f172a">{Math.round(rate * 100)}%</text><text x="80" y="99" textAnchor="middle" fontSize="11" fill="#64748b">finalizadas*</text></svg><div className={styles.legend}><span><i style={{ background: "#e2e8f0" }} />Em aberto <b>{number(open)}</b></span><span><i style={{ background: "#059669" }} />Finalizadas* <b>{number(finished)}</b></span><span className={styles.danger}>Vencidas <b>{number(summary.overdueDemands)}</b></span></div></div><p className={styles.caption}>*Encerradas e canceladas. Vencidas fazem parte das abertas.</p></section>
      <section className={`${styles.panel} ${styles.trendPanel}`}><div className={styles.panelTitle}><h2>Entrada de demandas</h2><span>Últimos 6 meses</span></div><svg className={styles.chart} viewBox="0 0 320 150" role="img" aria-label="Demandas cadastradas por mês"><title>Demandas cadastradas por mês nos últimos seis meses</title>{data.timeline.map((item, i) => { const bar = 100 * item.demands / Math.max(1, ...data.timeline.map(t => t.demands)); return <g key={item.month}><title>{`${item.month}: ${item.demands} demandas`}</title><rect x={i * 51 + 12} y={116 - bar} width="28" height={bar || 1} rx="3" fill="#2563eb" /><text x={i * 51 + 26} y={108 - bar} textAnchor="middle" fontSize="11" fill="#0f172a">{item.demands}</text><text x={i * 51 + 26} y="137" textAnchor="middle" fontSize="11" fill="#64748b">{item.label}</text></g>; })}</svg></section>
    </div>

    <section className={styles.panel} aria-label="Comparativo das secretarias">
      <div className={styles.panelTitle}><h2>{selected ? "Responsável e estrutura da secretaria" : "Comparativo das secretarias"}</h2><span>{number(data.rows.length)} secretarias na seleção</span></div>
      <OperationalTablePanel title="Comparativo das secretarias" triggerLabel="Consultar tabela completa" description="Todos os campos da seleção atual, com 20 registros por página.">
        <AdministrationComparison data={data} pending={pending} onSelect={selectSecretariat} search={comparisonSearch} onSearch={value => { setComparisonSearch(value); setComparisonPage(1); }} page={comparisonPage} onPageChange={setComparisonPage} actions={<>
          <select aria-label="Formato de exportação do comparativo" className={operationalStyles.filterButton} value={exportFormat} onChange={event => setExportFormat(event.target.value)}><option value="xlsx">Excel (.xlsx)</option><option value="csv">CSV (.csv)</option><option value="powerbi">Power BI (.zip)</option></select>
          <a className={operationalStyles.dialogButton} href={exportUrl(exportFormat)} aria-label="Exportar seleção completa dos indicadores"><Download />Exportar</a>
          <button type="button" className={operationalStyles.dialogButton} onClick={() => window.print()} aria-label="Imprimir indicadores selecionados"><Printer />PDF</button>
        </>} />
      </OperationalTablePanel>
    </section>
    <footer className={styles.footnote}><span>Base cadastral atual · Demandas: histórico total{data.unassignedEmployees || data.unassignedDemands ? ` · Sem secretaria: ${data.unassignedEmployees} servidores / ${data.unassignedDemands} demandas` : ""}</span><span><FileSpreadsheet size={12} />Exportações respeitam a seleção atual</span></footer>
  </div>;
}
