"use client";

import { useState, useTransition } from "react";
import { ReferencePicker } from "@/app/app-domain/frotas/ReferencePicker";
import { registerAssetDisposal, registerAssetValueAdjustment, runMonthlyDepreciation, reverseAssetValuationAction, reverseAssetWriteOffAction, assetRoutineAction } from "./actions";

type ClassificationOption = { id: string; code: string; name: string };
export function AssetLifecycleClient({ initialCompetence, budgetUnits, bankAccounts, revenueNatures, resourceSources, valuationRecords }: {
  initialCompetence: string; budgetUnits: ClassificationOption[];
  bankAccounts: { id: string; bankName: string; accountNumber: string; budgetUnitId: string | null }[];
  revenueNatures: ClassificationOption[]; resourceSources: ClassificationOption[];
  valuationRecords: { id: string; kind: "DEPRECIATION" | "ADJUSTMENT"; label: string }[];
}) {
  const [isPending, startTransition] = useTransition();
  const [competence, setCompetence] = useState(initialCompetence);
  const [valuationUnitId, setValuationUnitId] = useState("");
  const [adjustmentKey, setAdjustmentKey] = useState("");
  const [reversalRecordId, setReversalRecordId] = useState("");
  const [reversalDate, setReversalDate] = useState(initialCompetence ? `${initialCompetence}-01` : "");
  const [reversalReason, setReversalReason] = useState("");
  const [reversalKey, setReversalKey] = useState("");
  const [assetId, setAssetId] = useState("");
  const [assetLabel, setAssetLabel] = useState("");
  const [type, setType] = useState<"Baixa" | "Alienação">("Baixa");
  const [date, setDate] = useState(initialCompetence ? `${initialCompetence}-01` : "");
  const [reason, setReason] = useState("");
  const [justification, setJustification] = useState("");
  const [disposalValue, setDisposalValue] = useState("");
  const [budgetUnitId, setBudgetUnitId] = useState("");
  const [bankAccountId, setBankAccountId] = useState("");
  const [revenueNatureId, setRevenueNatureId] = useState("");
  const [resourceSourceId, setResourceSourceId] = useState("");
  const [adjustmentType, setAdjustmentType] = useState<"REVALUATION" | "IMPAIRMENT" | "SUBSEQUENT_COST">("REVALUATION");
  const [adjustmentDate, setAdjustmentDate] = useState(initialCompetence ? `${initialCompetence}-01` : "");
  const [adjustmentValue, setAdjustmentValue] = useState("");
  const [adjustmentJustification, setAdjustmentJustification] = useState("");
  const [adjustmentEvidence, setAdjustmentEvidence] = useState("");
  const [usefulLifeMonths, setUsefulLifeMonths] = useState("");
  const [manualDepreciation, setManualDepreciation] = useState("");
  const [writeOffId, setWriteOffId] = useState("");
  const [routine, setRoutine] = useState<"loan" | "return" | "exclude" | "requestWriteOff">("loan");
  const [plate, setPlate] = useState("");
  const [recipient, setRecipient] = useState("");
  const [expectedReturn, setExpectedReturn] = useState("");
  const [routineReason, setRoutineReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function showResult(result: { error?: string; message?: string }) {
    setError(result.error ?? null);
    setMessage(result.message ?? null);
  }

  function selectAsset(value: string, label?: string) {
    setAssetId(value);
    setAssetLabel(label || "");
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <section className="rounded-lg border bg-white p-4">
        <h3 className="font-semibold">Depreciação mensal</h3>
        <p className="mt-1 text-sm text-muted-foreground">Método linear a partir da competência de aquisição, usando a vida útil da categoria.</p>
        <div className="mt-4 flex flex-wrap items-end gap-2">
          <label className="grid gap-1 text-sm font-medium">
            Competência
            <input className="h-9 rounded-md border px-3" type="month" value={competence} onChange={(event) => setCompetence(event.target.value)} />
          </label>
           <select aria-label="Unidade gestora da depreciação" className="h-9 rounded-md border px-3 text-sm" value={valuationUnitId} onChange={event => setValuationUnitId(event.target.value)}><option value="">Unidade gestora responsável</option>{budgetUnits.map(unit => <option key={unit.id} value={unit.id}>{unit.code} — {unit.name}</option>)}</select>
           <button type="button" className="h-9 rounded-md bg-amber-600 px-4 text-sm font-medium text-white disabled:opacity-50" disabled={isPending || !competence || !valuationUnitId} onClick={() => startTransition(async () => showResult(await runMonthlyDepreciation(competence, valuationUnitId)))}>
            Processar competência
          </button>
          <ReferencePicker endpoint="/api/patrimonio/referencias" kind="assets" label="Bem por placa para depreciação manual" value={assetId} selectedLabel={assetLabel} onChange={selectAsset} />
          <label className="grid gap-1 text-sm">Depreciação manual (R$)<input inputMode="decimal" className="h-9 rounded-md border px-3" value={manualDepreciation} onChange={e => setManualDepreciation(e.target.value)} /></label>
          <button type="button" className="h-9 rounded border px-3" disabled={isPending || !assetId || !manualDepreciation || !valuationUnitId} onClick={() => startTransition(async () => showResult(await runMonthlyDepreciation(competence, valuationUnitId, { assetId, amount: Number(manualDepreciation.replace(",", ".")) })))}>Lançar depreciação manual</button>
        </div>
      </section>

      <section className="rounded-lg border bg-white p-4">
        <h3 className="font-semibold">Baixa ou alienação</h3>
        <p className="mt-1 text-sm text-muted-foreground">Registra valor contábil, valor recebido e resultado. Só posta contabilmente com evento homologado; caso contrário registra pendência.</p>
        <form className="mt-4 grid gap-2" onSubmit={(event) => {
          event.preventDefault();
          startTransition(async () => {
            const result = await registerAssetDisposal({ assetId, date, type, reason, justification, disposalValue, financial: { budgetUnitId, bankAccountId, revenueNatureId, resourceSourceId } });
            showResult(result);
            if (!result.error) {
              setReason("");
              setJustification("");
              setDisposalValue("");
            }
          });
        }}>
          <ReferencePicker endpoint="/api/patrimonio/referencias" kind="assets" label="Bem para baixa ou alienação" value={assetId} selectedLabel={assetLabel} required onChange={selectAsset} />
          <div className="grid grid-cols-2 gap-2">
            <select className="h-9 rounded-md border px-3 text-sm" value={type} onChange={(event) => setType(event.target.value as "Baixa" | "Alienação")}>
              <option value="Baixa">Baixa</option>
              <option value="Alienação">Alienação</option>
            </select>
            <input className="h-9 rounded-md border px-3 text-sm" type="date" required value={date} onChange={(event) => setDate(event.target.value)} />
          </div>
          <input className="h-9 rounded-md border px-3 text-sm" placeholder="Valor recebido (R$)" inputMode="decimal" disabled={type === "Baixa"} value={disposalValue} onChange={(event) => setDisposalValue(event.target.value)} />
          <select aria-label="Unidade gestora da baixa" required className="h-9 rounded-md border px-3 text-sm" value={budgetUnitId} onChange={(event) => { setBudgetUnitId(event.target.value); setBankAccountId(""); }}>
            <option value="">Unidade gestora responsável</option>
            {budgetUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.code} — {unit.name}</option>)}
          </select>
          {type === "Alienação" && <>
            <select aria-label="Conta arrecadadora da alienação" required className="h-9 rounded-md border px-3 text-sm" value={bankAccountId} onChange={(event) => setBankAccountId(event.target.value)}>
              <option value="">Conta arrecadadora</option>
              {bankAccounts.filter((account) => account.budgetUnitId === budgetUnitId).map((account) => <option key={account.id} value={account.id}>{account.bankName} — {account.accountNumber}</option>)}
            </select>
            <select aria-label="Natureza da receita de alienação" required className="h-9 rounded-md border px-3 text-sm" value={revenueNatureId} onChange={(event) => setRevenueNatureId(event.target.value)}>
              <option value="">Natureza da receita</option>
              {revenueNatures.map((nature) => <option key={nature.id} value={nature.id}>{nature.code} — {nature.name}</option>)}
            </select>
            <select aria-label="Fonte da receita de alienação" required className="h-9 rounded-md border px-3 text-sm" value={resourceSourceId} onChange={(event) => setResourceSourceId(event.target.value)}>
              <option value="">Fonte de recursos</option>
              {resourceSources.map((source) => <option key={source.id} value={source.id}>{source.code} — {source.name}</option>)}
            </select>
          </>}
          <input className="h-9 rounded-md border px-3 text-sm" placeholder="Motivo" required value={reason} onChange={(event) => setReason(event.target.value)} />
          <textarea className="min-h-20 rounded-md border px-3 py-2 text-sm" placeholder="Justificativa" required value={justification} onChange={(event) => setJustification(event.target.value)} />
          <button className="h-9 rounded-md border border-amber-600 px-4 text-sm font-medium text-amber-700 disabled:opacity-50" disabled={isPending || !assetId}>Registrar {type.toLowerCase()}</button>
        </form>
      </section>

      <section className="rounded-lg border bg-white p-4">
        <h3 className="font-semibold">Reavaliação e custos posteriores</h3>
        <p className="mt-1 text-sm text-muted-foreground">Informe o valor de mercado e o laudo no teste de recuperabilidade. Se o valor for mantido, o teste fica registrado sem partida contábil. Em custo subsequente informe o valor a capitalizar.</p>
        <form className="mt-4 grid gap-2" onSubmit={(event) => {
          event.preventDefault();
          startTransition(async () => {
            const key = adjustmentKey || crypto.randomUUID();
            setAdjustmentKey(key);
            const result = await registerAssetValueAdjustment({ assetId, date: adjustmentDate, type: adjustmentType, value: adjustmentValue, justification: adjustmentJustification, evidence: adjustmentEvidence, budgetUnitId: valuationUnitId, idempotencyKey: key, ...(usefulLifeMonths ? { usefulLifeMonths: Number(usefulLifeMonths) } : {}) });
            showResult(result);
            if (!result.error) {
              setAdjustmentValue("");
              setAdjustmentJustification("");
              setAdjustmentEvidence("");
              setAdjustmentKey("");
              setUsefulLifeMonths("");
            }
          });
        }}>
          <ReferencePicker endpoint="/api/patrimonio/referencias" kind="assets" label="Bem para ajuste de valor" value={assetId} selectedLabel={assetLabel} required onChange={selectAsset} />
          <select aria-label="Unidade gestora do ajuste" required className="h-9 rounded-md border px-3 text-sm" value={valuationUnitId} onChange={event => setValuationUnitId(event.target.value)}><option value="">Unidade gestora responsável</option>{budgetUnits.map(unit => <option key={unit.id} value={unit.id}>{unit.code} — {unit.name}</option>)}</select>
          <div className="grid grid-cols-2 gap-2">
            <select className="h-9 rounded-md border px-3 text-sm" value={adjustmentType} onChange={(event) => setAdjustmentType(event.target.value as typeof adjustmentType)}>
              <option value="REVALUATION">Reavaliação</option>
              <option value="IMPAIRMENT">Redução / teste de recuperabilidade</option>
              <option value="SUBSEQUENT_COST">Custo subsequente</option>
            </select>
            <input className="h-9 rounded-md border px-3 text-sm" type="date" required value={adjustmentDate} onChange={(event) => setAdjustmentDate(event.target.value)} />
          </div>
          <input className="h-9 rounded-md border px-3 text-sm" placeholder={adjustmentType === "SUBSEQUENT_COST" ? "Valor a capitalizar (R$)" : "Novo valor contábil (R$)"} inputMode="decimal" required value={adjustmentValue} onChange={(event) => setAdjustmentValue(event.target.value)} />
          <label className="grid gap-1 text-sm">Vida útil total revisada em meses (opcional)<input type="number" min={1} max={12000} className="h-9 rounded-md border px-3" value={usefulLifeMonths} onChange={e => setUsefulLifeMonths(e.target.value)} /></label>
          <input className="h-9 rounded-md border px-3 text-sm" placeholder="Justificativa" required value={adjustmentJustification} onChange={(event) => setAdjustmentJustification(event.target.value)} />
          <textarea className="min-h-20 rounded-md border px-3 py-2 text-sm" placeholder="Laudo, processo ou outra evidência" required value={adjustmentEvidence} onChange={(event) => setAdjustmentEvidence(event.target.value)} />
          <button className="h-9 rounded-md border border-amber-600 px-4 text-sm font-medium text-amber-700 disabled:opacity-50" disabled={isPending || !assetId}>Registrar ajuste</button>
        </form>
      </section>
      <section className="rounded-lg border bg-white p-4 lg:col-span-3">
        <h3 className="font-semibold">Empréstimos, devoluções e exclusão</h3>
        <form className="mt-3 grid gap-2 sm:grid-cols-2" onSubmit={event => { event.preventDefault(); startTransition(async () => showResult(await assetRoutineAction({ operation: routine, patrimonyNumber: plate, recipient, expectedReturn, reason: routineReason }))); }}>
          <select aria-label="Operação do bem" className="h-9 rounded border px-3" value={routine} onChange={e => setRoutine(e.target.value as typeof routine)}><option value="loan">Empréstimo</option><option value="return">Devolução</option><option value="requestWriteOff">Solicitar baixa</option><option value="exclude">Exclusão lógica (preserva histórico)</option></select>
          <input aria-label="Placa do bem" required placeholder="Placa do bem" className="h-9 rounded border px-3" value={plate} onChange={e => setPlate(e.target.value)} />
          {routine === "loan" && <><input aria-label="Destinatário do empréstimo" required placeholder="Destinatário" className="h-9 rounded border px-3" value={recipient} onChange={e => setRecipient(e.target.value)} /><input aria-label="Previsão de devolução" type="date" required className="h-9 rounded border px-3" value={expectedReturn} onChange={e => setExpectedReturn(e.target.value)} /></>}
          <input aria-label="Justificativa da operação" required minLength={5} placeholder="Justificativa / evidência" className="h-9 rounded border px-3" value={routineReason} onChange={e => setRoutineReason(e.target.value)} />
          <button className="h-9 rounded border px-3" disabled={isPending}>Registrar operação</button>
        </form>
      </section>
      <section className="rounded-lg border bg-white p-4 lg:col-span-3">
        <h3 className="font-semibold">Estorno de baixa</h3>
        <form className="mt-3 grid gap-2 sm:grid-cols-2" onSubmit={event => { event.preventDefault(); startTransition(async () => showResult(await reverseAssetWriteOffAction({ recordId: writeOffId, date: reversalDate, reason: reversalReason, budgetUnitId: valuationUnitId }))); }}>
          <input aria-label="Placa ou identificador da baixa a estornar" required placeholder="Placa ou identificador da baixa" className="h-9 rounded border px-3" value={writeOffId} onChange={e => setWriteOffId(e.target.value)} />
          <select aria-label="Unidade gestora do estorno da baixa" required className="h-9 rounded border px-3" value={valuationUnitId} onChange={e => setValuationUnitId(e.target.value)}><option value="">Unidade gestora</option>{budgetUnits.map(unit => <option key={unit.id} value={unit.id}>{unit.code} — {unit.name}</option>)}</select>
          <input aria-label="Data do estorno da baixa" required type="date" className="h-9 rounded border px-3" value={reversalDate} onChange={e => setReversalDate(e.target.value)} />
          <input aria-label="Fundamento do estorno da baixa" required minLength={10} placeholder="Fundamento do estorno" className="h-9 rounded border px-3" value={reversalReason} onChange={e => setReversalReason(e.target.value)} />
          <button className="h-9 rounded border px-3" disabled={isPending}>Estornar baixa</button>
        </form>
      </section>
      <section className="rounded-lg border bg-white p-4 lg:col-span-3">
        <h3 className="font-semibold">Estorno de valorização patrimonial</h3>
        <p className="mt-1 text-sm text-muted-foreground">Selecione um fato contabilizado da página atual. Estorne em ordem inversa; as partidas e os históricos originais são preservados.</p>
        <form className="mt-4 grid gap-2 sm:grid-cols-2" onSubmit={event => {
          event.preventDefault();
          const record = valuationRecords.find(row => row.id === reversalRecordId);
          if (!record) return;
          startTransition(async () => {
            const key = reversalKey || crypto.randomUUID();
            setReversalKey(key);
            const result = await reverseAssetValuationAction({ kind: record.kind, recordId: record.id, budgetUnitId: valuationUnitId, date: reversalDate, reason: reversalReason, idempotencyKey: key });
            showResult(result);
            if (!result.error) { setReversalKey(""); setReversalReason(""); setReversalRecordId(""); }
          });
        }}>
          <select aria-label="Fato patrimonial a estornar" required className="h-9 rounded-md border px-3 text-sm" value={reversalRecordId} onChange={event => setReversalRecordId(event.target.value)}><option value="">Fato patrimonial contabilizado</option>{valuationRecords.map(record => <option key={record.id} value={record.id}>{record.label}</option>)}</select>
          <select aria-label="Unidade gestora do estorno" required className="h-9 rounded-md border px-3 text-sm" value={valuationUnitId} onChange={event => setValuationUnitId(event.target.value)}><option value="">Unidade gestora responsável</option>{budgetUnits.map(unit => <option key={unit.id} value={unit.id}>{unit.code} — {unit.name}</option>)}</select>
          <input aria-label="Data do estorno patrimonial" required type="date" className="h-9 rounded-md border px-3 text-sm" value={reversalDate} onChange={event => setReversalDate(event.target.value)} />
          <input aria-label="Fundamento do estorno patrimonial" required minLength={10} className="h-9 rounded-md border px-3 text-sm" placeholder="Fundamento do estorno" value={reversalReason} onChange={event => setReversalReason(event.target.value)} />
          <button className="h-9 rounded-md border border-amber-600 px-4 text-sm font-medium text-amber-700 disabled:opacity-50" disabled={isPending || !reversalRecordId || !valuationUnitId}>Estornar fato patrimonial</button>
        </form>
      </section>
      {(message || error) && <p className={`text-sm lg:col-span-3 ${error ? "text-red-600" : "text-emerald-700"}`}>{error ?? message}</p>}
    </div>
  );
}
