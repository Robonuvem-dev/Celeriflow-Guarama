"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import { Download, Eye, FolderTree, MoreHorizontal, Plus, RefreshCw, Save, Search, Upload } from "lucide-react";
import { OperationalListFrame, OperationalFilters } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalPagination, OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { OperationalColumn } from "@/lib/operational-tables";
import type { GedBootstrap, GedDocumentItem, GedListResponse, GedSection } from "@/lib/contracts/ged";
import { gedFileType, parseGedManifest, type GedManifestItem, type GedQuery } from "@/lib/documents/ged-policy";
import styles from "@/components/app-ui/operational/operational.module.css";
import workspaceStyles from "./GedWorkspace.module.css";
import { gedCommand } from "./ged-client";

const labels: Record<GedSection, string> = { acervo: "Documentos e pastas", pesquisa: "Pesquisa avançada", "pastas-inteligentes": "Pastas inteligentes", importacoes: "Importações e lotes", processamento: "OCR e indexação", tarefas: "Minhas tarefas", fluxos: "Fluxos documentais", modelos: "Modelos de documentos", thesaurus: "Thesaurus", classes: "Classes documentais" };
const documentColumns: OperationalColumn[] = [
  { key: "selected", label: "Sel.", type: "actions", initialWidth: 42, minWidth: 40, maxWidth: 42, resizable: false, sortable: false, details: "none" },
  { key: "title", label: "Documento", type: "text", initialWidth: 270, minWidth: 140, resizable: true, sortable: false, details: "overflow" },
  { key: "folder", label: "Pasta", type: "text", initialWidth: 150, minWidth: 85, resizable: true, sortable: false, details: "overflow" },
  { key: "version", label: "Versão", type: "identifier", initialWidth: 65, minWidth: 55, resizable: true, sortable: false, details: "overflow" },
  { key: "status", label: "Situação", type: "status", initialWidth: 150, minWidth: 100, resizable: true, sortable: false, details: "overflow" },
  { key: "content", label: "Conteúdo", type: "text", initialWidth: 220, minWidth: 110, resizable: true, sortable: false, details: "overflow" },
  { key: "actions", label: "Ações", type: "actions", initialWidth: 70, minWidth: 60, maxWidth: 80, resizable: false, sortable: false, details: "none" },
];
const listColumns: OperationalColumn[] = [
  { key: "title", label: "Nome", type: "text", initialWidth: 270, minWidth: 140, resizable: true, sortable: false, details: "overflow" },
  { key: "kind", label: "Tipo / fase", type: "text", initialWidth: 180, minWidth: 100, resizable: true, sortable: false, details: "overflow" },
  { key: "status", label: "Situação", type: "status", initialWidth: 130, minWidth: 90, resizable: true, sortable: false, details: "overflow" },
  { key: "detail", label: "Detalhes", type: "text", initialWidth: 250, minWidth: 120, resizable: true, sortable: false, details: "overflow" },
  { key: "actions", label: "Ações", type: "actions", initialWidth: 80, minWidth: 65, maxWidth: 90, resizable: false, sortable: false, details: "none" },
];
type UploadItem = { id: string; file: File; title: string; status: string; url?: string; error?: string };
type Template = { id: string; name: string; content: string; markers: string[]; templateKey: string; version: number };
type Panel = "import" | "folder" | "smart" | "template" | "term" | "tree" | "generate" | "move-folder" | null;

