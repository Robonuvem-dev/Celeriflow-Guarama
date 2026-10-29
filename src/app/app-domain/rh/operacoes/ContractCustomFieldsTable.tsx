"use client";

import { useState } from "react";
import type { ContractCustomFieldsPolicy, ContractCustomFieldValues } from "@/lib/rh/contract-custom-fields";
import { RhTablePanel } from "../_components/RhTablePanel";
import { rhColumn } from "../_components/operational-columns";

export function ContractCustomFieldsTable({ policy, hash, initialValues }: { policy: ContractCustomFieldsPolicy; hash: string; initialValues: ContractCustomFieldValues }) {
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(policy.fields.map(field => [field.code, initialValues[field.code] === undefined ? "" : String(initialValues[field.code])])));
  const [selected, setSelected] = useState(policy.fields[0]?.code || "");
  const field = policy.fields.find(item => item.code === selected) || policy.fields[0];
  const control = "block h-8 w-full rounded border px-2";
  return <fieldset className="space-y-2 rounded border p-2 sm:col-span-3"><legend className="text-xs font-semibold">Campos configuráveis do regime</legend>
    <input type="hidden" name="customFieldsPolicyHash" value={hash} />
    {policy.fields.map(item => <input key={item.code} type="hidden" name={`custom:${item.code}`} value={values[item.code] || ""} />)}
    <p className="text-xs">{policy.legalReference}</p>
    <RhTablePanel title="Campos configuráveis do contrato" preferenceId="rh-contrato-campos-edicao" columns={[rhColumn("code", "Código", 180, 100, "identifier"), rhColumn("label", "Campo", 280, 140), rhColumn("type", "Tipo", 120, 90), rhColumn("required", "Obrigatório", 100, 85), rhColumn("value", "Valor", 280, 140), rhColumn("actions", "Editar", 75, 65, "actions")]}
      rows={policy.fields.map(item => ({ id: item.code, label: item.label, values: { code: item.code, label: item.label, type: item.type, required: item.required ? "Sim" : "Não", value: values[item.code] || "" }, actions: <button type="button" onClick={() => setSelected(item.code)}>Editar</button> }))} />
    {field && <label className="block text-xs">{field.label}{field.required ? " *" : ""}{field.type === "BOOLEANO" || field.type === "OPCAO" ? <select value={values[field.code] || ""} onChange={event => setValues(current => ({ ...current, [field.code]: event.target.value }))} className={control}><option value="">Selecione</option>{(field.type === "BOOLEANO" ? [{ value: "true", label: "Sim" }, { value: "false", label: "Não" }] : field.options).map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : <input type={field.type === "DATA" ? "date" : "text"} inputMode={field.type === "INTEIRO" || field.type === "DECIMAL" ? "decimal" : undefined} maxLength={field.type === "TEXTO" ? field.maxLength : undefined} value={values[field.code] || ""} onChange={event => setValues(current => ({ ...current, [field.code]: event.target.value }))} className={control} />}</label>}
  </fieldset>;
}
