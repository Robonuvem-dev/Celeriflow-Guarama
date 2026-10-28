import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseTransaction } from "@/db/transaction";
import { resolveFinancialReportScope } from "./report-scope";
import { listFinanceGuidelineDocuments, listFinanceLawDocuments, listFinancePlanDocuments, listFinanceReportCredits, listFinanceReportUnits } from "@/db/repositories/finance/report-planning-data";
import { insertPublicFinanceDocumentVersion, listReportMonthlyCloses, listReportOriginPayables, listReportReconciliations, listReportTreasuryMovements } from "@/db/repositories/finance/report-delivery";
import { findAnnualAccountingClose } from "@/db/repositories/finance/accounting-closes";
import {
  generateBalancoOrcamentario,
  generateBalancoPatrimonial,
  generateBalanceteContabil,
  generateDiarioContabil,
  generateRazaoContabil,
  generateRGFInTransaction,
  generateRREO,
} from "@/lib/financeiro/relatorios-legais";
import { createDefaultReportTemplate } from "@/lib/reports/report-template";
import { renderTabularCsv } from "@/lib/reports/tabular-renderers";
import { uploadGeneratedReport } from "@/lib/platform/blob";
import { isPublicFinancialReportType, publicFinancialReportDocumentType, type PublicFinancialReportType } from "@/lib/transparencia/portal-public";

export type ReportRow = Record<string, string | number>;
export type ReportSection = { title: string; rows: ReportRow[] };
export type InternalReportStatus = "INTERNAL_REVIEW" | "INTERNAL_PARTIAL";
export type InternalReportMetadata = {
  status: InternalReportStatus;
  scope: string;
  referencePeriod: string;
  statutoryCompleteness: "NOT_STATUTORY";
  publicSnapshotEligible: boolean;
  publicSnapshotCondition: string;
};
export type InternalReportDataset = {
  title: string;
  year: number;
  warnings: string[];
  metadata: InternalReportMetadata;
  sections: ReportSection[];
};

const legalReportOptions = [
  { type: "DIARIO", label: "Diário Contábil", group: "Contabilidade" },
  { type: "RAZAO", label: "Razão Contábil", group: "Contabilidade" },
  { type: "BALANCETE", label: "Balancete Contábil Acumulado", group: "Contabilidade" },
  { type: "BALANCETE_MENSAL", label: "Balancete Contábil Mensal", group: "Contabilidade" },
  { type: "RREO", label: "RREO", group: "Relatórios legais internos" },
  { type: "RGF", label: "RGF", group: "Relatórios legais internos" },
  { type: "BALANCO_ORCAMENTARIO", label: "Balanço Orçamentário", group: "Relatórios legais internos" },
  { type: "BALANCO_PATRIMONIAL", label: "Balanço Patrimonial", group: "Relatórios legais internos" },
] as const;

const planningReportOptions = [
  { type: "PPA", label: "PPA", group: "Planejamento" },
  { type: "LDO", label: "LDO", group: "Planejamento" },
  { type: "LOA", label: "LOA", group: "Planejamento" },
  { type: "CMD", label: "CMD - Cronograma Mensal de Desembolso", group: "Planejamento" },
  { type: "MBA", label: "MBA - Meta Bimestral de Arrecadação", group: "Planejamento" },
  { type: "PPA_ANEXO_METAS", label: "PPA - Anexo de Programas, Ações e Metas", group: "Planejamento" },
  { type: "LDO_ANEXO_PRIORIDADES_RISCOS", label: "LDO - Anexo de Prioridades e Riscos", group: "Planejamento" },
  { type: "LOA_ANEXO_PROGRAMACAO", label: "LOA - Anexo de Programação Orçamentária", group: "Planejamento" },
] as const;

const accountingReportOptions = [
  { type: "PCA", label: "PCA - Prestação de Contas Anual interna", group: "Encerramento anual" },
  { type: "BALANCO_FINANCEIRO", label: "Balanço Financeiro - Síntese de Tesouraria", group: "Encerramento anual" },
  { type: "FLUXO_CAIXA_ANUAL", label: "Fluxo de Caixa Anual - Síntese de Tesouraria", group: "Encerramento anual" },
  { type: "CONCILIACAO_TESOURARIA", label: "Relatório de Conciliações Bancárias", group: "Tesouraria" },
] as const;

