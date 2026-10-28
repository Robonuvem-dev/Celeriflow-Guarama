import { resolveAccountClassificationSnapshots } from "./account-catalog";
import { resolveAccountingSourceDimensions, resolveAccountingLineSourceDimensions, resolveAccountingReversalLineDimensions } from "./accounting-source-dimensions";
import { composeMscLineDimensions } from "./msc-line-dimensions";
import { calculateRetentionDueDate, calculateRetentions, getActiveRetentionRules } from "./retencoes";
import { assertPlanningPeriodAvailability, assertPlanningReservationYear, getPlanningBudgetRestrictions, lockPlanningBudgetForAppropriation, recordPlanningFinanceExecution } from "@/lib/planejamento/execution-bridge";
import { lockPlanningRevenueBudget, recordPlanningRevenueCollection, recordPlanningRevenueReversal, recordPlanningRevenueRedistribution } from "@/lib/planejamento/revenue-execution-bridge";
import { releasePayrollProvisionsAtSettlement, reversePayrollProvisionSettlement, recordPayrollProvisionPayment, reversePayrollProvisionPayment } from "@/lib/rh/provision-accounting";
import { reverseAdvancePaymentControl, reverseAdvanceCommitmentControl, assertAdvanceRefundReversalAllowed, recordAdvanceRefundReversal } from "@/lib/rh/municipal-advances";
import { assertCurrentRefundPaymentMutationAllowed, settledCurrentRefundCorrections } from "./allowance-expense-refunds";
import { taxCollectionReceivableAccount } from "@/lib/tributacao/accrual-accounting";
import { recordSettlementMunicipalCosts, cancelSettlementMunicipalCosts } from "./cost-settlement-bridge";
import { recordAccountingMunicipalCosts } from "./cost-accounting-bridge";
import { assertBankResourceSource, getBankResourceSourceBalance, getBankResourceSourceSpendableBalance } from "./bank-resource-sources";
import { assertAnnualBudgetCleared, assertAnnualResultCleared, isAnnualResultReversal, resolveAnnualPostingOrigins } from "./annual-posting-origin";
import { inspectAnnualConsistency } from "./annual-consistency";
import { assertAnnualPayableRegistrations, reconcileAnnualPayableRegistrations } from "./annual-payable-registration";
import { getInheritedCarryForwardSettlement } from "./carry-forward-transport";
import { assertAnnualRapPostings } from "./annual-rap-postings";
import { preparedAnnualPaymentProgramIds } from "./annual-payment-program-transport";
import { FinanceError } from "./errors";
import { Decimal } from "@/db/decimal";
import { sql } from "drizzle-orm";
import { financialDocuments } from "@/db/schema/finance-documents";
import type { JsonObject, JsonValue } from "@/db/json";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseExecutor, type DatabaseTransaction } from "@/db/transaction";
import { findFinancialScopeYear, findPostingYear, listCostScopeUnits, listOpenExecutionYears } from "@/db/repositories/finance/report-scopes";
import { readAccountingPendingCounts } from "@/db/repositories/finance/accounting-pending";
import { findAnnualAccountingClose, findLatestAccountingCloseEvent, insertAccountingCloseEvent, insertAccountingMonthClose, insertAnnualAccountingClose, updateAccountingMonthClose, updateAccountingYearStatus, updateAnnualAccountingClose } from "@/db/repositories/finance/accounting-closes";
import { listAnnualCommitments } from "@/db/repositories/finance/annual-ledger";
import { listAccountingRuleComponents, replaceAccountingRule, replaceAccountingRuleComponents, upsertAccountingEvent } from "@/db/repositories/finance/accounting-configuration";
import { listTrialBalanceEntries } from "@/db/repositories/finance/accounting-reports";
import { findAccountingMonth, lockAccountingMonth, countClosedAccountingMonths, findAccountingEntryWithTransaction, findAccountingReplay, findAccountingSourcePosting, listAccountingEntries, listAccountingPlans, listAccountingUnitBindings, hasAccountingPlanChildren, insertAccountingPosting, insertAccountingAudit, readAccountingEventRules, readAccountingPaymentBasis } from "@/db/repositories/finance/accounting";
import { findCanonicalAccountingUnit, findCanonicalRevenueUnit } from "@/db/repositories/finance/accounting-origins";
import { findBudgetAppropriation, readBudgetAppropriation, listBudgetCommitments, listActiveBudgetReservations, findExpenseRequest, insertExpenseRequest, updateExpenseRequest, findBudgetReservation, insertBudgetReservation, setBudgetReservationStatus, findBudgetMovementReplay, insertBudgetMovement, updateBudgetAmounts, findFinanceSupplier, upsertSupplierCreditor, findFinancePurchaseReceipt, isPlanningOwnedAppropriation, readLegacyCmdSchedule, findFinanceCommitment, insertFinanceCommitment, setFinanceCommitmentStatus, insertFinanceCommitmentMovement, listCommitmentSettlementAmounts, listActivePaymentAmounts, type ExpenseRecord, type BudgetReservationRecord, type CommitmentRecord } from "@/db/repositories/finance/budget-execution";
import { bindCommitmentObrasService, findCommitmentContract, findCommitmentCovenant, findCommitmentFundedDebt, findCommitmentObrasService, findCommitmentProcess, findCommitmentPublicityCampaign, releaseCommitmentProcess } from "@/db/repositories/finance/commitment-origins";
import { listAnnualPostings } from "@/db/repositories/finance/annual-stages";
import { findPayableRegistration, findPayableSuccessor, hasPayableNativeSettlements, insertPayable, insertPayableEvent, listPayableActivePayments, listPayableEvents, listPayableSettlementLinks, readPayable, readPayableOrigin, readPayableYear, setPayableStatus } from "@/db/repositories/finance/payables";
import { findFinanceSettlement, findSettlementDocument, insertFinanceSettlement, isSettlementAuthorActive, listPayableNativeSettlements, readSettlementPaymentBasis, readSettlementWithOrigin, setSettlementStatus, type SettlementRecord } from "@/db/repositories/finance/settlements";
import { findFinanceBankAccount, hasDuplicateBankLedger, insertTreasuryMovement, listBankLedgerEntries, listConfirmedTreasuryMovements } from "@/db/repositories/finance/treasury";
import { findFinancePayment, insertFinancePayment, insertPaymentRetention, markWithholdingPaid, readPaymentExecution, readWithholdingExecution, setPaymentWithholdingStatus, updateFinancePayment, type PaymentRecord } from "@/db/repositories/finance/payments";
import { findActiveFinanceBank, findActiveFinanceBankBranch, findBankAccountingPlan, findConfirmedReconciliation, findTreasuryTransferReplay, hasBankAccountPostings, hasBankMovements, insertFinanceBankAccount, insertTreasuryTransfer, listPendingReconciliationStatements, listTreasuryPeriodMovements, listUnlinkedReconciliationMovements, lockBankPlanningAssignments, updateFinanceBankAccount } from "@/db/repositories/finance/treasury-operations";
import { findFinanceRevenue, findRevenueRedistribution, findRevenueRegistry, insertFinanceRevenue, insertRevenueRedistribution, insertRevenueReversal, listBankSourceRedistributions, readFinanceRevenueExecution, sumRevenueRedistributions, updateFinanceRevenue } from "@/db/repositories/finance/revenues";
export { FinanceError } from "./errors";
export { importBankStatementCsv } from "./csv-import";
export { matchBankStatementItemToTreasuryMovement } from "./bank-statement-matching";

export type FinanceActor = {
  usuarioId: string;
  employeeId: string | null;
  budgetUnitId?: string | null;
  allowedBudgetUnitIds?: string[];
};

export type RevenueClassification = "ORCAMENTARIA" | "INTRAORCAMENTARIA" | "REDUTORA";

const OPEN_STATUS = "Aberto";
const ACTIVE_RESERVATION_STATUS = "Ativa";
const ACTIVE_COMMITMENT_STATUSES = ["Emitido", "Liquidado", "Pago"];
const ACTIVE_SETTLEMENT_STATUS = "Liquidado";

function money(value: Decimal | string | number) {
  const decimal = new Decimal(String(value)).toDecimalPlaces(2);
  if (!decimal.isFinite() || decimal.lessThanOrEqualTo(0)) {
    throw new FinanceError("Informe um valor monetário maior que zero.");
  }
  return decimal;
}

function legacyMoney(value: Decimal) {
  // Float columns remain only as compatibility mirrors during the Decimal migration.
  return Number(value.toString());
}

function requiredDecimal(value: Decimal | null, field: string) {
  if (!value) {
    throw new FinanceError(`O campo Decimal ${field} ainda não foi conciliado. Execute o backfill financeiro antes de movimentar a dotação.`);
  }
  return value;
}

function jsonMoney(value: Decimal) {
  return value.toFixed(2);
}

function assertActorBudgetUnit(actor: FinanceActor, unitId: string) {
  if (actor.allowedBudgetUnitIds && !actor.allowedBudgetUnitIds.includes(unitId)) throw new FinanceError("Operação financeira fora das unidades autorizadas.");
}

async function assertAccountingYearScope(tx: DatabaseExecutor, actor: FinanceActor, financialYearId: string) {
  if (!actor.allowedBudgetUnitIds) return;
  const year = await findFinancialScopeYear(tx, financialYearId);
  if (!year?.governmentEntityId) throw new FinanceError("Fechamento de exercício legado exige escopo conciliado.");
  const units = await listCostScopeUnits(tx, year.governmentEntityId);
  if (!units.length || units.some((unit) => !actor.allowedBudgetUnitIds!.includes(unit.budgetUnitId))) throw new FinanceError("Fechamento ou reabertura exige autorização para todas as UGs da entidade.");
}

async function createFinancialDocument(
  tx: DatabaseTransaction,
  actor: FinanceActor,
  data: {
    documentType: "NOTA_DE_EMPENHO" | "NOTA_DE_LIQUIDACAO" | "ORDEM_DE_PAGAMENTO" | "COMPROVANTE_RECOLHIMENTO_RETENCAO";
    number: string;
    title: string;
    snapshot: unknown;
    commitmentId?: string;
    settlementId?: string;
    paymentId?: string;
    withholdingPayableId?: string;
  },
) {
  const [document] = await tx.insert(financialDocuments).values({ ...data, snapshot: JSON.parse(JSON.stringify(data.snapshot)) as JsonValue, generatedByUsuarioId: actor.usuarioId }).returning();
  return document;
}

async function audit(
  tx: DatabaseExecutor,
  actor: FinanceActor,
  action: string,
  entityType: string,
  entityId: string,
  payload: unknown,
  financialYearId?: string,
  budgetUnitId?: string,
) {
  await insertAccountingAudit(tx, actor, { action, entityType, entityId, financialYearId, budgetUnitId, payload: JSON.parse(JSON.stringify(payload)) as JsonValue });
}

export async function assertFinancialYearOpen(tx: DatabaseExecutor, financialYearId: string, date: Date) {
  const year = await findFinancialScopeYear(tx, financialYearId);
  if (!year) throw new FinanceError("Exercício financeiro não encontrado.");
  if (year.year !== date.getUTCFullYear()) throw new FinanceError("O exercício financeiro deve corresponder ao ano da data do lançamento.");
  if (year.status !== OPEN_STATUS) throw new FinanceError(`O exercício ${year.year} não está aberto para lançamentos.`);
  if (date < year.startDate || date > year.endDate) {
    throw new FinanceError("A data do lançamento está fora do exercício financeiro da dotação.");
  }
  return year;
}

async function lockAppropriation(tx: DatabaseTransaction, appropriationId: string) {
  await lockPlanningBudgetForAppropriation(tx, appropriationId);
  await tx.execute(sql`SELECT id FROM "BudgetAppropriation" WHERE id = ${appropriationId} FOR UPDATE`);
}

async function lockExpense(tx: DatabaseTransaction, expenseId: string) {
  const source = await findExpenseRequest(tx, { id: expenseId });
  if (source) await lockAppropriation(tx, source.appropriationId);
  await tx.execute(sql`SELECT id FROM "Expense" WHERE id = ${expenseId} FOR UPDATE`);
}

async function lockCommitment(tx: DatabaseTransaction, commitmentId: string) {
  const source = await findFinanceCommitment(tx, commitmentId);
  if (source) await lockAppropriation(tx, source.appropriationId);
  await tx.execute(sql`SELECT id FROM "Commitment" WHERE id = ${commitmentId} FOR UPDATE`);
}

async function lockObrasService(tx: DatabaseTransaction, obrasServiceId: string) {
  await tx.execute(sql`SELECT id FROM "ObrasServico" WHERE id = ${obrasServiceId} FOR UPDATE`);
}

async function lockContract(tx: DatabaseTransaction, contractId: string) {
  await tx.execute(sql`SELECT id FROM "Contract" WHERE id = ${contractId} FOR UPDATE`);
}

async function lockBankAccount(tx: DatabaseTransaction, bankAccountId: string) {
  await tx.execute(sql`SELECT id FROM "BankAccount" WHERE id = ${bankAccountId} FOR UPDATE`);
}

async function lockBankAssignment(tx: DatabaseTransaction, bankAccountId: string, nextUnit?: string) {
  const previous = await findFinanceBankAccount(tx, bankAccountId);
  if (!previous) return;
  await lockBankPlanningAssignments(tx, previous.budgetUnitId, nextUnit ?? previous.budgetUnitId);
  await lockBankAccount(tx, bankAccountId);
  const current = await findFinanceBankAccount(tx, bankAccountId);
  if (!current) throw new FinanceError("Conta bancária não encontrada.");
  if (current.budgetUnitId !== previous.budgetUnitId) throw new FinanceError("A vinculação da conta mudou; refaça a operação com os dados atuais.");
}

async function lockWithholdingPayable(tx: DatabaseTransaction, payableId: string) {
  await tx.execute(sql`SELECT id FROM "WithholdingPayable" WHERE id = ${payableId} FOR UPDATE`);
}

async function lockPayment(tx: DatabaseTransaction, paymentId: string) {
  const source = await findFinancePayment(tx, paymentId);
  if (source) await lockCommitment(tx, source.commitmentId);
  await tx.execute(sql`SELECT id FROM "Payment" WHERE id = ${paymentId} FOR UPDATE`);
}

async function lockRevenue(tx: DatabaseTransaction, revenueId: string) {
  const source = await findFinanceRevenue(tx, { id: revenueId });
  if (source?.bankAccountId && source.collectionDate) await lockPlanningRevenueBudget(tx, source.bankAccountId, source.collectionDate);
  await tx.execute(sql`SELECT id FROM "Revenue" WHERE id = ${revenueId} FOR UPDATE`);
}

async function lockPayableCarryForward(tx: DatabaseTransaction, payableCarryForwardId: string) {
  await tx.execute(sql`SELECT id FROM "PayableCarryForward" WHERE id = ${payableCarryForwardId} FOR UPDATE`);
}

async function lockPaymentWithholdings(tx: DatabaseTransaction, paymentId: string) {
  await tx.execute(sql`
    SELECT wp.id
    FROM "WithholdingPayable" wp
    JOIN "PaymentRetention" r ON wp."retentionId" = r.id
    WHERE r."paymentId" = ${paymentId}
    FOR UPDATE
  `);
}

function commitmentValue(value: Decimal | null, movements: { type: string; valueDecimal: Decimal }[]) {
  return movements.reduce((total, movement) => {
    if (movement.type === "Reforço") return total.plus(movement.valueDecimal);
    if (movement.type === "Anulação") return total.minus(movement.valueDecimal);
    throw new FinanceError("Movimento de empenho inválido.");
  }, requiredDecimal(value, "Commitment.valueDecimal"));
}

async function contractForCommitment(tx: DatabaseTransaction, contractId: string, date: Date, additionalValue: Decimal) {
  await lockContract(tx, contractId);
  const [contract, commitments] = await Promise.all([
    findCommitmentContract(tx, contractId),
    listBudgetCommitments(tx, { contractId }),
  ]);
  if (!contract) throw new FinanceError("Contrato informado não encontrado.");
  if (contract.status !== "Vigente" || date < contract.startDate || date > contract.endDate) {
    throw new FinanceError("O contrato informado não está vigente na data do empenho.");
  }

  const committed = commitments.reduce(
    (total, commitment) => total.plus(commitmentValue(commitment.valueDecimal, commitment.movements)),
    new Decimal(0),
  );
  const ceiling = new Decimal(String(contract.updatedValue));
  if (committed.plus(additionalValue).greaterThan(ceiling)) {
    throw new FinanceError("O lançamento excede o saldo do contrato.");
  }
  return contract;
}

export async function getBudgetAvailability(tx: DatabaseExecutor, appropriationId: string) {
  const appropriation = await findBudgetAppropriation(tx, appropriationId);
  if (!appropriation) throw new FinanceError("Dotação orçamentária não encontrada.");

  const [reservations, commitments] = await Promise.all([
    listActiveBudgetReservations(tx, { appropriationId }),
    listBudgetCommitments(tx, { appropriationId }),
  ]);

  const updated = requiredDecimal(appropriation.updatedValueDecimal, "BudgetAppropriation.updatedValueDecimal");
  const reserved = reservations.reduce(
    (total, reservation) => total.plus(requiredDecimal(reservation.valueDecimal, "BudgetReservation.valueDecimal")),
    new Decimal(0),
  );
  const committed = commitments.reduce(
    (total, commitment) => total.plus(commitmentValue(commitment.valueDecimal, commitment.movements)),
    new Decimal(0),
  );

  const restrictions = await getPlanningBudgetRestrictions(tx, appropriationId);
  return { updated, reserved, committed, available: updated.minus(reserved).minus(committed).minus(restrictions.creditReserved).minus(restrictions.contingent) };
}

async function assertCmdAvailability(
  tx: DatabaseTransaction,
  appropriation: { id: string; financialYearId: string; budgetUnitId: string; annualBudgetExpenseFixationId: string | null },
  date: Date,
  value: Decimal,
  reservationForCommitment?: { id: string; date: Date },
) {
  if (await assertPlanningPeriodAvailability(tx, appropriation.id, date, value, reservationForCommitment?.id)) return;
  // Records created before LOA traceability remain operational; new traced
  // appropriations are subject to the CMD control below.
  if (!appropriation.annualBudgetExpenseFixationId) return;

  const schedules = await readLegacyCmdSchedule(tx, appropriation.annualBudgetExpenseFixationId, appropriation.budgetUnitId);
  if (!schedules) throw new FinanceError("A dotação possui rastreabilidade de LOA inválida.");

  const month = date.getUTCMonth() + 1;
  if (new Set(schedules.map((schedule) => schedule.month)).size !== 12) {
    throw new FinanceError("A LOA vinculada à dotação exige CMD completo (12 meses) para esta unidade orçamentária.");
  }
  const schedule = schedules.find((item) => item.month === month);
  if (!schedule) throw new FinanceError("Não há limite CMD para o mês da reserva/empenho.");

  const periodStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const periodEnd = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
  const [reservations, commitments] = await Promise.all([
    listActiveBudgetReservations(tx, { financialYearId: appropriation.financialYearId, budgetUnitId: appropriation.budgetUnitId, from: periodStart, before: periodEnd }),
    listBudgetCommitments(tx, { financialYearId: appropriation.financialYearId, budgetUnitId: appropriation.budgetUnitId, from: periodStart, before: periodEnd }),
  ]);
  const reservationsTotal = reservations.reduce(
    (total, reservation) => total.plus(requiredDecimal(reservation.valueDecimal, "BudgetReservation.valueDecimal")),
    new Decimal(0),
  );
  const commitmentsTotal = commitments.reduce(
    (total, commitment) => total.plus(commitmentValue(commitment.valueDecimal, commitment.movements)),
    new Decimal(0),
  );
  const reservationAlreadyCounted = reservationForCommitment
    && reservationForCommitment.date.getUTCFullYear() === date.getUTCFullYear()
    && reservationForCommitment.date.getUTCMonth() === date.getUTCMonth();
  const projected = reservationsTotal.plus(commitmentsTotal).plus(reservationAlreadyCounted ? 0 : value);
  if (projected.greaterThan(schedule.limitValue)) {
    throw new FinanceError("O lançamento excede a disponibilidade do CMD da unidade orçamentária para este mês.");
  }
}

async function refreshCommittedMirror(tx: DatabaseTransaction, appropriationId: string) {
  const commitments = await listBudgetCommitments(tx, { appropriationId });
  const total = commitments.reduce(
    (sum, commitment) => sum.plus(commitmentValue(commitment.valueDecimal, commitment.movements)),
    new Decimal(0),
  );
  await updateBudgetAmounts(tx, appropriationId, { committed: total });
}

/** Reconciles the durable budget mirror after origin-controlled additive corrections. */
export async function synchronizeCommittedBudgetMirror(tx: DatabaseTransaction, appropriationId: string) {
  await lockAppropriation(tx, appropriationId);
  await refreshCommittedMirror(tx, appropriationId);
}

async function creditorForSupplier(tx: DatabaseTransaction, supplierId: string) {
  const supplier = await findFinanceSupplier(tx, supplierId);
  if (!supplier || supplier.status !== "Ativo") throw new FinanceError("Fornecedor não está ativo.");

  const name = supplier.company?.corporateName ?? supplier.person?.fullName;
  const document = supplier.company?.cnpj ?? supplier.person?.cpf;
  if (!name) throw new FinanceError("Fornecedor sem pessoa ou empresa vinculada.");

  return upsertSupplierCreditor(tx, {
      supplierId,
      name,
      document: document ?? undefined,
      personId: supplier.personId ?? undefined,
      companyId: supplier.companyId ?? undefined,
      status: supplier.status,
  });
}

export async function createExpenseRequest(
  db: DatabaseConnection,
  actor: FinanceActor,
  input: {
    date: Date;
    description: string;
    value: Decimal | string | number;
    appropriationId: string;
    supplierId: string;
    secretariatId: string;
    sourceModule: string;
    sourceType: string;
    sourceId?: string;
    eventType: string;
    idempotencyKey?: string;
    purchaseReceiptId?: string;
  },
) {
  return withDatabaseTransaction(db, tx => createExpenseRequestInTransaction(tx, actor, input));
}

export async function createExpenseRequestInTransaction(tx: DatabaseTransaction, actor: FinanceActor, input: Parameters<typeof createExpenseRequest>[2]): Promise<ExpenseRecord> {
  const value = money(input.value);
    await lockAppropriation(tx, input.appropriationId);
    if (input.idempotencyKey) {
      const existing = await findExpenseRequest(tx, { idempotencyKey: input.idempotencyKey });
      if (existing) {
        const source = await readBudgetAppropriation(tx, existing.appropriationId);
        assertActorBudgetUnit(actor, source.budgetUnitId);
        if (existing.appropriationId !== input.appropriationId || existing.supplierId !== input.supplierId || !existing.valueDecimal?.equals(value) || existing.date.getTime() !== input.date.getTime() || existing.sourceModule !== input.sourceModule.trim() || existing.sourceType !== input.sourceType.trim() || existing.sourceId !== (input.sourceId?.trim() || null)) throw new FinanceError("Solicitação de despesa já registrada com outros dados.");
        return existing;
      }
    }
    const [appropriation, supplier, purchaseReceipt] = await Promise.all([
      findBudgetAppropriation(tx, input.appropriationId),
      findFinanceSupplier(tx, input.supplierId),
      input.purchaseReceiptId
        ? findFinancePurchaseReceipt(tx, input.purchaseReceiptId)
        : null,
    ]);
    if (!appropriation) throw new FinanceError("Dotação orçamentária não encontrada.");
    if (!supplier || supplier.status !== "Ativo") throw new FinanceError("Selecione um fornecedor ativo para a solicitação de despesa.");
    assertActorBudgetUnit(actor, appropriation.budgetUnitId);
    if (input.purchaseReceiptId && (!purchaseReceipt || purchaseReceipt.status !== "APPROVED")) {
      throw new FinanceError("A despesa de compra exige um recebimento aprovado.");
    }
    if (purchaseReceipt && purchaseReceipt.contract.supplierId !== supplier.id) {
      throw new FinanceError("O fornecedor da despesa deve corresponder ao contrato do recebimento aprovado.");
    }
    const candidateYear = await readPayableYear(tx, appropriation.financialYearId);
    const year = candidateYear.status === "Preparação" ? await assertPlanningReservationYear(tx, appropriation.id, appropriation.financialYearId, input.date) : await assertFinancialYearOpen(tx, appropriation.financialYearId, input.date);
    const expense = await insertExpenseRequest(tx, {
        date: input.date,
        description: input.description.trim(),
        valueDecimal: value,
        value: legacyMoney(value),
        appropriationId: input.appropriationId,
        secretariatId: input.secretariatId,
        supplierId: supplier.id,
        requestedById: actor.usuarioId,
        sourceModule: input.sourceModule.trim(),
        sourceType: input.sourceType.trim(),
        sourceId: input.sourceId?.trim() || undefined,
        eventType: input.eventType.trim(),
        idempotencyKey: input.idempotencyKey?.trim() || undefined,
        purchaseReceiptId: purchaseReceipt?.id,
    });
    await audit(tx, actor, "CREATE", "Expense", expense.id, { value: jsonMoney(value), supplierId: supplier.id, sourceModule: expense.sourceModule, sourceType: expense.sourceType, sourceId: expense.sourceId, eventType: expense.eventType, purchaseReceiptId: expense.purchaseReceiptId }, year.id, appropriation.budgetUnitId);
    return expense;
}

