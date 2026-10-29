"use client";

import { useState } from "react";
import { ArrowRightLeft, RotateCcw, WalletCards } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { collectRevenueAction, launchRevenueAction, recordRevenueCollectionAction, redistributeRevenueResourceSourceAction, reverseRevenueAction } from "./actions";
import FinanceOperationalList from "../FinanceOperationalList";
import { financeColumn } from "../operational-columns";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import styles from "@/components/app-ui/operational/operational.module.css";

type Revenue = {
  id: string; date: string; value: number; stage: "LANCADA" | "ARRECADADA" | "ESTORNADA"; classification: "ORCAMENTARIA" | "INTRAORCAMENTARIA" | "REDUTORA"; history: string | null;
  revenueNature: { code: string; name: string }; resourceSource: { code: string; name: string }; resourceSourceId: string; redistributedValue: number; hasReversal: boolean;
};

const today = () => new Date().toISOString().slice(0, 10);
const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const stageLabel = { LANCADA: "Lancada", ARRECADADA: "Arrecadada", ESTORNADA: "Estornada" };
const classificationLabel = { ORCAMENTARIA: "Orcamentaria", INTRAORCAMENTARIA: "Intraorcamentaria", REDUTORA: "Redutora" };
const columns = [financeColumn("date", "Data", 90), financeColumn("nature", "Natureza", 180, 280), financeColumn("source", "Fonte", 90), financeColumn("value", "Valor", 110, 140, "text", "right"), financeColumn("stage", "Situação", 100, 120, "status"), financeColumn("classification", "Classificação", 135), financeColumn("actions", "Ações", 64, 64, "actions")];

