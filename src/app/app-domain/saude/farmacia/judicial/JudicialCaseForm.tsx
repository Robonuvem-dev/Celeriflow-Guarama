"use client";
import { useState } from "react";
import { createJudicialCaseAction } from "./actions";
type Option = { id: string; name: string };
const field = "min-w-0 rounded border bg-white p-2 text-sm";
export function JudicialCaseForm({ patients, units, lawyers, medicines, prescriptions, processes, purchases }: { patients: Option[]; units: Option[]; lawyers: Option[]; medicines: Option[]; prescriptions: { id: string; patientId: string; medicineId: string | null; name: string }[]; processes: (Option & { personPatientId: string | null })[]; purchases: Option[] }) {
  const [patientId, setPatientId] = useState("");
  const [items, setItems] = useState([{ medicineId: "", quantity: "", dosage: "", prescriptionItemId: "" }]);
  const select = (name: string, label: string, options: Option[], required = false) => <label className="grid gap-1 text-sm">{label}<select name={name} required={required} className={field}><option value="">Selecione</option>{options.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label>;
  function change(index: number, value: Partial<typeof items[number]>) { setItems(current => current.map((item, position) => position === index ? { ...item, ...value } : item)); }
  return <form action={createJudicialCaseAction} className="mt-3 space-y-3">
    <input type="hidden" name="items" value={JSON.stringify(items.map(item => ({ ...item, quantity: Number(item.quantity), prescriptionItemId: item.prescriptionItemId || null })))} />
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="grid gap-1 text-sm">Número do processo judicial<input name="caseNumber" required className={field} /></label>
      <label className="grid gap-1 text-sm">Paciente<select name="patientId" required value={patientId} onChange={event => { setPatientId(event.target.value); setItems(current => current.map(item => ({ ...item, prescriptionItemId: "" }))); }} className={field}><option value="">Selecione</option>{patients.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label>
      {select("unitId", "Unidade responsável", units, true)}{select("lawyerId", "Advogado", lawyers, true)}
      <label className="grid gap-1 text-sm">Abertura<input name="openedAt" type="date" required className={field} /></label><label className="grid gap-1 text-sm">Validade<input name="validUntil" type="date" required className={field} /></label>
      {select("processId", "Protocolo de origem do paciente", processes.filter(process => process.personPatientId === patientId))}{select("purchaseRequestId", "Pedido de compra existente", purchases)}
      <label className="grid gap-1 text-sm sm:col-span-2">Motivo/objeto<textarea name="reason" required className={field} /></label>
    </div>
    {items.map((item, index) => <fieldset key={index} className="grid gap-3 rounded border p-3 sm:grid-cols-2"><legend className="px-1 text-sm font-semibold">Produto {index + 1}</legend>
      <label className="grid gap-1 text-sm">Medicamento<select required value={item.medicineId} onChange={event => change(index, { medicineId: event.target.value, prescriptionItemId: "" })} className={field}><option value="">Selecione</option>{medicines.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label>
      <label className="grid gap-1 text-sm">Quantidade total do processo<input required type="number" min="0.000001" step="any" value={item.quantity} onChange={event => change(index, { quantity: event.target.value })} className={field} /></label>
      <label className="grid gap-1 text-sm">Posologia<input required value={item.dosage} onChange={event => change(index, { dosage: event.target.value })} className={field} /></label>
      <label className="grid gap-1 text-sm">Item da receita de origem<select value={item.prescriptionItemId} onChange={event => change(index, { prescriptionItemId: event.target.value })} className={field}><option value="">Receita externa / sem vínculo eletrônico</option>{prescriptions.filter(prescription => prescription.patientId === patientId && prescription.medicineId === item.medicineId).map(option => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label>
      {items.length > 1 && <button type="button" className={field} onClick={() => setItems(current => current.filter((_, position) => position !== index))}>Remover produto</button>}
    </fieldset>)}
    <div className="flex flex-wrap gap-3"><button type="button" className={field} onClick={() => setItems(current => [...current, { medicineId: "", quantity: "", dosage: "", prescriptionItemId: "" }])}>Adicionar produto</button><button className="rounded bg-emerald-700 px-4 py-2 text-sm font-semibold text-white">Abrir processo</button></div>
  </form>;
}