export const financialReportOptions = [...legalReportOptions, ...planningReportOptions, ...accountingReportOptions] as const;
export type InternalReportType = (typeof financialReportOptions)[number]["type"];
// Kept as an alias for existing consumers of the financial-report delivery API.
export type FinancialReportType = InternalReportType;
export type ReportFormat = "CSV" | "PDF" | "XLSX" | "TXT";

const internalReportWarning = "Documento interno gerado a partir dos dados registrados no CeleriFlow. Não corresponde a leiaute oficial de TCE, STN ou SICONFI.";
const partialReportWarning = "Conteúdo parcial: a disponibilidade dos dados não comprova completude estatutária, legal ou de prestação de contas.";
const monthNames = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export function isFinancialReportType(value: string | null): value is InternalReportType {
  return financialReportOptions.some((option) => option.type === value);
}

export function isReportFormat(value: string | null): value is ReportFormat {
  return value === "CSV" || value === "PDF" || value === "XLSX" || value === "TXT";
}

export function isReportMonth(value: number | null): value is number {
  return value !== null && Number.isInteger(value) && value >= 1 && value <= 12;
}

export function reportRequiresMonth(reportType: InternalReportType) {
  return reportType === "BALANCETE_MENSAL";
}

export function financialReportFilename(reportType: InternalReportType, year: number, format: ReportFormat = "CSV") {
  return `relatorio-${reportType.toLowerCase()}-${year}.${format.toLowerCase()}`;
}

function isoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function reportMetadata(
  reportType: InternalReportType,
  year: number,
  input: { status?: InternalReportStatus; scope?: string; referencePeriod?: string; publicSnapshotCondition?: string } = {},
): InternalReportMetadata {
  const publicSnapshotEligible = isPublicFinancialReportType(reportType);
  return {
    status: input.status ?? "INTERNAL_REVIEW",
    scope: input.scope ?? "Exercício consolidado",
    referencePeriod: input.referencePeriod ?? `Exercício ${year}`,
    statutoryCompleteness: "NOT_STATUTORY",
    publicSnapshotEligible,
    publicSnapshotCondition: publicSnapshotEligible
      ? input.publicSnapshotCondition ?? "A publicação depende de emissão administrativa; balanços anuais exigem encerramento anual."
      : "Não aprovado para snapshot público neste escopo interno.",
  };
}

function accountingDataset(title: string, reportType: InternalReportType, year: number, sections: ReportSection[], metadata?: Parameters<typeof reportMetadata>[2]): InternalReportDataset {
  return { title, year, warnings: [internalReportWarning], metadata: reportMetadata(reportType, year, metadata), sections };
}

function ppaRows(plan: {
  code: string;
  name: string;
  startYear: number;
  endYear: number;
  status: string;
  description: string | null;
  programs: {
    code: string;
    name: string;
    type: string;
    objectives: { code: string; description: string; indicators: { name: string; unit: string; baselineValue: number; targetValue: number }[] }[];
    actions: { code: string; name: string; type: string; goals: { year: number; physical: number; financial: unknown }[] }[];
  }[];
}): ReportSection[] {
  return [
    {
      title: "Identificação",
      rows: [{ codigo: plan.code, nome: plan.name, vigenciaInicial: plan.startYear, vigenciaFinal: plan.endYear, situacao: plan.status, descricao: plan.description ?? "" }],
    },
    {
      title: "Programas, objetivos e indicadores",
      rows: plan.programs.flatMap<ReportRow>((program) => program.objectives.flatMap<ReportRow>((objective) =>
        objective.indicators.length
          ? objective.indicators.map<ReportRow>((indicator) => ({ programaCodigo: program.code, programa: program.name, tipoPrograma: program.type, objetivoCodigo: objective.code, objetivo: objective.description, indicador: indicator.name, unidade: indicator.unit, linhaBase: indicator.baselineValue, meta: indicator.targetValue }))
          : [{ programaCodigo: program.code, programa: program.name, tipoPrograma: program.type, objetivoCodigo: objective.code, objetivo: objective.description, indicador: "", unidade: "", linhaBase: "", meta: "" }],
      )),
    },
    {
      title: "Ações e metas",
      rows: plan.programs.flatMap<ReportRow>((program) => program.actions.flatMap<ReportRow>((action) =>
        action.goals.length
          ? action.goals.map<ReportRow>((goal) => ({ programaCodigo: program.code, programa: program.name, acaoCodigo: action.code, acao: action.name, tipoAcao: action.type, ano: goal.year, metaFisica: goal.physical, metaFinanceira: Number(goal.financial) }))
          : [{ programaCodigo: program.code, programa: program.name, acaoCodigo: action.code, acao: action.name, tipoAcao: action.type, ano: "", metaFisica: "", metaFinanceira: "" }],
      )),
    },
  ];
}

