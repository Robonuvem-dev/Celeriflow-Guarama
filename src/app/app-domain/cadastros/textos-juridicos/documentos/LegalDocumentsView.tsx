"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, Database, Download, FilePlus, Paperclip, Search } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { OperationalListFrame, OperationalLinkPagination } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalTable, type OperationalRow } from "@/components/app-ui/operational/OperationalTable";
import { useOperationalWorkspace } from "@/components/app-ui/operational/OperationalContext";
import styles from "@/components/app-ui/operational/operational.module.css";
import type { OperationalColumn } from "@/lib/operational-tables";
import type { GedListResponse } from "@/lib/contracts/ged";
import { wordAndLibreOfficeAcceptedExtensions } from "@/lib/cadastros/legal-document-policy";

type Data = { legal: { id: string; type: string; number: string; summary: string }; version: { id: string; number: number }; currentVersion: number; legacyOriginal?: boolean; linked: { page: number; total: number; rows: { id: string; filename: string; role: string; versionNumber: number; hash: string; storage?: "GED" | "DATABASE" }[] } | null; available: GedListResponse | null };
const endpoint = "/api/cadastros/textos-juridicos/documentos", pathname = "/cadastros/textos-juridicos/documentos";
const columns: readonly OperationalColumn[] = [
  { key: "filename", label: "Arquivo", type: "text", initialWidth: 340, minWidth: 160, resizable: true, details: "overflow", sortable: false },
  { key: "role", label: "Finalidade / situação", type: "text", initialWidth: 180, minWidth: 110, resizable: true, details: "overflow", sortable: false },
  { key: "version", label: "Versão GED", type: "identifier", initialWidth: 100, minWidth: 90, resizable: true, sortable: false, details: "overflow" },
  { key: "hash", label: "SHA-256", type: "text", initialWidth: 300, minWidth: 130, resizable: true, details: "overflow", sortable: false },
  { key: "actions", label: "Ações", type: "actions", initialWidth: 96, minWidth: 96, resizable: false, sortable: false, details: "none" },
];
export function LegalDocumentsView({ query, canBind }: { query: Record<string, string>; canBind: boolean }) {
  const { device } = useOperationalWorkspace();
  const [responseData, setData] = useState<Data | null>(null), [loadedSearch, setLoadedSearch] = useState(""), [error, setError] = useState(""), [notice, setNotice] = useState(""), [pending, setPending] = useState(false), [refresh, setRefresh] = useState(0);
  const [dbOpen, setDbOpen] = useState(false), [dbRole, setDbRole] = useState<"ORIGINAL" | "ATTACHMENT">("ORIGINAL"), [dbFile, setDbFile] = useState<File | null>(null), [dbError, setDbError] = useState("");
  const search = new URLSearchParams(query).toString(), available = query.view === "available";
  const data = loadedSearch === search ? responseData : null;
  useEffect(() => {
    const controller = new AbortController();
    fetch(`${endpoint}?${search}`, { signal: controller.signal, cache: "no-store" }).then(async response => {
      const result = await response.json(); if (!response.ok) throw new Error(result.error || "Não foi possível consultar os documentos.");
      if (!controller.signal.aborted) { setData(result); setLoadedSearch(search); setError(""); }
    }).catch(e => { if (!controller.signal.aborted) { setData(null); setError(e instanceof Error ? e.message : "Falha na consulta."); } });
    return () => controller.abort();
  }, [search, refresh]);
  async function bind(documentId: string, documentVersionId: string, role: "ORIGINAL" | "ATTACHMENT") {
    if (!data || !canBind || pending) return;
    setPending(true); setError(""); setNotice("");
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ legalTextId: data.legal.id, legalTextVersionId: data.version.id, expectedVersion: data.version.number, documentId, documentVersionId, role }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || "Não foi possível vincular o arquivo.");
      setNotice(`Arquivo vinculado à versão jurídica ${data.version.number}. Consulte os vínculos para baixar o original.`);
      setRefresh(value => value + 1);
    } catch (e) { setError(e instanceof Error ? e.message : "Falha ao vincular."); }
    finally { setPending(false); }
  }
  async function saveDatabaseFile() {
    if (!data || !canBind || pending || !dbFile) { setDbError("Selecione um arquivo Word ou LibreOffice."); return; }
    setPending(true); setDbError(""); setNotice("");
    try {
      const bytes = new Uint8Array(await dbFile.arrayBuffer());
      let binary = "";
      for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      const contentBase64 = btoa(binary);
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ legalTextId: data.legal.id, legalTextVersionId: data.version.id, expectedVersion: data.version.number, role: dbRole, filename: dbFile.name, contentBase64 }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || "Não foi possível gravar o arquivo no banco.");
      setDbOpen(false); setDbFile(null);
      setNotice(`Arquivo Word/LibreOffice gravado diretamente no banco na versão jurídica ${data.version.number}.`);
      setRefresh(value => value + 1);
    } catch (e) { setDbError(e instanceof Error ? e.message : "Falha ao gravar no banco."); }
    finally { setPending(false); }
  }
  const rows: OperationalRow[] = available ? (data?.available?.documents ?? []).map(row => ({ id: row.id, label: row.filename, values: { filename: row.filename, role: row.versionStatus, version: String(row.versionNumber), hash: row.hashSha256 }, actions: canBind && data?.version.number === data?.currentVersion && <div className={styles.rowActions}><button type="button" className={styles.iconButton} disabled={pending || !!row.checkoutOwnerId || !["FINAL", "SIGNED"].includes(row.versionStatus)} aria-label={`Vincular original ${row.filename}`} onClick={() => void bind(row.id, row.versionId, "ORIGINAL")}><FilePlus /></button><button type="button" className={styles.iconButton} disabled={pending || !!row.checkoutOwnerId || !["FINAL", "SIGNED"].includes(row.versionStatus)} aria-label={`Vincular anexo ${row.filename}`} onClick={() => void bind(row.id, row.versionId, "ATTACHMENT")}><Paperclip /></button></div> }))
    : (data?.linked?.rows ?? []).map(row => ({ id: row.id, label: row.filename, values: { filename: row.filename, role: `${row.role === "ORIGINAL" ? "Original" : "Anexo"}${row.storage === "DATABASE" ? " (Banco)" : ""}`, version: String(row.versionNumber), hash: row.hash }, actions: <div className={styles.rowActions}><a className={styles.iconButton} aria-label={`Baixar ${row.filename}`} href={`${endpoint}?${new URLSearchParams({ legalTextId: query.legalTextId || "", version: String(data!.version.number), download: row.id })}`}><Download /></a></div> }));
  const page = (available ? data?.available?.page : data?.linked?.page) ?? 1, total = (available ? data?.available?.total : data?.linked?.total) ?? 0;
  return <>
    <OperationalListFrame label="Documentos do texto jurídico" actions={<><Link className={styles.iconButton} aria-label="Voltar aos textos jurídicos" href="/cadastros/textos-juridicos"><ArrowLeft /></Link>{canBind && (!data || data.version.number === data.currentVersion) && <button type="button" className={styles.iconButton} aria-label="Gravar Word ou LibreOffice no banco" onClick={() => { setDbError(""); setDbOpen(true); }}><Database /></button>}<Link className={styles.iconButton} aria-label={available ? "Consultar vínculos" : "Selecionar documentos no GED"} href={`${pathname}?${new URLSearchParams({ legalTextId: query.legalTextId || "", ...(query.version ? { version: query.version } : {}), view: available ? "linked" : "available" })}`}>{available ? <Paperclip /> : <Search />}</Link></>}
      toolbar={<><form action={pathname} method="get" className={styles.searchForm}><input type="hidden" name="legalTextId" value={query.legalTextId || ""} /><input type="hidden" name="view" value={available ? "available" : "linked"} /><input className={styles.searchInput} type="number" name="version" min="1" aria-label="Versão jurídica" placeholder="Versão atual" defaultValue={query.version || ""} />{available && <input type="search" className={styles.searchInput} name="q" aria-label="Pesquisar conteúdo no GED" defaultValue={query.q || ""} placeholder="Pesquisar conteúdo no GED" />}<button className={styles.iconButton} aria-label="Consultar documentos"><Search /></button></form>{error && <p role="alert" className="text-sm text-red-700">{error}</p>}<span className="text-xs">{data ? `${data.legal.type} ${data.legal.number} · versão jurídica ${data.version.number} · ${available ? "Selecione a finalidade do arquivo. Vínculos são permanentes nesta versão." : "Arquivos fixados na versão GED indicada."}` : "Consultando documentos…"}</span></>}
      pagination={<OperationalLinkPagination pathname={pathname} values={query} page={page} total={total} />}>
      {data?.legacyOriginal && <p role="status" className="text-sm">Esta versão possui documento legado ainda sem versão GED fixada. Confira o original antes de registrar o vínculo.</p>}
      {data && notice && <p role="status" className="text-sm">{notice}</p>}
      <OperationalTable columns={columns} rows={rows} preferenceId={`legal-documents-${available ? "available" : "linked"}`} caption="Originais e anexos jurídicos" emptyMessage="Nenhum documento acessível encontrado." />
    </OperationalListFrame>
    <Dialog open={dbOpen} onOpenChange={next => { if (!next && !pending) setDbOpen(false); }}>
      <DialogContent className={styles.dialog} data-device={device}>
        <DialogHeader><DialogTitle>Gravar Word ou LibreOffice no banco</DialogTitle><DialogDescription>O arquivo original (.doc, .docx, .rtf, .odt, .odf, .ods) é gravado sem conversão em tabela dedicada de blobs, sem impactar a performance de listagem.</DialogDescription></DialogHeader>
        <form onSubmit={event => { event.preventDefault(); void saveDatabaseFile(); }}>
          <div className={styles.filterFields}>
            <label>Finalidade<select value={dbRole} onChange={event => setDbRole(event.target.value as "ORIGINAL" | "ATTACHMENT")}><option value="ORIGINAL">Original da versão jurídica</option><option value="ATTACHMENT">Anexo da versão jurídica</option></select></label>
            <label>Arquivo Word / LibreOffice<input type="file" accept={wordAndLibreOfficeAcceptedExtensions} onChange={event => setDbFile(event.target.files?.[0] ?? null)} /></label>
          </div>
          {dbError && <p role="alert" className="text-sm text-red-700">{dbError}</p>}
          <div className={styles.dialogFooter}><button type="button" className={styles.dialogButton} disabled={pending} onClick={() => setDbOpen(false)}>Cancelar</button><button type="submit" className={`${styles.dialogButton} ${styles.primaryButton}`} disabled={pending}>{pending ? "Gravando…" : "Gravar no banco"}</button></div>
        </form>
      </DialogContent>
    </Dialog>
  </>;
}
