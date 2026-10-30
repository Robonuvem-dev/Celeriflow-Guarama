"use client";

import { useRef, useState, useTransition } from "react";
import { Pencil, Plus } from "lucide-react";
import type { CentralDocumentType } from "@/lib/contracts/signature-central";
import { OperationalFilters, OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalPagination, OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { OperationalPagedContent } from "@/components/app-ui/operational/OperationalPagedContent";
import { useOperationalWorkspace } from "@/components/app-ui/operational/OperationalWorkspace";
import { OPERATIONAL_PAGE_SIZE, type OperationalColumn } from "@/lib/operational-tables";
import styles from "@/components/app-ui/operational/operational.module.css";
import { filterDocumentTypes } from "./cadastro-model";
import { saveDocumentTypeAction } from "./actions";

const columns: OperationalColumn[] = [
  { key: "name", label: "Nome", type: "text", initialWidth: 280, minWidth: 120, resizable: true, sortable: false, details: "overflow" },
  { key: "description", label: "Descrição", type: "text", initialWidth: 500, minWidth: 160, resizable: true, sortable: false, details: "overflow" },
  { key: "state", label: "Situação", type: "status", initialWidth: 110, minWidth: 80, resizable: true, sortable: false, details: "overflow" },
  { key: "actions", label: "Ações", type: "actions", initialWidth: 50, minWidth: 50, maxWidth: 50, resizable: false, sortable: false, details: "none" },
];
type Input = { id?: string; name: string; description: string; active: boolean };
type Draft = { input: Input; error: string | null };
const fieldClass = "w-full rounded-md border bg-background px-3 py-2 font-normal";

export function DocumentosClient({ initialRows, canCreate, canUpdate }: { initialRows: CentralDocumentType[]; canCreate: boolean; canUpdate: boolean }) {
  const { device } = useOperationalWorkspace();
  const [rows, setRows] = useState(initialRows);
  const [search, setSearch] = useState("");
  const [active, setActive] = useState("ALL");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [pending, startTransition] = useTransition();
  const saving = useRef(false);
  const [status, setStatus] = useState("");
  const draft = selected ? drafts[selected] : undefined;
  const filtered = filterDocumentTypes(rows, search, active);
  const activePage = Math.min(page, Math.max(1, Math.ceil(filtered.length / OPERATIONAL_PAGE_SIZE)));
  const visible = filtered.slice((activePage - 1) * OPERATIONAL_PAGE_SIZE, activePage * OPERATIONAL_PAGE_SIZE);

  function edit(row?: CentralDocumentType) {
    const key = row?.id ?? "new";
    setDrafts(current => current[key] ? current : { ...current, [key]: { input: row ? { ...row } : { name: "", description: "", active: true }, error: null } });
    setSelected(key); setOpen(true);
  }
  function change(patch: Partial<Input>) {
    if (!selected) return;
    setDrafts(current => ({ ...current, [selected]: { ...current[selected], input: { ...current[selected].input, ...patch } } }));
  }
  function save() {
    if (!selected || !draft || saving.current || (draft.input.id ? !canUpdate : !canCreate)) return;
    const key = selected;
    const snapshot = draft.input;
    saving.current = true;
    setDrafts(current => ({ ...current, [key]: { ...current[key], error: null } }));
    startTransition(async () => {
      try {
        const result = await saveDocumentTypeAction(snapshot);
        if (result.error || !result.documentType) throw new Error(result.error || "O servidor não confirmou o cadastro. Tente novamente.");
        const saved = result.documentType;
        setRows(current => current.some(row => row.id === saved.id) ? current.map(row => row.id === saved.id ? saved : row) : [...current, saved]);
        setDrafts(current => { const next = { ...current }; delete next[key]; return next; });
        setSelected(saved.id); setOpen(false); setStatus(`Tipo documental ${saved.name} salvo com sucesso.`);
      } catch (error) {
        setDrafts(current => ({ ...current, [key]: { ...current[key], error: error instanceof Error ? error.message : "Não foi possível salvar o tipo documental." } }));
      } finally { saving.current = false; }
    });
  }

  return <OperationalListFrame label="Documentos — tipos documentais"
    actions={<>{canCreate && <button type="button" className={styles.dialogButton} onClick={() => edit()}><Plus />Cadastrar tipo</button>}
      <OperationalFilters label="Filtros de tipos documentais"><label className="grid gap-2">Situação<select className={fieldClass} value={active} onChange={event => { setActive(event.target.value); setPage(1); }}><option value="ALL">Todas</option><option value="ACTIVE">Ativos</option><option value="INACTIVE">Inativos</option></select></label></OperationalFilters></>}
    toolbar={<div className="flex w-full items-center gap-3"><input className={styles.searchInput} type="search" aria-label="Buscar tipos documentais" placeholder="Buscar por nome ou descrição…" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} /><span role="status" className="text-xs">{status}</span></div>}
    pagination={<OperationalPagination page={activePage} total={filtered.length} onPageChange={setPage} />}>
    <OperationalTable columns={columns} preferenceId="central-assinaturas-tipos" caption="Tipos documentais da Central de Assinaturas" rows={visible.map(row => ({
      id: row.id, label: row.name, values: { name: row.name, description: row.description, state: row.active ? "Ativo" : "Inativo" },
      actions: <div className={styles.rowActions}><button type="button" className={styles.iconButton} disabled={!canUpdate} title={canUpdate ? "Editar tipo documental" : "Somente consulta"} aria-label={`Editar ${row.name}`} onClick={() => edit(row)}><Pencil /></button></div>,
    }))} />
    <Dialog open={open} onOpenChange={value => { if (!saving.current) setOpen(value); }}>
      <DialogContent showCloseButton={!pending} data-device={device} className="sm:max-w-lg" style={{ display: "flex", flexDirection: "column", height: "min(560px, calc(100dvh - 16px))", maxHeight: "calc(100dvh - 16px)", minHeight: 0, overflow: "hidden" }}>
        <DialogHeader style={{ flexShrink: 0 }}><DialogTitle>{draft?.input.id ? "Editar tipo documental" : "Cadastrar tipo documental"}</DialogTitle><DialogDescription>Defina o nome e a descrição. Inative o tipo para retirá-lo de novas assinaturas.</DialogDescription></DialogHeader>
        {draft && <form style={{ display: "flex", flexDirection: "column", flex: "1 1 auto", minHeight: 0 }} onSubmit={event => { event.preventDefault(); save(); }}>
          <OperationalPagedContent device={device} label="Cadastro de tipo documental" footer={<div className="grid gap-2">
            {draft.error && <p role="alert" className="text-sm text-red-700">{draft.error} Os dados preenchidos foram mantidos.</p>}
            <div className="flex flex-wrap gap-2"><button type="button" className={styles.dialogButton} disabled={pending} onClick={() => setOpen(false)}>Fechar e manter rascunho</button><button type="submit" className={`${styles.dialogButton} ${styles.primaryButton}`} disabled={pending}>{pending ? "Salvando…" : "Salvar tipo"}</button></div>
          </div>}>
          <fieldset disabled={pending} className="grid gap-4">
            <label className="grid gap-1 font-medium">Nome<input className={fieldClass} required maxLength={160} value={draft.input.name} onChange={event => change({ name: event.target.value })} /></label>
            <label className="grid gap-1 font-medium">Descrição<textarea className={fieldClass} rows={4} maxLength={2000} value={draft.input.description} onChange={event => change({ description: event.target.value })} /></label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={draft.input.active} onChange={event => change({ active: event.target.checked })} />Tipo ativo</label>
          </fieldset>
          </OperationalPagedContent>
        </form>}
      </DialogContent>
    </Dialog>
  </OperationalListFrame>;
}
