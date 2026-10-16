"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveRecruitmentNoticeAction, decideRecruitmentApplicationAction } from "./actions";

type Values = { id: string; name: string; code: string; ruleSetId: string; isActive: boolean; value: unknown };
export function RecruitmentNoticeForm({ values, ruleSets }: { values?: Values; ruleSets: { id: string; name: string }[] }) {
  const router = useRouter(), [pending, startTransition] = useTransition(), [error, setError] = useState("");
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget); setError("");
    startTransition(async () => { try { const result = await saveRecruitmentNoticeAction({ id: values?.id, ruleSetId: String(data.get("ruleSetId")), code: String(data.get("code")), name: String(data.get("name")), isActive: data.get("isActive") === "on", value: JSON.parse(String(data.get("value"))) }); if (result.error) setError(result.error); else { router.push("/rh/concursos"); router.refresh(); } } catch { setError("Confira a estrutura da configuração do edital."); } });
  }
  return <form onSubmit={submit} className="space-y-3 rounded border bg-white p-4 text-xs"><fieldset disabled={pending} className="grid gap-3 sm:grid-cols-2"><label className="flex flex-col gap-1">Configuração RH<select name="ruleSetId" defaultValue={values?.ruleSetId} required className="h-9 rounded border px-2">{ruleSets.map(set => <option key={set.id} value={set.id}>{set.name}</option>)}</select></label><label className="flex flex-col gap-1">Código<input name="code" defaultValue={values?.code || "PORTAL_EDITAL_"} readOnly={Boolean(values)} required className="h-9 rounded border px-2" /></label><label className="flex flex-col gap-1 sm:col-span-2">Nome<input name="name" defaultValue={values?.name} required minLength={3} className="h-9 rounded border px-2" /></label><label className="flex flex-col gap-1 sm:col-span-2">Configuração do edital (JSON)<textarea name="value" required rows={16} className="rounded border p-2 font-mono" defaultValue={JSON.stringify(values?.value || { origin: "EDITAL_RECRUTAMENTO", kind: "PSS", number: "", budgetUnitId: "", documentVersionId: "", instructions: "", startsAt: "", endsAt: "", roles: [], acceptance: "" }, null, 2)} /></label><p className="sm:col-span-2">Use versão GED institucional, datas ISO com fuso e cargos com code, name e requirements. Retificação de edital com inscrições requer novo código para preservar o histórico.</p><label className="flex items-center gap-2"><input name="isActive" type="checkbox" defaultChecked={values?.isActive} />Publicar edital</label></fieldset>{error && <p role="alert" className="text-red-700">{error}</p>}<button disabled={pending} className="rounded bg-emerald-800 px-4 py-2 font-semibold text-white">{pending ? "Salvando…" : "Salvar edital"}</button></form>;
}
export function RecruitmentDecisionForm({ id }: { id: string }) {
  const [pending, startTransition] = useTransition(), [error, setError] = useState("");
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget); setError("");
    startTransition(async () => { try { const result = await decideRecruitmentApplicationAction({ id, status: String(data.get("status")), decision: String(data.get("decision")) }); setError(result.error); } catch { setError("Não foi possível decidir a inscrição."); } });
  }
  return <form onSubmit={submit} className="space-y-2"><fieldset disabled={pending} className="flex flex-wrap gap-2"><select name="status" aria-label="Resultado da análise" className="rounded border px-2"><option value="DEFERIDA">Deferir inscrição</option><option value="INDEFERIDA">Indeferir inscrição</option></select><input name="decision" required minLength={10} maxLength={4000} aria-label="Fundamento da decisão" placeholder="Fundamento da decisão" className="min-w-0 flex-1 rounded border p-2" /><button className="rounded border px-3 font-semibold">{pending ? "Registrando…" : "Registrar análise"}</button></fieldset>{error && <p role="alert" className="text-red-700">{error}</p>}</form>;
}
