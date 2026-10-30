"use client";

import { useState, useTransition } from "react";
import { FileSignature } from "lucide-react";
import { EmailAuthProvider, reauthenticateWithCredential } from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { OperationalFilters, OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalPagination, OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { OPERATIONAL_PAGE_SIZE, type OperationalColumn } from "@/lib/operational-tables";
import styles from "@/components/app-ui/operational/operational.module.css";
import { signPendingDocument } from "./actions";

type SignatureDocument = { id: string; title: string; documentType: string; requestedAt: string };
const columns: OperationalColumn[] = [
  { key: "title", label: "Documento", type: "text", initialWidth: 350, minWidth: 150, resizable: true, sortable: false, details: "overflow" },
  { key: "type", label: "Tipo", type: "text", initialWidth: 170, minWidth: 90, resizable: true, sortable: false, details: "overflow" },
  { key: "date", label: "Solicitado em", type: "text", initialWidth: 170, minWidth: 130, resizable: true, sortable: false, details: "overflow" },
  { key: "status", label: "Situação", type: "status", initialWidth: 110, minWidth: 80, resizable: true, sortable: false, details: "overflow" },
  { key: "actions", label: "Ações", type: "actions", initialWidth: 64, minWidth: 64, maxWidth: 64, resizable: false, sortable: false, details: "none" },
];

export function PendingSignaturesClient({ initialDocuments, canSign }: { initialDocuments: SignatureDocument[]; canSign: boolean }) {
  const [signedIds, setSignedIds] = useState<string[]>([]);
  const [selected, setSelected] = useState<SignatureDocument | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const term = search.trim().toLocaleLowerCase("pt-BR");
  const filtered = initialDocuments.filter(document => !signedIds.includes(document.id) && [document.title, document.documentType].some(value => value.toLocaleLowerCase("pt-BR").includes(term)));
  const activePage = Math.min(page, Math.max(1, Math.ceil(filtered.length / OPERATIONAL_PAGE_SIZE)));
  const documents = filtered.slice((activePage - 1) * OPERATIONAL_PAGE_SIZE, activePage * OPERATIONAL_PAGE_SIZE);

  function close() {
    setSelected(null); setPassword(""); setError(null);
  }

  function sign() {
    if (!selected || !password || !canSign || pending) return;
    const documentId = selected.id;
    setError(null);
    startTransition(async () => {
      try {
        const user = auth.currentUser;
        if (!user?.email) throw new Error("Entre novamente no sistema para confirmar sua identidade.");
        await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
        const result = await signPendingDocument(documentId, await user.getIdToken(true));
        if (result.error) { setError(result.error); return; }
        setSignedIds(ids => [...ids, documentId]);
        close();
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Não foi possível confirmar sua senha.");
      }
    });
  }

  return <OperationalListFrame label="Documentos pendentes de assinatura"
    actions={<OperationalFilters label="Sobre a central"><p>As solicitações destinadas ao seu usuário são reunidas nesta central. A assinatura interna confirma sua identidade pela senha da conta e registra a manifestação na versão do documento. O histórico mantém as assinaturas e seus estados.</p></OperationalFilters>}
    toolbar={<input type="search" className={styles.searchInput} aria-label="Buscar documentos pendentes" placeholder="Buscar documento ou tipo…" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} />}
    pagination={<OperationalPagination page={activePage} total={filtered.length} pending={pending} onPageChange={setPage} />}>
    <OperationalTable columns={columns} preferenceId="assinatura-digital-pendentes" caption="Meus documentos pendentes de assinatura" emptyMessage="Nenhum documento pendente de assinatura para esta busca." rows={documents.map(document => ({
      id: document.id, label: document.title,
      values: { title: document.title, type: document.documentType || "Arquivo", date: new Date(document.requestedAt).toLocaleString("pt-BR"), status: "Pendente" },
      actions: <div className={styles.rowActions}><button type="button" className={styles.iconButton} title={canSign ? "Assinar documento" : "Seu perfil possui acesso somente à consulta"} aria-label={`Assinar ${document.title}`} disabled={!canSign || pending} onClick={() => { setSelected(document); setPassword(""); setError(null); }}><FileSignature /></button></div>,
    }))} />
    <Dialog open={selected !== null} onOpenChange={open => { if (!open && !pending) close(); }}>
      <DialogContent showCloseButton={!pending}>
        <DialogHeader><DialogTitle>Assinar documento</DialogTitle><DialogDescription>{selected?.title} · Confirme sua identidade para registrar a assinatura interna.</DialogDescription></DialogHeader>
        <form className="grid gap-4" onSubmit={event => { event.preventDefault(); sign(); }}>
          <label className="grid gap-2 text-sm font-medium">Senha da conta<input required type="password" autoComplete="current-password" value={password} disabled={pending} onChange={event => setPassword(event.target.value)} className="h-9 rounded-md border px-3" /></label>
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          <DialogFooter><button type="button" className={styles.dialogButton} disabled={pending} onClick={close}>Cancelar</button><button type="submit" className={`${styles.dialogButton} ${styles.primaryButton}`} disabled={!password || pending}>{pending ? "Registrando…" : "Assinar documento"}</button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </OperationalListFrame>;
}
