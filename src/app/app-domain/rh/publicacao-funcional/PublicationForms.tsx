"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { publishPayrollByFunctionalPolicyAction, revokeFunctionalStatementAction, savePayrollPublicationPolicyAction } from "./actions";

type PolicyValues = { id: string; ruleSetId: string; code: string; name: string; isActive: boolean; value: unknown };
type Option = { id: string; name: string };
const control = "rounded border border-slate-300 bg-white p-2 text-sm";

export function PayrollPolicyForm({ values, ruleSets }: { values?: PolicyValues; ruleSets: Option[] }) {
  const router = useRouter(), [pending, startTransition] = useTransition(), [error, setError] = useState("");
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget); setError("");
    startTransition(async () => {
      try {
        const result = await savePayrollPublicationPolicyAction({ id: values?.id, ruleSetId: String(data.get("ruleSetId")), code: String(data.get("code")), name: String(data.get("name")), isActive: data.get("isActive") === "on", value: JSON.parse(String(data.get("value"))) });
        if (result.error) { setError(result.error); return; }
        router.push("/rh/publicacao-funcional"); router.refresh();
      } catch { setError("Confira a estrutura da política de disponibilização."); }
    });
  }
  return <form onSubmit={submit} className="space-y-3 rounded border border-slate-300 bg-white p-4">
    <fieldset disabled={pending} className="grid gap-3 sm:grid-cols-2">
      <label className="flex flex-col gap-1 text-xs">Configuração RH<select name="ruleSetId" required defaultValue={values?.ruleSetId} className={control}>{ruleSets.map(set => <option key={set.id} value={set.id}>{set.name}</option>)}</select></label>
      <label className="flex flex-col gap-1 text-xs">Código<input name="code" required readOnly={Boolean(values)} defaultValue={values?.code} pattern="PORTAL_FOLHA_[A-Z0-9_]{1,45}" placeholder="PORTAL_FOLHA_" className={control} /></label>
      <label className="flex flex-col gap-1 text-xs sm:col-span-2">Nome<input name="name" required minLength={3} maxLength={160} defaultValue={values?.name} className={control} /></label>
      <label className="flex flex-col gap-1 text-xs sm:col-span-2">Regras de disponibilização (JSON)<textarea name="value" required rows={12} className={`${control} font-mono text-xs`} defaultValue={JSON.stringify(values?.value || { origin: "DISPONIBILIZACAO_FOLHA_FUNCIONAL", budgetUnitId: "", payrollTypes: [], regimeIds: [], scopes: [], allowBeforeClosure: false }, null, 2)} /></label>
      <p className="text-xs text-slate-600 sm:col-span-2">Informe UG responsável, tipos de folha e regimes da configuração selecionada. Escopos possíveis: PRODUCAO, HOMOLOGACAO e DEMONSTRACAO. allowBeforeClosure habilita a liberação explícita de cálculo oficial ainda não fechado. A disponibilização não comprova pagamento.</p>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isActive" defaultChecked={values?.isActive} />Política ativa</label>
    </fieldset>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <button disabled={pending} className="rounded bg-emerald-800 px-4 py-2 text-sm font-semibold text-white">{pending ? "Salvando…" : "Salvar política"}</button>
  </form>;
}

export function PayrollReleaseForm({ policies, runs }: { policies: Option[]; runs: Option[] }) {
  const [pending, startTransition] = useTransition(), [error, setError] = useState(""), [success, setSuccess] = useState("");
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget); setError(""); setSuccess("");
    startTransition(async () => {
      try {
        const result = await publishPayrollByFunctionalPolicyAction({ policyId: String(data.get("policyId")), runId: String(data.get("runId")), releaseAt: new Date(String(data.get("releaseAt"))).toISOString() });
        if (result.error) setError(result.error); else setSuccess(`${result.count} demonstrativos disponibilizados na data informada.`);
      } catch { setError("Não foi possível disponibilizar os demonstrativos."); }
    });
  }
  return <form onSubmit={submit} className="space-y-3 rounded border border-slate-300 bg-white p-4">
    <fieldset disabled={pending} className="grid gap-3 sm:grid-cols-2">
      <label className="flex flex-col gap-1 text-xs">Política<select name="policyId" required className={control}>{policies.map(policy => <option key={policy.id} value={policy.id}>{policy.name}</option>)}</select></label>
      <label className="flex flex-col gap-1 text-xs">Cálculo oficial<select name="runId" required className={control}>{runs.map(run => <option key={run.id} value={run.id}>{run.name}</option>)}</select></label>
      <label className="flex flex-col gap-1 text-xs">Data e horário de liberação (fuso deste dispositivo)<input name="releaseAt" type="datetime-local" required className={control} /></label>
      <button className="self-end rounded bg-emerald-800 px-4 py-2 text-sm font-semibold text-white">{pending ? "Disponibilizando…" : "Disponibilizar demonstrativos"}</button>
    </fieldset>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}{success && <p role="status" className="text-sm text-emerald-800">{success}</p>}
  </form>;
}

export function StatementRevocationForm({ statementId }: { statementId: string }) {
  const [pending, startTransition] = useTransition(), [error, setError] = useState("");
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget); setError("");
    startTransition(async () => {
      try { const result = await revokeFunctionalStatementAction({ statementId, reason: String(data.get("reason")) }); setError(result.error); }
      catch { setError("Não foi possível revogar o demonstrativo."); }
    });
  }
  return <form onSubmit={submit} className="space-y-1"><fieldset disabled={pending} className="flex gap-2"><input name="reason" required minLength={10} maxLength={4000} aria-label="Motivo da revogação" placeholder="Motivo da revogação" className={`${control} min-w-0 flex-1`} /><button className="rounded border border-red-700 px-3 text-xs font-semibold text-red-700">{pending ? "Revogando…" : "Revogar"}</button></fieldset>{error && <p role="alert" className="text-xs text-red-700">{error}</p>}</form>;
}
