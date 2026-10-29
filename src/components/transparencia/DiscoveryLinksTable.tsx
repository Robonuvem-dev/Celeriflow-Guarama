"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import type { DiscoverySettings } from "@/lib/transparencia/discovery-settings";
import type { DiscoverySection } from "@/lib/transparencia/discovery";
import { OperationalTable, OperationalPagination } from "@/components/app-ui/operational/OperationalTable";
import { OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalTablePanel } from "@/components/app-ui/operational/OperationalTablePanel";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { OPERATIONAL_PAGE_SIZE, type OperationalColumn } from "@/lib/operational-tables";
import styles from "@/components/app-ui/operational/operational.module.css";

type Links = DiscoverySettings["links"];
const columns: OperationalColumn[] = [
  ...([["title", "Título", 200, 100], ["section", "Seção", 150, 80], ["description", "Descrição", 240, 110], ["href", "Destino", 200, 100], ["responsible", "Responsável", 160, 90], ["reviewedAt", "Última revisão", 110, 80]] as [string, string, number, number][]).map(([key, label, initialWidth, minWidth]): OperationalColumn => ({ key, label, initialWidth, minWidth, maxWidth: 900, type: "text", resizable: true, sortable: false, details: "overflow" })),
  { key: "order", label: "Ordem", initialWidth: 80, minWidth: 72, maxWidth: 130, type: "text", align: "right", resizable: true, sortable: false, details: "overflow" },
  { key: "enabled", label: "Publicado", initialWidth: 85, minWidth: 60, maxWidth: 140, type: "status", resizable: true, sortable: false, details: "overflow" },
  { key: "actions", label: "Ações", initialWidth: 56, minWidth: 56, maxWidth: 80, type: "actions", resizable: false, sortable: false, details: "none" },
];

