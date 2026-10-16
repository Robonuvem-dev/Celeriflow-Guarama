"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FunctionalService } from "@/lib/portal-servidor/service-catalog";
import { openMyFunctionalRequest } from "./actions";

export function FunctionalRequestForm({ serviceId, configuration, requestKey }: { serviceId: string; configuration: Pick<FunctionalService, "version" | "fields" | "requiredDocuments" | "acceptance">; requestKey: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false), [error, setError] = useState("");
  const [uploads, setUploads] = useState<Record<string, { uploadEventId: string; filename: string }>>({});
  async function upload(code: string, file: File | undefined) {
    if (!file) return;
    setPending(true); setError("");
    try {
      const data = new FormData(); data.set("file", file); data.set("serviceId", serviceId); data.set("code", code);
      const response = await fetch("/api/portal-servidor/anexos", { method: "POST", body: data });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível enviar o arquivo.");
      setUploads(current => ({ ...current, [code]: { uploadEventId: result.uploadEventId, filename: result.filename } }));
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Falha ao enviar documento."); }
    finally { setPending(false); }
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setError("");
    const data = new FormData(event.currentTarget);
    try {
      const result = await openMyFunctionalRequest({ serviceId, serviceVersion: configuration.version, requestKey, description: String(data.get("description") || ""), values: Object.fromEntries(configuration.fields.map(field => [field.code, String(data.get(field.code) || "")])), accepted: data.get("accepted") === "on", attachments: configuration.requiredDocuments.map(document => ({ code: document.code, uploadEventId: uploads[document.code]?.uploadEventId || "" })) });
      if (result.error) { setError(result.error); return; }
      if (!("requestId" in result)) throw new Error("Comprovante indisponível.");
      router.push(`/portal-servidor/protocolos/${result.requestId}`); router.refresh();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Falha ao protocolar o requerimento."); }
    finally { setPending(false); }
  }
  return <form onSubmit={submit} className="space-y-4 rounded border border-slate-300 bg-white p-4 text-sm">
    <fieldset disabled={pending} className="space-y-3"><legend className="text-xs font-bold uppercase text-slate-600">1. Dados do requerimento</legend>
      {configuration.fields.map(field => <div key={field.code} className="grid gap-1"><Label htmlFor={field.code}>{field.label}</Label>{field.type === "SELECT" ? <select id={field.code} name={field.code} required={field.required} className="h-9 rounded border border-slate-300 px-2"><option value="">Selecione</option>{field.options.map(option => <option key={option}>{option}</option>)}</select> : <Input id={field.code} name={field.code} type={field.type === "DATE" ? "date" : field.type === "NUMBER" ? "number" : "text"} step={field.type === "NUMBER" ? "any" : undefined} required={field.required} maxLength={4000} />}</div>)}
      <Label htmlFor="description">Descrição do pedido</Label><textarea id="description" name="description" required minLength={10} maxLength={4000} rows={4} className="w-full rounded border border-slate-300 p-2" />
    </fieldset>
    {configuration.requiredDocuments.length > 0 && <fieldset disabled={pending} className="space-y-3"><legend className="text-xs font-bold uppercase text-slate-600">2. Documentos exigidos</legend>{configuration.requiredDocuments.map(document => <div key={document.code} className="grid gap-1"><Label htmlFor={`upload-${document.code}`}>{document.label}</Label><Input id={`upload-${document.code}`} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.odt,.jpg,.jpeg,.png" onChange={event => upload(document.code, event.target.files?.[0])} /><p className="text-xs text-slate-500">{uploads[document.code]?.filename || "Documento ainda não enviado."}</p></div>)}</fieldset>}
    {configuration.acceptance && <fieldset disabled={pending} className="space-y-2"><legend className="text-xs font-bold uppercase text-slate-600">3. Termo de aceite</legend><p className="whitespace-pre-wrap rounded bg-slate-50 p-3 text-xs">{configuration.acceptance}</p><label className="flex items-center gap-2"><input type="checkbox" name="accepted" required />Li e concordo com o termo apresentado.</label></fieldset>}
    <p className="text-xs text-slate-500">Confira os dados antes de enviar. O requerimento será protocolado em seu nome para análise do setor responsável.</p>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}<Button disabled={pending || configuration.requiredDocuments.some(document => !uploads[document.code])}>{pending ? "Processando…" : "Protocolar requerimento"}</Button>
  </form>;
}