export default function ReceitasClient({ revenues, revenueNatures, resourceSources, bankAccounts, budgetUnits }: {
  revenues: Revenue[];
  revenueNatures: { id: string; code: string; name: string }[];
  resourceSources: { id: string; code: string; name: string }[];
  bankAccounts: { id: string; bankName: string; agency: string; accountNumber: string; resourceSourceId: string | null; budgetUnitId: string | null; isActive: boolean }[];
  budgetUnits: { id: string; name: string; governmentEntityName: string }[];
}) {
  const [mode, setMode] = useState<"LANCAR" | "ARRECADAR">("ARRECADAR");
  const [formOpen, setFormOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [pending, setPending] = useState(false);
  const [form, setForm] = useState({ date: today(), value: 0, revenueNatureId: "", resourceSourceId: "", budgetUnitId: "", classification: "ORCAMENTARIA" as Revenue["classification"], bankAccountId: "", history: "" });

  async function submit() {
    setPending(true);
    const result = mode === "LANCAR"
      ? await launchRevenueAction(form)
      : await recordRevenueCollectionAction(form);
    setPending(false);
    if (result.error) return alert(result.error);
    setForm({ ...form, value: 0, history: "" });
  }

  async function collect(revenue: Revenue) {
    const bankAccountId = window.prompt("Informe o ID da conta bancaria para arrecadacao:");
    if (!bankAccountId) return;
    const result = await collectRevenueAction({ revenueId: revenue.id, date: today(), bankAccountId });
    if (result.error) alert(result.error);
  }

  async function reverse(revenue: Revenue) {
    const justification = window.prompt("Justificativa obrigatoria para o estorno:");
    if (!justification) return;
    const result = await reverseRevenueAction({ revenueId: revenue.id, date: today(), justification });
    if (result.error) alert(result.error);
  }

  async function redistribute(revenue: Revenue) {
    const destinationResourceSourceId = window.prompt("ID da fonte de destino:");
    const rawValue = window.prompt("Valor a redistribuir:");
    const history = window.prompt("Historico da redistribuicao:");
    if (!destinationResourceSourceId || !rawValue || !history) return;
    const result = await redistributeRevenueResourceSourceAction({ revenueId: revenue.id, date: today(), value: Number(rawValue.replace(",", ".")), destinationResourceSourceId, history });
    if (result.error) alert(result.error);
  }

  const compatibleAccounts = bankAccounts.filter((account) => account.isActive && account.resourceSourceId === form.resourceSourceId);
  const filteredRevenues = revenues.filter((revenue) => [revenue.history, revenue.revenueNature.code, revenue.revenueNature.name, revenue.resourceSource.code].some((value) => (value ?? "").toLowerCase().includes(search.toLowerCase())));
  return <>
    <Dialog open={formOpen} onOpenChange={setFormOpen}><DialogContent className="sm:max-w-3xl"><DialogHeader><DialogTitle>Registrar nova receita</DialogTitle></DialogHeader><Card size="sm" className="border-0 rounded-md shadow-none">
      <CardHeader className="border-b pb-2"><CardTitle>Registro de Receita</CardTitle><CardDescription>Lance ou arrecade valores com a fonte e conta bancária compatíveis.</CardDescription></CardHeader>
      <CardContent className="space-y-3 pt-3">
        <div className="flex flex-wrap gap-1.5"><Button size="sm" variant={mode === "ARRECADAR" ? "default" : "outline"} onClick={() => setMode("ARRECADAR")}>Arrecadar agora</Button><Button size="sm" variant={mode === "LANCAR" ? "default" : "outline"} onClick={() => setMode("LANCAR")}>Lancamento previo</Button></div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <div><Label>Data</Label><Input type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></div>
          <div><Label>Natureza</Label><Select items={revenueNatures.map((item) => ({ value: item.id, label: `${item.code} - ${item.name}` }))} value={form.revenueNatureId} onValueChange={(revenueNatureId) => { if (revenueNatureId) setForm({ ...form, revenueNatureId }); }}><SelectTrigger className="w-full"><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent className="max-h-[300px] !w-auto min-w-[var(--anchor-width)]">{revenueNatures.map((item) => <SelectItem key={item.id} value={item.id}>{item.code} - {item.name}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>Fonte</Label><Select items={resourceSources.map((item) => ({ value: item.id, label: `${item.code} - ${item.name}` }))} value={form.resourceSourceId} onValueChange={(resourceSourceId) => { if (resourceSourceId) setForm({ ...form, resourceSourceId, bankAccountId: "" }); }}><SelectTrigger className="w-full"><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent className="max-h-[300px] !w-auto min-w-[var(--anchor-width)]">{resourceSources.map((item) => <SelectItem key={item.id} value={item.id}>{item.code} - {item.name}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>Classificacao</Label><Select value={form.classification} onValueChange={(classification) => setForm({ ...form, classification: classification as Revenue["classification"] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(classificationLabel).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
          {mode === "LANCAR" && <div><Label>Unidade gestora</Label><Select value={form.budgetUnitId} onValueChange={(budgetUnitId) => { if (budgetUnitId) setForm({ ...form, budgetUnitId }); }}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{budgetUnits.map((unit) => <SelectItem key={unit.id} value={unit.id}>{unit.governmentEntityName} — {unit.name}</SelectItem>)}</SelectContent></Select></div>}
          <div><Label>Valor</Label><MoneyInput value={form.value} onChange={(value) => setForm({ ...form, value })} /></div>
          {mode === "ARRECADAR" && <div><Label>Conta bancaria compativel</Label><Select value={form.bankAccountId} onValueChange={(bankAccountId) => { if (bankAccountId) setForm({ ...form, bankAccountId }); }}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{compatibleAccounts.map((item) => <SelectItem key={item.id} value={item.id}>{item.bankName} {item.agency}/{item.accountNumber}</SelectItem>)}</SelectContent></Select></div>}
        </div>
        <div><Label>Historico</Label><Input value={form.history} onChange={(event) => setForm({ ...form, history: event.target.value })} /></div>
        <Button disabled={pending} onClick={submit}>{pending ? "Registrando..." : mode === "LANCAR" ? "Lancar receita" : "Arrecadar receita"}</Button>
      </CardContent>
    </Card></DialogContent></Dialog>
    <FinanceOperationalList label="Receitas" preferenceId="financeiro-receitas" columns={columns} searchable={false} resetKey={search}
      actions={<button className={styles.newButton} onClick={() => setFormOpen(true)}>Registrar receita</button>}
      toolbar={<><input aria-label="Buscar receita" className={styles.searchInput} value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar receita…" /><span title="Estornos preservam a receita de origem; redistribuições não alteram o caixa.">Lançamentos e arrecadações</span></>}
      rows={filteredRevenues.map(revenue => ({ id: revenue.id, label: `${revenue.revenueNature.code} / ${revenue.date}`, values: { date: new Date(revenue.date).toLocaleDateString("pt-BR"), nature: `${revenue.revenueNature.code} - ${revenue.revenueNature.name}`, source: revenue.resourceSource.code, value: currency.format(revenue.value), stage: stageLabel[revenue.stage], classification: classificationLabel[revenue.classification] }, actions: <div className={styles.rowActions}>
        {revenue.stage === "LANCADA" && <button className={styles.iconButton} aria-label="Arrecadar receita" title="Arrecadar" onClick={() => void collect(revenue)}><WalletCards /></button>}
        {revenue.stage === "ARRECADADA" && <><button className={styles.iconButton} aria-label="Redistribuir fonte" title="Redistribuir fonte" onClick={() => void redistribute(revenue)}><ArrowRightLeft /></button><button className={styles.iconButton} aria-label="Estornar receita" title="Estornar" disabled={revenue.redistributedValue > 0} onClick={() => void reverse(revenue)}><RotateCcw /></button></>}
      </div> }))} />
  </>;
}
