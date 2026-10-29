"use client";
import { useState, useTransition } from "react";
import { BarChart3 } from "lucide-react";
import { loadBiAction } from "./actions";
import { OperationalTablePanel } from "@/components/app-ui/operational/OperationalTablePanel";
import { TaxOperationalTable } from "../TaxOperationalTable";
type Bi = Awaited<ReturnType<typeof loadBiAction>>["bi"];
type BiDebt = { cda: string; origin: string; status: string; value: number; taxpayerId: string };
const input = "h-8 w-full rounded-md border border-slate-300 bg-white px-2 text-xs dark:border-slate-700 dark:bg-slate-900";
const button = "inline-flex h-8 items-center justify-center rounded-md bg-amber-500 px-2.5 text-xs font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-50";
const money = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
function Card({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return <div className="rounded-lg border bg-white p-3 dark:border-slate-800 dark:bg-slate-950"><p className="text-[10px] uppercase text-slate-500">{label}</p><p className="text-lg font-bold">{value}</p>{sub && <p className="text-[10px] text-slate-500">{sub}</p>}</div>;
}
function Bars({ rows, format }: { rows: { label: string; count: number; total: number }[]; format: (v: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.total));
  return <div className="grid gap-1">{rows.slice(0, 12).map((r) => <div key={r.label} className="grid grid-cols-[140px_1fr_110px] items-center gap-2 text-[11px]"><span className="truncate">{r.label}</span><div className="h-2.5 overflow-hidden rounded bg-slate-200 dark:bg-slate-800"><div className="h-full bg-amber-500" style={{ width: `${Math.round((r.total / max) * 100)}%` }} /></div><span className="text-right">{format(r.total)} · {r.count}</span></div>)}</div>;
}
export default function BiTributarioClient({ initial }: { initial: { bi: Bi; year: number } }) {
  const [bi, setBi] = useState<Bi>(initial.bi);
  const [year, setYear] = useState(initial.year);
  const [drill, setDrill] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  const reload = (next: { year?: number; taxName?: string; debtStatus?: string }) => start(async () => {
    const r = await loadBiAction(next);
    if (r.error || !r.bi) { setMessage(r.error ?? "Falha ao carregar."); return; }
    setBi(r.bi);
    setMessage("");
  });
  if (!bi) return <p className="p-3 text-xs">BI indisponível.</p>;
  const loadedDebts: BiDebt[] = bi.drillDebts;
  const drillRows = drill ? loadedDebts.filter(debt => debt.status === drill) : loadedDebts;
  return <div className="flex h-full min-h-0 flex-1 flex-col gap-2 overflow-hidden p-2 sm:p-2.5">
    <header className="flex flex-wrap items-center justify-between gap-2"><div><h1 className="flex items-center gap-2 text-lg font-bold"><BarChart3 className="size-5 text-amber-500" />BI Tributário</h1><p className="text-[11px] text-slate-500">Indicadores calculados da base real — sem valores fixos de gráfico.</p></div>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); reload({ year }); }}><input className={input} style={{ maxWidth: 110 }} type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} /><button className={button} disabled={pending}>Filtrar</button></form></header>
    {message && <p className="rounded-md border border-blue-200 bg-blue-50 px-3 py-1 text-xs text-blue-800">{message}</p>}
    <main className="grid min-h-0 flex-1 content-start gap-2 overflow-auto">
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <Card label="Previsto" value={money(bi.previsto)} sub={`${bi.counts.assessments} lançamentos`} />
        <Card label="Realizado" value={money(bi.realizado)} sub={`${bi.counts.payments} pagamentos · ${bi.collectionRate}%`} />
        <Card label="Saldo parcelamentos" value={money(bi.agreementsBalance)} sub={`${bi.counts.agreements} acordos`} />
        <Card label="Execução fiscal" value={String(bi.counts.cases)} sub={`${bi.counts.protestItems} itens em protesto`} />
      </div>
      <div className="grid gap-2 xl:grid-cols-2">
        <section className="rounded-lg border bg-white p-3 dark:border-slate-800 dark:bg-slate-950"><h2 className="mb-2 text-sm font-bold">Arrecadação por tributo (previsto)</h2><Bars rows={bi.byTax} format={money} /></section>
        <section className="rounded-lg border bg-white p-3 dark:border-slate-800 dark:bg-slate-950"><h2 className="mb-2 text-sm font-bold">Arrecadação por tributo (realizado)</h2><Bars rows={bi.paidByTax} format={money} /></section>
        <section className="rounded-lg border bg-white p-3 dark:border-slate-800 dark:bg-slate-950"><h2 className="mb-2 text-sm font-bold">Tendência mensal de pagamentos</h2><Bars rows={bi.paymentTrend} format={money} /></section>
        <section className="rounded-lg border bg-white p-3 dark:border-slate-800 dark:bg-slate-950"><h2 className="mb-2 text-sm font-bold">Tendência mensal do ISS apurado</h2><Bars rows={bi.issTrend} format={money} /></section>
        <section className="rounded-lg border bg-white p-3 dark:border-slate-800 dark:bg-slate-950"><h2 className="mb-2 text-sm font-bold">Dívida ativa por situação</h2><Bars rows={bi.debtsByStatus} format={money} /></section>
        <section className="rounded-lg border bg-white p-3 dark:border-slate-800 dark:bg-slate-950"><h2 className="mb-2 text-sm font-bold">Dívida ativa por origem</h2><Bars rows={bi.debtsByOrigin} format={money} /></section>
        <section className="rounded-lg border bg-white p-3 dark:border-slate-800 dark:bg-slate-950"><h2 className="mb-2 text-sm font-bold">Parcelamentos por situação</h2><Bars rows={bi.agreementsByStatus} format={money} /></section>
        <section className="rounded-lg border bg-white p-3 dark:border-slate-800 dark:bg-slate-950"><h2 className="mb-2 text-sm font-bold">IPTU por zona fiscal</h2><Bars rows={bi.iptuByZone} format={money} /></section>
        <section className="rounded-lg border bg-white p-3 dark:border-slate-800 dark:bg-slate-950"><h2 className="mb-2 text-sm font-bold">IPTU por uso do imóvel</h2><Bars rows={bi.iptuByUse} format={money} /></section>
        <section className="rounded-lg border bg-white p-3 dark:border-slate-800 dark:bg-slate-950"><h2 className="mb-2 text-sm font-bold">ISS por atividade</h2><Bars rows={bi.issByActivity} format={money} /></section>
        <section className="rounded-lg border bg-white p-3 dark:border-slate-800 dark:bg-slate-950"><h2 className="mb-2 text-sm font-bold">Execução fiscal por situação</h2><Bars rows={bi.executionByStatus} format={(v) => String(v)} /></section>
        <section className="rounded-lg border bg-white p-3 dark:border-slate-800 dark:bg-slate-950"><h2 className="mb-2 text-sm font-bold">Protesto por situação</h2><Bars rows={bi.protestByStatus} format={(v) => String(v)} /></section>
      </div>
      <section className="rounded-lg border bg-white p-2 dark:border-slate-800 dark:bg-slate-950">
        <OperationalTablePanel title="BI tributário — detalhamento da dívida ativa" triggerLabel="Abrir detalhamento da dívida ativa" description="Tabela dos registros carregados no BI, com filtro por situação; indicadores e gráficos permanecem no painel de origem.">
          <TaxOperationalTable id="bi-divida-ativa" resetKey={`${year}:${drill ?? ""}`} state={pending ? "loading" : "ready"}
            toolbar={<><label className="flex items-center gap-2 text-[13px]">Situação<select aria-label="Situação da dívida no BI" value={drill ?? ""} onChange={event => setDrill(event.target.value || null)} className="h-7 rounded border px-2"><option value="">Todas</option>{["INSCRITA", "EM_COBRANCA", "EM_PROTESTO", "AJUIZADA", "PAGA"].map(status => <option key={status}>{status}</option>)}</select></label><span className="text-[13px]">Exercício {year}</span></>}
            columns={[["cda", "CDA", 70, 180, "identifier"], ["origin", "Origem", 60, 170], ["status", "Situação", 70, 180, "status"], ["value", "Valor", 70, 150, "text", "right"], ["taxpayer", "Contribuinte", 90, 300, "identifier"]]}
            rows={drillRows.map((debt, index) => ({ id: `${debt.cda}:${debt.taxpayerId}:${index}`, label: debt.cda, values: { cda: debt.cda, origin: debt.origin, status: debt.status, value: money(debt.value), taxpayer: debt.taxpayerId } }))} />
        </OperationalTablePanel>
      </section>
    </main>
  </div>;
}
