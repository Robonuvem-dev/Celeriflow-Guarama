"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { DigitalService } from "@/lib/portal-cidadao/services-policy";
import { OccurrenceLocation } from "./OccurrenceLocation";
import { uploadPortalEvidence } from "@/lib/portal-cidadao/evidence-client";

export function ServiceRequestForm({ serviceId, version, provider, definition, taxpayers, allowsRegistryIdentity = false, resources = { assessments: [], properties: [] } }: { serviceId: string; version: number; provider: string; definition: DigitalService; taxpayers: { id: string; label: string }[]; allowsRegistryIdentity?: boolean; resources?: { assessments: { id: string; label: string; taxpayerId: string }[]; properties: { id: string; label: string; taxpayerId: string | null }[] } }) {
  const router = useRouter(), [key] = useState(() => crypto.randomUUID()), [pending, setPending] = useState(false), [error, setError] = useState("");
  const [uploads, setUploads] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState("");
  const [taxpayerId, setTaxpayerId] = useState("");
  return <form className="space-y-5" onSubmit={async (event) => {
    event.preventDefault(); setPending(true); setError("");
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/portal/solicitacoes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ serviceId, version, requestKey: key, description: data.get("description"), values: Object.fromEntries(definition.fields.map((item) => [item.code, String(data.get(item.code) || "")])), uploadIds: Object.values(uploads), accepted: data.get("accepted") === "on", taxpayerId: String(data.get("taxpayerId") || ""), location: String(data.get("location") || ""), latitude: data.get("latitude") ? Number(data.get("latitude")) : null, longitude: data.get("longitude") ? Number(data.get("longitude")) : null, ...(data.get("startsAt") ? { startsAt: String(data.get("startsAt")) } : {}) }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error); router.push(`/portal/minha-area/solicitacoes/${result.id}`); router.refresh();
    } catch (issue) { setError(issue instanceof Error ? issue.message : "Não foi possível enviar."); } finally { setPending(false); }
  }}>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-4 text-sm text-red-800">{error}</p>}
    {["TRIBUTARIO", "CADASTRO"].includes(provider) && <label className="block text-sm font-semibold text-slate-700">Cadastro autorizado<select required={provider === "TRIBUTARIO" || !allowsRegistryIdentity} name="taxpayerId" value={taxpayerId} onChange={(event) => setTaxpayerId(event.target.value)} className="mt-2 w-full rounded-lg border p-3"><option value="">{provider === "CADASTRO" && allowsRegistryIdentity ? "Cadastro pessoal conferido pelo município" : "Selecione"}</option>{taxpayers.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>}
    <label className="block text-sm font-semibold text-slate-700">Descrição da solicitação<textarea name="description" required minLength={10} maxLength={12000} rows={5} className="mt-2 w-full rounded-lg border p-3 font-normal" /></label>
    {definition.fields.map((item) => {
      const options = item.code === "assessmentId" && definition.executor === "GUIA" ? resources.assessments.filter((row) => row.taxpayerId === taxpayerId) : item.code === "realEstateId" && definition.executor === "ITBI" ? resources.properties.filter((row) => row.taxpayerId === taxpayerId) : null;
      return <label key={item.code} className="block text-sm font-semibold text-slate-700">{item.label}{item.required ? " *" : ""}{options ? <select name={item.code} required={item.required} className="mt-2 w-full rounded-lg border p-3"><option value="">Selecione um recurso autorizado</option>{options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select> : item.type === "SELECT" ? <select name={item.code} required={item.required} className="mt-2 w-full rounded-lg border p-3"><option value="">Selecione</option>{item.options.map((option) => <option key={option}>{option}</option>)}</select> : item.type === "TEXTAREA" ? <textarea name={item.code} required={item.required} maxLength={4000} className="mt-2 w-full rounded-lg border p-3" /> : <input name={item.code} type={item.type === "DATE" ? "date" : item.type === "NUMBER" ? "number" : "text"} step={item.type === "NUMBER" ? "any" : undefined} required={item.required} maxLength={4000} className="mt-2 w-full rounded-lg border p-3" />}</label>;
    })}
    {provider === "MANUTENCAO" && <OccurrenceLocation serviceId={serviceId} definition={definition} />}
    {["RESERVA", "AGENDAMENTO"].includes(provider) && <label className="block text-sm font-semibold">Horário publicado<select name="startsAt" required className="mt-2 w-full rounded-lg border p-3"><option value="">Selecione uma vaga</option>{definition.availableSlots.filter((value) => new Date(value) > new Date()).map((value) => <option key={value} value={value}>{new Date(value).toLocaleString("pt-BR")}</option>)}</select></label>}
    {definition.documents.map((item) => <label key={item.code} className="block rounded-lg border p-4 text-sm font-semibold">{item.label} — {item.required ? "obrigatório" : "opcional"}<input type="file" accept="application/pdf,image/jpeg,image/png" disabled={pending || Boolean(uploading)} required={item.required && !uploads[item.code]} className="mt-3 block w-full text-sm" onChange={async (event) => {
      const file = event.target.files?.[0]; if (!file) return; setUploading(item.code); setError("");
      try { const data = await uploadPortalEvidence(file, { serviceId, code: item.code }); setUploads((current) => ({ ...current, [item.code]: data.uploadId })); } catch (issue) { setError(issue instanceof Error ? issue.message : "Falha no anexo."); } finally { setUploading(""); }
    }} /><span className="mt-2 block text-xs font-normal text-slate-500">{uploads[item.code] ? "Arquivo recebido" : uploading === item.code ? "Enviando…" : "PDF, JPG ou PNG, até 10 MB"}</span></label>)}
    {definition.acceptance && <label className="flex items-start gap-3 rounded-lg bg-slate-50 p-4 text-sm leading-6"><input type="checkbox" name="accepted" required className="mt-1" /><span className="whitespace-pre-wrap">{definition.acceptance}</span></label>}
    <button disabled={pending || Boolean(uploading)} className="rounded-lg bg-emerald-700 px-6 py-3 text-sm font-bold text-white disabled:opacity-50">{pending ? "Protocolando…" : "Enviar e gerar protocolo"}</button>
  </form>;
}
