"use client";

import { useState } from "react";
import { GitCompare, CheckCircle2, FileSpreadsheet, Sparkles, Scale } from "lucide-react";
import FinanceTablePanel from "../FinanceTablePanel";
import { financeColumn } from "../operational-columns";
import { allocateReconciliationAction, confirmReconciliationSessionAction, openReconciliationSessionAction, runAutoReconciliationAction, importBankStatementFileAction } from "./actions";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { ReconciliationAllocationForm } from "./ReconciliationAllocationForm";
import type { ReconciliationMatchResult } from "@/lib/financeiro/reconciliation-engine";

interface Session {
  id: string;
  banco: string;
  agencia: string;
  contaNumero: string;
  periodo: string;
  saldoInicialDecimal: unknown;
  totalDebitosDecimal: unknown;
  totalCreditosDecimal: unknown;
  saldoFinalDecimal: unknown;
  saldoRazaoDecimal: unknown;
  diferencaDecimal: unknown;
  status: string;
  totalItensBanco: number;
  totalItensContabeis: number;
  itensConciliados: number;
  itensDivergentes: number;
  reciboIntegracao: string | null;
}

interface ConfirmReceipt {
  session: Session;
  recibo: string;
  hash: string;
}

export default function ConciliacaoBancariaClient({ initialSessions = [], accounts }: { initialSessions?: Session[]; accounts: Array<{ id: string; bankName: string; agency: string; accountNumber: string }> }) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const account = accounts.find((item) => item.id === accountId);
  const banco = account?.bankName ?? "";
  const agencia = account?.agency ?? "";
  const contaNumero = account?.accountNumber ?? "";
  const [periodo, setPeriodo] = useState(new Date().toISOString().slice(0, 7));
  const [saldoInicial, setSaldoInicial] = useState<number>(0);

  const [activeSession, setActiveSession] = useState<Session | null>(initialSessions[0] || null);
  const [matchResults, setMatchResults] = useState<ReconciliationMatchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [confirmReceipt, setConfirmReceipt] = useState<ConfirmReceipt | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [importReceipt, setImportReceipt] = useState<{ id: string; checksum: string } | null>(null);

  async function handleImport(event: React.FormEvent) {
    event.preventDefault();
    if (!file || !accountId) return;
    setLoading(true); setErrorMsg(null); setImportReceipt(null);
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error("O arquivo deve ter no máximo 2 MB.");
      if (!/\.(csv|ofx|ofc)$/i.test(file.name)) throw new Error("Envie um arquivo CSV, OFX ou OFC.");
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = "";
      for (const byte of bytes) binary += String.fromCharCode(byte);
      const result = await importBankStatementFileAction({ bankAccountId: accountId, base64: btoa(binary), fileName: file.name });
      if (result.error) throw new Error(result.error);
      setImportReceipt(result.data ?? null);
      setMatchResults([]); setConfirmReceipt(null);
    } catch (error) { setErrorMsg(error instanceof Error ? error.message : "Falha na importação."); }
    finally { setLoading(false); }
  }

  async function handleOpenSession(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    setConfirmReceipt(null);

    const res = await openReconciliationSessionAction({
      banco,
      agencia,
      contaNumero,
      periodo,
      saldoInicial,
      bankAccountId: accountId,
    });

    setLoading(false);

    if (res.error) {
      setErrorMsg(res.error);
    } else if (res.data) {
      setActiveSession(res.data);
      setMatchResults([]);
    }
  }

  async function handleRunAutoMatch() {
    if (!activeSession) return;
    setLoading(true);
    setErrorMsg(null);
    setConfirmReceipt(null);

    const res = await runAutoReconciliationAction(activeSession.id);

    setLoading(false);

    if (res.error) {
      setErrorMsg(res.error);
    } else if (res.data) {
      setActiveSession(res.data.session);
      setMatchResults(res.data.matches);
    }
  }

  async function handleConfirmSession() {
    if (!activeSession) return;
    setLoading(true);

    const res = await confirmReconciliationSessionAction(activeSession.id);

    setLoading(false);

    if (res.error) {
      setErrorMsg(res.error);
    } else if (res.data) {
      setConfirmReceipt(res.data);
      setActiveSession(res.data.session);
    }
  }

  async function handleApplySuggestions() {
    if (!activeSession) return;
    const allocations = matchResults.filter((item) => item.statementItemId && item.treasuryMovementId && item.diferenca === 0 && ["VALOR_DATA_EXATA", "VALOR_D1", "DOCUMENTO", "HISTORICO"].includes(item.type)).map((item) => ({ statementItemId: item.statementItemId!, treasuryMovementId: item.treasuryMovementId!, amount: item.valorBanco!.toFixed(2) }));
    if (!allocations.length) { setErrorMsg("Não há correspondências exatas disponíveis; use as alocações manuais."); return; }
    setLoading(true);
    const result = await allocateReconciliationAction({ sessionId: activeSession.id, idempotencyKey: `AUTO:${activeSession.id}:${crypto.randomUUID()}`, reason: "Correspondências exatas conferidas pelo operador", allocations });
    setLoading(false);
    if (result.error) setErrorMsg(result.error); else await handleRunAutoMatch();
  }

  return (
    <div className="h-full min-h-0 overflow-y-auto px-1 py-1 sm:px-2 [&>*+*]:mt-2">
      {/* Header */}
      <div className="flex flex-col gap-2 border-b border-slate-300 bg-white px-3 py-2 shadow-sm md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="mt-0.5 flex items-center gap-2 text-sm font-bold tracking-tight text-slate-900">
            <GitCompare className="size-4 text-emerald-600" />
            Motor Avançado de Conciliação Bancária
          </h1>
          <p className="text-xs text-slate-600">
            Abertura de conciliação bancária, leitura do extrato, cálculo de saldos e confronto com o razão bancário analítico.
          </p>
        </div>
      </div>

      {/* Grid: Abertura & Painel de Saldos */}
      <form onSubmit={handleImport} className="flex flex-wrap items-center gap-3 rounded border bg-white p-3 text-xs">
        <label htmlFor="statement-file" className="font-semibold">Extrato da conta selecionada (CSV/OFX/OFC)</label>
        <input id="statement-file" type="file" accept=".csv,.ofx,.ofc" required onChange={event => setFile(event.target.files?.[0] ?? null)} />
        <button disabled={loading || !accountId || !file} className="rounded border px-3 py-2 font-semibold">Importar extrato</button>
        {importReceipt && <span role="status">Extrato importado · SHA-256 {importReceipt.checksum} · <a className="underline" href={`/api/financeiro/extratos-importados/${importReceipt.id}`}>Baixar original</a> · <a className="underline" href={`/api/financeiro/extratos-importados/${importReceipt.id}?format=PDF`}>Imprimir extrato</a></span>}
      </form>
      {initialSessions.length > 0 && <select aria-label="Sessões de conciliação" className="w-full rounded border p-2 text-xs" value={activeSession?.id ?? ""} onChange={(event) => { setActiveSession(initialSessions.find((session) => session.id === event.target.value) ?? null); setMatchResults([]); setConfirmReceipt(null); setErrorMsg(null); }}><option value="">Selecionar sessão anterior</option>{initialSessions.map((session) => <option key={session.id} value={session.id}>{session.banco} · {session.contaNumero} · {session.periodo} · {session.status}</option>)}</select>}
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-12">
        {/* Form Abertura */}
        <div className="space-y-3 rounded-md border border-slate-200 bg-white p-3 shadow-none lg:col-span-4">
          <h2 className="text-base font-bold text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-3 flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-emerald-600" /> Abertura de Conciliação
          </h2>

          <form onSubmit={handleOpenSession} className="space-y-3 text-xs">
            <div>
              <label className="block font-semibold uppercase mb-1">Banco</label>
              <select aria-label="Conta bancária municipal" value={accountId} onChange={(event) => setAccountId(event.target.value)} className="w-full bg-slate-50 border p-2.5 rounded-lg text-sm" required><option value="">Selecione a conta</option>{accounts.map((item) => <option key={item.id} value={item.id}>{item.bankName} · {item.agency} · {item.accountNumber}</option>)}</select>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <label className="block font-semibold uppercase mb-1">Agência</label>
                <input
                  type="text"
                  value={agencia}
                  readOnly
                  className="w-full bg-slate-50 dark:bg-slate-800 border p-2.5 rounded-lg text-sm"
                  required
                />
              </div>
              <div>
                <label className="block font-semibold uppercase mb-1">Conta Corrente</label>
                <input
                  type="text"
                  value={contaNumero}
                  readOnly
                  className="w-full bg-slate-50 dark:bg-slate-800 border p-2.5 rounded-lg text-sm"
                  required
                />
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <label className="block font-semibold uppercase mb-1">Período (AAAA-MM)</label>
                <input
                  type="month"
                  value={periodo}
                  onChange={(e) => setPeriodo(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border p-2.5 rounded-lg text-sm"
                  required
                />
              </div>
              <div>
                  <label className="block font-semibold uppercase mb-1">Saldo Inicial do Extrato (R$)</label>
                <MoneyInput
                  value={saldoInicial}
                  onChange={setSaldoInicial}
                  className="w-full bg-slate-50 dark:bg-slate-800 border p-2.5 rounded-lg text-sm font-bold text-blue-600"
                  required
                />
              </div>
            </div>

            {errorMsg && <div className="p-2.5 bg-rose-50 text-rose-800 text-xs rounded-lg">{errorMsg}</div>}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-4 rounded-xl shadow transition-all"
            >
              Abrir Conciliação &amp; Carregar Razão Bancário
            </button>
          </form>
        </div>

        {/* Dashboard de Saldos & Motor de Match */}
          <div className="space-y-3 lg:col-span-8">
          {activeSession && <ReconciliationAllocationForm key={`${activeSession.id}:${activeSession.itensConciliados}:${activeSession.itensDivergentes}`} sessionId={activeSession.id} closed={activeSession.status === "CONCILIADA"} onChanged={handleRunAutoMatch} />}
          {!activeSession ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center text-slate-500 italic">
              Preencha os dados e clique em &quot;Abrir Conciliação &amp; Carregar Razão Bancário&quot; para iniciar.
            </div>
          ) : (
            <div className="space-y-3 rounded-md border border-slate-200 bg-white p-3 shadow-none">
              {/* Header Sessão */}
              <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Scale className="w-5 h-5 text-emerald-600" />
                    Quadro Demonstrativo de Saldos da Conciliação
                  </h3>
                  <span className="text-xs text-slate-500 font-mono">
                    {activeSession.banco} | Conta: {activeSession.contaNumero} | Período: {activeSession.periodo}
                  </span>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-extrabold ${
                  activeSession.status === "CONCILIADA" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300" : "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300"
                }`}>
                  Status: {activeSession.status}
                </span>
              </div>

              {/* 5 Cards de Saldos */}
              <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 text-xs">
                <div className="bg-slate-50 dark:bg-slate-800 p-3 rounded-lg border">
                  <span className="text-slate-500 block font-semibold">Saldo Inicial</span>
                  <span className="font-bold text-slate-800 dark:text-white text-sm">
                    R$ {Number(activeSession.saldoInicialDecimal).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800 p-3 rounded-lg border">
                  <span className="text-slate-500 block font-semibold">(+) Entradas (Créditos)</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400 text-sm">
                    R$ {Number(activeSession.totalCreditosDecimal).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800 p-3 rounded-lg border">
                  <span className="text-slate-500 block font-semibold">(-) Saídas (Débitos)</span>
                  <span className="font-bold text-rose-600 dark:text-rose-400 text-sm">
                    R$ {Number(activeSession.totalDebitosDecimal).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="bg-emerald-50 dark:bg-emerald-950/40 p-3 rounded-lg border border-emerald-300">
                  <span className="text-emerald-800 dark:text-emerald-200 block font-semibold">Saldo Final Extrato</span>
                  <span className="font-extrabold text-emerald-600 dark:text-emerald-400 text-sm">
                    R$ {Number(activeSession.saldoFinalDecimal).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="bg-blue-50 dark:bg-blue-950/40 p-3 rounded-lg border border-blue-300">
                  <span className="text-blue-800 dark:text-blue-200 block font-semibold">Saldo do Razão Bancário</span>
                  <span className="font-extrabold text-blue-600 dark:text-blue-400 text-sm">
                    R$ {Number(activeSession.saldoRazaoDecimal).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="bg-blue-50 dark:bg-blue-950/40 p-3 rounded-lg border border-blue-300">
                  <span className="text-blue-800 dark:text-blue-200 block font-semibold">Diferença / Ajuste</span>
                  <span className={`font-extrabold text-sm ${Number(activeSession.diferencaDecimal) === 0 ? "text-emerald-600" : "text-amber-600"}`}>
                    R$ {Number(activeSession.diferencaDecimal).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              {/* Botões do Motor de Match */}
              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <button onClick={handleApplySuggestions} disabled={loading || !matchResults.length || activeSession.status === "CONCILIADA"} className="rounded border px-3 py-2 text-xs font-bold disabled:opacity-50">Aplicar correspondências exatas</button>
                <button
                  onClick={handleRunAutoMatch}
                  disabled={loading || activeSession.status === "CONCILIADA"}
                  className="flex-1 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 shadow-md transition-all"
                >
                  <Sparkles className="w-5 h-5 text-amber-300 animate-pulse" />
                  Executar Correspondência Automática
                </button>

                {activeSession.status !== "CONCILIADA" && (
                  <button
                    onClick={handleConfirmSession}
                    disabled={loading}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-xl flex items-center justify-center gap-2 shadow transition-all"
                  >
                    <CheckCircle2 className="w-5 h-5" /> Confirmar Conciliação no CeleriFlow
                  </button>
                )}
              </div>

              {confirmReceipt && (
                <div className="p-4 bg-emerald-50 border border-emerald-500 rounded-xl space-y-1 text-xs text-emerald-900 font-mono">
                  <div className="font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Conciliação confirmada e registrada no CeleriFlow!
                  </div>
                  <div>Recibo de Transmissão: <strong>{confirmReceipt.recibo}</strong></div>
                  <div className="truncate">Hash SHA-256: <span className="text-[10px] text-slate-500">{confirmReceipt.hash}</span></div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Tabela de Lançamentos Conciliados e Correspondências (9 Regras) */}
      <FinanceTablePanel label="Correspondências da conciliação" preferenceId="financeiro-correspondencias" resetKey={activeSession?.id ?? ""}
        description={`Total de correspondências: ${matchResults.length}. A aplicação de sugestões continua considerando o conjunto completo.`}
        columns={[financeColumn("rule", "Regra de Correspondência", 90, 200), financeColumn("confidence", "Confiança", 70, 100), financeColumn("description", "Descrição da Match", 120, 380), financeColumn("bank", "Valor Banco", 90, 140, "text", "right"), financeColumn("accounting", "Valor Contábil", 90, 140, "text", "right"), financeColumn("difference", "Diferença", 90, 140, "text", "right")]}
        rows={matchResults.map((match, index) => ({ id: `${match.statementItemId ?? ""}:${match.treasuryMovementId ?? ""}:${index}`, label: match.description, values: { rule: match.type, confidence: `${(match.confidenceScore * 100).toFixed(0)}%`, description: match.description, bank: match.valorBanco !== undefined ? `R$ ${match.valorBanco.toFixed(2)}` : "—", accounting: match.valorContabil !== undefined ? `R$ ${match.valorContabil.toFixed(2)}` : "—", difference: `R$ ${(match.diferenca ?? 0).toFixed(2)}` } }))} />
    </div>
  );
}
