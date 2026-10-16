"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { complementMyFunctionalRequest } from "../../servicos/actions";

export function ComplementForm({ requestId, requestKey, documents = [], requiredCodes = [] }: { requestId: string; requestKey: string; documents?: { code: string; label: string }[]; requiredCodes?: string[] }) {
  const router = useRouter();
  const [pending, setPending] = useState(false), [error, setError] = useState("");
  const [uploads, setUploads] = useState<Record<string, string>>({}), [uploading, setUploading] = useState(false);
  async function upload(code: string, file: File) {
    setUploading(true); setError("");
    try {
      const data = new FormData(); data.set("requestId", requestId); data.set("code", code); data.set("file", file);
      const response = await fetch("/api/portal-servidor/anexos", { method: "POST", body: data });
      const result = await response.json() as { uploadEventId?: string; error?: string };
      if (!response.ok || !result.uploadEventId) throw new Error(result.error || "Falha ao enviar documento.");
      setUploads(previous => ({ ...previous, [code]: result.uploadEventId! }));
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Falha ao enviar documento."); } finally { setUploading(false); }
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget); setPending(true); setError("");
    try {
      if (requiredCodes.some(code => !uploads[code])) throw new Error("Envie os documentos solicitados antes de responder.");
      const result = await complementMyFunctionalRequest({ requestId, requestKey, description: String(data.get("description") || ""), attachments: Object.entries(uploads).map(([code, uploadEventId]) => ({ code, uploadEventId })) });
      if (result.error) setError(result.error); else router.refresh();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Não foi possível enviar o complemento."); }
    finally { setPending(false); }
  }
  return <form onSubmit={submit} className="space-y-2 rounded border border-amber-300 bg-amber-50 p-3"><label htmlFor="functional-complement" className="text-sm font-semibold">Responder à pendência</label><textarea id="functional-complement" name="description" required minLength={10} maxLength={4000} rows={4} disabled={pending || uploading} className="w-full rounded border border-slate-300 bg-white p-2 text-sm" />{documents.map(document => <label key={document.code} className="block text-xs">{document.label}{requiredCodes.includes(document.code) ? " (solicitado pelo RH)" : " (opcional neste complemento)"}<input type="file" disabled={pending || uploading} className="mt-1 block" onChange={event => { const file = event.target.files?.[0]; if (file) void upload(document.code, file); }} />{uploads[document.code] && <span>Documento recebido.</span>}</label>)}{error && <p role="alert" className="text-sm text-red-700">{error}</p>}<Button disabled={pending || uploading}>{uploading ? "Recebendo documento…" : pending ? "Enviando…" : "Enviar complemento"}</Button></form>;
}
