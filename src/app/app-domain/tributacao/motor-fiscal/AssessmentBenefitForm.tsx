"use client";

import { useState, useTransition } from "react";
import { grantAssessmentBenefitAction } from "../operacoes/actions";

type Option = { id: string; label: string };

export function AssessmentBenefitForm({ rules, assessments, documents }: { rules: Option[]; assessments: Array<Option & { balance: number }>; documents: Option[] }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  return <details className="shrink-0 rounded-md border border-slate-200 bg-white p-2.5">
    <summary className="cursor-pointer text-xs font-bold text-slate-700">Concessão de benefício tributário</summary>
    <form className="mt-2 grid gap-2 sm:grid-cols-3" action={(form) => {
      const assessment = assessments.find((item) => item.id === String(form.get("assessmentId")));
      if (!assessment) { setMessage("Selecione o lançamento."); return; }
      startTransition(async () => {
        const result = await grantAssessmentBenefitAction({ assessmentId: assessment.id, ruleId: String(form.get("ruleId")), originalAmount: assessment.balance, reason: String(form.get("reason")), documentId: String(form.get("documentId") || "") || undefined });
        setMessage(result.error ?? "Benefício concedido com baixa do débito e memória da decisão.");
      });
    }}>
      <select aria-label="Lançamento do benefício" name="assessmentId" required className="h-8 rounded border px-2 text-xs"><option value="">Lançamento e saldo disponível</option>{assessments.map((item) => <option key={item.id} value={item.id}>{item.label} · {item.balance.toFixed(2)}</option>)}</select>
      <select aria-label="Regra do benefício" name="ruleId" required className="h-8 rounded border px-2 text-xs"><option value="">Regra vigente e fundamento legal</option>{rules.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
      <select aria-label="Documento da decisão" name="documentId" className="h-8 rounded border px-2 text-xs"><option value="">Documento GED da decisão</option>{documents.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
      <input aria-label="Fundamento da concessão" name="reason" required minLength={10} maxLength={2000} placeholder="Fundamento da decisão" className="h-8 rounded border px-2 text-xs sm:col-span-2" />
      <button disabled={pending || !rules.length || !assessments.length} className="h-8 rounded bg-slate-700 px-3 text-xs font-semibold text-white disabled:opacity-50">Conceder benefício</button>
    </form>
    {message && <p role="status" className="mt-2 text-xs">{message}</p>}
  </details>;
}
