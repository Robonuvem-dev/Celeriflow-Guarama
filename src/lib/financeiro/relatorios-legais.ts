import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseExecutor, type DatabaseTransaction } from "@/db/transaction";
import { MUNICIPALITY_NAME } from "@/lib/municipality-identity";
import { resolveFinancialReportScope } from "./report-scope";
import { readPersonnelFiscalPositionInTransaction } from "./personnel-fiscal";
import { listLegalFinancialTreasury, listLegalFinancialWithholdings, listLegalReportAccounts, listLegalReportEntries, listLegalReportTransactions, listRreoRevenues, readPublishedRreoEstimates, readRreoBudgetFacts } from "@/db/repositories/finance/legal-reports";
import { findFinancialScopeYear } from "@/db/repositories/finance/report-scopes";

export type ReportFilter = {
  financialYearId: string;
  governmentEntityId?: string;
  budgetUnitIds?: string[];
  startDate?: Date;
  endDate?: Date;
  budgetUnitId?: string;
};

// --- Diário Contábil ---
export async function generateDiarioContabil(db: DatabaseExecutor, filter: ReportFilter) {
  const transactions = await listLegalReportTransactions(db, filter);

  return transactions.map((t) => ({
    id: t.id,
    date: t.date,
    history: t.history,
    entries: t.entries.map((e) => ({
      accountId: e.accountId,
      accountCode: e.account.code,
      accountName: e.account.name,
      type: e.type,
      value: Number(e.valueDecimal),
    })),
  }));
}

// --- Razão Contábil ---
export async function generateRazaoContabil(db: DatabaseExecutor, filter: ReportFilter & { accountId?: string }) {
  const entries = await listLegalReportEntries(db, filter);

  return entries.map((e) => ({
    id: e.id,
    date: e.transaction?.date ?? new Date(),
    history: e.transaction?.history ?? "",
    accountCode: e.account.code,
    accountName: e.account.name,
    type: e.type,
    value: Number(e.valueDecimal),
  }));
}

// --- Balancete Contábil ---
export async function generateBalanceteContabil(db: DatabaseExecutor, filter: ReportFilter) {
  const accounts = await listLegalReportAccounts(db, filter);

  return accounts.map((acc) => {
    const debitTotal = acc.entries
      .filter((e) => e.type === "Débito")
      .reduce((sum, e) => sum + Number(e.valueDecimal), 0);

    const creditTotal = acc.entries
      .filter((e) => e.type === "Crédito")
      .reduce((sum, e) => sum + Number(e.valueDecimal), 0);

    return {
      id: acc.id,
      code: acc.code,
      name: acc.name,
      debitTotal,
      creditTotal,
      balance: debitTotal - creditTotal,
    };
  });
}

