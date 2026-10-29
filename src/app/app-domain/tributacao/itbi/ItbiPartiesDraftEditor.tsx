"use client";

import { useState } from "react";
import { TaxPartiesEditor } from "../TaxPartiesEditor";
import { itbiPartyEntries } from "./draft-party-entries";

export default function ItbiPartiesDraftEditor({ kind, count, onCountChange, taxpayers, initialTaxpayerId = "" }: {
  kind: "seller" | "buyer"; count: number; onCountChange: (count: number) => void;
  taxpayers: { id: string; name: string }[]; initialTaxpayerId?: string;
}) {
  const empty = (index: number) => ({ taxpayerId: index === 0 ? initialTaxpayerId : "", sharePercent: index === 0 ? "100" : "" });
  const [draft, setDraft] = useState(() => Array.from({ length: count }, (_, index) => empty(index)));
  const rows = Array.from({ length: count }, (_, index) => draft[index] ?? empty(index));
  const label = kind === "seller" ? "Transmitentes" : "Adquirentes";
  return <div>
    {itbiPartyEntries(kind, rows).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
    <TaxPartiesEditor id={`itbi-${kind}-rascunho`} title={label} rows={rows} taxpayers={taxpayers.map(person => ({ id: person.id, label: person.name }))}
      onChange={(index, patch) => setDraft(current => rows.map((row, at) => at === index ? { ...row, ...patch } : current[at] ?? row))}
      actions={<><button type="button" onClick={() => { setDraft([...rows, empty(count)]); onCountChange(count + 1); }} className="h-7 rounded border px-2 text-[13px]">Adicionar {kind === "seller" ? "transmitente" : "adquirente"}</button><button type="button" disabled={count <= 1} onClick={() => { setDraft(rows.slice(0, -1)); onCountChange(count - 1); }} className="h-7 rounded border px-2 text-[13px]">Remover último</button></>} />
  </div>;
}