export async function createExpenseRequestFromApprovedPurchaseReceipt(
  db: DatabaseConnection,
  actor: FinanceActor,
  input: { purchaseReceiptId: string; date: Date; description: string; value: Decimal | string | number; appropriationId: string; secretariatId: string; idempotencyKey?: string },
) {
  const receipt = await findFinancePurchaseReceipt(db.db, input.purchaseReceiptId);
  if (!receipt || receipt.status !== "APPROVED") throw new FinanceError("A solicitação de despesa exige um recebimento aprovado.");
  if (receipt.contract.secretariatId !== input.secretariatId) {
    throw new FinanceError("A solicitação de despesa deve utilizar a secretaria do contrato recebido.");
  }
  const receiptValue = receipt.items.reduce((total, item) => total.plus(new Decimal(item.quantity).mul(item.unitCost)), new Decimal(0));
  if (!money(input.value).equals(receiptValue)) {
    throw new FinanceError("A solicitação de despesa deve corresponder integralmente ao valor do recebimento aprovado.");
  }
  return createExpenseRequest(db, actor, {
    ...input,
    supplierId: receipt.contract.supplierId,
    sourceModule: "COMPRAS",
    sourceType: "PURCHASE_RECEIPT",
    sourceId: receipt.id,
    eventType: "PURCHASE_RECEIPT_EXPENSE_REQUESTED",
    idempotencyKey: input.idempotencyKey ?? `C5:PURCHASE_RECEIPT:${receipt.id}:EXPENSE`,
  });
}

export async function approveExpenseRequest(db: DatabaseConnection, actor: FinanceActor, expenseId: string) {
  return withDatabaseTransaction(db, tx => approveExpenseRequestInTransaction(tx, actor, expenseId));
}

export async function approveExpenseRequestInTransaction(tx: DatabaseTransaction, actor: FinanceActor, expenseId: string): Promise<ExpenseRecord> {
    await lockExpense(tx, expenseId);
    const request = await findExpenseRequest(tx, { id: expenseId });
    if (!request) throw new FinanceError("Solicitação de despesa não encontrada.");
    const expense = { ...request, appropriation: await readBudgetAppropriation(tx, request.appropriationId) };
    assertActorBudgetUnit(actor, expense.appropriation.budgetUnitId);
    const candidateYear = await readPayableYear(tx, expense.appropriation.financialYearId);
    const year = candidateYear.status === "Preparação" ? await assertPlanningReservationYear(tx, expense.appropriationId, candidateYear.id, expense.date) : await assertFinancialYearOpen(tx, expense.appropriation.financialYearId, new Date());
    if (expense.status !== "Solicitada") throw new FinanceError("Somente solicitações pendentes podem ser aprovadas.");
    if (expense.requestedById === actor.usuarioId) throw new FinanceError("Segregação de funções: o solicitante não pode aprovar a própria solicitação.");
    const approved = await updateExpenseRequest(tx, expense.id, { status: "Aprovada", approvedById: actor.usuarioId, approvedAt: new Date() });
    await audit(tx, actor, "APPROVE", "Expense", expense.id, { requestedById: expense.requestedById, approvedById: actor.usuarioId }, year.id, expense.appropriation.budgetUnitId);
    return approved;
}

const movementDirections: Record<string, 1 | -1> = {
  "Dotação Inicial": 1,
  "Crédito Adicional": 1,
  "Suplementação": 1,
  Especial: 1,
  Extraordinário: 1,
  Remanejamento: 1,
  Transposição: 1,
  Transferência: 1,
  Anulação: -1,
};

type BudgetMovementInput = {
  date: Date;
  type: string;
  value: Decimal | string | number;
  justification: string;
  appropriationId: string;
  sourceModule?: string;
  sourceType?: string;
  sourceId?: string;
  eventType?: string;
  idempotencyKey?: string;
};

export async function createBudgetMovementInTransaction(
  tx: DatabaseTransaction,
  actor: FinanceActor,
  input: BudgetMovementInput,
) {
  const value = money(input.value);
  const direction = movementDirections[input.type];
  if (!direction) throw new FinanceError("Tipo de movimento orçamentário inválido.");

  if (input.idempotencyKey) {
    const existing = await findBudgetMovementReplay(tx, input.idempotencyKey);
    if (existing) return existing;
  }
  await lockAppropriation(tx, input.appropriationId);
  const appropriation = await findBudgetAppropriation(tx, input.appropriationId);
  if (!appropriation) throw new FinanceError("Dotação orçamentária não encontrada.");
  if (await isPlanningOwnedAppropriation(tx, appropriation.id)) {
    throw new FinanceError("A dotação pertence ao Planejamento e Orçamento. Efetive a alteração pelo fluxo orçamentário da entidade responsável.");
  }
  const year = await assertFinancialYearOpen(tx, appropriation.financialYearId, input.date);
  const current = requiredDecimal(appropriation.updatedValueDecimal, "BudgetAppropriation.updatedValueDecimal");
  if (direction < 0) {
    const availability = await getBudgetAvailability(tx, appropriation.id);
    if (availability.available.lessThan(value)) throw new FinanceError("A anulação excede a disponibilidade da dotação.");
  }
  const updated = direction > 0 ? current.plus(value) : current.minus(value);
  const movement = await insertBudgetMovement(tx, {
      date: input.date,
      type: input.type,
      valueDecimal: value,
      justification: input.justification.trim(),
      appropriationId: input.appropriationId,
      sourceModule: input.sourceModule?.trim() || "MANUAL",
      sourceType: input.sourceType?.trim() || "BUDGET_MOVEMENT",
      sourceId: input.sourceId?.trim() || undefined,
      eventType: input.eventType?.trim() || "BUDGET_MOVEMENT",
      idempotencyKey: input.idempotencyKey?.trim() || undefined,
  });
  await updateBudgetAmounts(tx, appropriation.id, { updated });
  await audit(tx, actor, "CREATE", "BudgetMovement", movement.id, { type: movement.type, value: jsonMoney(value), resultingUpdatedValue: jsonMoney(updated) }, year.id);
  return movement;
}

export async function createBudgetMovement(
  db: DatabaseConnection,
  actor: FinanceActor,
  input: BudgetMovementInput,
) {
  if (input.type !== "Dotação Inicial") {
    throw new FinanceError("Alterações orçamentárias devem ser executadas exclusivamente por uma solicitação de crédito aprovada.");
  }
  return withDatabaseTransaction(db, (tx) => createBudgetMovementInTransaction(tx, actor, input));
}

export async function createBudgetReservation(
  db: DatabaseConnection,
  actor: FinanceActor,
  input: { number: string; date: Date; value: Decimal | string | number; appropriationId: string; expenseId: string; justification?: string },
) {
  return withDatabaseTransaction(db, (tx) => createBudgetReservationInTransaction(tx, actor, input));
}

export async function createBudgetReservationInTransaction(tx: DatabaseTransaction, actor: FinanceActor, input: Parameters<typeof createBudgetReservation>[2]): Promise<BudgetReservationRecord> {
  const value = money(input.value);
    await lockAppropriation(tx, input.appropriationId);
    const appropriation = await findBudgetAppropriation(tx, input.appropriationId);
    if (!appropriation) throw new FinanceError("Dotação orçamentária não encontrada.");
    assertActorBudgetUnit(actor, appropriation.budgetUnitId);
    const candidateYear = await readPayableYear(tx, appropriation.financialYearId);
    const year = candidateYear.status === "Preparação" ? await assertPlanningReservationYear(tx, appropriation.id, appropriation.financialYearId, input.date) : await assertFinancialYearOpen(tx, appropriation.financialYearId, input.date);
    await assertAccountingPeriodOpen(tx, year.id, input.date);
    await assertCmdAvailability(tx, appropriation, input.date, value);
    await lockExpense(tx, input.expenseId);
    const expense = await findExpenseRequest(tx, { id: input.expenseId });
    if (!expense || expense.appropriationId !== appropriation.id) throw new FinanceError("A solicitação de despesa não pertence à dotação informada.");
    if (expense.status !== "Aprovada") throw new FinanceError("A reserva exige uma solicitação de despesa aprovada.");
    const requested = requiredDecimal(expense.valueDecimal, "Expense.valueDecimal");
    if (!requested.equals(value)) throw new FinanceError("A reserva deve corresponder ao valor da solicitação de despesa.");
    const availability = await getBudgetAvailability(tx, appropriation.id);
    if (availability.available.lessThan(value)) throw new FinanceError("A reserva excede a disponibilidade da dotação.");
    const reservation = await insertBudgetReservation(tx, { number: input.number.trim(), date: input.date, valueDecimal: value, value: legacyMoney(value), appropriationId: appropriation.id, expenseId: expense.id, justification: input.justification?.trim() || undefined });
    await updateExpenseRequest(tx, expense.id, { status: "Reservada" });
    await audit(tx, actor, "CREATE", "BudgetReservation", reservation.id, { value: jsonMoney(value), appropriationId: appropriation.id, expenseId: expense.id }, year.id, appropriation.budgetUnitId);
    return reservation;
}

export async function cancelBudgetReservation(db: DatabaseConnection, actor: FinanceActor, reservationId: string) {
  return withDatabaseTransaction(db, async (tx) => {
    const source = await findBudgetReservation(tx, reservationId);
    if (!source) throw new FinanceError("Reserva orçamentária não encontrada.");
    await lockAppropriation(tx, source.appropriationId);
    const current = await findBudgetReservation(tx, reservationId);
    if (!current) throw new FinanceError("Reserva orçamentária não encontrada.");
    const reservation = { ...current, appropriation: await readBudgetAppropriation(tx, current.appropriationId) };
    assertActorBudgetUnit(actor, reservation.appropriation.budgetUnitId);
    const candidateYear = await readPayableYear(tx, reservation.appropriation.financialYearId);
    const year = candidateYear.status === "Preparação" ? await assertPlanningReservationYear(tx, reservation.appropriationId, candidateYear.id, reservation.date) : await assertFinancialYearOpen(tx, reservation.appropriation.financialYearId, reservation.date);
    if (reservation.status !== ACTIVE_RESERVATION_STATUS) throw new FinanceError("Somente reservas ativas podem ser canceladas.");
    const canceled = await setBudgetReservationStatus(tx, reservationId, "Cancelada");
    if (reservation.expenseId) await updateExpenseRequest(tx, reservation.expenseId, { status: "Aprovada" });
    await audit(tx, actor, "CANCEL", "BudgetReservation", reservationId, { previousStatus: reservation.status }, year.id);
    return canceled;
  });
}

export async function createCommitment(
  db: DatabaseConnection,
  actor: FinanceActor,
  input: {
    number: string;
    date: Date;
    value: Decimal | string | number;
    type: string;
    history: string;
    appropriationId: string;
    supplierId: string;
    reservationId: string;
    processId?: string;
    contractId?: string;
    obrasServiceId?: string;
    covenantId?: string;
    covenantNumber?: string;
    publicityCampaignId?: string;
    publicityCampaignName?: string;
    fundedDebtId?: string;
    fundedDebtName?: string;
  },
) {
  return withDatabaseTransaction(db, (tx) => createCommitmentInTransaction(tx, actor, input));
}

export async function createCommitmentInTransaction(tx: DatabaseTransaction, actor: FinanceActor, input: Parameters<typeof createCommitment>[2]): Promise<CommitmentRecord> {
  const value = money(input.value);
  const obrasServiceId = input.obrasServiceId?.trim() || undefined;
  if (!["Ordinário", "Estimativo", "Global"].includes(input.type)) throw new FinanceError("Tipo de empenho inválido.");
    await lockAppropriation(tx, input.appropriationId);
    const [appropriation, reservation] = await Promise.all([
      findBudgetAppropriation(tx, input.appropriationId),
      findBudgetReservation(tx, input.reservationId),
    ] as const);
    if (!appropriation) throw new FinanceError("Dotação orçamentária não encontrada.");
    assertActorBudgetUnit(actor, appropriation.budgetUnitId);
    const year = await assertFinancialYearOpen(tx, appropriation.financialYearId, input.date);
    await assertAccountingPeriodOpen(tx, year.id, input.date);
    if (!reservation || reservation.appropriationId !== appropriation.id || reservation.status !== ACTIVE_RESERVATION_STATUS) throw new FinanceError("Selecione uma reserva ativa da mesma dotação.");
    if (!requiredDecimal(reservation.valueDecimal, "BudgetReservation.valueDecimal").equals(value)) throw new FinanceError("O empenho deve corresponder integralmente à reserva selecionada.");
    await assertCmdAvailability(tx, appropriation, input.date, value, reservation);
    const availability = await getBudgetAvailability(tx, appropriation.id);
    if (availability.available.lessThan(0)) throw new FinanceError("A dotação não possui disponibilidade válida para empenho.");
    if (obrasServiceId) await lockObrasService(tx, obrasServiceId);
    const process = input.processId
      ? await findCommitmentProcess(tx, input.processId)
      : null;
    if (input.processId && !process) throw new FinanceError("Processo informado não encontrado.");
    const contract = input.contractId
      ? await contractForCommitment(tx, input.contractId, input.date, value)
      : null;
    if (contract) {
      if (contract.supplierId !== input.supplierId) throw new FinanceError("O contrato informado não pertence ao fornecedor do empenho.");
    }
    const expense = reservation.expenseId ? await findExpenseRequest(tx, { id: reservation.expenseId }) : null;
    const purchaseReceiptId = expense?.purchaseReceiptId ?? undefined;
    const purchaseReceipt = purchaseReceiptId
      ? await findFinancePurchaseReceipt(tx, purchaseReceiptId)
      : null;
    if (purchaseReceiptId && (!purchaseReceipt || purchaseReceipt.status !== "APPROVED")) {
      throw new FinanceError("O empenho exige um recebimento de compra aprovado.");
    }
    if (purchaseReceipt && (!contract || purchaseReceipt.contractId !== contract.id)) {
      throw new FinanceError("O empenho deve utilizar o contrato vinculado ao recebimento aprovado.");
    }
    const [covenant, publicityCampaign, fundedDebt] = await Promise.all([
      input.covenantId
        ? findCommitmentCovenant(tx, input.covenantId)
        : null,
      input.publicityCampaignId
        ? findCommitmentPublicityCampaign(tx, input.publicityCampaignId)
        : null,
      input.fundedDebtId
        ? findCommitmentFundedDebt(tx, input.fundedDebtId)
        : null,
    ]);
    if (input.covenantId && !covenant) throw new FinanceError("Convênio informado não encontrado.");
    if (covenant && (covenant.status !== "Ativo" || input.date < covenant.startDate || input.date > covenant.endDate)) {
      throw new FinanceError("O convênio deve estar ativo e vigente na data do empenho.");
    }
    if (input.publicityCampaignId && !publicityCampaign) throw new FinanceError("Campanha de publicidade informada não encontrada.");
    if (publicityCampaign && (publicityCampaign.status !== "Ativa" || input.date < publicityCampaign.startDate || input.date > publicityCampaign.endDate)) {
      throw new FinanceError("A campanha de publicidade deve estar ativa e vigente na data do empenho.");
    }
    if (input.fundedDebtId && !fundedDebt) throw new FinanceError("Dívida fundada informada não encontrada.");
    if (fundedDebt?.status !== undefined && fundedDebt.status !== "Ativa") {
      throw new FinanceError("A dívida fundada deve estar ativa para receber empenhos.");
    }
    const obrasService = obrasServiceId
      ? await findCommitmentObrasService(tx, obrasServiceId)
      : null;
    if (obrasServiceId && !obrasService) throw new FinanceError("Ordem de serviço/obra informada não encontrada.");
    if (obrasService && !obrasService.active) throw new FinanceError("A ordem de serviço/obra informada está inativa.");
    if (obrasService?.commitmentId) throw new FinanceError("A ordem de serviço/obra já está vinculada a outro empenho.");
    if (obrasService?.budgetAppropriationId && obrasService.budgetAppropriationId !== appropriation.id) {
      throw new FinanceError("A ordem de serviço/obra pertence a outra dotação orçamentária.");
    }
    if (appropriation.expenseNature.procurementOriginPolicy === "CONTRACT" && !contract) {
      throw new FinanceError("A natureza de despesa exige um contrato vigente para emitir o empenho.");
    }
    if (appropriation.expenseNature.procurementOriginPolicy === "PROCUREMENT_SOURCE" && !contract) {
      throw new FinanceError("A natureza de despesa exige uma origem de contratação válida. Informe um contrato vigente vinculado ao fornecedor.");
    }
    const creditor = await creditorForSupplier(tx, input.supplierId);
    const commitment = await insertFinanceCommitment(tx, {
        number: input.number.trim(),
        date: input.date,
        valueDecimal: value,
        value: legacyMoney(value),
        type: input.type,
        history: input.history.trim(),
        appropriationId: appropriation.id,
        supplierId: input.supplierId,
        creditorId: creditor.id,
        processId: input.processId || undefined,
        contractId: input.contractId || undefined,
        purchaseProcessId: purchaseReceipt?.purchaseProcessId ?? contract?.processId,
        purchaseReceiptId: purchaseReceipt?.id,
        covenantId: covenant?.id,
        covenantNumber: covenant?.number,
        publicityCampaignId: publicityCampaign?.id,
        publicityCampaignName: publicityCampaign?.name,
        fundedDebtId: fundedDebt?.id,
        fundedDebtName: fundedDebt ? `${fundedDebt.lawNumber} - ${fundedDebt.creditorName}` : undefined,
        reservationId: reservation.id,
        status: "Emitido",
    });
    if (obrasService) await bindCommitmentObrasService(tx, obrasService.id, commitment.id);
    await createFinancialDocument(tx, actor, {
      documentType: "NOTA_DE_EMPENHO",
      number: `NE-${commitment.number}`,
      title: `Nota de Empenho ${commitment.number}`,
      commitmentId: commitment.id,
      snapshot: {
        commitment: {
          id: commitment.id,
          number: commitment.number,
          date: commitment.date.toISOString(),
          value: jsonMoney(value),
          type: commitment.type,
          history: commitment.history,
          appropriationId: commitment.appropriationId,
          supplierId: commitment.supplierId,
          creditorId: commitment.creditorId,
          reservationId: commitment.reservationId,
          purchaseProcessId: commitment.purchaseProcessId,
          purchaseReceiptId: commitment.purchaseReceiptId,
          obrasService: obrasService ? { id: obrasService.id, protocolo: obrasService.protocolo, budgetAppropriationId: obrasService.budgetAppropriationId } : null,
        },
      },
    });
    await setBudgetReservationStatus(tx, reservation.id, "Empenhada");
    if (reservation.expenseId) await updateExpenseRequest(tx, reservation.expenseId, { status: "Empenhada" });
    await refreshCommittedMirror(tx, appropriation.id);
    await recordPlanningFinanceExecution(tx, actor, { appropriationId: appropriation.id, operation: "CONSUME", date: commitment.date, value, key: `finance:commit:${commitment.id}:initial` });
    await postAccountingEventInTransaction(tx, actor, {
      financialYearId: year.id,
      date: commitment.date,
      eventCode: "EMPENHO_EMITIDO",
      value,
      history: `Empenho ${commitment.number}: ${commitment.history}`,
      sourceModule: "FINANCEIRO",
      sourceType: "COMMITMENT",
      sourceId: commitment.id,
      idempotencyKey: `FINANCEIRO:COMMITMENT:${commitment.id}:EMPENHO_EMITIDO`,
    });
    if (process) await releaseCommitmentProcess(tx, { processId: process.id, number: commitment.number, commitmentId: commitment.id, value: jsonMoney(value), departmentId: process.currentDepartmentId, employeeId: actor.employeeId });
    await audit(tx, actor, "CREATE", "Commitment", commitment.id, { value: jsonMoney(value), reservationId: reservation.id, creditorId: creditor.id, processId: commitment.processId, purchaseProcessId: commitment.purchaseProcessId, purchaseReceiptId: commitment.purchaseReceiptId, contractId: commitment.contractId, obrasServiceId: obrasService?.id }, year.id);
    return commitment;
}

export async function cancelCommitment(db: DatabaseConnection, actor: FinanceActor, commitmentId: string) {
  return withDatabaseTransaction(db, (tx) => cancelCommitmentInTransaction(tx, actor, commitmentId));
}

export async function cancelCommitmentInTransaction(tx: DatabaseTransaction, actor: FinanceActor, commitmentId: string, date = new Date(), reason = "Anulação integral do empenho"): Promise<CommitmentRecord> {
    const source = await findFinanceCommitment(tx, commitmentId);
    const reservation = source?.reservationId ? await findBudgetReservation(tx, source.reservationId) : null;
    const allowance = reservation?.expenseId ? await findExpenseRequest(tx, { id: reservation.expenseId }) : null;
    if (allowance?.sourceModule === "RH" && ["ADVANCE_ALLOWANCE", "TRAVEL_ALLOWANCE"].includes(allowance.sourceType ?? "") && allowance.sourceId) await tx.execute(sql`SELECT id FROM "HrPortalRequest" WHERE id=${allowance.sourceId} FOR UPDATE`);
    await lockCommitment(tx, commitmentId);
    const commitment = await findFinanceCommitment(tx, commitmentId);
    if (!commitment) throw new FinanceError("Empenho não encontrado.");
    await lockAppropriation(tx, commitment.appropriationId);
    assertActorBudgetUnit(actor, commitment.appropriation.budgetUnitId);
    const year = await assertFinancialYearOpen(tx, commitment.appropriation.financialYearId, date);
    await assertAccountingPeriodOpen(tx, year.id, date);
    if (commitment.status === "Anulado") throw new FinanceError("O empenho já está anulado.");
    const settledCorrections = await settledCurrentRefundCorrections(tx, commitment.id);
    const [settlements, payments] = await Promise.all([listCommitmentSettlementAmounts(tx, commitmentId), listActivePaymentAmounts(tx, { commitmentId })]);
    if (settlements.some(row => !settledCorrections.settlements.has(row.id)) || payments.some(row => !settledCorrections.payments.has(row.id))) throw new FinanceError("Empenhos com liquidações ou pagamentos ativos não podem ser anulados integralmente.");
    const effectiveValue = commitmentValue(commitment.valueDecimal, commitment.movements);
    const canceledAt = date;
    if (effectiveValue.greaterThan(0)) {
      await insertFinanceCommitmentMovement(tx, { date: canceledAt, type: "Anulação", valueDecimal: effectiveValue, justification: reason.trim(), commitmentId });
      await postCommitmentBalanceChange(tx, actor, commitment, year.id, { date: canceledAt, value: effectiveValue, reverse: true, sourceType: "COMMITMENT_REVERSAL", sourceId: commitment.id, eventType: "EMPENHO_ANULADO", key: `FINANCEIRO:COMMITMENT:${commitment.id}:EMPENHO_ANULADO` });
    }
    const canceled = await setFinanceCommitmentStatus(tx, commitmentId, "Anulado");
    await reverseAdvanceCommitmentControl(tx, actor, commitmentId, date, reason);
    await refreshCommittedMirror(tx, commitment.appropriationId);
    if (effectiveValue.greaterThan(0)) await recordPlanningFinanceExecution(tx, actor, { appropriationId: commitment.appropriationId, operation: "REVERSE", date: canceledAt, value: effectiveValue, key: `finance:cancel:${commitment.id}`, originPrefix: `finance:commit:${commitment.id}:` });
    await audit(tx, actor, "CANCEL", "Commitment", commitmentId, { previousStatus: commitment.status, value: jsonMoney(effectiveValue) }, year.id);
    return canceled;
}

export async function createCommitmentMovement(db: DatabaseConnection, actor: FinanceActor, input: { commitmentId: string; date: Date; type: "Reforço" | "Anulação"; value: Decimal | string | number; justification: string }) {
  return withDatabaseTransaction(db, (tx) => createCommitmentMovementInTransaction(tx, actor, input));
}

export async function createCommitmentMovementInTransaction(tx: DatabaseTransaction, actor: FinanceActor, input: Parameters<typeof createCommitmentMovement>[2]) {
  const value = money(input.value);
  if (!["Reforço", "Anulação"].includes(input.type)) throw new FinanceError("Tipo de movimento de empenho inválido.");
  if (!input.justification.trim()) throw new FinanceError("Informe a justificativa do movimento de empenho.");
    await lockCommitment(tx, input.commitmentId);
    const commitment = await findFinanceCommitment(tx, input.commitmentId);
    if (!commitment) throw new FinanceError("Empenho não encontrado.");
    await lockAppropriation(tx, commitment.appropriationId);
    assertActorBudgetUnit(actor, commitment.appropriation.budgetUnitId);
    const year = await assertFinancialYearOpen(tx, commitment.appropriation.financialYearId, input.date);
    if (!ACTIVE_COMMITMENT_STATUSES.includes(commitment.status)) throw new FinanceError("Somente empenhos ativos podem receber movimentos.");
    const effectiveValue = commitmentValue(commitment.valueDecimal, commitment.movements);
    if (input.type === "Reforço") {
      const availability = await getBudgetAvailability(tx, commitment.appropriationId);
      if (availability.available.lessThan(value)) throw new FinanceError("O reforço excede a disponibilidade da dotação.");
      await assertCmdAvailability(tx, commitment.appropriation, input.date, value);
      if (commitment.contractId) await contractForCommitment(tx, commitment.contractId, input.date, value);
    } else {
      const settled = (await listCommitmentSettlementAmounts(tx, commitment.id)).reduce((total, settlement) => total.plus(requiredDecimal(settlement.valueDecimal, "Settlement.valueDecimal")), new Decimal(0));
      if (effectiveValue.minus(value).lessThan(settled)) throw new FinanceError("A anulação não pode reduzir o empenho abaixo do valor liquidado.");
    }
    const movement = await insertFinanceCommitmentMovement(tx, { date: input.date, type: input.type, valueDecimal: value, justification: input.justification.trim(), commitmentId: commitment.id });
    await postCommitmentBalanceChange(tx, actor, commitment, year.id, { date: input.date, value, reverse: input.type === "Anulação", sourceType: "COMMITMENT_MOVEMENT", sourceId: movement.id, eventType: input.type === "Reforço" ? "EMPENHO_REFORCADO" : "EMPENHO_ANULACAO_PARCIAL", key: `FINANCEIRO:COMMITMENT_MOVEMENT:${movement.id}` });
    await refreshCommittedMirror(tx, commitment.appropriationId);
    await recordPlanningFinanceExecution(tx, actor, { appropriationId: commitment.appropriationId, operation: input.type === "Reforço" ? "CONSUME" : "REVERSE", date: input.date, value, key: input.type === "Reforço" ? `finance:commit:${commitment.id}:movement:${movement.id}` : `finance:reversal:${movement.id}`, originPrefix: `finance:commit:${commitment.id}:` });
    await audit(tx, actor, "CREATE", "CommitmentMovement", movement.id, { type: movement.type, value: jsonMoney(value), commitmentId: commitment.id, resultingEffectiveValue: jsonMoney(input.type === "Reforço" ? effectiveValue.plus(value) : effectiveValue.minus(value)) }, year.id);
    return movement;
}

