"use client";

import type { ControlChecklistGroup } from "@/lib/c7/control-checklists";
import FinanceTablePanel from "../financeiro/FinanceTablePanel";
import { financeColumn } from "../financeiro/operational-columns";
import { draftField } from "../financeiro/draft-rows";

export function ChecklistGroupsEditor({ groups, onChange }: { groups: ControlChecklistGroup[]; onChange: (groups: ControlChecklistGroup[]) => void }) {
  function update(index: number, value: ControlChecklistGroup) { onChange(groups.map((group, at) => at === index ? value : group)); }
  const nextNumber = () => Math.max(0, ...groups.flatMap(group => group.items.map(item => item.number))) + 1;
  return <div className="space-y-3">{groups.map((group, index) => <fieldset key={index} className="space-y-3 rounded border p-3"><legend className="px-1 font-medium">Grupo {index + 1}</legend>
    <input required aria-label={`Nome do grupo ${index + 1}`} placeholder="Nome do grupo" className="w-full rounded border p-2" value={group.name} onChange={event => update(index, { ...group, name: event.target.value })} />
    <label className="block text-sm">Respostas possíveis (separadas por ;)<input required className="mt-1 w-full rounded border p-2" value={group.responses.join(";")} onChange={event => update(index, { ...group, responses: event.target.value.split(";") })} /></label>
    <label className="block text-sm">Resposta que abre irregularidade<select required className="ml-2 rounded border p-2" value={group.irregularResponse} onChange={event => update(index, { ...group, irregularResponse: event.target.value })}><option value="">Selecionar</option>{group.responses.map((response, at) => <option key={at} value={response}>{response || "Resposta vazia"}</option>)}</select></label>
    <FinanceTablePanel label={`Itens do grupo ${index + 1}`} description={group.name} preferenceId="controle-checklist-itens-rascunho" searchable={false}
      columns={[financeColumn("number", "Número", 80, 100), financeColumn("question", "Pergunta", 160, 550), financeColumn("diagnostic", "Diagnóstico", 140, 280), financeColumn("actions", "Ações", 110, 110, "actions")]}
      rows={group.items.map((item, at) => ({ id: String(at), label: `Item ${item.number}`, values: { number: String(item.number), question: item.question, diagnostic: item.diagnosticRule ? "Fonte das contas bancárias" : "Avaliação manual" }, cells: {
        number: <input type="number" min={1} aria-label={`Número do item ${at + 1}`} className={draftField} value={item.number} onChange={event => update(index, { ...group, items: group.items.map((row, pos) => pos === at ? { ...row, number: Number(event.target.value) } : row) })} />,
        question: <textarea rows={1} wrap="off" aria-label={`Pergunta do item ${at + 1}`} className={`${draftField} resize-none`} value={item.question} onChange={event => update(index, { ...group, items: group.items.map((row, pos) => pos === at ? { ...row, question: event.target.value } : row) })} />,
        diagnostic: <select aria-label={`Diagnóstico do item ${at + 1}`} className={draftField} value={item.diagnosticRule ?? ""} onChange={event => update(index, { ...group, items: group.items.map((row, pos) => pos === at ? { number: row.number, question: row.question, ...(event.target.value ? { diagnosticRule: "BANK_ACCOUNT_SOURCE" as const } : {}) } : row) })}><option value="">Avaliação manual</option><option value="BANK_ACCOUNT_SOURCE">Fonte das contas bancárias</option></select>,
      }, actions: <button type="button" onClick={() => update(index, { ...group, items: group.items.filter((_, pos) => pos !== at) })}>Remover item</button> }))} />
    <div className="flex gap-2"><button type="button" className="rounded border p-2" onClick={() => update(index, { ...group, items: [...group.items, { number: nextNumber(), question: "" }] })}>Adicionar item</button><button type="button" className="rounded border p-2" onClick={() => onChange(groups.filter((_, at) => at !== index))}>Remover grupo</button></div>
  </fieldset>)}<button type="button" className="rounded border p-2" onClick={() => onChange([...groups, { name: "", responses: ["Regular", "Irregular", "Não avaliado"], irregularResponse: "Irregular", items: [{ number: nextNumber(), question: "" }] }])}>Adicionar grupo</button><p className="text-sm text-muted-foreground">A primeira resposta é a regular para o diagnóstico. Alterações são publicadas em nova edição; as anteriores conservam seus itens e respostas.</p></div>;
}
