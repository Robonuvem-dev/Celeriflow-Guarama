"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { submitMyEvaluation, submitAssignedEvaluation } from "../capacitacao/actions";

export function EvaluationForm({ cycleId, requestId, questions }: { cycleId: string; requestId?: string; questions: { code: string; label: string; min: number; max: number; weight: number }[] }) {
  const router = useRouter(); const [pending, setPending] = useState(false), [error, setError] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget); setPending(true); setError("");
    const answers = Object.fromEntries(questions.map(question => [question.code, Number(data.get(question.code))])), comment = String(data.get("comment") || "");
    try { const result = requestId ? await submitAssignedEvaluation({ requestId, answers, comment }) : await submitMyEvaluation({ cycleId, answers, comment }); if (result.error) setError(result.error); else router.refresh(); }
    catch { setError("Não foi possível enviar a avaliação."); }
    finally { setPending(false); }
  }
  return <form onSubmit={submit} className="mt-3 grid gap-3 rounded border border-slate-300 bg-slate-50 p-3 text-xs">{questions.map(question => <label key={question.code} className="grid gap-1 font-semibold">{question.label}<span className="font-normal text-slate-500">Escala {question.min} a {question.max} · peso {question.weight}</span><input name={question.code} type="number" required min={question.min} max={question.max} step="any" disabled={pending} className="h-8 rounded border bg-white px-2 font-normal" /></label>)}<label className="grid gap-1">Observações<textarea name="comment" required={Boolean(requestId)} minLength={requestId ? 5 : undefined} maxLength={4000} rows={3} disabled={pending} className="rounded border bg-white p-2" /></label>{error && <p role="alert" className="text-red-700">{error}</p>}<Button disabled={pending} className="w-fit">{pending ? "Enviando…" : requestId ? "Registrar avaliação da comissão" : "Enviar autoavaliação"}</Button></form>;
}
