"use server";

import { sql } from "drizzle-orm";
import { databaseConnection, db } from "@/db/client";
import { withDatabaseTransaction } from "@/db/transaction";
import { findFinanceCommitment, findFinanceSupplier } from "@/db/repositories/finance/budget-execution";
import { findFinancePayment, readFinancePayment, readPaymentExecution, readWithholdingExecution, updateFinancePayment } from "@/db/repositories/finance/payments";
import { findFinanceBankAccount } from "@/db/repositories/finance/treasury";
import { FinanceError, assertFinancialYearOpen, createPayment as createOfficialPayment, updatePaymentStatus as updateOfficialPaymentStatus } from "@/lib/financeiro";
import { lockPaymentBankCorrelation } from "@/lib/financeiro/annual-payment-program-transport";
import { assertBudgetUnitAccess, getTenantContextForModuleOperation, isSystemAdministrator, type AppContext, type ModuleOperation } from "@/lib/platform/tenant-context";
import { revalidatePath } from "next/cache";

type ActionResult = { error?: string };
const paymentActor = (context: AppContext) => ({ usuarioId: context.user.id, employeeId: context.user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds });
const message = (error: unknown) => error instanceof Error ? error.message : "Não foi possível concluir o pagamento.";

async function assertCommitmentAccess(context: AppContext, commitmentId: string) {
  const commitment = await findFinanceCommitment(db, commitmentId);
  if (!commitment) throw new FinanceError("Empenho não encontrado.");
  assertBudgetUnitAccess(context.user, commitment.appropriation.budgetUnitId);
  return commitment;
}

function revalidateContractExecution(contractId?: string | null) {
  if (!contractId) return;
  revalidatePath("/compras/contratos");
  revalidatePath(`/compras/contratos/${contractId}`);
}

async function assertBankAccountAccess(context: AppContext, bankAccountId: string) {
  const account = await findFinanceBankAccount(db, bankAccountId);
  if (!account?.budgetUnitId) throw new FinanceError("A conta bancária deve estar vinculada a uma Unidade Gestora.");
  assertBudgetUnitAccess(context.user, account.budgetUnitId);
}

export async function createPayment(data: {
  orderNumber: string;
  date: Date;
  value: number | string;
  commitmentId: string;
  settlementId: string;
  bankAccountId: string;
  supplierId: string;
  paymentMethod: string;
  // Kept for direct callers; the domain validates it against the settlement calculation.
  serviceCode?: string;
  retentionRuleIds?: string[];
  payableCarryForwardId?: string;
}): Promise<ActionResult> {
  try {
    const context = await getTenantContextForModuleOperation("FINANCEIRO", "create");
    const commitment = await assertCommitmentAccess(context, data.commitmentId);
    await assertBankAccountAccess(context, data.bankAccountId);
    const payment = await createOfficialPayment(databaseConnection, paymentActor(context), data);
    try { await submitIssuedPayment(context, payment.id); }
    catch (bankError) { console.error("Ordem criada, mas não foi possível enviá-la ao banco:", bankError); }
    revalidatePath("/financeiro/pagamentos");
    revalidatePath("/financeiro/liquidacoes");
    revalidatePath("/financeiro/empenhos");
    revalidatePath("/financeiro/restos-a-pagar");
    revalidateContractExecution(commitment.contractId);
    return {};
  } catch (error) {
    return { error: message(error) };
  }
}

async function submitIssuedPayment(context: AppContext, paymentId: string) {
  return withDatabaseTransaction(databaseConnection, async tx => {
    const initial = await readFinancePayment(tx, paymentId);
    if (!initial.bankAccountExternalId) return;
    if (!initial.paymentOrderExternalId) throw new FinanceError("Ordem sem correlação bancária ativa.");
    await lockPaymentBankCorrelation(tx, initial.paymentOrderExternalId);
    await tx.execute(sql`SELECT id FROM "Payment" WHERE id = ${paymentId} FOR UPDATE`);
    const bankOrder = await readPaymentExecution(tx, paymentId);
    if (!bankOrder) throw new FinanceError("Pagamento não encontrado.");
    assertBudgetUnitAccess(context.user, bankOrder.commitment.appropriation.budgetUnitId);
    if (bankOrder.status !== "Emitida" || bankOrder.paymentOrderExternalId !== initial.paymentOrderExternalId || !bankOrder.integrationEventId || !bankOrder.netValueDecimal?.isFinite()) throw new FinanceError("Somente a ordem emitida vigente pode ser remetida ao banco.");
    if (["RECEIVED", "PENDING"].includes(bankOrder.bankStatus ?? "")) return;
    if (bankOrder.bankStatus !== "PENDING_SUBMISSION") throw new FinanceError("A ordem não está disponível para envio bancário.");
    await assertFinancialYearOpen(tx, bankOrder.executionFinancialYearId ?? bankOrder.commitment.appropriation.financialYearId, bankOrder.date);
    const { bankIntegrationClient } = await import("@/lib/financeiro/bank-integration-client");
    const supplier = await findFinanceSupplier(tx, bankOrder.supplierId);
    const beneficiaryName = supplier?.company?.corporateName ?? supplier?.person?.fullName;
    if (!beneficiaryName) throw new FinanceError("Favorecido sem nome documental para a remessa.");
    await bankIntegrationClient.submitPaymentOrder({ paymentOrderExternalId: bankOrder.paymentOrderExternalId!, integrationEventId: bankOrder.integrationEventId, bankAccountExternalId: bankOrder.bankAccountExternalId!, clientReference: bankOrder.orderNumber, beneficiary: { name: beneficiaryName, document: supplier?.company?.cnpj ?? supplier?.person?.cpf ?? undefined }, amount: Number(bankOrder.netValueDecimal), scheduledDate: bankOrder.date, paymentMethod: bankOrder.paymentMethod, purposeText: `Pagamento líquido da ${bankOrder.paymentOrderExternalId}`, idempotencyKey: `celeriflow:payment:${bankOrder.paymentOrderExternalId}:v1` });
    await updateFinancePayment(tx, paymentId, { bankStatus: "RECEIVED", bankSubmittedAt: new Date() });
  }, { timeoutMs: 120000 });
}

