"use client";

import { useState } from "react";
import type { ControlChecklistGroup } from "@/lib/c7/control-checklists";
import { publishControlChecklistAction, answerControlChecklistAction, runControlChecklistDiagnosticsAction } from "./actions";
import { controlChecklistCatalog } from "@/lib/c7/checklist-catalog";
import { ChecklistGroupsEditor } from "./ChecklistGroupsEditor";
import { checklistDraftError } from "./checklist-drafts";

type Edition = { id: string; planId: string; title: string; category: string; groups: ControlChecklistGroup[] };
export function ControlChecklistsClient({ plans, editions }: { plans: Array<{ id: string; title: string; status: string }>; editions: Edition[] }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [category, setCategory] = useState("");
  const [draft, setDraft] = useState({ planId: "", title: "", category: "", lines: "" });
  const [answer, setAnswer] = useState({ checklistId: "", number: 0, response: "", reason: "" });
  const [selectedItems, setSelectedItems] = useState<number[]>([]);
  const [copyId, setCopyId] = useState("");
  const [groups, setGroups] = useState<ControlChecklistGroup[]>([]);
  const [provenance, setProvenance] = useState<{ copiedFromId?: string; selectedSourceNumbers?: number[] }>({});
  const copy = editions.find(edition => edition.id === copyId);
  const selected = editions.find(edition => edition.id === answer.checklistId);
  const group = selected?.groups.find(group => group.items.some(item => item.number === answer.number));
  const run = async (operation: () => Promise<{ error?: string }>) => {
    setPending(true); setError("");
    try { const result = await operation(); if (result.error) setError(result.error); }
    catch { setError("Não foi possível concluir a operação. Tente novamente."); }
    finally { setPending(false); }
  };
  return <section className="space-y-4 p-8">
    <h2 className="text-xl font-semibold">Checklists de auditoria por categoria</h2>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <form className="grid gap-3 rounded border p-5" onSubmit={event => { event.preventDefault(); const error = checklistDraftError(groups); if (error) { setError(error); return; } void run(() => publishControlChecklistAction({ ...draft, groups, ...provenance })); }}>
      <h3 className="font-semibold">Publicar edição numerada</h3>
      <select aria-label="Checklist padrão" className="rounded border p-2" defaultValue="" onChange={event => { const template = controlChecklistCatalog.find(item => item.code === event.target.value); if (template) { setDraft({ ...draft, title: template.title, category: template.category, lines: "" }); setGroups(structuredClone(template.groups)); setProvenance({}); } }}><option value="">Carregar checklist padrão editável</option>{controlChecklistCatalog.map(template => <option key={template.code} value={template.code}>{template.title}</option>)}</select>
      <div className="grid gap-2 rounded border p-3">
        <h4 className="font-medium">Duplicar edição / selecionar itens para nova auditoria</h4>
        <select aria-label="Edição original" className="rounded border p-2" value={copyId} onChange={event => { setCopyId(event.target.value); setSelectedItems(editions.find(edition => edition.id === event.target.value)?.groups.flatMap(group => group.items.map(item => item.number)) ?? []); }}><option value="">Edição original autorizada</option>{editions.map(edition => <option key={edition.id} value={edition.id}>{edition.title} — {edition.category}</option>)}</select>
        {copy?.groups.flatMap(group => group.items.map(item => <label key={item.number} className="flex gap-2 text-sm"><input type="checkbox" checked={selectedItems.includes(item.number)} onChange={event => setSelectedItems(event.target.checked ? [...selectedItems, item.number] : selectedItems.filter(number => number !== item.number))} />{group.name} · {item.number}. {item.question}</label>))}
        <button type="button" disabled={!copy || !selectedItems.length || pending} className="rounded border p-2" onClick={() => { if (copy) { setDraft({ ...draft, title: `${copy.title} — nova edição`, category: copy.category, lines: "" }); setGroups(structuredClone(copy.groups.map(group => ({ ...group, items: group.items.filter(item => selectedItems.includes(item.number)) })).filter(group => group.items.length))); setProvenance({ copiedFromId: copy.id, selectedSourceNumbers: [...selectedItems] }); } }}>Copiar itens selecionados para edição</button>
      </div>
      <select required className="rounded border p-2" value={draft.planId} onChange={event => setDraft({ ...draft, planId: event.target.value })}><option value="">Plano aberto</option>{plans.filter(plan => plan.status === "ABERTO").map(plan => <option key={plan.id} value={plan.id}>{plan.title}</option>)}</select>
      <input required className="rounded border p-2" placeholder="Título" value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} />
      <input required className="rounded border p-2" placeholder="Categoria" value={draft.category} onChange={event => setDraft({ ...draft, category: event.target.value })} />
      <ChecklistGroupsEditor groups={groups} onChange={setGroups} />
      {provenance.copiedFromId && <p className="text-sm">Origem da cópia: {provenance.copiedFromId}; itens selecionados: {provenance.selectedSourceNumbers?.join(", ")}.</p>}
      <p className="text-sm text-muted-foreground">As edições e respostas são preservadas. Uma resposta irregular abre um apontamento para parecer e regularização.</p>
      <button disabled={pending} className="rounded bg-emerald-700 p-2 text-white">Publicar checklist</button>
    </form>
    <input className="rounded border p-2" aria-label="Filtrar categoria dos checklists" placeholder="Pesquisar categoria" value={category} onChange={event => setCategory(event.target.value)} />
    {editions.filter(edition => edition.category.toLocaleLowerCase("pt-BR").includes(category.toLocaleLowerCase("pt-BR"))).map(edition => <article key={edition.id} className="rounded border p-4"><h3 className="font-semibold">{edition.title} — {edition.category}</h3>{edition.groups.map(group => <div key={group.name} className="mt-2"><h4 className="font-medium">{group.name}</h4><ul>{group.items.map(item => <li key={item.number}>{item.number}. {item.question}{item.diagnosticRule ? " · diagnóstico automático" : ""}</li>)}</ul><p className="text-sm text-muted-foreground">Respostas: {group.responses.join(" / ")}; irregular: {group.irregularResponse}</p></div>)}{edition.groups.some(group => group.items.some(item => item.diagnosticRule)) && <button disabled={pending} className="mt-3 rounded border p-2" onClick={() => void run(() => runControlChecklistDiagnosticsAction(edition.id))}>Executar diagnóstico financeiro</button>}</article>)}
    <form className="grid gap-3 rounded border p-5" onSubmit={event => { event.preventDefault(); void run(() => answerControlChecklistAction(answer)); }}>
      <h3 className="font-semibold">Registrar avaliação fundamentada</h3>
      <select required className="rounded border p-2" value={answer.checklistId} onChange={event => setAnswer({ checklistId: event.target.value, number: 0, response: "", reason: "" })}><option value="">Checklist publicado de plano aberto</option>{editions.filter(edition => plans.some(plan => plan.id === edition.planId && plan.status === "ABERTO")).map(edition => <option key={edition.id} value={edition.id}>{edition.title} — {edition.category}</option>)}</select>
      <select required className="rounded border p-2" value={answer.number || ""} onChange={event => setAnswer({ ...answer, number: Number(event.target.value), response: "" })}><option value="">Item manual</option>{selected?.groups.flatMap(group => group.items.filter(item => !item.diagnosticRule).map(item => <option key={item.number} value={item.number}>{group.name} — {item.number}. {item.question}</option>))}</select>
      <select required className="rounded border p-2" value={answer.response} onChange={event => setAnswer({ ...answer, response: event.target.value })}><option value="">Resposta</option>{group?.responses.map(response => <option key={response} value={response}>{response}</option>)}</select>
      <textarea required className="rounded border p-2" placeholder="Fundamento e evidências da avaliação" value={answer.reason} onChange={event => setAnswer({ ...answer, reason: event.target.value })} />
      <button disabled={pending} className="rounded bg-emerald-700 p-2 text-white">Registrar resposta</button>
    </form>
  </section>;
}
