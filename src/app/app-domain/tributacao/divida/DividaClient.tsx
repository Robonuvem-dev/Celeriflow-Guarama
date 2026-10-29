"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2, RefreshCw } from "lucide-react";
import { createActiveDebt, updateActiveDebt, cancelActiveDebt, reactivateActiveDebt } from "./actions";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TaxOperationalTable } from "../TaxOperationalTable";

type ActiveDebt = { id: string; cdaNumber: string | null; year: number; originDebtType: string; originalValue: number; updatedValue: number; status: string; taxpayer: { id: string; person: { fullName: string; cpf: string | null } | null; company: { corporateName: string; cnpj: string } | null } };
type Taxpayer = { id: string; name: string };
const field = "h-8 w-full rounded border px-2 text-[13px]";
const money = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
export default function DividaClient({ activeDebts, taxpayers }: { activeDebts: ActiveDebt[]; taxpayers: Taxpayer[] }) {
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<ActiveDebt>>({});
  const [creating, setCreating] = useState(false);
  const initial = { cdaNumber: "", year: new Date().getFullYear(), originDebtType: "IPTU", originalValue: 0, updatedValue: 0, taxpayerId: taxpayers[0]?.id || "" };
  const [createForm, setCreateForm] = useState(initial);
  const filtered = activeDebts.filter(debt => { const term = search.toLowerCase(); return (debt.cdaNumber || "").toLowerCase().includes(term) || debt.originDebtType.toLowerCase().includes(term) || (debt.taxpayer.company?.corporateName || debt.taxpayer.person?.fullName || "").toLowerCase().includes(term); });
  async function saveEdit(event: React.FormEvent) {
    event.preventDefault(); if (!editingId || !confirm("Deseja salvar as alterações?")) return;
    try { await updateActiveDebt(editingId, editForm); setEditingId(null); } catch (error) { console.error(error); alert("Erro ao salvar alterações."); }
  }
  async function cancel(id: string) { if (confirm("Deseja cancelar esta dívida ativa?")) await cancelActiveDebt(id); }
  async function reactivate(id: string) { if (confirm("Deseja reativar esta dívida ativa?")) await reactivateActiveDebt(id); }
  async function create(event: React.FormEvent) {
    event.preventDefault(); if (!createForm.taxpayerId) { alert("Selecione um contribuinte válido."); return; }
    if (!createForm.cdaNumber || !createForm.originDebtType) { alert("Preencha o número CDA e a origem."); return; }
    try { await createActiveDebt(createForm); setCreating(false); setCreateForm(initial); } catch (error) { console.error(error); alert("Erro ao inscrever em dívida ativa."); }
  }
  return <>
    <TaxOperationalTable id="divida" resetKey={search} emptyMessage="Nenhum registro de dívida ativa encontrado."
      toolbar={<input aria-label="Buscar dívida" value={search} onChange={event => setSearch(event.target.value)} placeholder="CDA, origem ou contribuinte" className={`${field} min-w-0 flex-1`} />}
      actions={<button onClick={() => setCreating(true)} className="inline-flex h-7 items-center gap-1 rounded bg-amber-500 px-2 text-xs font-bold"><Plus className="size-4" />Nova inscrição CDA</button>}
      columns={[["cda", "Número CDA", 110, 150, "identifier"], ["name", "Contribuinte", 160, 270], ["origin", "Origem", 90, 130], ["year", "Exercício", 75, 85], ["value", "Valor atualizado", 125, 160, "text", "right"], ["status", "Status", 85, 110, "status"], ["actions", "Ações", 80, 80, "actions"]]}
      rows={filtered.map(debt => ({ id: debt.id, label: debt.cdaNumber || debt.id, values: { cda: debt.cdaNumber || "—", name: debt.taxpayer?.company?.corporateName || debt.taxpayer?.person?.fullName || "Não Informado", origin: debt.originDebtType, year: String(debt.year), value: money(debt.updatedValue), status: debt.status }, actions: <div className="flex justify-end gap-2"><button aria-label={`Editar dívida ${debt.cdaNumber || debt.id}`} title="Editar" onClick={() => { setEditingId(debt.id); setEditForm({ cdaNumber: debt.cdaNumber, year: debt.year, originDebtType: debt.originDebtType, updatedValue: debt.updatedValue }); }}><Pencil className="size-4" /></button>{["Inscrita", "Parcelada"].includes(debt.status) ? <button aria-label={`Cancelar dívida ${debt.cdaNumber || debt.id}`} title="Cancelar" onClick={() => cancel(debt.id)}><Trash2 className="size-4" /></button> : <button aria-label={`Reativar dívida ${debt.cdaNumber || debt.id}`} title="Reativar" onClick={() => reactivate(debt.id)}><RefreshCw className="size-4" /></button>}</div> }))} />
    <Dialog open={editingId !== null} onOpenChange={open => { if (!open) setEditingId(null); }}><DialogContent><DialogHeader><DialogTitle>Editar dívida ativa</DialogTitle></DialogHeader><form onSubmit={saveEdit} className="grid gap-3"><label>Número CDA<input value={editForm.cdaNumber || ""} onChange={event => setEditForm({ ...editForm, cdaNumber: event.target.value })} className={field} /></label><label>Origem<input value={editForm.originDebtType || ""} onChange={event => setEditForm({ ...editForm, originDebtType: event.target.value })} className={field} /></label><label>Exercício<input type="number" value={editForm.year || ""} onChange={event => setEditForm({ ...editForm, year: Number(event.target.value) })} className={field} /></label><label>Valor atualizado<input type="number" value={editForm.updatedValue || 0} onChange={event => setEditForm({ ...editForm, updatedValue: Number(event.target.value) })} className={field} /></label><div className="flex justify-end gap-3"><button type="button" onClick={() => setEditingId(null)}>Cancelar</button><button>Salvar</button></div></form></DialogContent></Dialog>
    <Dialog open={creating} onOpenChange={setCreating}><DialogContent><DialogHeader><DialogTitle>Inscrever em dívida ativa</DialogTitle></DialogHeader><form onSubmit={create} className="grid gap-3"><label>Contribuinte<select required value={createForm.taxpayerId} onChange={event => setCreateForm({ ...createForm, taxpayerId: event.target.value })} className={field}><option value="">Selecione um contribuinte...</option>{taxpayers.map(tp => <option key={tp.id} value={tp.id}>{tp.name}</option>)}</select></label><label>Número CDA<input value={createForm.cdaNumber} onChange={event => setCreateForm({ ...createForm, cdaNumber: event.target.value })} className={field} /></label><label>Origem<input value={createForm.originDebtType} onChange={event => setCreateForm({ ...createForm, originDebtType: event.target.value })} className={field} /></label><label>Exercício<input type="number" value={createForm.year} onChange={event => setCreateForm({ ...createForm, year: Number(event.target.value) })} className={field} /></label><div className="grid grid-cols-2 gap-2"><label>Valor original<input type="number" step="0.01" value={createForm.originalValue} onChange={event => setCreateForm({ ...createForm, originalValue: Number(event.target.value) })} className={field} /></label><label>Valor atualizado<input type="number" step="0.01" value={createForm.updatedValue} onChange={event => setCreateForm({ ...createForm, updatedValue: Number(event.target.value) })} className={field} /></label></div><div className="flex justify-end gap-3"><button type="button" onClick={() => setCreating(false)}>Cancelar</button><button>Inscrever</button></div></form></DialogContent></Dialog>
  </>;
}
