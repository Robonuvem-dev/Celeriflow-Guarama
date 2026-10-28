import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import RestosAPagarClient from "./RestosAPagarClient";
import NativeRapPaymentClient from "./NativeRapPaymentClient";
import NativeRapSettlementClient from "./NativeRapSettlementClient";
import CarryForwardTransportClient from "./CarryForwardTransportClient";
import { db } from "@/db/client";
import { listFinancePageYears } from "@/db/repositories/finance-pages/catalog";
import { listFinancePageBankAccounts, listFinancePagePayments } from "@/db/repositories/finance-pages/banking";
import { listFinancePageDocuments } from "@/db/repositories/finance-pages/operations";
import { listFinancePagePayables, listFinancePageRapAuthors } from "@/db/repositories/finance-pages/payables";

export const dynamic = "force-dynamic";

export default async function RestosAPagarPage() {
  const context = await getTenantContextForModule("FINANCEIRO");
  const executor = context.database ?? db;
  const access = { allowedBudgetUnitIds: isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds };
  const [payables, years, payments, banks, documents, authors] = await Promise.all([
    listFinancePagePayables(executor, access), listFinancePageYears(executor, access), listFinancePagePayments(executor, access, true),
    listFinancePageBankAccounts(executor, access, true), listFinancePageDocuments(executor, "rap"), listFinancePageRapAuthors(executor),
  ]);

  const nativePayables = payables.filter(payable => ["PROCESSADO", "NAO_PROCESSADO"].includes(payable.type) && ["PENDENTE", "PAGAMENTO_PARCIAL_RASTREADO"].includes(payable.status)).map(payable => {
    const direct = payable.commitment.settlements.filter(settlement => !payable.inheritedSettlements.some(link => link.settlementId === settlement.id) && (payable.type === "PROCESSADO" ? !settlement.payableCarryForwardId && !payable.events.some(event => event.action === "TRANSPORTE_ANUAL_RECEBIDO") : settlement.payableCarryForwardId === payable.id)).map(settlement => ({ id: settlement.id, inherited: false, label: `${settlement.date.toISOString().slice(0, 10)} · ${settlement.valueDecimal?.toFixed(2) ?? "Não conciliado"}` }));
    const inherited = payable.inheritedSettlements.flatMap(link => {
      const available = link.settlement.payments.filter(payment => payment.payableCarryForwardId === payable.id).reduce((balance, payment) => payment.valueDecimal ? balance.minus(payment.valueDecimal) : balance, link.valueDecimal);
      return available.gt(0) ? [{ id: link.settlementId, inherited: true, label: `Herdada de ${link.sourceFinancialYear.year} · ${link.settlement.date.toISOString().slice(0, 10)} · parcela disponível ${available.toFixed(2)}` }] : [];
    });
    return { id: payable.id, type: payable.type, label: `${payable.originFinancialYear.governmentEntity?.name ?? "Legado"} · ${payable.originFinancialYear.year} · ${payable.commitment.number} · ${payable.type === "PROCESSADO" ? "Processado" : "Não processado"}`, ...payable.commitment.appropriation, settlements: [...direct, ...inherited] };
  });
  return <><CarryForwardTransportClient years={years} payables={payables.map(payable => ({ id: payable.id, label: `${payable.originFinancialYear.governmentEntity?.name ?? "Legado"} · ${payable.commitment.number} · registro ${payable.financialYear.year} · ${payable.valueDecimal.toFixed(2)} · ${payable.type === "PROCESSADO" ? "Processado" : "Não processado"}`, governmentEntityId: payable.originFinancialYear.governmentEntityId, registrationYear: payable.financialYear.year, status: payable.status, transported: payable.events.some(event => event.action === "TRANSPORTE_ANUAL_RECEBIDO") }))} /><NativeRapSettlementClient payables={nativePayables.filter(payable => payable.type === "NAO_PROCESSADO").map(payable => ({ ...payable, settlements: payable.settlements.filter(settlement => !settlement.inherited) }))} documents={documents} authors={authors.flatMap(author => author.person ? [{ id: author.id, name: author.person.fullName }] : [])} /><NativeRapPaymentClient banks={banks.map(bank => ({ id: bank.id, budgetUnitId: bank.budgetUnitId, resourceSourceIds: [...new Set([...(bank.resourceSourceId ? [bank.resourceSourceId] : []), ...bank.permittedSources.map(source => source.resourceSourceId)])], label: `${bank.bankName} · ${bank.agency} · ${bank.accountNumber}` }))} payables={nativePayables} /><RestosAPagarClient
    years={years}
    payables={payables.map((payable) => ({
      id: payable.id,
      financialYear: payable.financialYear,
      originFinancialYear: payable.originFinancialYear,
      commitment: {
        id: payable.commitment.id,
        number: payable.commitment.number,
        history: payable.commitment.history,
        supplierName: payable.commitment.supplier.company?.corporateName ?? payable.commitment.supplier.person?.fullName ?? "Fornecedor não identificado",
      },
      previousYear: payable.previousPayableCarryForward?.financialYear.year,
      successorYear: payable.successorPayableCarryForward?.financialYear.year,
      value: payable.valueDecimal.toString(),
      type: payable.type,
      status: payable.status,
      events: payable.events.map((event) => ({ id: event.id, action: event.action, justification: event.justification, value: event.valueDecimal?.toString(), paymentOrderNumber: event.payment?.orderNumber, actor: event.actorUsuario.nome, createdAt: event.createdAt.toISOString() })),
    }))}
    payments={payments.map((payment) => ({ id: payment.id, orderNumber: payment.orderNumber, commitmentId: payment.commitmentId, value: (payment.valueDecimal ?? payment.value).toString(), date: payment.date.toISOString() }))}
  /></>;
}
