"use client";

import { useState } from "react";
import { z } from "zod";
import { formatQuestionnaireAnswer, questionKinds, validateQuestionnaireAnswers, type Answer, type Question } from "@/lib/sst/questionnaire-policy";
import { SstTablePanel } from "./SstTablePanel";
import { sstColumn } from "./operational-columns";

export function questionnaireAnswersError(questions: Question[], answers: Record<string, unknown>) {
  try { validateQuestionnaireAnswers(questions, answers); return null; }
  catch (error) { return error instanceof z.ZodError ? error.issues[0]?.message || "Confira as respostas." : error instanceof Error ? error.message : "Confira as respostas."; }
}

/** Only one editor is displayed; every answer remains owned by the form. */
export function QuestionnaireAnswersEditor({ questions, answers, onAnswerAction, preferenceId, title = "Respostas do questionário" }: {
  questions: Question[]; answers: Record<string, unknown>; onAnswerAction: (key: string, value: Answer) => void; preferenceId: string; title?: string;
}) {
  const [selectedKey, setSelectedKey] = useState(questions[0]?.key || "");
  const question = questions.find(item => item.key === selectedKey) || questions[0];
  const value = question ? answers[question.key] : null;
  const field = "block w-full min-w-0 rounded border p-2";
  return <section className="space-y-3">
    <SstTablePanel title={title} triggerLabel="Consultar e selecionar perguntas em tela cheia" description="As respostas de todas as páginas permanecem no formulário. Selecione e feche a consulta para responder ou revisar." preferenceId={preferenceId}
      columns={[sstColumn("section", "Seção", 160, 90), sstColumn("label", "Pergunta", 300, 140), sstColumn("kind", "Tipo", 140, 90), sstColumn("required", "Obrigatória", 110, 85), sstColumn("answer", "Resposta", 300, 130), sstColumn("actions", "Editar", 100, 90, "actions")]}
      rows={questions.map(item => ({ id: item.key, label: item.label, values: { section: item.section || "Geral", label: item.label, kind: questionKinds[item.kind], required: item.required ? "Sim" : "Não", answer: formatQuestionnaireAnswer(answers[item.key]) }, actions: <button type="button" onClick={() => setSelectedKey(item.key)} aria-pressed={question?.key === item.key}>Responder</button> }))} />
    {question && <fieldset className="space-y-2 rounded border p-3"><legend>{question.section || "Geral"} · {question.label}{question.required ? " *" : ""}</legend>
      {question.kind === "TEXT" && <textarea aria-label={question.label} maxLength={10000} value={String(value ?? "")} onChange={event => onAnswerAction(question.key, event.target.value)} rows={3} className={field} />}
      {(question.kind === "NUMBER" || question.kind === "DATE") && <input aria-label={question.label} type={question.kind === "NUMBER" ? "number" : "date"} step="any" min={question.kind === "NUMBER" ? -1e12 : undefined} max={question.kind === "NUMBER" ? 1e12 : undefined} value={value == null ? "" : String(value)} onChange={event => onAnswerAction(question.key, question.kind === "NUMBER" ? event.target.value === "" ? null : Number(event.target.value) : event.target.value)} className={field} />}
      {question.kind === "BOOLEAN" && <select aria-label={question.label} value={value == null ? "" : String(value)} onChange={event => onAnswerAction(question.key, event.target.value === "" ? null : event.target.value === "true")} className={field}><option value="">Não informado</option><option value="true">Sim</option><option value="false">Não</option></select>}
      {question.kind === "SINGLE_CHOICE" && <select aria-label={question.label} value={String(value ?? "")} onChange={event => onAnswerAction(question.key, event.target.value)} className={field}><option value="">Selecione</option>{question.choices.map(choice => <option key={choice}>{choice}</option>)}</select>}
      {question.kind === "MULTIPLE_CHOICE" && <select multiple aria-label={question.label} value={Array.isArray(value) ? value as string[] : []} onChange={event => onAnswerAction(question.key, Array.from(event.target.selectedOptions, option => option.value))} className={field}>{question.choices.map(choice => <option key={choice}>{choice}</option>)}</select>}
    </fieldset>}
  </section>;
}
