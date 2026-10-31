"use client";

import Link from "next/link";
import { useState } from "react";
import { upload } from "@vercel/blob/client";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalTablePanel } from "@/components/app-ui/operational/OperationalTablePanel";
import { OperationalPagination, OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import type { OperationalColumn } from "@/lib/operational-tables";
import type { GedBootstrap, GedDetail } from "@/lib/contracts/ged";
import { gedFileType, gedStages, gedStageLabels } from "@/lib/documents/ged-policy";
import styles from "@/components/app-ui/operational/operational.module.css";
import { gedCommand, gedDownloadUrl } from "./ged-client";
import { GedZoneViewer } from "./GedZoneViewer";
import { GedFolderPicker } from "./GedFolderPicker";

const versionColumns: OperationalColumn[] = [
  { key: "number", label: "Versão", type: "identifier", initialWidth: 70, minWidth: 60, resizable: true, sortable: false, details: "overflow" },
  { key: "status", label: "Estado", type: "status", initialWidth: 130, minWidth: 90, resizable: true, sortable: false, details: "overflow" },
  { key: "hash", label: "SHA-256", type: "identifier", initialWidth: 420, minWidth: 180, resizable: true, sortable: false, details: "overflow" },
  { key: "date", label: "Criada em", type: "text", initialWidth: 170, minWidth: 110, resizable: true, sortable: false, details: "overflow" },
  { key: "actions", label: "Original", type: "actions", initialWidth: 120, minWidth: 100, maxWidth: 140, resizable: false, sortable: false, details: "none" },
];
export function GedDocumentDetail({ initial, bootstrap }: { initial: GedDetail; bootstrap: GedBootstrap }) {
  const [detail, setDetail] = useState(initial), [tab, setTab] = useState<"document" | "text" | "workflow" | "ocr">("document"), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [comment, setComment] = useState(""), [signers, setSigners] = useState<string[]>([]), [textPage, setTextPage] = useState(0), [textBlock, setTextBlock] = useState(0);
  const [assignments, setAssignments] = useState<Record<string, string[]>>(Object.fromEntries(gedStages.map(stage => [stage, []]))), [dueAt, setDueAt] = useState("");
  const [checkin, setCheckin] = useState<{ id: string; file: File; url?: string } | null>(null);
  const document = detail.document;
  async function refresh(versionPage = detail.versionPage) { const response = await fetch(`/api/assinatura-digital/ged?documentId=${encodeURIComponent(document.id)}&versionPage=${versionPage}`); const data = await response.json(); if (!response.ok) throw new Error(data.error); setDetail(data); }
  async function act(command: string, id = document.id, data: Record<string, unknown> = {}) {
    setBusy(true); setMessage(""); try { await gedCommand(command, id, data); await refresh(); setMessage("Operação concluída."); } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível concluir."); } finally { setBusy(false); }
  }
  async function sendCheckin() {
    if (!checkin) return;
    setBusy(true); setMessage("");
    try {
      let url = checkin.url;
      if (!url) { const resumed = await gedCommand("resume-upload", checkin.id); url = resumed.url || undefined; }
      if (!url) {
        const safe = checkin.file.name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]/g, "-").slice(-120);
        const blob = await upload(`${bootstrap.documentPrefix}ged/${bootstrap.userId}/${checkin.id}/${safe}`, checkin.file, { access: "private", contentType: gedFileType(checkin.file.name), handleUploadUrl: "/api/assinatura-digital/ged/upload", clientPayload: JSON.stringify({ id: checkin.id, batchId: checkin.id, filename: checkin.file.name, title: document.title, classCode: "CHECKIN", checkinDocumentId: document.id }) });
        url = blob.url; setCheckin({ ...checkin, url });
      }
      await gedCommand("confirm-upload", checkin.id, { url, comment });
      setCheckin(null); setComment(""); await refresh(); setMessage("Nova versão registrada; original e assinaturas anteriores preservados.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Falha no check-in."); } finally { setBusy(false); }
  }
  const currentPage = detail.pages[Math.min(textPage, Math.max(0, detail.pages.length - 1))];
  const blocks = currentPage?.text.match(/[\s\S]{1,1800}/g) || [""];
  return <PageFrame className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><div><Link href="/assinatura-digital/acervo" className="text-xs underline">Voltar ao acervo</Link><h1 className="text-lg font-semibold">{document.title}</h1><p className="text-sm">Versão {document.versionNumber} · {document.editorialStatus} · {document.status}</p></div>
      <div className="flex flex-wrap gap-2"><a className={styles.dialogButton} href={gedDownloadUrl(document.id)}>Baixar original</a><OperationalTablePanel title="Histórico de versões">
        <OperationalListFrame label="Versões imutáveis" pagination={<OperationalPagination page={detail.versionPage} total={detail.versionTotal} pending={busy} onPageChange={page => { setBusy(true); void refresh(page).catch(error => setMessage(error.message)).finally(() => setBusy(false)); }} />}>
          <OperationalTable columns={versionColumns} preferenceId="ged-document-versions" rows={detail.versions.map(version => ({ id: version.id, label: `Versão ${version.number}`, values: { number: String(version.number), status: version.status, hash: version.hash, date: new Date(version.createdAt).toLocaleString("pt-BR") }, actions: <div className="flex gap-2"><a href={gedDownloadUrl(document.id, version.id)} className={styles.dialogButton}>Baixar</a>{version.code && <a href={`/validar-documento/${version.code}`} target="_blank" rel="noreferrer" className={styles.dialogButton}>Validar</a>}</div> }))} />
        </OperationalListFrame>
      </OperationalTablePanel></div></div>
    {message && <p role="status" className="rounded border p-2 text-sm">{message}</p>}
    <nav aria-label="Áreas do documento" className="flex flex-wrap gap-2">{([['document', 'Documento e edição'], ['text', 'Texto pesquisável'], ['workflow', 'Tarefas e assinaturas'], ['ocr', 'OCR por zonas']] as const).map(([value, label]) => <button key={value} className={tab === value ? styles.primaryButton : styles.dialogButton} onClick={() => setTab(value)}>{label}</button>)}</nav>
    {tab === "document" && <section className="grid gap-4 rounded border bg-white p-4">
      <dl className="grid gap-2 text-sm"><div><dt className="font-semibold">Arquivo</dt><dd>{document.filename} · {document.byteLength.toLocaleString("pt-BR")} bytes</dd></div><div><dt className="font-semibold">Pasta / origem</dt><dd>{document.folderName || "Raiz"} · {document.legacyReference || "Ingresso GED"}</dd></div><div><dt className="font-semibold">SHA-256</dt><dd className="break-all font-mono text-xs">{document.hashSha256}</dd></div></dl>
      {document.origin === "CENTRAL" && <a className="text-sm underline" href={`/validar-assinatura/${encodeURIComponent(document.legacyReference)}`} target="_blank" rel="noreferrer">Validar evidência original da Central (versão arquivada)</a>}
      {bootstrap.capabilities.edit && <div className="flex flex-wrap gap-2"><button disabled={busy || Boolean(document.checkoutOwnerId)} className={styles.dialogButton} onClick={() => void act("checkout")}>Retirar para edição (check-out)</button><button disabled={busy} className={styles.dialogButton} onClick={() => void act("index-document")}>Extrair texto / OCR / indexar</button></div>}
      {document.checkoutOwnerId && <p className="text-sm">{document.checkoutOwnerId === bootstrap.userId ? "Você reservou este documento para edição." : "Documento reservado por outro usuário."}</p>}
      {bootstrap.capabilities.edit && <GedFolderPicker disabled={busy || Boolean(document.checkoutOwnerId)} onSelect={folderId => void act("move-document", document.id, { folderId: folderId || "" })} />}
      {document.checkoutOwnerId === bootstrap.userId && <form className="grid max-w-xl gap-3" onSubmit={event => { event.preventDefault(); void sendCheckin(); }}><label>Arquivo revisado<input type="file" required accept=".pdf,.docx,.txt,.png,.jpg,.jpeg" onChange={event => { const file = event.target.files?.[0]; if (file) setCheckin({ id: crypto.randomUUID(), file }); }} /></label><label>Comentário da nova versão<textarea required minLength={3} maxLength={5000} rows={3} className="block w-full rounded border p-2" value={comment} onChange={event => setComment(event.target.value)} /></label><div className="flex gap-2"><button className={styles.primaryButton} disabled={busy || !checkin}>Devolver nova versão (check-in)</button><button type="button" disabled={busy} className={styles.dialogButton} onClick={() => void act("cancel-checkout")}>Cancelar reserva</button></div></form>}
    </section>}
    {tab === "text" && <section className="grid gap-3 rounded border p-4"><div className="flex flex-wrap gap-3"><label>Página / bloco<select className="ml-2 rounded border p-1" value={textPage} onChange={event => { setTextPage(Number(event.target.value)); setTextBlock(0); }}>{detail.pages.map((page, index) => <option key={page.page} value={index}>{page.page} · {page.method}</option>)}</select></label><button className={styles.dialogButton} disabled={textBlock <= 0} onClick={() => setTextBlock(textBlock - 1)}>Trecho anterior</button><span>{textBlock + 1} / {blocks.length}</span><button className={styles.dialogButton} disabled={textBlock >= blocks.length - 1} onClick={() => setTextBlock(textBlock + 1)}>Próximo trecho</button></div><pre className="whitespace-pre-wrap break-words font-sans text-sm">{currentPage ? blocks[textBlock] : "Texto ainda não extraído. Execute a indexação."}</pre>{currentPage && <button className={styles.dialogButton} onClick={() => void navigator.clipboard.writeText(currentPage.text)}>Copiar texto integral da página</button>}</section>}
    {tab === "workflow" && <section className="grid gap-4 rounded border p-4">
      {detail.centralSignatures.map(signature => <a key={signature.code} href={`/validar-assinatura/${signature.code}`} target="_blank" rel="noreferrer" className="text-sm underline">Validar assinatura {signature.method} de {new Date(signature.signedAt).toLocaleString("pt-BR")} · {signature.code}</a>)}
      {bootstrap.capabilities.edit && document.editorialStatus === "HOMOLOGADO" && <Link href={`/assinatura-digital/assine-agora?gedDocumentId=${encodeURIComponent(document.id)}`} className="text-sm underline">Assinar esta versão na Central (interna ou A1, conforme a classe)</Link>}
      {detail.review && <div className="grid gap-2"><p className="font-semibold">{gedStageLabels[gedStages[detail.review.stage]]} · {detail.review.status} · prazo {new Date(detail.review.dueAt).toLocaleString("pt-BR")}</p><p className="text-xs">Todas as decisões deste ciclo se referem à versão vinculada ao iniciar o fluxo.</p>
        {detail.review.status === "ACTIVE" && detail.review.assignments[gedStages[detail.review.stage]]?.includes(bootstrap.userId) && bootstrap.capabilities.review && <div className="grid max-w-xl gap-2"><label>Parecer<textarea minLength={3} maxLength={5000} rows={3} className="block w-full rounded border p-2" value={comment} onChange={event => setComment(event.target.value)} /></label><div className="flex gap-2"><button disabled={busy} className={styles.primaryButton} onClick={() => void act("decide-review", detail.review!.id, { decision: "APPROVE", comment })}>Concluir minha participação</button><button disabled={busy} className={styles.dialogButton} onClick={() => void act("decide-review", detail.review!.id, { decision: "RETURN", comment })}>Devolver para elaboração</button></div></div>}
        <details><summary>Decisões registradas ({detail.decisions.length})</summary>{detail.decisions.map((decision, index) => <p key={index} className="whitespace-pre-wrap border-b py-2 text-sm">{gedStageLabels[gedStages[decision.stage]]} · {bootstrap.users.find(user => user.id === decision.userId)?.name || decision.userId} · {decision.decision}: {decision.comment}</p>)}</details></div>}
      {(!detail.review || detail.review.status !== "ACTIVE") && bootstrap.capabilities.edit && <form className="grid max-w-2xl gap-3" onSubmit={event => { event.preventDefault(); void act("start-review", document.id, { assignments, dueAt }); }}><h2 className="font-semibold">Iniciar circuito editorial</h2><div className="grid gap-3 sm:grid-cols-2">{gedStages.map(stage => <label key={stage}>{gedStageLabels[stage]}<select required multiple size={3} className="block w-full rounded border p-2" value={assignments[stage]} onChange={event => setAssignments({ ...assignments, [stage]: Array.from(event.target.selectedOptions).map(option => option.value) })}>{bootstrap.users.map(user => <option key={user.id} value={user.id}>{user.name}</option>)}</select></label>)}</div><label>Prazo<input required type="datetime-local" className="ml-2 rounded border p-2" value={dueAt} onChange={event => setDueAt(event.target.value)} /></label><button disabled={busy} className={styles.primaryButton}>Iniciar elaboração → consenso → aprovação → homologação</button></form>}
      {bootstrap.capabilities.edit && <form className="grid max-w-xl gap-2 border-t pt-3" onSubmit={event => { event.preventDefault(); void act("sign-request", document.id, { signerIds: signers }); }}><h2 className="font-semibold">Assinaturas da versão homologada</h2><label>Signatários internos<select multiple required size={3} className="block w-full rounded border p-2" value={signers} onChange={event => setSigners(Array.from(event.target.selectedOptions).map(option => option.value))}>{bootstrap.users.map(user => <option key={user.id} value={user.id}>{user.name}</option>)}</select></label><button disabled={busy || document.editorialStatus !== "HOMOLOGADO"} className={styles.primaryButton}>Solicitar assinaturas na fila unificada</button><Link href="/assinatura-digital/pendentes" className="text-sm underline">Abrir minhas assinaturas pendentes</Link></form>}
    </section>}
    {tab === "ocr" && bootstrap.capabilities.edit && <GedZoneViewer key={document.versionId} documentId={document.id} versionId={document.versionId} mimeType={document.mimeType} onRecognized={() => void refresh()} />}
  </PageFrame>;
}
