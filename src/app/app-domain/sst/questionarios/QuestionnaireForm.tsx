"use client";

import { useState } from "react";
import { SstForm } from "../SstForm";
import { saveSstQuestionnaire } from "./actions";
import { questionKinds, questionnaireQuestions, type Question } from "@/lib/sst/questionnaire-policy";
import { SstTablePanel } from "../_components/SstTablePanel";
import { sstColumn } from "../_components/operational-columns";
import type { ClinicalDiscipline } from "@/lib/sst/clinical-policy";

const field = "w-full min-w-0 rounded border p-2";
export function QuestionnaireForm({ budgetUnitId, discipline = "MEDICINE" }: { budgetUnitId: string; discipline?: ClinicalDiscipline }) {
  const [questions, setQuestions] = useState<Question[]>([{ key: "queixa", label: "Queixa principal", section: "História clínica", kind: "TEXT", required: true, choices: [] }]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const index = Math.min(selectedIndex, questions.length - 1), question = questions[index];
  const update = (index: number, patch: Partial<Question>) => setQuestions((current) => current.map((question, i) => i === index ? { ...question, ...patch } : question));
  return <SstForm action={async form => { const parsed = questionnaireQuestions.safeParse(questions.map(item => ({ ...item, choices: item.choices.map(choice => choice.trim()).filter(Boolean) }))); return parsed.success ? saveSstQuestionnaire(form) : { error: parsed.error.issues[0]?.message || "Confira todas as questões." }; }} redirectBase="/sst/questionarios" label="Registrar versão do questionário">
    <input type="hidden" name="discipline" value={discipline}/>
    <input type="hidden" name="budgetUnitId" value={budgetUnitId}/><input type="hidden" name="questions" value={JSON.stringify(questions.map((question) => ({ ...question, choices: question.choices.map((choice) => choice.trim()).filter(Boolean) })))}/>
    <label>Código (reutilizar cria nova versão)<input name="code" required maxLength={40} className={field}/></label>
    <label>Título<input name="title" required minLength={2} maxLength={200} className={field}/></label>
    <SstTablePanel title="Questões da versão" preferenceId="sst-questionario-questoes-edicao" description="Todas as questões permanecem no pai e no JSON enviado. Selecione uma linha e feche para editar."
      columns={[sstColumn("key", "Chave", 150, 90, "identifier"), sstColumn("section", "Seção", 180, 100), sstColumn("label", "Enunciado", 280, 140), sstColumn("kind", "Tipo", 140, 90), sstColumn("choices", "Opções", 220, 110), sstColumn("required", "Obrigatória", 110, 85), sstColumn("actions", "Ações", 145, 135, "actions")]}
      rows={questions.map((item, position) => ({ id: String(position), label: item.label || `Questão ${position + 1}`, values: { key: item.key, section: item.section, label: item.label, kind: questionKinds[item.kind], choices: item.choices.join("\n"), required: item.required ? "Sim" : "Não" }, actions: <><button type="button" onClick={() => setSelectedIndex(position)}>Editar</button> <button type="button" disabled={questions.length <= 1} onClick={() => setQuestions(current => current.filter((_, i) => i !== position))}>Remover</button></> }))} />
    {question && <fieldset className="grid gap-3 rounded border p-3 sm:grid-cols-2"><legend>Questão {index + 1}</legend>
      <label>Chave estável<input value={question.key} required pattern="[a-z][a-z0-9_]*" maxLength={40} className={field} onChange={(event) => update(index, { key: event.target.value })}/></label>
      <label>Seção<input value={question.section} maxLength={150} className={field} onChange={(event) => update(index, { section: event.target.value })}/></label>
      <label>Enunciado<input value={question.label} required minLength={2} maxLength={300} className={field} onChange={(event) => update(index, { label: event.target.value })}/></label>
      <label>Tipo<select value={question.kind} className={field} onChange={(event) => update(index, { kind: event.target.value as Question["kind"], choices: [] })}>{Object.entries(questionKinds).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
      {["SINGLE_CHOICE", "MULTIPLE_CHOICE"].includes(question.kind) && <label>Opções (uma por linha)<textarea value={question.choices.join("\n")} required rows={4} className={field} onChange={(event) => update(index, { choices: event.target.value.split("\n") })}/></label>}
      <label className="flex items-center gap-2"><input type="checkbox" checked={question.required} onChange={(event) => update(index, { required: event.target.checked })}/>Obrigatória</label>
      <button type="button" disabled={questions.length <= 1} className="w-fit rounded border px-3 py-1 disabled:opacity-50" onClick={() => setQuestions((current) => current.filter((_, i) => i !== index))}>Remover questão</button>
    </fieldset>}
    <button type="button" disabled={questions.length >= 100} className="w-fit rounded border p-2" onClick={() => setQuestions((current) => [...current, { key: "", label: "", section: "Geral", kind: "TEXT", required: false, choices: [] }])}>Adicionar questão</button>
  </SstForm>;
}
