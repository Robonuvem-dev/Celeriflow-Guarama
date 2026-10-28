import { Decimal } from "@/db/decimal";
import { z } from "zod";
import { canPerformModuleOperation, isSystemAdministrator, type AppContext } from "@/lib/platform/tenant-context";
import { assertTravelAllowanceAccess, assertTravelReportOperationDate } from "@/lib/rh/travel-allowance";
import { enqueueHrIntegration } from "@/lib/rh/workforce-service";
import { FinanceError, assertFinancialYearOpen, assertAccountingPeriodOpen, postAccountingTransactionInTransaction, getBankAccountBalance, getBudgetAvailability, synchronizeCommittedBudgetMirror } from "./index";
import { recordPlanningFinanceExecution } from "@/lib/planejamento/execution-bridge";
import { assertBankResourceSource, getBankResourceSourceSpendableBalance } from "./bank-resource-sources";
import { sql } from "drizzle-orm";
import { withDatabaseTransaction, type DatabaseTransaction } from "@/db/transaction";
import type { DatabaseConnection } from "@/db/connection";
import type { JsonObject } from "@/db/json";
import { findRefundIntegrationEvent, hasCollectedTravelRefunds, listAllowanceMutationRefunds, listCommitmentAllowanceRefunds, listRequestExpenseRefunds, readAllowanceRefundEvent, readAllowanceRefundPayment, readRefundAccountingTransaction, readRefundMutationOrigin, setAllowanceRefundEventStatus } from "@/db/repositories/finance/allowance-refunds";
import { requireHrPortalRequest } from "@/db/repositories/personnel/workforce";
import { listAccountingUnitBindings } from "@/db/repositories/finance/accounting";
import { listCollectedAllowanceRevenues } from "@/db/repositories/finance/revenues";
import { findSettlementDocument, insertFinanceSettlement } from "@/db/repositories/finance/settlements";
import { insertFinancePayment, readFinancePayment } from "@/db/repositories/finance/payments";
import { insertFinanceCommitmentMovement } from "@/db/repositories/finance/budget-execution";
import { insertTreasuryMovement } from "@/db/repositories/finance/treasury";
import { financialDocuments } from "@/db/schema/finance-documents";
import { findActiveTravelAllowanceReport } from "@/db/repositories/personnel/integration";

const schema = z.object({ requestId: z.string().min(1), requestKey: z.string().trim().min(1).max(120), paymentId: z.string().min(1), date: z.iso.date(), amount: z.string().regex(/^\d{1,12}(?:\.\d{1,2})?$/), documentId: z.string().min(1), reason: z.string().trim().min(10).max(3000) }).strict();
const positionSchema = z.object({ input: schema, originalPaymentId: z.string(), originalSettlementId: z.string(), commitmentId: z.string(), correctionPaymentId: z.string(), correctionSettlementId: z.string(), movementId: z.string(), treasuryMovementId: z.string(), transactionIds: z.array(z.string()).length(3), budgetUnitId: z.string(), governmentEntityId: z.string(), financialYearId: z.string() });
const reversalSchema = z.object({ refundId: z.string().min(1), date: z.iso.date(), documentId: z.string().min(1), reason: z.string().trim().min(10).max(3000) }).strict();
const actorFor = (c: AppContext) => ({ usuarioId: c.user.id, employeeId: c.user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(c.user) ? undefined : c.user.allowedBudgetUnitIds });

export async function assertCurrentRefundPaymentMutationAllowed(tx: DatabaseTransaction, id: string, kind: "PAYMENT" | "SETTLEMENT") {
  const expense = await readRefundMutationOrigin(tx, id, kind);
  if (expense?.sourceModule === "RH" && ["TRAVEL_ALLOWANCE", "ADVANCE_ALLOWANCE"].includes(expense.sourceType ?? "") && expense.sourceId) {
    await tx.execute(sql`SELECT id FROM "HrPortalRequest" WHERE id=${expense.sourceId} FOR UPDATE`);
    if (kind === "PAYMENT" && expense.sourceType === "TRAVEL_ALLOWANCE") {
      const report = await findActiveTravelAllowanceReport(tx, expense.sourceId);
      if (report && report.status !== "ESTORNADA") throw new FinanceError("Regularize a prestação ativa antes de estornar o pagamento da diária.");
      const refunds = await hasCollectedTravelRefunds(tx, expense.sourceId);
      if (refunds) throw new FinanceError("Estorne as restituições anteriores da diária antes de estornar o pagamento.");
    }
  }
  const originalField = kind === "PAYMENT" ? "originalPaymentId" : "originalSettlementId";
  const correctionField = kind === "PAYMENT" ? "correctionPaymentId" : "correctionSettlementId";
  const records = await listAllowanceMutationRefunds(tx, id, kind);
  if (records.some(record => (record.payload as JsonObject)[correctionField] === id || record.status === "CONCLUIDA" && (record.payload as JsonObject)[originalField] === id)) throw new FinanceError("Regularize as restituições pela origem; registros corretivos não admitem estorno/cancelamento isolado.");
}