// --- Relatório Resumido da Execução Orçamentária (RREO) ---
export async function generateRREO(db: DatabaseExecutor, filter: ReportFilter) {
  const scope = await resolveFinancialReportScope(db, filter.financialYearId, filter);
  if (!scope.fullEntity) throw new Error("O RREO contém previsões globais e exige acesso a todas as unidades gestoras da entidade.");
  filter = { ...filter, ...scope };
  const dateCond = Boolean(filter.startDate || filter.endDate);

  const [appropriations, revenues, { forecasts, fixations }] = await Promise.all([
    readRreoBudgetFacts(db, filter),
    listRreoRevenues(db, filter),
    readPublishedRreoEstimates(db, filter.financialYearId),
  ]);

  const expenses = appropriations.map((app) => {
    const fixedValue = Number(app.initialValueDecimal ?? app.initialValue);
    const updatedValue = Number(app.updatedValueDecimal ?? app.updatedValue);

    // Apuração do empenhado no período: inclui valor inicial se empenhado no período + movimentos do período
    const committedValue = app.commitments.reduce((sum, c) => {
      const initialInPeriod = !dateCond || (c.date >= (filter.startDate ?? new Date(0)) && c.date <= (filter.endDate ?? new Date("2099-12-31")));
      const initial = initialInPeriod ? Number(c.valueDecimal ?? c.value) : 0;
      const movementNet = c.movements.reduce((mSum, m) => {
        const mVal = Number(m.valueDecimal);
        if (m.type === "Reforço") return mSum + mVal;
        if (m.type === "Anulação") return mSum - mVal;
        return mSum;
      }, 0);
      return sum + initial + movementNet;
    }, 0);

    const settledValue = app.commitments.reduce((sum, c) => {
      return (
        sum +
        c.settlements.reduce((sSum, s) => sSum + Number(s.valueDecimal ?? s.value), 0)
      );
    }, 0);

    const paidValue = app.commitments.reduce((sum, c) => {
      return sum + c.payments.reduce((pSum, p) => pSum + Number(p.valueDecimal ?? p.value), 0);
    }, 0);

    return {
      expenseNatureCode: app.expenseNature.code,
      expenseNatureName: app.expenseNature.name,
      fixedValue,
      updatedValue,
      committedValue,
      settledValue,
      paidValue,
    };
  });

  const expenseSummary = Object.values(expenses.reduce<Record<string, (typeof expenses)[number]>>((summary, item) => {
    const current = summary[item.expenseNatureCode];
    summary[item.expenseNatureCode] = current
      ? {
          ...current,
          fixedValue: current.fixedValue + item.fixedValue,
          updatedValue: current.updatedValue + item.updatedValue,
          committedValue: current.committedValue + item.committedValue,
          settledValue: current.settledValue + item.settledValue,
          paidValue: current.paidValue + item.paidValue,
        }
      : item;
    return summary;
  }, {}));

  const revenueMap: Record<string, { revenueNatureCode: string; revenueNatureName: string; predictedValue: number; realizedValue: number }> = {};

  for (const f of forecasts) {
    const code = f.code;
    revenueMap[code] = {
      revenueNatureCode: code,
      revenueNatureName: f.name,
      predictedValue: Number(f.estimatedValue),
      realizedValue: 0,
    };
  }

  for (const rev of revenues) {
    const code = rev.revenueNature.code;
    const realized = Number(rev.valueDecimal ?? rev.value) * (rev.classification === "REDUTORA" ? -1 : 1);
    if (!revenueMap[code]) {
      revenueMap[code] = {
        revenueNatureCode: code,
        revenueNatureName: rev.revenueNature.name,
        predictedValue: 0,
        realizedValue: realized,
      };
    } else {
      revenueMap[code].realizedValue += realized;
    }
  }

  // Se o relatório for filtrado por Unidade Gestora específica, a despesa fixada legal reflete a dotação da UG
  const municipalFixed = fixations.reduce((sum, f) => sum + Number(f.fixedValue), 0);
  const totalLegalFixedExpense = filter.budgetUnitId
    ? expenseSummary.reduce((sum, e) => sum + e.fixedValue, 0)
    : municipalFixed > 0
    ? municipalFixed
    : expenseSummary.reduce((sum, e) => sum + e.fixedValue, 0);

  return {
    expenseSummary,
    revenueSummary: Object.values(revenueMap),
    totalLegalFixedExpense: totalLegalFixedExpense > 0 ? totalLegalFixedExpense : expenseSummary.reduce((sum, e) => sum + e.fixedValue, 0),
  };
}

// --- Relatório de Gestão Fiscal (RGF - Despesa com Pessoal / LRF) ---
export async function generateRGF(db: DatabaseConnection, filter: ReportFilter) {
  return withDatabaseTransaction(db, tx => generateRGFInTransaction(tx, filter), { isolationLevel: "repeatable read", timeoutMs: 60000 });
}

export async function generateRGFInTransaction(db: DatabaseTransaction, filter: ReportFilter) {
  const scope = await resolveFinancialReportScope(db, filter.financialYearId, filter);
  if (filter.startDate) throw new Error("Pessoal/RCL usa janela de 12 competências; informe somente o corte mensal final.");
  const now = new Date();
  const through = filter.endDate ?? (scope.year === now.getUTCFullYear() ? now.getUTCMonth() ? new Date(Date.UTC(scope.year, now.getUTCMonth(), 1) - 1) : new Date(Date.UTC(scope.year, 0, 1)) : new Date(Date.UTC(scope.year + 1, 0, 1) - 1));
  const position = await readPersonnelFiscalPositionInTransaction(db, { financialYearId: filter.financialYearId, through, governmentEntityId: scope.governmentEntityId ?? undefined, budgetUnitIds: scope.budgetUnitIds });
  const numeric = (value: string | null) => value === null ? null : Number(value);
  return {
    receitaCorrenteLiquida: numeric(position.adjustedRcl),
    despesaTotalPessoal: numeric(position.personnel),
    percentualAtingido: numeric(position.percentage),
    limiteLegal: numeric(position.legalLimit),
    limitePrudencial: numeric(position.prudentialLimit),
    limiteAlerta: numeric(position.alertLimit),
    situacao: position.status,
    memoriaFiscal: position,
  };
}