async function postCommitmentBalanceChange(tx: DatabaseTransaction, actor: FinanceActor, commitment: { id: string; number: string; valueDecimal: Decimal | null }, financialYearId: string, input: { date: Date; value: Decimal; reverse: boolean; sourceType: string; sourceId: string; eventType: string; key: string }) {
  const originals = await listAnnualPostings(tx, { financialYearId, sourceType: "COMMITMENT", sourceId: commitment.id, eventType: "EMPENHO_EMITIDO", status: "POSTADO" }, 2);
  const original = originals.length === 1 ? originals[0] : undefined;
  if (!original || original.entries.length < 2 || original.entries.length % 2 !== 0 || original.entries.some((entry) => !entry.valueDecimal?.equals(requiredDecimal(commitment.valueDecimal, "Commitment.valueDecimal")) || !["Débito", "Crédito"].includes(entry.type)) || original.entries.filter(entry => entry.type === "Débito").length !== original.entries.filter(entry => entry.type === "Crédito").length) throw new FinanceError("Reconcilie a postagem original do empenho antes de reforçar ou anular seu saldo.");
  return postAccountingTransactionInTransaction(tx, actor, { financialYearId, date: input.date, history: `${input.eventType} · empenho ${commitment.number}`, sourceModule: "FINANCEIRO", sourceType: input.sourceType, sourceId: input.sourceId, eventType: input.eventType, idempotencyKey: input.key, reversalOfId: input.sourceType === "COMMITMENT_REVERSAL" ? original.id : undefined, lines: original.entries.map((entry) => ({ ...(input.sourceType === "COMMITMENT_REVERSAL" ? { originalEntryId: entry.id } : {}), accountId: entry.accountId, type: input.reverse ? entry.type === "Débito" ? "Crédito" : "Débito" : entry.type as "Débito" | "Crédito", value: input.value })) });
}

async function commitmentForPosting(tx: DatabaseTransaction, commitmentId: string, date: Date) {
  await lockCommitment(tx, commitmentId);
  const commitment = await findFinanceCommitment(tx, commitmentId);
  if (!commitment) throw new FinanceError("Empenho não encontrado.");
  const year = await assertFinancialYearOpen(tx, commitment.appropriation.financialYearId, date);
  await assertAccountingPeriodOpen(tx, year.id, date);
  if (!ACTIVE_COMMITMENT_STATUSES.includes(commitment.status)) throw new FinanceError("Não é permitido lançar sobre empenho inativo ou anulado.");
  return { commitment, year };
}

async function activeSettlementTotal(tx: DatabaseTransaction, commitmentId: string) {
  const settlements = await listCommitmentSettlementAmounts(tx, commitmentId);
  return settlements.reduce((total, settlement) => total.plus(requiredDecimal(settlement.valueDecimal, "Settlement.valueDecimal")), new Decimal(0));
}

async function activePaymentTotal(tx: DatabaseTransaction, where: { commitmentId?: string; settlementId?: string; payableCarryForwardId?: string }) {
  const payments = await listActivePaymentAmounts(tx, where);
  return payments.reduce((total, payment) => total.plus(requiredDecimal(payment.valueDecimal, "Payment.valueDecimal")), new Decimal(0));
}

async function refreshCommitmentExecutionStatus(tx: DatabaseTransaction, commitmentId: string) {
  const commitment = await findFinanceCommitment(tx, commitmentId);
  if (!commitment || commitment.status === "Anulado") return;
  const [settled, paid] = await Promise.all([activeSettlementTotal(tx, commitmentId), activePaymentTotal(tx, { commitmentId })]);
  const effectiveValue = commitmentValue(commitment.valueDecimal, commitment.movements);
  const status = paid.equals(effectiveValue) ? "Pago" : settled.greaterThan(0) ? "Liquidado" : "Emitido";
  if (commitment.status !== status) await setFinanceCommitmentStatus(tx, commitmentId, status);
}

export async function createSettlement(db: DatabaseConnection, actor: FinanceActor, input: {
  date: Date;
  value: Decimal | string | number;
  documentRef?: string;
  fiscalDocumentNumber?: string;
  fiscalDocumentSeries?: string;
  fiscalDocumentIssueDate?: Date;
  fiscalDocumentAccessKey?: string;
  documentId?: string;
  commitmentId: string;
  authorId: string;
  notes?: string;
  serviceCode?: string;
  retentionRuleIds?: string[];
  payableCarryForwardId?: string;
}) {
  return withDatabaseTransaction(db, (tx) => createSettlementInTransaction(tx, actor, input));
}

export async function createSettlementInTransaction(tx: DatabaseTransaction, actor: FinanceActor, input: Parameters<typeof createSettlement>[2]): Promise<SettlementRecord> {
  const value = money(input.value);
  const fiscalDocumentNumber = input.fiscalDocumentNumber?.trim() || undefined;
  const fiscalDocumentSeries = input.fiscalDocumentSeries?.trim() || undefined;
  const fiscalDocumentAccessKey = input.fiscalDocumentAccessKey?.replace(/\D/g, "") || undefined;
  const fiscalDocumentIssueDate = input.fiscalDocumentIssueDate;
  if (fiscalDocumentIssueDate && Number.isNaN(fiscalDocumentIssueDate.getTime())) {
    throw new FinanceError("Data de emissão do documento fiscal inválida.");
  }
  if (Boolean(fiscalDocumentNumber) !== Boolean(fiscalDocumentIssueDate)) {
    throw new FinanceError("Informe juntos o número e a data de emissão do documento fiscal.");
  }
  if (fiscalDocumentAccessKey && !fiscalDocumentNumber) {
    throw new FinanceError("A chave de acesso exige o número do documento fiscal.");
  }
  if (fiscalDocumentAccessKey && !/^\d{44}$/.test(fiscalDocumentAccessKey)) {
    throw new FinanceError("A chave de acesso do documento fiscal deve conter 44 dígitos.");
  }
    const { commitment, year } = input.payableCarryForwardId
      ? await carryForwardForPosting(tx, actor, input.payableCarryForwardId, input.commitmentId, input.date, "NAO_PROCESSADO")
      : await commitmentForPosting(tx, input.commitmentId, input.date);
    assertActorBudgetUnit(actor, commitment.appropriation.budgetUnitId);
    if (!input.documentId) throw new FinanceError("Vincule o documento fiscal ou comprobatório já cadastrado no GED.");
    const [document, author, settled] = await Promise.all([
      findSettlementDocument(tx, input.documentId),
      isSettlementAuthorActive(tx, input.authorId),
      activeSettlementTotal(tx, commitment.id),
    ]);
    if (!document || document.status !== "Válido") throw new FinanceError("O documento GED informado não está válido.");
    if (!author) throw new FinanceError("O responsável pelo ateste não está ativo.");
    const retentionRules = input.retentionRuleIds?.length
      ? await getActiveRetentionRules(tx, {
          financialYearId: year.id,
          date: input.date,
          serviceCode: input.serviceCode?.trim() || undefined,
          ruleIds: input.retentionRuleIds,
        })
      : [];
    const calculatedRetentions = calculateRetentions(value, retentionRules).map((calculation, index) => ({
      ...calculation,
      rule: retentionRules[index],
    }));
    const retentionTotal = calculatedRetentions.reduce((total, retention) => total.plus(retention.retainedValue), new Decimal(0));
    if (retentionTotal.greaterThan(value)) throw new FinanceError("As retenções não podem exceder o valor bruto da liquidação.");
    const effectiveValue = commitmentValue(commitment.valueDecimal, commitment.movements);
    if (settled.plus(value).greaterThan(effectiveValue)) throw new FinanceError("A liquidação acumulada excede o valor vigente do empenho.");
    if (input.payableCarryForwardId) {
      const payable = await readPayable(tx, input.payableCarryForwardId);
      const allocated = await listPayableNativeSettlements(tx, payable.id);
      const total = allocated.reduce((sum, row) => sum.plus(requiredDecimal(row.valueDecimal, "Settlement.valueDecimal")), new Decimal(0));
      const inherited = await listPayableSettlementLinks(tx, payable.id, true);
      const inheritedTotal = inherited.reduce((sum, link) => sum.plus(link.valueDecimal), new Decimal(0));
      if (total.plus(inheritedTotal).plus(value).gt(payable.valueDecimal)) throw new FinanceError("A liquidação excede o saldo inscrito do RAP não processado, incluindo liquidações herdadas.");
    }
    const settlement = await insertFinanceSettlement(tx, {
        date: input.date,
        valueDecimal: value,
        value: legacyMoney(value),
        documentRef: input.documentRef?.trim() || undefined,
        fiscalDocumentNumber,
        fiscalDocumentSeries,
        fiscalDocumentIssueDate,
        fiscalDocumentAccessKey,
        documentId: document.id,
        commitmentId: commitment.id,
        authorId: input.authorId,
        executionFinancialYearId: input.payableCarryForwardId ? year.id : undefined,
        payableCarryForwardId: input.payableCarryForwardId,
        notes: input.notes?.trim() || undefined,
        status: ACTIVE_SETTLEMENT_STATUS,
      }, calculatedRetentions.map((retention) => ({
            retentionRuleId: retention.rule.id,
            type: retention.type,
            description: retention.rule.description,
            calculationBaseDecimal: retention.baseValue,
            ratePercentage: retention.ratePercentage,
            valueDecimal: retention.retainedValue,
            beneficiaryName: retention.rule.beneficiaryName,
            beneficiaryDocument: retention.rule.beneficiaryDocument ?? undefined,
            dueDate: calculateRetentionDueDate(input.date, retention.rule.dueDays),
          })));
    await createFinancialDocument(tx, actor, {
      documentType: "NOTA_DE_LIQUIDACAO",
      number: `NL-${settlement.id}`,
      title: `Nota de Liquidação ${settlement.id}`,
      settlementId: settlement.id,
      snapshot: {
        settlement: {
          id: settlement.id,
          date: settlement.date.toISOString(),
          value: jsonMoney(value),
          documentRef: settlement.documentRef,
          fiscalDocumentNumber: settlement.fiscalDocumentNumber,
          fiscalDocumentSeries: settlement.fiscalDocumentSeries,
          fiscalDocumentIssueDate: settlement.fiscalDocumentIssueDate?.toISOString(),
          fiscalDocumentAccessKey: settlement.fiscalDocumentAccessKey,
          documentId: settlement.documentId,
          commitmentId: settlement.commitmentId,
          authorId: settlement.authorId,
          executionFinancialYearId: settlement.executionFinancialYearId,
          payableCarryForwardId: settlement.payableCarryForwardId,
          notes: settlement.notes,
        },
        commitment: { id: commitment.id, number: commitment.number },
        retentions: calculatedRetentions.map((retention) => ({
          ruleId: retention.rule.id,
          type: retention.type,
          description: retention.rule.description,
          baseValue: jsonMoney(retention.baseValue),
          ratePercentage: retention.ratePercentage.toFixed(4),
          value: jsonMoney(retention.retainedValue),
          beneficiaryName: retention.rule.beneficiaryName,
          beneficiaryDocument: retention.rule.beneficiaryDocument,
          dueDate: calculateRetentionDueDate(input.date, retention.rule.dueDays)?.toISOString(),
        })),
      },
    });
    await refreshCommitmentExecutionStatus(tx, commitment.id);
    await postAccountingEventInTransaction(tx, actor, {
      financialYearId: year.id,
      date: settlement.date,
      eventCode: input.payableCarryForwardId ? "RAP_NAO_PROCESSADO_LIQUIDACAO" : "LIQUIDACAO_REGISTRADA",
      value,
      history: `Liquidação do empenho ${commitment.number}`,
      sourceModule: "FINANCEIRO",
      sourceType: "SETTLEMENT",
      sourceId: settlement.id,
      idempotencyKey: `FINANCEIRO:SETTLEMENT:${settlement.id}:LIQUIDACAO_REGISTRADA`,
    });
    await releasePayrollProvisionsAtSettlement(tx, actor, settlement.id);
    await recordSettlementMunicipalCosts(tx, actor, settlement.id);
    if (input.payableCarryForwardId) await insertPayableEvent(tx, { payableCarryForwardId: input.payableCarryForwardId, settlementId: settlement.id, action: "LIQUIDACAO_REGISTRADA", valueDecimal: value, actorUsuarioId: actor.usuarioId });
    await audit(tx, actor, "CREATE", "Settlement", settlement.id, { value: jsonMoney(value), retentionValue: jsonMoney(retentionTotal), commitmentId: commitment.id, documentId: document.id, authorId: input.authorId }, year.id);
    return settlement;
}

export async function cancelSettlement(db: DatabaseConnection, actor: FinanceActor, settlementId: string) {
  return withDatabaseTransaction(db, (tx) => cancelSettlementInTransaction(tx, actor, settlementId));
}

export async function cancelSettlementInTransaction(tx: DatabaseTransaction, actor: FinanceActor, settlementId: string): Promise<SettlementRecord> {
    await assertCurrentRefundPaymentMutationAllowed(tx, settlementId, "SETTLEMENT");
     const origin = await findFinanceSettlement(tx, settlementId);
     if (!origin) throw new FinanceError("Liquidação não encontrada.");
     await lockCommitment(tx, origin.commitmentId);
     const settlement = await readSettlementWithOrigin(tx, settlementId);
    if (!settlement) throw new FinanceError("Liquidação não encontrada.");
    await lockCommitment(tx, settlement.commitmentId);
    if (settlement.payableCarryForwardId) await lockPayableCarryForward(tx, settlement.payableCarryForwardId);
    assertActorBudgetUnit(actor, settlement.commitment.appropriation.budgetUnitId);
     const date = new Date();
     const year = await assertFinancialYearOpen(tx, settlement.executionFinancialYearId ?? settlement.commitment.appropriation.financialYearId, date);
     await assertAccountingPeriodOpen(tx, year.id, date);
    if (settlement.status !== ACTIVE_SETTLEMENT_STATUS) throw new FinanceError("Somente liquidações ativas podem ser canceladas.");
    if ((await activePaymentTotal(tx, { settlementId })).greaterThan(0)) throw new FinanceError("Não é possível cancelar uma liquidação com pagamentos ativos.");
    await cancelSettlementMunicipalCosts(tx, actor, settlementId);
    await reverseAccountingForSource(tx, actor, {
      financialYearId: year.id,
       date,
      sourceType: "SETTLEMENT",
      sourceId: settlement.id,
      eventType: "LIQUIDACAO_CANCELADA",
      history: `Cancelamento da liquidação ${settlement.id}`,
      idempotencyKey: `FINANCEIRO:SETTLEMENT:${settlement.id}:LIQUIDACAO_CANCELADA`,
    });
    await reversePayrollProvisionSettlement(tx, actor, settlement.id, date);
    const canceled = await setSettlementStatus(tx, settlementId, "Cancelado");
    if (settlement.payableCarryForwardId) await insertPayableEvent(tx, { payableCarryForwardId: settlement.payableCarryForwardId, settlementId: settlement.id, action: "LIQUIDACAO_CANCELADA", valueDecimal: settlement.valueDecimal, actorUsuarioId: actor.usuarioId });
    await refreshCommitmentExecutionStatus(tx, settlement.commitmentId);
    await audit(tx, actor, "CANCEL", "Settlement", settlementId, { previousStatus: settlement.status }, year.id);
     return canceled;
}

async function carryForwardAllocatedValue(tx: DatabaseTransaction, payableId: string, includeIssued = false) {
  const nativePayments = (await listPayableActivePayments(tx, payableId)).filter(payment => includeIssued || payment.status === "Paga");
  const legacyEvents = await listPayableEvents(tx, { payableCarryForwardId: payableId, action: "PAGAMENTO_RASTREADO", paidLegacyOnly: true });
  return [...nativePayments, ...legacyEvents].reduce((sum, row) => sum.plus(requiredDecimal(row.valueDecimal, "RAP.paymentValueDecimal")), new Decimal(0));
}

async function carryForwardForPosting(tx: DatabaseTransaction, actor: FinanceActor, payableId: string, commitmentId: string, date: Date, requiredType?: "NAO_PROCESSADO") {
  await lockCommitment(tx, commitmentId);
  await lockPayableCarryForward(tx, payableId);
  const commitment = await findFinanceCommitment(tx, commitmentId);
  if (!commitment) throw new FinanceError("Empenho não encontrado.");
  assertActorBudgetUnit(actor, commitment.appropriation.budgetUnitId);
  const registration = await readPayable(tx, payableId);
  const payable = { ...registration, financialYear: await readPayableYear(tx, registration.financialYearId), originFinancialYear: await readPayableYear(tx, registration.originFinancialYearId) };
  if (payable.commitmentId !== commitment.id || payable.originFinancialYearId !== commitment.appropriation.financialYearId || !["PROCESSADO", "NAO_PROCESSADO"].includes(payable.type) || requiredType && payable.type !== requiredType || !["PENDENTE", "PAGAMENTO_PARCIAL_RASTREADO"].includes(payable.status)) throw new FinanceError("Selecione um resto a pagar pendente do tipo e empenho informados.");
  if (payable.originFinancialYear.status !== "Encerrado" || date <= payable.originFinancialYear.endDate || !ACTIVE_COMMITMENT_STATUSES.includes(commitment.status)) throw new FinanceError("Pagamento de RAP exige origem encerrada, data posterior e empenho ativo.");
  const [binding] = await listAccountingUnitBindings(tx, commitment.appropriation.budgetUnitId);
  if (!binding) throw new FinanceError("Unidade gestora sem ente conciliado.");
  if (payable.financialYear.governmentEntityId !== binding.governmentEntityId || payable.originFinancialYear.governmentEntityId !== binding.governmentEntityId) throw new FinanceError("Inscrição e origem do RAP devem pertencer ao ente da UG.");
  const years = await listOpenExecutionYears(tx, binding.governmentEntityId, date);
  if (years.length !== 1) throw new FinanceError("Pagamento de RAP exige exercício corrente aberto e único do mesmo ente.");
  const year = await assertFinancialYearOpen(tx, years[0].id, date);
  if (year.year < payable.financialYear.year) throw new FinanceError("A execução não pode anteceder o exercício de inscrição do RAP.");
  await assertAccountingPeriodOpen(tx, year.id, date);
  return { commitment, year };
}

async function recordNativeCarryForwardPaymentEvent(tx: DatabaseTransaction, actor: FinanceActor, payment: { id: string; valueDecimal: Decimal | null; payableCarryForwardId: string | null }, action: "PAGAMENTO_RASTREADO" | "PAGAMENTO_ESTORNADO", justification?: string) {
  if (!payment.payableCarryForwardId) return;
  await lockPayableCarryForward(tx, payment.payableCarryForwardId);
  const payable = await readPayable(tx, payment.payableCarryForwardId);
  const paid = await carryForwardAllocatedValue(tx, payable.id);
  if (paid.gt(payable.valueDecimal)) throw new FinanceError("Pagamentos efetivados excedem a inscrição do RAP.");
  await insertPayableEvent(tx, { payableCarryForwardId: payable.id, paymentId: payment.id, action, valueDecimal: requiredDecimal(payment.valueDecimal, "Payment.valueDecimal"), actorUsuarioId: actor.usuarioId, justification });
  await setPayableStatus(tx, payable.id, paid.isZero() ? "PENDENTE" : paid.eq(payable.valueDecimal) ? "PAGO_RASTREADO" : "PAGAMENTO_PARCIAL_RASTREADO");
}

export async function createPayment(
  db: DatabaseConnection,
  actor: FinanceActor,
  input: {
    orderNumber: string;
    date: Date;
    value: Decimal | string | number;
    commitmentId: string;
    settlementId: string;
    bankAccountId: string;
    supplierId: string;
    paymentMethod: string;
    serviceCode?: string;
    retentionRuleIds?: string[];
    payableCarryForwardId?: string;
  },
) {
  return withDatabaseTransaction(db, (tx) => createPaymentInTransaction(tx, actor, input));
}

export async function createPaymentInTransaction(tx: DatabaseTransaction, actor: FinanceActor, input: Parameters<typeof createPayment>[2]): Promise<PaymentRecord> {
  const value = money(input.value);
  if (!input.settlementId) {
    throw new FinanceError("O fluxo obrigatório exige liquidação prévia regular antes de qualquer emissão de pagamento.");
  }

    const { commitment, year } = input.payableCarryForwardId
      ? await carryForwardForPosting(tx, actor, input.payableCarryForwardId, input.commitmentId, input.date)
      : await commitmentForPosting(tx, input.commitmentId, input.date);
    assertActorBudgetUnit(actor, commitment.appropriation.budgetUnitId);
    const bankAccount = await findFinanceBankAccount(tx, input.bankAccountId);
    if (!bankAccount?.isActive) throw new FinanceError("Selecione uma conta bancária ativa.");

    // Validação de compatibilidade de fonte de recursos (Fonte Obrigatória)
    const appropriation = await findBudgetAppropriation(tx, commitment.appropriationId);
    await lockBankAccount(tx, input.bankAccountId);
    await assertBankResourceSource(tx, input.bankAccountId, appropriation?.resourceSourceId);
    if (!bankAccount.budgetUnitId || bankAccount.budgetUnitId !== appropriation?.budgetUnitId) {
      throw new FinanceError("A conta bancária deve estar vinculada à mesma Unidade Gestora da dotação.");
    }

    if (commitment.supplierId !== input.supplierId) throw new FinanceError("O fornecedor do pagamento deve ser o mesmo do empenho.");
    const creditor = await creditorForSupplier(tx, input.supplierId);
    if (!commitment.creditorId || commitment.creditorId !== creditor.id) throw new FinanceError("O credor do pagamento deve ser o mesmo credor central do empenho.");

    const settlement = await readSettlementPaymentBasis(tx, input.settlementId);
    if (!settlement || settlement.status !== ACTIVE_SETTLEMENT_STATUS || settlement.commitmentId !== commitment.id) {
      throw new FinanceError("A liquidação selecionada não pertence ao empenho ou não está ativa.");
    }
    if (input.date < settlement.date) throw new FinanceError("O pagamento não pode anteceder a liquidação.");
    if (input.payableCarryForwardId) {
      const registration = await readPayable(tx, input.payableCarryForwardId);
      const payable = { ...registration, originFinancialYear: await readPayableYear(tx, registration.originFinancialYearId), events: await listPayableEvents(tx, { payableCarryForwardId: registration.id, action: "TRANSPORTE_ANUAL_RECEBIDO" }) };
      const inherited = await getInheritedCarryForwardSettlement(tx, payable.id, settlement.id);
      if (payable.type === "PROCESSADO" && (settlement.date > payable.originFinancialYear.endDate || settlement.payableCarryForwardId)) throw new FinanceError("RAP processado exige liquidação no exercício de origem.");
      if (payable.type === "NAO_PROCESSADO" && !inherited && (settlement.payableCarryForwardId !== payable.id || settlement.executionFinancialYearId !== year.id || settlement.date <= payable.originFinancialYear.endDate)) throw new FinanceError("RAP não processado exige liquidação nativa da mesma inscrição no exercício corrente ou transporte documental da liquidação anterior.");
      if (payable.type === "PROCESSADO" && payable.events.length && !inherited) throw new FinanceError("RAP processado transportado exige vínculo documental da parcela liquidada herdada.");
      if (inherited) {
        const linkedAllocated = await activePaymentTotal(tx, { settlementId: settlement.id, payableCarryForwardId: payable.id });
        if (linkedAllocated.plus(value).gt(inherited.valueDecimal)) throw new FinanceError("A ordem excede a parcela liquidada herdada no transporte.");
      }
      if ((await carryForwardAllocatedValue(tx, payable.id, true)).plus(value).gt(payable.valueDecimal)) throw new FinanceError("A ordem de pagamento excede o saldo inscrito do resto a pagar.");
    }
    const paid = await activePaymentTotal(tx, { settlementId: settlement.id });
    if (paid.plus(value).greaterThan(requiredDecimal(settlement.valueDecimal, "Settlement.valueDecimal"))) {
      throw new FinanceError("O pagamento acumulado excede o saldo disponível da liquidação.");
    }

    const requestedRuleIds = [...new Set(input.retentionRuleIds ?? [])].sort();
    const settlementRuleIds = settlement.retentions.map((retention) => retention.retentionRuleId).sort();
    if (requestedRuleIds.length && requestedRuleIds.join(",") !== settlementRuleIds.join(",")) {
      throw new FinanceError("As regras de retenção devem ser definidas na liquidação e corresponder à liquidação selecionada.");
    }
    const paidAfterThisPayment = paid.plus(value);
    const retentions = settlement.retentions.flatMap((retention) => {
      const previousAllocated = retention.paymentRetentions.reduce(
        (total, allocation) => total.plus(allocation.valueDecimal),
        new Decimal(0),
      );
      const cumulativeAllocation = retention.valueDecimal
        .mul(paidAfterThisPayment)
        .div(requiredDecimal(settlement.valueDecimal, "Settlement.valueDecimal"))
        .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      const allocatedValue = cumulativeAllocation.minus(previousAllocated);
      if (allocatedValue.lessThanOrEqualTo(0)) return [];
      return [{ retention, allocatedValue }];
    });
    const retentionTotal = retentions.reduce((total, retention) => total.plus(retention.allocatedValue), new Decimal(0));
    if (retentionTotal.greaterThan(value)) throw new FinanceError("As retenções vinculadas à liquidação não podem exceder o valor bruto do pagamento.");
    const netValue = value.minus(retentionTotal);

    // Validação de saldo financeiro na conta bancária para o valor LÍQUIDO que efetivamente sairá
    const currentBankBalance = await getBankAccountBalance(tx, input.bankAccountId, input.date);
    const sourceBalance = await getBankResourceSourceSpendableBalance(tx, input.bankAccountId, appropriation!.resourceSourceId!, input.date);
    if (sourceBalance.lt(netValue)) throw new FinanceError("Saldo por fonte insuficiente para emitir a ordem de pagamento.");
    if (currentBankBalance.lessThan(netValue)) {
      throw new FinanceError(`Saldo financeiro insuficiente na conta bancária. Saldo disponível: R$ ${currentBankBalance.toFixed(2)}.`);
    }

    const payment = await insertFinancePayment(tx, {
        orderNumber: input.orderNumber.trim(),
        date: input.date,
        valueDecimal: value,
        value: legacyMoney(value),
        netValueDecimal: netValue,
        commitmentId: commitment.id,
        settlementId: input.settlementId,
        executionFinancialYearId: input.payableCarryForwardId ? year.id : undefined,
        payableCarryForwardId: input.payableCarryForwardId,
        bankAccountId: input.bankAccountId,
        supplierId: input.supplierId,
        creditorId: creditor.id,
        isExceptional: false,
        paymentMethod: input.paymentMethod,
        status: "Emitida",
        paymentOrderExternalId: input.orderNumber.trim().startsWith("OP-") ? input.orderNumber.trim() : `OP-${input.orderNumber.trim()}`,
        integrationEventId: `EVT-PAY-${input.orderNumber.trim()}`,
        bankAccountExternalId: bankAccount.externalId,
        bankStatus: bankAccount.externalId ? "PENDING_SUBMISSION" : null,
    });
    await createFinancialDocument(tx, actor, {
      documentType: "ORDEM_DE_PAGAMENTO",
      number: `OP-${payment.orderNumber}`,
      title: `Ordem de Pagamento ${payment.orderNumber}`,
      paymentId: payment.id,
      snapshot: {
        payment: {
          id: payment.id,
          orderNumber: payment.orderNumber,
          date: payment.date.toISOString(),
          grossValue: jsonMoney(value),
          netValue: jsonMoney(netValue),
          paymentMethod: payment.paymentMethod,
          commitmentId: payment.commitmentId,
          settlementId: payment.settlementId,
          bankAccountId: payment.bankAccountId,
          resourceSourceId: commitment.appropriation.resourceSourceId,
          supplierId: payment.supplierId,
          creditorId: payment.creditorId,
          payableCarryForwardId: payment.payableCarryForwardId,
          executionFinancialYearId: payment.executionFinancialYearId,
        },
        commitment: { id: commitment.id, number: commitment.number },
        settlement: { id: settlement.id },
        retentions: retentions.map(({ retention, allocatedValue }) => ({
          settlementRetentionId: retention.id,
          type: retention.type,
          value: jsonMoney(allocatedValue),
        })),
      },
    });
    for (const { retention, allocatedValue } of retentions) {
      await insertPaymentRetention(tx, {
          paymentId: payment.id,
          settlementRetentionId: retention.id,
          retentionRuleId: retention.retentionRuleId,
          type: retention.type,
          description: retention.description,
          valueDecimal: allocatedValue,
          beneficiaryName: retention.beneficiaryName,
          beneficiaryDocument: retention.beneficiaryDocument ?? undefined,
        }, retention.dueDate ?? undefined);
    }
    await refreshCommitmentExecutionStatus(tx, commitment.id);
    await audit(tx, actor, "CREATE", "Payment", payment.id, { grossValue: jsonMoney(value), netValue: jsonMoney(netValue), retentionValue: jsonMoney(retentionTotal), commitmentId: commitment.id, settlementId: input.settlementId, creditorId: creditor.id }, year.id);
    return payment;
}

