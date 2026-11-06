"use client";

import { useState, useRef } from "react";
import { UploadCloud, FileText, Image as ImageIcon, Eye, Download, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { uploadCadastralAttachment } from "./anexo-actions";

type AttachmentEntry = {
  id: string;
  title: string;
  createdAt: string;
  documentId: string | null;
  data: {
    filename?: string;
    mimeType?: string;
    sizeBytes?: number;
    url?: string;
    details?: string;
  } | null;
};

export function CadastralAttachmentsPanel({
  entityType,
  entityId,
  entries,
}: {
  entityType: "REAL_ESTATE" | "ECONOMIC_REGISTRATION";
  entityId: string;
  entries: AttachmentEntry[];
}) {
  const [uploading, setUploading] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [selectedPreview, setSelectedPreview] = useState<{ url: string; title: string; mimeType: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // Filtrar apenas registros que possuem anexos de documentos ou imagens
  const attachments = entries.filter((entry) => {
    const data = entry.data;
    return data && (data.url || data.mimeType || data.filename);
  });

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);
    const form = event.currentTarget;
    const file = fileInputRef.current?.files?.[0];

    if (!file) {
      setFeedback({ message: "Selecione um arquivo PDF ou imagem JPG/PNG.", type: "error" });
      return;
    }

    setUploading(true);
    const formData = new FormData(form);

    try {
      const res = await uploadCadastralAttachment(entityType, entityId, formData);
      if (res.error) {
        setFeedback({ message: res.error, type: "error" });
      } else {
        setFeedback({ message: "Documento/imagem anexado com sucesso!", type: "success" });
        form.reset();
      }
    } catch {
      setFeedback({ message: "Erro inesperado ao realizar upload.", type: "error" });
    } finally {
      setUploading(false);
    }
  }

  function getDownloadUrl(rawUrl?: string) {
    if (!rawUrl) return "#";
    return `/api/download?url=${encodeURIComponent(rawUrl)}`;
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
        <div>
          <h3 className="text-xs font-bold text-slate-800">
            Documentos e Imagens Anexadas (PDF e JPG)
          </h3>
          <p className="text-[11px] text-slate-500">
            Gestão digital de escrituras, plantas, fotos da fachada, alvarás e contratos vinculados a esta inscrição.
          </p>
        </div>
        <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
          {attachments.length} {attachments.length === 1 ? "anexo" : "anexos"}
        </span>
      </div>

      {feedback && (
        <div
          className={`flex items-center gap-2 rounded px-3 py-1.5 text-xs ${
            feedback.type === "success"
              ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border border-rose-200 bg-rose-50 text-rose-800"
          }`}
        >
          {feedback.type === "success" ? (
            <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
          ) : (
            <AlertCircle className="size-4 shrink-0 text-rose-600" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Formulário de Upload Direto */}
      <form ref={formRef} onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2 rounded-md bg-slate-50 p-2.5">
        <div className="flex min-w-[200px] flex-1 flex-col gap-1">
          <label className="text-[11px] font-semibold text-slate-700">Título / Descrição do Documento</label>
          <input
            name="title"
            required
            placeholder="Ex: Foto da Fachada, Planta Baixa, Contrato Social..."
            className="h-7 w-full rounded border border-slate-300 bg-white px-2 text-xs text-slate-800 focus:border-emerald-600 focus:outline-none"
          />
        </div>

        <div className="flex w-[160px] flex-col gap-1">
          <label className="text-[11px] font-semibold text-slate-700">Tipo de Anexo</label>
          <select
            name="documentType"
            className="h-7 rounded border border-slate-300 bg-white px-2 text-xs text-slate-800 focus:border-emerald-600 focus:outline-none"
          >
            <option value="Foto / Fachada">Foto / Fachada</option>
            <option value="Planta / Croqui">Planta / Croqui</option>
            <option value="Escritura / Matrícula">Escritura / Matrícula</option>
            <option value="Contrato Social">Contrato Social</option>
            <option value="Alvará / Licença">Alvará / Licença</option>
            <option value="Comprovante de Endereço">Comprovante de Endereço</option>
            <option value="Outro Documento">Outro Documento</option>
          </select>
        </div>

        <div className="flex min-w-[220px] flex-1 flex-col gap-1">
          <label className="text-[11px] font-semibold text-slate-700">Arquivo (PDF, JPG ou PNG - até 15MB)</label>
          <input
            ref={fileInputRef}
            name="file"
            type="file"
            required
            accept=".pdf,.jpg,.jpeg,.png"
            className="h-7 w-full text-xs text-slate-600 file:mr-2 file:h-7 file:rounded file:border-0 file:bg-slate-200 file:px-2 file:text-[11px] file:font-semibold file:text-slate-800 hover:file:bg-slate-300"
          />
        </div>

        <button
          type="submit"
          disabled={uploading}
          className="inline-flex h-7 items-center gap-1.5 rounded bg-emerald-700 px-3 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
        >
          {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <UploadCloud className="size-3.5" />}
          {uploading ? "Enviando..." : "Anexar Arquivo"}
        </button>
      </form>

      {/* Grade de Anexos */}
      {attachments.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-6 text-center text-slate-400">
          <UploadCloud className="size-8 stroke-1 text-slate-300 mb-1" />
          <p className="text-xs">Nenhum documento ou imagem anexado a este cadastro.</p>
          <p className="text-[10px] text-slate-400">Faça o upload acima para registrar imagens e certidões no GED.</p>
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {attachments.map((item) => {
            const isImage = item.data?.mimeType?.startsWith("image/") || /\.(jpg|jpeg|png)$/i.test(item.data?.filename || "");
            const isPdf = item.data?.mimeType === "application/pdf" || /\.pdf$/i.test(item.data?.filename || "");
            const downloadUrl = getDownloadUrl(item.data?.url);

            return (
              <div
                key={item.id}
                className="group relative flex flex-col justify-between overflow-hidden rounded border border-slate-200 bg-white p-2.5 transition hover:border-emerald-300 hover:shadow-xs"
              >
                <div className="flex items-start gap-2">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded bg-slate-100 text-slate-600">
                    {isImage ? <ImageIcon className="size-4 text-sky-600" /> : isPdf ? <FileText className="size-4 text-rose-600" /> : <FileText className="size-4 text-slate-500" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="truncate text-xs font-semibold text-slate-800" title={item.title}>
                      {item.title}
                    </h4>
                    <p className="truncate text-[10px] text-slate-500" title={item.data?.filename || ""}>
                      {item.data?.filename || "Arquivo anexado"}
                    </p>
                    <p className="text-[9px] text-slate-400">
                      {new Date(item.createdAt).toLocaleDateString("pt-BR")}
                      {item.data?.sizeBytes ? ` · ${(item.data.sizeBytes / 1024).toFixed(0)} KB` : ""}
                    </p>
                  </div>
                </div>

                <div className="mt-2 flex items-center justify-end gap-1.5 border-t border-slate-100 pt-1.5">
                  {isImage && item.data?.url && (
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedPreview({
                          url: downloadUrl,
                          title: item.title,
                          mimeType: item.data?.mimeType || "image/jpeg",
                        })
                      }
                      className="inline-flex h-6 items-center gap-1 rounded bg-slate-100 px-2 text-[10px] font-semibold text-slate-700 hover:bg-slate-200"
                    >
                      <Eye className="size-3" /> Ver Imagem
                    </button>
                  )}
                  <a
                    href={downloadUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-6 items-center gap-1 rounded bg-emerald-50 px-2 text-[10px] font-semibold text-emerald-800 hover:bg-emerald-100"
                  >
                    <Download className="size-3" /> {isPdf ? "Abrir PDF" : "Baixar"}
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de Pré-visualização de Imagem */}
      {selectedPreview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
          onClick={() => setSelectedPreview(null)}
        >
          <div
            className="flex max-h-[90vh] max-w-3xl flex-col rounded-lg bg-white p-3 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b pb-2">
              <h4 className="text-xs font-bold text-slate-800">{selectedPreview.title}</h4>
              <button
                type="button"
                onClick={() => setSelectedPreview(null)}
                className="rounded px-2 py-0.5 text-xs font-semibold text-slate-500 hover:bg-slate-100"
              >
                ✕ Fechar
              </button>
            </div>
            <div className="mt-2 flex flex-1 items-center justify-center overflow-auto p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={selectedPreview.url}
                alt={selectedPreview.title}
                className="max-h-[75vh] w-auto max-w-full rounded object-contain shadow-sm"
              />
            </div>
            <div className="flex justify-end gap-2 border-t pt-2">
              <a
                href={selectedPreview.url}
                target="_blank"
                rel="noreferrer"
                download
                className="inline-flex h-7 items-center gap-1.5 rounded bg-emerald-700 px-3 text-xs font-semibold text-white hover:bg-emerald-800"
              >
                <Download className="size-3.5" /> Abrir no Navegador
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
