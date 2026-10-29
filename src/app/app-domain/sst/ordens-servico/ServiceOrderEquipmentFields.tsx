"use client";
import { useState } from "react";
import { SstTablePanel } from "../_components/SstTablePanel";
import { sstColumn } from "../_components/operational-columns";
import { parallelDraftEntries } from "../_components/draft-payload";

export function ServiceOrderEquipmentFields({ materials }: { materials: { id: string; name: string }[] }) {
  const [rows, setRows] = useState(() => Array.from({ length: 5 }, () => ({ materialId: "", quantity: "1", requirement: "" })));
  const [index, setIndex] = useState(0);
  const row = rows[index];
  const update = (patch: Partial<typeof row>) => setRows(current => current.map((item, position) => position === index ? { ...item, ...patch } : item));
  return <section className="space-y-3">
    {parallelDraftEntries(rows, ["materialId", "quantity", "requirement"]).map(([name, value], position) => <input key={`${position}:${name}`} type="hidden" name={name} value={value} />)}
    <SstTablePanel title="Equipamentos requeridos pela ordem" preferenceId="sst-ordem-equipamentos-edicao" description="Material canônico, sem movimentação de estoque. As cinco posições e seus três arrays de payload mantêm a mesma ordem." columns={[sstColumn("material", "Material", 350, 160), sstColumn("quantity", "Quantidade", 130, 90), sstColumn("requirement", "Exigência/uso", 400, 180), sstColumn("actions", "Editar", 75, 65, "actions")]} rows={rows.map((item, position) => ({ id: String(position), label: `Material ${position + 1}`, values: { material: materials.find(material => material.id === item.materialId)?.name || "Sem item", quantity: item.quantity, requirement: item.requirement }, actions: <button type="button" onClick={() => setIndex(position)}>Editar</button> }))} />
    <fieldset className="grid gap-2 rounded border p-3"><legend>Material {index + 1}</legend><label>Material canônico<select value={row.materialId} onChange={event => update({ materialId: event.target.value })} className="block w-full rounded border p-2"><option value="">Sem item</option>{materials.map(material => <option key={material.id} value={material.id}>{material.name}</option>)}</select></label><label>Quantidade<input type="number" min={1} value={row.quantity} onChange={event => update({ quantity: event.target.value })} className="block w-full rounded border p-2" /></label><label>Exigência/uso<input value={row.requirement} onChange={event => update({ requirement: event.target.value })} className="block w-full rounded border p-2" /></label></fieldset>
  </section>;
}