export async function settledCurrentRefundCorrections(tx: DatabaseTransaction, commitmentId: string) {
  const refunds = await listCommitmentAllowanceRefunds(tx, commitmentId);
  if (refunds.some(refund => refund.status !== "ESTORNADA")) throw new FinanceError("Estorne as restituições vigentes antes de anular a concessão.");
  const settlements = new Set<string>(), payments = new Set<string>();
  for (const refund of refunds) {
    const position = positionSchema.parse(refund.payload);
    const reversal = await findRefundIntegrationEvent(tx, `${refund.sourceKey}:REVERSE`);
    if (!reversal || reversal.status !== "CONCLUIDA") throw new FinanceError("Estorno da restituição sem recomposição concluída.");
    const restored = z.object({ correctionPaymentId: z.string(), correctionSettlementId: z.string() }).parse(reversal.payload);
    settlements.add(position.correctionSettlementId); settlements.add(restored.correctionSettlementId);
    payments.add(position.correctionPaymentId); payments.add(restored.correctionPaymentId);
  }
  return { settlements, payments };
}

export async function receiveCurrentYearAdvanceRefund(connection: DatabaseConnection, context: AppContext, raw: unknown) {
  return receiveCurrentYearAllowanceRefund(connection, context, raw, "ADIANTAMENTO");
}

export async function receiveCurrentYearTravelRefund(connection: DatabaseConnection, context: AppContext, raw: unknown) {
  return receiveCurrentYearAllowanceRefund(connection, context, raw, "DIARIA");
}

