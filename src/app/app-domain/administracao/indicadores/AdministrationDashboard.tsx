"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { BarChart3, Building2, ChevronLeft, ChevronRight, Download, FileSpreadsheet, Printer, Users } from "lucide-react";
import { summarizeAdministrationData, type AdministrationBiData } from "@/lib/administration/bi-model";
import styles from "./administration-bi.module.css";

const number = (value: number) => value.toLocaleString("pt-BR");
const short = (label: string, max = 27) => label.length > max ? `${label.slice(0, max - 1)}…` : label;
const colors = ["#2563eb", "#059669", "#7c3aed", "#d97706", "#0891b2", "#e11d48"];

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
  const [page, setPage] = useState(0);
  const [height, setHeight] = useState(650);
  const [pageSize, setPageSize] = useState(1);
  const root = useRef<HTMLDivElement>(null);
  const tableArea = useRef<HTMLDivElement>(null);
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
  useEffect(() => {
    const area = tableArea.current;
    if (!area) return;
    const measure = () => {
      const table = area.querySelector("table");
      const row = table?.tBodies[0]?.rows[0];
      if (!table?.tHead || !row) return;
      setPageSize(Math.max(1, Math.min(8, Math.floor((area.clientHeight - table.tHead.getBoundingClientRect().height) / row.getBoundingClientRect().height))));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(area);
    measure();
    return () => observer.disconnect();
  }, [height]);
  const pages = Math.max(1, Math.ceil(data.rows.length / pageSize));
  const currentPage = Math.min(page, pages - 1);
  const rows = data.rows.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
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

  return <div ref={root} data-administration-bi className={styles.page} aria-busy={pending}>
    <header className={styles.header}>
      <div className={styles.heading}><span className={styles.eyebrow}>ADMINISTRAÇÃO · BUSINESS INTELLIGENCE</span><h1>Painel de gestão <span>municipal</span></h1><p title={data.institution}>{data.institution}</p></div>
      <div className={styles.controls}>
        <label className={styles.scope}><span>Visão dos indicadores</span><select aria-label="Selecionar secretaria ou prefeitura inteira" value={data.selection} disabled={pending} onChange={event => { const value = event.target.value; setPage(0); startTransition(() => router.replace(`${pathname}${value ? `?secretariatId=${encodeURIComponent(value)}` : ""}`)); }}><option value="">Prefeitura inteira</option>{data.options.map(s => <option key={s.id} value={s.id}>{s.name}{!s.active ? " (inativa)" : ""}</option>)}</select></label>
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

    <section className={`${styles.panel} ${styles.comparison}`} aria-label="Comparativo das secretarias">
      <div className={styles.panelTitle}><h2>{selected ? "Responsável e estrutura da secretaria" : "Comparativo das secretarias"}</h2><div className={styles.pagination}><span>{currentPage + 1}/{pages}</span><button aria-label="Secretarias anteriores" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={14} /></button><button aria-label="Próximas secretarias" disabled={currentPage === pages - 1} onClick={() => setPage(currentPage + 1)}><ChevronRight size={14} /></button></div></div>
      <div ref={tableArea} className={styles.tableArea}><table><thead><tr><th>Secretaria / responsável</th><th>Servidores</th><th className={styles.extraColumn}>Deptos.</th><th className={styles.extraColumn}>Unidades</th><th>Abertas</th><th>Vencidas</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td><button className={styles.rowSelect} onClick={() => { setPage(0); startTransition(() => router.replace(`${pathname}?secretariatId=${encodeURIComponent(row.id)}`)); }} title={row.name}>{row.acronym || short(row.name, 35)}{!row.active ? " · Inativa" : ""}</button><span className={styles.manager} title={`${row.managerName || "Responsável não vinculado"} · ${row.managerRole || "Sem cargo"}`}>{row.managerName || "Responsável não vinculado"}<span className={styles.role}> · {row.managerRole || "Sem cargo"}</span>{!row.managerValid && row.managerName ? " · Revisar vínculo" : ""}</span></td><td>{number(row.employees)}</td><td className={styles.extraColumn}>{row.departments}</td><td className={styles.extraColumn}>{row.units}</td><td>{row.openDemands}</td><td className={row.overdueDemands ? styles.danger : ""}>{row.overdueDemands}</td></tr>)}</tbody></table>{!rows.length && <p className={styles.empty}>Nenhuma secretaria cadastrada.</p>}</div>
    </section>
    <footer className={styles.footnote}><span>Base cadastral atual · Demandas: histórico total{data.unassignedEmployees || data.unassignedDemands ? ` · Sem secretaria: ${data.unassignedEmployees} servidores / ${data.unassignedDemands} demandas` : ""}</span><span><FileSpreadsheet size={12} />Exportações respeitam a seleção atual</span></footer>
  </div>;
}
