import { NextRequest, NextResponse } from "next/server";
import { AccessError, assertBudgetUnitAccess, getTenantContextForModuleOperation, isSystemAdministrator } from "@/lib/platform/tenant-context";
import {
  generateCommitmentPrintHtml,
  generateSettlementPrintHtml,
  generatePaymentPrintHtml,
  generatePcaPrintHtml,
  generateBalancoFinanceiroPrintHtml,
  generateBudgetComparisonPrintHtml,
  generateRetentionPrintHtml,
  generateBankStatementPrintHtml,
} from "@/lib/financeiro/report-print";
import { generatePCA, generateBalancoFinanceiro } from "@/lib/financeiro/relatorios-legais";
import { generateBudgetChangesComparison } from "@/lib/financeiro/planejamento";
import { generateTreasuryBankStatement } from "@/lib/financeiro";
import { resolveFinancialReportScope } from "@/lib/financeiro/report-scope";
import { databaseConnection, db } from "@/db/client";
import { listPrintFinancialYears, readPrintableCommitment, readPrintablePayment, readPrintableRetention, readPrintableSettlement } from "@/db/repositories/finance/report-print";
import { findFinanceBankAccount } from "@/db/repositories/finance/treasury";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const context = await getTenantContextForModuleOperation("FINANCEIRO", "issueReports");
    const documentType = request.nextUrl.searchParams.get("type");
    const id = request.nextUrl.searchParams.get("id");

    if (!documentType) {
      return NextResponse.json({ error: "Tipo de documento não informado." }, { status: 400 });
    }
    let reportYear: { id: string; year: number } | undefined;
    const reportScope = { budgetUnitIds: isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds };
    if (["PCA", "BALANCO_FINANCEIRO", "COMPARATIVO_ORCAMENTO"].includes(documentType)) {
      const financialYearId = request.nextUrl.searchParams.get("financialYearId");
      const governmentEntityId = request.nextUrl.searchParams.get("governmentEntityId");
      const year = Number(request.nextUrl.searchParams.get("year") ?? 2026);
      if (!Number.isInteger(year) || year < 1900 || year > 2200) return NextResponse.json({ error: "Ano inválido." }, { status: 400 });
      const candidates = await listPrintFinancialYears(context.database ?? db, { id: financialYearId, year, governmentEntityId });
      if (!candidates.length) throw new AccessError("Exercício financeiro não encontrado.", 404);
      if (candidates.length !== 1) return NextResponse.json({ error: "Selecione a entidade ou informe financialYearId para imprimir este demonstrativo." }, { status: 400 });
      reportYear = candidates[0];
      const resolved = await resolveFinancialReportScope(context.database ?? db, reportYear.id, reportScope);
      if (!resolved.fullEntity) throw new AccessError("O demonstrativo exige acesso a todas as unidades gestoras da entidade.", 403);
    }

    let html = "";

    switch (documentType) {
      case "EMPENHO": {
        if (!id) return NextResponse.json({ error: "ID do empenho não informado." }, { status: 400 });
        const commitment = await readPrintableCommitment(context.database ?? db, id);
        if (!commitment) return NextResponse.json({ error: "Empenho não encontrado." }, { status: 404 });
        assertBudgetUnitAccess(context.user, commitment.appropriation.budgetUnit.id);

        html = generateCommitmentPrintHtml({
          number: commitment.number,
          date: commitment.date.toISOString().slice(0, 10),
          type: commitment.type,
          budgetUnitCode: commitment.appropriation.budgetUnit.code,
          budgetUnitName: commitment.appropriation.budgetUnit.name,
          appropriationCode: commitment.appropriation.code,
          resourceSourceCode: commitment.appropriation.resourceSource.code,
          resourceSourceName: commitment.appropriation.resourceSource.name,
          expenseNatureCode: commitment.appropriation.expenseNature.code,
          expenseNatureName: commitment.appropriation.expenseNature.name,
          creditorName: commitment.creditor?.name ?? "Credor Não Informado",
          creditorDocument: commitment.creditor?.document ?? "000.000.000-00",
          historical: commitment.history,
          value: Number(commitment.valueDecimal ?? commitment.value),
        });
        break;
      }

      case "LIQUIDACAO": {
        if (!id) return NextResponse.json({ error: "ID da liquidação não informado." }, { status: 400 });
        const settlement = await readPrintableSettlement(context.database ?? db, id);
        if (!settlement) return NextResponse.json({ error: "Liquidação não encontrada." }, { status: 404 });
        assertBudgetUnitAccess(context.user, settlement.commitment.appropriation.budgetUnit.id);

        const grossVal = Number(settlement.valueDecimal ?? settlement.value);

        html = generateSettlementPrintHtml({
          number: settlement.id.slice(0, 10),
          date: settlement.date.toISOString().slice(0, 10),
          commitmentNumber: settlement.commitment.number,
          budgetUnitName: settlement.commitment.appropriation.budgetUnit.name,
          creditorName: settlement.commitment.creditor?.name ?? "Credor Não Informado",
          creditorDocument: settlement.commitment.creditor?.document ?? "000.000.000-00",
          historical: settlement.notes ?? settlement.commitment.history,
          value: grossVal,
          withholdingsTotal: 0,
          netValue: grossVal,
          invoiceNumber: settlement.fiscalDocumentNumber ?? undefined,
          invoiceSeries: settlement.fiscalDocumentSeries ?? undefined,
          invoiceDate: settlement.fiscalDocumentIssueDate ? settlement.fiscalDocumentIssueDate.toISOString().slice(0, 10) : undefined,
          invoiceKey: settlement.fiscalDocumentAccessKey ?? undefined,
        });
        break;
      }

      case "PAGAMENTO": {
        if (!id) return NextResponse.json({ error: "ID do pagamento não informado." }, { status: 400 });
        const payment = await readPrintablePayment(context.database ?? db, id);
        if (!payment) return NextResponse.json({ error: "Pagamento não encontrado." }, { status: 404 });
        if (!payment.bankAccount.budgetUnitId) throw new AccessError("Pagamento sem Unidade Gestora vinculada.", 403);
        assertBudgetUnitAccess(context.user, payment.bankAccount.budgetUnitId);

        const gross = Number(payment.valueDecimal ?? payment.value);
        const net = Number(payment.netValueDecimal ?? gross);

        html = generatePaymentPrintHtml({
          number: payment.orderNumber,
          date: payment.date.toISOString().slice(0, 10),
          settlementNumber: payment.settlement?.id.slice(0, 10) ?? "N/A",
          commitmentNumber: payment.commitment.number,
          bankAccountName: payment.bankAccount.bankName,
          bankAgencyAccount: `${payment.bankAccount.agency} / ${payment.bankAccount.accountNumber}`,
          creditorName: payment.commitment.creditor?.name ?? "Credor Não Informado",
          creditorDocument: payment.commitment.creditor?.document ?? "000.000.000-00",
          grossValue: gross,
          withholdingValue: Math.max(0, gross - net),
          netPaidValue: net,
          historical: payment.commitment.history,
        });
        break;
      }

      case "PCA": {
        const financialYear = reportYear;
        const year = financialYear?.year ?? 2026;
        if (!financialYear) return NextResponse.json({ error: "Exercício financeiro não encontrado." }, { status: 404 });

        const pcaData = await generatePCA(databaseConnection, { financialYearId: financialYear.id, ...reportScope });
        const demos = pcaData.demonstrativos;

        html = generatePcaPrintHtml({
          year,
          budgetBalance: {
            totalReceita: demos.balancoOrcamentario.totais.totalReceitaRealizada,
            totalDespesa: demos.balancoOrcamentario.totais.totalDespesaPaga,
            resultado: demos.balancoOrcamentario.totais.superavitDeficitOrcamentario,
          },
          balanceSheet: {
            totalAtivo: demos.balancoPatrimonial.totais.totalAtivo,
            totalPassivo: demos.balancoPatrimonial.totais.totalPassivo,
            patrimonioLiquido: demos.balancoPatrimonial.totais.totalPatrimonioLiquido,
          },
          financialBalance: {
            totalIngressos: demos.balancoFinanceiro.ingressos.totalIngressos,
            totalDispendios: demos.balancoFinanceiro.dispendios.totalDispendios,
            saldoFinal: demos.balancoFinanceiro.dispendios.saldoExercícioSeguinte,
          },
          dvp: {
            totalVPA: demos.dvp.totais.totalVPA,
            totalVPD: demos.dvp.totais.totalVPD,
            resultadoPatrimonial: demos.dvp.totais.resultadoPatrimonial,
          },
          dfc: {
            fluxoOperacional: demos.dfc.fluxoOperacional,
            fluxoInvestimento: demos.dfc.fluxoInvestimento,
            fluxoFinanciamento: demos.dfc.fluxoFinanciamento,
            variacaoCaixa: demos.dfc.geracaoLiquidaCaixa,
          },
        });
        break;
      }

      case "BALANCO_FINANCEIRO": {
        const financialYear = reportYear;
        const year = financialYear?.year ?? 2026;
        if (!financialYear) return NextResponse.json({ error: "Exercício financeiro não encontrado." }, { status: 404 });

        const bf = await generateBalancoFinanceiro(db, { financialYearId: financialYear.id, ...reportScope });

        html = generateBalancoFinanceiroPrintHtml({
          year,
          ingressos: bf.ingressos,
          dispendios: bf.dispendios,
        });
        break;
      }

      case "COMPARATIVO_ORCAMENTO": {
        const financialYear = reportYear;
        if (!financialYear) return NextResponse.json({ error: "Exercício financeiro não encontrado." }, { status: 404 });

        const comp = await generateBudgetChangesComparison(context.database ?? db, financialYear.id);

        html = generateBudgetComparisonPrintHtml(comp);
        break;
      }

      case "RETENCAO": {
        const id = request.nextUrl.searchParams.get("id");
        if (!id) return NextResponse.json({ error: "ID da retenção é obrigatório." }, { status: 400 });

        const retention = await readPrintableRetention(context.database ?? db, id);

        if (!retention || !retention.payment) {
          return NextResponse.json({ error: "Retenção não encontrada." }, { status: 404 });
        }
        const retentionBudgetUnitId = retention.payment.settlement?.commitment.appropriation.budgetUnitId;
        if (!retentionBudgetUnitId) throw new AccessError("Retenção sem Unidade Gestora vinculada.", 403);
        assertBudgetUnitAccess(context.user, retentionBudgetUnitId);

        const p = retention.payment;
        const s = p.settlement;
        const c = s?.commitment;
        const grossValue = s ? Number(s.valueDecimal) : Number(retention.valueDecimal);
        const retentionValue = Number(retention.valueDecimal);

        html = generateRetentionPrintHtml({
          number: `RET-${retention.id.slice(-6).toUpperCase()}`,
          date: retention.createdAt.toLocaleDateString("pt-BR"),
          paymentNumber: p.orderNumber || "OP-S/N",
          settlementNumber: c?.number ? `NL-${c.number}` : "NL-S/N",
          commitmentNumber: c?.number ? `NE-${c.number}` : "NE-S/N",
          creditorName: retention.beneficiaryName || "FAVORECIDO NÃO INFORMADO",
          creditorDocument: retention.beneficiaryDocument || "000.000.000-00",
          calculationBase: grossValue,
          retentionType: retention.type,
          ratePercentage: grossValue > 0 ? Number(((retentionValue / grossValue) * 100).toFixed(2)) : 0,
          retentionValue,
          destinationAccount: "2.1.8.8.1.01.00 - Consignações Extraorçamentárias A Recolher",
        });
        break;
      }

      case "EXTRATO_BANCARIO": {
        const bankAccountId = request.nextUrl.searchParams.get("bankAccountId");
        if (!bankAccountId) return NextResponse.json({ error: "bankAccountId é obrigatório." }, { status: 400 });
        const account = await findFinanceBankAccount(context.database ?? db, bankAccountId);
        if (!account) return NextResponse.json({ error: "Conta bancária não encontrada." }, { status: 404 });
        if (!account.budgetUnitId) throw new AccessError("Conta bancária sem Unidade Gestora vinculada.", 403);
        assertBudgetUnitAccess(context.user, account.budgetUnitId);

        const startDateParam = request.nextUrl.searchParams.get("startDate");
        const endDateParam = request.nextUrl.searchParams.get("endDate");
        const startDate = startDateParam ? new Date(startDateParam) : new Date(Date.UTC(2026, 0, 1));
        const endDate = endDateParam ? new Date(endDateParam) : new Date(Date.UTC(2026, 11, 31));

        const statement = await generateTreasuryBankStatement(db, { bankAccountId, startDate, endDate });

        html = generateBankStatementPrintHtml(statement);
        break;
      }

      default:
        return NextResponse.json({ error: "Tipo de impressão não suportado." }, { status: 400 });
    }

    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof AccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Erro ao gerar impressão técnica:", error);
    return NextResponse.json({ error: "Não foi possível gerar o documento imprimível." }, { status: 500 });
  }
}