async function receiveCurrentYearAllowanceRefund(connection: DatabaseConnection, context: AppContext, raw: unknown, kind: "ADIANTAMENTO" | "DIARIA") {
  const input = schema.parse(raw);
  input.amount = new Decimal(input.amount).toFixed(2);
  const amount = new Decimal(input.amount);
  if (amount.lte(0)) throw new Error("Restituição exige valor positivo.");
  if (!canPerformModuleOperation(context.user, "FINANCEIRO", "create")) throw new Error("Restituição exige criação no Financeiro.");
  const authorId = context.user.employeeId;
  if (!authorId) throw new Error("A recomposição da liquidação exige usuário vinculado ao servidor responsável.");
  return withDatabaseTransaction(connection, async tx => {
    await tx.execute(sql`SELECT id FROM "HrPortalRequest" WHERE id=${input.requestId} FOR UPDATE`);
    const request = await requireHrPortalRequest(tx, input.requestId);
    assertTravelAllowanceAccess(request.payload, context);
    const memory = z.object({ input: z.object({ budgetUnitId: z.string() }), assessment: z.object({ amountBRL: z.string() }) }).parse(request.payload);
    const key = `${kind}:RESTITUICAO_DESPESA:${input.requestId}:${input.requestKey}`;
    const previous = await findRefundIntegrationEvent(tx, key);
    if (previous) {
      if (JSON.stringify(positionSchema.parse(previous.payload).input) !== JSON.stringify(input) || previous.status !== "CONCLUIDA") throw new Error("Restituição já registrada com outros dados ou estornada.");
      return previous;
    }
    if (request.kind !== kind || request.status !== "DEFERIDA") throw new Error("Restituição exige concessão autorizada antes da prestação.");
    if (kind === "DIARIA") await assertTravelReportOperationDate(tx, request.id, input.date);
    const report = kind === "DIARIA" ? await findActiveTravelAllowanceReport(tx, request.id) : null;
    if (report && report.status !== "ESTORNADA") throw new Error("Regularize a prestação ativa da diária antes de receber nova devolução.");
    const origin = await readFinancePayment(tx, input.paymentId);
    await tx.execute(sql`SELECT id FROM "Commitment" WHERE id=${origin.commitmentId} FOR UPDATE`);
    await tx.execute(sql`SELECT id FROM "Payment" WHERE id=${input.paymentId} FOR UPDATE`);
    const payment = await readAllowanceRefundPayment(tx, input.paymentId);
    await tx.execute(sql`SELECT id FROM "BudgetAppropriation" WHERE id=${payment.commitment.appropriationId} FOR UPDATE`);
    const expense = payment.commitment.reservation?.expense;
    const date = new Date(`${input.date}T12:00:00Z`);
    const actor = actorFor(context);
    const year = await assertFinancialYearOpen(tx, payment.commitment.appropriation.financialYearId, date);
    await assertAccountingPeriodOpen(tx, year.id, date);
    const [binding] = await listAccountingUnitBindings(tx, memory.input.budgetUnitId);
    if (!binding) throw new Error("Vinculação da UG não encontrada.");
    if (!payment.commitment.appropriation.resourceSourceId) throw new Error("Restituição exige fonte conciliada da dotação original.");
    await tx.execute(sql`SELECT id FROM "BankAccount" WHERE id=${payment.bankAccountId} FOR UPDATE`);
    await assertBankResourceSource(tx, payment.bankAccountId, payment.commitment.appropriation.resourceSourceId);
    if (!payment.valueDecimal?.eq(memory.assessment.amountBRL) || payment.status !== "Paga" || payment.date > date || !payment.settlement || payment.settlement.status !== "Liquidado" || !payment.settlement.valueDecimal?.eq(payment.valueDecimal) || !payment.commitment.valueDecimal?.eq(payment.valueDecimal) || payment.retentions.length || payment.settlement.retentions.length || !(payment.netValueDecimal ?? payment.valueDecimal).eq(payment.valueDecimal) || expense?.sourceModule !== "RH" || expense.sourceType !== (kind === "DIARIA" ? "TRAVEL_ALLOWANCE" : "ADVANCE_ALLOWANCE") || expense.sourceId !== request.id || payment.commitment.appropriation.budgetUnitId !== memory.input.budgetUnitId || year.governmentEntityId !== binding.governmentEntityId || !payment.bankAccount.isActive || payment.bankAccount.budgetUnitId !== memory.input.budgetUnitId) throw new Error("Restituição exige pagamento integral da concessão, sem retenções, no exercício corrente e na conta/fonte/UG original.");
    const events = await listRequestExpenseRefunds(tx, kind, request.id);
    const active = events.filter(event => event.status === "CONCLUIDA").map(event => positionSchema.parse(event.payload));
    const priorRevenues = await listCollectedAllowanceRevenues(tx, kind, request.id);
    const refunded = active.reduce((sum, event) => sum.plus(event.input.amount), new Decimal(0)).plus(priorRevenues.reduce((sum, revenue) => { if (!revenue.valueDecimal) throw new Error("Restituição anterior sem Decimal conciliado."); return sum.plus(revenue.valueDecimal); }, new Decimal(0)));
    if (refunded.plus(amount).gt(payment.valueDecimal)) throw new Error("Restituições acumuladas excedem o valor originalmente pago.");
    if (active.some(event => event.input.documentId === input.documentId)) throw new Error("Comprovante já utilizado; repita a chave original.");
    const document = await findSettlementDocument(tx, input.documentId);
    if (!document || document.status !== "Válido") throw new Error("Restituição exige comprovante GED válido.");
    const transactions = [];
    for (const [sourceKey, originalValue] of [[`FINANCEIRO:PAYMENT:${payment.id}:PAGAMENTO_EFETIVADO`, payment.valueDecimal], [`FINANCEIRO:SETTLEMENT:${payment.settlement.id}:LIQUIDACAO_REGISTRADA`, payment.settlement.valueDecimal], [`FINANCEIRO:COMMITMENT:${payment.commitmentId}:EMPENHO_EMITIDO`, payment.commitment.valueDecimal]] as const) {
      const original = await readRefundAccountingTransaction(tx, { idempotencyKey: sourceKey });
      if (!originalValue || original.status !== "POSTADO" || original.financialYearId !== year.id || original.budgetUnitId !== memory.input.budgetUnitId || !original.entries.length || original.entries.some(entry => !entry.valueDecimal?.eq(originalValue))) throw new Error("Partida original não conciliada para recomposição parcial.");
      const posting = await postAccountingTransactionInTransaction(tx, actor, { financialYearId: year.id, governmentEntityId: binding.governmentEntityId, budgetUnitId: memory.input.budgetUnitId, date, sourceModule: "RH", sourceType: kind === "DIARIA" ? "TRAVEL_EXPENSE_REFUND" : "ADVANCE_EXPENSE_REFUND", sourceId: request.id, eventType: "CURRENT_YEAR_EXPENSE_REFUNDED", idempotencyKey: `${key}:${original.id}`, history: input.reason, lines: original.entries.map(entry => ({ accountId: entry.accountId, type: entry.type === "Débito" ? "Crédito" : "Débito", value: amount })) });
      transactions.push(posting.id);
    }
    await recordPlanningFinanceExecution(tx, actor, { appropriationId: payment.commitment.appropriationId, operation: "REVERSE_PAYMENT", date, value: amount, key: `${key}:PAYMENT`, originPrefix: `finance:payment:${payment.id}:` });
    await recordPlanningFinanceExecution(tx, actor, { appropriationId: payment.commitment.appropriationId, operation: "REVERSE", date, value: amount, key: `${key}:COMMITMENT`, originPrefix: `finance:commit:${payment.commitmentId}:` });
    const movement = await insertFinanceCommitmentMovement(tx, { commitmentId: payment.commitmentId, date, type: "Anulação", valueDecimal: amount, justification: input.reason });
    await synchronizeCommittedBudgetMirror(tx, payment.commitment.appropriationId);
    const settlement = await insertFinanceSettlement(tx, { commitmentId: payment.commitmentId, date, value: -Number(amount), valueDecimal: amount.negated(), documentId: document.id, documentRef: `Restituição parcial ${key}`, status: "Liquidado", authorId }, []);
    const correction = await insertFinancePayment(tx, { orderNumber: key, date, value: -Number(amount), valueDecimal: amount.negated(), netValueDecimal: amount.negated(), commitmentId: payment.commitmentId, settlementId: settlement.id, bankAccountId: payment.bankAccountId, supplierId: payment.supplierId, creditorId: payment.creditorId, status: "Paga", bankStatus: "INTERNAL_REFUND", paymentMethod: "Restituição de despesa" });
    await tx.insert(financialDocuments).values({ number: `${key}:NL`, documentType: "ANULACAO_PARCIAL_LIQUIDACAO", title: "Restituição do exercício corrente — liquidação", generatedByUsuarioId: context.user.id, settlementId: settlement.id, snapshot: { requestId: request.id, originalSettlementId: payment.settlement.id, settlementId: settlement.id, amount: amount.negated().toFixed(2), documentId: document.id, date: input.date, reason: input.reason } });
    await tx.insert(financialDocuments).values({ number: `${key}:OP`, documentType: "RESTITUICAO_PARCIAL_PAGAMENTO", title: "Restituição do exercício corrente — pagamento", generatedByUsuarioId: context.user.id, paymentId: correction.id, snapshot: { requestId: request.id, originalPaymentId: payment.id, paymentId: correction.id, amount: amount.negated().toFixed(2), documentId: document.id, date: input.date, reason: input.reason } });
    await tx.execute(sql`SELECT id FROM "BankAccount" WHERE id=${payment.bankAccountId} FOR UPDATE`);
    const treasury = await insertTreasuryMovement(tx, { date, type: "ExpenseRefund", resourceSourceId: payment.commitment.appropriation.resourceSourceId, direction: "Entrada", valueDecimal: amount, history: input.reason, bankAccountId: payment.bankAccountId, financialYearId: year.id, sourceModule: "RH", sourceType: kind === "DIARIA" ? "TRAVEL_EXPENSE_REFUND" : "ADVANCE_EXPENSE_REFUND", sourceId: request.id, eventType: "CURRENT_YEAR_EXPENSE_REFUNDED", idempotencyKey: `${key}:CASH` });
    const event = await enqueueHrIntegration(tx, { sourceKey: key, domain: "FINANCEIRO", environment: "PRODUCAO", eventType: `${kind}_RESTITUICAO_DESPESA`, payload: { input, originalPaymentId: payment.id, originalSettlementId: payment.settlement.id, commitmentId: payment.commitmentId, correctionPaymentId: correction.id, correctionSettlementId: settlement.id, movementId: movement.id, treasuryMovementId: treasury.id, transactionIds: transactions, budgetUnitId: memory.input.budgetUnitId, governmentEntityId: binding.governmentEntityId, financialYearId: year.id } });
    return setAllowanceRefundEventStatus(tx, event.id, "CONCLUIDA");
  }, { timeoutMs: 60000 });
}

