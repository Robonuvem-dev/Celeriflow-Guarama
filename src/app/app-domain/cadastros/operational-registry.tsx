"use client";

import { useRef, useState, type ReactNode } from "react";
import { Pencil, RefreshCw, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalPagination, OperationalTable, type OperationalRow } from "@/components/app-ui/operational/OperationalTable";
import { useOperationalWorkspace } from "@/components/app-ui/operational/OperationalWorkspace";
import { OPERATIONAL_PAGE_SIZE, type OperationalColumn } from "@/lib/operational-tables";
import styles from "@/components/app-ui/operational/operational.module.css";

// Domain adapter only: geometry, cells, details and pagination belong to the shared base.
export function registryColumns(definitions: [string, string, number, number, OperationalColumn["type"]?][]): OperationalColumn[] {
  return definitions.map(([key, label, initialWidth, minWidth, type = "text"]) => ({ key, label, initialWidth, minWidth, maxWidth: type === "actions" ? initialWidth : Math.max(initialWidth * 3, minWidth), type, resizable: type !== "actions", sortable: false, details: type === "actions" ? "none" : "overflow", align: type === "actions" ? "right" : "left" }));
}

export type RegistryValues = Record<string, string | boolean>;
export type RegistryField<T> = {
  key: string; label: string; type?: "text" | "email" | "date" | "checkbox" | "textarea" | "select";
  options?: { value: string; label: string }[] | ((record: T, values: RegistryValues) => { value: string; label: string }[]);
  visible?: (record: T, values: RegistryValues) => boolean;
  clears?: string[];
};

export function RegistryEditDialog({ open, onClose, title, children, onSave, pending = false, error, returnFocus }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; onSave: () => void; pending?: boolean; error?: string;
  returnFocus?: () => HTMLElement | null;
}) {
  const { device } = useOperationalWorkspace();
  return <Dialog open={open} onOpenChange={(next) => { if (!next && !pending) onClose(); }}><DialogContent className={styles.dialog} data-device={device} showCloseButton={false} finalFocus={() => { const target = returnFocus?.(); return target?.isConnected ? target : true; }}>
    <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>Revise os campos antes de salvar.</DialogDescription></DialogHeader>
    <form onSubmit={(event) => { event.preventDefault(); onSave(); }}>
      {children}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <div className={styles.dialogFooter}><button type="button" className={styles.dialogButton} disabled={pending} onClick={onClose}>Cancelar</button><button type="submit" className={`${styles.dialogButton} ${styles.primaryButton}`} disabled={pending}>{pending ? "Salvando…" : "Salvar"}</button></div>
    </form>
  </DialogContent></Dialog>;
}

