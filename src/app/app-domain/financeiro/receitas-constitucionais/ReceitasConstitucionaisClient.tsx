"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, AlertTriangle, Zap } from "lucide-react";
import FinanceOperationalList from "../FinanceOperationalList";
import { financeColumn } from "../operational-columns";
import { OperationalHeaderActions } from "@/components/app-ui/operational/OperationalWorkspace";
import styles from "@/components/app-ui/operational/operational.module.css";
import { createRuleAction, processConstitutionalRevenueAction, resolveExceptionAction, seedConstitutionalRulesAction } from "./regras-receitas-actions";

interface Rule {
  id: string;
  textoProcurado: string;
  bankAccount: BankAccount | null;
  tipoReceita: string | null;
  naturezaReceita: string | null;
  fonteRecurso: string | null;
  eventoContabil: string | null;
  deducaoAplicavel: boolean;
  prioridade: number;
  exigeConfirmacao: boolean;
  ativo: boolean;
}

interface BankAccount {
  id: string;
  bankName: string;
  agency: string;
  accountNumber: string;
}

interface ExceptionItem {
  id: string;
  statementItemId: string | null;
  descricao: string;
  valorDecimal: unknown;
  dataMovimento: string;
  banco: string;
  contaNumero: string;
  sinal: string;
  scoreConfianca: number;
  sugestaoTipo: string | null;
  motivoExcecao: string;
  status: string;
}

