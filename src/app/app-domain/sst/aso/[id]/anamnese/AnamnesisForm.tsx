"use client";
import { useState } from "react";
import { SstForm } from "../../../SstForm";
import { saveSstAnamnesis } from "../../../questionarios/actions";
import type { Answer, Question } from "@/lib/sst/questionnaire-policy";

export function AnamnesisForm({ asoId, questionnaireVersionId, questions, needsReason }: { asoId: string; questionnaireVersionId: string; questions: Question[]; needsReason: boolean }) {
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const set = (key: string, value: Answer) => setAnswers((current) => ({ ...current, [key]: value }));
  const field = "w-full min-w-0 rounded border p-2";
  return <SstForm action={saveSstAnamnesis} label="Registrar revisão da anamnese" redirectBase="/sst/anamneses"><input type="hidden" name="asoId" value={asoId}/><input type="hidden" name="questionnaireVersionId" value={questionnaireVersionId}/><input type="hidden" name="answers" value={JSON.stringify(answers)}/>
    <p>Registro complementar vinculado ao ASO. Cada nova revisão preserva as anteriores e exige justificativa.</p>
    {questions.map((question) => <fieldset key={question.key} className="space-y-2 rounded border p-3"><legend className="px-1">{question.section || "Geral"} · {question.label}{question.required ? " *" : ""}</legend>
      {question.kind === "TEXT" && <textarea aria-label={question.label} required={question.required} rows={3} maxLength={10000} value={String(answers[question.key] || "")} onChange={(event) => set(question.key, event.target.value)} className={field}/>}
      {question.kind === "NUMBER" && <input aria-label={question.label} type="number" step="any" min={-1e12} max={1e12} required={question.required} value={answers[question.key] == null ? "" : String(answers[question.key])} onChange={(event) => set(question.key, event.target.value === "" ? null : Number(event.target.value))} className={field}/>}
      {question.kind === "DATE" && <input aria-label={question.label} type="date" required={question.required} value={String(answers[question.key] || "")} onChange={(event) => set(question.key, event.target.value)} className={field}/>}
      {question.kind === "BOOLEAN" && <select aria-label={question.label} required={question.required} value={answers[question.key] == null ? "" : String(answers[question.key])} onChange={(event) => set(question.key, event.target.value === "" ? null : event.target.value === "true")} className={field}><option value="">Não informado</option><option value="true">Sim</option><option value="false">Não</option></select>}
      {question.kind === "SINGLE_CHOICE" && <select aria-label={question.label} required={question.required} value={String(answers[question.key] || "")} onChange={(event) => set(question.key, event.target.value)} className={field}><option value="">Selecione</option>{question.choices.map((choice) => <option key={choice} value={choice}>{choice}</option>)}</select>}
      {question.kind === "MULTIPLE_CHOICE" && question.choices.map((choice) => { const selected = Array.isArray(answers[question.key]) ? answers[question.key] as string[] : []; return <label key={choice} className="mr-3 inline-flex items-center gap-2"><input type="checkbox" checked={selected.includes(choice)} onChange={(event) => set(question.key, event.target.checked ? [...selected, choice] : selected.filter((item) => item !== choice))}/>{choice}</label>; })}
    </fieldset>)}
    <label>Justificativa da revisão<textarea name="revisionReason" required={needsReason} minLength={needsReason ? 10 : undefined} maxLength={2000} rows={3} className={field}/></label>
  </SstForm>;
}
