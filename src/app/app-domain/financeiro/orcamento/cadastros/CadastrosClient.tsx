"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import FinanceTablePanel from "../../FinanceTablePanel";
import { financeColumn } from "../../operational-columns";
import styles from "@/components/app-ui/operational/operational.module.css";
import { createMasterData, deleteMasterData, updateMasterData } from "../actions";

type ProcurementOriginPolicy = "NONE" | "PROCUREMENT_SOURCE" | "CONTRACT";
type Item = { id: string; code: string; name: string; secretariatId?: string; secretariat?: { name: string }; procurementOriginPolicy?: ProcurementOriginPolicy };
type Type = "budgetUnit" | "resourceSource" | "revenueNature" | "expenseNature";
const labels: Record<Type, string> = { budgetUnit: "Unidades orçamentárias", resourceSource: "Fontes de recursos", revenueNature: "Naturezas de receita", expenseNature: "Naturezas de despesa" };

export default function CadastrosClient({ secretariats, budgetUnits, resourceSources, revenueNatures, expenseNatures }: { secretariats: { id: string; name: string }[]; budgetUnits: Item[]; resourceSources: Item[]; revenueNatures: Item[]; expenseNatures: Item[] }) {
  const [type, setType] = useState<Type>("budgetUnit");
  const [editing, setEditing] = useState<Item | null>(null);
  const [form, setForm] = useState<{ code: string; name: string; secretariatId: string; procurementOriginPolicy: ProcurementOriginPolicy }>({ code: "", name: "", secretariatId: "", procurementOriginPolicy: "NONE" });
  const [pending, setPending] = useState(false);
  const items = type === "budgetUnit" ? budgetUnits : type === "resourceSource" ? resourceSources : type === "revenueNature" ? revenueNatures : expenseNatures;
  const reset = () => { setEditing(null); setForm({ code: "", name: "", secretariatId: "", procurementOriginPolicy: "NONE" }); };
  const submit = async (event: React.FormEvent) => { event.preventDefault(); setPending(true); const result = editing ? await updateMasterData(type, editing.id, form) : await createMasterData(type, form); setPending(false); if (result.error) return alert(result.error); reset(); };
  const edit = (item: Item) => { setEditing(item); setForm({ code: item.code, name: item.name, secretariatId: item.secretariatId ?? "", procurementOriginPolicy: item.procurementOriginPolicy ?? "NONE" }); };
  const remove = async (id: string) => { if (!window.confirm("Excluir este cadastro? Registros vinculados impedirão a exclusão.")) return; const result = await deleteMasterData(type, id); if (result.error) alert(result.error); };

  return <div className="flex h-full min-h-0 flex-col gap-2 overflow-hidden px-1 py-1 sm:px-2">
    <header className="shrink-0 border-b border-slate-300 bg-white px-3 py-2 shadow-sm"><h1 className="text-sm font-bold tracking-tight text-slate-900">Cadastros Orçamentários</h1><p className="text-xs text-muted-foreground">Estruturas administrativas e classificações da LOA.</p></header>
    <div className="flex shrink-0 flex-wrap gap-1 border border-slate-300 bg-white p-1">{(Object.keys(labels) as Type[]).map(key => <Button key={key} size="sm" variant={type === key ? "default" : "outline"} onClick={() => { setType(key); reset(); }}>{labels[key]}</Button>)}</div>
    <details className="shrink-0 rounded-md border border-slate-200 bg-white"><summary className="cursor-pointer px-3 py-2 text-xs font-semibold">{editing ? `Editar ${labels[type].slice(0, -1)}` : `Novo cadastro: ${labels[type]}`}</summary><div className="p-3">
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div><Label>Código</Label><Input required value={form.code} onChange={event => setForm({ ...form, code: event.target.value })} /></div>
        <div className="md:col-span-2"><Label>Nome</Label><Input required value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></div>
        {type === "budgetUnit" && <div><Label>Secretaria</Label><Select value={form.secretariatId} onValueChange={value => setForm({ ...form, secretariatId: value ?? "" })}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{secretariats.map(secretariat => <SelectItem key={secretariat.id} value={secretariat.id}>{secretariat.name}</SelectItem>)}</SelectContent></Select></div>}
        {type === "expenseNature" && <div><Label>Origem da contratação</Label><Select value={form.procurementOriginPolicy} onValueChange={value => setForm({ ...form, procurementOriginPolicy: value as ProcurementOriginPolicy })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="NONE">Sem exigência</SelectItem><SelectItem value="PROCUREMENT_SOURCE">Exigir origem de contratação</SelectItem><SelectItem value="CONTRACT">Exigir contrato</SelectItem></SelectContent></Select></div>}
        <div className="flex items-end gap-2"><Button type="submit" disabled={pending}>{editing ? <Pencil className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}{pending ? "Salvando..." : editing ? "Atualizar" : "Adicionar"}</Button>{editing && <Button type="button" variant="outline" onClick={reset}>Cancelar</Button>}</div>
      </form>
    </div></details>
    <FinanceTablePanel label={labels[type]} preferenceId={`financeiro-legado-cadastros-${type}`} resetKey={type}
      columns={[financeColumn("code", "Código", 80, 160), financeColumn("name", "Nome", 120, 400), ...(type === "budgetUnit" ? [financeColumn("secretariat", "Secretaria", 100, 280)] : []), ...(type === "expenseNature" ? [financeColumn("origin", "Origem da contratação", 100, 240)] : []), financeColumn("actions", "Ações", 64, 64, "actions")]}
      rows={items.map(item => ({ id: item.id, label: item.name, values: { code: item.code, name: item.name, secretariat: item.secretariat?.name ?? "—", origin: item.procurementOriginPolicy === "CONTRACT" ? "Contrato" : item.procurementOriginPolicy === "PROCUREMENT_SOURCE" ? "Origem de contratação" : "Sem exigência" }, actions: <div className={styles.rowActions}><button className={styles.iconButton} aria-label={`Editar ${item.name} no formulário`} onClick={() => edit(item)}><Pencil /></button><button className={styles.iconButton} aria-label={`Excluir ${item.name}`} onClick={() => void remove(item.id)}><Trash2 /></button></div> }))} />
  </div>;
}