// --- Balanço Orçamentário ---
export async function generateBalancoOrcamentario(db: DatabaseExecutor, filter: ReportFilter) {
  const rreo = await generateRREO(db, filter);
  const totalReceitaPrevista = rreo.revenueSummary.reduce((sum, r) => sum + r.predictedValue, 0);
  const totalReceitaRealizada = rreo.revenueSummary.reduce((sum, r) => sum + r.realizedValue, 0);
  const totalDespesaFixada = rreo.totalLegalFixedExpense;
  const totalDespesaEmpenhada = rreo.expenseSummary.reduce((sum, e) => sum + e.committedValue, 0);
  const totalDespesaLiquidada = rreo.expenseSummary.reduce((sum, e) => sum + e.settledValue, 0);
  const totalDespesaPaga = rreo.expenseSummary.reduce((sum, e) => sum + e.paidValue, 0);
  const superavitDeficitOrcamentario = totalReceitaRealizada - totalDespesaEmpenhada;

  return {
    receitas: rreo.revenueSummary,
    despesas: rreo.expenseSummary,
    totais: {
      totalReceitaPrevista,
      totalReceitaRealizada,
      totalDespesaFixada,
      totalDespesaEmpenhada,
      totalDespesaLiquidada,
      totalDespesaPaga,
      superavitDeficitOrcamentario,
    },
  };
}

// --- Balanço Patrimonial ---
export async function generateBalancoPatrimonial(db: DatabaseExecutor, filter: ReportFilter) {
  filter = { ...filter, ...await resolveFinancialReportScope(db, filter.financialYearId, filter) };
  const accounts = await listLegalReportAccounts(db, filter);

  // Ativo: Contas da classe 1 (Ativo Circulante e Não Circulante)
  const ativo = accounts.filter((acc) => acc.code.startsWith("1")).map((acc) => {
    const debit = acc.entries.filter((e) => e.type === "Débito").reduce((s, e) => s + Number(e.valueDecimal), 0);
    const credit = acc.entries.filter((e) => e.type === "Crédito").reduce((s, e) => s + Number(e.valueDecimal), 0);
    return { code: acc.code, name: acc.name, balance: debit - credit };
  });

  // Passivo: Contas da classe 2 (EXCETO classe 2.3 que é Patrimônio Líquido)
  const passivo = accounts.filter((acc) => acc.code.startsWith("2.") && !acc.code.startsWith("2.3")).map((acc) => {
    const debit = acc.entries.filter((e) => e.type === "Débito").reduce((s, e) => s + Number(e.valueDecimal), 0);
    const credit = acc.entries.filter((e) => e.type === "Crédito").reduce((s, e) => s + Number(e.valueDecimal), 0);
    return { code: acc.code, name: acc.name, balance: credit - debit };
  });

  // Patrimônio Líquido: Exclusivamente contas da classe 2.3
  const patrimonioLiquido = accounts.filter((acc) => acc.code.startsWith("2.3")).map((acc) => {
    const debit = acc.entries.filter((e) => e.type === "Débito").reduce((s, e) => s + Number(e.valueDecimal), 0);
    const credit = acc.entries.filter((e) => e.type === "Crédito").reduce((s, e) => s + Number(e.valueDecimal), 0);
    return { code: acc.code, name: acc.name, balance: credit - debit };
  });

  const totalAtivo = ativo.reduce((s, a) => s + a.balance, 0);
  const totalPassivo = passivo.reduce((s, p) => s + p.balance, 0);
  const totalPatrimonioLiquido = patrimonioLiquido.reduce((s, pl) => s + pl.balance, 0);

  return {
    ativo,
    passivo,
    patrimonioLiquido,
    totais: {
      totalAtivo,
      totalPassivo,
      totalPatrimonioLiquido,
      balancoEquilibrado: Math.abs(totalAtivo - (totalPassivo + totalPatrimonioLiquido)) < 0.01,
    },
  };
}