export function GedWorkspace({ section, bootstrap, initial, initialSmartId = "" }: { section: GedSection; bootstrap: GedBootstrap; initial: GedListResponse; initialSmartId?: string }) {
  const router = useRouter();
  const [result, setResult] = useState(initial), [query, setQuery] = useState<GedQuery>(initial.query), [smartId, setSmartId] = useState(initialSmartId);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [loadError, setLoadError] = useState(false), [panel, setPanel] = useState<Panel>(null);
  const [selected, setSelected] = useState<Record<string, string>>({}), [items, setItems] = useState<UploadItem[]>([]), [batchId, setBatchId] = useState("");
  const [classCode, setClassCode] = useState(bootstrap.classes[0]?.code || ""), [name, setName] = useState(""), [content, setContent] = useState("");
  const [legacyReference, setLegacyReference] = useState(""), [template, setTemplate] = useState<Template | null>(null), [markerValues, setMarkerValues] = useState<Record<string, string>>({});
  const [manifest, setManifest] = useState<Record<string, GedManifestItem>>({});
  const [folders, setFolders] = useState<Array<{ id: string; name: string; children: number; parentId: string | null }>>([]), [path, setPath] = useState<Array<{ id: string; name: string }>>([]);
  const [movingFolder, setMovingFolder] = useState<{ id: string; name: string } | null>(null);
  const isCollection = section === "acervo" || section === "pesquisa";
  const load = useCallback(async (page = 1, nextQuery = query, nextSmartId = smartId) => {
    setBusy(true); setMessage(""); setLoadError(false);
    try {
      const params = new URLSearchParams({ section, page: String(page), ...Object.fromEntries(Object.entries(nextQuery).map(([key, value]) => [key, String(value)])) });
      if (nextSmartId) params.set("smartId", nextSmartId);
      const response = await fetch(`/api/assinatura-digital/ged?${params}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível consultar o acervo.");
      setResult(data);
    } catch (error) { setLoadError(true); setMessage(error instanceof Error ? error.message : "Falha na consulta."); }
    finally { setBusy(false); }
  }, [query, section, smartId]);
  async function perform(command: string, id = "", data: Record<string, unknown> = {}) {
    setBusy(true); setMessage("");
    try { const value = await gedCommand(command, id, data); setPanel(null); await load(result.page, result.query); return value; }
    catch (error) { setMessage(error instanceof Error ? error.message : "Falha na operação."); }
    finally { setBusy(false); }
  }
  async function browse(parentId: string | null) {
    try { const response = await fetch(`/api/assinatura-digital/ged?folders=1${parentId ? `&parentId=${encodeURIComponent(parentId)}` : ""}`); const data = await response.json(); if (!response.ok) throw new Error(data.error); setFolders(data); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Falha ao abrir pastas."); }
  }
  async function openTree() { setPath([]); setPanel("tree"); await browse(null); }
  async function importFiles() {
    if (!classCode || !items.length) { setMessage("Selecione arquivos e uma classe documental."); return; }
    setBusy(true); setMessage("");
    let failures = 0;
    for (const item of items.filter(i => i.status !== "DONE")) {
      const update = (patch: Partial<UploadItem>) => setItems(current => current.map(i => i.id === item.id ? { ...i, ...patch } : i));
      try {
        update({ status: "RUNNING", error: undefined });
        const safe = item.file.name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]/g, "-").slice(-120) || "arquivo";
        let url = item.url;
        if (!url) { const resumed = await gedCommand("resume-upload", item.id); url = resumed.url || undefined; if (resumed.documentId) { update({ status: "DONE" }); continue; } }
        if (!url) {
          const metadata = manifest[item.file.name];
          const blob = await upload(`${bootstrap.documentPrefix}ged/${bootstrap.userId}/${item.id}/${safe}`, item.file, { access: "private", contentType: gedFileType(item.file.name), handleUploadUrl: "/api/assinatura-digital/ged/upload",
            clientPayload: JSON.stringify({ id: item.id, batchId, filename: item.file.name, title: metadata?.title || item.title, classCode: metadata?.classCode || classCode, folderId: query.folderId || null, folderPath: metadata?.folderPath || [], legacyReference: metadata?.legacyReference || legacyReference }) });
          url = blob.url; update({ url });
        }
        await gedCommand("confirm-upload", item.id, { url });
        update({ status: "DONE" });
      } catch (error) { failures++; update({ status: "FAILED", error: error instanceof Error ? error.message : "Falha no envio." }); }
    }
    setBusy(false); await load(result.page);
    setMessage(failures ? `${failures} arquivo(s) com falha. Repita para reenviar somente os pendentes.` : "Lote importado. Execute a indexação em OCR e indexação.");
  }
  async function openTemplate(id: string, generate: boolean) {
    try { const response = await fetch(`/api/assinatura-digital/ged?templateId=${encodeURIComponent(id)}`); const data = await response.json(); if (!response.ok) throw new Error(data.error); setTemplate(data); setName(data.name); setContent(data.content); setMarkerValues({}); setPanel(generate ? "generate" : "template"); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Falha ao abrir modelo."); }
  }
  function documentActions(document: GedDocumentItem) {
    return <Link href={`/assinatura-digital/acervo/${document.id}`} className={styles.iconButton} aria-label={`Abrir ${document.title}`}><Eye className="size-4" /></Link>;
  }
  const uploadStatus = items.map(i => `${i.file.name}: ${i.status}${i.error ? ` — ${i.error}` : ""}`);
  return <>
    <OperationalListFrame label={labels[section]} actions={<>
      {(isCollection || section === "importacoes") && bootstrap.capabilities.import && <button className={`${styles.newButton} ${workspaceStyles.action}`} aria-label="Importar lote" title="Importar lote" onClick={() => { setPanel("import"); if (!batchId) setBatchId(crypto.randomUUID()); }}><Upload /><span className={workspaceStyles.actionLabel}>Importar lote</span></button>}
      {isCollection && bootstrap.capabilities.import && <button className={`${styles.newButton} ${workspaceStyles.action}`} aria-label="Pasta" title="Nova pasta" onClick={() => { setName(""); setPanel("folder"); }}><Plus /><span className={workspaceStyles.actionLabel}>Pasta</span></button>}
      {isCollection && <button className={`${styles.newButton} ${workspaceStyles.action}`} aria-label="Salvar consulta" title="Salvar consulta" onClick={() => { setName(""); setPanel("smart"); }}><Save /><span className={workspaceStyles.actionLabel}>Salvar consulta</span></button>}
      {isCollection && Object.keys(selected).length > 0 && <a className={`${styles.newButton} ${workspaceStyles.action}`} aria-label={`Baixar ZIP (${Object.keys(selected).length})`} title={`Baixar ZIP (${Object.keys(selected).length})`} href={`/api/assinatura-digital/ged/download?zip=1&items=${encodeURIComponent(JSON.stringify(Object.entries(selected).map(([id, versionId]) => ({ id, versionId }))))}`}><Download /><span className={workspaceStyles.actionLabel}>ZIP ({Object.keys(selected).length})</span></a>}
      {section === "modelos" && bootstrap.capabilities.models && <button className={`${styles.newButton} ${workspaceStyles.action}`} aria-label="Criar / importar modelo" title="Criar / importar modelo" onClick={() => { setTemplate(null); setName(""); setContent(""); setPanel("template"); }}><Plus /><span className={workspaceStyles.actionLabel}>Criar / importar modelo</span></button>}
      {section === "thesaurus" && bootstrap.capabilities.configure && <button className={`${styles.newButton} ${workspaceStyles.action}`} aria-label="Termo" title="Novo termo" onClick={() => { setName(""); setContent(""); setPanel("term"); }}><Plus /><span className={workspaceStyles.actionLabel}>Termo</span></button>}
    </>} toolbar={<>
      <form className="flex min-w-0 flex-1 gap-2" onSubmit={event => { event.preventDefault(); setSmartId(""); void load(1, query, ""); }}>
        <input aria-label="Buscar documentos ou registros" placeholder={isCollection ? "Pesquisar no conteúdo dos documentos" : "Buscar por nome"} className={styles.searchInput} value={query.text} onChange={event => setQuery({ ...query, text: event.target.value })} />
        <button type="submit" className={`${styles.dialogButton} ${workspaceStyles.action}`} aria-label="Buscar" title="Buscar" disabled={busy}><Search className={workspaceStyles.searchIcon} /><span className={workspaceStyles.actionLabel}>Buscar</span></button>
      </form>
      {isCollection && <><button className={styles.iconButton} onClick={() => void openTree()} aria-label="Explorar árvore de pastas"><FolderTree /></button>
        <OperationalFilters label="Filtros" activeCount={Number(Boolean(query.status)) + Number(Boolean(query.folderId)) + Number(query.mode !== "words") + Number(query.thesaurus)}>
          <label className={styles.filterFields}>Modo<select value={query.mode} onChange={event => setQuery({ ...query, mode: event.target.value as GedQuery["mode"] })}><option value="words">Todas as palavras</option><option value="phrase">Frase exata</option><option value="fragment">Fragmento literal</option><option value="proximity">Proximidade (duas palavras)</option></select></label>
          <label className={styles.filterFields}>Máximo de palavras entre termos<input type="number" min={0} max={50} value={query.distance} onChange={event => setQuery({ ...query, distance: Number(event.target.value) })} /></label>
          <label className={styles.filterFields}><input type="checkbox" checked={query.thesaurus} onChange={event => setQuery({ ...query, thesaurus: event.target.checked })} />Expandir equivalentes do thesaurus</label>
          <label className={styles.filterFields}>Situação<select value={query.status} onChange={event => setQuery({ ...query, status: event.target.value })}><option value="">Todas</option>{["RASCUNHO", "ELABORACAO", "CONSENSO", "APROVACAO", "HOMOLOGACAO", "HOMOLOGADO", "DEVOLVIDO", "Pendente Assinatura", "Assinado"].map(status => <option key={status}>{status}</option>)}</select></label>
          <button className={styles.dialogButton} onClick={() => { setSmartId(""); void load(1, query, ""); }}>Aplicar</button>
          <button className={styles.dialogButton} onClick={() => { const clean = { ...query, text: "", status: "", folderId: "", mode: "words" as const, thesaurus: false }; setQuery(clean); setSelected({}); setSmartId(""); void load(1, clean, ""); }}>Limpar filtros</button>
        </OperationalFilters></>}
      <button className={styles.iconButton} onClick={() => void load(result.page, result.query)} aria-label="Atualizar consulta" disabled={busy}><RefreshCw /></button>
      {message && <span role="status" className="max-w-52 truncate text-xs" title={message}>{message}</span>}
    </>} pagination={<OperationalPagination page={result.page} total={result.total} pending={busy} onPageChange={page => void load(page, result.query)} />}>
      <OperationalTable columns={isCollection ? documentColumns : listColumns} preferenceId={`ged-assinatura-${section}`} caption={labels[section]} state={busy ? "loading" : loadError ? "error" : "ready"} onRetry={() => void load(result.page)} errorMessage={message} emptyMessage="Nenhum registro encontrado neste escopo."
        rows={isCollection ? result.documents.map(document => ({ id: document.id, label: document.title,
          values: { selected: selected[document.id] ? "Selecionado" : "", title: document.title, folder: document.folderName || "Raiz", version: String(document.versionNumber), status: document.checkoutOwnerId ? "Em edição" : document.status === "Assinado" ? document.status : document.editorialStatus, content: document.snippet || document.legacyReference || "Indexação pendente" },
          cells: { selected: <input type="checkbox" aria-label={`Selecionar ${document.title}`} checked={Boolean(selected[document.id])} onChange={event => setSelected(current => { const next = { ...current }; if (event.target.checked) next[document.id] = document.versionId; else delete next[document.id]; return next; })} /> }, actions: documentActions(document),
        })) : result.rows.map(row => ({ id: row.id, label: row.title, values: { title: row.title, kind: row.kind, status: row.status, detail: row.detail }, actions: <DropdownMenu>
          <DropdownMenuTrigger render={<button className={styles.iconButton} aria-label={`Ações de ${row.title}`} />}><MoreHorizontal /></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {section === "pastas-inteligentes" && <><DropdownMenuItem render={<Link href={`/assinatura-digital/pesquisa?smartId=${row.id}`} />}>Abrir consulta</DropdownMenuItem><DropdownMenuItem onClick={() => void perform("delete-smart", row.id)}>Excluir minha consulta</DropdownMenuItem></>}
            {section === "processamento" && bootstrap.capabilities.edit && <DropdownMenuItem onClick={() => void perform("process", row.id)}>Processar / repetir</DropdownMenuItem>}
            {(section === "tarefas" || section === "fluxos") && <DropdownMenuItem onClick={() => { void gedCommand("review-document", row.id).then(value => { router.push(`/assinatura-digital/acervo/${value.documentId}`); }).catch(error => setMessage(error.message)); }}>Abrir documento e tarefa</DropdownMenuItem>}
            {section === "modelos" && <><DropdownMenuItem onClick={() => void openTemplate(row.id, true)}>Gerar documento</DropdownMenuItem>{bootstrap.capabilities.models && <DropdownMenuItem onClick={() => void openTemplate(row.id, false)}>Editar / nova versão</DropdownMenuItem>}</>}
            {(section === "classes" || section === "importacoes" || section === "thesaurus") && <DropdownMenuItem onClick={() => setMessage(`${row.title}: ${row.detail}`)}>Consultar detalhes</DropdownMenuItem>}
          </DropdownMenuContent></DropdownMenu> }))} />
    </OperationalListFrame>
    <Dialog open={panel !== null} onOpenChange={open => { if (!open && !busy) setPanel(null); }}>
      <DialogContent className="sm:max-w-xl"><DialogHeader><DialogTitle>{panel === "tree" ? "Árvore de pastas" : panel === "import" ? "Importar acervo digitalizado" : panel === "folder" ? "Nova pasta" : panel === "smart" ? "Salvar pasta inteligente" : panel === "term" ? "Termo e equivalentes" : panel === "generate" ? "Gerar documento do modelo" : panel === "move-folder" ? "Mover / renomear pasta" : "Criar / importar modelo"}</DialogTitle>
        <DialogDescription>{panel === "import" ? "Envio direto ao Blob privado, até 20 MiB por arquivo. Itens concluídos não são reenviados." : "As operações respeitam seu escopo documental e preservam o histórico."}</DialogDescription></DialogHeader>
      {message && <p role="alert" className="break-words text-sm text-red-700">{message}</p>}
      {panel === "tree" && <div className="space-y-3"><nav aria-label="Caminho da pasta" className="flex flex-wrap gap-1"><button onClick={() => { setPath([]); void browse(null); }}>Raiz</button>{path.map((part, index) => <button key={part.id} onClick={() => { setPath(path.slice(0, index + 1)); void browse(part.id); }}> / {part.name}</button>)}</nav>
        <select aria-label="Subpastas" size={Math.min(8, Math.max(2, folders.length))} className="w-full rounded border p-2" onChange={event => { const folder = folders.find(f => f.id === event.target.value); if (folder) { setPath([...path, { id: folder.id, name: folder.name }]); void browse(folder.id); } }} value=""><option value="" disabled>Selecione uma subpasta para expandir</option>{folders.map(folder => <option key={folder.id} value={folder.id}>{folder.name} ({folder.children} subpastas)</option>)}</select>
        <div className="flex gap-2"><button className={styles.primaryButton} onClick={() => { const next = { ...query, folderId: path.at(-1)?.id || "" }; setQuery(next); setSmartId(""); setPanel(null); void load(1, next, ""); }}>Abrir documentos desta pasta</button>
          {path.length > 0 && bootstrap.capabilities.edit && <><button className={styles.dialogButton} onClick={() => { setMovingFolder(path.at(-1)!); setName(path.at(-1)!.name); setContent(""); setPanel("move-folder"); }}>Mover / renomear</button><button className={styles.dialogButton} disabled={busy} onClick={() => void perform("delete-folder", path.at(-1)!.id)}>Excluir pasta vazia</button></>}</div></div>}
      {(panel === "folder" || panel === "smart" || panel === "term" || panel === "move-folder") && <form className="grid gap-3" onSubmit={event => { event.preventDefault(); if (panel === "folder") void perform("create-folder", "", { name, parentId: query.folderId }); if (panel === "smart") void perform("save-smart", "", { name, query }); if (panel === "term") void perform("save-term", "", { term: name, equivalents: content.split(",").map(s => s.trim()).filter(Boolean) }); if (panel === "move-folder") void perform("move-folder", movingFolder?.id, { name, parentId: content.trim() }); }}>
        <label>Nome / termo<input required maxLength={150} className="block w-full rounded border p-2" value={name} onChange={event => setName(event.target.value)} /></label>
        {panel === "term" && <label>Equivalentes separados por vírgula<input required className="block w-full rounded border p-2" value={content} onChange={event => setContent(event.target.value)} /></label>}
        {panel === "move-folder" && <label>ID da pasta de destino (vazio para raiz)<input className="block w-full rounded border p-2" value={content} onChange={event => setContent(event.target.value)} /></label>}
        <button disabled={busy} className={styles.primaryButton}>Salvar</button></form>}
      {panel === "import" && <div className="grid gap-3">
        <label>Classe documental<select disabled={busy || items.some(item => item.status !== "PENDING")} className="block w-full rounded border p-2" value={classCode} onChange={event => setClassCode(event.target.value)}>{bootstrap.classes.map(item => <option key={item.code} value={item.code}>{item.label}</option>)}</select></label>
        <label>Referência do legado / origem<input disabled={busy || items.some(item => item.status !== "PENDING")} maxLength={300} className="block w-full rounded border p-2" value={legacyReference} onChange={event => setLegacyReference(event.target.value)} /></label>
        <label className="text-sm">Manifesto CSV opcional (filename, title, folderPath, classCode, legacyReference)<input type="file" accept=".csv" disabled={busy || items.some(item => item.status !== "PENDING")} onChange={async event => { const file = event.target.files?.[0]; if (!file) return; try { const rows = parseGedManifest(await file.text()); setManifest(Object.fromEntries(rows.map(row => [row.filename, row]))); setMessage(`${rows.length} metadados carregados. Pastas do manifesto serão criadas na importação.`); } catch (error) { setMessage(error instanceof Error ? error.message : "Manifesto inválido."); } }} /></label>
        <label>Arquivos PDF, imagens, TXT ou DOCX<input type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.txt,.docx" disabled={busy} onChange={event => { setBatchId(crypto.randomUUID()); setItems(Array.from(event.target.files || []).map(file => ({ id: crypto.randomUUID(), file, title: file.name.replace(/\.[^.]+$/, ""), status: "PENDING" }))); }} /></label>
        <textarea readOnly aria-label="Resultado individual do lote" rows={5} className="w-full rounded border p-2 text-xs" value={uploadStatus.join("\n")} />
        <button className={styles.primaryButton} disabled={busy || !items.length || !classCode} onClick={() => void importFiles()}>{busy ? "Enviando…" : "Importar / repetir pendentes"}</button></div>}
      {panel === "template" && <form className="grid gap-3" onSubmit={event => { event.preventDefault(); void perform("save-template", "", { name, content, templateKey: template?.templateKey || "" }); }}>
        <label>Nome do modelo<input required className="block w-full rounded border p-2" value={name} onChange={event => setName(event.target.value)} /></label>
        <label>Conteúdo e marcadores como {"{{nome}}"}<textarea required rows={6} maxLength={100000} className="block w-full rounded border p-2" value={content} onChange={event => setContent(event.target.value)} /></label>
        <div className="flex gap-2"><button disabled={busy} className={styles.primaryButton}>Salvar versão</button><label className={styles.dialogButton}>Importar DOCX<input type="file" accept=".docx" className="sr-only" disabled={busy} onChange={async event => {
          const file = event.target.files?.[0]; if (!file) return; setBusy(true);
          try { const body = new FormData(); body.set("file", file); body.set("name", name || file.name); if (template) body.set("templateKey", template.templateKey); const response = await fetch("/api/assinatura-digital/ged/upload", { method: "POST", body }); const data = await response.json(); if (!response.ok) throw new Error(data.error); setPanel(null); await load(); }
          catch (error) { setMessage(error instanceof Error ? error.message : "Falha ao importar modelo."); } finally { setBusy(false); }
        }} /></label></div></form>}
      {panel === "generate" && template && <form className="grid gap-3" onSubmit={event => { event.preventDefault(); void perform("generate-template", template.id, { values: markerValues, classCode }); }}>
        <p>{template.name} — versão {template.version}</p>
        {template.markers.map(marker => <label key={marker}>{marker}<input required maxLength={5000} className="block w-full rounded border p-2" value={markerValues[marker] || ""} onChange={event => setMarkerValues({ ...markerValues, [marker]: event.target.value })} /></label>)}
        <label>Classe<select className="block w-full rounded border p-2" value={classCode} onChange={event => setClassCode(event.target.value)}>{bootstrap.classes.map(item => <option key={item.code} value={item.code}>{item.label}</option>)}</select></label>
        <button disabled={busy} className={styles.primaryButton}>Gerar DOCX e registrar no acervo</button></form>}
      </DialogContent>
    </Dialog>
  </>;
}
