"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveCareerPolicyAction, completeFunctionalCourseAction, publishFunctionalEvaluationResultAction } from "./actions";

type ActivityValues = { id: string; ruleSetId: string; code: string; name: string; isActive: boolean; value: unknown };
const control = "rounded border border-slate-300 bg-white p-2 text-sm";

export function CareerPolicyForm({ values, ruleSets }: { values?: ActivityValues; ruleSets: { id: string; name: string }[] }) {
  const router = useRouter(), [pending, startTransition] = useTransition(), [error, setError] = useState("");
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setError("");
    startTransition(async () => {
      try {
        const result = await saveCareerPolicyAction({ id: values?.id, ruleSetId: String(data.get("ruleSetId")), code: String(data.get("code")), name: String(data.get("name")), isActive: data.get("isActive") === "on", value: JSON.parse(String(data.get("value"))) });
        if (result.error) { setError(result.error); return; }
        router.push("/rh/atividades-funcionais");
        router.refresh();
      } catch { setError("Confira a estrutura da política da atividade."); }
    });
  }
  return <form onSubmit={submit} className="space-y-3 rounded border border-slate-300 bg-white p-4">
    <fieldset disabled={pending} className="grid gap-3 sm:grid-cols-2">
      <label className="flex flex-col gap-1 text-xs">Configuração RH<select name="ruleSetId" required disabled={Boolean(values)} defaultValue={values?.ruleSetId} className={control}>{ruleSets.map(set => <option key={set.id} value={set.id}>{set.name}</option>)}</select>{values && <input type="hidden" name="ruleSetId" value={values.ruleSetId} />}</label>
      <label className="flex flex-col gap-1 text-xs">Código estável<input name="code" required readOnly={Boolean(values)} defaultValue={values?.code} placeholder="PORTAL_CURSO_ ou PORTAL_AVALIACAO_" pattern="PORTAL_(CURSO|AVALIACAO)_[A-Z0-9_]{1,45}" className={control} /></label>
      <label className="flex flex-col gap-1 text-xs sm:col-span-2">Nome<input name="name" required minLength={3} maxLength={160} defaultValue={values?.name} className={control} /></label>
      <label className="flex flex-col gap-1 text-xs sm:col-span-2">Política da atividade (JSON)<textarea name="value" required rows={18} defaultValue={JSON.stringify(values?.value || {}, null, 2)} className={`${control} font-mono text-xs`} /></label>
      <p className="text-xs text-slate-600 sm:col-span-2">Cursos: origin CAPACITACAO_FUNCIONAL, budgetUnitId, employeeIds, enrollmentStartsAt, enrollmentEndsAt, startsAt, endsAt, capacity, hours, minAttendancePercentage, location, issuerName e instructions. Avaliações: origin AVALIACAO_FUNCIONAL, budgetUnitId, kind (DESEMPENHO ou ESTAGIO_PROBATORIO), employeeIds, commissionUserIds, startsAt, endsAt, instructions, legalReference e questions (code, label, min, max, weight). Use datas ISO com fuso e os IDs dos cadastros oficiais.</p>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isActive" defaultChecked={values?.isActive} />Atividade disponível</label>
    </fieldset>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <button disabled={pending} className="rounded bg-emerald-800 px-4 py-2 text-sm font-semibold text-white">{pending ? "Salvando…" : "Salvar atividade"}</button>
  </form>;
}

export function CourseCompletionForm({ requestId }: { requestId: string }) {
  const [pending, startTransition] = useTransition(), [error, setError] = useState("");
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setError("");
    startTransition(async () => {
      try {
        const result = await completeFunctionalCourseAction({ requestId, attendancePercentage: Number(data.get("attendancePercentage")), approved: data.get("approved") === "on", evidenceReference: String(data.get("evidenceReference")) });
        setError(result.error);
      } catch { setError("Não foi possível reconhecer a conclusão."); }
    });
  }
  return <form onSubmit={submit} className="space-y-2">
    <fieldset disabled={pending} className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1 text-xs">Presença (%)<input name="attendancePercentage" type="number" min={0} max={100} step="0.01" required className={`${control} w-24`} /></label>
      <label className="flex flex-1 flex-col gap-1 text-xs">Referência da evidência<input name="evidenceReference" required minLength={5} maxLength={2000} className={control} /></label>
      <label className="flex items-center gap-1 text-xs"><input name="approved" type="checkbox" required />Conclusão aprovada</label>
      <button className="rounded border border-emerald-800 px-3 py-2 text-xs font-semibold text-emerald-800">{pending ? "Registrando…" : "Reconhecer conclusão"}</button>
    </fieldset>
    {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
  </form>;
}

export function EvaluationPublicationForm({ requestId }: { requestId: string }) {
  const [pending, startTransition] = useTransition(), [error, setError] = useState("");
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget); setError("");
    startTransition(async () => {
      try {
        const result = await publishFunctionalEvaluationResultAction({ requestId, conclusion: String(data.get("conclusion")), evidenceReference: String(data.get("evidenceReference")), releaseAt: new Date(String(data.get("releaseAt"))).toISOString() });
        setError(result.error);
      } catch { setError("Não foi possível publicar o resultado."); }
    });
  }
  return <form onSubmit={submit} className="space-y-2"><fieldset disabled={pending} className="grid gap-2 sm:grid-cols-2">
    <label className="flex flex-col gap-1 text-xs sm:col-span-2">Conclusão administrativa<textarea name="conclusion" required minLength={10} maxLength={4000} className={control} /></label>
    <label className="flex flex-col gap-1 text-xs">Referência da decisão/documento<input name="evidenceReference" required minLength={5} maxLength={2000} className={control} /></label>
    <label className="flex flex-col gap-1 text-xs">Disponibilizar em (horário local)<input name="releaseAt" type="datetime-local" required className={control} /></label>
    <button className="rounded bg-emerald-800 px-3 py-2 text-xs font-semibold text-white sm:col-span-2">{pending ? "Publicando…" : "Publicar resultado para o titular"}</button>
  </fieldset>{error && <p role="alert" className="text-xs text-red-700">{error}</p>}</form>;
}
