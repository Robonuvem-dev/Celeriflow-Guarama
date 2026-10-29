"use client";
import { useState } from "react";
import { SstForm } from "../../../SstForm";
import { saveSstAnamnesis } from "../../../questionarios/actions";
import type { Answer, Question } from "@/lib/sst/questionnaire-policy";
import { QuestionnaireAnswersEditor, questionnaireAnswersError } from "../../../_components/QuestionnaireAnswersEditor";

export function AnamnesisForm({ asoId, questionnaireVersionId, questions, needsReason }: { asoId: string; questionnaireVersionId: string; questions: Question[]; needsReason: boolean }) {
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const set = (key: string, value: Answer) => setAnswers((current) => ({ ...current, [key]: value }));
  const field = "w-full min-w-0 rounded border p-2";
  return <SstForm action={async form => { const error = questionnaireAnswersError(questions, answers); return error ? { error } : saveSstAnamnesis(form); }} label="Registrar revisão da anamnese" redirectBase="/sst/anamneses"><input type="hidden" name="asoId" value={asoId}/><input type="hidden" name="questionnaireVersionId" value={questionnaireVersionId}/><input type="hidden" name="answers" value={JSON.stringify(answers)}/>
    <p>Registro complementar vinculado ao ASO. Cada nova revisão preserva as anteriores e exige justificativa.</p>
    <QuestionnaireAnswersEditor questions={questions} answers={answers} onAnswerAction={set} preferenceId="sst-anamnese-respostas-edicao" />
    <label>Justificativa da revisão<textarea name="revisionReason" required={needsReason} minLength={needsReason ? 10 : undefined} maxLength={2000} rows={3} className={field}/></label>
  </SstForm>;
}