export default function ReceitasConstitucionaisClient({
  initialRules = [],
  initialBankAccounts = [],
  initialExceptions = [],
}: {
  initialRules?: Rule[];
  initialBankAccounts?: BankAccount[];
  initialExceptions?: ExceptionItem[];
}) {
  const [activeTab, setActiveTab] = useState<"regras" | "nova" | "excecoes">("regras");
  const [rules, setRules] = useState<Rule[]>(initialRules);
  const [exceptions, setExceptions] = useState<ExceptionItem[]>(initialExceptions);
  const [previousInitialData, setPreviousInitialData] = useState({ rules: initialRules, exceptions: initialExceptions });
  const router = useRouter();

  // Form para nova regra
  const [textoProcurado, setTextoProcurado] = useState("");
  const [bankAccountId, setBankAccountId] = useState(initialBankAccounts[0]?.id ?? "");
  const [tipoReceita, setTipoReceita] = useState("FPM");
  const [naturezaReceita, setNaturezaReceita] = useState("1.7.1.8.01.2.1.00.00 - Cota-Parte do FPM");
  const [fonteRecurso, setFonteRecurso] = useState("15000000 - Recursos Não Vinculados");
  const [eventoContabil, setEventoContabil] = useState("10.01.01 - Arrecadação de FPM");
  const [deducaoAplicavel, setDeducaoAplicavel] = useState(true);
  const [prioridade, setPrioridade] = useState(1);
  const [exigeConfirmacao, setExigeConfirmacao] = useState(false);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (previousInitialData.rules !== initialRules || previousInitialData.exceptions !== initialExceptions) {
    setPreviousInitialData({ rules: initialRules, exceptions: initialExceptions });
    setRules(initialRules);
    setExceptions(initialExceptions);
  }

  async function handleSeedRules() {
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    const result = await seedConstitutionalRulesAction();
    setLoading(false);

    if (result.error) {
      setErrorMsg(result.error);
      return;
    }

    setSuccessMsg("Regras padrão criadas. Atualizando a tabela...");
    router.refresh();
  }

  async function handleCreateRule(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    const res = await createRuleAction({
      textoProcurado,
      bankAccountId,
      tipoReceita,
      naturezaReceita,
      fonteRecurso,
      eventoContabil,
      deducaoAplicavel,
      prioridade,
      exigeConfirmacao,
    });

    setLoading(false);

    if (res.error) {
      setErrorMsg(res.error);
    } else if (res.data) {
      const rule = res.data;
      setSuccessMsg("Regra configurada e ativada com sucesso!");
      setRules((prev) => [...prev, rule].sort((a, b) => a.prioridade - b.prioridade));
      setTextoProcurado("");
      setActiveTab("regras");
    }
  }

  async function handleResolveException(item: ExceptionItem) {
    setLoading(true);
    const res = item.statementItemId
      ? await processConstitutionalRevenueAction(item.statementItemId)
      : await resolveExceptionAction(item.id, item.descricao);
    setLoading(false);

    if (res.error) {
      alert(res.error);
    } else {
      setExceptions((prev) => prev.filter((ex) => ex.id !== item.id));
      alert(item.statementItemId
        ? "Receita constitucional processada e registrada no CeleriFlow."
        : `Exceção resolvida! A descrição "${item.descricao}" foi adicionada às regras de classificação.`);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <OperationalHeaderActions>

        {/* Tab Buttons */}
        <div className="flex max-w-full flex-wrap items-center gap-1 rounded-md border border-slate-300 bg-slate-50 p-1">
          <button
            onClick={() => setActiveTab("regras")}
            className={`shrink-0 px-3 py-1.5 text-xs font-bold rounded transition-all ${
              activeTab === "regras" ? "bg-white dark:bg-slate-900 text-purple-600 dark:text-purple-400 shadow-sm" : "text-slate-600 dark:text-slate-400"
            }`}
          >
            Tabela de Regras ({rules.length})
          </button>
          <button
            onClick={() => setActiveTab("nova")}
            className={`flex shrink-0 items-center gap-1 rounded px-3 py-1.5 text-xs font-bold transition-all ${
              activeTab === "nova" ? "bg-white dark:bg-slate-900 text-purple-600 dark:text-purple-400 shadow-sm" : "text-slate-600 dark:text-slate-400"
            }`}
          >
            <Plus className="w-3.5 h-3.5" /> Nova Regra
          </button>
          <button
            onClick={() => setActiveTab("excecoes")}
            className={`flex shrink-0 items-center gap-1 rounded px-3 py-1.5 text-xs font-bold transition-all ${
              activeTab === "excecoes" ? "bg-purple-600 text-white shadow-sm" : "text-slate-600 dark:text-slate-400"
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5 text-amber-300" /> Fila de Exceções ({exceptions.length})
          </button>
        </div>
      </OperationalHeaderActions>

      {/* TAB 1: Tabela de Regras (9 Campos Obrigatórios do Edital) */}
      {activeTab === "regras" && (
        <FinanceOperationalList label="Regras de Receitas" preferenceId="financeiro-regras-receitas"
          columns={[financeColumn("priority", "Prioridade", 75), financeColumn("text", "Texto Encontrado", 120, 180), financeColumn("account", "Banco/Conta", 150, 220), financeColumn("type", "Tipo Receita", 95), financeColumn("nature", "Natureza da Receita", 135), financeColumn("source", "Fonte Recurso", 110), financeColumn("event", "Evento Contábil", 120), financeColumn("deduction", "Dedução?", 120), financeColumn("confirmation", "Confirmação?", 130)]}
          toolbar={<><span>Prioridade de execução</span>{errorMsg && <span role="alert">{errorMsg}</span>}{successMsg && <span role="status">{successMsg}</span>}</>}
          actions={!rules.length ? <button className={styles.dialogButton} disabled={loading} onClick={() => void handleSeedRules()}>{loading ? "Criando regras…" : "Criar regras padrão da POC"}</button> : undefined}
          rows={rules.map(rule => ({ id: rule.id, label: rule.textoProcurado, values: { priority: `#${rule.prioridade}`, text: rule.textoProcurado, account: rule.bankAccount ? `${rule.bankAccount.bankName} / ${rule.bankAccount.agency} / ${rule.bankAccount.accountNumber}` : "Conta não vinculada", type: rule.tipoReceita ?? "—", nature: rule.naturezaReceita ?? "—", source: rule.fonteRecurso ?? "—", event: rule.eventoContabil ?? "—", deduction: rule.deducaoAplicavel ? "SIM (20% Fundeb)" : "NÃO", confirmation: rule.exigeConfirmacao ? "SIM (Manual)" : "NÃO (Automático)" } }))} />
      )}

      {/* TAB 2: Nova Regra */}
      {activeTab === "nova" && (
          <div className="mx-auto h-full w-full max-w-3xl space-y-3 overflow-y-auto rounded-md border border-slate-200 bg-white p-3 shadow-none">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-3">
            Cadastrar Nova Regra de Receita Orçamentária
          </h2>

          <form onSubmit={handleCreateRule} className="space-y-4 text-xs">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block font-semibold uppercase mb-1">Texto Procurado (Keywords)</label>
                <input
                  type="text"
                  value={textoProcurado}
                  onChange={(e) => setTextoProcurado(e.target.value)}
                  placeholder="Ex: FPM, ICMS, COTA PARTE..."
                  className="w-full bg-slate-50 dark:bg-slate-800 border p-2.5 rounded-lg text-sm font-mono"
                  required
                />
              </div>
              <div>
                <label className="block font-semibold uppercase mb-1">Banco / Conta</label>
                <select
                  value={bankAccountId}
                  onChange={(e) => setBankAccountId(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border p-2.5 rounded-lg text-sm"
                  required
                >
                  <option value="" disabled>Selecione uma conta</option>
                  {initialBankAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.bankName} / {account.agency} / {account.accountNumber}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block font-semibold uppercase mb-1">Tipo de Receita</label>
                <input
                  type="text"
                  value={tipoReceita}
                  onChange={(e) => setTipoReceita(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border p-2.5 rounded-lg text-sm"
                  required
                />
              </div>
              <div>
                <label className="block font-semibold uppercase mb-1">Natureza da Receita (STN/PCASP)</label>
                <input
                  type="text"
                  value={naturezaReceita}
                  onChange={(e) => setNaturezaReceita(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border p-2.5 rounded-lg text-sm font-mono"
                  required
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block font-semibold uppercase mb-1">Fonte de Recurso</label>
                <input
                  type="text"
                  value={fonteRecurso}
                  onChange={(e) => setFonteRecurso(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border p-2.5 rounded-lg text-sm font-mono"
                  required
                />
              </div>
              <div>
                <label className="block font-semibold uppercase mb-1">Evento Contábil</label>
                <input
                  type="text"
                  value={eventoContabil}
                  onChange={(e) => setEventoContabil(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border p-2.5 rounded-lg text-sm font-mono"
                  required
                />
              </div>
            </div>

            <div className="grid gap-3 pt-2 sm:grid-cols-3">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="deducCheck"
                  checked={deducaoAplicavel}
                  onChange={(e) => setDeducaoAplicavel(e.target.checked)}
                  className="w-4 h-4 text-purple-600 rounded"
                />
                <label htmlFor="deducCheck" className="font-semibold cursor-pointer">Dedução Aplicável (Sim/Não)</label>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="confCheck"
                  checked={exigeConfirmacao}
                  onChange={(e) => setExigeConfirmacao(e.target.checked)}
                  className="w-4 h-4 text-purple-600 rounded"
                />
                <label htmlFor="confCheck" className="font-semibold cursor-pointer">Exige Confirmação (Sim/Não)</label>
              </div>

              <div>
                <label className="block font-semibold uppercase mb-1">Prioridade</label>
                <input
                  type="number"
                  value={prioridade}
                  onChange={(e) => setPrioridade(parseInt(e.target.value) || 1)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border p-2 rounded-lg text-sm"
                />
              </div>
            </div>

            {errorMsg && <div className="p-3 bg-rose-50 text-rose-800 text-xs rounded-lg">{errorMsg}</div>}
            {successMsg && <div className="p-3 bg-emerald-50 text-emerald-800 text-xs rounded-lg">{successMsg}</div>}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-4 rounded-xl shadow-md transition-all"
            >
              {loading ? "Cadastrando..." : "Salvar Regra de Receita"}
            </button>
          </form>
        </div>
      )}

      {/* TAB 3: Fila de Exceções */}
      {activeTab === "excecoes" && (
          <div className="h-full space-y-3 overflow-y-auto rounded-md border border-slate-200 bg-white p-3 shadow-none">
          <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-3">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                Fila de Exceções e Variações
              </h2>
              <p className="text-xs text-slate-500">
                Movimentações bancárias que não coincidiram 100% com as regras padrão. Permite homologação rápida e aprendizado do sistema.
              </p>
            </div>
            <span className="bg-amber-100 text-amber-800 font-bold px-3 py-1 rounded-full text-xs">
              {exceptions.length} Pendentes
            </span>
          </div>

          {exceptions.length === 0 ? (
            <div className="p-8 text-center text-slate-500 italic">
              Nenhuma exceção pendente! Todas as receitas foram classificadas automaticamente.
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {exceptions.map((item) => {
                const valor = typeof item.valorDecimal === "object" ? Number(item.valorDecimal) : Number(item.valorDecimal || 0);

                return (
                  <div key={item.id} className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-xl border border-amber-300 dark:border-amber-900/80 space-y-3 shadow-sm">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="font-mono text-xs font-bold text-slate-900 dark:text-white block">{item.descricao}</span>
                        <span className="text-[11px] text-slate-500 font-mono">
                          {item.banco} | Conta: {item.contaNumero}
                        </span>
                      </div>
                      <span className="text-sm font-extrabold text-emerald-600">
                        R$ {valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </span>
                    </div>

                    <div className="bg-white dark:bg-slate-900 p-2.5 rounded-lg border text-xs space-y-1">
                      <div className="flex justify-between text-slate-500">
                        <span>Motivo da Exceção:</span>
                        <span className="font-semibold text-amber-600">{item.motivoExcecao}</span>
                      </div>
                      <div className="flex justify-between text-slate-500">
                        <span>Sugestão de Receita:</span>
                        <span className="font-bold text-purple-600">{item.sugestaoTipo}</span>
                      </div>
                      <div className="flex justify-between text-slate-500">
                        <span>Score de Confiança:</span>
                        <span className="font-bold text-slate-800 dark:text-slate-200">{(item.scoreConfianca * 100).toFixed(0)}%</span>
                      </div>
                    </div>

                    <button
                      onClick={() => handleResolveException(item)}
                      disabled={loading}
                      className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-3 rounded-lg text-xs flex items-center justify-center gap-1 transition-all shadow"
                    >
                      <Zap className="w-4 h-4 text-amber-300" /> {item.statementItemId ? "Processar Receita Constitucional" : "Aprovar Lançamento & Gerar Regra"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
