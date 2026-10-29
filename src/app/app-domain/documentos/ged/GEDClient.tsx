"use client";

import { useState, useRef, type ReactNode } from "react";
import {
  Upload, Plus, Folder as FolderIcon, X, Check,
  Trash2, MoreVertical, ExternalLink
} from "lucide-react";
import { createFolder, createDocument, deleteDocument, deleteFolder, requestInternalSignatures } from "./actions";
import { OperationalListFrame, OperationalFilters } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalTable, OperationalPagination } from "@/components/app-ui/operational/OperationalTable";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { OPERATIONAL_PAGE_SIZE as PAGE_SIZE, type OperationalColumn } from "@/lib/operational-tables";
import styles from "@/components/app-ui/operational/operational.module.css";

const columns: OperationalColumn[] = [
  { key: "title", label: "Nome", type: "text", initialWidth: 350, minWidth: 150, resizable: true, sortable: false, details: "overflow" },
  { key: "type", label: "Tipo", type: "text", initialWidth: 160, minWidth: 90, resizable: true, sortable: false, details: "overflow" },
  { key: "status", label: "Status", type: "status", initialWidth: 190, minWidth: 110, resizable: true, sortable: false, details: "overflow" },
  { key: "date", label: "Adicionado em", type: "text", initialWidth: 140, minWidth: 110, resizable: true, sortable: false, details: "overflow" },
  { key: "actions", label: "Ações", type: "actions", initialWidth: 65, minWidth: 60, maxWidth: 85, resizable: false, sortable: false, details: "none" },
];

type DocItem = {
  id: string;
  title: string;
  documentType: string;
  fileUrl: string;
  status: string;
  createdAt: Date | string;
};
type FolderItem = {
  id: string;
  name: string;
  description: string | null;
  _count: { documents: number; children: number };
};
type DocumentClassItem = { code: string; label: string; signaturePolicy: string };
type SignerItem = { id: string; nome: string; email: string };

