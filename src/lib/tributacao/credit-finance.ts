import { Prisma, type PrismaClient } from "@prisma/client";
import { assertAccountingPeriodOpen, getBankAccountBalance, postAccountingEventInTransaction } from "@/lib/financeiro";
import { TaxError, type TaxActor } from "./index";
import { resolveTaxAssessmentScope, resolveTaxFinancialYear, taxScopeSnapshot } from "./scope";
import { assertBankResourceSource, getBankResourceSourceSpendableBalance } from "../financeiro/bank-resource-sources";

type Db = PrismaClient | Prisma.TransactionClient;

export async function assertTaxCreditScope(db: Db, actor: TaxActor, data: Prisma.JsonValue) {
  const stored = taxScopeSnapshot(data);
  if (typeof stored.budgetUnitId !== "string" || typeof stored.governmentEntityId !== "string") throw new TaxError("Crédito legado sem escopo conciliado.");
  if (actor.allowedBudgetUnitIds && !actor.allowedBudgetUnitIds.includes(stored.budgetUnitId)) throw new TaxError("Crédito fora das unidades gestoras autorizadas.");
  const binding = await db.planningEntityUnit.findUnique({ where: { budgetUnitId: stored.budgetUnitId } });
  if (binding?.governmentEntityId !== stored.governmentEntityId) throw new TaxError("O vínculo atual da UG diverge da origem do crédito.");
  return { budgetUnitId: stored.budgetUnitId, governmentEntityId: stored.governmentEntityId };
}

/** Excess is a liability, not budget revenue or a second settlement of the guide. */
export async function recordTaxExcessInTransaction(tx: Prisma.TransactionClient, actor: TaxActor, input: {
  creditId: string; bankAccountId: string; date: Date; amount: Prisma.Decimal;
}) {
  const credit = await tx.taxRegistryEntry.findUniqueOrThrow({ where: { id: input.creditId } });
  const scope = await assertTaxCreditScope(tx, actor, credit.data);
  await tx.$queryRaw`SELECT id FROM "BankAccount" WHERE id = ${input.bankAccountId} FOR UPDATE`;
  const account = await tx.bankAccount.findUniqueOrThrow({ where: { id: input.bankAccountId } });
  if (!account.isActive || account.budgetUnitId !== scope.budgetUnitId || !account.accountingPlanId) throw new TaxError("Conta do excedente sem vínculo contábil compatível com a UG.");
  const data = taxScopeSnapshot(credit.data);
  if (typeof data.originEventKey !== "string") throw new TaxError("Excedente sem pagamento canônico de origem.");
  const payment = await tx.taxPayment.findUniqueOrThrow({ where: { idempotencyKey: data.originEventKey }, include: { revenueIntegration: { include: { revenue: { select: { resourceSourceId: true } } } } } });
  const resourceSourceId = payment.revenueIntegration?.revenue.resourceSourceId;
  if (!resourceSourceId || payment.bankAccountId !== account.id || payment.guideId !== data.originGuideId) throw new TaxError("Fonte e banco do excedente devem corresponder à arrecadação original.");
  await assertBankResourceSource(tx, account.id, resourceSourceId);
  await tx.taxRegistryEntry.update({ where: { id: credit.id }, data: { data: { ...data, resourceSourceId } } });
  const year = await resolveTaxFinancialYear(tx, input.date.getUTCFullYear(), scope);
  const transaction = await postAccountingEventInTransaction(tx, actor, {
    financialYearId: year.id, ...scope, date: input.date, value: input.amount,
    eventCode: "TAX_COLLECTION_EXCESS", history: `Ingresso extraorçamentário de crédito tributário ${credit.id}`,
    sourceModule: "TRIBUTACAO", sourceType: "TAX_CREDIT", sourceId: credit.id,
    idempotencyKey: `TAX_CREDIT:${credit.id}:INGRESS`, debitAccountId: account.accountingPlanId,
  });
  const movement = await tx.treasuryMovement.create({ data: {
    date: input.date, type: "ExtraBudgetReceipt", direction: "Entrada", valueDecimal: input.amount,
    resourceSourceId,
    bankAccountId: account.id, financialYearId: year.id, history: transaction.history,
    sourceModule: "TRIBUTACAO", sourceType: "TAX_CREDIT", sourceId: credit.id,
    eventType: "TAX_COLLECTION_EXCESS", idempotencyKey: `TAX_CREDIT:${credit.id}:TREASURY_INGRESS`,
  } });
  await tx.taxRegistryEntry.update({ where: { id: credit.id }, data: { data: {
    ...data, bankAccountId: account.id, resourceSourceId,
    ingressTransactionId: transaction.id, ingressMovementId: movement.id, financialYearId: year.id,
  } } });
  return { transactionId: transaction.id, movementId: movement.id };
}

