"use client";

import { useState } from "react";
import { OperationalFilters } from "@/components/app-ui/operational/OperationalListFrame";
import { requestRegistrySourceLookup } from "../cadastros-fiscais/actions";
import { TaxOperationalTable } from "../TaxOperationalTable";

type Row = { id: string; source: string; status: string; evidenceLevel: string; payload: unknown; createdAt: string };
function identifier(payload: unknown) {
  return payload && typeof payload === "object" && !Array.isArray(payload) ? String((payload as Record<string, unknown>).identifier ?? "") : "";
}
export default function RegistrySourcesClient({ events }: { events: Row[] }) {
  const [message, setMessage] = useState("");
  async function submit(formData: FormData) {
    const result = await requestRegistrySourceLookup({ source: String(formData.get("source") ?? ""), identifier: String(formData.get("identifier") ?? "") });
    setMessage(result.error ?? (result.duplicate ? "A mesma consulta já está registrada." : "Consulta registrada; o cadastro manual continua liberado."));
  }
  return <TaxOperationalTable id="fontes-cadastrais" emptyMessage="Nenhuma consulta registrada."
    toolbar={<><form action={submit} className="flex min-w-0 flex-1 items-center gap-2"><select aria-label="Fonte cadastral" name="source" className="h-7 w-40 rounded border text-[13px]"><option value="SERPRO_CPF">Consulta CPF</option><option value="SERPRO_CNPJ">Consulta CNPJ</option><option value="CORREIOS_DNE">Endereçamento/CEP</option></select><input aria-label="Identificador da consulta" name="identifier" required placeholder="CPF, CNPJ, CEP ou referência autorizada" className="h-7 min-w-0 flex-1 rounded border px-2 text-[13px]" /><button className="h-7 rounded border px-2 text-xs">Registrar consulta</button></form><OperationalFilters label="Contexto e resultado"><p>A ausência de credencial não bloqueia o cadastro. Nenhum retorno é preenchido como oficial sem execução do adaptador contratado.</p>{message && <p role="status">{message}</p>}</OperationalFilters></>}
    columns={[["source", "Fonte", 150, 220], ["identifier", "Identificador", 150, 230, "identifier"], ["status", "Situação", 140, 200, "status"], ["evidence", "Evidência", 90, 120], ["date", "Solicitada em", 155, 180]]}
    rows={events.map(event => ({ id: event.id, label: identifier(event.payload) || event.id, values: { source: event.source.replaceAll("_", " "), identifier: identifier(event.payload), status: event.status.replaceAll("_", " "), evidence: event.evidenceLevel, date: new Date(event.createdAt).toLocaleString("pt-BR") } }))} />;
}