export async function reversePayment(
  db: DatabaseConnection,
  actor: FinanceActor,
  paymentId: string,
  justification: string,
) {
  return withDatabaseTransaction(db, tx => reversePaymentInTransaction(tx, actor, paymentId, justification));
}

export async function reversePaymentInTransaction(tx: DatabaseTransaction, actor: FinanceActor, paymentId: string, justification: string) {
  if (!justification.trim()) throw new FinanceError("A justificativa de estorno do pagamento é obrigatória.");
    await assertCurrentRefundPaymentMutationAllowed(tx, paymentId, "PAYMENT");
    await lockPayment(tx, paymentId);
    await lockPaymentWithholdings(tx, paymentId);
    const payment = await readPaymentExecution(tx, paymentId);
    if (!payment) throw new FinanceError("Pagamento não encontrado.");
    await lockCommitment(tx, payment.commitmentId);
    assertActorBudgetUnit(actor, payment.commitment.appropriation.budgetUnitId);
    const reversalDate = new Date();
    const year = await assertFinancialYearOpen(tx, payment.executionFinancialYearId ?? payment.commitment.appropriation.financialYearId, reversalDate);
    if (payment.status !== "Paga") throw new FinanceError("Somente pagamentos efetivados (Paga) podem ser estornados.");

    // Verifica se alguma retenção associada já foi recolhida
    const recolhida = payment.retentions.some((r) => r.withholdingPayable?.status === "Recolhida");
    if (recolhida) {
      throw new FinanceError("Não é possível estornar um pagamento com retenções tributárias já recolhidas.");
    }

    // O valor que saiu da conta bancária na confirmação foi o valor LÍQUIDO
    const netValue = requiredDecimal(payment.netValueDecimal ?? payment.valueDecimal, "Payment.netValueDecimal");
    if (!payment.payableCarryForwardId) await recordPlanningFinanceExecution(tx, actor, { appropriationId: payment.commitment.appropriation.id, operation: "REVERSE_PAYMENT", date: reversalDate, value: requiredDecimal(payment.valueDecimal, "Payment.valueDecimal"), key: `finance:paymentReversal:${payment.id}`, originPrefix: `finance:payment:${payment.id}:` });
    const updated = await updateFinancePayment(tx, paymentId, { status: "Estornada" });

    // Registra entrada do valor LÍQUIDO de volta na tesouraria
    await insertTreasuryMovement(tx, {
        date: reversalDate,
        type: "PaymentReversal",
        resourceSourceId: payment.commitment.appropriation.resourceSourceId,
        direction: "Entrada",
        valueDecimal: netValue,
        history: `Estorno da ordem de pagamento ${payment.orderNumber}: ${justification.trim()}`,
        bankAccountId: payment.bankAccountId,
        financialYearId: year.id,
        sourceModule: "FINANCEIRO",
        sourceType: "PAYMENT",
        sourceId: payment.id,
        eventType: "PAYMENT_REVERSED",
        idempotencyKey: `FINANCEIRO:PAYMENT:${payment.id}:REVERSAL`,
    });

    await setPaymentWithholdingStatus(tx, paymentId, "Cancelada");

    await refreshCommitmentExecutionStatus(tx, payment.commitmentId);
    await reverseAccountingForSource(tx, actor, {
      financialYearId: year.id,
      date: reversalDate,
      eventType: "PAGAMENTO_ESTORNADO",
      history: `Estorno da ordem de pagamento ${payment.orderNumber}: ${justification.trim()}`,
      sourceType: "PAYMENT",
      sourceId: payment.id,
      idempotencyKey: `FINANCEIRO:PAYMENT:${payment.id}:PAGAMENTO_ESTORNADO`,
    });
    await reversePayrollProvisionPayment(tx, actor, paymentId, justification.trim());
    await reverseAdvancePaymentControl(tx, actor, paymentId, justification.trim());
    if (payment.payableCarryForwardId) await recordNativeCarryForwardPaymentEvent(tx, actor, payment, "PAGAMENTO_ESTORNADO", justification.trim());
    await audit(tx, actor, "REVERSE", "Payment", paymentId, { previousStatus: payment.status, status: "Estornada", justification: justification.trim() }, year.id);
    return updated;
}

export async function settleWithholdingPayable(
  db: DatabaseConnection,
  actor: FinanceActor,
  input: {
    withholdingPayableId: string;
    bankAccountId: string;
    paymentDate: Date;
    receiptDocumentId: string;
    idempotencyKey?: string;
  },
) {
  return withDatabaseTransaction(db, async (tx) => {
    await lockWithholdingPayable(tx, input.withholdingPayableId);
    const payable = await readWithholdingExecution(tx, input.withholdingPayableId);
    if (!payable || payable.status !== "Pendente") {
      throw new FinanceError("Consignação/retenção não encontrada ou já recolhida.");
    }
    // Impede recolher retenção se o pagamento de origem não estiver no status 'Paga'
    if (payable.retention?.payment?.status !== "Paga") {
      throw new FinanceError("A retenção/consignação só pode ser recolhida após a efetivação (status Paga) do pagamento correspondente.");
    }
    if (!input.receiptDocumentId?.trim()) {
      throw new FinanceError("Vincule o comprovante de recolhimento já cadastrado no GED.");
    }
    const receipt = await findSettlementDocument(tx, input.receiptDocumentId.trim());
    const receiptDocument = receipt ? { id: receipt.id, title: receipt.title, documentType: receipt.documentType, status: receipt.status } : null;
    if (!receiptDocument || receiptDocument.status !== "Válido") {
      throw new FinanceError("O comprovante de recolhimento GED informado não está válido.");
    }

    await lockBankAccount(tx, input.bankAccountId);
    const bankAccount = await findFinanceBankAccount(tx, input.bankAccountId);
    if (!bankAccount?.isActive) throw new FinanceError("Conta bancária para recolhimento inativa.");

    // Validação de compatibilidade de Fonte de Recursos e Unidade Gestora para recolhimento da retenção
    const origSourceId = payable.retention.payment.commitment.appropriation.resourceSourceId;
    const origBudgetUnitId = payable.retention.payment.commitment.appropriation.budgetUnitId;
    await assertBankResourceSource(tx, input.bankAccountId, origSourceId);
    assertActorBudgetUnit(actor, origBudgetUnitId);
    if (!bankAccount.budgetUnitId || bankAccount.budgetUnitId !== origBudgetUnitId) {
      throw new FinanceError("A conta bancária selecionada pertence a outra Unidade Gestora e não pode debitar o recolhimento desta retenção.");
    }

    const value = requiredDecimal(payable.valueDecimal, "WithholdingPayable.valueDecimal");
    const currentBalance = await getBankAccountBalance(tx, input.bankAccountId, input.paymentDate);
    if ((await getBankResourceSourceSpendableBalance(tx, input.bankAccountId, origSourceId!, input.paymentDate)).lt(value)) throw new FinanceError("Saldo por fonte insuficiente para recolhimento da retenção.");
    if (currentBalance.lessThan(value)) {
      throw new FinanceError("Saldo financeiro insuficiente para recolhimento da retenção.");
    }

    const year = await financialYearForPosting(tx, input.paymentDate, origBudgetUnitId);
    const updated = await markWithholdingPaid(tx, input.withholdingPayableId, receiptDocument.id);

    await insertTreasuryMovement(tx, {
        date: input.paymentDate,
        type: "WithholdingPayout",
        resourceSourceId: origSourceId,
        direction: "Saída",
        valueDecimal: value,
        history: `Recolhimento de retenção/consignação ${payable.retention.type}: ${payable.retention.description ?? ""}`,
        bankAccountId: input.bankAccountId,
        financialYearId: year.id,
        sourceModule: "FINANCEIRO",
        sourceType: "WITHHOLDING_PAYABLE",
        sourceId: payable.id,
        eventType: "WITHHOLDING_PAID",
        idempotencyKey: input.idempotencyKey ?? `FINANCEIRO:WITHHOLDING:${payable.id}:PAID`,
    });

    await createFinancialDocument(tx, actor, {
      documentType: "COMPROVANTE_RECOLHIMENTO_RETENCAO",
      number: `CRR-${payable.id}`,
      title: `Registro interno de recolhimento de retenção ${payable.retention.type}`,
      withholdingPayableId: payable.id,
      snapshot: {
        withholdingPayable: { id: payable.id, status: "Recolhida", value: jsonMoney(value), dueDate: payable.dueDate?.toISOString(), paymentDate: input.paymentDate.toISOString() },
        retention: {
          id: payable.retention.id,
          settlementRetentionId: payable.retention.settlementRetentionId,
          retentionRuleId: payable.retention.retentionRuleId,
          type: payable.retention.type,
          description: payable.retention.description,
          value: jsonMoney(payable.retention.valueDecimal),
          beneficiaryName: payable.retention.beneficiaryName,
          beneficiaryDocument: payable.retention.beneficiaryDocument,
        },
        sourcePayment: { id: payable.retention.payment.id, orderNumber: payable.retention.payment.orderNumber, date: payable.retention.payment.date.toISOString(), commitmentId: payable.retention.payment.commitmentId, settlementId: payable.retention.payment.settlementId },
        sourceSettlement: payable.retention.settlementRetention?.settlement
          ? { ...payable.retention.settlementRetention.settlement, fiscalDocumentIssueDate: payable.retention.settlementRetention.settlement.fiscalDocumentIssueDate?.toISOString() }
          : null,
        receiptDocument,
      },
    });

    await postAccountingEventInTransaction(tx, actor, {
      financialYearId: year.id,
      date: input.paymentDate,
      eventCode: "RETENCAO_RECOLHIDA",
      value,
      history: `Recolhimento de retenção/consignação ${payable.retention.type}`,
      sourceModule: "FINANCEIRO",
      sourceType: "WITHHOLDING_PAYABLE",
      sourceId: payable.id,
      idempotencyKey: `FINANCEIRO:WITHHOLDING:${payable.id}:RETENCAO_RECOLHIDA`,
    });
    await audit(tx, actor, "SETTLE", "WithholdingPayable", payable.id, { value: jsonMoney(value), bankAccountId: input.bankAccountId, receiptDocumentId: receiptDocument.id }, year.id);
    return updated;
  });
}

export async function updatePaymentStatus(db: DatabaseConnection, actor: FinanceActor, paymentId: string, status: string) {
  return withDatabaseTransaction(db, (tx) => updatePaymentStatusInTransaction(tx, actor, paymentId, status));
}

export async function updatePaymentStatusInTransaction(tx: DatabaseTransaction, actor: FinanceActor, paymentId: string, status: string) {
    await lockPayment(tx, paymentId);
    const payment = await readPaymentExecution(tx, paymentId);
    if (!payment) throw new FinanceError("Pagamento não encontrado.");

    assertActorBudgetUnit(actor, payment.commitment.appropriation.budgetUnitId);

    // Tratamento de dupla confirmação concorrente (idempotência perfeita para cliques múltiplos)
    if (status === "Paga" && payment.status === "Paga") {
      return payment;
    }

    await lockCommitment(tx, payment.commitmentId);
    const year = await assertFinancialYearOpen(tx, payment.executionFinancialYearId ?? payment.commitment.appropriation.financialYearId, payment.date);
    if (status === "Paga" && payment.payableCarryForwardId) await carryForwardForPosting(tx, actor, payment.payableCarryForwardId, payment.commitmentId, payment.date);
    if (status === "Paga" && payment.status !== "Emitida") throw new FinanceError("Somente ordens emitidas podem ser marcadas como pagas.");
    if (status === "Cancelada" && payment.status !== "Emitida") throw new FinanceError("Somente ordens emitidas podem ser canceladas. Pagamentos efetivados exigem estorno.");
    if (status === "Cancelada") {
      await lockPaymentWithholdings(tx, paymentId);
      const recolhida = payment.retentions.some((r) => r.withholdingPayable?.status === "Recolhida");
      if (recolhida) throw new FinanceError("Não é possível cancelar um pagamento com retenções tributárias já recolhidas.");
    }
    if (!["Paga", "Cancelada"].includes(status)) throw new FinanceError("Transição de pagamento inválida.");

    if (status === "Paga") {
      if (!payment.payableCarryForwardId) await recordPlanningFinanceExecution(tx, actor, { appropriationId: payment.commitment.appropriation.id, operation: "PAY", date: payment.date, value: requiredDecimal(payment.valueDecimal, "Payment.valueDecimal"), key: `finance:payment:${payment.id}:confirmed` });
      const bankAccount = await findFinanceBankAccount(tx, payment.bankAccountId);
      if (!bankAccount?.isActive) throw new FinanceError("A conta bancária do pagamento está inativa.");
      if (
        !bankAccount.budgetUnitId ||
        bankAccount.budgetUnitId !== payment.commitment.appropriation.budgetUnitId ||
        !payment.commitment.appropriation.resourceSourceId
      ) {
        throw new FinanceError("A conta bancária do pagamento não é compatível com a Unidade Gestora ou fonte da dotação.");
      }

      // Bloqueia a conta bancária para evitar race condition entre pagamentos simultâneos
      await lockBankAccount(tx, payment.bankAccountId);
      await assertBankResourceSource(tx, payment.bankAccountId, payment.commitment.appropriation.resourceSourceId);

      // O valor que efetivamente sai da conta bancária para o fornecedor é o LÍQUIDO
      const netValue = requiredDecimal(payment.netValueDecimal ?? payment.valueDecimal, "Payment.netValueDecimal");

      // Validação de saldo bancário no momento da efetivação "Paga"
      const currentBalance = await getBankAccountBalance(tx, payment.bankAccountId, payment.date);
      if ((await getBankResourceSourceSpendableBalance(tx, payment.bankAccountId, payment.commitment.appropriation.resourceSourceId!, payment.date)).lt(netValue)) throw new FinanceError("Saldo por fonte insuficiente para efetivar a ordem de pagamento.");
      if (currentBalance.lessThan(netValue)) {
        throw new FinanceError(`Saldo bancário insuficiente para efetivar a ordem de pagamento. Saldo disponível: R$ ${currentBalance.toFixed(2)}.`);
      }

      await insertTreasuryMovement(tx, {
          date: payment.date,
          type: "Payment",
          resourceSourceId: payment.commitment.appropriation.resourceSourceId,
          direction: "Saída",
          valueDecimal: netValue,
          history: `Ordem de pagamento ${payment.orderNumber}`,
          bankAccountId: payment.bankAccountId,
          financialYearId: year.id,
          sourceModule: "FINANCEIRO",
          sourceType: "PAYMENT",
          sourceId: payment.id,
          eventType: "PAYMENT_CONFIRMED",
          idempotencyKey: `FINANCEIRO:PAYMENT:${payment.id}:TREASURY`,
      });
    }

    const updated = await updateFinancePayment(tx, paymentId, { status });
    if (status === "Cancelada") await setPaymentWithholdingStatus(tx, paymentId, "Cancelada");
    await refreshCommitmentExecutionStatus(tx, payment.commitmentId);
    if (status === "Paga") {
      await postAccountingEventInTransaction(tx, actor, {
        financialYearId: year.id,
        date: payment.date,
        eventCode: payment.payableCarryForwardId ? (await readPayable(tx, payment.payableCarryForwardId)).type === "NAO_PROCESSADO" ? "RAP_NAO_PROCESSADO_PAGAMENTO" : "RAP_PROCESSADO_PAGAMENTO" : "PAGAMENTO_EFETIVADO",
        value: requiredDecimal(payment.valueDecimal, "Payment.valueDecimal"),
        history: `Pagamento efetivado da ordem ${payment.orderNumber}`,
        sourceModule: "FINANCEIRO",
        sourceType: "PAYMENT",
        sourceId: payment.id,
        idempotencyKey: `FINANCEIRO:PAYMENT:${payment.id}:PAGAMENTO_EFETIVADO`,
      });
      await recordPayrollProvisionPayment(tx, actor, payment.id);
      if (payment.payableCarryForwardId) await recordNativeCarryForwardPaymentEvent(tx, actor, payment, "PAGAMENTO_RASTREADO");
    }
    await audit(tx, actor, "STATUS_CHANGE", "Payment", paymentId, { previousStatus: payment.status, status }, year.id);
    return updated;
}

export async function setFinancialYearStatus(db: DatabaseConnection, actor: FinanceActor, financialYearId: string, status: string) {
  const statuses = ["Preparação", "Aberto", "Em Encerramento", "Encerrado"];
  if (!statuses.includes(status)) throw new FinanceError("Status de exercício inválido.");
  if (status === "Encerrado") throw new FinanceError("O exercício só pode ser encerrado pela operação de fechamento anual final.");
  return withDatabaseTransaction(db, async (tx) => {
    const current = await lockAccountingYearPeriods(tx, actor, financialYearId);
    if (current.status === "Encerrado") throw new FinanceError("Um exercício encerrado não pode ter seu status alterado.");
    await updateAccountingYearStatus(tx, financialYearId, status);
    const updated = await findFinancialScopeYear(tx, financialYearId);
    if (!updated) throw new FinanceError("Exercício financeiro não encontrado.");
    await insertAccountingAudit(tx, actor, { action: "STATUS_CHANGE", entityType: "FinancialYear", entityId: financialYearId, payload: { previousStatus: current.status, status }, financialYearId });
    return updated;
  }, { timeoutMs: 60000 });
}

async function financialYearForPosting(tx: DatabaseTransaction, date: Date, budgetUnitId?: string | null) {
  const unit = budgetUnitId ? (await listAccountingUnitBindings(tx, budgetUnitId))[0] : null;
  if (budgetUnitId && !unit) throw new FinanceError("A unidade gestora não está vinculada a uma entidade para identificar o exercício financeiro.");
  const year = await findPostingYear(tx, unit?.governmentEntityId ?? null, date.getUTCFullYear());
  if (!year) throw new FinanceError("Não há exercício financeiro configurado para a data do lançamento.");
  const openYear = await assertFinancialYearOpen(tx, year.id, date);
  await assertAccountingPeriodOpen(tx, openYear.id, date);
  return openYear;
}

function signedValue(direction: string, value: Decimal) {
  if (["Entrada", "ENTRADA", "CREDIT"].includes(direction)) return value;
  if (["Saída", "SAIDA", "DEBIT"].includes(direction)) return value.negated();
  throw new FinanceError("Direção de tesouraria inválida.");
}

export async function getBankAccountBalance(tx: DatabaseExecutor, bankAccountId: string, throughDate?: Date) {
  const movements = await listConfirmedTreasuryMovements(tx, { bankAccountId, through: throughDate });
  return movements.reduce((total, movement) => total.plus(signedValue(movement.direction, movement.valueDecimal)), new Decimal(0));
}

export async function getBankAccountBalances(tx: DatabaseExecutor, bankAccountIds?: string[]) {
  const movements = await listConfirmedTreasuryMovements(tx, { bankAccountIds });
  return movements.reduce<Record<string, Decimal>>((balances, movement) => {
    balances[movement.bankAccountId] = (balances[movement.bankAccountId] ?? new Decimal(0)).plus(signedValue(movement.direction, movement.valueDecimal));
    return balances;
  }, {});
}

export async function getBankAccountLedgerBalance(tx: DatabaseExecutor, bankAccountId: string, throughDate?: Date) {
  const account = await findFinanceBankAccount(tx, bankAccountId);
  if (!account?.accountingPlanId) {
    throw new FinanceError("A conta bancária deve possuir uma conta analítica vinculada para calcular o razão bancário.");
  }
  if (!account.budgetUnitId) throw new FinanceError("Conta bancária sem unidade gestora para isolamento do razão.");
  if (await hasDuplicateBankLedger(tx, bankAccountId, account.accountingPlanId, account.budgetUnitId)) throw new FinanceError("Mais de uma conta bancária utiliza o mesmo razão na UG; configure subcontas analíticas individuais.");
  if ((await listBankLedgerEntries(tx, account.accountingPlanId, null, throughDate)).length) throw new FinanceError("O razão possui partidas legadas sem UG; concilie a origem antes de calcular saldo por conta.");
  const entries = await listBankLedgerEntries(tx, account.accountingPlanId, account.budgetUnitId, throughDate);
  return entries.reduce((total, entry) => {
    const value = entry.valueDecimal ?? new Decimal(entry.value);
    if (entry.type === "Débito") return total.plus(value);
    if (entry.type === "Crédito") return total.minus(value);
    throw new FinanceError(`Natureza contábil inválida no razão bancário: ${entry.type}.`);
  }, new Decimal(0));
}

