"use client";

import { useState } from "react";
import { Pencil, Trash2, RefreshCw, Plus } from "lucide-react";
import { createLicense, updateLicense, deactivateLicense, activateLicense } from "./actions";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TaxOperationalTable } from "../TaxOperationalTable";

type License = {
  id: string; licenseType: string; issueDate: Date | null; validUntil: Date | null; status: string;
  taxpayer: { id: string; person: { fullName: string; cpf: string | null } | null; company: { corporateName: string; cnpj: string } | null };
};
type Taxpayer = { id: string; name: string };
const field = "h-8 w-full rounded border px-2 text-[13px]";
const types = ["Funcionamento", "Sanitária", "Obra", "Ambiental"];

export default function AlvarasClient({ licenses, taxpayers }: { licenses: License[]; taxpayers: Taxpayer[] }) {
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ licenseType?: string; validUntil?: string }>({});
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({ licenseType: "Funcionamento", taxpayerId: taxpayers[0]?.id || "", validUntil: "" });
  const filtered = licenses.filter(lic => lic.licenseType.toLowerCase().includes(search.toLowerCase()) || (lic.taxpayer.company?.corporateName || lic.taxpayer.person?.fullName || "").toLowerCase().includes(search.toLowerCase()));
  async function saveEdit(event: React.FormEvent) {
    event.preventDefault();
    if (!editingId || !confirm("Deseja salvar as alterações?")) return;
    try { await updateLicense(editingId, editForm); setEditingId(null); }
    catch (error) { console.error(error); alert("Erro ao salvar alterações."); }
  }
  async function deactivate(id: string) {
    const reason = prompt("Fundamento do cancelamento do alvará:");
    if (!reason?.trim()) return;
    try { await deactivateLicense(id, reason); }
    catch (error) { alert(error instanceof Error ? error.message : "Não foi possível cancelar o alvará."); }
  }
  async function activate(id: string) { if (confirm("Deseja reativar este alvará?")) await activateLicense(id); }
  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (!createForm.taxpayerId) { alert("Selecione um contribuinte válido."); return; }
    if (!createForm.validUntil) { alert("Informe a data de validade."); return; }
    try {
      const result = await createLicense(createForm);
      if (result.error) { alert(result.error); return; }
      setCreating(false); setCreateForm({ licenseType: "Funcionamento", taxpayerId: taxpayers[0]?.id || "", validUntil: "" });
    } catch (error) { console.error(error); alert("Erro ao emitir alvará."); }
  }
  return <>
    <TaxOperationalTable resetKey={search} id="alvaras" emptyMessage="Nenhum alvará emitido."
      toolbar={<input aria-label="Buscar alvará" value={search} onChange={event => setSearch(event.target.value)} placeholder="Tipo ou contribuinte" className={`${field} min-w-0 flex-1`} />}
      actions={<button onClick={() => setCreating(true)} className="inline-flex h-7 items-center gap-1 rounded bg-amber-500 px-2 text-xs font-bold"><Plus className="size-4" />Novo alvará</button>}
      columns={[["type", "Tipo de alvará", 120, 180], ["name", "Contribuinte", 160, 300], ["issue", "Emissão", 95, 110], ["valid", "Validade", 95, 110], ["status", "Status", 85, 110, "status"], ["actions", "Ações", 80, 80, "actions"]]}
      rows={filtered.map(lic => ({ id: lic.id, label: lic.taxpayer.company?.corporateName || lic.taxpayer.person?.fullName || lic.id, values: { type: lic.licenseType, name: lic.taxpayer.company?.corporateName || lic.taxpayer.person?.fullName || "Não informado", issue: lic.issueDate ? new Date(lic.issueDate).toLocaleDateString("pt-BR") : "—", valid: lic.validUntil ? new Date(lic.validUntil).toLocaleDateString("pt-BR") : "—", status: lic.status }, actions: <div className="flex justify-end gap-2"><button aria-label={`Editar alvará ${lic.id}`} title="Editar" onClick={() => { setEditingId(lic.id); setEditForm({ licenseType: lic.licenseType, validUntil: lic.validUntil ? new Date(lic.validUntil).toISOString().split("T")[0] : "" }); }}><Pencil className="size-4" /></button>{lic.status === "Emitido" ? <button aria-label={`Cancelar alvará ${lic.id}`} title="Cancelar" onClick={() => deactivate(lic.id)}><Trash2 className="size-4" /></button> : <button aria-label={`Reativar alvará ${lic.id}`} title="Reativar" onClick={() => activate(lic.id)}><RefreshCw className="size-4" /></button>}</div> }))} />
    <Dialog open={editingId !== null} onOpenChange={open => { if (!open) setEditingId(null); }}><DialogContent><DialogHeader><DialogTitle>Editar alvará</DialogTitle></DialogHeader><form onSubmit={saveEdit} className="space-y-3"><label className="block text-sm">Tipo<select value={editForm.licenseType || ""} onChange={event => setEditForm({ ...editForm, licenseType: event.target.value })} className={field}>{types.map(type => <option key={type}>{type}</option>)}</select></label><label className="block text-sm">Validade<input type="date" value={editForm.validUntil || ""} onChange={event => setEditForm({ ...editForm, validUntil: event.target.value })} className={field} /></label><div className="flex justify-end gap-3"><button type="button" onClick={() => setEditingId(null)}>Cancelar</button><button>Salvar</button></div></form></DialogContent></Dialog>
    <Dialog open={creating} onOpenChange={setCreating}><DialogContent><DialogHeader><DialogTitle>Emitir alvará / licença</DialogTitle></DialogHeader><form onSubmit={create} className="space-y-3"><label className="block text-sm">Contribuinte<select required value={createForm.taxpayerId} onChange={event => setCreateForm({ ...createForm, taxpayerId: event.target.value })} className={field}><option value="">Selecione um contribuinte...</option>{taxpayers.map(tp => <option key={tp.id} value={tp.id}>{tp.name}</option>)}</select></label><label className="block text-sm">Tipo<select value={createForm.licenseType} onChange={event => setCreateForm({ ...createForm, licenseType: event.target.value })} className={field}>{types.map(type => <option key={type}>{type}</option>)}</select></label><label className="block text-sm">Validade<input type="date" required value={createForm.validUntil} onChange={event => setCreateForm({ ...createForm, validUntil: event.target.value })} className={field} /></label><div className="flex justify-end gap-3"><button type="button" onClick={() => setCreating(false)}>Cancelar</button><button>Emitir</button></div></form></DialogContent></Dialog>
  </>;
}
