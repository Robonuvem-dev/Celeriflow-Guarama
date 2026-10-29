"use client";

import { OperationalTablePanel } from "@/components/app-ui/operational/OperationalTablePanel";
import { TaxOperationalTable } from "../TaxOperationalTable";
import { TaxDraftText, taxDraftInput } from "../TaxDraftControls";

type Field = { key: string; label: string; type: "TEXT" | "NUMBER" | "DATE" | "BOOLEAN" | "LIST"; required: boolean; options?: string[] };

export function FiscalFieldsEditor({ id, title, fields, onChange, onRemove, onAdd, separator = "\n", maximum }: {
  id: string; title: string; fields: Field[];
  onChange: (index: number, patch: Partial<Field>) => void;
  onRemove: (index: number) => void; onAdd: () => void;
  separator?: "\n" | ";"; maximum?: number;
}) {
  return <OperationalTablePanel title={title} triggerLabel={`Editar campos (${fields.length})`} description="As definições completas permanecem no formulário de origem. A publicação valida todas as linhas, não apenas a página aberta.">
    <TaxOperationalTable id={id}
      actions={<button type="button" disabled={maximum !== undefined && fields.length >= maximum} onClick={onAdd} className="h-7 rounded border px-2 text-[13px]">Adicionar campo</button>}
      columns={[["key", "Chave", 80, 160], ["label", "Descrição", 100, 260], ["type", "Tipo", 80, 140], ["required", "Obrigatório", 64, 90], ["options", "Opções da lista", 100, 280], ["actions", "Remover", 72, 72, "actions"]]}
      rows={fields.map((field, index) => ({ id: String(index), label: field.label || `Campo ${index + 1}`,
        values: { key: field.key, label: field.label, type: field.type, required: field.required ? "Sim" : "Não", options: (field.options ?? []).join(separator) },
        cells: {
          key: <input aria-label={`Chave do campo ${index + 1}`} value={field.key} onChange={event => onChange(index, { key: event.target.value })} className={taxDraftInput} />,
          label: <TaxDraftText label={`Descrição do campo ${index + 1}`} value={field.label} maxLength={120} onChange={value => onChange(index, { label: value })} />,
          type: <select aria-label={`Tipo do campo ${index + 1}`} value={field.type} onChange={event => onChange(index, { type: event.target.value as Field["type"] })} className={taxDraftInput}>{[["TEXT", "Texto"], ["NUMBER", "Número"], ["DATE", "Data"], ["BOOLEAN", "Sim / não"], ["LIST", "Lista"]].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>,
          required: <input type="checkbox" aria-label={`Campo ${index + 1} obrigatório`} checked={field.required} onChange={event => onChange(index, { required: event.target.checked })} />,
          options: field.type === "LIST" ? <TaxDraftText label={`Opções do campo ${index + 1}${separator === "\n" ? " — uma por linha" : " — separadas por ponto e vírgula"}`} value={(field.options ?? []).join(separator)} onChange={value => onChange(index, { options: value.split(separator) })} /> : "Não aplicável",
        },
        actions: <button type="button" onClick={() => onRemove(index)} aria-label={`Remover campo ${index + 1}`} className="h-6 rounded border px-1 text-[13px]">Remover</button>,
      }))} />
  </OperationalTablePanel>;
}