// --- Balanço Financeiro (MCASP / Anexo 13 da Lei 4.320/64) ---
export async function generateBalancoFinanceiro(db: DatabaseExecutor, filter: ReportFilter) {
  filter = { ...filter, ...await resolveFinancialReportScope(db, filter.financialYearId, filter) };
  const [rreo, financialYear, treasuryMovements, withholdings] = await Promise.all([
    generateRREO(db, filter),
    findFinancialScopeYear(db, filter.financialYearId),
    listLegalFinancialTreasury(db, filter),
    listLegalFinancialWithholdings(db, filter),
  ]);
  if (!financialYear) throw new Error("Exercício financeiro não encontrado para o Balanço Financeiro.");

  const receitaOrcamentariaRealizada = rreo.revenueSummary.reduce((s, r) => s + r.realizedValue, 0);
  const despesaOrcamentariaPaga = rreo.expenseSummary.reduce((s, e) => s + e.paidValue, 0);

  const receitasExtraorcamentarias = withholdings
    .filter((w) => w.status === "Recolhida" || w.status === "Pendente")
    .reduce((s, w) => s + Number(w.valueDecimal), 0);

  const despesasExtraorcamentarias = withholdings
    .filter((w) => w.status === "Recolhida")
    .reduce((s, w) => s + Number(w.valueDecimal), 0);

  const signedTreasuryValue = (direction: string, value: number) => {
    if (["Entrada", "CREDIT"].includes(direction)) return Math.abs(value);
    if (["Saída", "DEBIT"].includes(direction)) return -Math.abs(value);
    throw new Error(`Direção de tesouraria inválida no Balanço Financeiro: ${direction}.`);
  };
  const saldoInicialCaixaBancos = treasuryMovements
    .filter((movement) => movement.date < financialYear.startDate)
    .reduce((total, movement) => total + signedTreasuryValue(movement.direction, Number(movement.valueDecimal)), 0);
  const saldoAtualCaixaBancos = treasuryMovements
    .filter((movement) => movement.date <= financialYear.endDate)
    .reduce((total, movement) => total + signedTreasuryValue(movement.direction, Number(movement.valueDecimal)), 0);

  const totalIngressos = receitaOrcamentariaRealizada + receitasExtraorcamentarias + saldoInicialCaixaBancos;
  const totalDispendios = despesaOrcamentariaPaga + despesasExtraorcamentarias + saldoAtualCaixaBancos;

  return {
    ingressos: {
      receitaOrcamentaria: receitaOrcamentariaRealizada,
      receitaExtraorcamentaria: receitasExtraorcamentarias,
      saldoExercícioAnterior: saldoInicialCaixaBancos,
      totalIngressos,
    },
    dispendios: {
      despesaOrcamentaria: despesaOrcamentariaPaga,
      despesaExtraorcamentaria: despesasExtraorcamentarias,
      saldoExercícioSeguinte: saldoAtualCaixaBancos,
      totalDispendios,
    },
    equilibrado: Math.abs(totalIngressos - totalDispendios) < 0.01,
  };
}

// --- Demonstração das Variações Patrimoniais (DVP / MCASP) ---
export async function generateDVP(db: DatabaseExecutor, filter: ReportFilter) {
  filter = { ...filter, ...await resolveFinancialReportScope(db, filter.financialYearId, filter) };
  const accounts = await listLegalReportAccounts(db, filter);

  // VPA: Variações Patrimoniais Aumentativas (Classe 4 do PCASP)
  const vpaAccounts = accounts.filter((acc) => acc.code.startsWith("4"));
  const vpa = vpaAccounts.map((acc) => {
    const credit = acc.entries.filter((e) => e.type === "Crédito").reduce((s, e) => s + Number(e.valueDecimal), 0);
    const debit = acc.entries.filter((e) => e.type === "Débito").reduce((s, e) => s + Number(e.valueDecimal), 0);
    return { code: acc.code, name: acc.name, value: credit - debit };
  }).filter((acc) => Math.abs(acc.value) > 0.001);

  // VPD: Variações Patrimoniais Diminuídas (Classe 3 do PCASP)
  const vpdAccounts = accounts.filter((acc) => acc.code.startsWith("3"));
  const vpd = vpdAccounts.map((acc) => {
    const debit = acc.entries.filter((e) => e.type === "Débito").reduce((s, e) => s + Number(e.valueDecimal), 0);
    const credit = acc.entries.filter((e) => e.type === "Crédito").reduce((s, e) => s + Number(e.valueDecimal), 0);
    return { code: acc.code, name: acc.name, value: debit - credit };
  }).filter((acc) => Math.abs(acc.value) > 0.001);

  const totalVPA = vpa.reduce((s, a) => s + a.value, 0);
  const totalVPD = vpd.reduce((s, a) => s + a.value, 0);
  const resultadoPatrimonial = totalVPA - totalVPD;

  return {
    variacoesAumentativas: vpa,
    variacoesDiminuidas: vpd,
    totais: {
      totalVPA,
      totalVPD,
      resultadoPatrimonial,
      situacao: resultadoPatrimonial >= 0 ? "SUPERAVIT_PATRIMONIAL" : "DEFICIT_PATRIMONIAL",
    },
  };
}