export async function submitPaymentToBank(paymentId: string): Promise<ActionResult> {
  try {
    const context = await getTenantContextForModuleOperation("FINANCEIRO", "update");
    await submitIssuedPayment(context, paymentId);
    revalidatePath("/financeiro/pagamentos");
    revalidatePath("/financeiro/contabilidade/etapas-anuais");
    return {};
  } catch (error) { return { error: message(error) }; }
}

export async function cancelPayment(id: string): Promise<ActionResult> {
  return updatePaymentStatus(id, "Cancelada");
}

export async function updatePaymentStatus(id: string, status: string): Promise<ActionResult> {
  try {
    if (status === "Paga") throw new FinanceError("A baixa do pagamento ocorre exclusivamente após a confirmação do Banco Virtual.");
    const operation: ModuleOperation = status === "Cancelada" ? "delete" : "update";
    const context = await getTenantContextForModuleOperation("FINANCEIRO", operation);
    const payment = await findFinancePayment(db, id);
    if (!payment) throw new FinanceError("Pagamento não encontrado.");
    const commitment = await assertCommitmentAccess(context, payment.commitmentId);
    await updateOfficialPaymentStatus(databaseConnection, paymentActor(context), id, status);
    revalidatePath("/financeiro/restos-a-pagar");
    revalidatePath("/financeiro/pagamentos");
    revalidatePath("/financeiro/liquidacoes");
    revalidatePath("/financeiro/empenhos");
    revalidateContractExecution(commitment.contractId);
    return {};
  } catch (error) {
    return { error: message(error) };
  }
}

export async function reversePaymentAction(paymentId: string, justification: string): Promise<ActionResult> {
  try {
    const context = await getTenantContextForModuleOperation("FINANCEIRO", "delete");
    const payment = await findFinancePayment(db, paymentId);
    if (!payment) throw new FinanceError("Pagamento não encontrado.");
    const commitment = await assertCommitmentAccess(context, payment.commitmentId);
    const { reversePayment: reverseOfficialPayment } = await import("@/lib/financeiro");
    await reverseOfficialPayment(databaseConnection, paymentActor(context), paymentId, justification);
    revalidatePath("/financeiro/restos-a-pagar");
    revalidatePath("/financeiro/pagamentos");
    revalidatePath("/financeiro/liquidacoes");
    revalidatePath("/financeiro/empenhos");
    revalidateContractExecution(commitment.contractId);
    return {};
  } catch (error) {
    return { error: message(error) };
  }
}

export async function settleWithholdingPayableAction(withholdingPayableId: string, bankAccountId: string, receiptDocumentId: string): Promise<ActionResult> {
  try {
    const context = await getTenantContextForModuleOperation("FINANCEIRO", "create");
    const payable = await readWithholdingExecution(db, withholdingPayableId);
    if (!payable?.retention?.payment?.commitmentId) throw new FinanceError("Consignação/retenção não encontrada.");
    const commitment = await assertCommitmentAccess(context, payable.retention.payment.commitmentId);

    await assertBankAccountAccess(context, bankAccountId);

    const { settleWithholdingPayable: settleOfficialWithholding } = await import("@/lib/financeiro");
    await settleOfficialWithholding(databaseConnection, paymentActor(context), { withholdingPayableId, bankAccountId, receiptDocumentId, paymentDate: new Date() });
    revalidatePath("/financeiro/pagamentos");
    revalidateContractExecution(commitment.contractId);
    return {};
  } catch (error) {
    return { error: message(error) };
  }
}