export function RegistryList<T extends { id: string }>({ records, columns, preferenceId, label, values, searchValues, editValues, fields = [], onSave, statusAction, extraActions, notice }: {
  records: T[]; columns: OperationalColumn[]; preferenceId: string; label: (record: T) => string;
  values: (record: T) => Record<string, string>; searchValues: (record: T) => (string | null | undefined)[];
  editValues?: (record: T) => RegistryValues; fields?: RegistryField<T>[];
  onSave?: (record: T, values: RegistryValues) => Promise<unknown>;
  statusAction?: (record: T) => { label: string; confirm: string; run: () => Promise<unknown> };
  extraActions?: (record: T) => ReactNode; notice?: string;
}) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<T | null>(null);
  const [form, setForm] = useState<RegistryValues>({});
  const [block, setBlock] = useState(0);
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const editTrigger = useRef<HTMLButtonElement | null>(null);
  const [error, setError] = useState("");
  const normalized = search.trim().toLocaleLowerCase("pt-BR");
  const filtered = records.filter(record => !normalized || searchValues(record).some(value => value?.toLocaleLowerCase("pt-BR").includes(normalized)));
  const activePage = Math.min(page, Math.max(1, Math.ceil(filtered.length / OPERATIONAL_PAGE_SIZE)));
  const visibleFields = editing ? fields.filter(field => !field.visible || field.visible(editing, form)) : [];
  const blocks = Math.max(1, Math.ceil(visibleFields.length / 6));
  const activeBlock = Math.min(block, blocks - 1);

  async function run(action: () => Promise<unknown>, close = false) {
    if (busy.current) return;
    busy.current = true; setPending(true); setError("");
    try {
      const result = await action();
      if (result && typeof result === "object" && "error" in result && result.error) setError(String(result.error));
      else if (close) setEditing(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível concluir a operação."); }
    finally { busy.current = false; setPending(false); }
  }

  const rows: OperationalRow[] = filtered.slice((activePage - 1) * OPERATIONAL_PAGE_SIZE, activePage * OPERATIONAL_PAGE_SIZE).map(record => {
    const action = statusAction?.(record);
    return { id: record.id, label: label(record), values: values(record), actions: <div className={styles.rowActions}>
      {extraActions?.(record)}
      {onSave && editValues && <button type="button" className={styles.iconButton} disabled={pending} aria-label={`Editar ${label(record)}`} onClick={event => { editTrigger.current = event.currentTarget; setEditing(record); setForm(editValues(record)); setBlock(0); setError(""); }}><Pencil /></button>}
      {action && <button type="button" className={styles.iconButton} disabled={pending} aria-label={`${action.label} ${label(record)}`} onClick={() => { if (window.confirm(action.confirm)) void run(action.run); }}>{action.label === "Excluir" ? <Trash2 /> : <RefreshCw />}</button>}
    </div> };
  });

  return <>
    <OperationalListFrame label={preferenceId} toolbar={<><input className={styles.searchInput} type="search" aria-label="Buscar registros" placeholder="Buscar registros" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} />{notice && <span title={notice} className="truncate text-[13px]">{notice}</span>}{error && !editing && <span role="alert" className="text-[13px] text-red-700">{error}</span>}</>} pagination={<OperationalPagination page={activePage} total={filtered.length} pending={pending} onPageChange={setPage} />}>
      <OperationalTable columns={columns} rows={rows} preferenceId={preferenceId} caption={preferenceId} emptyMessage="Nenhum registro encontrado." />
    </OperationalListFrame>
    <RegistryEditDialog open={!!editing} returnFocus={() => editTrigger.current} onClose={() => setEditing(null)} title={`Editar ${editing ? label(editing) : "registro"}`} pending={pending} error={error} onSave={() => { if (editing && onSave && window.confirm("Deseja salvar as alterações?")) void run(() => onSave(editing, form), true); }}>
      <div className={styles.filterFields}>{visibleFields.slice(activeBlock * 6, activeBlock * 6 + 6).map(field => {
        const options = typeof field.options === "function" && editing ? field.options(editing, form) : field.options;
        const change = (value: string | boolean) => setForm(current => ({ ...current, ...Object.fromEntries((field.clears || []).map(key => [key, ""])), [field.key]: value }));
        return <label key={field.key}>{field.label}{field.type === "checkbox" ? <input type="checkbox" checked={!!form[field.key]} onChange={event => change(event.target.checked)} /> : field.type === "select" ? <select value={String(form[field.key] ?? "")} onChange={event => change(event.target.value)}><option value="">Selecione…</option>{Array.isArray(options) && options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : field.type === "textarea" ? <textarea className="w-full rounded border border-slate-300 p-2" rows={2} value={String(form[field.key] ?? "")} onChange={event => change(event.target.value)} /> : <input className={styles.searchInput} type={field.type || "text"} value={String(form[field.key] ?? "")} onChange={event => change(event.target.value)} />}</label>;
      })}</div>
      {blocks > 1 && <div className={styles.dialogButtons}><button type="button" className={styles.dialogButton} disabled={!activeBlock} onClick={() => setBlock(activeBlock - 1)}>Anterior</button><span>Campos {activeBlock + 1} de {blocks}</span><button type="button" className={styles.dialogButton} disabled={activeBlock >= blocks - 1} onClick={() => setBlock(activeBlock + 1)}>Próximos campos</button></div>}
    </RegistryEditDialog>
  </>;
}
