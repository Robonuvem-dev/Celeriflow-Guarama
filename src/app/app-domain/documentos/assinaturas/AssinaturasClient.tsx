"use client";

import { useState, useTransition } from "react";
import { CheckCircle, FileSignature, X } from "lucide-react";
import { EmailAuthProvider, reauthenticateWithCredential } from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import { signDocumentInternally } from "./actions";
import { OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalTable, OperationalPagination } from "@/components/app-ui/operational/OperationalTable";
import { OPERATIONAL_PAGE_SIZE as PAGE_SIZE, type OperationalColumn } from "@/lib/operational-tables";
import styles from "@/components/app-ui/operational/operational.module.css";

const columns: OperationalColumn[] = [
  { key: "title", label: "Documento", type: "text", initialWidth: 320, minWidth: 160, resizable: true, sortable: false, details: "overflow" },
  { key: "type", label: "Tipo", type: "text", initialWidth: 150, minWidth: 90, resizable: true, sortable: false, details: "overflow" },
  { key: "date", label: "Data de envio", type: "text", initialWidth: 140, minWidth: 110, resizable: true, sortable: false, details: "overflow" },
  { key: "status", label: "Status", type: "status", initialWidth: 130, minWidth: 90, resizable: true, sortable: false, details: "overflow" },
  { key: "actions", label: "Ações", type: "actions", initialWidth: 100, minWidth: 90, maxWidth: 120, resizable: false, sortable: false, details: "none" },
];

type Documento = {
  id: string;
  title: string;
  documentType: string;
  createdAt: Date | string;
  status: string;
};

export default function AssinaturasClient({ initialDocuments }: { initialDocuments: Documento[] }) {
  const [documents, setDocuments] = useState<Documento[]>(initialDocuments);
  const [selectedDocument, setSelectedDocument] = useState<Documento | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const filteredDocuments = documents.filter((doc) => [doc.title, doc.documentType, doc.status].some((value) => value.toLowerCase().includes(normalizedSearch)));
  const activePage = Math.min(page, Math.max(1, Math.ceil(filteredDocuments.length / PAGE_SIZE)));
  const pageDocuments = filteredDocuments.slice((activePage - 1) * PAGE_SIZE, activePage * PAGE_SIZE);

  function closeConfirmation() {
    if (isPending) return;
    setSelectedDocument(null);
    setPassword("");
    setError(null);
  }

  function handleSignature() {
    if (!selectedDocument || !password) return;
    setError(null);
    startTransition(async () => {
      try {
        const user = auth.currentUser;
        if (!user?.email) throw new Error("Sua sessao Firebase nao esta disponivel. Entre novamente no sistema.");
        await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
        const token = await user.getIdToken(true);
        const result = await signDocumentInternally(selectedDocument.id, token);
        if (result.error) {
          setError(result.error);
          return;
        }
        setDocuments((current) => current.filter((document) => document.id !== selectedDocument.id));
        closeConfirmation();
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Nao foi possivel confirmar sua senha.");
      }
    });
  };

  return (
    <OperationalListFrame label="Assinaturas eletrônicas" toolbar={<input type="search" value={searchTerm} onChange={(event) => { setSearchTerm(event.target.value); setPage(1); }} placeholder="Buscar documentos pendentes" aria-label="Buscar documentos pendentes" className={styles.searchInput} />} pagination={<OperationalPagination page={activePage} total={filteredDocuments.length} pending={isPending} onPageChange={setPage} />}>
      <OperationalTable columns={columns} preferenceId="documentos-assinaturas" caption="Documentos pendentes de assinatura" emptyMessage="Você não possui documentos pendentes de assinatura para esta busca." rows={pageDocuments.map((doc) => ({
        id: doc.id, label: doc.title,
        values: { title: doc.title, type: doc.documentType || "Arquivo", date: new Date(doc.createdAt).toLocaleDateString("pt-BR"), status: "Pendente" },
        actions: <div className={styles.rowActions}><button onClick={() => setSelectedDocument(doc)} disabled={isPending} className={styles.iconButton} aria-label={`Assinar ${doc.title}`} title="Assinar"><CheckCircle /></button></div>,
      }))} />
      {selectedDocument && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 p-5">
              <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900"><FileSignature className="h-5 w-5 text-indigo-600" /> Assinar documento</h2>
              <button onClick={closeConfirmation} disabled={isPending} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-4 p-5 text-sm text-slate-700">
              <p><strong>{selectedDocument.title}</strong> já está vinculado a uma versão bloqueada com hash SHA-256.</p>
              <p className="rounded-lg bg-indigo-50 p-3 text-indigo-800">Confirme sua senha Firebase para concluir sua assinatura interna. A versão será concluída somente depois de todos os signatários obrigatórios.</p>
              <label className="block text-sm font-medium text-slate-700">Senha da conta
                <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" />
              </label>
              {error && <p className="rounded-lg bg-red-50 p-3 text-red-700">{error}</p>}
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 p-5">
              <button onClick={closeConfirmation} disabled={isPending} className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600">Cancelar</button>
              <button onClick={handleSignature} disabled={!password || isPending} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{isPending ? "Registrando..." : "Registrar manifestação"}</button>
            </div>
          </div>
        </div>
      )}
    </OperationalListFrame>
  );
}
