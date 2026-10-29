"use client";
import { useState } from "react";
import { SstTablePanel } from "../_components/SstTablePanel";
import { sstColumn } from "../_components/operational-columns";
import { parallelDraftEntries } from "../_components/draft-payload";

export function BoardMemberFields({ people }: { people: { id: string; fullName: string }[] }) {
  const [rows, setRows] = useState(() => Array.from({ length: 10 }, () => ({ personId: "", council: "" })));
  const [index, setIndex] = useState(0);
  const row = rows[index];
  const update = (patch: Partial<typeof row>) => setRows(current => current.map((item, position) => position === index ? { ...item, ...patch } : item));
  return <section className="space-y-3">
    {parallelDraftEntries(rows, ["personId", "council"]).map(([name, value], position) => <input key={`${position}:${name}`} type="hidden" name={name} value={value} />)}
    <SstTablePanel title="Profissionais e registros dos conselhos" preferenceId="sst-junta-membros-edicao" columns={[sstColumn("position", "Posição", 90, 65), sstColumn("person", "Profissional", 400, 180), sstColumn("council", "Conselho", 240, 120), sstColumn("actions", "Editar", 75, 65, "actions")]} rows={rows.map((item, position) => ({ id: String(position), label: `Membro ${position + 1}`, values: { position: String(position + 1), person: people.find(person => person.id === item.personId)?.fullName || "Sem membro", council: item.council }, actions: <button type="button" onClick={() => setIndex(position)}>Editar</button> }))} />
    <fieldset className="grid gap-2 rounded border p-3"><legend>Membro {index + 1}</legend><label>Profissional<select value={row.personId} onChange={event => update({ personId: event.target.value })} className="block w-full rounded border p-2"><option value="">Sem membro</option>{people.map(person => <option key={person.id} value={person.id}>{person.fullName}</option>)}</select></label><label>Conselho<input value={row.council} onChange={event => update({ council: event.target.value })} placeholder="CRM/UF/número" className="block w-full rounded border p-2" /></label></fieldset>
  </section>;
}