export async function generateInternalReportDataset(
  connection: DatabaseConnection,
  reportType: InternalReportType,
  financialYearId: string,
  year: number,
  options: { month?: number } = {},
  scope: { governmentEntityId?: string; budgetUnitIds?: string[] } = {},
): Promise<InternalReportDataset> {
  return withDatabaseTransaction(connection, tx => generateInternalReportDatasetInTransaction(tx, reportType, financialYearId, year, options, scope), { isolationLevel: "repeatable read", timeoutMs: 60000 });
}

export async function generateInternalReportDatasetInTransaction(
  db: DatabaseTransaction,
  reportType: InternalReportType,
  financialYearId: string,
  year: number,
  options: { month?: number } = {},
  scope: { governmentEntityId?: string; budgetUnitIds?: string[] } = {},
): Promise<InternalReportDataset> {
  const resolvedScope = await resolveFinancialReportScope(db, financialYearId, scope);
  if (resolvedScope.year !== year) throw new Error("O ano do relatório diverge do exercício financeiro.");
  const filter = { financialYearId, ...resolvedScope };
  const entityReports = ["PPA", "LDO", "LOA", "MBA", "PPA_ANEXO_METAS", "LDO_ANEXO_PRIORIDADES_RISCOS", "LOA_ANEXO_PROGRAMACAO"];
  if (entityReports.includes(reportType) && !resolvedScope.fullEntity) throw new Error("Este demonstrativo contém totais da entidade e exige acesso a todas as suas unidades gestoras.");

  switch (reportType) {
    case "DIARIO": {
      const report = await generateDiarioContabil(db, filter);
      return accountingDataset("Diário Contábil", reportType, year, [{ title: "Lançamentos", rows: report.flatMap((transaction) => transaction.entries.map((entry) => ({ data: isoDate(transaction.date), historico: transaction.history, contaCodigo: entry.accountCode, contaNome: entry.accountName, tipo: entry.type, valor: entry.value }))) }]);
    }
    case "RAZAO": {
      const report = await generateRazaoContabil(db, filter);
      return accountingDataset("Razão Contábil", reportType, year, [{ title: "Lançamentos por conta", rows: report.map((entry) => ({ data: isoDate(entry.date), historico: entry.history, contaCodigo: entry.accountCode, contaNome: entry.accountName, tipo: entry.type, valor: entry.value })) }]);
    }
    case "BALANCETE": {
      const report = await generateBalanceteContabil(db, filter);
      return accountingDataset("Balancete Contábil Acumulado", reportType, year, [{ title: "Saldos por conta", rows: report.map((account) => ({ contaCodigo: account.code, contaNome: account.name, totalDebitos: account.debitTotal, totalCreditos: account.creditTotal, saldo: account.balance })) }]);
    }
    case "BALANCETE_MENSAL": {
      const reportMonth = options.month ?? null;
      if (!isReportMonth(reportMonth)) throw new Error("Informe um mês válido para o balancete mensal.");
      const startDate = new Date(Date.UTC(year, reportMonth - 1, 1));
      const endDate = new Date(Date.UTC(year, reportMonth, 0, 23, 59, 59, 999));
      const [report, closes] = await Promise.all([
        generateBalanceteContabil(db, { ...filter, startDate, endDate }),
        listReportMonthlyCloses(db, financialYearId, startDate, endDate),
      ]);
      const month = monthNames[reportMonth - 1];
      return accountingDataset("Balancete Contábil Mensal", reportType, year, [
        { title: "Situação do fechamento mensal", rows: closes.map((close) => ({ competencia: isoDate(close.competence), situacao: close.status, encerradoEm: close.closedAt ? isoDate(close.closedAt) : "", pendenciasRegistradas: close.pendingSummary ? "Sim" : "Não" })) },
        { title: "Movimentação do mês por conta", rows: report.map((account) => ({ contaCodigo: account.code, contaNome: account.name, totalDebitos: account.debitTotal, totalCreditos: account.creditTotal, saldoMovimentacao: account.balance })) },
      ], { scope: "Mensal", referencePeriod: `${month[0].toUpperCase()}${month.slice(1)} de ${year}`, publicSnapshotCondition: "O balancete mensal interno não possui aprovação para snapshot público." });
    }
    case "RREO": {
      const report = await generateRREO(db, filter);
      return accountingDataset("RREO", reportType, year, [
        { title: "Receitas", rows: report.revenueSummary.map((revenue) => ({ codigo: revenue.revenueNatureCode, descricao: revenue.revenueNatureName, valorPrevisto: revenue.predictedValue, valorRealizado: revenue.realizedValue })) },
        { title: "Despesas", rows: report.expenseSummary.map((expense) => ({ codigo: expense.expenseNatureCode, descricao: expense.expenseNatureName, valorFixado: expense.fixedValue, valorAtualizado: expense.updatedValue, valorEmpenhado: expense.committedValue, valorLiquidado: expense.settledValue, valorPago: expense.paidValue })) },
        { title: "Totais", rows: [{ descricao: "Despesa fixada legal", valorFixado: report.totalLegalFixedExpense }] },
      ]);
    }
    case "RGF": {
      const report = await generateRGFInTransaction(db, filter);
      return accountingDataset("RGF", reportType, year, [{ title: "Despesa com pessoal — 12 competências", rows: [{ receitaCorrenteLiquida: report.receitaCorrenteLiquida ?? "Não apurada", despesaTotalPessoal: report.despesaTotalPessoal ?? "Não apurada", percentualAtingido: report.percentualAtingido ?? "Não apurado", limiteLegal: report.limiteLegal ?? "Não configurado", limitePrudencial: report.limitePrudencial ?? "Não configurado", limiteAlerta: report.limiteAlerta ?? "Não configurado", situacao: report.situacao, inicio: report.memoriaFiscal.from, corte: report.memoriaFiscal.through, composicaoId: report.memoriaFiscal.definitionId ?? "", fundamento: report.memoriaFiscal.legalReference ?? "", pendencias: report.memoriaFiscal.issues.join(" "), hash: report.memoriaFiscal.sourceHash ?? "" }] }, { title: "Composição e origens contábeis", rows: report.memoriaFiscal.rows.map(row => ({ secao: row.section, componente: row.label, valor: row.amount, partidas: row.entryIds.join(", ") })) }]);
    }
    case "BALANCO_ORCAMENTARIO": {
      const report = await generateBalancoOrcamentario(db, filter);
      return accountingDataset("Balanço Orçamentário", reportType, year, [
        { title: "Receitas", rows: report.receitas.map((revenue) => ({ codigo: revenue.revenueNatureCode, descricao: revenue.revenueNatureName, valorPrevisto: revenue.predictedValue, valorRealizado: revenue.realizedValue })) },
        { title: "Despesas", rows: report.despesas.map((expense) => ({ codigo: expense.expenseNatureCode, descricao: expense.expenseNatureName, valorFixado: expense.fixedValue, valorEmpenhado: expense.committedValue, valorLiquidado: expense.settledValue, valorPago: expense.paidValue })) },
        { title: "Totais", rows: Object.entries(report.totais).map(([descricao, valor]) => ({ descricao, valor })) },
      ]);
    }
    case "BALANCO_PATRIMONIAL": {
      const report = await generateBalancoPatrimonial(db, filter);
      return accountingDataset("Balanço Patrimonial", reportType, year, [
        { title: "Ativo", rows: report.ativo.map((account) => ({ contaCodigo: account.code, contaNome: account.name, saldo: account.balance })) },
        { title: "Passivo", rows: report.passivo.map((account) => ({ contaCodigo: account.code, contaNome: account.name, saldo: account.balance })) },
        { title: "Patrimônio líquido", rows: report.patrimonioLiquido.map((account) => ({ contaCodigo: account.code, contaNome: account.name, saldo: account.balance })) },
        { title: "Totais", rows: Object.entries(report.totais).map(([descricao, valor]) => ({ descricao, valor: typeof valor === "boolean" ? (valor ? "Sim" : "Não") : valor })) },
      ]);
    }
    case "PPA": {
      const plans = await listFinancePlanDocuments(db, { year, governmentEntityId: filter.governmentEntityId });
      return { title: "PPA", year, warnings: [internalReportWarning, partialReportWarning], metadata: reportMetadata(reportType, year, { status: "INTERNAL_PARTIAL", scope: "Planejamento plurianual" }), sections: plans.flatMap(ppaRows) };
    }
    case "LDO": {
      const guidelines = await listFinanceGuidelineDocuments(db, { financialYearId });
      return { title: "LDO", year, warnings: [internalReportWarning, partialReportWarning], metadata: reportMetadata(reportType, year, { status: "INTERNAL_PARTIAL", scope: "Diretrizes do exercício" }), sections: [
        { title: "Diretrizes", rows: guidelines.map((guideline) => ({ ppaCodigo: guideline.multiYearPlan?.code ?? "", ppa: guideline.multiYearPlan?.name ?? "", situacao: guideline.status })) },
        { title: "Prioridades", rows: guidelines.flatMap((guideline) => guideline.priorities.map((priority) => ({ diretriz: guideline.multiYearPlan?.code ?? "Sem PPA vinculado", descricao: priority.description, meta: priority.targetValue === null ? "" : Number(priority.targetValue) }))) },
        { title: "Riscos fiscais", rows: guidelines.flatMap((guideline) => guideline.risks.map((risk) => ({ diretriz: guideline.multiYearPlan?.code ?? "Sem PPA vinculado", descricao: risk.description, impactoEstimado: Number(risk.estimatedImpact), mitigacao: risk.mitigation }))) },
      ] };
    }
    case "LOA": {
      const laws = await listFinanceLawDocuments(db, { financialYearId });
      return { title: "LOA", year, warnings: [internalReportWarning, partialReportWarning], metadata: reportMetadata(reportType, year, { status: "INTERNAL_PARTIAL", scope: "Orçamento anual" }), sections: [
        { title: "Leis orçamentárias", rows: laws.map((law) => ({ numeroLei: law.lawNumber, publicacao: law.publicationDate ? isoDate(law.publicationDate) : "PENDENTE", situacao: law.status, receitaTotal: Number(law.totalRevenue), despesaTotal: Number(law.totalExpense) })) },
        { title: "Previsão de receitas", rows: laws.flatMap((law) => law.revenueForecasts.map((forecast) => ({ numeroLei: law.lawNumber, codigo: forecast.code, descricao: forecast.name, valorPrevisto: Number(forecast.estimatedValue) }))) },
        { title: "Fixação de despesas", rows: laws.flatMap((law) => law.expenseFixations.map((fixation) => ({ numeroLei: law.lawNumber, codigo: fixation.code, descricao: fixation.name, valorFixado: Number(fixation.fixedValue) }))) },
      ] };
    }
    case "CMD": {
      const laws = await listFinanceLawDocuments(db, { financialYearId, cmdUnitIds: filter.budgetUnitIds, cmdUnitOrder: true });
      const unitIds = [...new Set(laws.flatMap((law) => law.cmdSchedules.map((schedule) => schedule.budgetUnitId)))];
      const units = await listFinanceReportUnits(db, unitIds);
      const unitsById = new Map(units.map((unit) => [unit.id, unit]));
      return { title: "CMD - Cronograma Mensal de Desembolso", year, warnings: [internalReportWarning, partialReportWarning], metadata: reportMetadata(reportType, year, { status: "INTERNAL_PARTIAL", scope: "Programação mensal" }), sections: [{ title: "Limites mensais", rows: laws.flatMap((law) => law.cmdSchedules.map((schedule) => {
        const unit = unitsById.get(schedule.budgetUnitId);
        return { numeroLei: law.lawNumber, unidadeCodigo: unit?.code ?? "UG não encontrada", unidade: unit?.name ?? "Unidade não encontrada", mes: schedule.month, limite: Number(schedule.limitValue) };
      })) }] };
    }
    case "MBA": {
      const laws = await listFinanceLawDocuments(db, { financialYearId });
      return { title: "MBA - Meta Bimestral de Arrecadação", year, warnings: [internalReportWarning, partialReportWarning], metadata: reportMetadata(reportType, year, { status: "INTERNAL_PARTIAL", scope: "Programação bimestral" }), sections: [{ title: "Metas bimestrais", rows: laws.flatMap((law) => law.mbaTargets.map((target) => ({ numeroLei: law.lawNumber, bimestre: target.bimonth, metaArrecadacao: Number(target.targetValue) }))) }] };
    }
    case "PPA_ANEXO_METAS": {
      const plans = await listFinancePlanDocuments(db, { year, governmentEntityId: filter.governmentEntityId, goalYear: year });
      return { title: "PPA - Anexo de Programas, Ações e Metas", year, warnings: [internalReportWarning, partialReportWarning, "Anexo interno: não substitui os anexos obrigatórios definidos pela legislação aplicável."], metadata: reportMetadata(reportType, year, { status: "INTERNAL_PARTIAL", scope: "Anexo de planejamento PPA" }), sections: plans.flatMap(ppaRows) };
    }
    case "LDO_ANEXO_PRIORIDADES_RISCOS": {
      const guidelines = await listFinanceGuidelineDocuments(db, { financialYearId });
      return { title: "LDO - Anexo de Prioridades e Riscos", year, warnings: [internalReportWarning, partialReportWarning, "Anexo interno: não substitui os anexos obrigatórios definidos pela legislação aplicável."], metadata: reportMetadata(reportType, year, { status: "INTERNAL_PARTIAL", scope: "Anexo de planejamento LDO" }), sections: [
        { title: "Prioridades e metas", rows: guidelines.flatMap((guideline) => guideline.priorities.map((priority) => ({ ppaCodigo: guideline.multiYearPlan?.code ?? "", ppa: guideline.multiYearPlan?.name ?? "", descricao: priority.description, meta: priority.targetValue === null ? "" : Number(priority.targetValue) }))) },
        { title: "Riscos fiscais", rows: guidelines.flatMap((guideline) => guideline.risks.map((risk) => ({ ppaCodigo: guideline.multiYearPlan?.code ?? "", ppa: guideline.multiYearPlan?.name ?? "", descricao: risk.description, impactoEstimado: Number(risk.estimatedImpact), mitigacao: risk.mitigation }))) },
      ] };
    }
    case "LOA_ANEXO_PROGRAMACAO": {
      const laws = await listFinanceLawDocuments(db, { financialYearId });
      const credits = await listFinanceReportCredits(db, financialYearId);
      return { title: "LOA - Anexo de Programação Orçamentária", year, warnings: [internalReportWarning, partialReportWarning, "Anexo interno: não substitui os anexos obrigatórios definidos pela legislação aplicável."], metadata: reportMetadata(reportType, year, { status: "INTERNAL_PARTIAL", scope: "Anexo de planejamento LOA" }), sections: [
        { title: "Previsão de receitas", rows: laws.flatMap((law) => law.revenueForecasts.map((forecast) => ({ numeroLei: law.lawNumber, codigo: forecast.code, descricao: forecast.name, valorPrevisto: Number(forecast.estimatedValue) }))) },
        { title: "Fixação de despesas", rows: laws.flatMap((law) => law.expenseFixations.map((fixation) => ({ numeroLei: law.lawNumber, codigo: fixation.code, descricao: fixation.name, valorFixado: Number(fixation.fixedValue) }))) },
        { title: "Cronograma mensal de desembolso", rows: laws.flatMap((law) => law.cmdSchedules.map((schedule) => ({ numeroLei: law.lawNumber, mes: schedule.month, unidadeGestoraId: schedule.budgetUnitId, limite: Number(schedule.limitValue) }))) },
        { title: "Metas bimestrais de arrecadação", rows: laws.flatMap((law) => law.mbaTargets.map((target) => ({ numeroLei: law.lawNumber, bimestre: target.bimonth, metaArrecadacao: Number(target.targetValue) }))) },
        { title: "Créditos adicionais registrados", rows: credits.flatMap((credit) => credit.items.map((item) => ({ numero: credit.number, tipo: credit.type, situacao: credit.status, numeroLei: credit.lawNumber ?? "", dotacao: item.appropriation.code, operacao: item.type, valor: Number(item.value) }))) },
      ] };
    }
    case "PCA": {
      const [budget, patrimonial, annualClose, payables] = await Promise.all([
        generateBalancoOrcamentario(db, filter),
        generateBalancoPatrimonial(db, filter),
        findAnnualAccountingClose(db, financialYearId),
        listReportOriginPayables(db, financialYearId, filter.budgetUnitIds),
      ]);
      return {
        title: "PCA - Prestação de Contas Anual interna",
        year,
        warnings: [
          internalReportWarning,
          "Conteúdo parcial: inclui dados orçamentários, patrimoniais, restos a pagar e situação do fechamento disponíveis no sistema. Não inclui peças, assinaturas, notas explicativas, anexos ou validações estatutárias exigidas por órgãos de controle.",
        ],
        metadata: reportMetadata(reportType, year, { status: "INTERNAL_PARTIAL", scope: "Encerramento anual interno" }),
        sections: [
          { title: "Situação do encerramento", rows: [{ situacao: annualClose?.status ?? "Não preparado", preparadoEm: annualClose?.preparedAt ? isoDate(annualClose.preparedAt) : "", encerradoEm: annualClose?.closedAt ? isoDate(annualClose.closedAt) : "" }] },
          { title: "Síntese orçamentária", rows: Object.entries(budget.totais).map(([descricao, valor]) => ({ descricao, valor })) },
          { title: "Síntese patrimonial", rows: Object.entries(patrimonial.totais).map(([descricao, valor]) => ({ descricao, valor: typeof valor === "boolean" ? (valor ? "Sim" : "Não") : valor })) },
          { title: "Restos a pagar registrados", rows: payables.map((payable) => ({ tipo: payable.type, situacao: payable.status, valor: Number(payable.valueDecimal) })) },
          { title: "Limitações estatutárias", rows: [{ aviso: "Conteúdo parcial interno; não inclui peças, assinaturas, notas explicativas, anexos ou validações estatutárias exigidas por órgãos de controle." }] },
        ],
      };
    }
    case "CONCILIACAO_TESOURARIA": {
      const reconciliations = await listReportReconciliations(db, year, resolvedScope);
      const statusCounts = reconciliations.reduce<Record<string, number>>((counts, reconciliation) => ({ ...counts, [reconciliation.status]: (counts[reconciliation.status] ?? 0) + 1 }), {});
      return {
        title: "Relatório de Conciliações Bancárias",
        year,
        warnings: [internalReportWarning, partialReportWarning, "O relatório apresenta somente conciliações registradas manualmente; não comprova fechamento diário, extratos completos ou conciliação automatizada."],
        metadata: reportMetadata(reportType, year, { status: "INTERNAL_PARTIAL", scope: "Tesouraria e conciliações registradas" }),
        sections: [
          { title: "Conciliações registradas", rows: reconciliations.map((reconciliation) => ({ dataRegistro: isoDate(reconciliation.date), periodoInicial: isoDate(reconciliation.periodStart), periodoFinal: isoDate(reconciliation.periodEnd), banco: reconciliation.bankAccount.bankName, agencia: reconciliation.bankAccount.agency, conta: reconciliation.bankAccount.accountNumber, tipoConta: reconciliation.bankAccount.accountType, unidadeCodigo: reconciliation.bankAccount.budgetUnit?.code ?? "", unidade: reconciliation.bankAccount.budgetUnit?.name ?? "", fonteCodigo: reconciliation.bankAccount.resourceSource?.code ?? "", fonte: reconciliation.bankAccount.resourceSource?.name ?? "", saldoSistema: Number(reconciliation.systemBalanceDecimal ?? reconciliation.systemBalance), saldoBanco: Number(reconciliation.bankBalanceDecimal ?? reconciliation.bankBalance), diferenca: Number(reconciliation.systemBalanceDecimal ?? reconciliation.systemBalance) - Number(reconciliation.bankBalanceDecimal ?? reconciliation.bankBalance), situacao: reconciliation.status })) },
          { title: "Resumo por situação", rows: Object.entries(statusCounts).map(([situacao, quantidade]) => ({ situacao, quantidade })) },
        ],
      };
    }
    case "BALANCO_FINANCEIRO":
    case "FLUXO_CAIXA_ANUAL": {
      const movements = await listReportTreasuryMovements(db, financialYearId, resolvedScope);
      const byType = new Map<string, { type: string; entries: Decimal; exits: Decimal }>();
      const byAccount = new Map<string, { bank: string; agency: string; account: string; unit: string; source: string; balance: Decimal }>();
      for (const movement of movements) {
        const value = movement.valueDecimal;
        const type = byType.get(movement.type) ?? { type: movement.type, entries: new Decimal(0), exits: new Decimal(0) };
        if (movement.direction === "Entrada") type.entries = type.entries.plus(value);
        if (movement.direction === "Saída") type.exits = type.exits.plus(value);
        byType.set(movement.type, type);
        const account = byAccount.get(movement.bankAccountId) ?? { bank: movement.bankAccount.bankName, agency: movement.bankAccount.agency, account: movement.bankAccount.accountNumber, unit: movement.bankAccount.budgetUnit ? `${movement.bankAccount.budgetUnit.code} - ${movement.bankAccount.budgetUnit.name}` : "", source: movement.bankAccount.resourceSource ? `${movement.bankAccount.resourceSource.code} - ${movement.bankAccount.resourceSource.name}` : "", balance: new Decimal(0) };
        account.balance = movement.direction === "Entrada" ? account.balance.plus(value) : account.balance.minus(value);
        byAccount.set(movement.bankAccountId, account);
      }
      const totalEntries = [...byType.values()].reduce((sum, item) => sum.plus(item.entries), new Decimal(0));
      const totalExits = [...byType.values()].reduce((sum, item) => sum.plus(item.exits), new Decimal(0));
      const isBalance = reportType === "BALANCO_FINANCEIRO";
      return {
        title: isBalance ? "Balanço Financeiro - Síntese de Tesouraria" : "Fluxo de Caixa Anual - Síntese de Tesouraria",
        year,
        warnings: [internalReportWarning, partialReportWarning, isBalance ? "Síntese baseada exclusivamente em movimentos de tesouraria confirmados; não constitui Balanço Financeiro oficial." : "Síntese baseada exclusivamente em movimentos de tesouraria confirmados; não constitui Demonstração dos Fluxos de Caixa oficial."],
        metadata: reportMetadata(reportType, year, { status: "INTERNAL_PARTIAL", scope: "Movimentos de tesouraria confirmados do exercício" }),
        sections: [
          { title: isBalance ? "Entradas e saídas por tipo de movimento" : "Fluxos por tipo de movimento", rows: [...byType.values()].map((item) => ({ tipo: item.type, entradas: Number(item.entries.toFixed(2)), saidas: Number(item.exits.toFixed(2)), fluxoLiquido: Number(item.entries.minus(item.exits).toFixed(2)) })) },
          { title: "Saldos calculados por conta", rows: [...byAccount.values()].map((account) => ({ banco: account.bank, agencia: account.agency, conta: account.account, unidade: account.unit, fonte: account.source, saldoCalculado: Number(account.balance.toFixed(2)) })) },
          { title: "Totais", rows: [{ entradas: Number(totalEntries.toFixed(2)), saidas: Number(totalExits.toFixed(2)), fluxoLiquido: Number(totalEntries.minus(totalExits).toFixed(2)), movimentosConfirmados: movements.length }] },
        ],
      };
    }
  }
}

