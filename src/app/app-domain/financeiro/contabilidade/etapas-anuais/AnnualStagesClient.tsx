"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { captureAnnualConsistency, executeAnnualRegistration, executeAnnualStage, publishAnnualRapPostings, undoAnnualBudget, undoAnnualRapPostings, undoAnnualResult } from "../actions";
import FinanceTablePanel from "../../FinanceTablePanel";
import { financeColumn } from "../../operational-columns";

type Props = {
  years: { id: string; year: number; status: string; governmentEntityId: string; entityName: string }[];
  accounts: { id: string; code: string; name: string }[];
  registrationStages: { id: string; year: number; operation: string; reason: string; createdAt: string; summary: string }[];
  editions: { id: string; year: number; stage: string; createdAt: string; provisional: boolean; predecessorEditionId: string | null; reason: string; cashBalances: { bankAccountId: string; resourceSourceId: string; cash: string }[]; financialPosition: { status: string; unresolvedCount: number; rows: { budgetUnitId: string; resourceSourceId: string; financialAssets: string; financialLiabilities: string; deficitSurplus: string }[] } | null }[];
};

export default function AnnualStagesClient({ years, accounts, editions, registrationStages }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState("");
  const [consistency, setConsistency] = useState<NonNullable<Awaited<ReturnType<typeof captureAnnualConsistency>>["report"]> | null>(null);
  const [registrationRequestKey, setRegistrationRequestKey] = useState("");
  const [form, setForm] = useState({ stage: "OPENING" as "OPENING" | "RESULT_CLOSE" | "BUDGET_CLOSE", sourceFinancialYearId: "", targetFinancialYearId: "", resultAccountId: "", reason: "", requestKey: "" });
  const source = years.find(year => year.id === form.sourceFinancialYearId);
  const targets = years.filter(year => source && year.governmentEntityId === source.governmentEntityId && year.year === source.year + 1 && year.status === "Aberto");
  const stageLabel = (stage: string) => stage === "OPENING" ? "Abertura" : stage === "BUDGET_CLOSE" ? "Orçamento" : stage === "RAP_REGISTRATION" ? "Inscrição RAP" : "Resultado";
  return <div className="space-y-3 p-3">
    <header><h1 className="text-lg font-bold">Etapas contábeis anuais</h1><p className="text-sm text-slate-600">A abertura pode ser executada com o exercício anterior aberto. Cada reedição estorna sua edição anterior e conserva as operações correntes. O encerramento do resultado exige doze competências fechadas.</p></header>
    <section className="space-y-2 rounded border bg-white p-4"><h2 className="font-bold">Conferência pré-encerramento</h2><p className="text-sm text-slate-600">Selecione o exercício de origem abaixo e emita o relatório. Cada emissão grava uma memória imutável com o responsável e as inconsistências encontradas.</p><button type="button" disabled={pending || !form.sourceFinancialYearId} className="rounded border px-3 py-2 text-sm disabled:opacity-50" onClick={() => startTransition(async () => {
      const result = await captureAnnualConsistency(form.sourceFinancialYearId);
      if (result.error) setNotice(result.error);
      else if (result.report) { setConsistency(result.report); setNotice("Conferência anual registrada."); }
    })}>Emitir relatório de inconsistências</button>{consistency && <div className="space-y-2 text-sm"><p>Exercício {consistency.year} · {consistency.counts.errors} erros · {consistency.counts.warnings} alertas · {new Date(consistency.generatedAt).toLocaleString("pt-BR")}</p><a className="font-semibold text-emerald-800 underline" href={`/api/financeiro/conferencia-anual?reportId=${encodeURIComponent(consistency.reportId)}`}>Baixar CSV da emissão {consistency.reportId}</a>
      <FinanceTablePanel label="Inconsistências anuais" preferenceId="financeiro-inconsistencias-anuais" resetKey={consistency.reportId}
        columns={[financeColumn("severity", "Nível", 70, 100, "status"), financeColumn("type", "Origem", 90, 150), financeColumn("id", "Identificador da origem", 90, 220, "identifier"), financeColumn("message", "Inconsistência", 140, 500)]}
        rows={consistency.issues.map((issue, index) => ({ id: `${issue.code}:${issue.entityId}:${index}`, label: issue.entityId, values: { severity: issue.severity === "ERROR" ? "Erro" : "Alerta", type: issue.entityType, id: issue.entityId, message: issue.message } }))} />
    </div>}</section>
    <form className="grid gap-3 rounded border bg-white p-4 sm:grid-cols-2" onSubmit={event => {
      event.preventDefault();
      startTransition(async () => {
        const requestKey = form.requestKey || crypto.randomUUID();
        setForm(current => ({ ...current, requestKey }));
        const result = await executeAnnualStage({ ...form, requestKey, targetFinancialYearId: form.stage !== "OPENING" ? form.sourceFinancialYearId : form.targetFinancialYearId });
        setNotice(result.error ?? `Edição ${result.editionId}: ${result.replay ? "execução já registrada" : "etapa concluída"}${result.provisional ? "; abertura provisória, atualize após encerrar a origem" : ""}.`);
        if (!result.error) { setForm(current => ({ ...current, requestKey: "" })); router.refresh(); }
      });
    }}>
      <label className="grid gap-1 text-sm">Etapa<select className="rounded border p-2" value={form.stage} onChange={event => setForm({ ...form, stage: event.target.value as "OPENING" | "RESULT_CLOSE" | "BUDGET_CLOSE", targetFinancialYearId: "", requestKey: "" })}><option value="OPENING">Abertura / reedição</option><option value="RESULT_CLOSE">Apuração e encerramento do resultado</option><option value="BUDGET_CLOSE">Encerramento orçamentário — classes 5 e 6</option></select></label>
      <label className="grid gap-1 text-sm">Exercício de origem<select required className="rounded border p-2" value={form.sourceFinancialYearId} onChange={event => setForm({ ...form, sourceFinancialYearId: event.target.value, targetFinancialYearId: "", requestKey: "" })}><option value="">Selecione</option>{years.map(year => <option key={year.id} value={year.id}>{year.entityName} · {year.year} · {year.status}</option>)}</select></label>
      {form.stage === "OPENING" && <label className="grid gap-1 text-sm">Exercício de destino<select required className="rounded border p-2" value={form.targetFinancialYearId} onChange={event => setForm({ ...form, targetFinancialYearId: event.target.value, requestKey: "" })}><option value="">Selecione</option>{targets.map(year => <option key={year.id} value={year.id}>{year.entityName} · {year.year}</option>)}</select></label>}
      {form.stage !== "BUDGET_CLOSE" && <label className="grid gap-1 text-sm">Conta de resultado acumulado<select required className="rounded border p-2" value={form.resultAccountId} onChange={event => setForm({ ...form, resultAccountId: event.target.value, requestKey: "" })}><option value="">Selecione a conta patrimonial adotada</option>{accounts.map(account => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}</select></label>}
      {form.stage === "BUDGET_CLOSE" && <p className="text-sm text-slate-600 sm:col-span-2">Inverte os saldos das classes 5/6 por UG, fonte e dimensões originais, sem usar contrapartida patrimonial. Exige exercício em encerramento e doze competências fechadas. Os controles persistentes de classes 7/8 continuam disponíveis para abertura.</p>}
      <label className="grid gap-1 text-sm sm:col-span-2">Justificativa<textarea required className="rounded border p-2" value={form.reason} onChange={event => setForm({ ...form, reason: event.target.value, requestKey: "" })} /></label>
      <button disabled={pending} className="rounded bg-emerald-700 px-3 py-2 font-semibold text-white disabled:opacity-50">{pending ? "Executando etapa…" : "Executar etapa anual"}</button>
    </form>
    {notice && <p role="status" className="rounded border bg-amber-50 p-3 text-sm">{notice}</p>}
    <form className="grid gap-3 rounded border bg-white p-4 sm:grid-cols-2" onChange={() => setRegistrationRequestKey("")} onSubmit={event => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      startTransition(async () => {
        const requestKey = registrationRequestKey || crypto.randomUUID();
        setRegistrationRequestKey(requestKey);
        const result = await executeAnnualRegistration({ financialYearId: String(data.get("financialYearId")), operation: data.get("operation") === "UNDO" ? "UNDO" : "REGISTER", reason: String(data.get("reason")), requestKey });
        setNotice(result.error ?? `Etapa de inscrição ${result.stageId}: ${result.replay ? "execução já registrada" : "concluída"}.`);
        if (!result.error) { setRegistrationRequestKey(""); router.refresh(); }
      });
    }}><h2 className="font-bold sm:col-span-2">Inscrição anual de restos a pagar</h2><p className="text-sm text-slate-600 sm:col-span-2">Apure os saldos processados e não processados individualmente ou desmovimente esta etapa. Exige doze competências fechadas. Execução, acompanhamento ou transporte posterior impedem a alteração das inscrições.</p><label className="grid gap-1 text-sm">Exercício<select required name="financialYearId" className="rounded border p-2"><option value="">Selecione</option>{years.map(year => <option key={year.id} value={year.id}>{year.entityName} · {year.year} · {year.status}</option>)}</select></label><label className="grid gap-1 text-sm">Operação<select name="operation" className="rounded border p-2"><option value="REGISTER">Inscrever / reapurar</option><option value="UNDO">Desmovimentar inscrições</option></select></label><label className="grid gap-1 text-sm sm:col-span-2">Justificativa<input required name="reason" className="rounded border p-2" /></label><button disabled={pending} className="rounded border px-3 py-2 font-semibold disabled:opacity-50">Executar etapa de inscrição</button><a href="/financeiro/restos-a-pagar" className="p-2 text-sm font-semibold text-emerald-800 underline">Consultar inscrições por empenho</a></form>
    <section className="space-y-2"><h2 className="font-bold">Histórico das etapas de inscrição</h2>{registrationStages.map(stage => <article key={stage.id} className="rounded border bg-white p-3 text-sm"><h3 className="font-semibold">{stage.year} · {stage.operation === "REGISTER" ? "Inscrição / reapuração" : "Desmovimentação"}</h3><p>{stage.reason}</p><p>{new Date(stage.createdAt).toLocaleString("pt-BR")} · {stage.id}</p><pre className="mt-2 overflow-x-auto text-xs">{stage.summary}</pre></article>)}{!registrationStages.length && <p className="text-sm text-slate-500">Nenhuma etapa documental registrada.</p>}</section>
    <form className="grid gap-3 rounded border bg-white p-4 sm:grid-cols-2" onSubmit={event => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      startTransition(async () => {
        const result = await publishAnnualRapPostings({ financialYearId: String(data.get("financialYearId")), reason: String(data.get("reason")), requestKey: crypto.randomUUID() });
        setNotice(result.error ?? `Partidas RAP publicadas na edição ${result.editionId}.`);
        if (!result.error) router.refresh();
      });
    }}><h2 className="font-bold sm:col-span-2">Partidas específicas de inscrição RAP</h2><p className="text-sm text-slate-600 sm:col-span-2">Após preparar as inscrições, publique a composição das matrizes RAP_PROCESSADO_INSCRICAO e RAP_NAO_PROCESSADO_INSCRICAO, incluindo os pares DDR adotados. Exige exercício em encerramento e doze competências fechadas. Para revisar valores, desmovimente esta edição antes das inscrições.</p><label className="grid gap-1 text-sm">Exercício<select required name="financialYearId" className="rounded border p-2"><option value="">Selecione</option>{years.filter(year => year.status === "Em Encerramento").map(year => <option key={year.id} value={year.id}>{year.entityName} · {year.year}</option>)}</select></label><label className="grid gap-1 text-sm">Justificativa<input required name="reason" className="rounded border p-2" /></label><button disabled={pending} className="rounded border px-3 py-2 font-semibold disabled:opacity-50">Publicar partidas de inscrição</button></form>
    <form className="grid gap-3 rounded border bg-white p-4 sm:grid-cols-2" onSubmit={event => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      startTransition(async () => {
        const editionId = String(data.get("editionId"));
        const stage = editions.find(edition => edition.id === editionId)?.stage;
        const undo = stage === "BUDGET_CLOSE" ? undoAnnualBudget : stage === "RAP_REGISTRATION" ? undoAnnualRapPostings : undoAnnualResult;
        const result = await undo({ editionId, reason: String(data.get("reason")) });
        setNotice(result.error ?? "Etapa de encerramento desmovimentada, com partidas de estorno preservadas.");
        if (!result.error) router.refresh();
      });
    }}><h2 className="font-bold sm:col-span-2">Desmovimentar encerramento</h2><p className="text-sm text-slate-600 sm:col-span-2">Resultado, orçamento e partidas RAP são etapas independentes. Disponível antes do encerramento final e da abertura posterior dependente. Informe a edição vigente e a justificativa.</p><label className="grid gap-1 text-sm">Edição<select required name="editionId" className="rounded border p-2"><option value="">Selecione</option>{editions.filter(edition => ["RESULT_CLOSE", "BUDGET_CLOSE", "RAP_REGISTRATION"].includes(edition.stage)).map(edition => <option key={edition.id} value={edition.id}>{edition.year} · {edition.stage === "BUDGET_CLOSE" ? "Orçamento" : edition.stage === "RAP_REGISTRATION" ? "Inscrição RAP" : "Resultado"} · {edition.id}</option>)}</select></label><label className="grid gap-1 text-sm">Justificativa<input required name="reason" className="rounded border p-2" /></label><button disabled={pending} className="rounded border border-amber-700 px-3 py-2 text-sm font-semibold disabled:opacity-50">Desmovimentar etapa selecionada</button></form>
    <section className="space-y-3"><h2 className="font-bold">Edições documentais</h2>{editions.map(edition => <article key={edition.id} className="rounded border bg-white p-3 text-sm"><h3 className="font-semibold">{edition.year} · {stageLabel(edition.stage)} · {edition.provisional ? "Provisória" : "Definitiva"}</h3><p>{edition.reason}</p><p className="text-slate-600">{new Date(edition.createdAt).toLocaleString("pt-BR")} · Edição {edition.id}{edition.predecessorEditionId && ` · Anterior ${edition.predecessorEditionId}`}</p>{edition.cashBalances.length > 0 && <details className="mt-2"><summary>Memória de caixa por banco e fonte no fim da origem</summary><ul>{edition.cashBalances.map(row => <li key={`${row.bankAccountId}:${row.resourceSourceId}`}>{row.bankAccountId} · {row.resourceSourceId} · R$ {row.cash}</li>)}</ul><p className="text-slate-500">Posição documental de caixa; a apuração do superávit também exige as obrigações do encerramento.</p></details>}</article>)}{!editions.length && <p className="text-sm text-slate-500">Nenhuma edição anual neste perímetro.</p>}</section>
    <section className="space-y-3"><h2 className="font-bold">Ativo e passivo financeiro por fonte na origem</h2><p className="text-sm text-slate-600">Apuração pelas partidas patrimoniais com indicador financeiro FP=1. Valores só são apresentados quando todas as partidas patrimoniais têm indicador documentado; a memória de caixa por banco é independente.</p>{editions.filter(edition => edition.financialPosition).map(edition => <article className="rounded border bg-white p-3 text-sm" key={edition.id}><h3 className="font-semibold">{edition.year} · Edição {edition.id}</h3>{edition.financialPosition?.status !== "DOCUMENTED" ? <p className="text-amber-800">Apuração pendente: {edition.financialPosition?.unresolvedCount} partidas sem indicador financeiro/fonte conciliados.</p> : <FinanceTablePanel label="Ativo e passivo financeiro por fonte" description={`${edition.year} · Edição ${edition.id}`} preferenceId="financeiro-posicao-anual" resetKey={edition.id}
      columns={[financeColumn("unit", "UG", 90, 200, "identifier"), financeColumn("source", "Fonte", 90, 200, "identifier"), financeColumn("assets", "Ativo financeiro", 90, 170, "text", "right"), financeColumn("liabilities", "Passivo financeiro", 90, 170, "text", "right"), financeColumn("balance", "Superávit / déficit", 90, 170, "text", "right")]}
      rows={edition.financialPosition.rows.map(row => ({ id: `${row.budgetUnitId}:${row.resourceSourceId}`, label: row.resourceSourceId, values: { unit: row.budgetUnitId, source: row.resourceSourceId, assets: `R$ ${row.financialAssets}`, liabilities: `R$ ${row.financialLiabilities}`, balance: `R$ ${row.deficitSurplus}` } }))} />}</article>)}</section>
  </div>;
}
