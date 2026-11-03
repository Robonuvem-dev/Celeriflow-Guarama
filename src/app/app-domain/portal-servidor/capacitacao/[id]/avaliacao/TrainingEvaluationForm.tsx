"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { RhTablePanel } from "@/app/app-domain/rh/_components/RhTablePanel";
import { rhColumn } from "@/app/app-domain/rh/_components/operational-columns";
import { submitMyTrainingEvaluation } from "../../actions";

export function TrainingEvaluationForm({ requestId, questions }: { requestId: string; questions: { code: string; label: string; min: number; max: number; weight: number }[] }) {
  const [answers, setAnswers] = useState<Record<string, string>>({}), [comment, setComment] = useState(""), [error, setError] = useState(""), [pending, setPending] = useState(false);
  const router = useRouter();
  async function submit() {
    const missing = questions.find(question => answers[question.code] === undefined || answers[question.code] === "");
    if (missing) { setError(`Responda o critério: ${missing.label}`); return; }
    setPending(true); setError("");
    try {
      const result = await submitMyTrainingEvaluation({ requestId, answers: Object.fromEntries(Object.entries(answers).map(([code, value]) => [code, Number(value)])), comment });
      if (result.error) setError(result.error); else router.refresh();
    } catch { setError("Falha de comunicação. Suas respostas foram preservadas."); }
    finally { setPending(false); }
  }
  return <form action={submit} className="grid gap-3"><RhTablePanel title="Critérios de avaliação" preferenceId="portal-questionario-treinamento" columns={[rhColumn("question", "Critério", 400, 160), rhColumn("scale", "Escala e peso", 170, 100), rhColumn("answer", "Resposta", 150, 90)]} rows={questions.map(question => ({ id: question.code, label: question.label, values: { question: question.label, scale: `${question.min} a ${question.max}; peso ${question.weight}`, answer: answers[question.code] ?? "" }, cells: { answer: <input aria-label={`Resposta: ${question.label}`} type="number" min={question.min} max={question.max} step="any" value={answers[question.code] ?? ""} disabled={pending} onChange={event => setAnswers(current => ({ ...current, [question.code]: event.target.value }))} className="w-full rounded border px-2" /> } }))} /><label>Conclusão / observações<textarea maxLength={4000} value={comment} onChange={event => setComment(event.target.value)} disabled={pending} className="block w-full rounded border p-2" /></label>{error && <p role="alert">{error}</p>}<button disabled={pending} className="w-fit rounded bg-blue-700 px-3 py-2 text-white">{pending ? "Enviando…" : "Enviar avaliação do programa"}</button></form>;
}