export function reportDatasetCsv(dataset: InternalReportDataset) {
  const presentation = { institution: null, template: createDefaultReportTemplate(), emission: null };
  return { csv: renderTabularCsv(dataset, presentation), rowCount: 1 + dataset.sections.reduce((count, section) => count + section.rows.length, 0) };
}

export async function generateFinancialReportCsv(db: DatabaseConnection, reportType: InternalReportType, financialYearId: string) {
  // This compatibility API predates the explicit year parameter used by the route.
  const scope = await resolveFinancialReportScope(db.db, financialYearId);
  const dataset = await generateInternalReportDataset(db, reportType, financialYearId, scope.year);
  return reportDatasetCsv(dataset);
}

const annualPublicReportTypes = new Set<PublicFinancialReportType>(["BALANCO_ORCAMENTARIO", "BALANCO_PATRIMONIAL"]);

export async function savePublicFinancialReportSnapshot(
  db: DatabaseConnection,
  input: { reportType: InternalReportType; financialYearId: string; year: number; csv: string },
) {
  if (!isPublicFinancialReportType(input.reportType)) return null;
  if (annualPublicReportTypes.has(input.reportType)) {
    const annualClose = await findAnnualAccountingClose(db.db, input.financialYearId);
    if (annualClose?.status !== "ENCERRADO") return null;
  }

  const reportType = input.reportType;
  const filename = financialReportFilename(reportType, input.year);
  const blob = await uploadGeneratedReport(filename, input.csv);
  const hashSha256 = createHash("sha256").update(input.csv, "utf8").digest("hex");
  const documentType = publicFinancialReportDocumentType(input.financialYearId, reportType);

  return withDatabaseTransaction(db, async (tx) => {
    // One version sequence per public report, even under simultaneous administrative exports.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${documentType}))`);
    return insertPublicFinanceDocumentVersion(tx, { documentType, title: `Relatório público ${reportType} ${input.year}`, url: blob.url, hashSha256 });
  });
}
