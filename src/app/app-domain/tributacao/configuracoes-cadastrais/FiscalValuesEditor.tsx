"use client";

import { useEffect, useRef, useState } from "react";
import { OperationalTablePanel } from "@/components/app-ui/operational/OperationalTablePanel";
import { TaxOperationalTable } from "../TaxOperationalTable";
import { TaxDraftText, taxDraftInput } from "../TaxDraftControls";

type Field = { key: string; label: string; type: "TEXT" | "NUMBER" | "DATE" | "BOOLEAN" | "LIST"; required: boolean; options: string[] };
export function FiscalValuesEditor({ id, title, fields, values, prefix = "", nullableBoolean = false, enforceRequired = true }: {
  id: string; title: string; fields: Field[]; values?: Record<string, unknown>; prefix?: string;
  nullableBoolean?: boolean; enforceRequired?: boolean;
}) {
  const [draft, setDraft] = useState<Record<string, string>>(() => Object.fromEntries(fields.map(field => [field.key, field.type === "BOOLEAN" ? typeof values?.[field.key] === "boolean" ? String(values[field.key]) : nullableBoolean ? "" : "false" : String(values?.[field.key] ?? "")])));
  const [notice, setNotice] = useState("");
  const [invalidInputs, setInvalidInputs] = useState<Record<string, boolean>>({});
  const host = useRef<HTMLDivElement>(null);
  const currentValue = (field: Field) => draft[field.key] ?? (field.type === "BOOLEAN" && !nullableBoolean ? "false" : "");
  useEffect(() => {
    const form = host.current?.closest("form");
    if (!form) return;
    const validate = (event: Event) => {
      const invalid = fields.find(field => {
        const value = draft[field.key] ?? "";
        return invalidInputs[field.key] || (enforceRequired && field.required && field.type !== "BOOLEAN" && !value)
          || (field.type === "NUMBER" && value !== "" && !Number.isFinite(Number(value)))
          || (field.type === "LIST" && value !== "" && !field.options.includes(value));
      });
      if (invalid) { event.preventDefault(); setNotice(`Revise o campo ${invalid.label} antes de salvar. Todas as páginas são verificadas.`); }
      else setNotice("");
    };
    form.addEventListener("submit", validate);
    return () => form.removeEventListener("submit", validate);
  }, [fields, draft, invalidInputs, enforceRequired]);
  return <div ref={host}>
    {fields.map(field => field.type === "BOOLEAN" && !nullableBoolean ? currentValue(field) === "true" ? <input key={field.key} type="hidden" name={`${prefix}${field.key}`} value="on" /> : null : <input key={field.key} type="hidden" name={`${prefix}${field.key}`} value={currentValue(field)} />)}
    {notice && <p role="alert" className="text-sm text-red-700">{notice}</p>}
    <OperationalTablePanel title={title} triggerLabel={`Preencher campos (${fields.length})`} description="Os valores de todas as páginas ficam no componente de origem e são enviados integralmente pelo formulário, inclusive depois de fechar este painel.">
      <TaxOperationalTable id={id}
        columns={[["label", "Campo", 100, 300], ["type", "Tipo", 72, 130], ["required", "Obrigatório", 64, 90], ["value", "Valor", 120, 450]]}
        rows={fields.map(field => ({ id: field.key, label: field.label, values: { label: field.label, type: field.type, required: field.required ? "Sim" : "Não", value: currentValue(field) }, cells: { value: field.type === "BOOLEAN" ? nullableBoolean
          ? <select aria-label={field.label} value={currentValue(field)} onChange={event => setDraft(current => ({ ...current, [field.key]: event.target.value }))} className={taxDraftInput}><option value="">Não informado</option><option value="true">Sim</option><option value="false">Não</option></select>
          : <input type="checkbox" aria-label={field.label} checked={currentValue(field) === "true"} onChange={event => setDraft(current => ({ ...current, [field.key]: String(event.target.checked) }))} />
          : field.type === "LIST" ? <select aria-label={field.label} value={currentValue(field)} onChange={event => setDraft(current => ({ ...current, [field.key]: event.target.value }))} className={taxDraftInput}><option value="">Selecione</option>{field.options.map(option => <option key={option}>{option}</option>)}</select>
          : field.type === "TEXT" ? <TaxDraftText label={field.label} value={currentValue(field)} maxLength={4000} onChange={value => setDraft(current => ({ ...current, [field.key]: value }))} />
          : <input aria-label={field.label} type={field.type === "DATE" ? "date" : "number"} step={field.type === "NUMBER" ? "any" : undefined} value={currentValue(field)} onChange={event => { const value = event.target.value; const invalid = !event.target.validity.valid; setDraft(current => ({ ...current, [field.key]: value })); setInvalidInputs(current => ({ ...current, [field.key]: invalid })); }} className={taxDraftInput} /> } }))} />
    </OperationalTablePanel>
  </div>;
}
