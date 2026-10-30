"use client";
import { useState } from "react";
import { OperationalTablePanel } from "@/components/app-ui/operational/OperationalTablePanel";
import { fiscalFieldTypeLabel, matchesFiscalField, orderedFiscalFields, type FiscalFieldEditorDefinition as Field } from "@/lib/tributacao/fiscal-field-definition";
import { TaxOperationalTable } from "../TaxOperationalTable";
import { TaxDraftText, taxDraftInput } from "../TaxDraftControls";

export function FiscalFieldsEditor({ id, title, fields, onChange, onRemove, onAdd, separator = "\n", maximum }: {
  id: string; title: string; fields: Field[];
  onChange: (index: number, patch: Partial<Field>) => void;
  onRemove: (index: number) => void; onAdd: () => void;
  separator?: "\n" | ";"; maximum?: number;
}) {
  const [filters, setFilters] = useState({ type: "", enabled: "", required: "", lookup: "" });
  const selected = orderedFiscalFields(fields).filter(field => matchesFiscalField(field, filters));
  const csvCell = (value: string) => `"${(/^[=+\-@]/.test(value) ? "'" + value : value).replaceAll('"', '""')}"`;
  const csv = [["Atributo", "Descrição", "Sequência", "Tipo dado", "Tamanho", "Visível", "Habilitado", "Obrigatório", "Consulta"], ...selected.map(field => [field.key, field.label, String(field.sequence ?? fields.indexOf(field) + 1), fiscalFieldTypeLabel(field), String(field.maxLength ?? 4000), field.visible === false ? "Não" : "Sim", field.enabled === false ? "Não" : "Sim", field.required ? "Sim" : "Não", field.type === "LIST" ? "Sim" : "Não"])].map(row => row.map(csvCell).join(",")).join("\r\n");
  return <OperationalTablePanel title={title} triggerLabel={`Editar campos (${fields.length})`} description="Sequência, tipo, tamanho e permissões são aplicados ao formulário publicado. As opções de consulta são definidas na lista do campo.">
    <div className="flex flex-wrap gap-2 pb-3">{([['type','Tipo dado'], ['enabled','Habilitado'], ['required','Obrigatório'], ['lookup','Consulta']] as const).map(([key, label]) => <label key={key}>{label}<select className={taxDraftInput} value={filters[key]} onChange={event => setFilters(current => ({ ...current, [key]: event.target.value }))}><option value="">Ambos / todos</option>{key === 'type' ? [["TEXT","Alfanumérico"],["INTEGER","Inteiro"],["DECIMAL","Decimal"],["CURRENCY","Moeda"],["DATE","Data"],["BOOLEAN","Sim / não"],["LIST","Consulta"]].map(([value, title]) => <option key={value} value={value}>{title}</option>) : <><option value="true">Sim</option><option value="false">Não</option></>}</select></label>)}<a className="underline" download="configuracao-bic.csv" href={`data:text/csv;charset=utf-8,${encodeURIComponent("\uFEFF" + csv)}`}>Relatório da consulta CSV</a></div>
    <TaxOperationalTable id={id}
      actions={<button type="button" disabled={maximum !== undefined && fields.length >= maximum} onClick={onAdd} className="h-7 rounded border px-2 text-[13px]">Adicionar campo</button>}
      columns={[["key", "Atributo", 80, 160], ["label", "Descrição", 100, 260], ["sequence", "Sequência", 65, 100], ["type", "Tipo dado", 80, 140], ["size", "Tamanho", 65, 100], ["visible", "Visível", 64, 90], ["enabled", "Habilitado", 64, 90], ["required", "Obrigatório", 64, 90], ["options", "Consulta / opções", 100, 280], ["actions", "Remover", 72, 72, "actions"]]}
      rows={selected.map(field => { const index = fields.indexOf(field); return { id: String(index), label: field.label || `Campo ${index + 1}`,
        values: { key: field.key, label: field.label, sequence: String(field.sequence ?? index + 1), type: fiscalFieldTypeLabel(field), size: String(field.maxLength ?? 4000), visible: field.visible === false ? "Não" : "Sim", enabled: field.enabled === false ? "Não" : "Sim", required: field.required ? "Sim" : "Não", options: (field.options ?? []).join(separator) },
        cells: {
          key: <input aria-label={`Chave do campo ${index + 1}`} value={field.key} onChange={event => onChange(index, { key: event.target.value })} className={taxDraftInput} />,
          label: <TaxDraftText label={`Descrição do campo ${index + 1}`} value={field.label} maxLength={120} onChange={value => onChange(index, { label: value })} />,
          sequence: <input aria-label={`Sequência do campo ${index + 1}`} type="number" min={1} max={10000} value={field.sequence ?? index + 1} onChange={event => onChange(index, { sequence: Number(event.target.value) })} className={taxDraftInput} />,
          size: <input aria-label={`Tamanho do campo ${index + 1}`} type="number" min={1} max={4000} value={field.maxLength ?? 4000} onChange={event => onChange(index, { maxLength: Number(event.target.value) })} className={taxDraftInput} />,
          type: <select aria-label={`Tipo do campo ${index + 1}`} value={field.type === "NUMBER" ? field.numberType ?? "DECIMAL" : field.type} onChange={event => { const value = event.target.value; onChange(index, ["INTEGER", "DECIMAL", "CURRENCY"].includes(value) ? { type: "NUMBER", numberType: value as "INTEGER" | "DECIMAL" | "CURRENCY" } : { type: value as Field["type"], numberType: undefined }); }} className={taxDraftInput}>{[["TEXT", "Alfanumérico"], ["INTEGER", "Inteiro"], ["DECIMAL", "Decimal"], ["CURRENCY", "Moeda"], ["DATE", "Data"], ["BOOLEAN", "Sim / não"], ["LIST", "Consulta à lista"]].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>,
          visible: <input type="checkbox" aria-label={`Campo ${index + 1} visível`} checked={field.visible !== false} onChange={event => onChange(index, { visible: event.target.checked })} />,
          enabled: <input type="checkbox" aria-label={`Campo ${index + 1} habilitado`} checked={field.enabled !== false} onChange={event => onChange(index, { enabled: event.target.checked })} />,
          required: <input type="checkbox" aria-label={`Campo ${index + 1} obrigatório`} checked={field.required} onChange={event => onChange(index, { required: event.target.checked })} />,
          options: field.type === "LIST" ? <TaxDraftText label={`Opções do campo ${index + 1}${separator === "\n" ? " — uma por linha" : " — separadas por ponto e vírgula"}`} value={(field.options ?? []).join(separator)} onChange={value => onChange(index, { options: value.split(separator) })} /> : "Não aplicável",
        },
        actions: <button type="button" onClick={() => onRemove(index)} aria-label={`Remover campo ${index + 1}`} className="h-6 rounded border px-1 text-[13px]">Remover</button>,
      }; })} />
  </OperationalTablePanel>;
}
