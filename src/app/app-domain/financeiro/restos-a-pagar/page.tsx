import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import RestosAPagarClient from "./RestosAPagarClient";
import NativeRapPaymentClient from "./NativeRapPaymentClient";
import NativeRapSettlementClient from "./NativeRapSettlementClient";
import CarryForwardTransportClient from "./CarryForwardTransportClient";

export const dynamic = "force-dynamic";

export default async function RestosAPagarPage() {
  const context = await getTenantContextForModule("FINANCEIRO");
  const appropriationFilter = isSystemAdministrator(context.user)
    ? {}
    : { budgetUnitId: { in: context.user.allowedBudgetUnitIds } };
  const [payables, years, payments, banks, documents, authors] = await Promise.all([
    context.prisma.payableCarryForward.findMany({
      where: { commitment: { appropriation: appropriationFilter } },
      include: {
        financialYear: { select: { id: true, year: true, status: true, governmentEntityId: true, governmentEntity: { select: { name: true } } } },
        originFinancialYear: { select: { id: true, year: true, governmentEntityId: true, governmentEntity: { select: { name: true } } } },
        commitment: { select: { id: true, number: true, history: true, appropriation: { select: { budgetUnitId: true, resourceSourceId: true } }, settlements: { where: { status: "Liquidado" }, select: { id: true, date: true, valueDecimal: true, payableCarryForwardId: true } }, supplier: { select: { company: { select: { corporateName: true } }, person: { select: { fullName: true } } } } } },
        previousPayableCarryForward: { select: { id: true, financialYear: { select: { year: true } } } },
        successorPayableCarryForward: { select: { id: true, financialYear: { select: { year: true } } } },
        events: { include: { actorUsuario: { select: { nome: true } }, payment: { select: { orderNumber: true } } }, orderBy: { createdAt: "desc" } },
        inheritedSettlements: { where: { status: "ACTIVE", settlement: { status: "Liquidado" } }, include: { sourceFinancialYear: { select: { year: true } }, settlement: { select: { id: true, date: true, payments: { where: { status: { in: ["Emitida", "Paga"] } }, select: { payableCarryForwardId: true, valueDecimal: true } } } } } },
      },
      orderBy: [{ originFinancialYear: { year: "desc" } }, { createdAt: "desc" }],
      take: 300,
    }),
    context.prisma.financialYear.findMany({ where: isSystemAdministrator(context.user) ? {} : { governmentEntity: { is: { planningUnits: { some: { budgetUnitId: { in: context.user.allowedBudgetUnitIds } } } } } }, orderBy: [{ year: "desc" }, { id: "asc" }], select: { id: true, year: true, status: true, governmentEntityId: true, governmentEntity: { select: { name: true } } } }),
    context.prisma.payment.findMany({
      where: { status: "Paga", commitment: { appropriation: appropriationFilter } },
      select: { id: true, orderNumber: true, commitmentId: true, valueDecimal: true, value: true, date: true },
      orderBy: { date: "desc" },
      take: 300,
    }),
    context.prisma.bankAccount.findMany({ where: { isActive: true, ...(isSystemAdministrator(context.user) ? {} : { budgetUnitId: { in: context.user.allowedBudgetUnitIds } }) }, select: { id: true, bankName: true, agency: true, accountNumber: true, budgetUnitId: true, resourceSourceId: true, permittedSources: { where: { isActive: true }, select: { resourceSourceId: true } } } }),
    context.prisma.document.findMany({ where: { status: "Válido" }, select: { id: true, title: true }, orderBy: { title: "asc" }, take: 300 }),
    context.prisma.employee.findMany({ where: { isActive: true }, select: { id: true, person: { select: { fullName: true } } }, orderBy: { createdAt: "desc" }, take: 300 }),
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
