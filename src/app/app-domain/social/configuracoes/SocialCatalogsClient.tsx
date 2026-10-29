"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Settings } from "lucide-react";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { OPERATIONAL_PAGE_SIZE } from "@/lib/operational-tables";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { SocialOperationalList } from "../OperationalList";
import { socialCatalogKinds } from "@/lib/social/catalog-policy";
import { saveSocialCatalogEntry, saveSocialMinimumWage } from "./actions";

type Entry = { id: string; kind: string; name: string; description: string | null; isActive: boolean; allowedUnitTypes: string[] };
type Wage = { id: string; validFrom: string; value: string };
type Kind = keyof typeof socialCatalogKinds;
const field = "h-7 min-w-0 rounded-md border border-slate-300 bg-white px-2 text-sm";

export default function SocialCatalogsClient({ entries, wages }: { entries: Entry[]; wages: Wage[] }) {
  const router = useRouter();
  const [view, setView] = useState("catalogs");
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>("INCOME");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [wagePage, setWagePage] = useState(1);
  const [status, setStatus] = useState("Todos");
  const [editing, setEditing] = useState<Entry | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [active, setActive] = useState(true);
  const [allowedUnitTypes, setAllowedUnitTypes] = useState<string[]>([]);
  const [validFrom, setValidFrom] = useState("");
  const [value, setValue] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const rows = entries.filter((entry) => entry.kind === kind && entry.name.toLocaleLowerCase("pt-BR").includes(search.trim().toLocaleLowerCase("pt-BR")) && (status === "Todos" || entry.isActive === (status === "Ativos")));
  const activePage = Math.min(page, Math.max(1, Math.ceil(rows.length / OPERATIONAL_PAGE_SIZE)));
  const activeWagePage = Math.min(wagePage, Math.max(1, Math.ceil(wages.length / OPERATIONAL_PAGE_SIZE)));
  function reset() { setEditing(null); setName(""); setDescription(""); setActive(true); setAllowedUnitTypes([]); }
  async function submitEntry(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setMessage("");
    try {
      const result = await saveSocialCatalogEntry({ id: editing?.id, kind, name, description, isActive: active, allowedUnitTypes });
      if (result.error) { setMessage(result.error); return; }
      reset(); setOpen(false); setMessage("Cadastro salvo."); router.refresh();
    } finally { setPending(false); }
  }
  async function submitWage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setMessage("");
    try {
      const result = await saveSocialMinimumWage({ validFrom, value });
      if (result.error) { setMessage(result.error); return; }
      setValidFrom(""); setValue(""); setOpen(false); setMessage("Vigência registrada."); router.refresh();
    } finally { setPending(false); }
  }
  return <PageFrame className="flex h-full min-h-0 flex-col gap-1">
    <PageHeader title="Configurações SUAS" icon={<Settings className="size-4" />} action={<button className="h-8 rounded bg-blue-600 px-3 text-sm text-white" onClick={() => { reset(); setMessage(""); setOpen(true); }}>{view === "catalogs" ? "Cadastrar" : "Registrar vigência"}</button>} />
    <SocialOperationalList id={`configuracoes-${view}-${kind}`} page={view === "catalogs" ? activePage : activeWagePage} total={view === "catalogs" ? rows.length : wages.length} onPageChange={view === "catalogs" ? setPage : setWagePage}
      toolbar={<div className="flex w-full min-w-0 gap-2"><select aria-label="Visão" className={field} value={view} onChange={(event) => setView(event.target.value)}><option value="catalogs">Catálogos SUAS</option><option value="wages">Salário mínimo</option></select>{view === "catalogs" && <><select aria-label="Catálogo" className={field} value={kind} onChange={(event) => { setKind(event.target.value as Kind); setSearch(""); setPage(1); reset(); }}>{Object.entries(socialCatalogKinds).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><input aria-label="Buscar catálogo" type="search" className={`${field} flex-1`} value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /><select aria-label="Situação" className={field} value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option>Todos</option><option>Ativos</option><option>Inativos</option></select></>}</div>}
      columns={view === "catalogs" ? [["name", "Nome", 240, 120, "identifier"], ["description", "Descrição", 350, 140], ["status", "Situação", 110, 90, "status"], ["actions", "Ação", 75, 75, "actions"]] : [["from", "Início da vigência", 240, 150], ["value", "Valor", 240, 120, "text", "right"]]}
      rows={view === "catalogs" ? rows.slice((activePage - 1) * OPERATIONAL_PAGE_SIZE, activePage * OPERATIONAL_PAGE_SIZE).map((entry) => ({ id: entry.id, label: entry.name, values: { name: entry.name, description: entry.description || "—", status: entry.isActive ? "Ativo" : "Inativo" }, actions: <button disabled={pending} onClick={() => { setEditing(entry); setName(entry.name); setDescription(entry.description || ""); setActive(entry.isActive); setAllowedUnitTypes(entry.allowedUnitTypes); setMessage(""); setOpen(true); }}>Editar</button> })) : wages.slice((activeWagePage - 1) * OPERATIONAL_PAGE_SIZE, activeWagePage * OPERATIONAL_PAGE_SIZE).map((wage) => ({ id: wage.id, label: wage.validFrom, values: { from: wage.validFrom.split("-").reverse().join("/"), value: Number(wage.value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) } }))} />
    {message && !open && <p role="status" className="text-sm">{message}</p>}
    <Dialog open={open} onOpenChange={(value) => { if (!pending) setOpen(value); }}><DialogContent><DialogHeader><DialogTitle>{view === "catalogs" ? `${editing ? "Editar" : "Cadastrar"} — ${socialCatalogKinds[kind]}` : "Registrar salário mínimo"}</DialogTitle><DialogDescription>{view === "catalogs" ? "Cadastro socioassistencial." : "Cada valor é registrado por início de vigência, preservando os valores anteriores."}</DialogDescription></DialogHeader>
      {view === "catalogs" ? <form onSubmit={submitEntry} className="grid gap-3">
        <label>Nome<input required minLength={2} maxLength={160} disabled={pending} className={`${field} w-full`} value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label>Descrição<input maxLength={2000} disabled={pending} className={`${field} w-full`} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
        <label><input type="checkbox" disabled={pending} checked={active} onChange={(event) => setActive(event.target.checked)} /> Ativo</label>
        {kind === "VULNERABILITY" && <fieldset><legend>Tipos de equipamento autorizados (sem seleção: todos)</legend><div className="flex flex-wrap gap-3">{["CRAS", "CREAS", "Secretaria", "Centro POP", "Centro DIA", "Acolhimento", "Saúde", "Judiciário", "Outros"].map((type) => <label key={type}><input type="checkbox" disabled={pending} checked={allowedUnitTypes.includes(type)} onChange={(event) => setAllowedUnitTypes(event.target.checked ? [...allowedUnitTypes, type] : allowedUnitTypes.filter((item) => item !== type))} />{type}</label>)}</div></fieldset>}
        {message && <p role="status">{message}</p>}<div className="flex justify-end gap-2"><button type="button" disabled={pending} onClick={() => { reset(); setOpen(false); }} className={field}>Cancelar</button><button disabled={pending} className="rounded bg-blue-600 px-3 py-1 text-white">{editing ? "Salvar alterações" : "Cadastrar"}</button></div>
      </form> : <form onSubmit={submitWage} className="grid gap-3"><label>Início da vigência<input required disabled={pending} type="date" className={`${field} w-full`} value={validFrom} onChange={(event) => setValidFrom(event.target.value)} /></label><label>Valor (R$)<input required disabled={pending} type="number" min="0.01" step="0.01" className={`${field} w-full`} value={value} onChange={(event) => setValue(event.target.value)} /></label>{message && <p role="status">{message}</p>}<div className="flex justify-end gap-2"><button type="button" disabled={pending} onClick={() => setOpen(false)} className={field}>Cancelar</button><button disabled={pending} className="rounded bg-blue-600 px-3 py-1 text-white">Registrar vigência</button></div></form>}
    </DialogContent></Dialog>
  </PageFrame>;
}
