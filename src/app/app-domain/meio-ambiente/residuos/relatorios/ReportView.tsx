"use client";

import Link from "next/link";
import { useRef, useState, type ReactNode } from "react";
import { BarChart3, FileDown, FileSpreadsheet, Info, Package, Printer, Search, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { OperationalFilters, OperationalListFrame, OperationalLinkPagination } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalTable, type OperationalRow } from "@/components/app-ui/operational/OperationalTable";
import { OperationalPagedContent } from "@/components/app-ui/operational/OperationalPagedContent";
import { useOperationalWorkspace } from "@/components/app-ui/operational/OperationalContext";
import styles from "@/components/app-ui/operational/operational.module.css";
import type { OperationalColumn } from "@/lib/operational-tables";
import { OPERATIONAL_PAGE_SIZE } from "@/lib/operational-tables";
import type { RecyclingEntry } from "@/lib/environment/recycling-catalog";
import { recyclingChartPercent, recyclingReportViews, reportDecimal, type RecyclingReportData } from "@/lib/environment/recycling-reports";

const pathname = "/meio-ambiente/residuos/relatorios";
const stockColumns: readonly OperationalColumn[] = [
  { key: "code", label: "Código", type: "identifier", initialWidth: 95, minWidth: 80, resizable: true, sortable: false, details: "overflow" },
  { key: "name", label: "Material", type: "text", initialWidth: 180, minWidth: 120, resizable: true, sortable: false, details: "overflow" },
  { key: "type", label: "Tipo", type: "text", initialWidth: 140, minWidth: 85, resizable: true, sortable: false, details: "overflow" },
  { key: "unit", label: "Unidade", type: "text", initialWidth: 80, minWidth: 65, resizable: true, sortable: false, details: "overflow" },
  { key: "depot", label: "Depósito", type: "text", initialWidth: 170, minWidth: 125, resizable: true, sortable: false, details: "overflow" },
  ...([ ["opening", "Saldo inicial", 120, 95], ["incoming", "Entradas", 100, 80], ["outgoing", "Saídas", 100, 80], ["balance", "Saldo final", 120, 95], ["revenue", "Valor obtido (R$)", 150, 130] ] as const).map(([key, label, initialWidth, minWidth]) => ({ key, label, type: "text" as const, initialWidth, minWidth, resizable: true, sortable: false, details: "overflow" as const, align: "right" as const })),
];
const financialColumns: readonly OperationalColumn[] = [
  { key: "code", label: "Código / referência", type: "identifier", initialWidth: 180, minWidth: 140, resizable: true, sortable: false, details: "overflow" },
  { key: "name", label: "Tipo de material / mês", type: "text", initialWidth: 340, minWidth: 180, resizable: true, sortable: false, details: "overflow" },
  { key: "movements", label: "Saídas registradas", type: "text", initialWidth: 180, minWidth: 145, resizable: true, sortable: false, details: "overflow", align: "right" },
  { key: "revenue", label: "Valor obtido (R$)", type: "text", initialWidth: 240, minWidth: 180, resizable: true, sortable: false, details: "overflow", align: "right" },
];
function ReportDialog({ title, icon, description, children }: { title: string; icon: ReactNode; description: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const { device } = useOperationalWorkspace();
  return <Dialog open={open} onOpenChange={setOpen}>
    <button ref={trigger} type="button" className={styles.iconButton} aria-label={title} title={title} onClick={() => setOpen(true)}>{icon}</button>
    <DialogContent className={`${styles.dialog} ${styles.filtersDialog}`} data-device={device} showCloseButton={false} finalFocus={trigger}>
      <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>
      <OperationalPagedContent device={device} label={title} footer={<button type="button" className={styles.dialogButton} onClick={() => setOpen(false)}><X />Fechar</button>}>{children}</OperationalPagedContent>
    </DialogContent>
  </Dialog>;
}
export function ReportView({ data, entries }: { data: RecyclingReportData; entries: RecyclingEntry[] }) {
  const f = data.filters, chart = f.view === "sales" || f.view === "monthly";
  const values = { ...f };
  const query = new URLSearchParams(values);
  const exportHref = (format: string) => `/api/meio-ambiente/reciclagem/relatorios?${query}&format=${format}`;
  function options(kind: RecyclingEntry["kind"], value: string) {
    const list = entries.filter(entry => entry.kind === kind);
    return <><option value="">Todos</option>{value && !list.some(entry => entry.code.toLocaleUpperCase("pt-BR") === value.toLocaleUpperCase("pt-BR")) && <option value={value}>{value} (histórico)</option>}{list.map(entry => <option key={entry.code} value={entry.code}>{entry.code} · {entry.name}{entry.active ? "" : " (inativo)"}</option>)}</>;
  }
  const columns = chart ? financialColumns : f.view === "depots" ? stockColumns : stockColumns.filter(column => column.key !== "depot");
  const rows: OperationalRow[] = data.rows.map(row => ({ id: row.id, label: `${row.code} · ${row.name}`, values: { ...row, depot: `${row.depotCode} · ${row.depot}`, opening: reportDecimal(row.opening), incoming: reportDecimal(row.incoming), outgoing: reportDecimal(row.outgoing), balance: reportDecimal(row.balance), revenue: reportDecimal(row.revenue) } }));
  const filterFields = ["from", "to", "typeCode", "materialCode", "depotCode", "order"] as const;
  return <OperationalListFrame label="Relatórios de recicláveis" actions={<>
    <Link className={styles.iconButton} href="/meio-ambiente/residuos/estoque" aria-label="Estoque de recicláveis" title="Estoque de recicláveis"><Package /></Link>
    <a className={styles.iconButton} href={exportHref("csv")} aria-label="Exportar CSV completo" title="Exportar CSV completo"><FileDown /></a>
    <a className={styles.iconButton} href={exportHref("xlsx")} aria-label="Exportar Excel completo" title="Exportar Excel completo"><FileSpreadsheet /></a>
    <a className={styles.iconButton} href={exportHref("print")} target="_blank" rel="noopener noreferrer" aria-label="Imprimir relatório completo" title="Imprimir relatório completo"><Printer /></a>
    <ReportDialog title="Totais do filtro" icon={<Info />} description={`${f.from} a ${f.to}`}>
      <dl className="grid gap-3 text-sm"><div><dt>Registros no filtro completo</dt><dd>{data.total}</dd></div><div><dt>Valor total obtido</dt><dd>R$ {reportDecimal(data.revenue)}</dd></div></dl>
      <p className="mt-3 text-sm">O saldo inicial considera os movimentos anteriores ao período. O saldo final considera o histórico até a data final. Quantidades são apresentadas por material e unidade.</p>
    </ReportDialog>
    {chart && <ReportDialog title={f.view === "monthly" ? "Gráfico mensal de vendas" : "Gráfico de vendas por tipo"} icon={<BarChart3 />} description={`Página ${data.page} de ${Math.max(1, Math.ceil(data.total / OPERATIONAL_PAGE_SIZE))}. A paginação da lista permite consultar as demais categorias ou meses.`}>
      <figure aria-label={f.view === "monthly" ? "Valores mensais obtidos com saídas de recicláveis" : "Valores obtidos por tipo de material"} className="grid gap-4">
        {!data.rows.length && <p>Sem vendas no recorte.</p>}
        {data.rows.map(row => <div key={row.id} data-operational-block className="grid gap-1 text-sm">
          <div className="flex flex-wrap justify-between gap-2"><span>{row.name}</span><strong>R$ {reportDecimal(row.revenue)}</strong></div>
          <div className="h-2 rounded bg-muted" aria-hidden="true"><div className="h-full rounded" style={{ width: `${recyclingChartPercent(row.revenue, data.maximum)}%`, background: "var(--op-accent)" }} /></div>
        </div>)}
      </figure>
    </ReportDialog>}
  </>} toolbar={<>
    <form method="get" action={pathname} className={styles.searchForm}>
      {filterFields.map(name => <input key={name} type="hidden" name={name} value={f[name]} />)}
      <select aria-label="Relatório" name="view" defaultValue={f.view} className={styles.searchInput}>{Object.entries(recyclingReportViews).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
      <button type="submit" className={styles.iconButton} aria-label="Aplicar relatório"><Search /></button>
    </form>
    <OperationalFilters activeCount={2 + [f.typeCode, f.materialCode, f.depotCode].filter(Boolean).length}>
      <form method="get" action={pathname} className="grid gap-4">
        <input type="hidden" name="view" value={f.view} />
        <div className={styles.filterFields}>
          <label>Período inicial<input className="rounded border border-input bg-background p-2" type="date" aria-label="Período inicial" name="from" defaultValue={f.from} required /></label>
          <label>Período final<input className="rounded border border-input bg-background p-2" type="date" aria-label="Período final" name="to" defaultValue={f.to} required /></label>
          <label>Tipo de material<select aria-label="Tipo de material" name="typeCode" defaultValue={f.typeCode}>{options("types", f.typeCode)}</select></label>
          <label>Material<select aria-label="Material" name="materialCode" defaultValue={f.materialCode}>{options("materials", f.materialCode)}</select></label>
          <label>Depósito<select aria-label="Depósito" name="depotCode" defaultValue={f.depotCode}>{options("depots", f.depotCode)}</select></label>
          <label>Ordenação<select aria-label="Ordenação" name="order" defaultValue={f.view === "monthly" ? "code" : f.order}><option value="code">Código{f.view === "monthly" ? " (cronológica)" : ""}</option>{f.view !== "monthly" && <option value="description">Descrição</option>}</select></label>
        </div>
        <div className={styles.dialogFooter}><Link className={styles.dialogButton} href={`${pathname}?view=${f.view}`}>Limpar filtros</Link><button type="submit" className={`${styles.dialogButton} ${styles.primaryButton}`}>Aplicar filtros</button></div>
      </form>
    </OperationalFilters>
  </>} pagination={<OperationalLinkPagination pathname={pathname} values={values} page={data.page} total={data.total} />}>
    <OperationalTable columns={columns} rows={rows} preferenceId={`environment-recycling-report-${f.view}`} caption={`${recyclingReportViews[f.view]} — ${f.from} a ${f.to}`} emptyMessage="Nenhum movimento encontrado para os filtros selecionados." />
  </OperationalListFrame>;
}