export default function GEDClient({
  folders,
  documents,
  currentFolderId,
  documentClasses,
  signers,
  navigation,
}: {
  folders: FolderItem[];
  documents: DocItem[];
  currentFolderId: string | null;
  documentClasses: DocumentClassItem[];
  signers: SignerItem[];
  navigation?: ReactNode;
}) {
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadType, setUploadType] = useState("Arquivo");
  const [uploadClassCode, setUploadClassCode] = useState("");
  const [uploadPublicLabel, setUploadPublicLabel] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState(folders[0]?.id ?? "");
  const [loading, setLoading] = useState(false);
  const [signatureDocument, setSignatureDocument] = useState<DocItem | null>(null);
  const [selectedSignerIds, setSelectedSignerIds] = useState<string[]>([]);
  const [signatureError, setSignatureError] = useState<string | null>(null);
  const [qrValidationUrl, setQrValidationUrl] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const fileRef = useRef<HTMLInputElement>(null);
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const filteredDocuments = documents.filter((doc) => [doc.title, doc.documentType, doc.status].some((value) => value.toLowerCase().includes(normalizedSearch)));
  const activePage = Math.min(page, Math.max(1, Math.ceil(filteredDocuments.length / PAGE_SIZE)));
  const pageDocuments = filteredDocuments.slice((activePage - 1) * PAGE_SIZE, activePage * PAGE_SIZE);
  const selectedFolder = folders.find((folder) => folder.id === selectedFolderId) ?? folders[0];

  const handleCreateFolder = async () => {
    if (!folderName.trim()) return;
    setLoading(true);
    try {
      await createFolder(folderName, currentFolderId);
      setFolderName("");
      setShowFolderModal(false);
    } catch {
      alert("Erro ao criar pasta");
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async () => {
    if (!uploadFile || !uploadTitle.trim()) return;
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", uploadFile);

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Falha no upload do arquivo");
      }

      const blobData = await response.json();

      await createDocument(uploadTitle, uploadType, uploadClassCode, uploadPublicLabel, blobData.url, currentFolderId);
      
      setUploadTitle("");
      setUploadFile(null);
      setUploadType("Arquivo");
      setUploadClassCode("");
      setUploadPublicLabel("");
      setShowUploadModal(false);
    } catch {
      alert("Erro ao fazer upload");
    } finally {
      setLoading(false);
    }
  };

  const toggleSigner = (signerId: string) => {
    setSelectedSignerIds((current) => current.includes(signerId)
      ? current.filter((id) => id !== signerId)
      : [...current, signerId]);
  };

  const handleRequestSignatures = async () => {
    if (!signatureDocument) return;
    setLoading(true);
    setSignatureError(null);
    const result = await requestInternalSignatures(signatureDocument.id, selectedSignerIds);
    setLoading(false);
    if (result.error) {
      setSignatureError(result.error);
      return;
    }
    setQrValidationUrl(result.qrValidationUrl ?? null);
  };

  const handleDeleteDoc = async (id: string, title: string) => {
    if (!confirm(`Excluir o arquivo "${title}"?`)) return;
    try {
      await deleteDocument(id);
    } catch {
      alert("Erro ao excluir");
    }
  };

  const handleDeleteFolder = async (id: string, name: string) => {
    if (!confirm(`Excluir a pasta "${name}" e todos os seus arquivos?`)) return;
    try {
      await deleteFolder(id);
    } catch {
      alert("Erro ao excluir pasta");
    }
  };

  return (
    <>
      <OperationalListFrame label="Gerenciamento Eletrônico de Documentos" actions={<>
        <button
          onClick={() => setShowFolderModal(true)}
          className={styles.newButton}
        >
          <Plus className="w-4 h-4" />
          Nova Pasta
        </button>
        <button
          onClick={() => setShowUploadModal(true)}
          className={styles.newButton}
        >
          <Upload className="w-4 h-4" />
          Upload
        </button>
      </>} toolbar={<>
      <input type="search" value={searchTerm} onChange={(event) => { setSearchTerm(event.target.value); setPage(1); }} placeholder="Buscar documento, categoria ou situação" aria-label="Buscar documentos" className={styles.searchInput} />
      {navigation && <OperationalFilters label="Navegação">{navigation}</OperationalFilters>}
      {folders.length > 0 && (
        <OperationalFilters label="Pastas">
          <label className={styles.filterFields}>Pasta<select value={selectedFolder?.id ?? ""} onChange={(event) => setSelectedFolderId(event.target.value)}>{folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></label>
          {selectedFolder && <div className="mt-3 grid gap-3">
            <p className="break-words">{selectedFolder.name}</p>
            <p>{selectedFolder._count.documents} arquivos · {selectedFolder._count.children} subpastas</p>
            <div className={styles.dialogButtons}>
              <a href={`/documentos/ged?folderId=${selectedFolder.id}`} className={styles.dialogButton}>Abrir pasta</a>
              <button onClick={() => void handleDeleteFolder(selectedFolder.id, selectedFolder.name)} className={styles.dialogButton}><Trash2 />Excluir pasta</button>
            </div>
          </div>}
        </OperationalFilters>
      )}

      </>} pagination={<OperationalPagination page={activePage} total={filteredDocuments.length} onPageChange={setPage} />}>
        <OperationalTable columns={columns} preferenceId="documentos-ged" caption={currentFolderId ? "Arquivos na pasta" : "Arquivos recentes"} emptyMessage="Nenhum arquivo encontrado." rows={pageDocuments.map((doc) => ({
          id: doc.id, label: doc.title,
          values: { title: doc.title, type: doc.documentType, status: doc.status, date: new Date(doc.createdAt).toLocaleDateString("pt-BR") },
          actions: <div className={styles.rowActions}><DropdownMenu>
            <DropdownMenuTrigger render={<button className={styles.iconButton} aria-label={`Ações de ${doc.title}`} />}><MoreVertical /></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem render={<a href={doc.fileUrl.startsWith("http") ? `/api/download?url=${encodeURIComponent(doc.fileUrl)}` : doc.fileUrl} target="_blank" rel="noopener noreferrer" />}><ExternalLink />Visualizar</DropdownMenuItem>
              <DropdownMenuItem onClick={() => { setSignatureDocument(doc); setSelectedSignerIds([]); setSignatureError(null); setQrValidationUrl(null); }}><Check />Solicitar assinaturas</DropdownMenuItem>
              <DropdownMenuItem onClick={() => void handleDeleteDoc(doc.id, doc.title)}><Trash2 />Excluir</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu></div>,
        }))} />
      </OperationalListFrame>

      {/* Nova Pasta Modal */}
      {showFolderModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowFolderModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <FolderIcon className="w-5 h-5 text-indigo-600" /> Nova Pasta
              </h2>
              <button onClick={() => setShowFolderModal(false)} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100">
                <X className="w-5 h-5" />
              </button>
            </div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Nome da Pasta</label>
            <input
              type="text"
              placeholder="Ex: Contratos 2026"
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreateFolder()}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600/20 focus:border-indigo-600 mb-4"
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowFolderModal(false)} className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Cancelar</button>
              <button
                onClick={handleCreateFolder}
                disabled={!folderName.trim() || loading}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {loading ? "Criando..." : <><Check className="w-4 h-4" /> Criar</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowUploadModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Upload className="w-5 h-5 text-indigo-600" /> Upload de Arquivo
              </h2>
              <button onClick={() => setShowUploadModal(false)} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* File Picker */}
            <div
              onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-slate-300 hover:border-indigo-400 rounded-xl p-6 text-center cursor-pointer transition-colors mb-4"
            >
              <Upload className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              {uploadFile ? (
                <p className="text-sm font-semibold text-indigo-600">{uploadFile.name}</p>
              ) : (
                <p className="text-sm text-slate-500">Clique para selecionar um arquivo</p>
              )}
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    setUploadFile(f);
                    if (!uploadTitle) setUploadTitle(f.name.replace(/\.[^.]+$/, ""));
                  }
                }}
              />
            </div>

            <div className="space-y-3 mb-5">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Título do Documento</label>
                <input
                  type="text"
                  placeholder="Nome do documento"
                  value={uploadTitle}
                  onChange={(e) => setUploadTitle(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600/20 focus:border-indigo-600"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Tipo de Documento</label>
               <select
                  value={uploadType}
                  onChange={(e) => setUploadType(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600/20 focus:border-indigo-600"
                >
                  <option>Arquivo</option>
                  <option>Ofício</option>
                  <option>Contrato</option>
                  <option>Portaria</option>
                  <option>Decreto</option>
                  <option>Edital</option>
                  <option>Relatório</option>
                  <option>Norma</option>
                  <option>Projeto</option>
               </select>
               </div>
               <div>
                 <label className="block text-sm font-semibold text-slate-700 mb-1">Classe documental</label>
                 <select
                   value={uploadClassCode}
                   onChange={(e) => setUploadClassCode(e.target.value)}
                   className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600/20 focus:border-indigo-600"
                 >
                   <option value="">Selecione a classe...</option>
                   {documentClasses.map((documentClass) => (
                     <option key={documentClass.code} value={documentClass.code}>{documentClass.label}</option>
                   ))}
                 </select>
               </div>
               <div>
                 <label className="block text-sm font-semibold text-slate-700 mb-1">Rótulo público de validação</label>
                 <input
                   value={uploadPublicLabel}
                   onChange={(e) => setUploadPublicLabel(e.target.value)}
                   placeholder="Ex: Documento administrativo autenticado"
                   className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600/20 focus:border-indigo-600"
                 />
               </div>
            </div>

            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowUploadModal(false)} className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Cancelar</button>
              <button
                onClick={handleUpload}
                disabled={!uploadFile || !uploadTitle.trim() || !uploadClassCode || loading}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {loading ? "Enviando..." : <><Check className="w-4 h-4" /> Confirmar Upload</>}
              </button>
            </div>
          </div>
        </div>
      )}
      {signatureDocument && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-4" onClick={() => !loading && setSignatureDocument(null)}>
          <div className="my-auto max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-slate-900">Solicitar assinaturas internas</h2>
            <p className="mt-1 text-sm text-slate-600">{signatureDocument.title}</p>
            {qrValidationUrl ? (
              <div className="mt-4 space-y-3">
                <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">Solicitação criada para todos os signatários selecionados.</p>
                <label className="block text-sm font-semibold text-slate-700">URL de validação/QR
                  <input readOnly value={qrValidationUrl} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs" />
                </label>
              </div>
            ) : (
              <div className="mt-4 max-h-56 space-y-2 overflow-y-auto rounded-lg border border-slate-200 p-3 pr-2">
                {signers.map((signer) => (
                  <label key={signer.id} className="flex cursor-pointer items-start gap-2 text-sm text-slate-700">
                    <input type="checkbox" checked={selectedSignerIds.includes(signer.id)} onChange={() => toggleSigner(signer.id)} />
                    <span>{signer.nome}<span className="block text-xs text-slate-400">{signer.email}</span></span>
                  </label>
                ))}
              </div>
            )}
            {signatureError && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{signatureError}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setSignatureDocument(null)} disabled={loading} className="px-4 py-2 text-sm font-semibold text-slate-600">{qrValidationUrl ? "Fechar" : "Cancelar"}</button>
              {!qrValidationUrl && <button onClick={handleRequestSignatures} disabled={selectedSignerIds.length === 0 || loading} className="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg disabled:opacity-50">{loading ? "Solicitando..." : "Solicitar"}</button>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