export async function createBankAccountWithOpeningBalance(
  db: DatabaseConnection,
  actor: FinanceActor,
  input: { bankName: string; agency: string; bankId?: string | null; bankBranchId?: string | null; accountNumber: string; accountType: string; openingBalance?: Decimal | string | number; resourceSourceId: string; budgetUnitId: string; accountingPlanId: string; isActive: boolean; openingDate?: Date },
) {
  const openingBalance = input.openingBalance === undefined ? new Decimal(0) : new Decimal(String(input.openingBalance)).toDecimalPlaces(2);
  if (!openingBalance.isFinite() || openingBalance.lessThan(0)) throw new FinanceError("O saldo de abertura não pode ser negativo.");
  if (!input.resourceSourceId.trim() || !input.budgetUnitId.trim() || !input.accountingPlanId.trim()) throw new FinanceError("Conta bancária exige fonte de recursos, Unidade Gestora e conta analítica.");
  const openingDate = input.openingDate ?? new Date();
  return withDatabaseTransaction(db, async (tx) => {
    const bankId = input.bankId?.trim() || null;
    const bankBranchId = input.bankBranchId?.trim() || null;
    const [accountingPlan, bank, branch] = await Promise.all([
      findBankAccountingPlan(tx, { id: input.accountingPlanId.trim() }),
      bankId ? findActiveFinanceBank(tx, bankId) : null,
      bankBranchId ? findActiveFinanceBankBranch(tx, bankBranchId) : null,
    ]);
    if (!accountingPlan) throw new FinanceError("A conta analítica vinculada não foi encontrada.");
    if (bankId && !bank) throw new FinanceError("O banco selecionado não foi encontrado ou está inativo.");
    if (bankBranchId && (!branch || branch.bankId !== bankId)) throw new FinanceError("A agência não pertence ao banco selecionado ou está inativa.");
    const bankName = bank?.name || input.bankName.trim();
    const agency = branch?.code || input.agency.trim();
    if (!bankName || !agency) throw new FinanceError("Informe banco e agência da conta.");
    const account = await insertFinanceBankAccount(tx, {
        bankName,
        agency,
        bankId,
        bankBranchId,
        accountNumber: input.accountNumber.trim(),
        accountType: input.accountType.trim(),
        currentBalance: 0,
        currentBalanceDecimal: new Decimal(0),
        resourceSourceId: input.resourceSourceId.trim(),
        budgetUnitId: input.budgetUnitId.trim(),
        accountingPlanId: accountingPlan.id,
        isActive: input.isActive,
    });
    if (openingBalance.greaterThan(0)) {
      const year = await financialYearForPosting(tx, openingDate, input.budgetUnitId);
      const movement = await insertTreasuryMovement(tx, {
          date: openingDate,
          type: "OpeningBalance",
          resourceSourceId: input.resourceSourceId.trim(),
          direction: "Entrada",
          valueDecimal: openingBalance,
          history: "Saldo de abertura auditado na inclusão da conta.",
          bankAccountId: account.id,
          financialYearId: year.id,
          sourceModule: "FINANCEIRO",
          sourceType: "BANK_ACCOUNT",
          sourceId: account.id,
          eventType: "OPENING_BALANCE",
          idempotencyKey: `FINANCEIRO:BANK_ACCOUNT:${account.id}:OPENING_BALANCE`,
      });
      const openingEquity = await findBankAccountingPlan(tx, { code: "2.3.7.1.1.00.00" });
      if (!openingEquity) throw new FinanceError("Cadastre a conta de contrapartida do saldo de abertura antes de incluir a conta bancária.");
      await postAccountingTransactionInTransaction(tx, actor, {
        financialYearId: year.id,
        date: openingDate,
        history: "Saldo de abertura da conta bancária.",
        lines: [
          { accountId: accountingPlan.id, type: "Débito", value: openingBalance },
          { accountId: openingEquity.id, type: "Crédito", value: openingBalance },
        ],
        sourceModule: "FINANCEIRO",
        sourceType: "BANK_ACCOUNT_OPENING_BALANCE",
        sourceId: account.id,
        eventType: "OPENING_BALANCE",
        idempotencyKey: `FINANCEIRO:BANK_ACCOUNT:${account.id}:OPENING_BALANCE:ACCOUNTING`,
      });
      await audit(tx, actor, "CREATE", "TreasuryMovement", movement.id, { type: movement.type, value: jsonMoney(openingBalance), bankAccountId: account.id }, year.id);
    }
    await audit(tx, actor, "CREATE", "BankAccount", account.id, { openingBalance: jsonMoney(openingBalance) });
    return account;
  });
}

export async function updateBankAccountDetails(
  db: DatabaseConnection,
  actor: FinanceActor,
  id: string,
  input: { bankName?: string; agency?: string; bankId?: string | null; bankBranchId?: string | null; accountNumber?: string; accountType?: string; resourceSourceId?: string; budgetUnitId?: string; accountingPlanId?: string; isActive?: boolean },
) {
  return withDatabaseTransaction(db, async (tx) => {
    await lockBankAssignment(tx, id, input.budgetUnitId?.trim());
    if (input.resourceSourceId !== undefined) {
      const currentSource = await findFinanceBankAccount(tx, id);
      if (currentSource && currentSource.resourceSourceId !== (input.resourceSourceId.trim() || null) && await hasBankMovements(tx, id)) throw new FinanceError("A fonte da conta bancária não pode ser alterada após movimentações; preserve a origem dos saldos em uma nova conta.");
    }
    if (input.budgetUnitId !== undefined) {
      const currentUnit = await findFinanceBankAccount(tx, id);
      if (currentUnit && currentUnit.budgetUnitId !== (input.budgetUnitId.trim() || null) && await hasBankMovements(tx, id)) throw new FinanceError("A Unidade Gestora da conta bancária não pode ser alterada após movimentações; preserve o histórico em uma nova conta.");
    }
    if (input.accountingPlanId) {
      const [current, next] = await Promise.all([
        findFinanceBankAccount(tx, id),
        findBankAccountingPlan(tx, { id: input.accountingPlanId.trim() }),
      ]);
      if (!current || !next) throw new FinanceError("A conta bancária ou a conta analítica não foi encontrada.");
      if (current.accountingPlanId && current.accountingPlanId !== next.id) {
        if (await hasBankAccountPostings(tx, current.accountingPlanId)) throw new FinanceError("A conta analítica não pode ser alterada após receber lançamentos contábeis.");
      }
    }
    const bankId = input.bankId === undefined ? undefined : input.bankId?.trim() || null;
    const bankBranchId = input.bankBranchId === undefined ? undefined : input.bankBranchId?.trim() || null;
    const current = bankId === undefined || bankBranchId === undefined
      ? await findFinanceBankAccount(tx, id)
      : null;
    const resolvedBankId = bankId === undefined ? current?.bankId || null : bankId;
    const resolvedBranchId = bankBranchId === undefined ? current?.bankBranchId || null : bankBranchId;
    const [bank, branch] = await Promise.all([
      resolvedBankId ? findActiveFinanceBank(tx, resolvedBankId) : null,
      resolvedBranchId ? findActiveFinanceBankBranch(tx, resolvedBranchId) : null,
    ]);
    if (resolvedBankId && !bank) throw new FinanceError("O banco selecionado não foi encontrado ou está inativo.");
    if (resolvedBranchId && (!branch || branch.bankId !== resolvedBankId)) throw new FinanceError("A agência não pertence ao banco selecionado ou está inativa.");
    const account = await updateFinanceBankAccount(tx, id, {
        bankName: bank?.name || input.bankName?.trim(),
        agency: branch?.code || input.agency?.trim(),
        bankId,
        bankBranchId,
        accountNumber: input.accountNumber?.trim(),
        accountType: input.accountType?.trim(),
        resourceSourceId: input.resourceSourceId?.trim() || undefined,
        budgetUnitId: input.budgetUnitId?.trim() || undefined,
        accountingPlanId: input.accountingPlanId?.trim() || undefined,
        isActive: input.isActive,
    });
    await audit(tx, actor, "UPDATE", "BankAccount", account.id, { detailsOnly: true });
    return account;
  });
}

type TreasuryTransferInput = {
  date: Date;
  value: Decimal | string | number;
  sourceBankAccountId: string;
  destinationBankAccountId: string;
  resourceSourceId?: string;
  history?: string;
  idempotencyKey?: string;
  sourceModule?: string;
  sourceType?: string;
  sourceId?: string;
  eventType?: string;
};