export async function executeTaxRefund(db: PrismaClient, actor: TaxActor, input: {
  requestId: string; date: Date; bankAccountId: string; proofDocumentId: string; idempotencyKey: string;
}) {
  if (!input.idempotencyKey.trim() || Number.isNaN(input.date.getTime())) throw new TaxError("Informe chave e data válidas para restituição.");
  return db.$transaction(async (tx) => {
    const request = await tx.taxRegistryEntry.findUniqueOrThrow({ where: { id: input.requestId } });
    const data = taxScopeSnapshot(request.data);
    const scope = await assertTaxCreditScope(tx, actor, request.data);
    const key = `TAX_REFUND:${input.idempotencyKey.trim()}`;
    const previous = await tx.taxIntegrationEvent.findUnique({ where: { idempotencyKey: key } });
    if (previous) {
      const payload = taxScopeSnapshot(previous.payload);
      if (payload.requestId !== request.id || payload.bankAccountId !== input.bankAccountId || payload.date !== input.date.toISOString() || payload.proofDocumentId !== input.proofDocumentId) throw new TaxError("Restituição já registrada com outros dados.");
      return previous;
    }
    if (request.category !== "REFUND_REQUEST" || request.status !== "APROVADA_AGUARDANDO_TESOURARIA") throw new TaxError("Restituição não está aprovada e disponível para pagamento.");
    if (typeof data.sourceCreditId !== "string") throw new TaxError("Restituição sem crédito de origem.");
    const year = await resolveTaxFinancialYear(tx, input.date.getUTCFullYear(), scope);
    await assertAccountingPeriodOpen(tx, year.id, input.date);
    // Share period -> credit -> request -> bank order with credit reversal.
    await tx.$queryRaw`SELECT id FROM "TaxRegistryEntry" WHERE id = ${data.sourceCreditId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "TaxRegistryEntry" WHERE id = ${request.id} FOR UPDATE`;
    const current = await tx.taxRegistryEntry.findUniqueOrThrow({ where: { id: request.id } });
    const concurrent = await tx.taxIntegrationEvent.findUnique({ where: { idempotencyKey: key } });
    if (concurrent) {
      const payload = taxScopeSnapshot(concurrent.payload);
      if (payload.requestId !== request.id || payload.bankAccountId !== input.bankAccountId || payload.date !== input.date.toISOString() || payload.proofDocumentId !== input.proofDocumentId) throw new TaxError("Restituição já registrada com outros dados.");
      return concurrent;
    }
    if (current.status !== request.status || JSON.stringify(current.data) !== JSON.stringify(request.data)) throw new TaxError("Restituição alterada; atualize antes de pagar.");
    const credit = await tx.taxRegistryEntry.findUniqueOrThrow({ where: { id: data.sourceCreditId } });
    await assertTaxCreditScope(tx, actor, credit.data);
    const origin = taxScopeSnapshot(credit.data);
    if (typeof origin.ingressTransactionId !== "string") throw new TaxError("Crédito sem ingresso financeiro conciliado.");
    await tx.$queryRaw`SELECT id FROM "BankAccount" WHERE id = ${input.bankAccountId} FOR UPDATE`;
    const account = await tx.bankAccount.findUniqueOrThrow({ where: { id: input.bankAccountId } });
    const document = await tx.document.findUnique({ where: { id: input.proofDocumentId } });
    if (!document || document.status !== "Válido") throw new TaxError("Vincule comprovante GED válido à restituição.");
    if (!account.isActive || account.budgetUnitId !== scope.budgetUnitId || typeof origin.resourceSourceId !== "string" || !account.accountingPlanId) throw new TaxError("Conta de restituição incompatível com UG/fonte do crédito.");
    await assertBankResourceSource(tx, account.id, origin.resourceSourceId);
    const amount = new Prisma.Decimal(String(data.amount));
    if (!amount.isFinite() || amount.lte(0)) throw new TaxError("Valor de restituição inválido.");
    if ((await getBankAccountBalance(tx, account.id, input.date)).lt(amount)) throw new TaxError("Saldo insuficiente para restituição.");
    if ((await getBankResourceSourceSpendableBalance(tx, account.id, origin.resourceSourceId, input.date)).lt(amount)) throw new TaxError("Saldo por fonte insuficiente para restituição.");
    const transaction = await postAccountingEventInTransaction(tx, actor, {
      financialYearId: year.id, ...scope, date: input.date, value: amount, eventCode: "TAX_CREDIT_REFUNDED",
      history: `Restituição tributária ${request.id}`, sourceModule: "TRIBUTACAO", sourceType: "TAX_REFUND",
      sourceId: request.id, idempotencyKey: `${key}:ACCOUNTING`, creditAccountId: account.accountingPlanId,
    });
    const movement = await tx.treasuryMovement.create({ data: {
      date: input.date, type: "ExtraBudgetRefund", direction: "Saída", valueDecimal: amount,
      resourceSourceId: origin.resourceSourceId,
      bankAccountId: account.id, financialYearId: year.id, sourceModule: "TRIBUTACAO", sourceType: "TAX_REFUND",
      sourceId: request.id, eventType: "TAX_CREDIT_REFUNDED", idempotencyKey: `${key}:TREASURY`, history: transaction.history,
    } });
    await tx.taxRegistryEntry.update({ where: { id: request.id }, data: { status: "RESTITUIDA", data: { ...data, status: "RESTITUIDA", transactionId: transaction.id, treasuryMovementId: movement.id, proofDocumentId: document.id, paidAt: input.date.toISOString() } } });
    const event = await tx.taxIntegrationEvent.create({ data: {
      integrationCode: "TAX_CREDIT", eventType: "REFUND_PAID", idempotencyKey: key, status: "PROCESSADO", evidenceLevel: "L1",
      taxpayerId: request.entityId, payload: { requestId: request.id, bankAccountId: account.id, date: input.date.toISOString(), proofDocumentId: document.id, amount: amount.toFixed(2) },
      result: { transactionId: transaction.id, treasuryMovementId: movement.id }, processedAt: new Date(),
    } });
    await tx.taxAuditLog.create({ data: { action: "PAY_REFUND", entityType: "TaxRegistryEntry", entityId: request.id, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, payload: { integrationEventId: event.id, amount: amount.toFixed(2) } } });
    return event;
  });
}

export async function resolveCreditDestinationScope(tx: Prisma.TransactionClient, actor: TaxActor, assessmentId: string) {
  const assessment = await tx.taxAssessment.findUniqueOrThrow({ where: { id: assessmentId } });
  const scope = await resolveTaxAssessmentScope(tx, actor, assessment.taxId, assessment.calculationSnapshot);
  return { assessment, scope };
}
