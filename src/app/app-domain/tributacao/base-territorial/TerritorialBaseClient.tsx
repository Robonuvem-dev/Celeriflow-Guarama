"use client";

import { useMemo, useState } from "react";
import { OperationalFilters } from "@/components/app-ui/operational/OperationalListFrame";
import { saveTerritorialRecord } from "./actions";
import { TaxOperationalTable } from "../TaxOperationalTable";

type Entry = { id: string; code: string; recordType: string; data: unknown; version: number; effectiveFrom: string; status: string };
function detail(data: unknown) { return data && typeof data === "object" && !Array.isArray(data) ? data as Record<string, unknown> : {}; }
export default function TerritorialBaseClient({ entries }: { entries: Entry[] }) {
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const filtered = useMemo(() => entries.filter(entry => { const data = detail(entry.data); return `${entry.code} ${entry.recordType} ${data.sectorCode ?? ""} ${data.neighborhood ?? ""} ${data.streetName ?? ""}`.toLowerCase().includes(search.toLowerCase()); }), [entries, search]);
  async function save(formData: FormData) {
    const result = await saveTerritorialRecord({ code: String(formData.get("code") ?? ""), recordType: String(formData.get("recordType") ?? ""), sectorCode: String(formData.get("sectorCode") ?? ""), neighborhood: String(formData.get("neighborhood") ?? ""), streetName: String(formData.get("streetName") ?? ""), side: String(formData.get("side") ?? ""), rangeStart: String(formData.get("rangeStart") ?? ""), rangeEnd: String(formData.get("rangeEnd") ?? ""), effectiveFrom: String(formData.get("effectiveFrom") ?? "") });
    setMessage(result.error ?? "Registro territorial salvo com nova versão.");
  }
  return <TaxOperationalTable resetKey={search} id="base-territorial" emptyMessage="Nenhum registro territorial."
    toolbar={<><input aria-label="Buscar base territorial" value={search} onChange={event => setSearch(event.target.value)} placeholder="Código, setor, bairro ou logradouro" className="h-7 min-w-0 flex-1 rounded border px-2 text-[13px]" /><OperationalFilters label="Nova versão territorial"><form action={save} className="grid gap-2 sm:grid-cols-2"><label>Código<input name="code" required className="input" /></label><label>Tipo<select name="recordType" className="input"><option>SETOR</option><option>FACE</option><option>FAIXA</option></select></label><label>Setor fiscal<input name="sectorCode" required className="input" /></label><label>Bairro/localidade<input name="neighborhood" required className="input" /></label><label>Logradouro<input name="streetName" required className="input" /></label><label>Lado<select name="side" className="input"><option value="">Lado não aplicável</option><option>PAR</option><option>ÍMPAR</option><option>AMBOS</option></select></label><label>Vigência<input name="effectiveFrom" required type="date" className="input" /></label><label>Número inicial<input name="rangeStart" className="input" /></label><label>Número final<input name="rangeEnd" className="input" /></label><button className="rounded border p-2">Salvar versão territorial</button>{message && <p role="status">{message}</p>}</form></OperationalFilters></>}
    columns={[["code", "Código", 80, 110, "identifier"], ["type", "Tipo", 75, 90], ["sector", "Setor", 80, 100], ["neighborhood", "Bairro", 110, 160], ["street", "Logradouro", 150, 230], ["side", "Lado", 75, 90], ["from", "Número inicial", 95, 105], ["until", "Número final", 95, 105], ["version", "Versão", 65, 75]]}
    rows={filtered.map(entry => { const data = detail(entry.data); return { id: entry.id, label: entry.code, values: { code: entry.code, type: entry.recordType, sector: String(data.sectorCode ?? "—"), neighborhood: String(data.neighborhood ?? "—"), street: String(data.streetName ?? "—"), side: String(data.side ?? "ambos"), from: String(data.rangeStart ?? "—"), until: String(data.rangeEnd ?? "—"), version: String(entry.version) } }; })} />;
}
