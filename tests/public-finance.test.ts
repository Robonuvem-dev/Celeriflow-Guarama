import assert from "node:assert/strict";
import test from "node:test";
import { Decimal } from "../src/db/decimal";
import { accountingEntries, accountingTransactions, monthlyAccountingCloses } from "../src/db/schema/finance-accounting";
import { bankReconciliations, reconciliationTreasuryMovements } from "../src/db/schema/finance-reconciliation";
import { createFinanceDeliveryFixture } from "./helpers/finance-delivery-fixture";
import { calculateRetentions } from "../src/lib/financeiro/retencoes.ts";
import { runMockIntegration } from "../src/lib/integrations/registry.ts";
import { exportPublicDataCSV, exportPublicDataTXT, parsePublicDataFilter } from "../src/lib/transparencia/portal-fiscal.ts";
import { financialReportFilename, generateFinancialReportCsv, generateInternalReportDataset, isFinancialReportType, isReportFormat, isReportMonth, reportDatasetCsv, reportRequiresMonth } from "../src/lib/financeiro/report-delivery.ts";
import { generateReportPdf } from "../src/lib/financeiro/report-export.ts";
import { generatePcaPrintHtml, generateBudgetComparisonPrintHtml, generateRetentionPrintHtml, generateBankStatementPrintHtml } from "../src/lib/financeiro/report-print.ts";
import { getPublicHelpFaqAndContactInfo, isPublicFinancialReportType, publicFinancialReportDocumentType } from "../src/lib/transparencia/portal-public.ts";

test("calcula retenções com base e alíquota configuradas", () => {
  const [retention] = calculateRetentions(1_000, [
    { type: "INSS", calculationBasePercentage: 20, ratePercentage: 11 },
  ]);

  assert.equal(retention.baseValue.toString(), "200");
  assert.equal(retention.retainedValue.toString(), "22");
});

test("valida e normaliza filtros da API pública", () => {
  const filter = parsePublicDataFilter(new URLSearchParams("year=2026&page=2&pageSize=25&search=saude"));

  assert.deepEqual(filter, { year: 2026, page: 2, pageSize: 25, search: "saude" });
  assert.throws(() => parsePublicDataFilter(new URLSearchParams("pageSize=101")));
  assert.throws(() => parsePublicDataFilter(new URLSearchParams("revenueClassification=SIGILOSA")));
});

