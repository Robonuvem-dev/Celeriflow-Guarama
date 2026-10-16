"use client";

import { useState, useTransition } from "react";
import { classifyBenefitReportAction } from "./actions";

export default function BenefitClassificationClient({ rules }: { rules: { id: string; label: string; version: number; classification: string }[] }) {
  const [notice, setNotice] = useState(""); const [pending, startTransition] = useTransition();
  return <details className="rounded border bg-white p-3 print:hidden"><summary className="cursor-pointer text-sm font-semibold">Classificação fiscal dos benefícios no resumo anual</summary>{notice && <p role="status" className="mt-2 text-xs">{notice}</p>}<div className="mt-3 space-y-2">{rules.map(rule => <form key={`${rule.id}:${rule.version}`} action={form => startTransition(async () => { const result = await classifyBenefitReportAction({ ruleId: rule.id, expectedVersion: rule.version, classification: String(form.get("classification")) as "EXEMPTION" | "IMMUNITY" | "OTHER", reason: String(form.get("reason") ?? "") }); setNotice(result.error ?? "Classificação fiscal publicada."); })} className="flex flex-wrap items-center gap-2 border-t pt-2 text-xs"><span>{rule.label}</span><select name="classification" defaultValue={rule.classification} className="rounded border p-2"><option value="OTHER">Outros benefícios</option><option value="EXEMPTION">Isenção</option><option value="IMMUNITY">Imunidade</option></select><input name="reason" required placeholder="Fundamento da classificação" aria-label="Fundamento da classificação" className="rounded border p-2"/><button disabled={pending} className="rounded border p-2">Publicar classificação</button></form>)}</div></details>;
}
