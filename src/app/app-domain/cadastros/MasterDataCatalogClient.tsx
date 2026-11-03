"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { Pencil, Plus, RefreshCw, Paperclip, Printer, Link2, MessageSquare } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { OperationalFilters, OperationalListFrame, OperationalLinkPagination } from "@/components/app-ui/operational/OperationalListFrame";
import { legalTextFilterFields } from "@/lib/cadastros/legal-text-filters";
import { OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { useOperationalWorkspace } from "@/components/app-ui/operational/OperationalWorkspace";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { registryColumns } from "./operational-registry";
import styles from "@/components/app-ui/operational/operational.module.css";
import { createLegalTextComment, createLegalTextRelation, mutateMasterDataRecord, setMasterDataRecordActive } from "./master-data-actions";
import type { MasterDataCatalog, MasterDataColumn, MasterDataField, MasterDataRow, MasterDataValue } from "./master-data-types";

type Props = { catalog: MasterDataCatalog; pathname: string; rows: MasterDataRow[]; columns: MasterDataColumn[]; fields: MasterDataField[]; page: number; total: number; query: string; extraQuery?: Record<string, string>; statusMutable?: boolean; canCreate?: boolean; canUpdate?: boolean; tabs?: { value: string; label: string }[] };
function display(value: MasterDataValue | undefined) {
  if (Array.isArray(value)) return value.join(", ") || "—";
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  return value || "—";
}

// Every catalog column is configured explicitly, independently of viewport breakpoints.
const widths: Record<string, [number, number]> = {
  code: [120, 70], responsible: [220, 110], members: [240, 85], address: [250, 100], name: [230, 110], type: [160, 65], parent: [200, 70],
  entity: [210, 80], secretariat: [210, 95], ibgeCode: [100, 70], state: [120, 70], city: [200, 75], adminRegion: [150, 70], neighborhood: [170, 70], zipCode: [110, 75],
  compe: [90, 75], ispb: [110, 85], shortName: [160, 110], bank: [210, 75], taxType: [150, 65], governmentLevel: [120, 65], effectiveFrom: [120, 90],
  isoCode: [90, 55], symbol: [90, 75], decimalPlaces: [90, 85], isDefault: [90, 70], productKind: [130, 85], category: [150, 90], unit: [90, 80],
  description: [280, 110], signer: [220, 105], signingRole: [210, 160], reportTypes: [230, 100], number: [100, 75], summary: [300, 90], issuingBody: [200, 70], version: [90, 70],
};

export function MasterDataCatalogClient({ catalog, pathname, rows, columns, fields, page, total, query, extraQuery, statusMutable = true, canCreate = true, canUpdate = true, tabs }: Props) {
  const router = useRouter();
  const { device } = useOperationalWorkspace();
  const editTrigger = useRef<HTMLElement | null>(null);
  const [commentSource, setCommentSource] = useState<string | null>(null);
  const [commentError, setCommentError] = useState("");
  const [relationSource, setRelationSource] = useState<string | null>(null);
  const [relationError, setRelationError] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<MasterDataRow | null>(null);
  const [draft, setDraft] = useState<Record<string, MasterDataValue>>({});
  const [block, setBlock] = useState(0);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const blocks = Math.max(1, Math.ceil(fields.length / 3));
  const tableColumns = useMemo(() => registryColumns([...columns.map(column => [column.key, column.label, ...(widths[column.key] || [200, 100])] as [string, string, number, number]), ["_status", "Status", 85, 65, "status"], ["_actions", "Ações", catalog === "legalTexts" ? 120 : 64, catalog === "legalTexts" ? 120 : 64, "actions"]]), [columns, catalog]);

  function begin(row: MasterDataRow | null, trigger: HTMLElement) {
    editTrigger.current = trigger;
    setEditing(row); setError(""); setBlock(0);
    setDraft(Object.fromEntries(fields.map(field => [field.name, row?.values[field.name] ?? (field.type === "checkbox" ? false : field.type === "multiselect" ? [] : "")])));
    setOpen(true);
  }
  function close() { if (!pending) { setOpen(false); setEditing(null); setError(""); } }
  function submit() {
    if (pending) return;
    if (editing ? !canUpdate : !canCreate) return;
    const missing = fields.findIndex(field => {
      const value = draft[field.name];
      return field.required && (!value || (Array.isArray(value) && !value.length));
    });
    if (missing >= 0) { setBlock(Math.floor(missing / 3)); setError(`Preencha ${fields[missing].label}.`); return; }
    const values = Object.fromEntries(fields.map(field => {
      const value = draft[field.name];
      return [field.name, typeof value === "string" ? value.trim() : value];
    }));
    if (catalog === "legalTexts" && editing) values.expectedVersion = editing.values.version ?? "0";
    startTransition(async () => {
      try {
        const result = await mutateMasterDataRecord(catalog, editing?.id || null, values);
        if (result.error) return setError(result.error);
        setOpen(false); setEditing(null); setError(""); router.refresh();
      } catch { setError("Não foi possível salvar o registro."); }
    });
  }
  function toggle(row: MasterDataRow) {
    setError(""); startTransition(async () => {
      try { const result = await setMasterDataRecordActive(catalog, row.id, !row.active); if (result.error) return setError(result.error); router.refresh(); }
      catch { setError("Não foi possível alterar a situação do registro."); }
    });
  }

  return <>
    <OperationalListFrame actions={canCreate && <button type="button" aria-label="Adicionar registro" onClick={event => begin(null, event.currentTarget)} className={styles.newButton}><Plus /><span className={styles.newLabel}>Adicionar</span></button>}
      toolbar={<><form action={pathname} className={styles.searchForm}>{Object.entries(extraQuery || {}).filter(([key]) => key !== "tab" || !tabs).map(([key, value]) => <input key={key} type="hidden" name={key} value={value} />)}
        {tabs && <select name="tab" aria-label="Tipo de catálogo" defaultValue={extraQuery?.tab} className={styles.filterButton}>{tabs.map(tab => <option key={tab.value} value={tab.value}>{tab.label}</option>)}</select>}
        <input name="q" type="search" defaultValue={query} maxLength={catalog === "legalTexts" ? 240 : undefined} placeholder="Buscar registros" aria-label="Buscar registros" className={styles.searchInput} /><button className={styles.filterButton}>Buscar</button></form>
        {catalog === "legalTexts" && <OperationalFilters activeCount={legalTextFilterFields.filter(({ name }) => extraQuery?.[name]).length}>
          <form action={pathname} className="space-y-3">
            <input type="hidden" name="q" value={query} />
            <div className={styles.filterFields}>
              {legalTextFilterFields.map(({ name, label, type }) => <label key={name}>
                {label}
                <input name={name} type={type} maxLength={120} defaultValue={extraQuery?.[name]} className={styles.searchInput} />
              </label>)}
            </div>
            <div className="flex gap-2">
              <button className={styles.filterButton}>Aplicar filtros</button>
              <Link className={styles.filterButton} href={query ? `${pathname}?${new URLSearchParams({ q: query })}` : pathname}>Limpar filtros</Link>
            </div>
          </form>
        </OperationalFilters>}
        {error && !open && <span role="alert" className="text-[13px] text-red-700">{error}</span>}</>}
      pagination={<OperationalLinkPagination page={page} total={total} pathname={pathname} values={{ q: query, ...extraQuery }} />}>
      <OperationalTable preferenceId={`cadastros-catalogo-${catalog}`} caption={`Catálogo ${catalog}`} emptyMessage="Nenhum registro encontrado." columns={tableColumns}
        rows={rows.map(row => ({ id: row.id, label: String(display(row.values[columns[0]?.key])), values: { ...Object.fromEntries(columns.map(column => [column.key, String(display(row.values[column.key]))])), _status: row.active ? "Ativo" : "Inativo" }, actions: <div className={styles.rowActions}>
          {catalog === "legalTexts" && <>{canUpdate && <button type="button" className={styles.iconButton} aria-label="Adicionar comentário" onClick={() => { setCommentError(""); setCommentSource(row.id); }}><MessageSquare /></button>}{canUpdate && <button type="button" className={styles.iconButton} aria-label="Vincular ato" onClick={() => { setRelationError(""); setRelationSource(row.id); }}><Link2 /></button>}<Link className={styles.iconButton} aria-label="Documentos do texto jurídico" href={`/cadastros/textos-juridicos/documentos?${new URLSearchParams({ legalTextId: row.id })}`}><Paperclip /></Link>
            {Number(row.values.version) > 0 && <a className={styles.iconButton} target="_blank" rel="noopener noreferrer" href={`/api/cadastros/textos-juridicos/imprimir?${new URLSearchParams({ legalTextId: row.id, modo: "consulta" })}`}>Consultar ato</a>}
            {Number(row.values.version) > 0 && <a className={styles.iconButton} aria-label="Imprimir texto jurídico" target="_blank" rel="noopener noreferrer" href={`/api/cadastros/textos-juridicos/imprimir?${new URLSearchParams({ legalTextId: row.id, version: String(row.values.version) })}`}><Printer /></a>}</>}
          {canUpdate && <><button type="button" disabled={pending} aria-label="Editar registro" onClick={event => begin(row, event.currentTarget)} className={styles.iconButton}><Pencil /></button>{statusMutable && <button type="button" aria-label={row.active ? "Inativar registro" : "Reativar registro"} onClick={() => toggle(row)} disabled={pending} className={styles.iconButton}><RefreshCw /></button>}</>}
        </div> }))} />
    </OperationalListFrame>
    <Dialog open={commentSource !== null} onOpenChange={next => { if (!next && !pending) setCommentSource(null); }}>
      <DialogContent className={styles.dialog} data-device={device}>
        <DialogHeader><DialogTitle>Adicionar comentário</DialogTitle><DialogDescription>O comentário será exibido na consulta interna do ato.</DialogDescription></DialogHeader>
        <form onSubmit={event => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          startTransition(async () => {
            const result = await createLegalTextComment(data);
            if (result.error) setCommentError(result.error);
            else setCommentSource(null);
          });
        }}>
          <input type="hidden" name="legalTextId" value={commentSource ?? ""} />
          <div className={styles.filterFields}><label>Comentário<textarea name="body" required maxLength={2000} rows={4} /></label></div>
          {commentError && <p role="alert">{commentError}</p>}
          <button className={styles.filterButton} type="submit" disabled={pending}>Salvar comentário</button>
        </form>
      </DialogContent>
    </Dialog>
    <Dialog open={relationSource !== null} onOpenChange={next => { if (!next && !pending) setRelationSource(null); }}>
      <DialogContent className={styles.dialog} data-device={device}>
        <DialogHeader><DialogTitle>Vincular ato</DialogTitle><DialogDescription>Registre a relação do ato selecionado com outro ato cadastrado.</DialogDescription></DialogHeader>
        <form onSubmit={event => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          startTransition(async () => {
            const result = await createLegalTextRelation(data);
            if (result.error) setRelationError(result.error);
            else { setRelationSource(null); router.refresh(); }
          });
        }}>
          <input type="hidden" name="source" value={relationSource ?? ""} />
          <div className={styles.filterFields}>
            <label>Número do ato relacionado<input className={styles.searchInput} name="target" required maxLength={100} /></label>
            <label>Tipo do ato<input className={styles.searchInput} name="targetType" maxLength={120} /></label>
            <label>Esfera do ato<select name="targetLevel"><option value="">Todas</option><option value="MUNICIPAL">Municipal</option><option value="ESTADUAL">Estadual</option><option value="FEDERAL">Federal</option></select></label>
            <label>Órgão do ato<input className={styles.searchInput} name="targetBody" maxLength={200} /></label>
            <label>Tipo de vínculo<select name="type"><option value="REFERENCIA">Referência</option><option value="REGULAMENTA">Regulamenta</option><option value="ALTERA">Altera</option><option value="REVOGA">Revoga</option></select></label>
            <label>Data de efeito<input className={styles.searchInput} type="date" name="date" /></label>
            <label>Notas<textarea name="notes" maxLength={2000} /></label>
          </div>
          {relationError && <p role="alert">{relationError}</p>}
          <button className={styles.filterButton} type="submit" disabled={pending}>Salvar vínculo</button>
        </form>
      </DialogContent>
    </Dialog>
    <Dialog open={open} onOpenChange={next => { if (!next) close(); }}><DialogContent className={styles.dialog} data-device={device} showCloseButton={false} finalFocus={() => editTrigger.current?.isConnected ? editTrigger.current : true}>
      <DialogHeader><DialogTitle>{editing ? "Editar registro" : "Novo registro"}</DialogTitle><DialogDescription>Campos {block + 1} de {blocks}. As seleções são preservadas entre as etapas.</DialogDescription></DialogHeader>
      <form onSubmit={event => { event.preventDefault(); submit(); }}>
        <div className={styles.filterFields}>{fields.slice(block * 3, block * 3 + 3).map(field => <label key={field.name}>{field.label}{field.required ? " *" : ""}
          {field.type === "textarea" ? <textarea className="w-full rounded border border-slate-300 p-2" rows={2} value={String(draft[field.name] || "")} onChange={event => setDraft({ ...draft, [field.name]: event.target.value })} /> : field.type === "select" || field.type === "multiselect" ? <select multiple={field.type === "multiselect"} size={field.type === "multiselect" ? 3 : undefined} style={field.type === "multiselect" ? { height: 96 } : undefined} value={field.type === "multiselect" ? Array.isArray(draft[field.name]) ? draft[field.name] as string[] : [] : String(draft[field.name] || "")} onChange={event => setDraft({ ...draft, [field.name]: field.type === "multiselect" ? Array.from(event.target.selectedOptions, option => option.value) : event.target.value })}>
            {field.type === "select" && <option value="">Selecione</option>}{field.options?.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select> : field.type === "checkbox" ? <input type="checkbox" checked={!!draft[field.name]} onChange={event => setDraft({ ...draft, [field.name]: event.target.checked })} /> : <input className={styles.searchInput} type={field.type || "text"} placeholder={field.placeholder} value={String(draft[field.name] ?? "")} onChange={event => setDraft({ ...draft, [field.name]: event.target.value })} />}
        </label>)}</div>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <div className={styles.dialogFooter}><div className={styles.dialogButtons}><button type="button" className={styles.dialogButton} disabled={!block || pending} onClick={() => setBlock(block - 1)}>Anterior</button><button type="button" className={styles.dialogButton} disabled={block >= blocks - 1 || pending} onClick={() => setBlock(block + 1)}>Próximos campos</button></div><div className={styles.dialogButtons}><button type="button" className={styles.dialogButton} disabled={pending} onClick={close}>Cancelar</button><button className={`${styles.dialogButton} ${styles.primaryButton}`} disabled={pending}>{pending ? "Salvando…" : "Salvar"}</button></div></div>
      </form>
    </DialogContent></Dialog>
  </>;
}