export function DiscoveryLinksTable({ links, onChange, sections, disabled }: { links: Links; onChange: Dispatch<SetStateAction<Links>>; sections: DiscoverySection[]; disabled: boolean }) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const term = search.trim().toLocaleLowerCase("pt-BR");
  const filtered = links.filter(link => !term || [link.title, link.description, link.href, link.responsible, sections.find(section => section.id === link.sectionId)?.title || ""].some(value => value.toLocaleLowerCase("pt-BR").includes(term)));
  const activePage = Math.min(page, Math.max(1, Math.ceil(filtered.length / OPERATIONAL_PAGE_SIZE)));
  const editing = links.find(link => link.id === editingId);
  function update(id: string, patch: Partial<Links[number]>) {
    if (!disabled) onChange(current => current.map(link => link.id === id ? { ...link, ...patch } : link));
  }
  function add() {
    if (disabled || links.length >= 100 || !sections.length) return;
    const id = `link-${crypto.randomUUID()}`;
    onChange(current => [...current, { id, sectionId: sections[0].id, title: "", description: "", href: "", enabled: false, order: current.length, responsible: "", reviewedAt: new Date().toISOString().slice(0, 10) }]);
    setSearch(""); setPage(Math.floor(links.length / OPERATIONAL_PAGE_SIZE) + 1); setEditingId(id);
  }
  return <>
    <OperationalTablePanel title="Destinos complementares" triggerLabel={`Gerenciar ${links.length} destinos`} description="Rascunho completo preservado ao mudar de página ou fechar o painel.">
      <OperationalListFrame label="Destinos complementares" actions={<button type="button" className={styles.newButton} disabled={disabled || links.length >= 100 || !sections.length} onClick={add}><Plus />Adicionar destino</button>} toolbar={<><input type="search" aria-label="Buscar destinos complementares" placeholder="Buscar título, descrição, destino ou responsável…" className={styles.searchInput} value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} /><span>{links.length} no rascunho</span></>} pagination={<OperationalPagination page={activePage} total={filtered.length} onPageChange={setPage} />}>
        <OperationalTable columns={columns} preferenceId="transparencia.apresentacao.destinos" caption="Destinos complementares — alterações serão enviadas ao salvar a apresentação" rows={filtered.slice((activePage - 1) * OPERATIONAL_PAGE_SIZE, activePage * OPERATIONAL_PAGE_SIZE).map(link => ({ id: link.id, label: link.title || link.id, values: { title: link.title || "Novo destino", section: sections.find(section => section.id === link.sectionId)?.title || link.sectionId, description: link.description, href: link.href, responsible: link.responsible, reviewedAt: link.reviewedAt, order: String(link.order), enabled: link.enabled ? "Publicado" : "Rascunho" }, cells: { order: <input aria-label={`Ordem de ${link.title || link.id}`} type="number" min={0} max={1000} className="h-5 w-full min-w-0 rounded border px-1 text-[13px]" value={link.order} disabled={disabled} onChange={event => update(link.id, { order: Number(event.target.value) })} />, enabled: <input aria-label={`Publicar ${link.title || link.id}`} type="checkbox" checked={link.enabled} disabled={disabled} onChange={event => update(link.id, { enabled: event.target.checked })} /> }, actions: <button type="button" className={styles.iconButton} aria-label={`Editar destino ${link.title || link.id}`} onClick={() => setEditingId(link.id)}><Pencil /></button> }))} />
      </OperationalListFrame>
    </OperationalTablePanel>
    <button type="button" disabled={disabled || links.length >= 100 || !sections.length} onClick={add} className="ml-2 rounded border px-4 py-2 text-sm font-semibold">Adicionar destino</button>
    <Dialog open={!!editing} onOpenChange={open => { if (!open) setEditingId(null); }}><DialogContent className="sm:max-w-2xl"><DialogHeader><DialogTitle>Editar destino complementar</DialogTitle><DialogDescription>Os campos ficam no rascunho até salvar a apresentação.</DialogDescription></DialogHeader>{editing && <fieldset disabled={disabled} className="grid gap-3 sm:grid-cols-2">
      <label>Título<input aria-label="Título do destino" required maxLength={200} value={editing.title} onChange={event => update(editing.id, { title: event.target.value })} className="mt-1 w-full rounded border p-2" /></label>
      <label>Seção<select value={editing.sectionId} onChange={event => update(editing.id, { sectionId: event.target.value })} className="mt-1 w-full rounded border p-2">{sections.map(section => <option key={section.id} value={section.id}>{section.title}</option>)}</select></label>
      <label className="sm:col-span-2">Descrição<textarea required minLength={5} maxLength={600} rows={3} value={editing.description} onChange={event => update(editing.id, { description: event.target.value })} className="mt-1 w-full rounded border p-2" /></label>
      <label className="sm:col-span-2">Destino (/portal/... ou URL pública)<input required maxLength={2000} value={editing.href} onChange={event => update(editing.id, { href: event.target.value })} className="mt-1 w-full rounded border p-2" /></label>
      <label>Responsável pela revisão<input required minLength={3} maxLength={200} value={editing.responsible} onChange={event => update(editing.id, { responsible: event.target.value })} className="mt-1 w-full rounded border p-2" /></label>
      <label>Última revisão<input required type="date" max={new Date().toISOString().slice(0, 10)} value={editing.reviewedAt} onChange={event => update(editing.id, { reviewedAt: event.target.value })} className="mt-1 w-full rounded border p-2" /></label>
      <label>Ordem no grupo de complementos<input type="number" min={0} max={1000} value={editing.order} onChange={event => update(editing.id, { order: Number(event.target.value) })} className="mt-1 w-full rounded border p-2" /></label>
      <label className="self-center"><input type="checkbox" checked={editing.enabled} onChange={event => update(editing.id, { enabled: event.target.checked })} /> Publicado</label>
      <button type="button" className={styles.dialogButton} onClick={() => { onChange(current => current.filter(link => link.id !== editing.id)); setEditingId(null); }}><Trash2 />Remover destino</button>
    </fieldset>}<button type="button" className={styles.dialogButton} onClick={() => setEditingId(null)}>Fechar e manter rascunho</button></DialogContent></Dialog>
  </>;
}