export async function createTreasuryTransferInTransaction(
  tx: DatabaseTransaction,
  actor: FinanceActor,
  input: TreasuryTransferInput,
) {
  const value = money(input.value);
  if (input.sourceBankAccountId === input.destinationBankAccountId) throw new FinanceError("A transferência exige contas de origem e destino diferentes.");
  const key = input.idempotencyKey?.trim();
  if (key) await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`TREASURY_TRANSFER:${key}`}, 0))::text`);
  const [source, destination] = await Promise.all([
    findFinanceBankAccount(tx, input.sourceBankAccountId),
    findFinanceBankAccount(tx, input.destinationBankAccountId),
  ]);
  if (!source?.isActive || !destination?.isActive) throw new FinanceError("As contas da transferência devem estar ativas.");
  if (!source.budgetUnitId || !destination.budgetUnitId) throw new FinanceError("As contas da transferência devem estar vinculadas a unidades gestoras.");
  assertActorBudgetUnit(actor, source.budgetUnitId);
  assertActorBudgetUnit(actor, destination.budgetUnitId);
  if (!source.accountingPlanId || !destination.accountingPlanId) throw new FinanceError("As contas da transferência exigem conta contábil analítica configurada.");
  const resourceSourceId = input.resourceSourceId ?? source.resourceSourceId;
  await assertBankResourceSource(tx, input.sourceBankAccountId, resourceSourceId);
  await assertBankResourceSource(tx, input.destinationBankAccountId, resourceSourceId);
  if (key) {
    const existing = await findTreasuryTransferReplay(tx, key);
    if (existing) {
      if (existing.sourceMovement.resourceSourceId !== resourceSourceId || existing.date.getTime() !== input.date.getTime() || !existing.valueDecimal.equals(value) || existing.sourceBankAccountId !== input.sourceBankAccountId || existing.destinationBankAccountId !== input.destinationBankAccountId || existing.history !== (input.history?.trim() || null) || existing.sourceMovement.sourceModule !== (input.sourceModule?.trim() || "FINANCEIRO") || existing.sourceMovement.sourceType !== (input.sourceType?.trim() || "TREASURY_TRANSFER") || existing.sourceMovement.sourceId !== (input.sourceId?.trim() || key) || existing.sourceMovement.eventType !== (input.eventType?.trim() || "TRANSFER")) throw new FinanceError("Transferência já registrada com outros dados.");
      return existing;
    }
  }
  const [sourceBindings, destinationBindings] = await Promise.all([
    listAccountingUnitBindings(tx, source.budgetUnitId),
    listAccountingUnitBindings(tx, destination.budgetUnitId),
  ]);
  const sourceEntity = sourceBindings[0], destinationEntity = destinationBindings[0];
  if (!sourceEntity || !destinationEntity || sourceEntity.governmentEntityId !== destinationEntity.governmentEntityId) throw new FinanceError("A transferência entre entidades distintas exige fluxo interinstitucional próprio.");
  const year = await financialYearForPosting(tx, input.date, source.budgetUnitId);
  await assertAccountingPeriodOpen(tx, year.id, input.date);
  for (const id of [input.sourceBankAccountId, input.destinationBankAccountId].sort()) await lockBankAccount(tx, id);
  await assertBankResourceSource(tx, input.sourceBankAccountId, resourceSourceId);
  await assertBankResourceSource(tx, input.destinationBankAccountId, resourceSourceId);
  const balance = await getBankAccountBalance(tx, input.sourceBankAccountId, input.date);
  if ((await getBankResourceSourceSpendableBalance(tx, input.sourceBankAccountId, resourceSourceId!, input.date)).lt(value)) throw new FinanceError("Saldo por fonte insuficiente para a transferência.");
  if (balance.lessThan(value)) throw new FinanceError("Saldo financeiro insuficiente para a transferência.");
  const common = {
    date: input.date,
    type: "Transfer",
    resourceSourceId,
    valueDecimal: value,
    history: input.history?.trim() || "Transferência entre contas bancárias.",
    financialYearId: year.id,
    sourceModule: input.sourceModule?.trim() || "FINANCEIRO",
    sourceType: input.sourceType?.trim() || "TREASURY_TRANSFER",
    sourceId: input.sourceId?.trim() || key,
    eventType: input.eventType?.trim() || "TRANSFER",
    status: "Confirmado",
  };
  const debit = await insertTreasuryMovement(tx, { ...common, direction: "Saída", bankAccountId: input.sourceBankAccountId, idempotencyKey: key ? `${key}:OUT` : undefined });
  const credit = await insertTreasuryMovement(tx, { ...common, direction: "Entrada", bankAccountId: input.destinationBankAccountId, idempotencyKey: key ? `${key}:IN` : undefined });
  const transfer = await insertTreasuryTransfer(tx, { date: input.date, valueDecimal: value, history: input.history?.trim() || undefined, sourceBankAccountId: input.sourceBankAccountId, destinationBankAccountId: input.destinationBankAccountId, sourceMovementId: debit.id, destinationMovementId: credit.id, idempotencyKey: input.idempotencyKey?.trim() || undefined });
  const accountingInput = {
    financialYearId: year.id, governmentEntityId: sourceEntity.governmentEntityId,
    date: input.date, value, history: common.history, sourceModule: common.sourceModule,
    sourceType: common.sourceType, sourceId: common.sourceId ?? transfer.id,
  };
  const accountingKey = key ? `${key}:ACCOUNTING` : `TREASURY_TRANSFER:${transfer.id}:ACCOUNTING`;
  if (source.budgetUnitId === destination.budgetUnitId) {
    const eventCode = common.sourceType === "BANK_STATEMENT_INVESTMENT_TRANSFER"
      ? ["APLICACAO", "TRANSFERENCIA_PARA_APLICACAO"].includes(common.eventType) ? "APLICACAO_FINANCEIRA" : "RESGATE_APLICACAO_FINANCEIRA"
      : "TRANSFERENCIA_BANCARIA";
    await postAccountingEventInTransaction(tx, actor, { ...accountingInput, budgetUnitId: source.budgetUnitId, eventCode, debitAccountId: destination.accountingPlanId, creditAccountId: source.accountingPlanId, idempotencyKey: accountingKey });
  } else {
    // Each UG has a balanced leg through the configured inter-unit clearing account.
    const [outgoing, incoming] = await Promise.all([readAccountingEventRules(tx, "TRANSFERENCIA_UG_SAIDA"), readAccountingEventRules(tx, "TRANSFERENCIA_UG_ENTRADA")]);
    if (!outgoing?.isActive || !incoming?.isActive || outgoing.rules.length !== 1 || incoming.rules.length !== 1) throw new FinanceError("Transferência entre UGs exige uma regra ativa para cada perna contábil.");
    if (outgoing.rules[0].debitAccountId !== incoming.rules[0].creditAccountId || [source.accountingPlanId, destination.accountingPlanId].includes(outgoing.rules[0].debitAccountId)) throw new FinanceError("As pernas da transferência devem utilizar a mesma conta de trânsito, distinta das contas bancárias.");
    await postAccountingEventInTransaction(tx, actor, { ...accountingInput, budgetUnitId: source.budgetUnitId, eventCode: "TRANSFERENCIA_UG_SAIDA", creditAccountId: source.accountingPlanId, idempotencyKey: `${accountingKey}:OUT` });
    await postAccountingEventInTransaction(tx, actor, { ...accountingInput, budgetUnitId: destination.budgetUnitId, eventCode: "TRANSFERENCIA_UG_ENTRADA", debitAccountId: destination.accountingPlanId, idempotencyKey: `${accountingKey}:IN` });
  }
  await audit(tx, actor, "CREATE", "TreasuryTransfer", transfer.id, { value: jsonMoney(value), sourceBankAccountId: input.sourceBankAccountId, destinationBankAccountId: input.destinationBankAccountId }, year.id);
  return transfer;
}

export async function createTreasuryTransfer(
  db: DatabaseConnection,
  actor: FinanceActor,
  input: TreasuryTransferInput,
) {
  return withDatabaseTransaction(db, (tx) => createTreasuryTransferInTransaction(tx, actor, input));
}

export async function recordConfirmedRevenue(
  tx: DatabaseTransaction,
  actor: FinanceActor,
  input: { date: Date; value: Decimal | string | number; revenueNatureId: string; resourceSourceId: string; bankAccountId: string; classification?: RevenueClassification; history?: string; sourceModule: string; sourceType: string; sourceId?: string; eventType: string; idempotencyKey: string; integrationEventId?: string; bankTransactionId?: string; bankAccountExternalId?: string; collectionReference?: string },
) {
  const value = money(input.value);
  if (!input.idempotencyKey.trim()) throw new FinanceError("A arrecadacao exige chave de idempotencia.");
  await lockPlanningRevenueBudget(tx, input.bankAccountId, input.date);
  await lockBankAccount(tx, input.bankAccountId);
  const existing = await readFinanceRevenueExecution(tx, { idempotencyKey: input.idempotencyKey });
  if (existing) {
    if (existing.budgetUnitId) assertActorBudgetUnit(actor, existing.budgetUnitId);
    else if (actor.allowedBudgetUnitIds) throw new FinanceError("Arrecadação legada sem UG conciliada.");
    if (!existing.valueDecimal?.equals(value) || existing.revenueNatureId !== input.revenueNatureId || existing.resourceSourceId !== input.resourceSourceId || existing.bankAccountId !== input.bankAccountId || existing.collectionDate?.getTime() !== input.date.getTime() || existing.sourceModule !== input.sourceModule.trim() || existing.sourceType !== input.sourceType.trim() || existing.sourceId !== (input.sourceId?.trim() || null) || existing.eventType !== input.eventType.trim() || existing.history !== (input.history?.trim() || null) || existing.classification !== (input.classification ?? "ORCAMENTARIA")) throw new FinanceError("Arrecadação já registrada com outros dados.");
    return existing;
  }
  const [bankAccount, nature, source] = await Promise.all([
    findFinanceBankAccount(tx, input.bankAccountId),
    findRevenueRegistry(tx, "RevenueNature", input.revenueNatureId),
    findRevenueRegistry(tx, "ResourceSource", input.resourceSourceId),
  ]);
  if (!bankAccount?.isActive) throw new FinanceError("A receita exige uma conta bancária ativa.");
  if (bankAccount.budgetUnitId) assertActorBudgetUnit(actor, bankAccount.budgetUnitId);
  const year = await financialYearForPosting(tx, input.date, bankAccount.budgetUnitId);
  await assertBankResourceSource(tx, input.bankAccountId, input.resourceSourceId);
  if (!nature || !source) throw new FinanceError("Natureza e fonte da receita devem estar configuradas.");
  const revenue = await insertFinanceRevenue(tx, {
    // Persist the originating UG independently of the collecting bank account.
    date: input.date, valueDecimal: value, value: legacyMoney(value), financialYearId: year.id, budgetUnitId: bankAccount.budgetUnitId, revenueNatureId: input.revenueNatureId, resourceSourceId: input.resourceSourceId, bankAccountId: input.bankAccountId, classification: input.classification ?? "ORCAMENTARIA", collectionDate: input.date, history: input.history?.trim() || undefined, sourceModule: input.sourceModule.trim(), sourceType: input.sourceType.trim(), sourceId: input.sourceId?.trim() || undefined, eventType: input.eventType.trim(), idempotencyKey: input.idempotencyKey, integrationEventId: input.integrationEventId, bankTransactionId: input.bankTransactionId, bankAccountExternalId: input.bankAccountExternalId, collectionReference: input.collectionReference, status: "Arrecadada", stage: "ARRECADADA",
  });
  const movement = await insertTreasuryMovement(tx, { date: input.date, type: "Revenue", resourceSourceId: input.resourceSourceId, direction: "Entrada", valueDecimal: value, history: revenue.history, bankAccountId: input.bankAccountId, financialYearId: year.id, revenueId: revenue.id, sourceModule: input.sourceModule.trim(), sourceType: input.sourceType.trim(), sourceId: input.sourceId?.trim() || undefined, eventType: input.eventType.trim(), idempotencyKey: `${input.idempotencyKey}:TREASURY` });
   const recognizedReceivable = await taxCollectionReceivableAccount(tx, actor, input);
   const collectionPosting = {
     financialYearId: year.id,
     budgetUnitId: bankAccount.budgetUnitId ?? undefined,
     date: input.date,
     eventCode: "RECEITA_ARRECADADA",
    value,
    history: `Receita arrecadada: ${revenue.history ?? revenue.id}`,
    sourceModule: revenue.sourceModule,
    sourceType: revenue.sourceType,
      sourceId: revenue.id,
      idempotencyKey: `${input.idempotencyKey}:RECEITA_ARRECADADA`,
      debitAccountId: bankAccount.accountingPlanId ?? undefined,
      creditAccountId: recognizedReceivable,
   };
   if (recognizedReceivable) {
     if (!bankAccount.accountingPlanId) throw new FinanceError("O recebimento do direito tributário exige conta bancária com razão analítico vinculado.");
     // The immutable recognition profile is the posting matrix for this origin.
     // No generic revenue/VPA default may replace the recognized receivable.
     await postAccountingTransactionInTransaction(tx, actor, {
       financialYearId: collectionPosting.financialYearId,
       budgetUnitId: collectionPosting.budgetUnitId,
       date: collectionPosting.date,
       history: collectionPosting.history,
       sourceModule: collectionPosting.sourceModule,
       sourceType: collectionPosting.sourceType,
       sourceId: collectionPosting.sourceId,
       eventType: collectionPosting.eventCode,
       idempotencyKey: collectionPosting.idempotencyKey,
       lines: [{ accountId: bankAccount.accountingPlanId, type: "Débito", value }, { accountId: recognizedReceivable, type: "Crédito", value }],
     });
   } else await postAccountingEventInTransaction(tx, actor, collectionPosting);
  await recordPlanningRevenueCollection(tx, actor, revenue);
  await audit(tx, actor, "CREATE", "Revenue", revenue.id, { stage: revenue.stage, classification: revenue.classification, value: jsonMoney(value), treasuryMovementId: movement.id, sourceModule: revenue.sourceModule, sourceType: revenue.sourceType, sourceId: revenue.sourceId }, year.id);
  return { ...revenue, treasuryMovement: movement };
}

export async function createRevenue(
  db: DatabaseConnection,
  actor: FinanceActor,
  input: { date: Date; value: Decimal | string | number; revenueNatureId: string; resourceSourceId: string; bankAccountId: string; classification?: RevenueClassification; history?: string; sourceModule: string; sourceType: string; sourceId?: string; eventType: string; idempotencyKey: string },
) {
  return withDatabaseTransaction(db, (tx) => recordConfirmedRevenue(tx, actor, input));
}

export async function launchRevenue(
  db: DatabaseConnection,
  actor: FinanceActor,
  input: { date: Date; value: Decimal | string | number; revenueNatureId: string; resourceSourceId: string; budgetUnitId?: string; classification?: RevenueClassification; history?: string; sourceModule: string; sourceType: string; sourceId?: string; eventType: string; idempotencyKey: string },
) {
  const value = money(input.value);
  if (!input.idempotencyKey.trim()) throw new FinanceError("O lancamento da receita exige chave de idempotencia.");
  if (input.budgetUnitId) assertActorBudgetUnit(actor, input.budgetUnitId);
  return withDatabaseTransaction(db, async (tx) => {
    const existing = await findFinanceRevenue(tx, { idempotencyKey: input.idempotencyKey });
    if (existing) {
      if (existing.budgetUnitId !== (input.budgetUnitId ?? null) || !existing.valueDecimal?.equals(value) || existing.revenueNatureId !== input.revenueNatureId || existing.resourceSourceId !== input.resourceSourceId || existing.launchDate?.getTime() !== input.date.getTime()) throw new FinanceError("Receita já lançada com outros dados.");
      return existing;
    }
    const [year, nature, source] = await Promise.all([
      financialYearForPosting(tx, input.date, input.budgetUnitId),
      findRevenueRegistry(tx, "RevenueNature", input.revenueNatureId),
      findRevenueRegistry(tx, "ResourceSource", input.resourceSourceId),
    ]);
    if (!nature || !source) throw new FinanceError("Natureza e fonte da receita devem estar configuradas.");
    const revenue = await insertFinanceRevenue(tx, {
        date: input.date,
        launchDate: input.date,
        valueDecimal: value,
        value: legacyMoney(value),
        financialYearId: year.id,
        budgetUnitId: input.budgetUnitId,
        revenueNatureId: input.revenueNatureId,
        resourceSourceId: input.resourceSourceId,
        classification: input.classification ?? "ORCAMENTARIA",
        history: input.history?.trim() || undefined,
        sourceModule: input.sourceModule.trim(),
        sourceType: input.sourceType.trim(),
        sourceId: input.sourceId?.trim() || undefined,
        eventType: input.eventType.trim(),
        idempotencyKey: input.idempotencyKey.trim(),
        status: "Lancada",
        stage: "LANCADA",
    });
    await postAccountingEventInTransaction(tx, actor, {
      financialYearId: year.id,
      budgetUnitId: input.budgetUnitId,
      date: input.date,
      eventCode: "RECEITA_LANCADA",
      value,
      history: `Receita lancada: ${revenue.history ?? revenue.id}`,
      sourceModule: revenue.sourceModule,
      sourceType: revenue.sourceType,
      sourceId: revenue.id,
      idempotencyKey: `${input.idempotencyKey}:RECEITA_LANCADA`,
    });
    await audit(tx, actor, "CREATE", "Revenue", revenue.id, { stage: revenue.stage, classification: revenue.classification, value: jsonMoney(value), sourceModule: revenue.sourceModule, sourceType: revenue.sourceType, sourceId: revenue.sourceId }, year.id);
    return revenue;
  });
}

export async function collectLaunchedRevenue(
  db: DatabaseConnection,
  actor: FinanceActor,
  input: { revenueId: string; date: Date; bankAccountId: string; idempotencyKey: string },
) {
  if (!input.idempotencyKey.trim()) throw new FinanceError("A arrecadacao exige chave de idempotencia.");
  return withDatabaseTransaction(db, async (tx) => {
    await lockPlanningRevenueBudget(tx, input.bankAccountId, input.date);
    await lockBankAccount(tx, input.bankAccountId);
    await lockRevenue(tx, input.revenueId);
    const revenue = await readFinanceRevenueExecution(tx, { id: input.revenueId });
    if (!revenue) throw new FinanceError("Receita nao encontrada.");
    if (revenue.budgetUnitId) assertActorBudgetUnit(actor, revenue.budgetUnitId);
    else if (actor.allowedBudgetUnitIds) throw new FinanceError("Receita legada sem unidade gestora conciliada.");
    if (revenue.stage !== "LANCADA" || revenue.treasuryMovement) throw new FinanceError("Somente receitas lancadas e ainda nao arrecadadas podem ser efetivadas.");
    const account = await findFinanceBankAccount(tx, input.bankAccountId);
    const year = await financialYearForPosting(tx, input.date, account?.budgetUnitId);
    if (year.id !== revenue.financialYearId) throw new FinanceError("A arrecadacao deve ocorrer no mesmo exercicio financeiro da receita lancada.");
    if (!account?.isActive) throw new FinanceError("A arrecadação exige uma conta bancária ativa.");
    if (account.budgetUnitId) assertActorBudgetUnit(actor, account.budgetUnitId);
    if (revenue.budgetUnitId && revenue.budgetUnitId !== account.budgetUnitId) throw new FinanceError("A conta arrecadadora deve pertencer à unidade gestora do lançamento da receita.");
    await lockBankAccount(tx, input.bankAccountId);
    await assertBankResourceSource(tx, input.bankAccountId, revenue.resourceSourceId);
    const value = requiredDecimal(revenue.valueDecimal, "Revenue.valueDecimal");
    const collected = await updateFinanceRevenue(tx, revenue.id, { date: input.date, collectionDate: input.date, bankAccountId: input.bankAccountId, budgetUnitId: revenue.budgetUnitId ?? account.budgetUnitId, status: "Arrecadada", stage: "ARRECADADA" });
    const movement = await insertTreasuryMovement(tx, { date: input.date, type: "Revenue", resourceSourceId: revenue.resourceSourceId, direction: "Entrada", valueDecimal: value, history: collected.history, bankAccountId: input.bankAccountId, financialYearId: year.id, revenueId: collected.id, sourceModule: collected.sourceModule, sourceType: collected.sourceType, sourceId: collected.sourceId ?? collected.id, eventType: "REVENUE_COLLECTED", idempotencyKey: `${input.idempotencyKey}:TREASURY` });
    await postAccountingEventInTransaction(tx, actor, {
      financialYearId: year.id,
      budgetUnitId: account.budgetUnitId ?? undefined,
      date: input.date,
      eventCode: "RECEITA_ARRECADADA",
      value,
      history: `Receita arrecadada: ${collected.history ?? collected.id}`,
      sourceModule: collected.sourceModule,
      sourceType: collected.sourceType,
      sourceId: collected.id,
      idempotencyKey: `${input.idempotencyKey}:RECEITA_ARRECADADA`,
      debitAccountId: account.accountingPlanId ?? undefined,
    });
    await recordPlanningRevenueCollection(tx, actor, collected);
    await audit(tx, actor, "COLLECT", "Revenue", collected.id, { stage: collected.stage, value: jsonMoney(value), treasuryMovementId: movement.id }, year.id);
    return { ...collected, treasuryMovement: movement };
  });
}

export async function reverseRevenue(
  db: DatabaseConnection,
  actor: FinanceActor,
  input: { revenueId: string; date: Date; justification: string },
) {
  return withDatabaseTransaction(db, (tx) => reverseRevenueInTransaction(tx, actor, input));
}

/** Tax callers supply the linked payment inside their encompassing transaction. */
export async function reverseRevenueInTransaction(
  tx: DatabaseTransaction,
  actor: FinanceActor,
  input: { revenueId: string; date: Date; justification: string; taxPaymentId?: string },
) {
  if (!input.justification.trim()) throw new FinanceError("A justificativa do estorno da receita e obrigatoria.");
    await assertAdvanceRefundReversalAllowed(tx, actor, input.revenueId);
    await lockRevenue(tx, input.revenueId);
    const revenue = await readFinanceRevenueExecution(tx, { id: input.revenueId });
    if (!revenue) throw new FinanceError("Receita nao encontrada.");
    if (revenue.stage !== "ARRECADADA" || !revenue.treasuryMovement || revenue.reversal) throw new FinanceError("Somente receitas arrecadadas sem estorno anterior podem ser estornadas.");
    if (revenue.budgetUnitId) assertActorBudgetUnit(actor, revenue.budgetUnitId);
    else if (actor.allowedBudgetUnitIds) throw new FinanceError("Receita legada sem unidade gestora conciliada.");
    if (revenue.taxIntegration && revenue.taxIntegration.taxPaymentId !== input.taxPaymentId) throw new FinanceError("A receita originada de pagamento tributario deve ser estornada pelo fluxo tributario proprio.");
    if (input.taxPaymentId && revenue.taxIntegration?.taxPaymentId !== input.taxPaymentId) throw new FinanceError("O pagamento tributário diverge da origem da receita.");
    if (revenue.resourceRedistributions.length) throw new FinanceError("A receita possui redistribuicoes por fonte. Regularize-as antes do estorno.");
    const value = requiredDecimal(revenue.valueDecimal, "Revenue.valueDecimal");
    const bankAccount = await findFinanceBankAccount(tx, revenue.treasuryMovement.bankAccountId);
    const year = await financialYearForPosting(tx, input.date, bankAccount?.budgetUnitId);
    if (year.id !== revenue.financialYearId) throw new FinanceError("O estorno deve ocorrer no mesmo exercicio financeiro da receita arrecadada.");
    if (revenue.collectionDate && input.date < revenue.collectionDate) throw new FinanceError("O estorno não pode anteceder a arrecadação.");
    await lockBankAccount(tx, revenue.treasuryMovement.bankAccountId);
    const balance = await getBankAccountBalance(tx, revenue.treasuryMovement.bankAccountId, input.date);
    if ((await getBankResourceSourceSpendableBalance(tx, revenue.treasuryMovement.bankAccountId, revenue.resourceSourceId, input.date)).lt(value)) throw new FinanceError("Saldo por fonte insuficiente para estornar a receita.");
    if (balance.lessThan(value)) throw new FinanceError("Saldo financeiro insuficiente para estornar a receita.");
    const movement = await insertTreasuryMovement(tx, { date: input.date, type: "RevenueReversal", resourceSourceId: revenue.resourceSourceId, direction: "Saída", valueDecimal: value, history: `Estorno de receita ${revenue.id}: ${input.justification.trim()}`, bankAccountId: revenue.treasuryMovement.bankAccountId, financialYearId: year.id, sourceModule: "FINANCEIRO", sourceType: "REVENUE_REVERSAL", sourceId: revenue.id, eventType: "REVENUE_REVERSED", idempotencyKey: `FINANCEIRO:REVENUE:${revenue.id}:REVERSED` });
    const reversal = await insertRevenueReversal(tx, { revenueId: revenue.id, date: input.date, valueDecimal: value, justification: input.justification.trim(), financialYearId: year.id, treasuryMovementId: movement.id });
    const reversed = await updateFinanceRevenue(tx, revenue.id, { status: "Estornada", stage: "ESTORNADA", reversedAt: input.date });
    if (input.taxPaymentId) await reverseAccountingForSource(tx, actor, {
      financialYearId: year.id, date: input.date, sourceType: revenue.sourceType, sourceId: revenue.id,
      eventType: "TAX_PAYMENT_REVERSED", history: `Estorno tributário ${input.taxPaymentId}: ${input.justification.trim()}`,
      idempotencyKey: `TRIBUTARIO:TAX_PAYMENT:${input.taxPaymentId}:REVERSAL:ACCOUNTING`,
    });
    else await postAccountingEventInTransaction(tx, actor, {
      financialYearId: year.id,
      budgetUnitId: bankAccount?.budgetUnitId ?? undefined,
      date: input.date,
      eventCode: "RECEITA_ESTORNADA",
      value,
      history: `Estorno de receita: ${revenue.history ?? revenue.id}`,
      sourceModule: "FINANCEIRO",
      sourceType: "REVENUE_REVERSAL",
      sourceId: reversal.id,
      idempotencyKey: `FINANCEIRO:REVENUE:${revenue.id}:RECEITA_ESTORNADA`,
      creditAccountId: bankAccount?.accountingPlanId ?? undefined,
    });
    await recordPlanningRevenueReversal(tx, actor, revenue, input.date);
    await recordAdvanceRefundReversal(tx, actor, { revenueId: revenue.id, reversalId: reversal.id, date: input.date, reason: input.justification });
    await audit(tx, actor, "REVERSE", "Revenue", revenue.id, { stage: reversed.stage, reversalId: reversal.id, treasuryMovementId: movement.id, value: jsonMoney(value), justification: reversal.justification, originRevenueId: revenue.id }, year.id);
    return reversal;
}

export async function redistributeRevenueResourceSource(
  db: DatabaseConnection,
  actor: FinanceActor,
  input: { revenueId: string; date: Date; value: Decimal | string | number; destinationResourceSourceId: string; history: string; idempotencyKey?: string },
) {
  const value = money(input.value);
  if (!input.history.trim()) throw new FinanceError("Informe o historico da redistribuicao de fonte.");
  if (!Number.isFinite(input.date.getTime())) throw new FinanceError("Data de redistribuição inválida.");
  return withDatabaseTransaction(db, async (tx) => {
    await lockRevenue(tx, input.revenueId);
    const revenue = await findFinanceRevenue(tx, { id: input.revenueId });
    if (!revenue) throw new FinanceError("Receita da redistribuição não encontrada.");
    if (revenue.budgetUnitId) assertActorBudgetUnit(actor, revenue.budgetUnitId);
    else if (actor.allowedBudgetUnitIds) throw new FinanceError("Receita legada sem unidade gestora conciliada.");
    if (input.idempotencyKey?.trim()) {
      const existing = await findRevenueRedistribution(tx, input.idempotencyKey.trim());
      if (existing) {
        if (existing.revenueId !== revenue.id || existing.date.getTime() !== input.date.getTime() || !existing.valueDecimal.equals(value) || existing.destinationResourceSourceId !== input.destinationResourceSourceId || existing.history !== input.history.trim()) throw new FinanceError("Chave da redistribuição já utilizada com outro conteúdo.");
        return existing;
      }
    }
    if (revenue.stage !== "ARRECADADA") throw new FinanceError("Somente receitas arrecadadas podem ter fonte redistribuida.");
    if (revenue.collectionDate && input.date < revenue.collectionDate) throw new FinanceError("Redistribuição não pode anteceder a arrecadação.");
    if (revenue.resourceSourceId === input.destinationResourceSourceId) throw new FinanceError("A fonte de destino deve ser diferente da fonte de origem.");
    const [destination, redistributed, bankAccount] = await Promise.all([
      findRevenueRegistry(tx, "ResourceSource", input.destinationResourceSourceId),
      sumRevenueRedistributions(tx, revenue.id),
      revenue.bankAccountId ? findFinanceBankAccount(tx, revenue.bankAccountId) : null,
    ]);
    if (bankAccount?.budgetUnitId && revenue.budgetUnitId && bankAccount.budgetUnitId !== revenue.budgetUnitId) throw new FinanceError("Banco e receita divergem na unidade gestora.");
    const budgetUnitId = revenue.budgetUnitId ?? bankAccount?.budgetUnitId ?? undefined;
    const year = await financialYearForPosting(tx, input.date, budgetUnitId);
    if (year.id !== revenue.financialYearId) throw new FinanceError("A redistribuicao deve ocorrer no mesmo exercicio financeiro da receita.");
    if (!destination) throw new FinanceError("Fonte de destino nao encontrada.");
    const available = requiredDecimal(revenue.valueDecimal, "Revenue.valueDecimal").minus(redistributed);
    if (available.lessThan(value)) throw new FinanceError("A redistribuicao excede o valor ainda disponivel na fonte de origem.");
    if (!revenue.bankAccountId) throw new FinanceError("Receita sem conta bancária documental para redistribuição.");
    await lockBankAccount(tx, revenue.bankAccountId);
    await assertBankResourceSource(tx, revenue.bankAccountId, destination.id);
    if ((await getBankResourceSourceSpendableBalance(tx, revenue.bankAccountId, revenue.resourceSourceId, input.date)).lt(value)) throw new FinanceError("Redistribuição excede o saldo bancário disponível na fonte de origem.");
    const redistribution = await insertRevenueRedistribution(tx, { revenueId: revenue.id, date: input.date, valueDecimal: value, sourceResourceSourceId: revenue.resourceSourceId, destinationResourceSourceId: destination.id, financialYearId: year.id, history: input.history.trim(), idempotencyKey: input.idempotencyKey?.trim() || undefined });
    await postAccountingEventInTransaction(tx, actor, {
      financialYearId: year.id,
      budgetUnitId,
      date: input.date,
      eventCode: "RECEITA_REDISTRIBUIDA_FONTE",
      value,
      history: `Redistribuicao de fonte da receita ${revenue.id}: ${redistribution.history}`,
      sourceModule: "FINANCEIRO",
      sourceType: "REVENUE_RESOURCE_REDISTRIBUTION",
      sourceId: redistribution.id,
      idempotencyKey: `FINANCEIRO:REVENUE_REDISTRIBUTION:${redistribution.id}`,
    });
    await recordPlanningRevenueRedistribution(tx, actor, revenue, redistribution);
    await audit(tx, actor, "REDISTRIBUTE_RESOURCE_SOURCE", "Revenue", revenue.id, { redistributionId: redistribution.id, sourceResourceSourceId: revenue.resourceSourceId, destinationResourceSourceId: destination.id, value: jsonMoney(value), history: redistribution.history }, year.id);
    return redistribution;
  });
}

export async function dailyTreasuryBulletin(tx: DatabaseExecutor, date: Date, bankAccountId?: string) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const movements = (await listTreasuryPeriodMovements(tx, { bankAccountId, start, before: end })).map(({ direction, type, valueDecimal }) => ({ direction, type, valueDecimal }));
  const opening = await listTreasuryPeriodMovements(tx, { bankAccountId, before: start });
  const openingBalance = opening.reduce((total, movement) => total.plus(signedValue(movement.direction, movement.valueDecimal)), new Decimal(0));
  const incoming = movements.filter((movement) => movement.direction === "Entrada").reduce((total, movement) => total.plus(movement.valueDecimal), new Decimal(0));
  const outgoing = movements.filter((movement) => movement.direction === "Saída").reduce((total, movement) => total.plus(movement.valueDecimal), new Decimal(0));
  return { date: start, openingBalance, incoming, outgoing, closingBalance: openingBalance.plus(incoming).minus(outgoing), movements };
}

export async function basicCashflow(tx: DatabaseExecutor, startDate: Date, endDate: Date, bankAccountId?: string) {
  const movements = await listTreasuryPeriodMovements(tx, { bankAccountId, start: startDate, end: endDate });
  return movements.reduce<Record<string, { incoming: Decimal; outgoing: Decimal; net: Decimal }>>((days, movement) => {
    const key = movement.date.toISOString().slice(0, 10);
    const entry = days[key] ?? { incoming: new Decimal(0), outgoing: new Decimal(0), net: new Decimal(0) };
    if (movement.direction === "Entrada") entry.incoming = entry.incoming.plus(movement.valueDecimal);
    else entry.outgoing = entry.outgoing.plus(movement.valueDecimal);
    entry.net = entry.incoming.minus(entry.outgoing);
    days[key] = entry;
    return days;
  }, {});
}

function assertActorCanAccessBankAccount(actor: FinanceActor, budgetUnitId: string | null) {
  if (actor.allowedBudgetUnitIds && (!budgetUnitId || !actor.allowedBudgetUnitIds.includes(budgetUnitId))) {
    throw new FinanceError("Acesso negado à Unidade Gestora da conta bancária.");
  }
}

function accountingMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

async function lockAccountingPeriod(tx: DatabaseExecutor, financialYearId: string, date: Date) {
  if (!Number.isFinite(date.getTime())) throw new FinanceError("Competência contábil inválida.");
  const key = `ACCOUNTING_PERIOD:${financialYearId}:${accountingMonth(date).toISOString()}`;
  await lockAccountingMonth(tx, key);
}

export async function assertAccountingPeriodOpen(tx: DatabaseExecutor, financialYearId: string, date: Date) {
  await lockAccountingPeriod(tx, financialYearId, date);
  const close = await findAccountingMonth(tx, financialYearId, accountingMonth(date));
  if (close && close.status !== "ABERTO") throw new FinanceError("A competencia contabil nao esta aberta para novas postagens.");
}

export type AccountingLine = {
  accountId: string;
  type: "Débito" | "Crédito";
  value: Decimal | string | number;
  originalEntryId?: string;
  annualBalanceOriginEntryId?: string;
};

type AccountingPostingInput = {
  financialYearId: string;
  governmentEntityId?: string;
  budgetUnitId?: string;
  date: Date;
  history: string;
  lines: AccountingLine[];
  sourceModule?: string;
  sourceType?: string;
  sourceId?: string;
  eventType?: string;
  idempotencyKey?: string;
  reversalOfId?: string;
};

type AccountingEventInput = {
  financialYearId: string;
  governmentEntityId?: string;
  budgetUnitId?: string;
  date: Date;
  eventCode: string;
  value: Decimal | string | number;
  history: string;
  sourceModule: string;
  sourceType: string;
  sourceId?: string;
  idempotencyKey?: string;
  debitAccountId?: string;
  creditAccountId?: string;
};

type AccountingComponentInput = {
  debitAccountId: string;
  creditAccountId: string;
  valueBasis: "EVENT_VALUE" | "PAYMENT_NET" | "PAYMENT_RETENTION";
  creditFromOriginBank?: boolean;
};

function accountingAmount(value: Decimal | string | number): Decimal {
  const amount = new Decimal(String(value)).toDecimalPlaces(2);
  if (!amount.isFinite() || amount.lte(0)) throw new FinanceError("Informe um valor monetário maior que zero.");
  return amount;
}

function accountingTotals(lines: AccountingLine[]) {
  if (lines.length < 2) throw new FinanceError("Uma partida contabil exige ao menos dois lancamentos.");
  const totals = lines.reduce((result, line) => {
    if (!line.accountId || !["Débito", "Crédito"].includes(line.type)) throw new FinanceError("Conta e natureza contabil invalidas.");
    const value = accountingAmount(line.value);
    if (line.type === "Débito") result.debit = result.debit.plus(value);
    else result.credit = result.credit.plus(value);
    return result;
  }, { debit: new Decimal(0), credit: new Decimal(0) });
  if (!totals.debit.equals(totals.credit)) throw new FinanceError("A postagem foi bloqueada: debitos e creditos devem ser iguais.");
  return totals;
}

async function resolveAccountingScope(
  tx: DatabaseTransaction,
  actor: FinanceActor,
  input: AccountingPostingInput,
): Promise<{ governmentEntityId: string; budgetUnitId: string } | null> {
  let budgetUnitId = input.budgetUnitId?.trim() || null;
  if (input.governmentEntityId && !budgetUnitId) throw new FinanceError("Informe a unidade gestora junto à entidade do lançamento contábil.");

  if (input.sourceId) {
    const suppliedBudgetUnitId = budgetUnitId;
    const sourceType = input.sourceType ?? "";
    const canonicalRevenue = await findCanonicalRevenueUnit(tx, input.sourceModule ?? "MANUAL", sourceType, input.sourceId);
    const canonicalSource = !!canonicalRevenue || ["BUDGET_APPROPRIATION_OPENING", "COMMITMENT", "COMMITMENT_REVERSAL", "COMMITMENT_MOVEMENT", "SETTLEMENT", "PAYMENT", "WITHHOLDING_PAYABLE", "BANK_ACCOUNT", "BANK_ACCOUNT_OPENING_BALANCE", "BANK_STATEMENT_INVESTMENT_TRANSFER", "BANK_STATEMENT_CLASSIFICATION", "PLANNING_BUDGET", "REVENUE_REVERSAL", "REVENUE_RESOURCE_REDISTRIBUTION"].includes(sourceType);
    if (canonicalSource) budgetUnitId = await findCanonicalAccountingUnit(tx, sourceType, input.sourceId);
    if (canonicalRevenue && !["BUDGET_APPROPRIATION_OPENING", "COMMITMENT", "COMMITMENT_REVERSAL", "COMMITMENT_MOVEMENT", "SETTLEMENT", "PAYMENT", "WITHHOLDING_PAYABLE", "BANK_ACCOUNT", "BANK_ACCOUNT_OPENING_BALANCE", "BANK_STATEMENT_INVESTMENT_TRANSFER", "BANK_STATEMENT_CLASSIFICATION", "PLANNING_BUDGET", "REVENUE_REVERSAL", "REVENUE_RESOURCE_REDISTRIBUTION"].includes(sourceType)) budgetUnitId = canonicalRevenue.budgetUnitId;
    if (canonicalSource && suppliedBudgetUnitId && suppliedBudgetUnitId !== budgetUnitId) throw new FinanceError("A unidade gestora informada diverge da origem canônica do lançamento.");
    if (canonicalSource && !budgetUnitId && suppliedBudgetUnitId) throw new FinanceError("Origem canônica sem unidade gestora conciliada.");
  }

  if (!budgetUnitId) return null;
  assertActorBudgetUnit(actor, budgetUnitId);
  const bindings = await listAccountingUnitBindings(tx, budgetUnitId);
  const governmentEntityId = input.governmentEntityId ?? (bindings.length === 1 ? bindings[0].governmentEntityId : null);
  if (!governmentEntityId || !bindings.some((binding) => binding.governmentEntityId === governmentEntityId)) throw new FinanceError("Unidade gestora sem vínculo único e válido à entidade para contabilização.");
  return { governmentEntityId, budgetUnitId };
}

export async function postAccountingTransaction(
  db: DatabaseConnection,
  actor: FinanceActor,
  input: AccountingPostingInput,
) {
  return withDatabaseTransaction(db, tx => postAccountingTransactionInTransaction(tx, actor, input));
}

export async function postAccountingTransactionInTransaction(
  tx: DatabaseTransaction,
  actor: FinanceActor,
  input: AccountingPostingInput,
) {
  const totals = accountingTotals(input.lines);
  if (input.lines.some(line => line.originalEntryId) && !input.reversalOfId) throw new FinanceError("Vínculo de linha original exige transação de estorno.");
  if (!input.history.trim()) throw new FinanceError("Informe o historico da transacao contabil.");
  if (!actor.employeeId) throw new FinanceError("A postagem contabil exige usuario vinculado a servidor responsavel.");
  if ((input.sourceModule ?? "MANUAL") === "MANUAL" && (!input.governmentEntityId || !input.budgetUnitId)) throw new FinanceError("Selecione a entidade e a unidade gestora do lançamento manual.");
  const accountingScope = await resolveAccountingScope(tx, actor, input);
  const annualOrigin = await resolveAnnualPostingOrigins(tx, { ...input, ...accountingScope });
  const annualResultReversal = await isAnnualResultReversal(tx, { ...input, ...accountingScope });
  const originalClassifications = new Map<string, JsonObject>();
  for (const line of input.lines.filter(line => line.originalEntryId)) {
    const original = await findAccountingEntryWithTransaction(tx, line.originalEntryId!);
    if (!original || original.transactionId !== input.reversalOfId || original.accountId !== line.accountId || original.type !== (line.type === "Débito" ? "Crédito" : "Débito")) throw new FinanceError("Linha original não pertence à contraparte da transação estornada.");
    if (!original.transaction || original.transaction.status !== "POSTADO" || original.transaction.governmentEntityId !== (accountingScope?.governmentEntityId ?? null) || original.transaction.budgetUnitId !== (accountingScope?.budgetUnitId ?? null)) throw new FinanceError("Estorno deve preservar o ente e a unidade gestora da transação original.");
    if (original.classificationSnapshot && typeof original.classificationSnapshot === "object" && !Array.isArray(original.classificationSnapshot)) originalClassifications.set(line.originalEntryId!, original.classificationSnapshot);
  }
  const yearScope = await findFinancialScopeYear(tx, input.financialYearId);
  if (accountingScope && yearScope?.governmentEntityId !== accountingScope.governmentEntityId) throw new FinanceError("A entidade do lançamento contábil deve corresponder à entidade do exercício financeiro.");
  if (!accountingScope && yearScope?.governmentEntityId) throw new FinanceError("O exercício da entidade exige lançamento com entidade e unidade gestora identificadas.");
  await lockAccountingPeriod(tx, input.financialYearId, input.date);
  if (input.idempotencyKey) {
    const existing = await findAccountingReplay(tx, input.idempotencyKey);
    if (existing) {
      const entries = await listAccountingEntries(tx, existing.id);
      const explicitLineMapping = input.lines.some(line => line.originalEntryId);
      const expected = input.lines.map((line) => `${line.accountId}:${line.type}:${accountingAmount(line.value).toFixed(2)}${explicitLineMapping ? `:${line.originalEntryId ?? ""}` : ""}`).sort();
      const persisted = entries.map((entry) => {
        const snapshot = entry.classificationSnapshot as JsonObject | null;
        const originalId = typeof snapshot?.originalEntryId === "string" ? snapshot.originalEntryId : "";
        return `${entry.accountId}:${entry.type}:${entry.valueDecimal?.toFixed(2) ?? "NULL"}${explicitLineMapping ? `:${originalId}` : ""}`;
      }).sort();
      if (existing.financialYearId !== input.financialYearId || existing.governmentEntityId !== (accountingScope?.governmentEntityId ?? null) || existing.budgetUnitId !== (accountingScope?.budgetUnitId ?? null) || existing.date.getTime() !== input.date.getTime() || existing.history !== input.history.trim() || existing.sourceModule !== (input.sourceModule?.trim() || "MANUAL") || existing.sourceType !== (input.sourceType?.trim() || "ACCOUNTING_TRANSACTION") || existing.sourceId !== (input.sourceId?.trim() || null) || existing.eventType !== (input.eventType?.trim() || "MANUAL_POSTING") || existing.reversalOfId !== (input.reversalOfId ?? null) || JSON.stringify(expected) !== JSON.stringify(persisted)) throw new FinanceError("Chave contábil já registrada com outros dados ou escopo.");
      return existing;
    }
  }
  if (input.sourceModule === "PLANEJAMENTO" && input.sourceType === "PLANNING_BUDGET" && /^PLANNING_(BUDGET_OPENING_(REVENUE|EXPENSE)|(REVENUE|EXPENSE)_(INCREASE|DECREASE))$/.test(input.eventType ?? "")) {
    const year = await findFinancialScopeYear(tx, input.financialYearId);
    if (!year) throw new FinanceError("Exercício financeiro não encontrado.");
    if (!["Preparação", "Aberto"].includes(year.status) || input.date < year.startDate || input.date > year.endDate || input.date.getUTCFullYear() !== year.year) throw new FinanceError("Exercício indisponível para contabilização orçamentária de Planejamento.");
   } else if (annualOrigin && annualOrigin.edition.stage !== "OPENING" || annualResultReversal) {
     const year = await findFinancialScopeYear(tx, input.financialYearId);
     if (!year || year.status !== "Em Encerramento" || input.date.getTime() !== year.endDate.getTime() || await countClosedAccountingMonths(tx, year.id) !== 12) throw new FinanceError("Partidas de encerramento exigem exercício em encerramento com doze competências fechadas.");
   } else await assertFinancialYearOpen(tx, input.financialYearId, input.date);
   if ((!annualOrigin || annualOrigin.edition.stage === "OPENING") && !annualResultReversal) await assertAccountingPeriodOpen(tx, input.financialYearId, input.date);
  const accounts = await listAccountingPlans(tx, input.lines.map(line => line.accountId));
  if (accounts.length !== new Set(input.lines.map((line) => line.accountId)).size) throw new FinanceError("Uma ou mais contas contabeis nao foram encontradas.");
  let classifications: Map<string, JsonObject>;
   try { classifications = await resolveAccountClassificationSnapshots(tx, accounts.filter(account => input.lines.some((line, index) => line.accountId === account.id && !line.originalEntryId && !annualOrigin?.memories[index].classification)), input.date, accountingScope ?? undefined); }
  catch (error) { throw new FinanceError(error instanceof Error ? error.message : "Classificação contábil inválida."); }
  const dimensions = accountingScope ? await resolveAccountingSourceDimensions(tx, { ...input, ...accountingScope }) : null;
  const lineDimensions: Array<JsonObject | null> = [];
   for (const [index, line] of input.lines.entries()) {
     const classification = line.originalEntryId ? originalClassifications.get(line.originalEntryId) : annualOrigin?.memories[index].classification ?? classifications.get(line.accountId);
     const resolved = annualOrigin ? annualOrigin.memories[index].dimensions : accountingScope && input.reversalOfId ? await resolveAccountingReversalLineDimensions(tx, { ...input, ...accountingScope }, input.reversalOfId, line.accountId, line.type, line.originalEntryId) : accountingScope && classification && input.sourceType === "REVENUE_RESOURCE_REDISTRIBUTION" ? await resolveAccountingLineSourceDimensions(tx, { ...input, ...accountingScope }, line.type, classification) : dimensions;
     if (annualOrigin?.memories[index].classification) { lineDimensions.push(resolved); continue; }
     const msc = accountingScope ? await composeMscLineDimensions(tx, { ...accountingScope, date: input.date }, line.accountId, resolved) : null;
    lineDimensions.push(msc ? { ...resolved, msc, mscReadiness: msc.status === "DOCUMENTED" ? "MSC_DOCUMENTED" : "MSC_NOT_RECONCILED" } : resolved);
  }
  if (accountingScope && classifications.size && input.sourceType === "REVENUE_RESOURCE_REDISTRIBUTION" && new Set(lineDimensions.map(dimension => dimension?.resourceSourceId)).size !== 2) throw new FinanceError("Redistribuição deve identificar fonte de origem e destino em linhas distintas.");
   const currentAccounts = accounts.filter(account => input.lines.some((line, index) => line.accountId === account.id && !line.originalEntryId && !annualOrigin?.memories[index].classification));
  const childAccount = await hasAccountingPlanChildren(tx, currentAccounts.map(account => account.code));
  if (childAccount) throw new FinanceError("A postagem exige conta analítica de último nível; conta sintética com desdobramentos não aceita partidas.");
  const transaction = await insertAccountingPosting(tx, {
      ...(accountingScope ?? {}),
      financialYearId: input.financialYearId,
      date: input.date,
      history: input.history.trim(),
      status: "POSTADO",
      sourceModule: input.sourceModule?.trim() || "MANUAL",
      sourceType: input.sourceType?.trim() || "ACCOUNTING_TRANSACTION",
      sourceId: input.sourceId?.trim() || undefined,
      eventType: input.eventType?.trim() || "MANUAL_POSTING",
      idempotencyKey: input.idempotencyKey?.trim() || undefined,
      reversalOfId: input.reversalOfId,
      authorUsuarioId: actor.usuarioId,
      authorEmployeeId: actor.employeeId,
      postedAt: new Date(),
    }, input.lines.map((line, index) => {
          const value = accountingAmount(line.value);
          const classification = line.originalEntryId ? originalClassifications.get(line.originalEntryId) : annualOrigin?.memories[index].classification ?? classifications.get(line.accountId);
          const classificationSnapshot = classification ? { ...classification, ...(line.originalEntryId ? { originalEntryId: line.originalEntryId } : {}), ...(line.annualBalanceOriginEntryId ? { annualBalanceOriginEntryId: line.annualBalanceOriginEntryId } : {}), dimensions: lineDimensions[index] } : line.originalEntryId || line.annualBalanceOriginEntryId || lineDimensions[index]?.msc ? { ...(line.originalEntryId ? { originalEntryId: line.originalEntryId } : {}), ...(line.annualBalanceOriginEntryId ? { annualBalanceOriginEntryId: line.annualBalanceOriginEntryId } : {}), dimensions: lineDimensions[index], classificationResolution: "NOT_RECONCILED" } : undefined;
          return { date: input.date, value: Number(value.toString()), valueDecimal: value, classificationSnapshot: classificationSnapshot ? JSON.parse(JSON.stringify(classificationSnapshot)) as JsonValue : undefined, type: line.type, history: input.history.trim(), accountId: line.accountId, authorId: actor.employeeId! };
        }));
  await insertAccountingAudit(tx, actor, { action: "POST", entityType: "AccountingTransaction", entityId: transaction.id, payload: { debit: totals.debit.toFixed(2), credit: totals.credit.toFixed(2), lineCount: input.lines.length, eventType: transaction.eventType }, financialYearId: input.financialYearId });
  await recordAccountingMunicipalCosts(tx, actor, transaction, input.lines, accounts);
  return transaction;
}

async function reverseAccountingForSource(
  tx: DatabaseTransaction,
  actor: FinanceActor,
  input: { financialYearId: string; date: Date; sourceType: string; sourceId: string; eventType: string; history: string; idempotencyKey: string },
) {
  const original = await findAccountingSourcePosting(tx, input.financialYearId, input.sourceType, input.sourceId);
  if (!original) throw new FinanceError("A anulação exige a postagem contábil original do fato financeiro.");
  if (original.reversedBy) return original.reversedBy;
  return postAccountingTransactionInTransaction(tx, actor, {
    financialYearId: input.financialYearId,
    date: input.date,
    history: input.history,
    governmentEntityId: original.governmentEntityId ?? undefined,
    budgetUnitId: original.budgetUnitId ?? undefined,
    lines: original.entries.map((entry) => ({
      originalEntryId: entry.id,
      accountId: entry.accountId,
      type: entry.type === "Débito" ? "Crédito" : "Débito",
      value: requiredDecimal(entry.valueDecimal, "AccountingEntry.valueDecimal"),
    })),
    sourceModule: "FINANCEIRO",
    sourceType: `${input.sourceType}_REVERSAL`,
    sourceId: input.sourceId,
    eventType: input.eventType,
    idempotencyKey: input.idempotencyKey,
    reversalOfId: original.id,
  });
}

export async function postAccountingEvent(
  db: DatabaseConnection,
  actor: FinanceActor,
  input: AccountingEventInput,
) {
  return withDatabaseTransaction(db, tx => postAccountingEventInTransaction(tx, actor, input));
}

export async function postAccountingEventInTransaction(
  tx: DatabaseTransaction,
  actor: FinanceActor,
  input: AccountingEventInput,
) {
  const value = accountingAmount(input.value);
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`ACCOUNTING_RULE:${input.eventCode}`}, 0))::text`);
  const event = await readAccountingEventRules(tx, input.eventCode);
  if (!event?.isActive || event.rules.length !== 1) throw new FinanceError("O evento contabil deve possuir exatamente uma regra ativa antes da postagem.");
  const rule = event.rules[0];
  if (rule.isReference && process.env.CELERIFLOW_ACCOUNTING_MODE !== "POC") {
    throw new FinanceError("A regra contabil de referencia so pode ser usada no modo POC. Configure a matriz PCASP homologada para este ambiente.");
  }
  const lines: AccountingLine[] = [
    { accountId: input.debitAccountId ?? rule.debitAccountId, type: "Débito", value },
    { accountId: input.creditAccountId ?? rule.creditAccountId, type: "Crédito", value },
  ];
  let payment: Awaited<ReturnType<typeof readAccountingPaymentBasis>> = null;
  let bankAccountId: string | null = null;
  if (rule.components.some(component => component.valueBasis !== "EVENT_VALUE" || component.creditFromOriginBank)) {
    if (input.sourceModule !== "FINANCEIRO" || input.sourceType !== "PAYMENT" || !input.sourceId || !["PAGAMENTO_EFETIVADO", "RAP_PROCESSADO_PAGAMENTO", "RAP_NAO_PROCESSADO_PAGAMENTO"].includes(input.eventCode)) throw new FinanceError("Bases de pagamento e banco de origem exigem pagamento financeiro canônico.");
    payment = await readAccountingPaymentBasis(tx, input.sourceId);
    if (!payment) throw new FinanceError("Pagamento financeiro não encontrado.");
    const expectedEvent = payment.payableType ? payment.payableType === "NAO_PROCESSADO" ? "RAP_NAO_PROCESSADO_PAGAMENTO" : "RAP_PROCESSADO_PAGAMENTO" : "PAGAMENTO_EFETIVADO";
    if (input.financialYearId !== (payment.executionFinancialYearId ?? payment.financialYearId) || input.eventCode !== expectedEvent) throw new FinanceError("Evento e exercício contábil devem corresponder à execução do pagamento.");
    if (!payment.valueDecimal || !payment.netValueDecimal) throw new FinanceError("Pagamento sem valores Decimal conciliados.");
    const gross = payment.valueDecimal;
    const net = payment.netValueDecimal;
    if (payment.status !== "Paga" || payment.date.getTime() !== input.date.getTime() || !gross.eq(value) || net.lt(0) || net.gt(gross)) throw new FinanceError("A composição contábil diverge do pagamento confirmado.");
    bankAccountId = payment.accountingPlanId;
    if (rule.components.some(component => component.creditFromOriginBank) && !bankAccountId) throw new FinanceError("Banco de origem sem conta contábil conciliada.");
  }
  for (const component of rule.components) {
    if (!["EVENT_VALUE", "PAYMENT_NET", "PAYMENT_RETENTION"].includes(component.valueBasis)) throw new FinanceError("Base de composição contábil inválida.");
    const componentValue = component.valueBasis === "EVENT_VALUE" ? value
      : component.valueBasis === "PAYMENT_NET" ? payment!.netValueDecimal!
      : value.minus(payment!.netValueDecimal!);
    if (componentValue.isZero()) continue;
    const creditAccountId = component.creditFromOriginBank ? bankAccountId! : component.creditAccountId;
    if (component.debitAccountId === creditAccountId) throw new FinanceError("A composição contábil exige contas de débito e crédito distintas.");
    lines.push({ accountId: component.debitAccountId, type: "Débito", value: componentValue }, { accountId: creditAccountId, type: "Crédito", value: componentValue });
  }
  return postAccountingTransactionInTransaction(tx, actor, {
    financialYearId: input.financialYearId,
    governmentEntityId: input.governmentEntityId,
    budgetUnitId: input.budgetUnitId,
    date: input.date,
    history: input.history,
    lines,
    sourceModule: input.sourceModule,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    eventType: event.code,
    idempotencyKey: input.idempotencyKey,
  });
}

