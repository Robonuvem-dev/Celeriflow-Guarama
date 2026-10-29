"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { OperationalTablePanel } from "@/components/app-ui/operational/OperationalTablePanel";
import { TaxOperationalTable } from "./TaxOperationalTable";
import { taxDraftInput } from "./TaxDraftControls";

type Row = { id: string; label: string; initialValues?: Record<string, string | boolean> };
type Field = { key: string; label: string; name: (index: number, id: string) => string; type?: "text" | "number" | "checkbox" | "radio" | "select"; required?: boolean; min?: number; max?: number; step?: string; maxLength?: number | ((id: string) => number); pattern?: (id: string) => string; inputMode?: (id: string) => "numeric" | "text"; options?: { value: string; label: string }[]; minWidth?: number; initialWidth?: number };

/** FormData bridge for legacy actions. The complete draft lives above Panel/Table. */
export function TaxFormRowsEditor({ id, title, rows, fields, actions }: { id: string; title: string; rows: Row[]; fields: Field[]; actions?: ReactNode }) {
  const rowKey = JSON.stringify(rows.map(row => row.id));
  const initialize = (row: Row) => Object.fromEntries(fields.map(field => [field.key, row.initialValues?.[field.key] ?? (field.type === "checkbox" || field.type === "radio" ? false : field.type === "select" ? field.options?.[0]?.value ?? "" : "")]));
  const [draft, setDraft] = useState(() => ({ key: rowKey, values: Object.fromEntries(rows.map(row => [row.id, initialize(row)])) }));
  const values = draft.key === rowKey ? draft.values : Object.fromEntries(rows.map(row => [row.id, draft.values[row.id] ?? initialize(row)]));
  if (draft.key !== rowKey) setDraft({ key: rowKey, values });
  const host = useRef<HTMLDivElement>(null);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const form = host.current?.closest("form");
    if (!form) return;
    const validate = (event: Event) => {
      for (const field of fields) {
        if (field.type === "radio" && field.required && rows.length && !rows.some(row => values[row.id][field.key])) { event.preventDefault(); setNotice(`Selecione ${field.label}.`); return; }
        for (const row of rows) {
          const text = String(values[row.id][field.key] ?? "");
          if (field.type === "checkbox" || field.type === "radio") continue;
          const number = Number(text);
          const maximum = typeof field.maxLength === "function" ? field.maxLength(row.id) : field.maxLength;
          const step = field.step && field.step !== "any" ? Number(field.step) : undefined;
          const units = step ? (number - (field.min ?? 0)) / step : 0;
          if ((field.required && !text) || (maximum !== undefined && text.length > maximum) || (field.pattern && text && !new RegExp(`^(?:${field.pattern(row.id)})$`).test(text)) || (field.type === "number" && text && (!Number.isFinite(number) || (field.min !== undefined && number < field.min) || (field.max !== undefined && number > field.max) || (step !== undefined && Math.abs(units - Math.round(units)) > 0.000001)))) { event.preventDefault(); setNotice(`Revise ${field.label} de ${row.label}. A validação considera todas as páginas.`); return; }
        }
      }
      setNotice("");
    };
    form.addEventListener("submit", validate);
    return () => form.removeEventListener("submit", validate);
  }, [fields, rows, values]);
  const change = (rowId: string, field: Field, value: string | boolean) => setDraft(current => ({ ...current, values: field.type === "radio" ? Object.fromEntries(rows.map(row => [row.id, { ...values[row.id], [field.key]: row.id === rowId }])) : { ...current.values, [rowId]: { ...current.values[rowId], [field.key]: value } } }));
  return <div ref={host}>
    {rows.flatMap((row, index) => fields.map(field => {
      const value = values[row.id][field.key];
      if ((field.type === "checkbox" || field.type === "radio") && !value) return null;
      return <input key={`${row.id}:${field.key}`} type="hidden" name={field.name(index, row.id)} value={field.type === "checkbox" ? "on" : field.type === "radio" ? String(index) : String(value ?? "")} />;
    }))}
    {notice && <p role="alert" className="text-sm text-red-700">{notice}</p>}
    <OperationalTablePanel title={title} triggerLabel={`Editar ${title.toLocaleLowerCase("pt-BR")} (${rows.length})`} description="Os campos de todas as páginas são serializados no formulário de origem. Nenhum payload depende da montagem de uma célula.">
      <TaxOperationalTable id={id} actions={actions && <div className="flex h-7 items-center gap-2 [&>button]:h-7 [&>button]:rounded [&>button]:border [&>button]:px-2 [&>button]:text-[13px]">{actions}</div>}
        columns={[["__label", "Registro", 80, 180], ...fields.map(field => [field.key, field.label, field.minWidth ?? 80, field.initialWidth ?? 180, "text"] as const)]}
        rows={rows.map(row => ({ id: row.id, label: row.label, values: { __label: row.label, ...Object.fromEntries(fields.map(field => [field.key, String(values[row.id][field.key] ?? "")])) }, cells: Object.fromEntries(fields.map(field => [field.key, field.type === "checkbox" || field.type === "radio"
          ? <input type={field.type} name={field.type === "radio" ? `${id}:${field.key}` : undefined} aria-label={`${field.label} — ${row.label}`} checked={Boolean(values[row.id][field.key])} onChange={event => change(row.id, field, event.target.checked)} />
          : field.type === "select" ? <select aria-label={`${field.label} — ${row.label}`} value={String(values[row.id][field.key] ?? "")} onChange={event => change(row.id, field, event.target.value)} className={taxDraftInput}>{field.options?.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
          : <input type={field.type ?? "text"} aria-label={`${field.label} — ${row.label}`} value={String(values[row.id][field.key] ?? "")} min={field.min} max={field.max} step={field.type === "number" ? field.step ?? "any" : undefined} maxLength={typeof field.maxLength === "function" ? field.maxLength(row.id) : field.maxLength} pattern={field.pattern?.(row.id)} inputMode={field.inputMode?.(row.id)} onChange={event => change(row.id, field, event.target.value)} className={taxDraftInput} />])) }))} />
    </OperationalTablePanel>
  </div>;
}