// --- Demonstração dos Fluxos de Caixa (DFC / MCASP) ---
export async function generateDemonstracaoFluxosCaixa(db: DatabaseExecutor, filter: ReportFilter) {
  const [bf] = await Promise.all([generateBalancoFinanceiro(db, filter)]);

  const fluxoOperacional = bf.ingressos.receitaOrcamentaria - bf.dispendios.despesaOrcamentaria;
  const fluxoInvestimento = 0; // Recursos direcionados a investimentos fixos
  const fluxoFinanciamento = bf.ingressos.receitaExtraorcamentaria - bf.dispendios.despesaExtraorcamentaria;
  const geracaoLiquidaCaixa = fluxoOperacional + fluxoInvestimento + fluxoFinanciamento;

  return {
    fluxoOperacional,
    fluxoInvestimento,
    fluxoFinanciamento,
    geracaoLiquidaCaixa,
    saldoInicialCaixa: bf.ingressos.saldoExercícioAnterior,
    saldoFinalCaixa: bf.dispendios.saldoExercícioSeguinte,
    conciliado: Math.abs((bf.ingressos.saldoExercícioAnterior + geracaoLiquidaCaixa) - bf.dispendios.saldoExercícioSeguinte) < 0.01,
  };
}

// --- Prestação de Contas Anual Completa (PCA) ---
export async function generatePCA(db: DatabaseConnection, filter: ReportFilter) {
  return withDatabaseTransaction(db, tx => generatePCAInTransaction(tx, filter), { isolationLevel: "repeatable read", timeoutMs: 60000 });
}

export async function generatePCAInTransaction(db: DatabaseTransaction, filter: ReportFilter) {
  const [
    balancoOrcamentario,
    balancoPatrimonial,
    balancoFinanceiro,
    dvp,
    dfc,
    rreo,
    rgf,
  ] = await Promise.all([
    generateBalancoOrcamentario(db, filter),
    generateBalancoPatrimonial(db, filter),
    generateBalancoFinanceiro(db, filter),
    generateDVP(db, filter),
    generateDemonstracaoFluxosCaixa(db, filter),
    generateRREO(db, filter),
    generateRGFInTransaction(db, filter),
  ]);

  const notasExplicativas = [
    {
      num: 1,
      titulo: "Contexto Operacional e Unidades Gestoras",
      conteudo: `A Prestação de Contas Anual consolida a execução orçamentária, financeira e patrimonial do Município de ${MUNICIPALITY_NAME}, abrangendo a Administração Direta e Indireta.`,
    },
    {
      num: 2,
      titulo: "Critérios de Apuração Orçamentária e Patrimonial",
      conteudo: "As receitas orçamentárias foram reconhecidas pelo regime de caixa e as despesas pelo regime de competência/empenho, observando rigorosamente os ditames do MCASP e da LRF (LC 101/2000).",
    },
    {
      num: 3,
      titulo: "Cumprimento dos Limites Legais Fiscais (LRF)",
      conteudo: rgf.situacao === "NOT_EVALUATED" ? `Despesa com pessoal/RCL não apurada: ${rgf.memoriaFiscal.issues.join(" ")}` : `A Despesa Total com Pessoal encerrou as 12 competências em ${rgf.percentualAtingido}% da RCL ajustada, em situação ${rgf.situacao} perante o limite legal configurado de ${rgf.limiteLegal}%.`,
    },
  ];

  return {
    exercicioFiscalId: filter.financialYearId,
    dataEmissao: new Date().toISOString(),
    statusConformidade: rgf.situacao === "EXCEDIDO" ? "IRREGULAR" : "REGULAR_COM_ATENCAO",
    demonstrativos: {
      balancoOrcamentario,
      balancoPatrimonial,
      balancoFinanceiro,
      dvp,
      dfc,
      rreo,
      rgf,
    },
    notasExplicativas,
  };
}
