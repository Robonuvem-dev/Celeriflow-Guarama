"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { EmailAuthProvider, reauthenticateWithCredential } from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import { signProcessDocumentInternally } from "../actions";
import { OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { OperationalListFrame, OperationalLinkPagination } from "@/components/app-ui/operational/OperationalListFrame";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { OperationalColumn } from "@/lib/operational-tables";
import styles from "@/components/app-ui/operational/operational.module.css";

type PendingSignature = { signatureId: string; id: string; requestedAt: Date | string; process: { id: string; protocolNumber: string }; title: string; documentType: string };
const columns: OperationalColumn[] = [
  ...([["title", "Documento", 300, 130], ["process", "Processo", 160, 110], ["type", "Tipo de documento", 180, 130], ["date", "Solicitado em", 120, 105], ["status", "Situação", 120, 85]] as [string, string, number, number][]).map(([key, label, initialWidth, minWidth]): OperationalColumn => ({ key, label, initialWidth, minWidth, maxWidth: 700, type: key === "status" ? "status" : "text", resizable: true, sortable: false, details: "overflow" })),
  { key: "actions", label: "Ação", type: "actions", initialWidth: 85, minWidth: 75, maxWidth: 100, resizable: false, sortable: false, details: "none" },
];
export default function AssinaturasClient({ initialDocuments, total, page }: { initialDocuments: PendingSignature[]; total: number; page: number; pageSize: number }) {
  const router = useRouter();
  const [selectedDocument, setSelectedDocument] = useState<PendingSignature | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  function close() { if (isPending) return; setSelectedDocument(null); setPassword(""); setError(null); }
  function sign() {
    if (!selectedDocument || !password) return;
    setError(null);
    startTransition(async () => {
      try {
        const user = auth.currentUser;
        if (!user?.email) throw new Error("Sua sessao Firebase nao esta disponivel. Entre novamente no sistema.");
        await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
        const result = await signProcessDocumentInternally(selectedDocument.id, await user.getIdToken(true));
        if (result.error) { setError(result.error); return; }
        setSelectedDocument(null); setPassword(""); setError(null); router.refresh();
      } catch (reason) { setError(reason instanceof Error ? reason.message : "Nao foi possivel confirmar sua senha."); }
    });
  }
  return <>
    <OperationalListFrame label="Assinaturas pendentes" toolbar={<span>Documentos aguardando sua assinatura no escopo autorizado</span>} pagination={<OperationalLinkPagination pathname="/protocolos/assinaturas" page={page} total={total} />}>
      <OperationalTable columns={columns} preferenceId="protocolos.assinaturas" caption="Assinaturas pendentes" emptyMessage="Você não possui documentos aguardando assinatura no momento." rows={initialDocuments.map(document => ({ id: document.signatureId, label: document.title, values: { title: document.title, process: document.process.protocolNumber, type: document.documentType || "Arquivo", date: new Date(document.requestedAt).toLocaleDateString("pt-BR"), status: "Pendente" }, actions: <button type="button" className={styles.dialogButton} style={{ minHeight: "1.375rem", height: "1.375rem", padding: "0 4px" }} disabled={isPending} onClick={() => setSelectedDocument(document)}>Assinar</button> }))} />
    </OperationalListFrame>
    <Dialog open={!!selectedDocument} onOpenChange={open => { if (!open) close(); }}><DialogContent><DialogHeader><DialogTitle>Assinar documento</DialogTitle><DialogDescription>{selectedDocument?.title} — versão bloqueada com hash SHA-256.</DialogDescription></DialogHeader><form className={styles.filterFields} onSubmit={event => { event.preventDefault(); sign(); }}><label>Senha da conta<input type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" /></label>{error && <p role="alert">{error}</p>}<div className={styles.dialogButtons}><button type="button" onClick={close} disabled={isPending} className={styles.dialogButton}>Cancelar</button><button disabled={!password || isPending} className={styles.primaryButton}>{isPending ? "Registrando…" : "Registrar assinatura"}</button></div></form></DialogContent></Dialog>
  </>;
}
