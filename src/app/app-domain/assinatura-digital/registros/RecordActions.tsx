"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { CentralSignatureRecord } from "@/lib/contracts/signature-central";
import { downloadCentralFile } from "../assine-agora/batch";
import styles from "@/components/app-ui/operational/operational.module.css";
import { OperationalPagedContent } from "@/components/app-ui/operational/OperationalPagedContent";
import { useOperationalWorkspace } from "@/components/app-ui/operational/OperationalContext";
import { gedCommand } from "@/components/signatures/ged/ged-client";

export default function RecordActions({ record }: { record: CentralSignatureRecord }) {
  const { device } = useOperationalWorkspace();
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [archiveCode, setArchiveCode] = useState("");
  const [archivedId, setArchivedId] = useState("");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const expired = !!record.storageDeletedAt || Date.parse(record.expiresAt) <= now;
  async function download(kind: "documentos" | "comprovantes") {
    setBusy(true); setError("");
    try { await downloadCentralFile(record.id, kind, kind === "documentos" ? record.filename : `comprovante-${record.code}.json`); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Download indisponível."); }
    finally { setBusy(false); }
  }
  return <><button ref={trigger} type="button" className={styles.filterButton} style={{ height: 24 }} onClick={() => setOpen(true)} aria-label={`Detalhes e downloads de ${record.filename}`}>Detalhes</button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className={styles.dialog} data-device={device} showCloseButton={false} finalFocus={trigger}
      style={{ display: "flex", flexDirection: "column", height: "min(42rem, calc(100dvh - 16px))", minHeight: 0, overflow: "hidden" }}>
      <DialogHeader style={{ flexShrink: 0 }}><DialogTitle>Registro de assinatura</DialogTitle><DialogDescription>Dados do documento, prazo de retenção e comprovante destacado.</DialogDescription></DialogHeader>
      <OperationalPagedContent device={device} label="Detalhes do registro de assinatura" footer={<div className="flex flex-wrap gap-2">
        <button type="button" className={styles.filterButton} disabled={busy || expired} onClick={() => void download("documentos")}>Baixar original</button>
        <button type="button" className={styles.filterButton} disabled={busy} onClick={() => void download("comprovantes")}>Comprovante JSON</button>
        <a className={styles.filterButton} href={`/validar-assinatura/${encodeURIComponent(record.code)}`} target="_blank" rel="noopener noreferrer">Validar</a>
        <button type="button" className={styles.filterButton} onClick={() => setOpen(false)}>Fechar</button>
        {archivedId && <a className={styles.filterButton} href={`/assinatura-digital/acervo/${archivedId}`}>Abrir documento arquivado</a>}
        {error && <p role="alert" className="w-full break-words text-sm">{error}</p>}
      </div>}>
      <dl className="space-y-2 text-sm">
        <div data-operational-block><dt className="font-semibold">Documento</dt><dd className="break-all">{record.filename}</dd></div>
        <div data-operational-block><dt className="font-semibold">Código</dt><dd className="break-all">{record.code}</dd></div>
        <div data-operational-block><dt className="font-semibold">Assinador</dt><dd>{record.signerName}</dd></div>
        <div data-operational-block><dt className="font-semibold">Cargo</dt><dd>{record.signerRole}</dd></div>
        <div data-operational-block><dt className="font-semibold">CPF/CNPJ</dt><dd>{record.signerDocument}</dd></div>
        <div data-operational-block><dt className="font-semibold">Tipo e método</dt><dd>{record.documentTypeName} · {record.method}</dd></div>
        <div data-operational-block><dt className="font-semibold">Arquivo original</dt><dd>{record.mimeType} · {record.byteLength.toLocaleString("pt-BR")} bytes</dd></div>
        <div data-operational-block><dt className="font-semibold">SHA-256</dt><dd className="break-all font-mono text-xs">{record.hashSha256}</dd></div>
        <div data-operational-block><dt className="font-semibold">Assinado em</dt><dd>{new Date(record.signedAt).toLocaleString("pt-BR")}</dd></div>
        <div data-operational-block><dt className="font-semibold">Original expira em</dt><dd>{new Date(record.expiresAt).toLocaleString("pt-BR")} · {expired ? "Download indisponível" : "Dentro do prazo de retenção"}</dd></div>
      </dl>
      <p className="text-sm">Blob privado por 90 dias. O comprovante JSON destacado e a validação permanecem após esse prazo. O original é preservado; não é um PDF com assinatura PAdES incorporada.</p>
      {!expired && <div data-operational-block className="grid gap-2 border-t pt-2"><label className="text-sm">Código da classe GED para arquivamento<input className="block w-full rounded border p-2" value={archiveCode} onChange={event => setArchiveCode(event.target.value)} placeholder="Código cadastrado em Classes e políticas" /></label><button disabled={busy || !archiveCode} className={styles.filterButton} onClick={async () => { setBusy(true); setError(""); try { const result = await gedCommand("archive-central", record.id, { classCode: archiveCode }); setArchivedId(result.documentId); } catch (failure) { setError(failure instanceof Error ? failure.message : "Falha ao arquivar."); } finally { setBusy(false); } }}>Preservar original no acervo GED</button><p className="text-xs">A cópia documental segue a retenção do GED e mantém o comprovante original da Central.</p></div>}
      </OperationalPagedContent>
    </DialogContent></Dialog>
  </>;
}