test("neutraliza fórmulas em exportações CSV", () => {
  const csv = exportPublicDataCSV([{ beneficiary: "=HYPERLINK(\"https://invalid.example\")" }]);

  assert.match(csv, /"'=HYPERLINK/);
  assert.doesNotMatch(csv, /\n"=HYPERLINK/);
  assert.match(exportPublicDataCSV([{ value: "\t=1+1" }]), /"'\t=1\+1"/);
});

// As quatro leituras públicas relacionais usam PostgreSQL/Drizzle real em
// public-transparency-finance.test.ts; este arquivo conserva os casos financeiros.

test("executa conectores externos em modo mock sem chamada de rede", () => {
  const result = runMockIntegration("SICONFI", "HEALTH_CHECK");

  assert.equal(result.status, "SUCESSO");
  assert.equal(result.evidence.dispatch, "MOCK");
  assert.match(result.externalId, /^MOCK-SICONFI-/);
});

test("aceita apenas tipos internos de relatório e gera nome CSV previsível", () => {
  assert.equal(isFinancialReportType("RREO"), true);
  assert.equal(isFinancialReportType("BALANCETE_MENSAL"), true);
  assert.equal(isFinancialReportType("LOA_ANEXO_PROGRAMACAO"), true);
  assert.equal(isFinancialReportType("PDF"), false);
  assert.equal(isReportFormat("PDF"), true);
  assert.equal(isReportFormat("HTML"), false);
  assert.equal(isReportMonth(1), true);
  assert.equal(isReportMonth(13), false);
  assert.equal(reportRequiresMonth("BALANCETE_MENSAL"), true);
  assert.equal(reportRequiresMonth("BALANCETE"), false);
  assert.equal(financialReportFilename("BALANCO_PATRIMONIAL", 2026), "relatorio-balanco_patrimonial-2026.csv");
});

test("gera PDF binário a partir do conjunto canônico", async () => {
  const dataset = {
    title: "Relatório interno de teste",
    year: 2026,
    warnings: ["Uso interno."],
    metadata: {
      status: "INTERNAL_PARTIAL" as const,
      scope: "Teste",
      referencePeriod: "Exercício 2026",
      statutoryCompleteness: "NOT_STATUTORY" as const,
      publicSnapshotEligible: false,
      publicSnapshotCondition: "Não aprovado para snapshot público.",
    },
    sections: [{ title: "Dados", rows: [{ descricao: "=não é fórmula", valor: 10 }] }],
  };
  const pdf = await generateReportPdf(dataset);
  const csv = reportDatasetCsv(dataset);

  assert.equal(Buffer.from(pdf).subarray(0, 5).toString("ascii"), "%PDF-");
  assert.match(csv.csv, /'=não é fórmula/);
  assert.match(csv.csv, /Metadados do relatório/);
  assert.match(csv.csv, /INTERNAL_PARTIAL/);
});

test("reconhece apenas relatórios legais publicáveis e cria uma chave estável para o snapshot", () => {
  assert.equal(isPublicFinancialReportType("RREO"), true);
  assert.equal(isPublicFinancialReportType("DIARIO"), false);
  assert.equal(publicFinancialReportDocumentType("year-2026", "RGF"), "PUBLIC_FINANCIAL_REPORT:year-2026:RGF");
});

test("entrega o Diário canônico como CSV seguro", async () => {
  const fixture = await createFinanceDeliveryFixture();
  try {
    const db = fixture.connection.db;
    const date = new Date("2026-01-02T00:00:00.000Z");
    await db.transaction(async tx => {
      await tx.insert(accountingTransactions).values({ id: "transaction-1", financialYearId: "year-2026", date, history: "=FORMULA", status: "POSTADO", authorUsuarioId: "ana" });
      await tx.insert(accountingEntries).values({ transactionId: "transaction-1", accountId: "account-1", date, history: "=FORMULA", authorId: "ana", type: "Débito", value: 100, valueDecimal: new Decimal(100) });
    });
    const result = await generateFinancialReportCsv(fixture.connection, "DIARIO", "year-2026");
    assert.equal(result.rowCount, 2);
    assert.match(result.csv, /data,historico,contaCodigo/);
    assert.match(result.csv, /'=FORMULA/);
  } finally { await fixture.close(); }
});

test("gera balancete mensal com período e situação de fechamento explícitos", async () => {
  const fixture = await createFinanceDeliveryFixture();
  try {
    const db = fixture.connection.db;
    const date = new Date("2026-02-10T00:00:00.000Z");
    await db.transaction(async tx => {
      await tx.insert(accountingTransactions).values({ id: "transaction-1", financialYearId: "year-2026", date, history: "Movimento do mês", status: "POSTADO", authorUsuarioId: "ana" });
      await tx.insert(accountingEntries).values([
        { transactionId: "transaction-1", accountId: "account-1", date, history: "Débito do mês", authorId: "ana", type: "Débito", value: 120, valueDecimal: new Decimal(120) },
        { transactionId: "transaction-1", accountId: "account-1", date, history: "Crédito do mês", authorId: "ana", type: "Crédito", value: 20, valueDecimal: new Decimal(20) },
      ]);
    });
    await db.insert(monthlyAccountingCloses).values({ financialYearId: "year-2026", competence: new Date("2026-02-01T00:00:00.000Z"), status: "ENCERRADO", closedAt: new Date("2026-03-01T00:00:00.000Z"), pendingSummary: null });
    const report = await generateInternalReportDataset(fixture.connection, "BALANCETE_MENSAL", "year-2026", 2026, { month: 2 });
    assert.equal(report.metadata.scope, "Mensal");
    assert.equal(report.metadata.referencePeriod, "Fevereiro de 2026");
    assert.equal(report.metadata.publicSnapshotEligible, false);
    assert.equal(report.sections[0].rows[0].situacao, "ENCERRADO");
    assert.equal(report.sections[1].rows[0].saldoMovimentacao, 100);
    await assert.rejects(() => generateInternalReportDataset(fixture.connection, "BALANCETE_MENSAL", "year-2026", 2026), /mês válido/);
  } finally { await fixture.close(); }
});

test("gera relatório de conciliações e síntese anual somente a partir dos registros internos", async () => {
  const fixture = await createFinanceDeliveryFixture();
  try {
    const db = fixture.connection.db;
    const date = new Date("2026-03-01T00:00:00.000Z");
    await db.insert(bankReconciliations).values({ bankAccountId: "bank-1", date, periodStart: new Date("2026-02-01T00:00:00.000Z"), periodEnd: new Date("2026-02-28T00:00:00.000Z"), systemBalance: 100, systemBalanceDecimal: null, bankBalance: 90, bankBalanceDecimal: null, status: "Divergente" });
    await db.insert(reconciliationTreasuryMovements).values([
      { bankAccountId: "bank-1", financialYearId: "year-2026", date, type: "Revenue", direction: "Entrada", valueDecimal: new Decimal(200) },
      { bankAccountId: "bank-1", financialYearId: "year-2026", date, type: "Payment", direction: "Saída", valueDecimal: new Decimal(80) },
    ]);
    const reconciliation = await generateInternalReportDataset(fixture.connection, "CONCILIACAO_TESOURARIA", "year-2026", 2026);
    const balance = await generateInternalReportDataset(fixture.connection, "BALANCO_FINANCEIRO", "year-2026", 2026);
    assert.equal(reconciliation.metadata.status, "INTERNAL_PARTIAL");
    assert.equal(reconciliation.sections[0].rows[0].diferenca, 10);
    assert.equal(reconciliation.sections[1].rows[0].quantidade, 1);
    assert.equal(balance.metadata.publicSnapshotEligible, false);
    assert.equal(balance.sections[2].rows[0].fluxoLiquido, 120);
    assert.match(balance.warnings.join(" "), /não constitui Balanço Financeiro oficial/);
  } finally { await fixture.close(); }
});

test("gera modelo interno de PCA com notas técnicas e campos de assinatura sujeitos à homologação", () => {
  const html = generatePcaPrintHtml({
    year: 2026,
    budgetBalance: { totalReceita: 15000000, totalDespesa: 14500000, resultado: 500000 },
    balanceSheet: { totalAtivo: 20000000, totalPassivo: 5000000, patrimonioLiquido: 15000000 },
    financialBalance: { totalIngressos: 18000000, totalDispendios: 17000000, saldoFinal: 1000000 },
    dvp: { totalVPA: 16000000, totalVPD: 14000000, resultadoPatrimonial: 2000000 },
    dfc: { fluxoOperacional: 1200000, fluxoInvestimento: -400000, fluxoFinanciamento: 0, variacaoCaixa: 800000 },
  });

  assert.match(html, /MODELO INTERNO DE PCA — EXERCÍCIO 2026/);
  assert.match(html, /Notas técnicas para validação \(referência NBC TSP \/ MCASP\)/);
  assert.match(html, /Prefeito \/ Gestor Municipal/);
  assert.match(html, /Contador Responsável/);
  assert.match(html, /Controlador Interno/);
});

test("gera leiaute imprimível do comparativo LOA original vs alterada por créditos adicionais", () => {
  const html = generateBudgetComparisonPrintHtml({
    lawNumber: "LOA-2026/001",
    totalFixadoOriginal: 15000000,
    totalCreditosAdicionais: 500000,
    totalAtualizado: 15500000,
    variacaoPercentual: 3.33,
    dotacoesComparativo: [
      {
        code: "0101.04.122.0001.2002.3.3.90.30.00",
        budgetUnit: "0101 - Prefeitura Municipal",
        expenseNature: "3.3.90.30 - Material de Consumo",
        valorInicial: 100000,
        valorAtualizado: 150000,
        variacaoCredito: 50000,
        valorEmpenhado: 80000,
        valorDisponivel: 70000,
      },
    ],
  });

  assert.match(html, /DEMONSTRATIVO COMPARATIVO LOA \(ORIGINAL VS ALTERADA\)/);
  assert.match(html, /Fixação Inicial \(LOA Original\)/);
  assert.match(html, /Créditos Efetivados/);
  assert.match(html, /Diretor de Orçamento \/ Planejamento/);
});

test("gera comprovante técnico preliminar de retenção tributária e previdenciária", () => {
  const html = generateRetentionPrintHtml({
    number: "RET-000145",
    date: "02/08/2026",
    paymentNumber: "OP-2026/00089",
    settlementNumber: "NL-2026/00089",
    commitmentNumber: "NE-2026/00120",
    creditorName: "Empresa Construtora Lagoa Seca Ltda",
    creditorDocument: "00.123.456/0001-89",
    calculationBase: 50000,
    retentionType: "INSS - Retenção 11%",
    ratePercentage: 11,
    retentionValue: 5500,
    destinationAccount: "2.1.8.8.1.01.00 - Consignações Extraorçamentárias A Recolher",
  });

  assert.match(html, /COMPROVANTE TÉCNICO PRELIMINAR DE RETENÇÃO TRIBUTÁRIA E PREVIDENCIÁRIA/);
  assert.match(html, /INSS - Retenção 11%/);
  assert.match(html, /Agente Arrecadador \/ Tesouraria/);
});

test("gera extrato de tesouraria e conciliacao imprimivel com saldo cronologico acumulado", () => {
  const html = generateBankStatementPrintHtml({
    bankAccountName: "Conta Movimento FPM",
    bankAgencyAccount: "0001/12345-6",
    startDate: "01/08/2026",
    endDate: "31/08/2026",
    openingBalance: 100000,
    closingBalance: 125000,
    statementItems: [
      {
        date: "02/08/2026",
        type: "Receita Arrecadada",
        history: "Repasse Cota FPM",
        direction: "ENTRADA",
        value: 50000,
        runningBalance: 150000,
      },
      {
        date: "03/08/2026",
        type: "Pagamento OP",
        history: "Pagamento Fornecedor OP-001",
        direction: "SAIDA",
        value: 25000,
        runningBalance: 125000,
      },
    ],
  });

  assert.match(html, /EXTRATO DE TESOURARIA — CONTA MOVIMENTO FPM/);
  assert.match(html, /Repasse Cota FPM/);
  assert.match(html, /Agente Financeiro \/ Tesouraria/);
});

test("exporta dados publicos em formato TXT tabulado higienizado e fornece informacoes de FAQ/Ajuda", () => {
  const txt = exportPublicDataTXT([
    { processo: "001/2026", valor: 15000, historico: "Aquisição de Merenda Escolar" },
  ]);

  assert.match(txt, /processo\tvalor\thistorico/);
  assert.match(txt, /001\/2026\t15000\tAquisição de Merenda Escolar/);

  const faqInfo = getPublicHelpFaqAndContactInfo();
  assert.equal(faqInfo.faq.length, 4);
  assert.match(faqInfo.portalInfo.title, /Aurora das Veredas/);
  assert.match(faqInfo.contact.ombudsmanName, /Ouvidoria Geral/);
});
