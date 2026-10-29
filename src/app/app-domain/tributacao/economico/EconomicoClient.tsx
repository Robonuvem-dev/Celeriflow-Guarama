"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Pencil, Trash2, RefreshCw } from "lucide-react";
import { updateEconomicRegistration, deactivateEconomicRegistration, activateEconomicRegistration } from "./actions";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TaxOperationalTable } from "../TaxOperationalTable";

type Registration = { id: string; municipalInsc: string; primaryCnae: string | null; taxRegime: string | null; status: string; taxpayer: { id: string; person: { fullName: string; cpf: string | null } | null; company: { corporateName: string; cnpj: string } | null } };
type RegistrationUpdate = { municipalInsc?: string; primaryCnae?: string | null; taxRegime?: string | null };
type Taxpayer = { id: string; name: string };
const field = "h-8 w-full rounded border px-2 text-[13px]";
export default function EconomicoClient({ registrations }: { registrations: Registration[]; taxpayers: Taxpayer[] }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<RegistrationUpdate>({});
  const [search, setSearch] = useState("");
  const filtered = registrations.filter(reg => { const term = search.toLowerCase(); return reg.municipalInsc.toLowerCase().includes(term) || (reg.taxpayer.company?.corporateName || reg.taxpayer.person?.fullName || "").toLowerCase().includes(term) || (reg.taxpayer.company?.cnpj || reg.taxpayer.person?.cpf || "").includes(term) || Boolean(reg.primaryCnae?.toLowerCase().includes(term)); });
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (!editingId || !confirm("Deseja salvar as alterações?")) return;
    try { await updateEconomicRegistration(editingId, editForm); setEditingId(null); } catch (error) { console.error(error); alert("Erro ao salvar alterações."); }
  }
  async function deactivate(id: string) { if (confirm("Deseja inativar esta inscrição?")) await deactivateEconomicRegistration(id); }
  async function activate(id: string) { if (confirm("Deseja reativar esta inscrição?")) await activateEconomicRegistration(id); }
  return <>
    <TaxOperationalTable id="economico" resetKey={search} emptyMessage="Nenhum cadastro econômico encontrado."
      toolbar={<input aria-label="Buscar inscrição econômica" value={search} onChange={event => setSearch(event.target.value)} placeholder="Inscrição, contribuinte, CNPJ ou CNAE" className={`${field} min-w-0 flex-1`} />}
      actions={<div className="flex items-center gap-2"><Link href="/tributacao/economico/relatorio" className="h-7 rounded border px-2 text-xs">Exportar CSV</Link><Link href="/tributacao/economico/novo" className="inline-flex h-7 items-center gap-1 rounded bg-amber-500 px-2 text-xs font-bold"><Plus className="size-4" />Nova inscrição</Link></div>}
      columns={[["inscription", "Inscrição", 110, 150, "identifier"], ["name", "Contribuinte / razão social", 160, 260], ["document", "CPF / CNPJ", 130, 150, "identifier"], ["cnae", "CNAE principal", 110, 140], ["regime", "Regime", 120, 170], ["status", "Status", 80, 100, "status"], ["actions", "Ações", 170, 170, "actions"]]}
      rows={filtered.map(reg => ({ id: reg.id, label: reg.municipalInsc, values: { inscription: reg.municipalInsc, name: reg.taxpayer.company?.corporateName || reg.taxpayer.person?.fullName || "Não Identificado", document: reg.taxpayer.company?.cnpj || reg.taxpayer.person?.cpf || "—", cnae: reg.primaryCnae || "—", regime: reg.taxRegime || "—", status: reg.status }, actions: <div className="flex justify-end gap-2"><Link href={`/tributacao/economico/${reg.id}`} className="text-emerald-700 underline">Abrir ficha</Link><button aria-label={`Editar inscrição ${reg.municipalInsc}`} title="Editar" onClick={() => { setEditingId(reg.id); setEditForm({ municipalInsc: reg.municipalInsc, primaryCnae: reg.primaryCnae, taxRegime: reg.taxRegime }); }}><Pencil className="size-4" /></button>{reg.status === "Ativo" ? <button aria-label={`Inativar inscrição ${reg.municipalInsc}`} title="Inativar" onClick={() => deactivate(reg.id)}><Trash2 className="size-4" /></button> : <button aria-label={`Reativar inscrição ${reg.municipalInsc}`} title="Reativar" onClick={() => activate(reg.id)}><RefreshCw className="size-4" /></button>}</div> }))} />
    <Dialog open={editingId !== null} onOpenChange={open => { if (!open) setEditingId(null); }}><DialogContent><DialogHeader><DialogTitle>Editar inscrição econômica</DialogTitle></DialogHeader><form onSubmit={save} className="grid gap-3"><label>Inscrição<input value={editForm.municipalInsc || ""} onChange={event => setEditForm({ ...editForm, municipalInsc: event.target.value })} className={field} /></label><label>CNAE principal<input value={editForm.primaryCnae || ""} onChange={event => setEditForm({ ...editForm, primaryCnae: event.target.value })} className={field} /></label><label>Regime<select value={editForm.taxRegime || ""} onChange={event => setEditForm({ ...editForm, taxRegime: event.target.value })} className={field}>{["Simples Nacional", "Lucro Presumido", "Lucro Real"].map(regime => <option key={regime}>{regime}</option>)}</select></label><div className="flex justify-end gap-3"><button type="button" onClick={() => setEditingId(null)}>Cancelar</button><button>Salvar</button></div></form></DialogContent></Dialog>
  </>;
}