export async function configureAccountingPostingRule(
  db: DatabaseConnection,
  actor: FinanceActor,
  input: { eventCode: string; eventName: string; debitAccountId: string; creditAccountId: string; description?: string; isReference?: boolean; components?: AccountingComponentInput[] },
) {
  if (!input.eventCode.trim() || !input.eventName.trim()) throw new FinanceError("Codigo e nome do evento contabil sao obrigatorios.");
  if (input.debitAccountId === input.creditAccountId) throw new FinanceError("A regra contabil exige contas de debito e credito diferentes.");
  if (input.components && (input.components.length > 20 || input.components.some(component => !component.debitAccountId || !component.creditAccountId || component.debitAccountId === component.creditAccountId || !["EVENT_VALUE", "PAYMENT_NET", "PAYMENT_RETENTION"].includes(component.valueBasis)))) throw new FinanceError("Composição contábil inválida; informe até vinte pares distintos com bases válidas.");
  const componentKeys = (input.components ?? []).map(component => JSON.stringify([component.debitAccountId, component.creditAccountId, component.valueBasis, component.creditFromOriginBank ?? false]));
  if (new Set(componentKeys).size !== componentKeys.length) throw new FinanceError("A composição contábil não pode repetir o mesmo par e base de valor.");
  if (input.components?.some(component => component.debitAccountId === input.debitAccountId && component.creditAccountId === input.creditAccountId && component.valueBasis === "EVENT_VALUE" && !component.creditFromOriginBank)) throw new FinanceError("O par complementar não pode duplicar a partida principal.");
  if (input.components?.some(component => component.valueBasis !== "EVENT_VALUE" || component.creditFromOriginBank) && !["PAGAMENTO_EFETIVADO", "RAP_PROCESSADO_PAGAMENTO", "RAP_NAO_PROCESSADO_PAGAMENTO"].includes(input.eventCode.trim())) throw new FinanceError("Bases de pagamento são exclusivas do evento de pagamento efetivado.");
  return withDatabaseTransaction(db, async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`ACCOUNTING_RULE:${input.eventCode.trim()}`}, 0))::text`);
    const accountIds = [...new Set([input.debitAccountId, input.creditAccountId, ...(input.components ?? []).flatMap(component => [component.debitAccountId, component.creditAccountId])])];
    const accounts = await listAccountingPlans(tx, accountIds);
    if (accounts.length !== accountIds.length) throw new FinanceError("As contas da regra contabil nao foram encontradas.");
    const event = await upsertAccountingEvent(tx, { code: input.eventCode.trim(), name: input.eventName.trim(), description: input.description?.trim() || undefined });
    const { rule, replaced } = await replaceAccountingRule(tx, { eventId: event.id, debitAccountId: input.debitAccountId, creditAccountId: input.creditAccountId, description: input.description?.trim() || undefined, isReference: input.isReference ?? false });
    const previousComponents = await listAccountingRuleComponents(tx, rule.id);
    if (input.components !== undefined) {
      await replaceAccountingRuleComponents(tx, rule.id, input.components);
    }
    await insertAccountingAudit(tx, actor, { action: "UPSERT", entityType: "AccountingPostingRule", entityId: rule.id, payload: JSON.parse(JSON.stringify({ eventCode: event.code, debitAccountId: rule.debitAccountId, creditAccountId: rule.creditAccountId, isReference: rule.isReference, replacedRuleIds: replaced.map(previous => previous.id), previousComponents, components: input.components ?? previousComponents })) as JsonValue });
    return rule;
  });
}

export async function accountingTrialBalance(tx: DatabaseExecutor, financialYearId: string, throughDate?: Date, budgetUnitIds?: string[]) {
  const entries = await listTrialBalanceEntries(tx, financialYearId, throughDate, budgetUnitIds);
  return Object.values(entries.reduce<Record<string, { account: typeof entries[number]["account"]; debit: Decimal; credit: Decimal; balance: Decimal }>>((result, entry) => {
    const current = result[entry.accountId] ?? { account: entry.account, debit: new Decimal(0), credit: new Decimal(0), balance: new Decimal(0) };
    const value = entry.valueDecimal;
    if (!value) throw new FinanceError("O campo Decimal AccountingEntry.valueDecimal ainda não foi conciliado. Execute o backfill financeiro antes de movimentar a dotação.");
    if (entry.type === "Débito") current.debit = current.debit.plus(value);
    else current.credit = current.credit.plus(value);
    current.balance = current.debit.minus(current.credit);
    result[entry.accountId] = current;
    return result;
  }, {}));
}

export async function accountingPendingChecks(tx: DatabaseExecutor, financialYearId: string, competence: Date) {
  const monthStart = accountingMonth(competence);
  const nextMonth = new Date(monthStart);
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  const year = await findFinancialScopeYear(tx, financialYearId);
  if (!year) throw new FinanceError("Exercicio financeiro nao encontrado.");
  const preparedPrograms = await preparedAnnualPaymentProgramIds(tx, financialYearId);
  return readAccountingPendingCounts(tx, financialYearId, year, nextMonth, preparedPrograms);
}

export async function closeAccountingMonth(db: DatabaseConnection, actor: FinanceActor, financialYearId: string, competence: Date) {
  return requestAccountingMonthClose(db, actor, financialYearId, competence);
}

export async function requestAccountingMonthClose(db: DatabaseConnection, actor: FinanceActor, financialYearId: string, competence: Date) {
  return withDatabaseTransaction(db, async (tx) => {
    await assertAccountingYearScope(tx, actor, financialYearId);
    await lockAccountingPeriod(tx, financialYearId, competence);
    const year = await findFinancialScopeYear(tx, financialYearId);
    if (!year || !["Aberto", "Em Encerramento"].includes(year.status)) throw new FinanceError("O exercicio nao esta disponivel para fechamento contabil.");
    const month = accountingMonth(competence);
    if (month < accountingMonth(year.startDate) || month > accountingMonth(year.endDate)) throw new FinanceError("A competencia nao pertence ao exercicio financeiro.");
    const pending = await accountingPendingChecks(tx, financialYearId, month);
    if (pending.total) throw new FinanceError("O fechamento mensal foi bloqueado por pendencias de contabilizacao, pagamentos ou conciliacao.");
    const existing = await findAccountingMonth(tx, financialYearId, month);
    if (existing && existing.status !== "ABERTO") throw new FinanceError("A competencia ja possui um fechamento ou uma solicitacao pendente.");
    const close = existing ?? await insertAccountingMonthClose(tx, { financialYearId, competence: month, status: "PENDENTE_FECHAMENTO", pendingSummary: pending });
    if (existing) await updateAccountingMonthClose(tx, close.id, { status: "PENDENTE_FECHAMENTO", pendingSummary: pending });
    await insertAccountingCloseEvent(tx, { monthlyAccountingCloseId: close.id, action: "CLOSE_REQUESTED", pendingSummary: pending, requestedByUsuarioId: actor.usuarioId });
    await insertAccountingAudit(tx, actor, { action: "REQUEST_CLOSE", entityType: "MonthlyAccountingClose", entityId: close.id, payload: pending, financialYearId });
    return close;
  });
}

export async function authorizeAccountingMonthClose(db: DatabaseConnection, actor: FinanceActor, financialYearId: string, competence: Date) {
  return withDatabaseTransaction(db, async (tx) => {
    await assertAccountingYearScope(tx, actor, financialYearId);
    await lockAccountingPeriod(tx, financialYearId, competence);
    const month = accountingMonth(competence);
    const close = await findAccountingMonth(tx, financialYearId, month);
    if (!close || close.status !== "PENDENTE_FECHAMENTO") throw new FinanceError("Nao ha solicitacao de fechamento mensal pendente para esta competencia.");
    const request = await findLatestAccountingCloseEvent(tx, close.id, "CLOSE_REQUESTED");
    if (!request) throw new FinanceError("A solicitacao de fechamento mensal nao possui evidencia valida.");
    if (request.requestedByUsuarioId === actor.usuarioId) throw new FinanceError("Segregacao de funcoes: o solicitante nao pode autorizar o proprio fechamento.");
    const year = await findFinancialScopeYear(tx, financialYearId);
    if (!year || !["Aberto", "Em Encerramento"].includes(year.status)) throw new FinanceError("O exercicio nao esta disponivel para fechamento contabil.");
    const pending = await accountingPendingChecks(tx, financialYearId, month);
    if (pending.total) throw new FinanceError("A autorizacao do fechamento mensal foi bloqueada por novas pendencias.");
    const closedAt = new Date();
    const updated = await updateAccountingMonthClose(tx, close.id, {
        status: "FECHADO",
        pendingSummary: pending,
        // The close row keeps its original closure identity; later cycles are immutable events below.
        closedByUsuarioId: close.closedByUsuarioId ?? actor.usuarioId,
        closedByEmployeeId: close.closedByEmployeeId ?? actor.employeeId,
        closedAt: close.closedAt ?? closedAt,
    });
    const closureEvidence = { closedByUsuarioId: actor.usuarioId, closedByEmployeeId: actor.employeeId, closedAt: closedAt.toISOString() };
    await insertAccountingCloseEvent(tx, { monthlyAccountingCloseId: close.id, action: "CLOSE_AUTHORIZED", pendingSummary: pending, closureEvidence: JSON.parse(JSON.stringify(closureEvidence)) as JsonValue, requestedByUsuarioId: request.requestedByUsuarioId, authorizedByUsuarioId: actor.usuarioId, authorizedAt: closedAt });
    await insertAccountingAudit(tx, actor, { action: "AUTHORIZE_CLOSE", entityType: "MonthlyAccountingClose", entityId: close.id, payload: { ...pending, requestedByUsuarioId: request.requestedByUsuarioId }, financialYearId });
    return updated;
  });
}

export async function requestAccountingMonthReopen(db: DatabaseConnection, actor: FinanceActor, financialYearId: string, competence: Date, justification: string) {
  if (!justification.trim()) throw new FinanceError("A justificativa para reabertura mensal e obrigatoria.");
  return withDatabaseTransaction(db, async (tx) => {
    await assertAccountingYearScope(tx, actor, financialYearId);
    await lockAccountingPeriod(tx, financialYearId, competence);
    const year = await findFinancialScopeYear(tx, financialYearId);
    if (!year || !["Aberto", "Em Encerramento"].includes(year.status)) throw new FinanceError("O exercicio nao esta disponivel para reabertura contabil.");
    const month = accountingMonth(competence);
    const close = await findAccountingMonth(tx, financialYearId, month);
    if (!close || close.status !== "FECHADO") throw new FinanceError("Somente uma competencia atualmente fechada pode ser reaberta.");
    const latestClosure = await findLatestAccountingCloseEvent(tx, close.id, "CLOSE_AUTHORIZED");
    const closureEvidence: JsonValue = latestClosure?.closureEvidence ?? JSON.parse(JSON.stringify({ closedByUsuarioId: close.closedByUsuarioId, closedByEmployeeId: close.closedByEmployeeId, closedAt: close.closedAt?.toISOString() }));
    await updateAccountingMonthClose(tx, close.id, { status: "PENDENTE_REABERTURA" });
    await insertAccountingCloseEvent(tx, { monthlyAccountingCloseId: close.id, action: "REOPEN_REQUESTED", justification: justification.trim(), closureEvidence, requestedByUsuarioId: actor.usuarioId });
    await insertAccountingAudit(tx, actor, { action: "REQUEST_REOPEN", entityType: "MonthlyAccountingClose", entityId: close.id, payload: { justification: justification.trim(), closureEvidence }, financialYearId });
    return close;
  });
}

export async function authorizeAccountingMonthReopen(db: DatabaseConnection, actor: FinanceActor, financialYearId: string, competence: Date) {
  return withDatabaseTransaction(db, async (tx) => {
    await assertAccountingYearScope(tx, actor, financialYearId);
    await lockAccountingPeriod(tx, financialYearId, competence);
    const month = accountingMonth(competence);
    const close = await findAccountingMonth(tx, financialYearId, month);
    if (!close || close.status !== "PENDENTE_REABERTURA") throw new FinanceError("Nao ha solicitacao de reabertura mensal pendente para esta competencia.");
    const request = await findLatestAccountingCloseEvent(tx, close.id, "REOPEN_REQUESTED");
    if (!request) throw new FinanceError("A solicitacao de reabertura mensal nao possui evidencia valida.");
    if (request.requestedByUsuarioId === actor.usuarioId) throw new FinanceError("Segregacao de funcoes: o solicitante nao pode autorizar a propria reabertura.");
    const year = await findFinancialScopeYear(tx, financialYearId);
    if (!year || !["Aberto", "Em Encerramento"].includes(year.status)) throw new FinanceError("O exercicio nao esta disponivel para reabertura contabil.");
    const authorizedAt = new Date();
    const updated = await updateAccountingMonthClose(tx, close.id, { status: "ABERTO" });
    await insertAccountingCloseEvent(tx, { monthlyAccountingCloseId: close.id, action: "REOPEN_AUTHORIZED", justification: request.justification, closureEvidence: request.closureEvidence ?? undefined, requestedByUsuarioId: request.requestedByUsuarioId, authorizedByUsuarioId: actor.usuarioId, authorizedAt });
    await insertAccountingAudit(tx, actor, { action: "AUTHORIZE_REOPEN", entityType: "MonthlyAccountingClose", entityId: close.id, payload: { justification: request.justification, requestedByUsuarioId: request.requestedByUsuarioId }, financialYearId });
    return updated;
  });
}

async function lockAccountingYearPeriods(tx: DatabaseTransaction, actor: FinanceActor, financialYearId: string) {
  await assertAccountingYearScope(tx, actor, financialYearId);
  const origin = await findFinancialScopeYear(tx, financialYearId);
  if (!origin) throw new FinanceError("Exercício financeiro não encontrado.");
  // Shared with every posting and monthly close/reopen, in stable calendar order.
  for (let month = 0; month < 12; month++) await lockAccountingPeriod(tx, financialYearId, new Date(Date.UTC(origin.year, month, 1)));
  await tx.execute(sql`SELECT id FROM "FinancialYear" WHERE id = ${financialYearId} FOR UPDATE`);
  const year = await findFinancialScopeYear(tx, financialYearId);
  if (!year) throw new FinanceError("Exercício financeiro não encontrado.");
  return year;
}

export async function prepareAnnualAccountingClose(db: DatabaseConnection, actor: FinanceActor, financialYearId: string) {
  return withDatabaseTransaction(db, async (tx) => {
    const year = await lockAccountingYearPeriods(tx, actor, financialYearId);
    const closes = await countClosedAccountingMonths(tx, financialYearId);
    if (closes < 12) throw new FinanceError("O encerramento anual exige os doze fechamentos mensais.");
    const pending = await accountingPendingChecks(tx, financialYearId, year.endDate);
    if (pending.total) throw new FinanceError("O encerramento anual possui pendencias operacionais.");
    const consistency = await inspectAnnualConsistency(tx, actor, financialYearId);
    if (consistency.counts.errors) throw new FinanceError(`O encerramento anual possui ${consistency.counts.errors} inconsistências. Emita o relatório de conferência pré-encerramento.`);
    const registrationSummary = await reconcileAnnualPayableRegistrations(tx, actor, financialYearId, "Apuração individual de RAP na preparação do encerramento anual.");
    const payableCandidates = (await listAnnualCommitments(tx, financialYearId, year.endDate)).length;
    const existing = await findAnnualAccountingClose(tx, financialYearId);
    if (existing?.status === "ENCERRADO") throw new FinanceError("O encerramento anual final ja foi concluido.");
    const annual = existing
      ? await updateAnnualAccountingClose(tx, existing.id, { status: "PRONTO_PARA_VALIDACAO", pendingSummary: pending, preparedByUsuarioId: actor.usuarioId, preparedAt: new Date() })
      : await insertAnnualAccountingClose(tx, { financialYearId, status: "PRONTO_PARA_VALIDACAO", pendingSummary: pending, preparedByUsuarioId: actor.usuarioId, preparedAt: new Date() });
    if (year.status === "Aberto") await updateAccountingYearStatus(tx, financialYearId, "Em Encerramento");
    await insertAccountingAudit(tx, actor, { action: "PREPARE_CLOSE", entityType: "AnnualAccountingClose", entityId: annual.id, payload: { ...pending, payableCandidates, registrationSummary, consistencyCounts: consistency.counts }, financialYearId });
    return annual;
  }, { timeoutMs: 60000 });
}

export async function trackPayableCarryForwardPayment(
  db: DatabaseConnection,
  actor: FinanceActor,
  input: { payableCarryForwardId: string; paymentId: string; value: Decimal | string | number },
) {
  const value = money(input.value);
  return withDatabaseTransaction(db, async (tx) => {
    await lockPayment(tx, input.paymentId);
    const paymentOrigin = await findFinancePayment(tx, input.paymentId);
    if (!paymentOrigin) throw new FinanceError("Pagamento não encontrado.");
    await lockCommitment(tx, paymentOrigin.commitmentId);
    await lockPayableCarryForward(tx, input.payableCarryForwardId);
    const record = await readPayable(tx, input.payableCarryForwardId);
    const commitment = await findFinanceCommitment(tx, record.commitmentId);
    if (!commitment) throw new FinanceError("Empenho não encontrado.");
    const { appropriation, movements: _movements, ...commitmentRecord } = commitment;
    void _movements;
    const payable = { ...record, originFinancialYear: await readPayableYear(tx, record.originFinancialYearId), events: (await listPayableEvents(tx, { payableCarryForwardId: record.id, action: "PAGAMENTO_RASTREADO" })).map(event => ({ valueDecimal: event.valueDecimal })), commitment: { ...commitmentRecord, appropriation: { budgetUnitId: appropriation.budgetUnitId } } };
    assertActorBudgetUnit(actor, payable.commitment.appropriation.budgetUnitId);
    await lockPayment(tx, input.paymentId);
    const payment = await findFinancePayment(tx, input.paymentId);
    if (!payment || payment.status !== "Paga") throw new FinanceError("Selecione um pagamento interno já efetivado.");
    if (payment.commitmentId !== payable.commitmentId) throw new FinanceError("O pagamento selecionado não pertence ao empenho do resto a pagar.");
    if (payment.payableCarryForwardId && payment.payableCarryForwardId !== payable.id) throw new FinanceError("Pagamento nativo pertence a outra inscrição de RAP.");
    const paymentTracking = await listPayableEvents(tx, { paymentId: payment.id, action: "PAGAMENTO_RASTREADO" });
    const replay = paymentTracking.find((event) => event.payableCarryForwardId === payable.id);
    if (replay) {
      if (!requiredDecimal(replay.valueDecimal, "PayableCarryForwardEvent.valueDecimal").equals(value)) throw new FinanceError("Pagamento já acompanhado com outro valor neste resto a pagar.");
      return payable;
    }
    if (paymentTracking.length) throw new FinanceError("O pagamento já está vinculado ao acompanhamento de outro resto a pagar.");
    if (!["PENDENTE", "PAGAMENTO_PARCIAL_RASTREADO"].includes(payable.status)) throw new FinanceError("Somente restos a pagar pendentes podem receber acompanhamento de pagamento.");
    if (payment.date <= payable.originFinancialYear.endDate) throw new FinanceError("O pagamento acompanhado deve ser posterior ao exercício de origem do resto a pagar.");
    const paymentValue = requiredDecimal(payment.valueDecimal, "Payment.valueDecimal");
    const alreadyAllocated = paymentTracking.reduce((sum, event) => sum.plus(requiredDecimal(event.valueDecimal, "PayableCarryForwardEvent.valueDecimal")), new Decimal(0));
    if (alreadyAllocated.plus(value).greaterThan(paymentValue)) throw new FinanceError("Os acompanhamentos acumulados não podem exceder o valor bruto do pagamento.");
    const tracked = await carryForwardAllocatedValue(tx, payable.id);
    if (tracked.plus(value).greaterThan(payable.valueDecimal)) throw new FinanceError("O valor acompanhado excede o saldo inscrito do resto a pagar.");
    const status = tracked.plus(value).equals(payable.valueDecimal) ? "PAGO_RASTREADO" : "PAGAMENTO_PARCIAL_RASTREADO";
    await insertPayableEvent(tx, { payableCarryForwardId: payable.id, action: "PAGAMENTO_RASTREADO", paymentId: payment.id, valueDecimal: value, actorUsuarioId: actor.usuarioId });
    const updated = await setPayableStatus(tx, payable.id, status);
    await audit(tx, actor, "TRACK_PAYMENT", "PayableCarryForward", payable.id, { paymentId: payment.id, value: jsonMoney(value), status }, payable.financialYearId, payable.commitment.appropriation.budgetUnitId);
    return updated;
  });
}

export async function cancelPayableCarryForward(
  db: DatabaseConnection,
  actor: FinanceActor,
  input: { payableCarryForwardId: string; justification: string },
) {
  if (!input.justification.trim()) throw new FinanceError("A justificativa do cancelamento do resto a pagar é obrigatória.");
  return withDatabaseTransaction(db, async (tx) => {
    await lockPayableCarryForward(tx, input.payableCarryForwardId);
    const payable = await readPayable(tx, input.payableCarryForwardId);
    const origin = await readPayableOrigin(tx, payable.commitmentId);
    assertActorBudgetUnit(actor, origin.budgetUnitId);
    if (!["PENDENTE", "PAGAMENTO_PARCIAL_RASTREADO"].includes(payable.status)) throw new FinanceError("Somente restos a pagar pendentes podem ser cancelados neste acompanhamento interno.");
    if ((await listPayableActivePayments(tx, payable.id)).length) throw new FinanceError("Cancele ou estorne as ordens nativas antes de cancelar a inscrição de RAP.");
    if (await hasPayableNativeSettlements(tx, payable.id)) throw new FinanceError("Cancele as liquidações nativas antes de cancelar a inscrição de RAP.");
    if ((await listPayableSettlementLinks(tx, payable.id, true)).length) throw new FinanceError("Desmovimente o transporte antes de cancelar uma inscrição com liquidações herdadas.");
    const justification = input.justification.trim();
    await insertPayableEvent(tx, { payableCarryForwardId: payable.id, action: "CANCELAMENTO_REGISTRADO", justification, actorUsuarioId: actor.usuarioId });
    const updated = await setPayableStatus(tx, payable.id, "CANCELADO");
    await audit(tx, actor, "CANCEL", "PayableCarryForward", payable.id, { previousStatus: payable.status, justification }, payable.financialYearId, origin.budgetUnitId);
    return updated;
  });
}

export async function reregisterPayableCarryForward(
  db: DatabaseConnection,
  actor: FinanceActor,
  input: { payableCarryForwardId: string; targetFinancialYearId: string; justification: string },
) {
  if (!input.justification.trim()) throw new FinanceError("A justificativa da reinscrição do resto a pagar é obrigatória.");
  return withDatabaseTransaction(db, async (tx) => {
    await lockPayableCarryForward(tx, input.payableCarryForwardId);
    const payable = await readPayable(tx, input.payableCarryForwardId);
    const [financialYear, origin, successorPayableCarryForward, events] = await Promise.all([readPayableYear(tx, payable.financialYearId), readPayableOrigin(tx, payable.commitmentId), findPayableSuccessor(tx, payable.id), listPayableEvents(tx, { payableCarryForwardId: payable.id, action: "PAGAMENTO_RASTREADO" })]);
    assertActorBudgetUnit(actor, origin.budgetUnitId);
    if (payable.status !== "PENDENTE") throw new FinanceError("A reinscrição exige um resto a pagar ainda pendente e sem acompanhamento de pagamento.");
    if ((await listPayableActivePayments(tx, payable.id)).length) throw new FinanceError("Cancele ou estorne as ordens nativas antes de reinscrever o RAP.");
    if (await hasPayableNativeSettlements(tx, payable.id)) throw new FinanceError("Cancele as liquidações nativas antes de reinscrever o RAP.");
    if ((await listPayableSettlementLinks(tx, payable.id, true)).length) throw new FinanceError("Use o transporte anual nativo para reinscrever RAP com liquidações herdadas.");
    if (events.length) throw new FinanceError("Não é possível reinscrever um resto a pagar que já possui pagamento acompanhado.");
    if (successorPayableCarryForward) throw new FinanceError("Este resto a pagar já possui reinscrição registrada.");
    const targetYear = await findFinancialScopeYear(tx, input.targetFinancialYearId);
    if (!targetYear || targetYear.status !== OPEN_STATUS) throw new FinanceError("O exercício de destino deve existir e estar aberto para reinscrição interna.");
    if (!origin.governmentEntityId || targetYear.governmentEntityId !== origin.governmentEntityId || financialYear.governmentEntityId !== origin.governmentEntityId) throw new FinanceError("Reinscrição exige exercícios da mesma entidade da UG de origem.");
    if (targetYear.id === payable.financialYearId || targetYear.year <= financialYear.year) throw new FinanceError("A reinscrição deve apontar para um exercício posterior.");
    const existingTarget = await findPayableRegistration(tx, targetYear.id, payable.commitmentId, payable.type);
    if (existingTarget) throw new FinanceError("Já existe um resto a pagar do mesmo tipo para este empenho no exercício de destino.");
    const justification = input.justification.trim();
    const successor = await insertPayable(tx, {
        financialYearId: targetYear.id,
        originFinancialYearId: payable.originFinancialYearId,
        commitmentId: payable.commitmentId,
        previousPayableCarryForwardId: payable.id,
        valueDecimal: payable.valueDecimal,
        type: payable.type,
        notes: `Reinscrição interna do RAP ${payable.id}.`,
    });
    await insertPayableEvent(tx, { payableCarryForwardId: successor.id, action: "REINSCRICAO_RECEBIDA", justification, actorUsuarioId: actor.usuarioId, valueDecimal: payable.valueDecimal });
    await insertPayableEvent(tx, { payableCarryForwardId: payable.id, action: "REINSCRICAO_REGISTRADA", justification, actorUsuarioId: actor.usuarioId, valueDecimal: payable.valueDecimal });
    await setPayableStatus(tx, payable.id, "REINSCRITO");
    const payload = { targetPayableCarryForwardId: successor.id, targetFinancialYearId: targetYear.id, justification, value: jsonMoney(payable.valueDecimal) };
    await audit(tx, actor, "REREGISTER", "PayableCarryForward", payable.id, payload, payable.financialYearId, origin.budgetUnitId);
    await audit(tx, actor, "REREGISTER", "PayableCarryForward", successor.id, { ...payload, sourcePayableCarryForwardId: payable.id }, targetYear.id, origin.budgetUnitId);
    return successor;
  });
}

export async function finalizeAnnualAccountingClose(db: DatabaseConnection, actor: FinanceActor, financialYearId: string) {
  return withDatabaseTransaction(db, async (tx) => {
    const year = await lockAccountingYearPeriods(tx, actor, financialYearId);
    if (!year || year.status !== "Em Encerramento") throw new FinanceError("O exercicio deve estar em encerramento para o fechamento anual final.");
    const closedMonths = await countClosedAccountingMonths(tx, financialYearId);
    if (closedMonths !== 12) throw new FinanceError("O encerramento anual final exige doze competencias atualmente fechadas.");
    const pending = await accountingPendingChecks(tx, financialYearId, year.endDate);
    if (pending.total) throw new FinanceError("O encerramento anual final possui pendencias operacionais.");
    const annual = await findAnnualAccountingClose(tx, financialYearId);
    if (!annual || annual.status !== "PRONTO_PARA_VALIDACAO") throw new FinanceError("Prepare o encerramento anual antes da validacao final.");
    if (annual.preparedByUsuarioId === actor.usuarioId) throw new FinanceError("Segregacao de funcoes: quem preparou o encerramento anual nao pode conclui-lo.");
    const consistency = await inspectAnnualConsistency(tx, actor, financialYearId);
    if (consistency.counts.errors) throw new FinanceError(`A validação anual possui ${consistency.counts.errors} inconsistências. Emita o relatório de conferência pré-encerramento.`);
     try { await assertAnnualPayableRegistrations(tx, financialYearId); }
     catch (error) { throw new FinanceError(error instanceof Error ? error.message : "Inscrições anuais de RAP não conciliadas."); }
     try { await assertAnnualRapPostings(tx, financialYearId); }
     catch (error) { throw new FinanceError(error instanceof Error ? error.message : "Partidas de inscrição RAP não conciliadas."); }
     try { await assertAnnualResultCleared(tx, financialYearId); }
     catch (error) { throw new FinanceError(error instanceof Error ? error.message : "Resultado anual não conciliado."); }
     try { await assertAnnualBudgetCleared(tx, financialYearId); }
     catch (error) { throw new FinanceError(error instanceof Error ? error.message : "Encerramento orçamentário não conciliado."); }
    const closedAt = new Date();
    const updated = await updateAnnualAccountingClose(tx, annual.id, { status: "ENCERRADO", pendingSummary: pending, closedByUsuarioId: actor.usuarioId, closedByEmployeeId: actor.employeeId, closedAt });
    await updateAccountingYearStatus(tx, financialYearId, "Encerrado");
    await insertAccountingAudit(tx, actor, { action: "FINAL_CLOSE", entityType: "AnnualAccountingClose", entityId: updated.id, payload: { ...pending, closedMonths, closedAt: closedAt.toISOString() }, financialYearId });
    await insertAccountingAudit(tx, actor, { action: "STATUS_CHANGE", entityType: "FinancialYear", entityId: financialYearId, payload: { previousStatus: year.status, status: "Encerrado", annualAccountingCloseId: updated.id }, financialYearId });
    return updated;
  }, { timeoutMs: 60000 });
}

// -----------------------------------------------------------------------------
// Fechamento Financeiro Diário por Conta Bancária e Fonte de Recursos
// -----------------------------------------------------------------------------
export async function closeDailyTreasuryByAccountAndSource(
  db: DatabaseConnection,
  actor: FinanceActor,
  input: {
    bankAccountId: string;
    resourceSourceId?: string;
    date: Date;
    justification?: string;
  },
) {
  const dateObj = new Date(input.date);
  if (Number.isNaN(dateObj.getTime())) throw new FinanceError("Data de fechamento financeiro inválida.");

  const startOfDay = new Date(Date.UTC(dateObj.getUTCFullYear(), dateObj.getUTCMonth(), dateObj.getUTCDate(), 0, 0, 0));
  const endOfDay = new Date(Date.UTC(dateObj.getUTCFullYear(), dateObj.getUTCMonth(), dateObj.getUTCDate(), 23, 59, 59, 999));

  return withDatabaseTransaction(db, async (tx) => {
    await lockBankAccount(tx, input.bankAccountId);
    const account = await findFinanceBankAccount(tx, input.bankAccountId);
    if (!account) throw new FinanceError("Conta bancária não encontrada.");
    assertActorCanAccessBankAccount(actor, account.budgetUnitId);

    const resourceSourceId = await assertBankResourceSource(tx, account.id, input.resourceSourceId ?? account.resourceSourceId);
    const openingBalance = await getBankResourceSourceBalance(tx, account.id, resourceSourceId, new Date(startOfDay.getTime() - 1));
    const closingBalance = await getBankResourceSourceBalance(tx, account.id, resourceSourceId, endOfDay);

    // Movimentos de tesouraria do dia
    const movements = await listTreasuryPeriodMovements(tx, { bankAccountId: account.id, resourceSourceId, start: startOfDay, end: endOfDay });

    const totalEntries = movements
      .filter((m) => signedValue(m.direction, m.valueDecimal).isPositive())
      .reduce((sum, m) => sum.plus(m.valueDecimal), new Decimal(0));

    const totalExits = movements
      .filter((m) => signedValue(m.direction, m.valueDecimal).isNegative())
      .reduce((sum, m) => sum.plus(m.valueDecimal), new Decimal(0));

    const redistributions = await listBankSourceRedistributions(tx, account.id, resourceSourceId, startOfDay, endOfDay);
    const redistributionIn = redistributions.filter(row => row.sourceResourceSourceId !== resourceSourceId).reduce((sum, row) => sum.plus(row.valueDecimal), new Decimal(0));
    const redistributionOut = redistributions.filter(row => row.sourceResourceSourceId === resourceSourceId).reduce((sum, row) => sum.plus(row.valueDecimal), new Decimal(0));

    const accountName = `${account.bankName} (${account.accountType}) - Ag ${account.agency} C/C ${account.accountNumber}`;

    const payload = {
      bankAccountId: account.id,
      resourceSourceId,
      bankAccountName: accountName,
      date: startOfDay.toISOString(),
      openingBalance: jsonMoney(openingBalance),
      totalEntries: jsonMoney(totalEntries),
      totalExits: jsonMoney(totalExits),
      closingBalance: jsonMoney(closingBalance),
      redistributionIn: jsonMoney(redistributionIn),
      redistributionOut: jsonMoney(redistributionOut),
      justification: input.justification?.trim() || "Fechamento tesouraria diário ok",
    };

    await audit(tx, actor, "DAILY_TREASURY_CLOSE", "BankAccount", account.id, payload);

    return {
      bankAccountId: account.id,
      bankAccountName: accountName,
      date: startOfDay.toISOString().substring(0, 10),
      openingBalance: Number(openingBalance),
      totalEntries: Number(totalEntries),
      totalExits: Number(totalExits),
      closingBalance: Number(closingBalance),
      status: "FECHADO",
    };
  });
}

// -----------------------------------------------------------------------------
// Extrato Bancário Diário / Mensal Completo de Tesouraria
// -----------------------------------------------------------------------------
export async function generateTreasuryBankStatement(
  db: DatabaseExecutor,
  input: {
    bankAccountId: string;
    startDate: Date;
    endDate: Date;
  },
) {
  if (Number.isNaN(input.startDate.getTime()) || Number.isNaN(input.endDate.getTime()) || input.startDate > input.endDate) throw new FinanceError("Informe um período válido para o extrato bancário.");
  const account = await findFinanceBankAccount(db, input.bankAccountId);
  if (!account) throw new FinanceError("Conta bancária não encontrada.");

  const accountName = `${account.bankName} (${account.accountType})`;

  const movements = await listTreasuryPeriodMovements(db, { bankAccountId: account.id, start: input.startDate, end: input.endDate });
  const priorMovements = await listTreasuryPeriodMovements(db, { bankAccountId: account.id, before: input.startDate });
  const openingBalance = priorMovements.reduce((sum, m) => sum.plus(signedValue(m.direction, m.valueDecimal)), new Decimal(0));

  let runningBalance = openingBalance;

  const statementItems = movements.map((m) => {
    const isEntry = ["Entrada", "ENTRADA", "CREDIT"].includes(m.direction);
    const value = requiredDecimal(m.valueDecimal, "TreasuryMovement.valueDecimal");
    runningBalance = runningBalance.plus(signedValue(m.direction, value));

    return {
      id: m.id,
      date: m.date.toISOString().substring(0, 10),
      type: m.type,
      history: m.history || "Movimento de Tesouraria",
      direction: isEntry ? ("ENTRADA" as const) : ("SAIDA" as const),
      value: value.toNumber(),
      runningBalance: runningBalance.toNumber(),
    };
  });

  return {
    bankAccountId: account.id,
    bankAccountName: accountName,
    bankAgencyAccount: `${account.agency}/${account.accountNumber}`,
    startDate: input.startDate.toISOString().substring(0, 10),
    endDate: input.endDate.toISOString().substring(0, 10),
    openingBalance: openingBalance.toNumber(),
    closingBalance: runningBalance.toNumber(),
    statementItems,
  };
}

// -----------------------------------------------------------------------------
// Demonstrativo de Conciliação Bancária MCASP (Itens a Regularizar & Ajustes)
// -----------------------------------------------------------------------------
export async function generateBankReconciliationReport(
  db: DatabaseExecutor,
  input: {
    bankAccountId: string;
    referenceDate: Date;
  },
) {
  const account = await findFinanceBankAccount(db, input.bankAccountId);
  if (!account) throw new FinanceError("Conta bancária não encontrada.");
  const latestReconciliation = await findConfirmedReconciliation(db, account.id, input.referenceDate);
  if (!latestReconciliation) {
    throw new FinanceError("Não há conciliação confirmada para informar o saldo do extrato nesta referência.");
  }

  const accountName = `${account.bankName} (${account.accountType})`;

  // Itens do extrato não conciliados (pendentes / regularizações)
  const unconciledStatementItems = await listPendingReconciliationStatements(db, account.id, input.referenceDate);

  // Movimentos de tesouraria não vinculados a extrato (pendentes)
  const unconciledTreasuryMovements = await listUnlinkedReconciliationMovements(db, account.id, input.referenceDate);

  const totalStatementPendingEntries = unconciledStatementItems
    .filter((i) => i.direction === "Entrada")
    .reduce((sum, i) => sum + Number(i.valueDecimal), 0);

  const totalStatementPendingExits = unconciledStatementItems
    .filter((i) => i.direction === "Saída")
    .reduce((sum, i) => sum + Number(i.valueDecimal), 0);

  const totalTreasuryPendingEntries = unconciledTreasuryMovements
    .filter((m) => m.direction === "ENTRADA" || m.direction === "Entrada")
    .reduce((sum, m) => sum + Number(m.valueDecimal), 0);

  const totalTreasuryPendingExits = unconciledTreasuryMovements
    .filter((m) => m.direction === "SAIDA" || m.direction === "Saída")
    .reduce((sum, m) => sum + Number(m.valueDecimal), 0);

  const saldoExtrato = Number(latestReconciliation.bankBalanceDecimal ?? latestReconciliation.bankBalance);
  const saldoRazao = Number(latestReconciliation.systemBalanceDecimal ?? latestReconciliation.systemBalance)
    + totalTreasuryPendingEntries - totalTreasuryPendingExits + totalStatementPendingEntries - totalStatementPendingExits;

  return {
    bankAccountId: account.id,
    bankAccountName: accountName,
    referenceDate: input.referenceDate.toISOString().substring(0, 10),
    saldoExtrato,
    saldoRazao,
    totalStatementPendingEntries,
    totalStatementPendingExits,
    totalTreasuryPendingEntries,
    totalTreasuryPendingExits,
    diferencaJustificada: Math.abs(saldoRazao - saldoExtrato),
    unconciledStatementItems: unconciledStatementItems.map((i) => ({
      id: i.id,
      date: i.date.toISOString().substring(0, 10),
      description: i.description || "Lançamento de extrato a regularizar",
      direction: i.direction,
      value: Number(i.valueDecimal),
    })),
    unconciledTreasuryMovements: unconciledTreasuryMovements.map((m) => ({
      id: m.id,
      date: m.date.toISOString().substring(0, 10),
      history: m.history || "Movimento de tesouraria pendente de extrato",
      direction: m.direction,
      value: Number(m.valueDecimal),
    })),
  };
}