export async function reverseCurrentYearAdvanceRefund(connection: DatabaseConnection, context: AppContext, raw: unknown) {
  return reverseCurrentYearAllowanceRefund(connection, context, raw, "ADIANTAMENTO");
}

export async function reverseCurrentYearTravelRefund(connection: DatabaseConnection, context: AppContext, raw: unknown) {
  return reverseCurrentYearAllowanceRefund(connection, context, raw, "DIARIA");
}

async function reverseCurrentYearAllowanceRefund(connection: DatabaseConnection, context: AppContext, raw: unknown, kind: "ADIANTAMENTO" | "DIARIA") {
  const input = reversalSchema.parse(raw);
  input.refundId = input.refundId.replace(/^DESPESA:/, "");
  if (!canPerformModuleOperation(context.user, "FINANCEIRO", "create") || !canPerformModuleOperation(context.user, "FINANCEIRO", "update")) throw new Error("Estorno exige criação e alteração no Financeiro.");
  const authorId = context.user.employeeId;
  if (!authorId) throw new Error("A recomposição da liquidação exige usuário vinculado ao servidor responsável.");
  return withDatabaseTransaction(connection, async tx => {
    const originEvent = await readAllowanceRefundEvent(tx, input.refundId);
    if (originEvent.eventType !== `${kind}_RESTITUICAO_DESPESA`) throw new Error("Selecione restituição do exercício corrente da mesma modalidade.");
    const position = positionSchema.parse(originEvent.payload);
    await tx.execute(sql`SELECT id FROM "HrPortalRequest" WHERE id=${position.input.requestId} FOR UPDATE`);
    const request = await requireHrPortalRequest(tx, position.input.requestId);
    const event = await readAllowanceRefundEvent(tx, input.refundId);
    assertTravelAllowanceAccess(request.payload, context);
    if (request.kind !== kind) throw new Error("Restituição fora da origem da concessão.");
    const key = `${event.sourceKey}:REVERSE`;
    const previous = await findRefundIntegrationEvent(tx, key);
    if (previous) {
      if (JSON.stringify(reversalSchema.parse((previous.payload as JsonObject).input)) !== JSON.stringify(input)) throw new Error("Estorno já registrado com outros dados.");
      return previous;
    }
    if (request.status !== "DEFERIDA" || event.status !== "CONCLUIDA" || input.date < position.input.date) throw new Error("Regularize a prestação ativa antes de estornar a restituição.");
    if (kind === "DIARIA") await assertTravelReportOperationDate(tx, request.id, input.date);
    const report = kind === "DIARIA" ? await findActiveTravelAllowanceReport(tx, request.id) : null;
    if (report && report.status !== "ESTORNADA") throw new Error("Regularize a prestação ativa da diária antes de estornar a restituição.");
    await tx.execute(sql`SELECT id FROM "Commitment" WHERE id=${position.commitmentId} FOR UPDATE`);
    const originalPayment = await readAllowanceRefundPayment(tx, position.originalPaymentId);
    await tx.execute(sql`SELECT id FROM "BudgetAppropriation" WHERE id=${originalPayment.commitment.appropriationId} FOR UPDATE`);
    if (originalPayment.status !== "Paga" || originalPayment.commitment.status === "Anulado") throw new Error("Pagamento/concessão original não está ativo.");
    const document = await findSettlementDocument(tx, input.documentId);
    if (!document || document.status !== "Válido") throw new Error("Estorno exige parecer GED válido.");
    const actor = actorFor(context), date = new Date(`${input.date}T12:00:00Z`), amount = new Decimal(position.input.amount);
    await assertFinancialYearOpen(tx, position.financialYearId, date);
    await assertAccountingPeriodOpen(tx, position.financialYearId, date);
    if ((await getBudgetAvailability(tx, originalPayment.commitment.appropriationId)).available.lt(amount)) throw new Error("Dotação sem disponibilidade para recompor a despesa no estorno da restituição.");
    await tx.execute(sql`SELECT id FROM "BankAccount" WHERE id=${originalPayment.bankAccountId} FOR UPDATE`);
    if ((await getBankAccountBalance(tx, originalPayment.bankAccountId, date)).lt(amount)) throw new Error("Saldo insuficiente para estornar o ingresso da restituição.");
    if (!originalPayment.commitment.appropriation.resourceSourceId || (await getBankResourceSourceSpendableBalance(tx, originalPayment.bankAccountId, originalPayment.commitment.appropriation.resourceSourceId, date)).lt(amount)) throw new Error("Saldo por fonte insuficiente para estornar o ingresso da restituição.");
    for (const id of position.transactionIds) {
      const original = await readRefundAccountingTransaction(tx, { id });
      await postAccountingTransactionInTransaction(tx, actor, { financialYearId: position.financialYearId, governmentEntityId: position.governmentEntityId, budgetUnitId: position.budgetUnitId, date, sourceModule: "RH", sourceType: kind === "DIARIA" ? "TRAVEL_EXPENSE_REFUND_REVERSAL" : "ADVANCE_EXPENSE_REFUND_REVERSAL", sourceId: request.id, eventType: "CURRENT_YEAR_EXPENSE_REFUND_REVERSED", idempotencyKey: `${key}:${id}`, history: input.reason, reversalOfId: id, lines: original.entries.map(entry => ({ originalEntryId: entry.id, accountId: entry.accountId, type: entry.type === "Débito" ? "Crédito" : "Débito", value: entry.valueDecimal! })) });
    }
    await recordPlanningFinanceExecution(tx, actor, { appropriationId: originalPayment.commitment.appropriationId, operation: "CONSUME", date, value: amount, key: `finance:commit:${position.commitmentId}:refundRestore:${event.id}` });
    await recordPlanningFinanceExecution(tx, actor, { appropriationId: originalPayment.commitment.appropriationId, operation: "PAY", date, value: amount, key: `finance:payment:${originalPayment.id}:refundRestore:${event.id}` });
    await insertFinanceCommitmentMovement(tx, { commitmentId: position.commitmentId, date, type: "Reforço", valueDecimal: amount, justification: input.reason });
    await synchronizeCommittedBudgetMirror(tx, originalPayment.commitment.appropriationId);
    const settlement = await insertFinanceSettlement(tx, { commitmentId: position.commitmentId, date, value: Number(amount), valueDecimal: amount, documentId: document.id, documentRef: key, status: "Liquidado", authorId }, []);
    const payment = await insertFinancePayment(tx, { orderNumber: key, date, value: Number(amount), valueDecimal: amount, netValueDecimal: amount, commitmentId: position.commitmentId, settlementId: settlement.id, bankAccountId: originalPayment.bankAccountId, supplierId: originalPayment.supplierId, creditorId: originalPayment.creditorId, status: "Paga", bankStatus: "INTERNAL_REFUND", paymentMethod: "Estorno de restituição de despesa" });
    await tx.insert(financialDocuments).values({ number: `${key}:NL`, documentType: "ESTORNO_RESTITUICAO_LIQUIDACAO", title: "Estorno de restituição — liquidação", generatedByUsuarioId: context.user.id, settlementId: settlement.id, snapshot: { refundId: event.id, settlementId: settlement.id, amount: amount.toFixed(2), documentId: document.id, date: input.date, reason: input.reason } });
    await tx.insert(financialDocuments).values({ number: `${key}:OP`, documentType: "ESTORNO_RESTITUICAO_PAGAMENTO", title: "Estorno de restituição — pagamento", generatedByUsuarioId: context.user.id, paymentId: payment.id, snapshot: { refundId: event.id, paymentId: payment.id, amount: amount.toFixed(2), documentId: document.id, date: input.date, reason: input.reason } });
    await insertTreasuryMovement(tx, { date, type: "ExpenseRefundReversal", resourceSourceId: originalPayment.commitment.appropriation.resourceSourceId, direction: "Saída", valueDecimal: amount, history: input.reason, bankAccountId: originalPayment.bankAccountId, financialYearId: position.financialYearId, sourceModule: "RH", sourceType: kind === "DIARIA" ? "TRAVEL_EXPENSE_REFUND_REVERSAL" : "ADVANCE_EXPENSE_REFUND_REVERSAL", sourceId: request.id, eventType: "CURRENT_YEAR_EXPENSE_REFUND_REVERSED", idempotencyKey: `${key}:CASH` });
    const reversal = await enqueueHrIntegration(tx, { sourceKey: key, domain: "FINANCEIRO", environment: "PRODUCAO", eventType: `${kind}_RESTITUICAO_DESPESA_ESTORNADA`, payload: { input, requestId: request.id, refundId: event.id, correctionPaymentId: payment.id, correctionSettlementId: settlement.id } });
    await setAllowanceRefundEventStatus(tx, event.id, "ESTORNADA");
    return setAllowanceRefundEventStatus(tx, reversal.id, "CONCLUIDA");
  }, { timeoutMs: 60000 });
}
