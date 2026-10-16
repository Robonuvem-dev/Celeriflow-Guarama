import { Prisma, type PrismaClient, type BudgetReservation, type Commitment, type Settlement, type Payment, type Expense } from "@prisma/client";
import { createHash } from "node:crypto";
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

type Db = PrismaClient | Prisma.TransactionClient;

export type FinanceActor = {
  usuarioId: string;
  employeeId: string | null;
  budgetUnitId?: string | null;
  allowedBudgetUnitIds?: string[];
};

export class FinanceError extends Error {}

export type RevenueClassification = "ORCAMENTARIA" | "INTRAORCAMENTARIA" | "REDUTORA";

const OPEN_STATUS = "Aberto";
const ACTIVE_RESERVATION_STATUS = "Ativa";
const ACTIVE_COMMITMENT_STATUSES = ["Emitido", "Liquidado", "Pago"];
const ACTIVE_SETTLEMENT_STATUS = "Liquidado";
const ACTIVE_PAYMENT_STATUSES = ["Emitida", "Paga"];
const AWAITING_ACCOUNTING_PROCESS_STATUS = "Aguardando Contabilidade";
const RELEASED_PROCESS_STATUS = "Recebido";

function money(value: Prisma.Decimal | string | number) {
  const decimal = new Prisma.Decimal(String(value)).toDecimalPlaces(2);
  if (!decimal.isFinite() || decimal.lessThanOrEqualTo(0)) {
    throw new FinanceError("Informe um valor monetário maior que zero.");
  }
  return decimal;
}

function legacyMoney(value: Prisma.Decimal) {
  // Float columns remain only as compatibility mirrors during the Decimal migration.
  return Number(value.toString());
}

function requiredDecimal(value: Prisma.Decimal | null, field: string) {
  if (!value) {
    throw new FinanceError(`O campo Decimal ${field} ainda não foi conciliado. Execute o backfill financeiro antes de movimentar a dotação.`);
  }
  return value;
}

function jsonMoney(value: Prisma.Decimal) {
  return value.toFixed(2);
}

function assertActorBudgetUnit(actor: FinanceActor, unitId: string) {
  if (actor.allowedBudgetUnitIds && !actor.allowedBudgetUnitIds.includes(unitId)) throw new FinanceError("Operação financeira fora das unidades autorizadas.");
}

async function assertAccountingYearScope(tx: Db, actor: FinanceActor, financialYearId: string) {
  if (!actor.allowedBudgetUnitIds) return;
  const year = await tx.financialYear.findUnique({ where: { id: financialYearId }, select: { governmentEntityId: true } });
  if (!year?.governmentEntityId) throw new FinanceError("Fechamento de exercício legado exige escopo conciliado.");
  const units = await tx.planningEntityUnit.findMany({ where: { governmentEntityId: year.governmentEntityId }, select: { budgetUnitId: true } });
  if (!units.length || units.some((unit) => !actor.allowedBudgetUnitIds!.includes(unit.budgetUnitId))) throw new FinanceError("Fechamento ou reabertura exige autorização para todas as UGs da entidade.");
}

async function createFinancialDocument(
  tx: Prisma.TransactionClient,
  actor: FinanceActor,
  data: {
    documentType: "NOTA_DE_EMPENHO" | "NOTA_DE_LIQUIDACAO" | "ORDEM_DE_PAGAMENTO" | "COMPROVANTE_RECOLHIMENTO_RETENCAO";
    number: string;
    title: string;
    snapshot: Prisma.InputJsonValue;
    commitmentId?: string;
    settlementId?: string;
    paymentId?: string;
    withholdingPayableId?: string;
  },
) {
  return tx.financialDocument.create({
    data: {
      ...data,
      generatedByUsuarioId: actor.usuarioId,
    },
  });
}

async function audit(
  tx: Db,
  actor: FinanceActor,
  action: string,
  entityType: string,
  entityId: string,
  payload: Prisma.InputJsonValue,
  financialYearId?: string,
  budgetUnitId?: string,
) {
  await tx.financialAuditLog.create({
    data: {
      action,
      entityType,
      entityId,
      financialYearId,
      budgetUnitId: budgetUnitId || actor.budgetUnitId || undefined,
      payload,
      authorUsuarioId: actor.usuarioId,
      authorEmployeeId: actor.employeeId,
    },
  });
}

export async function assertFinancialYearOpen(tx: Db, financialYearId: string, date: Date) {
  const year = await tx.financialYear.findUnique({ where: { id: financialYearId } });
  if (!year) throw new FinanceError("Exercício financeiro não encontrado.");
  if (year.year !== date.getUTCFullYear()) throw new FinanceError("O exercício financeiro deve corresponder ao ano da data do lançamento.");
  if (year.status !== OPEN_STATUS) throw new FinanceError(`O exercício ${year.year} não está aberto para lançamentos.`);
  if (date < year.startDate || date > year.endDate) {
    throw new FinanceError("A data do lançamento está fora do exercício financeiro da dotação.");
  }
  return year;
}

async function lockAppropriation(tx: Prisma.TransactionClient, appropriationId: string) {
  await lockPlanningBudgetForAppropriation(tx, appropriationId);
  await tx.$queryRaw`SELECT id FROM "BudgetAppropriation" WHERE id = ${appropriationId} FOR UPDATE`;
}

async function lockExpense(tx: Prisma.TransactionClient, expenseId: string) {
  const source = await tx.expense.findUnique({ where: { id: expenseId }, select: { appropriationId: true } });
  if (source) await lockAppropriation(tx, source.appropriationId);
  await tx.$queryRaw`SELECT id FROM "Expense" WHERE id = ${expenseId} FOR UPDATE`;
}

async function lockCommitment(tx: Prisma.TransactionClient, commitmentId: string) {
  const source = await tx.commitment.findUnique({ where: { id: commitmentId }, select: { appropriationId: true } });
  if (source) await lockAppropriation(tx, source.appropriationId);
  await tx.$queryRaw`SELECT id FROM "Commitment" WHERE id = ${commitmentId} FOR UPDATE`;
}

async function lockObrasService(tx: Prisma.TransactionClient, obrasServiceId: string) {
  await tx.$queryRaw`SELECT id FROM "ObrasServico" WHERE id = ${obrasServiceId} FOR UPDATE`;
}

async function lockContract(tx: Prisma.TransactionClient, contractId: string) {
  await tx.$queryRaw`SELECT id FROM "Contract" WHERE id = ${contractId} FOR UPDATE`;
}

async function lockBankAccount(tx: Prisma.TransactionClient, bankAccountId: string) {
  await tx.$queryRaw`SELECT id FROM "BankAccount" WHERE id = ${bankAccountId} FOR UPDATE`;
}

async function lockBankAssignment(tx: Prisma.TransactionClient, bankAccountId: string, nextUnit?: string) {
  const previous = await tx.bankAccount.findUnique({ where: { id: bankAccountId }, select: { budgetUnitId: true } });
  if (!previous) return;
  const [runtime] = await tx.$queryRaw<{ ready: boolean }[]>`SELECT to_regclass('"PlanningEntityUnit"') IS NOT NULL AS ready`;
  if (runtime?.ready) await tx.$queryRaw`SELECT p.id FROM "PlanningInstrument" p JOIN "PlanningEntityUnit" u ON u."governmentEntityId" = p."governmentEntityId" WHERE u."budgetUnitId" = ${previous.budgetUnitId} OR u."budgetUnitId" = ${nextUnit ?? previous.budgetUnitId} ORDER BY p.id FOR UPDATE OF p`;
  await lockBankAccount(tx, bankAccountId);
  const current = await tx.bankAccount.findUniqueOrThrow({ where: { id: bankAccountId }, select: { budgetUnitId: true } });
  if (current.budgetUnitId !== previous.budgetUnitId) throw new FinanceError("A vinculação da conta mudou; refaça a operação com os dados atuais.");
}

async function lockBankStatementItem(tx: Prisma.TransactionClient, statementItemId: string) {
  await tx.$queryRaw`SELECT id FROM "BankStatementItem" WHERE id = ${statementItemId} FOR UPDATE`;
}

async function lockTreasuryMovement(tx: Prisma.TransactionClient, treasuryMovementId: string) {
  await tx.$queryRaw`SELECT id FROM "TreasuryMovement" WHERE id = ${treasuryMovementId} FOR UPDATE`;
}

async function lockWithholdingPayable(tx: Prisma.TransactionClient, payableId: string) {
  await tx.$queryRaw`SELECT id FROM "WithholdingPayable" WHERE id = ${payableId} FOR UPDATE`;
}

async function lockPayment(tx: Prisma.TransactionClient, paymentId: string) {
  const source = await tx.payment.findUnique({ where: { id: paymentId }, select: { commitmentId: true } });
  if (source) await lockCommitment(tx, source.commitmentId);
  await tx.$queryRaw`SELECT id FROM "Payment" WHERE id = ${paymentId} FOR UPDATE`;
}

async function lockRevenue(tx: Prisma.TransactionClient, revenueId: string) {
  const source = await tx.revenue.findUnique({ where: { id: revenueId }, select: { bankAccountId: true, collectionDate: true } });
  if (source?.bankAccountId && source.collectionDate) await lockPlanningRevenueBudget(tx, source.bankAccountId, source.collectionDate);
  await tx.$queryRaw`SELECT id FROM "Revenue" WHERE id = ${revenueId} FOR UPDATE`;
}

async function lockPayableCarryForward(tx: Prisma.TransactionClient, payableCarryForwardId: string) {
  await tx.$queryRaw`SELECT id FROM "PayableCarryForward" WHERE id = ${payableCarryForwardId} FOR UPDATE`;
}

async function lockPaymentWithholdings(tx: Prisma.TransactionClient, paymentId: string) {
  await tx.$queryRaw`
    SELECT wp.id
    FROM "WithholdingPayable" wp
    JOIN "PaymentRetention" r ON wp."retentionId" = r.id
    WHERE r."paymentId" = ${paymentId}
    FOR UPDATE
  `;
}

function commitmentValue(value: Prisma.Decimal | null, movements: { type: string; valueDecimal: Prisma.Decimal }[]) {
  return movements.reduce((total, movement) => {
    if (movement.type === "Reforço") return total.plus(movement.valueDecimal);
    if (movement.type === "Anulação") return total.minus(movement.valueDecimal);
    throw new FinanceError("Movimento de empenho inválido.");
  }, requiredDecimal(value, "Commitment.valueDecimal"));
}

async function contractForCommitment(tx: Prisma.TransactionClient, contractId: string, date: Date, additionalValue: Prisma.Decimal) {
  await lockContract(tx, contractId);
  const [contract, commitments] = await Promise.all([
    tx.contract.findUnique({ where: { id: contractId } }),
    tx.commitment.findMany({
      where: { contractId, status: { in: ACTIVE_COMMITMENT_STATUSES } },
      select: { valueDecimal: true, movements: { select: { type: true, valueDecimal: true } } },
    }),
  ]);
  if (!contract) throw new FinanceError("Contrato informado não encontrado.");
  if (contract.status !== "Vigente" || date < contract.startDate || date > contract.endDate) {
    throw new FinanceError("O contrato informado não está vigente na data do empenho.");
  }

  const committed = commitments.reduce(
    (total, commitment) => total.plus(commitmentValue(commitment.valueDecimal, commitment.movements)),
    new Prisma.Decimal(0),
  );
  const ceiling = new Prisma.Decimal(String(contract.updatedValue));
  if (committed.plus(additionalValue).greaterThan(ceiling)) {
    throw new FinanceError("O lançamento excede o saldo do contrato.");
  }
  return contract;
}

export async function getBudgetAvailability(tx: Db, appropriationId: string) {
  const appropriation = await tx.budgetAppropriation.findUnique({
    where: { id: appropriationId },
    select: { id: true, updatedValueDecimal: true },
  });
  if (!appropriation) throw new FinanceError("Dotação orçamentária não encontrada.");

  const [reservations, commitments] = await Promise.all([
    tx.budgetReservation.findMany({
      where: { appropriationId, status: ACTIVE_RESERVATION_STATUS },
      select: { valueDecimal: true },
    }),
    tx.commitment.findMany({
      where: { appropriationId, status: { in: ACTIVE_COMMITMENT_STATUSES } },
      select: { valueDecimal: true, movements: { select: { type: true, valueDecimal: true } } },
    }),
  ]);

  const updated = requiredDecimal(appropriation.updatedValueDecimal, "BudgetAppropriation.updatedValueDecimal");
  const reserved = reservations.reduce(
    (total, reservation) => total.plus(requiredDecimal(reservation.valueDecimal, "BudgetReservation.valueDecimal")),
    new Prisma.Decimal(0),
  );
  const committed = commitments.reduce(
    (total, commitment) => total.plus(commitmentValue(commitment.valueDecimal, commitment.movements)),
    new Prisma.Decimal(0),
  );

  const restrictions = await getPlanningBudgetRestrictions(tx, appropriationId);
  return { updated, reserved, committed, available: updated.minus(reserved).minus(committed).minus(restrictions.creditReserved).minus(restrictions.contingent) };
}

async function assertCmdAvailability(
  tx: Prisma.TransactionClient,
  appropriation: { id: string; financialYearId: string; budgetUnitId: string; annualBudgetExpenseFixationId: string | null },
  date: Date,
  value: Prisma.Decimal,
  reservationForCommitment?: { id: string; date: Date },
) {
  if (await assertPlanningPeriodAvailability(tx, appropriation.id, date, value, reservationForCommitment?.id)) return;
  // Records created before LOA traceability remain operational; new traced
  // appropriations are subject to the CMD control below.
  if (!appropriation.annualBudgetExpenseFixationId) return;

  const fixation = await tx.annualBudgetExpenseFixation.findUnique({
    where: { id: appropriation.annualBudgetExpenseFixationId },
    select: { annualBudgetLawId: true },
  });
  if (!fixation) throw new FinanceError("A dotação possui rastreabilidade de LOA inválida.");

  const month = date.getUTCMonth() + 1;
  await tx.$queryRaw`
    SELECT id FROM "MonthlyDisbursementSchedule"
    WHERE "annualBudgetLawId" = ${fixation.annualBudgetLawId}
      AND "budgetUnitId" = ${appropriation.budgetUnitId}
    FOR UPDATE
  `;
  const schedules = await tx.monthlyDisbursementSchedule.findMany({
    where: { annualBudgetLawId: fixation.annualBudgetLawId, budgetUnitId: appropriation.budgetUnitId },
    select: { month: true, limitValue: true },
  });
  if (new Set(schedules.map((schedule) => schedule.month)).size !== 12) {
    throw new FinanceError("A LOA vinculada à dotação exige CMD completo (12 meses) para esta unidade orçamentária.");
  }
  const schedule = schedules.find((item) => item.month === month);
  if (!schedule) throw new FinanceError("Não há limite CMD para o mês da reserva/empenho.");

  const periodStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const periodEnd = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
  const [reservations, commitments] = await Promise.all([
    tx.budgetReservation.findMany({
      where: {
        status: ACTIVE_RESERVATION_STATUS,
        date: { gte: periodStart, lt: periodEnd },
        appropriation: { financialYearId: appropriation.financialYearId, budgetUnitId: appropriation.budgetUnitId },
      },
      select: { valueDecimal: true },
    }),
    tx.commitment.findMany({
      where: {
        status: { in: ACTIVE_COMMITMENT_STATUSES },
        date: { gte: periodStart, lt: periodEnd },
        appropriation: { financialYearId: appropriation.financialYearId, budgetUnitId: appropriation.budgetUnitId },
      },
      select: { valueDecimal: true, movements: { select: { type: true, valueDecimal: true } } },
    }),
  ]);
  const reservationsTotal = reservations.reduce(
    (total, reservation) => total.plus(requiredDecimal(reservation.valueDecimal, "BudgetReservation.valueDecimal")),
    new Prisma.Decimal(0),
  );
  const commitmentsTotal = commitments.reduce(
    (total, commitment) => total.plus(commitmentValue(commitment.valueDecimal, commitment.movements)),
    new Prisma.Decimal(0),
  );
  const reservationAlreadyCounted = reservationForCommitment
    && reservationForCommitment.date.getUTCFullYear() === date.getUTCFullYear()
    && reservationForCommitment.date.getUTCMonth() === date.getUTCMonth();
  const projected = reservationsTotal.plus(commitmentsTotal).plus(reservationAlreadyCounted ? 0 : value);
  if (projected.greaterThan(schedule.limitValue)) {
    throw new FinanceError("O lançamento excede a disponibilidade do CMD da unidade orçamentária para este mês.");
  }
}

async function refreshCommittedMirror(tx: Prisma.TransactionClient, appropriationId: string) {
  const commitments = await tx.commitment.findMany({
    where: { appropriationId, status: { in: ACTIVE_COMMITMENT_STATUSES } },
    select: { valueDecimal: true, movements: { select: { type: true, valueDecimal: true } } },
  });
  const total = commitments.reduce(
    (sum, commitment) => sum.plus(commitmentValue(commitment.valueDecimal, commitment.movements)),
    new Prisma.Decimal(0),
  );
  await tx.budgetAppropriation.update({
    where: { id: appropriationId },
    data: { committedValueDecimal: total, committedValue: legacyMoney(total) },
  });
}

/** Reconciles the durable budget mirror after origin-controlled additive corrections. */
export async function synchronizeCommittedBudgetMirror(tx: Prisma.TransactionClient, appropriationId: string) {
  await lockAppropriation(tx, appropriationId);
  await refreshCommittedMirror(tx, appropriationId);
}

async function creditorForSupplier(tx: Prisma.TransactionClient, supplierId: string) {
  const supplier = await tx.supplier.findUnique({
    where: { id: supplierId },
    include: { person: true, company: true },
  });
  if (!supplier || supplier.status !== "Ativo") throw new FinanceError("Fornecedor não está ativo.");

  const name = supplier.company?.corporateName ?? supplier.person?.fullName;
  const document = supplier.company?.cnpj ?? supplier.person?.cpf;
  if (!name) throw new FinanceError("Fornecedor sem pessoa ou empresa vinculada.");

  return tx.creditor.upsert({
    where: { supplierId },
    create: {
      supplierId,
      name,
      document,
      personId: supplier.personId ?? undefined,
      companyId: supplier.companyId ?? undefined,
    },
    update: { name, document, status: supplier.status },
  });
}

export async function createExpenseRequest(
  db: PrismaClient,
  actor: FinanceActor,
  input: {
    date: Date;
    description: string;
    value: Prisma.Decimal | string | number;
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
  return db.$transaction(tx => createExpenseRequestInTransaction(tx, actor, input));
}

export async function createExpenseRequestInTransaction(tx: Prisma.TransactionClient, actor: FinanceActor, input: Parameters<typeof createExpenseRequest>[2]): Promise<Expense> {
  const value = money(input.value);
    await lockAppropriation(tx, input.appropriationId);
    if (input.idempotencyKey) {
      const existing = await tx.expense.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
      if (existing) {
        const source = await tx.budgetAppropriation.findUniqueOrThrow({ where: { id: existing.appropriationId }, select: { budgetUnitId: true } });
        assertActorBudgetUnit(actor, source.budgetUnitId);
        if (existing.appropriationId !== input.appropriationId || existing.supplierId !== input.supplierId || !existing.valueDecimal?.equals(value) || existing.date.getTime() !== input.date.getTime() || existing.sourceModule !== input.sourceModule.trim() || existing.sourceType !== input.sourceType.trim() || existing.sourceId !== (input.sourceId?.trim() || null)) throw new FinanceError("Solicitação de despesa já registrada com outros dados.");
        return existing;
      }
    }
    const [appropriation, supplier, purchaseReceipt] = await Promise.all([
      tx.budgetAppropriation.findUnique({
        where: { id: input.appropriationId },
        include: { expenseNature: { select: { procurementOriginPolicy: true } } },
      }),
      tx.supplier.findUnique({ where: { id: input.supplierId }, select: { id: true, status: true } }),
      input.purchaseReceiptId
        ? tx.purchaseReceipt.findUnique({ where: { id: input.purchaseReceiptId }, select: { id: true, status: true, contract: { select: { supplierId: true } } } })
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
    const candidateYear = await tx.financialYear.findUniqueOrThrow({ where: { id: appropriation.financialYearId } });
    const year = candidateYear.status === "Preparação" ? await assertPlanningReservationYear(tx, appropriation.id, appropriation.financialYearId, input.date) : await assertFinancialYearOpen(tx, appropriation.financialYearId, input.date);
    const expense = await tx.expense.create({
      data: {
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
      },
    });
    await audit(tx, actor, "CREATE", "Expense", expense.id, { value: jsonMoney(value), supplierId: supplier.id, sourceModule: expense.sourceModule, sourceType: expense.sourceType, sourceId: expense.sourceId, eventType: expense.eventType, purchaseReceiptId: expense.purchaseReceiptId }, year.id, appropriation.budgetUnitId);
    return expense;
}

export async function createExpenseRequestFromApprovedPurchaseReceipt(
  db: PrismaClient,
  actor: FinanceActor,
  input: { purchaseReceiptId: string; date: Date; description: string; value: Prisma.Decimal | string | number; appropriationId: string; secretariatId: string; idempotencyKey?: string },
) {
  const receipt = await db.purchaseReceipt.findUnique({
    where: { id: input.purchaseReceiptId },
    select: {
      id: true,
      status: true,
      items: { select: { quantity: true, unitCost: true } },
      contract: { select: { supplierId: true, secretariatId: true } },
    },
  });
  if (!receipt || receipt.status !== "APPROVED") throw new FinanceError("A solicitação de despesa exige um recebimento aprovado.");
  if (receipt.contract.secretariatId !== input.secretariatId) {
    throw new FinanceError("A solicitação de despesa deve utilizar a secretaria do contrato recebido.");
  }
  const receiptValue = receipt.items.reduce((total, item) => total.plus(new Prisma.Decimal(item.quantity).mul(item.unitCost)), new Prisma.Decimal(0));
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

export async function approveExpenseRequest(db: PrismaClient, actor: FinanceActor, expenseId: string) {
  return db.$transaction(tx => approveExpenseRequestInTransaction(tx, actor, expenseId));
}

export async function approveExpenseRequestInTransaction(tx: Prisma.TransactionClient, actor: FinanceActor, expenseId: string): Promise<Expense> {
    await lockExpense(tx, expenseId);
    const expense = await tx.expense.findUnique({ include: { appropriation: true }, where: { id: expenseId } });
    if (!expense) throw new FinanceError("Solicitação de despesa não encontrada.");
    assertActorBudgetUnit(actor, expense.appropriation.budgetUnitId);
    const candidateYear = await tx.financialYear.findUniqueOrThrow({ where: { id: expense.appropriation.financialYearId } });
    const year = candidateYear.status === "Preparação" ? await assertPlanningReservationYear(tx, expense.appropriationId, candidateYear.id, expense.date) : await assertFinancialYearOpen(tx, expense.appropriation.financialYearId, new Date());
    if (expense.status !== "Solicitada") throw new FinanceError("Somente solicitações pendentes podem ser aprovadas.");
    if (expense.requestedById === actor.usuarioId) throw new FinanceError("Segregação de funções: o solicitante não pode aprovar a própria solicitação.");
    const approved = await tx.expense.update({ where: { id: expense.id }, data: { status: "Aprovada", approvedById: actor.usuarioId, approvedAt: new Date() } });
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
  value: Prisma.Decimal | string | number;
  justification: string;
  appropriationId: string;
  sourceModule?: string;
  sourceType?: string;
  sourceId?: string;
  eventType?: string;
  idempotencyKey?: string;
};

export async function createBudgetMovementInTransaction(
  tx: Prisma.TransactionClient,
  actor: FinanceActor,
  input: BudgetMovementInput,
) {
  const value = money(input.value);
  const direction = movementDirections[input.type];
  if (!direction) throw new FinanceError("Tipo de movimento orçamentário inválido.");

  if (input.idempotencyKey) {
    const existing = await tx.budgetMovement.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (existing) return existing;
  }
  await lockAppropriation(tx, input.appropriationId);
  const appropriation = await tx.budgetAppropriation.findUnique({ where: { id: input.appropriationId } });
  if (!appropriation) throw new FinanceError("Dotação orçamentária não encontrada.");
  const [planningSchema] = await tx.$queryRaw<{ ready: boolean }[]>`SELECT to_regclass('"PlanningBudgetLine"') IS NOT NULL AS ready`;
  if (planningSchema.ready && await tx.planningBudgetLine.findUnique({ where: { appropriationId: appropriation.id }, select: { id: true } })) {
    throw new FinanceError("A dotação pertence ao Planejamento e Orçamento. Efetive a alteração pelo fluxo orçamentário da entidade responsável.");
  }
  const year = await assertFinancialYearOpen(tx, appropriation.financialYearId, input.date);
  const current = requiredDecimal(appropriation.updatedValueDecimal, "BudgetAppropriation.updatedValueDecimal");
  if (direction < 0) {
    const availability = await getBudgetAvailability(tx, appropriation.id);
    if (availability.available.lessThan(value)) throw new FinanceError("A anulação excede a disponibilidade da dotação.");
  }
  const updated = direction > 0 ? current.plus(value) : current.minus(value);
  const movement = await tx.budgetMovement.create({
    data: {
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
    },
  });
  await tx.budgetAppropriation.update({ where: { id: appropriation.id }, data: { updatedValueDecimal: updated, updatedValue: legacyMoney(updated) } });
  await audit(tx, actor, "CREATE", "BudgetMovement", movement.id, { type: movement.type, value: jsonMoney(value), resultingUpdatedValue: jsonMoney(updated) }, year.id);
  return movement;
}

export async function createBudgetMovement(
  db: PrismaClient,
  actor: FinanceActor,
  input: BudgetMovementInput,
) {
  if (input.type !== "Dotação Inicial") {
    throw new FinanceError("Alterações orçamentárias devem ser executadas exclusivamente por uma solicitação de crédito aprovada.");
  }
  return db.$transaction((tx) => createBudgetMovementInTransaction(tx, actor, input));
}

export async function createBudgetReservation(
  db: PrismaClient,
  actor: FinanceActor,
  input: { number: string; date: Date; value: Prisma.Decimal | string | number; appropriationId: string; expenseId: string; justification?: string },
) {
  return db.$transaction((tx) => createBudgetReservationInTransaction(tx, actor, input));
}

export async function createBudgetReservationInTransaction(tx: Prisma.TransactionClient, actor: FinanceActor, input: Parameters<typeof createBudgetReservation>[2]): Promise<BudgetReservation> {
  const value = money(input.value);
    await lockAppropriation(tx, input.appropriationId);
    const appropriation = await tx.budgetAppropriation.findUnique({
      where: { id: input.appropriationId },
      select: { id: true, financialYearId: true, budgetUnitId: true, annualBudgetExpenseFixationId: true },
    });
    if (!appropriation) throw new FinanceError("Dotação orçamentária não encontrada.");
    assertActorBudgetUnit(actor, appropriation.budgetUnitId);
    const candidateYear = await tx.financialYear.findUniqueOrThrow({ where: { id: appropriation.financialYearId } });
    const year = candidateYear.status === "Preparação" ? await assertPlanningReservationYear(tx, appropriation.id, appropriation.financialYearId, input.date) : await assertFinancialYearOpen(tx, appropriation.financialYearId, input.date);
    await assertAccountingPeriodOpen(tx, year.id, input.date);
    await assertCmdAvailability(tx, appropriation, input.date, value);
    await lockExpense(tx, input.expenseId);
    const expense = await tx.expense.findUnique({ where: { id: input.expenseId } });
    if (!expense || expense.appropriationId !== appropriation.id) throw new FinanceError("A solicitação de despesa não pertence à dotação informada.");
    if (expense.status !== "Aprovada") throw new FinanceError("A reserva exige uma solicitação de despesa aprovada.");
    const requested = requiredDecimal(expense.valueDecimal, "Expense.valueDecimal");
    if (!requested.equals(value)) throw new FinanceError("A reserva deve corresponder ao valor da solicitação de despesa.");
    const availability = await getBudgetAvailability(tx, appropriation.id);
    if (availability.available.lessThan(value)) throw new FinanceError("A reserva excede a disponibilidade da dotação.");
    const reservation = await tx.budgetReservation.create({
      data: { number: input.number.trim(), date: input.date, valueDecimal: value, value: legacyMoney(value), appropriationId: appropriation.id, expenseId: expense.id, justification: input.justification?.trim() || undefined },
    });
    await tx.expense.update({ where: { id: expense.id }, data: { status: "Reservada" } });
    await audit(tx, actor, "CREATE", "BudgetReservation", reservation.id, { value: jsonMoney(value), appropriationId: appropriation.id, expenseId: expense.id }, year.id, appropriation.budgetUnitId);
    return reservation;
}

export async function cancelBudgetReservation(db: PrismaClient, actor: FinanceActor, reservationId: string) {
  return db.$transaction(async (tx) => {
    const source = await tx.budgetReservation.findUnique({ where: { id: reservationId }, select: { appropriationId: true } });
    if (!source) throw new FinanceError("Reserva orçamentária não encontrada.");
    await lockAppropriation(tx, source.appropriationId);
    const reservation = await tx.budgetReservation.findUniqueOrThrow({ include: { appropriation: true }, where: { id: reservationId } });
    assertActorBudgetUnit(actor, reservation.appropriation.budgetUnitId);
    const candidateYear = await tx.financialYear.findUniqueOrThrow({ where: { id: reservation.appropriation.financialYearId } });
    const year = candidateYear.status === "Preparação" ? await assertPlanningReservationYear(tx, reservation.appropriationId, candidateYear.id, reservation.date) : await assertFinancialYearOpen(tx, reservation.appropriation.financialYearId, reservation.date);
    if (reservation.status !== ACTIVE_RESERVATION_STATUS) throw new FinanceError("Somente reservas ativas podem ser canceladas.");
    const canceled = await tx.budgetReservation.update({ where: { id: reservationId }, data: { status: "Cancelada" } });
    if (reservation.expenseId) await tx.expense.update({ where: { id: reservation.expenseId }, data: { status: "Aprovada" } });
    await audit(tx, actor, "CANCEL", "BudgetReservation", reservationId, { previousStatus: reservation.status }, year.id);
    return canceled;
  });
}

export async function createCommitment(
  db: PrismaClient,
  actor: FinanceActor,
  input: {
    number: string;
    date: Date;
    value: Prisma.Decimal | string | number;
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
  return db.$transaction((tx) => createCommitmentInTransaction(tx, actor, input));
}

export async function createCommitmentInTransaction(tx: Prisma.TransactionClient, actor: FinanceActor, input: Parameters<typeof createCommitment>[2]): Promise<Commitment> {
  const value = money(input.value);
  const obrasServiceId = input.obrasServiceId?.trim() || undefined;
  if (!["Ordinário", "Estimativo", "Global"].includes(input.type)) throw new FinanceError("Tipo de empenho inválido.");
    await lockAppropriation(tx, input.appropriationId);
    const [appropriation, reservation] = await Promise.all([
      tx.budgetAppropriation.findUnique({
        where: { id: input.appropriationId },
        include: { expenseNature: { select: { procurementOriginPolicy: true } } },
      }),
      tx.budgetReservation.findUnique({ where: { id: input.reservationId }, include: { expense: { select: { purchaseReceiptId: true } } } }),
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
      ? await tx.process.findUnique({
          where: { id: input.processId },
          select: { id: true, currentDepartmentId: true },
        })
      : null;
    if (input.processId && !process) throw new FinanceError("Processo informado não encontrado.");
    const contract = input.contractId
      ? await contractForCommitment(tx, input.contractId, input.date, value)
      : null;
    if (contract) {
      if (contract.supplierId !== input.supplierId) throw new FinanceError("O contrato informado não pertence ao fornecedor do empenho.");
    }
    const purchaseReceiptId = reservation.expense?.purchaseReceiptId ?? undefined;
    const purchaseReceipt = purchaseReceiptId
      ? await tx.purchaseReceipt.findUnique({ where: { id: purchaseReceiptId }, select: { id: true, status: true, contractId: true, purchaseProcessId: true } })
      : null;
    if (purchaseReceiptId && (!purchaseReceipt || purchaseReceipt.status !== "APPROVED")) {
      throw new FinanceError("O empenho exige um recebimento de compra aprovado.");
    }
    if (purchaseReceipt && (!contract || purchaseReceipt.contractId !== contract.id)) {
      throw new FinanceError("O empenho deve utilizar o contrato vinculado ao recebimento aprovado.");
    }
    const [covenant, publicityCampaign, fundedDebt] = await Promise.all([
      input.covenantId
        ? tx.covenant.findUnique({ where: { id: input.covenantId }, select: { id: true, number: true, status: true, startDate: true, endDate: true } })
        : null,
      input.publicityCampaignId
        ? tx.publicityCampaign.findUnique({ where: { id: input.publicityCampaignId }, select: { id: true, name: true, status: true, startDate: true, endDate: true } })
        : null,
      input.fundedDebtId
        ? tx.fundedDebt.findUnique({ where: { id: input.fundedDebtId }, select: { id: true, creditorName: true, lawNumber: true, status: true } })
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
      ? await tx.obrasServico.findUnique({
          where: { id: obrasServiceId },
          select: { id: true, protocolo: true, active: true, commitmentId: true, budgetAppropriationId: true },
        })
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
    const commitment = await tx.commitment.create({
      data: {
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
        obrasServices: obrasService ? { connect: { id: obrasService.id } } : undefined,
      },
    });
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
    await tx.budgetReservation.update({ where: { id: reservation.id }, data: { status: "Empenhada" } });
    if (reservation.expenseId) await tx.expense.update({ where: { id: reservation.expenseId }, data: { status: "Empenhada" } });
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
    if (process) {
      const released = await tx.process.updateMany({
        where: { id: process.id, status: AWAITING_ACCOUNTING_PROCESS_STATUS },
        data: { status: RELEASED_PROCESS_STATUS },
      });
      if (released.count) {
        await tx.processEvent.create({
          data: {
            processId: process.id,
            eventType: "ACCOUNTING_RELEASED",
            description: `Processo liberado após a emissão do empenho ${commitment.number}.`,
            previousStatus: AWAITING_ACCOUNTING_PROCESS_STATUS,
            newStatus: RELEASED_PROCESS_STATUS,
            departmentId: process.currentDepartmentId ?? undefined,
            employeeId: actor.employeeId ?? undefined,
            metadata: JSON.stringify({
              commitmentId: commitment.id,
              commitmentNumber: commitment.number,
              commitmentValue: jsonMoney(value),
            }),
          },
        });
      }
    }
    await audit(tx, actor, "CREATE", "Commitment", commitment.id, { value: jsonMoney(value), reservationId: reservation.id, creditorId: creditor.id, processId: commitment.processId, purchaseProcessId: commitment.purchaseProcessId, purchaseReceiptId: commitment.purchaseReceiptId, contractId: commitment.contractId, obrasServiceId: obrasService?.id }, year.id);
    return commitment;
}

export async function cancelCommitment(db: PrismaClient, actor: FinanceActor, commitmentId: string) {
  return db.$transaction((tx) => cancelCommitmentInTransaction(tx, actor, commitmentId));
}

export async function cancelCommitmentInTransaction(tx: Prisma.TransactionClient, actor: FinanceActor, commitmentId: string, date = new Date(), reason = "Anulação integral do empenho"): Promise<Commitment> {
    const source = await tx.commitment.findUnique({ where: { id: commitmentId }, include: { reservation: { include: { expense: true } } } });
    const allowance = source?.reservation?.expense;
    if (allowance?.sourceModule === "RH" && ["ADVANCE_ALLOWANCE", "TRAVEL_ALLOWANCE"].includes(allowance.sourceType ?? "") && allowance.sourceId) await tx.$queryRaw`SELECT id FROM "HrPortalRequest" WHERE id=${allowance.sourceId} FOR UPDATE`;
    await lockCommitment(tx, commitmentId);
    const commitment = await tx.commitment.findUnique({ include: { appropriation: true, movements: true, settlements: { where: { status: ACTIVE_SETTLEMENT_STATUS } }, payments: { where: { status: { in: ACTIVE_PAYMENT_STATUSES } } } }, where: { id: commitmentId } });
    if (!commitment) throw new FinanceError("Empenho não encontrado.");
    await lockAppropriation(tx, commitment.appropriationId);
    assertActorBudgetUnit(actor, commitment.appropriation.budgetUnitId);
    const year = await assertFinancialYearOpen(tx, commitment.appropriation.financialYearId, date);
    await assertAccountingPeriodOpen(tx, year.id, date);
    if (commitment.status === "Anulado") throw new FinanceError("O empenho já está anulado.");
    const settledCorrections = await settledCurrentRefundCorrections(tx, commitment.id);
    if (commitment.settlements.some(row => !settledCorrections.settlements.has(row.id)) || commitment.payments.some(row => !settledCorrections.payments.has(row.id))) throw new FinanceError("Empenhos com liquidações ou pagamentos ativos não podem ser anulados integralmente.");
    const effectiveValue = commitmentValue(commitment.valueDecimal, commitment.movements);
    const canceledAt = date;
    if (effectiveValue.greaterThan(0)) {
      await tx.commitmentMovement.create({ data: { date: canceledAt, type: "Anulação", valueDecimal: effectiveValue, justification: reason.trim(), commitmentId } });
      await postCommitmentBalanceChange(tx, actor, commitment, year.id, { date: canceledAt, value: effectiveValue, reverse: true, sourceType: "COMMITMENT_REVERSAL", sourceId: commitment.id, eventType: "EMPENHO_ANULADO", key: `FINANCEIRO:COMMITMENT:${commitment.id}:EMPENHO_ANULADO` });
    }
    const canceled = await tx.commitment.update({ where: { id: commitmentId }, data: { status: "Anulado" } });
    await reverseAdvanceCommitmentControl(tx, actor, commitmentId, date, reason);
    await refreshCommittedMirror(tx, commitment.appropriationId);
    if (effectiveValue.greaterThan(0)) await recordPlanningFinanceExecution(tx, actor, { appropriationId: commitment.appropriationId, operation: "REVERSE", date: canceledAt, value: effectiveValue, key: `finance:cancel:${commitment.id}`, originPrefix: `finance:commit:${commitment.id}:` });
    await audit(tx, actor, "CANCEL", "Commitment", commitmentId, { previousStatus: commitment.status, value: jsonMoney(effectiveValue) }, year.id);
    return canceled;
}

export async function createCommitmentMovement(db: PrismaClient, actor: FinanceActor, input: { commitmentId: string; date: Date; type: "Reforço" | "Anulação"; value: Prisma.Decimal | string | number; justification: string }) {
  return db.$transaction((tx) => createCommitmentMovementInTransaction(tx, actor, input));
}

export async function createCommitmentMovementInTransaction(tx: Prisma.TransactionClient, actor: FinanceActor, input: Parameters<typeof createCommitmentMovement>[2]) {
  const value = money(input.value);
  if (!["Reforço", "Anulação"].includes(input.type)) throw new FinanceError("Tipo de movimento de empenho inválido.");
  if (!input.justification.trim()) throw new FinanceError("Informe a justificativa do movimento de empenho.");
    await lockCommitment(tx, input.commitmentId);
    const commitment = await tx.commitment.findUnique({ include: { appropriation: true, movements: true, settlements: { where: { status: ACTIVE_SETTLEMENT_STATUS }, select: { valueDecimal: true } } }, where: { id: input.commitmentId } });
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
      const settled = commitment.settlements.reduce((total, settlement) => total.plus(requiredDecimal(settlement.valueDecimal, "Settlement.valueDecimal")), new Prisma.Decimal(0));
      if (effectiveValue.minus(value).lessThan(settled)) throw new FinanceError("A anulação não pode reduzir o empenho abaixo do valor liquidado.");
    }
    const movement = await tx.commitmentMovement.create({ data: { date: input.date, type: input.type, valueDecimal: value, justification: input.justification.trim(), commitmentId: commitment.id } });
    await postCommitmentBalanceChange(tx, actor, commitment, year.id, { date: input.date, value, reverse: input.type === "Anulação", sourceType: "COMMITMENT_MOVEMENT", sourceId: movement.id, eventType: input.type === "Reforço" ? "EMPENHO_REFORCADO" : "EMPENHO_ANULACAO_PARCIAL", key: `FINANCEIRO:COMMITMENT_MOVEMENT:${movement.id}` });
    await refreshCommittedMirror(tx, commitment.appropriationId);
    await recordPlanningFinanceExecution(tx, actor, { appropriationId: commitment.appropriationId, operation: input.type === "Reforço" ? "CONSUME" : "REVERSE", date: input.date, value, key: input.type === "Reforço" ? `finance:commit:${commitment.id}:movement:${movement.id}` : `finance:reversal:${movement.id}`, originPrefix: `finance:commit:${commitment.id}:` });
    await audit(tx, actor, "CREATE", "CommitmentMovement", movement.id, { type: movement.type, value: jsonMoney(value), commitmentId: commitment.id, resultingEffectiveValue: jsonMoney(input.type === "Reforço" ? effectiveValue.plus(value) : effectiveValue.minus(value)) }, year.id);
    return movement;
}

async function postCommitmentBalanceChange(tx: Prisma.TransactionClient, actor: FinanceActor, commitment: { id: string; number: string; valueDecimal: Prisma.Decimal | null }, financialYearId: string, input: { date: Date; value: Prisma.Decimal; reverse: boolean; sourceType: string; sourceId: string; eventType: string; key: string }) {
  const originals = await tx.accountingTransaction.findMany({ where: { financialYearId, sourceType: "COMMITMENT", sourceId: commitment.id, eventType: "EMPENHO_EMITIDO", status: "POSTADO" }, include: { entries: true }, take: 2 });
  const original = originals.length === 1 ? originals[0] : undefined;
  if (!original || original.entries.length < 2 || original.entries.length % 2 !== 0 || original.entries.some((entry) => !entry.valueDecimal?.equals(requiredDecimal(commitment.valueDecimal, "Commitment.valueDecimal")) || !["Débito", "Crédito"].includes(entry.type)) || original.entries.filter(entry => entry.type === "Débito").length !== original.entries.filter(entry => entry.type === "Crédito").length) throw new FinanceError("Reconcilie a postagem original do empenho antes de reforçar ou anular seu saldo.");
  return postAccountingTransactionInTransaction(tx, actor, { financialYearId, date: input.date, history: `${input.eventType} · empenho ${commitment.number}`, sourceModule: "FINANCEIRO", sourceType: input.sourceType, sourceId: input.sourceId, eventType: input.eventType, idempotencyKey: input.key, reversalOfId: input.sourceType === "COMMITMENT_REVERSAL" ? original.id : undefined, lines: original.entries.map((entry) => ({ ...(input.sourceType === "COMMITMENT_REVERSAL" ? { originalEntryId: entry.id } : {}), accountId: entry.accountId, type: input.reverse ? entry.type === "Débito" ? "Crédito" : "Débito" : entry.type as "Débito" | "Crédito", value: input.value })) });
}

async function commitmentForPosting(tx: Prisma.TransactionClient, commitmentId: string, date: Date) {
  await lockCommitment(tx, commitmentId);
  const commitment = await tx.commitment.findUnique({ include: { appropriation: true, movements: true }, where: { id: commitmentId } });
  if (!commitment) throw new FinanceError("Empenho não encontrado.");
  const year = await assertFinancialYearOpen(tx, commitment.appropriation.financialYearId, date);
  await assertAccountingPeriodOpen(tx, year.id, date);
  if (!ACTIVE_COMMITMENT_STATUSES.includes(commitment.status)) throw new FinanceError("Não é permitido lançar sobre empenho inativo ou anulado.");
  return { commitment, year };
}

async function activeSettlementTotal(tx: Prisma.TransactionClient, commitmentId: string) {
  const settlements = await tx.settlement.findMany({ where: { commitmentId, status: ACTIVE_SETTLEMENT_STATUS }, select: { valueDecimal: true } });
  return settlements.reduce((total, settlement) => total.plus(requiredDecimal(settlement.valueDecimal, "Settlement.valueDecimal")), new Prisma.Decimal(0));
}

async function activePaymentTotal(tx: Prisma.TransactionClient, where: Prisma.PaymentWhereInput) {
  const payments = await tx.payment.findMany({ where: { ...where, status: { in: ACTIVE_PAYMENT_STATUSES } }, select: { valueDecimal: true } });
  return payments.reduce((total, payment) => total.plus(requiredDecimal(payment.valueDecimal, "Payment.valueDecimal")), new Prisma.Decimal(0));
}

async function refreshCommitmentExecutionStatus(tx: Prisma.TransactionClient, commitmentId: string) {
  const commitment = await tx.commitment.findUnique({ include: { movements: true }, where: { id: commitmentId } });
  if (!commitment || commitment.status === "Anulado") return;
  const [settled, paid] = await Promise.all([activeSettlementTotal(tx, commitmentId), activePaymentTotal(tx, { commitmentId })]);
  const effectiveValue = commitmentValue(commitment.valueDecimal, commitment.movements);
  const status = paid.equals(effectiveValue) ? "Pago" : settled.greaterThan(0) ? "Liquidado" : "Emitido";
  if (commitment.status !== status) await tx.commitment.update({ where: { id: commitmentId }, data: { status } });
}

export async function createSettlement(db: PrismaClient, actor: FinanceActor, input: {
  date: Date;
  value: Prisma.Decimal | string | number;
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
  return db.$transaction((tx) => createSettlementInTransaction(tx, actor, input));
}

export async function createSettlementInTransaction(tx: Prisma.TransactionClient, actor: FinanceActor, input: Parameters<typeof createSettlement>[2]): Promise<Settlement> {
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
      tx.document.findUnique({ where: { id: input.documentId } }),
      tx.employee.findUnique({ where: { id: input.authorId }, select: { isActive: true } }),
      activeSettlementTotal(tx, commitment.id),
    ]);
    if (!document || document.status !== "Válido") throw new FinanceError("O documento GED informado não está válido.");
    if (!author?.isActive) throw new FinanceError("O responsável pelo ateste não está ativo.");
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
    const retentionTotal = calculatedRetentions.reduce((total, retention) => total.plus(retention.retainedValue), new Prisma.Decimal(0));
    if (retentionTotal.greaterThan(value)) throw new FinanceError("As retenções não podem exceder o valor bruto da liquidação.");
    const effectiveValue = commitmentValue(commitment.valueDecimal, commitment.movements);
    if (settled.plus(value).greaterThan(effectiveValue)) throw new FinanceError("A liquidação acumulada excede o valor vigente do empenho.");
    if (input.payableCarryForwardId) {
      const payable = await tx.payableCarryForward.findUniqueOrThrow({ where: { id: input.payableCarryForwardId } });
      const allocated = await tx.settlement.findMany({ where: { payableCarryForwardId: payable.id, status: ACTIVE_SETTLEMENT_STATUS }, select: { valueDecimal: true } });
      const total = allocated.reduce((sum, row) => sum.plus(requiredDecimal(row.valueDecimal, "Settlement.valueDecimal")), new Prisma.Decimal(0));
      const inherited = await tx.payableCarryForwardSettlementLink.findMany({ where: { payableCarryForwardId: payable.id, status: "ACTIVE" }, select: { valueDecimal: true } });
      const inheritedTotal = inherited.reduce((sum, link) => sum.plus(link.valueDecimal), new Prisma.Decimal(0));
      if (total.plus(inheritedTotal).plus(value).gt(payable.valueDecimal)) throw new FinanceError("A liquidação excede o saldo inscrito do RAP não processado, incluindo liquidações herdadas.");
    }
    const settlement = await tx.settlement.create({
      data: {
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
        retentions: {
          create: calculatedRetentions.map((retention) => ({
            retentionRuleId: retention.rule.id,
            type: retention.type,
            description: retention.rule.description,
            calculationBaseDecimal: retention.baseValue,
            ratePercentage: retention.ratePercentage,
            valueDecimal: retention.retainedValue,
            beneficiaryName: retention.rule.beneficiaryName,
            beneficiaryDocument: retention.rule.beneficiaryDocument ?? undefined,
            dueDate: calculateRetentionDueDate(input.date, retention.rule.dueDays),
          })),
        },
      },
    });
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
    if (input.payableCarryForwardId) await tx.payableCarryForwardEvent.create({ data: { payableCarryForwardId: input.payableCarryForwardId, settlementId: settlement.id, action: "LIQUIDACAO_REGISTRADA", valueDecimal: value, actorUsuarioId: actor.usuarioId } });
    await audit(tx, actor, "CREATE", "Settlement", settlement.id, { value: jsonMoney(value), retentionValue: jsonMoney(retentionTotal), commitmentId: commitment.id, documentId: document.id, authorId: input.authorId }, year.id);
    return settlement;
}

export async function cancelSettlement(db: PrismaClient, actor: FinanceActor, settlementId: string) {
  return db.$transaction((tx) => cancelSettlementInTransaction(tx, actor, settlementId));
}

export async function cancelSettlementInTransaction(tx: Prisma.TransactionClient, actor: FinanceActor, settlementId: string): Promise<Settlement> {
    await assertCurrentRefundPaymentMutationAllowed(tx, settlementId, "SETTLEMENT");
     const origin = await tx.settlement.findUnique({ where: { id: settlementId }, select: { commitmentId: true } });
     if (!origin) throw new FinanceError("Liquidação não encontrada.");
     await lockCommitment(tx, origin.commitmentId);
     const settlement = await tx.settlement.findUnique({ include: { commitment: { include: { appropriation: true } } }, where: { id: settlementId } });
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
    const canceled = await tx.settlement.update({ where: { id: settlementId }, data: { status: "Cancelado" } });
    if (settlement.payableCarryForwardId) await tx.payableCarryForwardEvent.create({ data: { payableCarryForwardId: settlement.payableCarryForwardId, settlementId: settlement.id, action: "LIQUIDACAO_CANCELADA", valueDecimal: settlement.valueDecimal, actorUsuarioId: actor.usuarioId } });
    await refreshCommitmentExecutionStatus(tx, settlement.commitmentId);
    await audit(tx, actor, "CANCEL", "Settlement", settlementId, { previousStatus: settlement.status }, year.id);
     return canceled;
}

async function carryForwardAllocatedValue(tx: Prisma.TransactionClient, payableId: string, includeIssued = false) {
  const nativePayments = await tx.payment.findMany({ where: { payableCarryForwardId: payableId, status: { in: includeIssued ? ACTIVE_PAYMENT_STATUSES : ["Paga"] } }, select: { valueDecimal: true } });
  const legacyEvents = await tx.payableCarryForwardEvent.findMany({ where: { payableCarryForwardId: payableId, action: "PAGAMENTO_RASTREADO", payment: { is: { payableCarryForwardId: null, status: "Paga" } } }, select: { valueDecimal: true } });
  return [...nativePayments, ...legacyEvents].reduce((sum, row) => sum.plus(requiredDecimal(row.valueDecimal, "RAP.paymentValueDecimal")), new Prisma.Decimal(0));
}

async function carryForwardForPosting(tx: Prisma.TransactionClient, actor: FinanceActor, payableId: string, commitmentId: string, date: Date, requiredType?: "NAO_PROCESSADO") {
  await lockCommitment(tx, commitmentId);
  await lockPayableCarryForward(tx, payableId);
  const commitment = await tx.commitment.findUniqueOrThrow({ where: { id: commitmentId }, include: { appropriation: true, movements: true } });
  assertActorBudgetUnit(actor, commitment.appropriation.budgetUnitId);
  const payable = await tx.payableCarryForward.findUniqueOrThrow({ where: { id: payableId }, include: { financialYear: true, originFinancialYear: true } });
  if (payable.commitmentId !== commitment.id || payable.originFinancialYearId !== commitment.appropriation.financialYearId || !["PROCESSADO", "NAO_PROCESSADO"].includes(payable.type) || requiredType && payable.type !== requiredType || !["PENDENTE", "PAGAMENTO_PARCIAL_RASTREADO"].includes(payable.status)) throw new FinanceError("Selecione um resto a pagar pendente do tipo e empenho informados.");
  if (payable.originFinancialYear.status !== "Encerrado" || date <= payable.originFinancialYear.endDate || !ACTIVE_COMMITMENT_STATUSES.includes(commitment.status)) throw new FinanceError("Pagamento de RAP exige origem encerrada, data posterior e empenho ativo.");
  const binding = await tx.planningEntityUnit.findUniqueOrThrow({ where: { budgetUnitId: commitment.appropriation.budgetUnitId } });
  if (payable.financialYear.governmentEntityId !== binding.governmentEntityId || payable.originFinancialYear.governmentEntityId !== binding.governmentEntityId) throw new FinanceError("Inscrição e origem do RAP devem pertencer ao ente da UG.");
  const years = await tx.financialYear.findMany({ where: { governmentEntityId: binding.governmentEntityId, startDate: { lte: date }, endDate: { gte: date }, status: "Aberto" } });
  if (years.length !== 1) throw new FinanceError("Pagamento de RAP exige exercício corrente aberto e único do mesmo ente.");
  const year = await assertFinancialYearOpen(tx, years[0].id, date);
  if (year.year < payable.financialYear.year) throw new FinanceError("A execução não pode anteceder o exercício de inscrição do RAP.");
  await assertAccountingPeriodOpen(tx, year.id, date);
  return { commitment, year };
}

async function recordNativeCarryForwardPaymentEvent(tx: Prisma.TransactionClient, actor: FinanceActor, payment: Pick<Payment, "id" | "valueDecimal" | "payableCarryForwardId">, action: "PAGAMENTO_RASTREADO" | "PAGAMENTO_ESTORNADO", justification?: string) {
  if (!payment.payableCarryForwardId) return;
  await lockPayableCarryForward(tx, payment.payableCarryForwardId);
  const payable = await tx.payableCarryForward.findUniqueOrThrow({ where: { id: payment.payableCarryForwardId } });
  const paid = await carryForwardAllocatedValue(tx, payable.id);
  if (paid.gt(payable.valueDecimal)) throw new FinanceError("Pagamentos efetivados excedem a inscrição do RAP.");
  await tx.payableCarryForwardEvent.create({ data: { payableCarryForwardId: payable.id, paymentId: payment.id, action, valueDecimal: requiredDecimal(payment.valueDecimal, "Payment.valueDecimal"), actorUsuarioId: actor.usuarioId, justification } });
  await tx.payableCarryForward.update({ where: { id: payable.id }, data: { status: paid.isZero() ? "PENDENTE" : paid.eq(payable.valueDecimal) ? "PAGO_RASTREADO" : "PAGAMENTO_PARCIAL_RASTREADO" } });
}

export async function createPayment(
  db: PrismaClient,
  actor: FinanceActor,
  input: {
    orderNumber: string;
    date: Date;
    value: Prisma.Decimal | string | number;
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
  return db.$transaction((tx) => createPaymentInTransaction(tx, actor, input));
}

export async function createPaymentInTransaction(tx: Prisma.TransactionClient, actor: FinanceActor, input: Parameters<typeof createPayment>[2]): Promise<Payment> {
  const value = money(input.value);
  if (!input.settlementId) {
    throw new FinanceError("O fluxo obrigatório exige liquidação prévia regular antes de qualquer emissão de pagamento.");
  }

    const { commitment, year } = input.payableCarryForwardId
      ? await carryForwardForPosting(tx, actor, input.payableCarryForwardId, input.commitmentId, input.date)
      : await commitmentForPosting(tx, input.commitmentId, input.date);
    assertActorBudgetUnit(actor, commitment.appropriation.budgetUnitId);
    const bankAccount = await tx.bankAccount.findUnique({
      where: { id: input.bankAccountId },
      select: { id: true, isActive: true, resourceSourceId: true, budgetUnitId: true, externalId: true },
    });
    if (!bankAccount?.isActive) throw new FinanceError("Selecione uma conta bancária ativa.");

    // Validação de compatibilidade de fonte de recursos (Fonte Obrigatória)
    const appropriation = await tx.budgetAppropriation.findUnique({
      where: { id: commitment.appropriationId },
      select: { resourceSourceId: true, budgetUnitId: true },
    });
    await lockBankAccount(tx, input.bankAccountId);
    await assertBankResourceSource(tx, input.bankAccountId, appropriation?.resourceSourceId);
    if (!bankAccount.budgetUnitId || bankAccount.budgetUnitId !== appropriation?.budgetUnitId) {
      throw new FinanceError("A conta bancária deve estar vinculada à mesma Unidade Gestora da dotação.");
    }

    if (commitment.supplierId !== input.supplierId) throw new FinanceError("O fornecedor do pagamento deve ser o mesmo do empenho.");
    const creditor = await creditorForSupplier(tx, input.supplierId);
    if (!commitment.creditorId || commitment.creditorId !== creditor.id) throw new FinanceError("O credor do pagamento deve ser o mesmo credor central do empenho.");

    const settlement = await tx.settlement.findUnique({
      where: { id: input.settlementId },
      include: {
        retentions: {
          include: {
            paymentRetentions: {
              where: { payment: { status: { in: ACTIVE_PAYMENT_STATUSES } } },
              select: { valueDecimal: true },
            },
          },
        },
      },
    });
    if (!settlement || settlement.status !== ACTIVE_SETTLEMENT_STATUS || settlement.commitmentId !== commitment.id) {
      throw new FinanceError("A liquidação selecionada não pertence ao empenho ou não está ativa.");
    }
    if (input.date < settlement.date) throw new FinanceError("O pagamento não pode anteceder a liquidação.");
    if (input.payableCarryForwardId) {
      const payable = await tx.payableCarryForward.findUniqueOrThrow({ where: { id: input.payableCarryForwardId }, include: { originFinancialYear: true, events: { where: { action: "TRANSPORTE_ANUAL_RECEBIDO" }, select: { id: true } } } });
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
        new Prisma.Decimal(0),
      );
      const cumulativeAllocation = retention.valueDecimal
        .mul(paidAfterThisPayment)
        .div(requiredDecimal(settlement.valueDecimal, "Settlement.valueDecimal"))
        .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
      const allocatedValue = cumulativeAllocation.minus(previousAllocated);
      if (allocatedValue.lessThanOrEqualTo(0)) return [];
      return [{ retention, allocatedValue }];
    });
    const retentionTotal = retentions.reduce((total, retention) => total.plus(retention.allocatedValue), new Prisma.Decimal(0));
    if (retentionTotal.greaterThan(value)) throw new FinanceError("As retenções vinculadas à liquidação não podem exceder o valor bruto do pagamento.");
    const netValue = value.minus(retentionTotal);

    // Validação de saldo financeiro na conta bancária para o valor LÍQUIDO que efetivamente sairá
    const currentBankBalance = await getBankAccountBalance(tx, input.bankAccountId, input.date);
    const sourceBalance = await getBankResourceSourceSpendableBalance(tx, input.bankAccountId, appropriation!.resourceSourceId!, input.date);
    if (sourceBalance.lt(netValue)) throw new FinanceError("Saldo por fonte insuficiente para emitir a ordem de pagamento.");
    if (currentBankBalance.lessThan(netValue)) {
      throw new FinanceError(`Saldo financeiro insuficiente na conta bancária. Saldo disponível: R$ ${currentBankBalance.toFixed(2)}.`);
    }

    const payment = await tx.payment.create({
      data: {
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
      },
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
      await tx.paymentRetention.create({
        data: {
          paymentId: payment.id,
          settlementRetentionId: retention.id,
          retentionRuleId: retention.retentionRuleId,
          type: retention.type,
          description: retention.description,
          valueDecimal: allocatedValue,
          beneficiaryName: retention.beneficiaryName,
          beneficiaryDocument: retention.beneficiaryDocument ?? undefined,
          withholdingPayable: {
            create: {
              valueDecimal: allocatedValue,
              dueDate: retention.dueDate ?? undefined,
            },
          },
        },
      });
    }
    await refreshCommitmentExecutionStatus(tx, commitment.id);
    await audit(tx, actor, "CREATE", "Payment", payment.id, { grossValue: jsonMoney(value), netValue: jsonMoney(netValue), retentionValue: jsonMoney(retentionTotal), commitmentId: commitment.id, settlementId: input.settlementId, creditorId: creditor.id }, year.id);
    return payment;
}

export async function reversePayment(
  db: PrismaClient,
  actor: FinanceActor,
  paymentId: string,
  justification: string,
) {
  if (!justification.trim()) throw new FinanceError("A justificativa de estorno do pagamento é obrigatória.");
  return db.$transaction(async (tx) => {
    await assertCurrentRefundPaymentMutationAllowed(tx, paymentId, "PAYMENT");
    await lockPayment(tx, paymentId);
    await lockPaymentWithholdings(tx, paymentId);
    const payment = await tx.payment.findUnique({
      include: {
        commitment: { include: { appropriation: true } },
        retentions: { include: { withholdingPayable: true } },
      },
      where: { id: paymentId },
    });
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
    const updated = await tx.payment.update({ where: { id: paymentId }, data: { status: "Estornada" } });

    // Registra entrada do valor LÍQUIDO de volta na tesouraria
    await tx.treasuryMovement.create({
      data: {
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
      },
    });

    await tx.withholdingPayable.updateMany({
      where: { retention: { paymentId } },
      data: { status: "Cancelada" },
    });

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
  });
}

export async function settleWithholdingPayable(
  db: PrismaClient,
  actor: FinanceActor,
  input: {
    withholdingPayableId: string;
    bankAccountId: string;
    paymentDate: Date;
    receiptDocumentId: string;
    idempotencyKey?: string;
  },
) {
  return db.$transaction(async (tx) => {
    await lockWithholdingPayable(tx, input.withholdingPayableId);
    const payable = await tx.withholdingPayable.findUnique({
      where: { id: input.withholdingPayableId },
      include: {
        retention: {
          include: {
            settlementRetention: {
              include: {
                settlement: {
                  select: {
                    id: true,
                    documentRef: true,
                    fiscalDocumentNumber: true,
                    fiscalDocumentSeries: true,
                    fiscalDocumentIssueDate: true,
                    fiscalDocumentAccessKey: true,
                    document: { select: { id: true, title: true, documentType: true, status: true } },
                  },
                },
              },
            },
            payment: {
              include: {
                commitment: {
                  include: { appropriation: true },
                },
              },
            },
          },
        },
      },
    });
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
    const receiptDocument = await tx.document.findUnique({
      where: { id: input.receiptDocumentId.trim() },
      select: { id: true, title: true, documentType: true, status: true },
    });
    if (!receiptDocument || receiptDocument.status !== "Válido") {
      throw new FinanceError("O comprovante de recolhimento GED informado não está válido.");
    }

    await lockBankAccount(tx, input.bankAccountId);
    const bankAccount = await tx.bankAccount.findUnique({ where: { id: input.bankAccountId } });
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
    const updated = await tx.withholdingPayable.update({
      where: { id: input.withholdingPayableId },
      data: { status: "Recolhida", receiptDocumentId: receiptDocument.id },
    });

    await tx.treasuryMovement.create({
      data: {
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
      },
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

export async function updatePaymentStatus(db: PrismaClient, actor: FinanceActor, paymentId: string, status: string) {
  return db.$transaction((tx) => updatePaymentStatusInTransaction(tx, actor, paymentId, status));
}

export async function updatePaymentStatusInTransaction(tx: Prisma.TransactionClient, actor: FinanceActor, paymentId: string, status: string) {
    await lockPayment(tx, paymentId);
    const payment = await tx.payment.findUnique({
      include: {
        commitment: { include: { appropriation: true } },
        retentions: { include: { withholdingPayable: true } },
      },
      where: { id: paymentId },
    });
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
      const bankAccount = await tx.bankAccount.findUnique({
        where: { id: payment.bankAccountId },
        select: { isActive: true, resourceSourceId: true, budgetUnitId: true },
      });
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

      await tx.treasuryMovement.create({
        data: {
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
        },
      });
    }

    const updated = await tx.payment.update({ where: { id: paymentId }, data: { status } });
    if (status === "Cancelada") await tx.withholdingPayable.updateMany({ where: { retention: { paymentId } }, data: { status: "Cancelada" } });
    await refreshCommitmentExecutionStatus(tx, payment.commitmentId);
    if (status === "Paga") {
      await postAccountingEventInTransaction(tx, actor, {
        financialYearId: year.id,
        date: payment.date,
        eventCode: payment.payableCarryForwardId ? (await tx.payableCarryForward.findUniqueOrThrow({ where: { id: payment.payableCarryForwardId }, select: { type: true } })).type === "NAO_PROCESSADO" ? "RAP_NAO_PROCESSADO_PAGAMENTO" : "RAP_PROCESSADO_PAGAMENTO" : "PAGAMENTO_EFETIVADO",
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

export async function setFinancialYearStatus(db: PrismaClient, actor: FinanceActor, financialYearId: string, status: string) {
  const statuses = ["Preparação", "Aberto", "Em Encerramento", "Encerrado"];
  if (!statuses.includes(status)) throw new FinanceError("Status de exercício inválido.");
  if (status === "Encerrado") throw new FinanceError("O exercício só pode ser encerrado pela operação de fechamento anual final.");
  return db.$transaction(async (tx) => {
    const current = await lockAccountingYearPeriods(tx, actor, financialYearId);
    if (current.status === "Encerrado") throw new FinanceError("Um exercício encerrado não pode ter seu status alterado.");
    const updated = await tx.financialYear.update({ where: { id: financialYearId }, data: { status } });
    await audit(tx, actor, "STATUS_CHANGE", "FinancialYear", financialYearId, { previousStatus: current.status, status }, financialYearId);
    return updated;
  }, { timeout: 60000 });
}

async function financialYearForPosting(tx: Db, date: Date, budgetUnitId?: string | null) {
  const unit = budgetUnitId ? await tx.planningEntityUnit.findUnique({ where: { budgetUnitId }, select: { governmentEntityId: true } }) : null;
  if (budgetUnitId && !unit) throw new FinanceError("A unidade gestora não está vinculada a uma entidade para identificar o exercício financeiro.");
  const year = unit
    ? await tx.financialYear.findFirst({ where: { year: date.getUTCFullYear(), governmentEntityId: unit.governmentEntityId } })
    : await tx.financialYear.findFirst({ where: { year: date.getUTCFullYear(), governmentEntityId: null } });
  if (!year) throw new FinanceError("Não há exercício financeiro configurado para a data do lançamento.");
  const openYear = await assertFinancialYearOpen(tx, year.id, date);
  await assertAccountingPeriodOpen(tx, openYear.id, date);
  return openYear;
}

function signedValue(direction: string, value: Prisma.Decimal) {
  if (["Entrada", "ENTRADA", "CREDIT"].includes(direction)) return value;
  if (["Saída", "SAIDA", "DEBIT"].includes(direction)) return value.negated();
  throw new FinanceError("Direção de tesouraria inválida.");
}

export async function getBankAccountBalance(tx: Db, bankAccountId: string, throughDate?: Date) {
  const movements = await tx.treasuryMovement.findMany({
    where: {
      bankAccountId,
      status: "Confirmado",
      ...(throughDate ? { date: { lte: throughDate } } : {}),
    },
    select: { direction: true, valueDecimal: true },
  });
  return movements.reduce((total, movement) => total.plus(signedValue(movement.direction, movement.valueDecimal)), new Prisma.Decimal(0));
}

export async function getBankAccountBalances(tx: Db, bankAccountIds?: string[]) {
  const movements = await tx.treasuryMovement.findMany({
    where: { status: "Confirmado", ...(bankAccountIds ? { bankAccountId: { in: bankAccountIds } } : {}) },
    select: { bankAccountId: true, direction: true, valueDecimal: true },
  });
  return movements.reduce<Record<string, Prisma.Decimal>>((balances, movement) => {
    balances[movement.bankAccountId] = (balances[movement.bankAccountId] ?? new Prisma.Decimal(0)).plus(signedValue(movement.direction, movement.valueDecimal));
    return balances;
  }, {});
}

export async function getBankAccountLedgerBalance(tx: Db, bankAccountId: string, throughDate?: Date) {
  const account = await tx.bankAccount.findUnique({ where: { id: bankAccountId }, select: { accountingPlanId: true, budgetUnitId: true } });
  if (!account?.accountingPlanId) {
    throw new FinanceError("A conta bancária deve possuir uma conta analítica vinculada para calcular o razão bancário.");
  }
  if (!account.budgetUnitId) throw new FinanceError("Conta bancária sem unidade gestora para isolamento do razão.");
  if (await tx.bankAccount.count({ where: { id: { not: bankAccountId }, accountingPlanId: account.accountingPlanId, budgetUnitId: account.budgetUnitId } })) throw new FinanceError("Mais de uma conta bancária utiliza o mesmo razão na UG; configure subcontas analíticas individuais.");
  if (await tx.accountingEntry.count({ where: { accountId: account.accountingPlanId, transaction: { status: "POSTADO", budgetUnitId: null, ...(throughDate ? { date: { lte: throughDate } } : {}) } } })) throw new FinanceError("O razão possui partidas legadas sem UG; concilie a origem antes de calcular saldo por conta.");
  const entries = await tx.accountingEntry.findMany({
    where: {
      accountId: account.accountingPlanId,
      transaction: {
        status: "POSTADO",
        budgetUnitId: account.budgetUnitId,
        ...(throughDate ? { date: { lte: throughDate } } : {}),
      },
    },
    select: { type: true, value: true, valueDecimal: true },
  });
  return entries.reduce((total, entry) => {
    const value = entry.valueDecimal ?? new Prisma.Decimal(entry.value);
    if (entry.type === "Débito") return total.plus(value);
    if (entry.type === "Crédito") return total.minus(value);
    throw new FinanceError(`Natureza contábil inválida no razão bancário: ${entry.type}.`);
  }, new Prisma.Decimal(0));
}

export async function createBankAccountWithOpeningBalance(
  db: PrismaClient,
  actor: FinanceActor,
  input: { bankName: string; agency: string; bankId?: string | null; bankBranchId?: string | null; accountNumber: string; accountType: string; openingBalance?: Prisma.Decimal | string | number; resourceSourceId: string; budgetUnitId: string; accountingPlanId: string; isActive: boolean; openingDate?: Date },
) {
  const openingBalance = input.openingBalance === undefined ? new Prisma.Decimal(0) : new Prisma.Decimal(String(input.openingBalance)).toDecimalPlaces(2);
  if (!openingBalance.isFinite() || openingBalance.lessThan(0)) throw new FinanceError("O saldo de abertura não pode ser negativo.");
  if (!input.resourceSourceId.trim() || !input.budgetUnitId.trim() || !input.accountingPlanId.trim()) throw new FinanceError("Conta bancária exige fonte de recursos, Unidade Gestora e conta analítica.");
  const openingDate = input.openingDate ?? new Date();
  return db.$transaction(async (tx) => {
    const bankId = input.bankId?.trim() || null;
    const bankBranchId = input.bankBranchId?.trim() || null;
    const [accountingPlan, bank, branch] = await Promise.all([
      tx.accountingPlan.findUnique({ where: { id: input.accountingPlanId.trim() }, select: { id: true } }),
      bankId ? tx.bank.findFirst({ where: { id: bankId, status: "ATIVO" }, select: { id: true, name: true } }) : null,
      bankBranchId ? tx.bankBranch.findFirst({ where: { id: bankBranchId, status: "ATIVA" }, select: { id: true, bankId: true, code: true } }) : null,
    ]);
    if (!accountingPlan) throw new FinanceError("A conta analítica vinculada não foi encontrada.");
    if (bankId && !bank) throw new FinanceError("O banco selecionado não foi encontrado ou está inativo.");
    if (bankBranchId && (!branch || branch.bankId !== bankId)) throw new FinanceError("A agência não pertence ao banco selecionado ou está inativa.");
    const bankName = bank?.name || input.bankName.trim();
    const agency = branch?.code || input.agency.trim();
    if (!bankName || !agency) throw new FinanceError("Informe banco e agência da conta.");
    const account = await tx.bankAccount.create({
      data: {
        bankName,
        agency,
        bankId,
        bankBranchId,
        accountNumber: input.accountNumber.trim(),
        accountType: input.accountType.trim(),
        currentBalance: 0,
        currentBalanceDecimal: new Prisma.Decimal(0),
        resourceSourceId: input.resourceSourceId.trim(),
        budgetUnitId: input.budgetUnitId.trim(),
        accountingPlanId: accountingPlan.id,
        isActive: input.isActive,
      },
    });
    if (openingBalance.greaterThan(0)) {
    const year = await financialYearForPosting(tx, openingDate, input.budgetUnitId);
      const movement = await tx.treasuryMovement.create({
        data: {
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
        },
      });
      const openingEquity = await tx.accountingPlan.findUnique({ where: { code: "2.3.7.1.1.00.00" }, select: { id: true } });
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
  db: PrismaClient,
  actor: FinanceActor,
  id: string,
  input: { bankName?: string; agency?: string; bankId?: string | null; bankBranchId?: string | null; accountNumber?: string; accountType?: string; resourceSourceId?: string; budgetUnitId?: string; accountingPlanId?: string; isActive?: boolean },
) {
  return db.$transaction(async (tx) => {
    await lockBankAssignment(tx, id, input.budgetUnitId?.trim());
    if (input.resourceSourceId !== undefined) {
      const currentSource = await tx.bankAccount.findUnique({ where: { id }, select: { resourceSourceId: true } });
      if (currentSource && currentSource.resourceSourceId !== (input.resourceSourceId.trim() || null) && await tx.treasuryMovement.count({ where: { bankAccountId: id } })) throw new FinanceError("A fonte da conta bancária não pode ser alterada após movimentações; preserve a origem dos saldos em uma nova conta.");
    }
    if (input.budgetUnitId !== undefined) {
      const currentUnit = await tx.bankAccount.findUnique({ where: { id }, select: { budgetUnitId: true } });
      if (currentUnit && currentUnit.budgetUnitId !== (input.budgetUnitId.trim() || null) && await tx.treasuryMovement.count({ where: { bankAccountId: id } })) throw new FinanceError("A Unidade Gestora da conta bancária não pode ser alterada após movimentações; preserve o histórico em uma nova conta.");
    }
    if (input.accountingPlanId) {
      const [current, next] = await Promise.all([
        tx.bankAccount.findUnique({ where: { id }, select: { accountingPlanId: true } }),
        tx.accountingPlan.findUnique({ where: { id: input.accountingPlanId.trim() }, select: { id: true } }),
      ]);
      if (!current || !next) throw new FinanceError("A conta bancária ou a conta analítica não foi encontrada.");
      if (current.accountingPlanId && current.accountingPlanId !== next.id) {
        const postings = await tx.accountingEntry.count({ where: { accountId: current.accountingPlanId } });
        if (postings > 0) throw new FinanceError("A conta analítica não pode ser alterada após receber lançamentos contábeis.");
      }
    }
    const bankId = input.bankId === undefined ? undefined : input.bankId?.trim() || null;
    const bankBranchId = input.bankBranchId === undefined ? undefined : input.bankBranchId?.trim() || null;
    const current = bankId === undefined || bankBranchId === undefined
      ? await tx.bankAccount.findUnique({ where: { id }, select: { bankId: true, bankBranchId: true } })
      : null;
    const resolvedBankId = bankId === undefined ? current?.bankId || null : bankId;
    const resolvedBranchId = bankBranchId === undefined ? current?.bankBranchId || null : bankBranchId;
    const [bank, branch] = await Promise.all([
      resolvedBankId ? tx.bank.findFirst({ where: { id: resolvedBankId, status: "ATIVO" }, select: { id: true, name: true } }) : null,
      resolvedBranchId ? tx.bankBranch.findFirst({ where: { id: resolvedBranchId, status: "ATIVA" }, select: { id: true, bankId: true, code: true } }) : null,
    ]);
    if (resolvedBankId && !bank) throw new FinanceError("O banco selecionado não foi encontrado ou está inativo.");
    if (resolvedBranchId && (!branch || branch.bankId !== resolvedBankId)) throw new FinanceError("A agência não pertence ao banco selecionado ou está inativa.");
    const account = await tx.bankAccount.update({
      where: { id },
      data: {
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
      },
    });
    await audit(tx, actor, "UPDATE", "BankAccount", account.id, { detailsOnly: true });
    return account;
  });
}

type TreasuryTransferInput = {
  date: Date;
  value: Prisma.Decimal | string | number;
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
  tx: Prisma.TransactionClient,
  actor: FinanceActor,
  input: TreasuryTransferInput,
) {
  const value = money(input.value);
  if (input.sourceBankAccountId === input.destinationBankAccountId) throw new FinanceError("A transferência exige contas de origem e destino diferentes.");
  const key = input.idempotencyKey?.trim();
  if (key) await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`TREASURY_TRANSFER:${key}`}, 0))::text`;
  const [source, destination] = await Promise.all([
    tx.bankAccount.findUnique({ where: { id: input.sourceBankAccountId }, select: { isActive: true, budgetUnitId: true, accountingPlanId: true, resourceSourceId: true } }),
    tx.bankAccount.findUnique({ where: { id: input.destinationBankAccountId }, select: { isActive: true, budgetUnitId: true, accountingPlanId: true, resourceSourceId: true } }),
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
    const existing = await tx.treasuryTransfer.findUnique({ where: { idempotencyKey: key }, include: { sourceMovement: true } });
    if (existing) {
      if (existing.sourceMovement.resourceSourceId !== resourceSourceId || existing.date.getTime() !== input.date.getTime() || !existing.valueDecimal.equals(value) || existing.sourceBankAccountId !== input.sourceBankAccountId || existing.destinationBankAccountId !== input.destinationBankAccountId || existing.history !== (input.history?.trim() || null) || existing.sourceMovement.sourceModule !== (input.sourceModule?.trim() || "FINANCEIRO") || existing.sourceMovement.sourceType !== (input.sourceType?.trim() || "TREASURY_TRANSFER") || existing.sourceMovement.sourceId !== (input.sourceId?.trim() || key) || existing.sourceMovement.eventType !== (input.eventType?.trim() || "TRANSFER")) throw new FinanceError("Transferência já registrada com outros dados.");
      return existing;
    }
  }
  const [sourceEntity, destinationEntity] = await Promise.all([
    tx.planningEntityUnit.findUnique({ where: { budgetUnitId: source.budgetUnitId }, select: { governmentEntityId: true } }),
    tx.planningEntityUnit.findUnique({ where: { budgetUnitId: destination.budgetUnitId }, select: { governmentEntityId: true } }),
  ]);
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
  const debit = await tx.treasuryMovement.create({ data: { ...common, direction: "Saída", bankAccountId: input.sourceBankAccountId, idempotencyKey: key ? `${key}:OUT` : undefined } });
  const credit = await tx.treasuryMovement.create({ data: { ...common, direction: "Entrada", bankAccountId: input.destinationBankAccountId, idempotencyKey: key ? `${key}:IN` : undefined } });
  const transfer = await tx.treasuryTransfer.create({
    data: { date: input.date, valueDecimal: value, history: input.history?.trim() || undefined, sourceBankAccountId: input.sourceBankAccountId, destinationBankAccountId: input.destinationBankAccountId, sourceMovementId: debit.id, destinationMovementId: credit.id, idempotencyKey: input.idempotencyKey?.trim() || undefined },
  });
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
    const clearingEvents = await tx.accountingEventCatalog.findMany({ where: { code: { in: ["TRANSFERENCIA_UG_SAIDA", "TRANSFERENCIA_UG_ENTRADA"] }, isActive: true }, include: { rules: { where: { isActive: true } } } });
    const outgoing = clearingEvents.find((event) => event.code === "TRANSFERENCIA_UG_SAIDA");
    const incoming = clearingEvents.find((event) => event.code === "TRANSFERENCIA_UG_ENTRADA");
    if (outgoing?.rules.length !== 1 || incoming?.rules.length !== 1) throw new FinanceError("Transferência entre UGs exige uma regra ativa para cada perna contábil.");
    if (outgoing.rules[0].debitAccountId !== incoming.rules[0].creditAccountId || [source.accountingPlanId, destination.accountingPlanId].includes(outgoing.rules[0].debitAccountId)) throw new FinanceError("As pernas da transferência devem utilizar a mesma conta de trânsito, distinta das contas bancárias.");
    await postAccountingEventInTransaction(tx, actor, { ...accountingInput, budgetUnitId: source.budgetUnitId, eventCode: "TRANSFERENCIA_UG_SAIDA", creditAccountId: source.accountingPlanId, idempotencyKey: `${accountingKey}:OUT` });
    await postAccountingEventInTransaction(tx, actor, { ...accountingInput, budgetUnitId: destination.budgetUnitId, eventCode: "TRANSFERENCIA_UG_ENTRADA", debitAccountId: destination.accountingPlanId, idempotencyKey: `${accountingKey}:IN` });
  }
  await audit(tx, actor, "CREATE", "TreasuryTransfer", transfer.id, { value: jsonMoney(value), sourceBankAccountId: input.sourceBankAccountId, destinationBankAccountId: input.destinationBankAccountId }, year.id);
  return transfer;
}

export async function createTreasuryTransfer(
  db: PrismaClient,
  actor: FinanceActor,
  input: TreasuryTransferInput,
) {
  return db.$transaction((tx) => createTreasuryTransferInTransaction(tx, actor, input));
}

export async function recordConfirmedRevenue(
  tx: Prisma.TransactionClient,
  actor: FinanceActor,
  input: { date: Date; value: Prisma.Decimal | string | number; revenueNatureId: string; resourceSourceId: string; bankAccountId: string; classification?: RevenueClassification; history?: string; sourceModule: string; sourceType: string; sourceId?: string; eventType: string; idempotencyKey: string; integrationEventId?: string; bankTransactionId?: string; bankAccountExternalId?: string; collectionReference?: string },
) {
  const value = money(input.value);
  if (!input.idempotencyKey.trim()) throw new FinanceError("A arrecadacao exige chave de idempotencia.");
  await lockPlanningRevenueBudget(tx, input.bankAccountId, input.date);
  await lockBankAccount(tx, input.bankAccountId);
  const existing = await tx.revenue.findUnique({ where: { idempotencyKey: input.idempotencyKey }, include: { treasuryMovement: true } });
  if (existing) {
    if (existing.budgetUnitId) assertActorBudgetUnit(actor, existing.budgetUnitId);
    else if (actor.allowedBudgetUnitIds) throw new FinanceError("Arrecadação legada sem UG conciliada.");
    if (!existing.valueDecimal?.equals(value) || existing.revenueNatureId !== input.revenueNatureId || existing.resourceSourceId !== input.resourceSourceId || existing.bankAccountId !== input.bankAccountId || existing.collectionDate?.getTime() !== input.date.getTime() || existing.sourceModule !== input.sourceModule.trim() || existing.sourceType !== input.sourceType.trim() || existing.sourceId !== (input.sourceId?.trim() || null) || existing.eventType !== input.eventType.trim() || existing.history !== (input.history?.trim() || null) || existing.classification !== (input.classification ?? "ORCAMENTARIA")) throw new FinanceError("Arrecadação já registrada com outros dados.");
    return existing;
  }
  const [bankAccount, nature, source] = await Promise.all([
    tx.bankAccount.findUnique({ where: { id: input.bankAccountId }, select: { isActive: true, resourceSourceId: true, accountingPlanId: true, budgetUnitId: true } }),
    tx.revenueNature.findUnique({ where: { id: input.revenueNatureId }, select: { id: true } }),
    tx.resourceSource.findUnique({ where: { id: input.resourceSourceId }, select: { id: true } }),
  ]);
  if (!bankAccount?.isActive) throw new FinanceError("A receita exige uma conta bancária ativa.");
  if (bankAccount.budgetUnitId) assertActorBudgetUnit(actor, bankAccount.budgetUnitId);
  const year = await financialYearForPosting(tx, input.date, bankAccount.budgetUnitId);
  await assertBankResourceSource(tx, input.bankAccountId, input.resourceSourceId);
  if (!nature || !source) throw new FinanceError("Natureza e fonte da receita devem estar configuradas.");
  const revenue = await tx.revenue.create({
    // Persist the originating UG independently of the collecting bank account.
    data: { date: input.date, valueDecimal: value, value: legacyMoney(value), financialYearId: year.id, budgetUnitId: bankAccount.budgetUnitId, revenueNatureId: input.revenueNatureId, resourceSourceId: input.resourceSourceId, bankAccountId: input.bankAccountId, classification: input.classification ?? "ORCAMENTARIA", collectionDate: input.date, history: input.history?.trim() || undefined, sourceModule: input.sourceModule.trim(), sourceType: input.sourceType.trim(), sourceId: input.sourceId?.trim() || undefined, eventType: input.eventType.trim(), idempotencyKey: input.idempotencyKey, integrationEventId: input.integrationEventId, bankTransactionId: input.bankTransactionId, bankAccountExternalId: input.bankAccountExternalId, collectionReference: input.collectionReference, status: "Arrecadada", stage: "ARRECADADA" },
  });
  const movement = await tx.treasuryMovement.create({
    data: { date: input.date, type: "Revenue", resourceSourceId: input.resourceSourceId, direction: "Entrada", valueDecimal: value, history: revenue.history, bankAccountId: input.bankAccountId, financialYearId: year.id, revenueId: revenue.id, sourceModule: input.sourceModule.trim(), sourceType: input.sourceType.trim(), sourceId: input.sourceId?.trim() || undefined, eventType: input.eventType.trim(), idempotencyKey: `${input.idempotencyKey}:TREASURY` },
  });
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
  db: PrismaClient,
  actor: FinanceActor,
  input: { date: Date; value: Prisma.Decimal | string | number; revenueNatureId: string; resourceSourceId: string; bankAccountId: string; classification?: RevenueClassification; history?: string; sourceModule: string; sourceType: string; sourceId?: string; eventType: string; idempotencyKey: string },
) {
  return db.$transaction((tx) => recordConfirmedRevenue(tx, actor, input));
}

export async function launchRevenue(
  db: PrismaClient,
  actor: FinanceActor,
  input: { date: Date; value: Prisma.Decimal | string | number; revenueNatureId: string; resourceSourceId: string; budgetUnitId?: string; classification?: RevenueClassification; history?: string; sourceModule: string; sourceType: string; sourceId?: string; eventType: string; idempotencyKey: string },
) {
  const value = money(input.value);
  if (!input.idempotencyKey.trim()) throw new FinanceError("O lancamento da receita exige chave de idempotencia.");
  if (input.budgetUnitId) assertActorBudgetUnit(actor, input.budgetUnitId);
  return db.$transaction(async (tx) => {
    const existing = await tx.revenue.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (existing) {
      if (existing.budgetUnitId !== (input.budgetUnitId ?? null) || !existing.valueDecimal?.equals(value) || existing.revenueNatureId !== input.revenueNatureId || existing.resourceSourceId !== input.resourceSourceId || existing.launchDate?.getTime() !== input.date.getTime()) throw new FinanceError("Receita já lançada com outros dados.");
      return existing;
    }
    const [year, nature, source] = await Promise.all([
      financialYearForPosting(tx, input.date, input.budgetUnitId),
      tx.revenueNature.findUnique({ where: { id: input.revenueNatureId }, select: { id: true } }),
      tx.resourceSource.findUnique({ where: { id: input.resourceSourceId }, select: { id: true } }),
    ]);
    if (!nature || !source) throw new FinanceError("Natureza e fonte da receita devem estar configuradas.");
    const revenue = await tx.revenue.create({
      data: {
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
      },
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
  db: PrismaClient,
  actor: FinanceActor,
  input: { revenueId: string; date: Date; bankAccountId: string; idempotencyKey: string },
) {
  if (!input.idempotencyKey.trim()) throw new FinanceError("A arrecadacao exige chave de idempotencia.");
  return db.$transaction(async (tx) => {
    await lockPlanningRevenueBudget(tx, input.bankAccountId, input.date);
    await lockBankAccount(tx, input.bankAccountId);
    await lockRevenue(tx, input.revenueId);
    const revenue = await tx.revenue.findUnique({ where: { id: input.revenueId }, include: { treasuryMovement: true } });
    if (!revenue) throw new FinanceError("Receita nao encontrada.");
    if (revenue.budgetUnitId) assertActorBudgetUnit(actor, revenue.budgetUnitId);
    else if (actor.allowedBudgetUnitIds) throw new FinanceError("Receita legada sem unidade gestora conciliada.");
    if (revenue.stage !== "LANCADA" || revenue.treasuryMovement) throw new FinanceError("Somente receitas lancadas e ainda nao arrecadadas podem ser efetivadas.");
    const account = await tx.bankAccount.findUnique({ where: { id: input.bankAccountId }, select: { isActive: true, resourceSourceId: true, accountingPlanId: true, budgetUnitId: true } });
    const year = await financialYearForPosting(tx, input.date, account?.budgetUnitId);
    if (year.id !== revenue.financialYearId) throw new FinanceError("A arrecadacao deve ocorrer no mesmo exercicio financeiro da receita lancada.");
    if (!account?.isActive) throw new FinanceError("A arrecadação exige uma conta bancária ativa.");
    if (account.budgetUnitId) assertActorBudgetUnit(actor, account.budgetUnitId);
    if (revenue.budgetUnitId && revenue.budgetUnitId !== account.budgetUnitId) throw new FinanceError("A conta arrecadadora deve pertencer à unidade gestora do lançamento da receita.");
    await lockBankAccount(tx, input.bankAccountId);
    await assertBankResourceSource(tx, input.bankAccountId, revenue.resourceSourceId);
    const value = requiredDecimal(revenue.valueDecimal, "Revenue.valueDecimal");
    const collected = await tx.revenue.update({
      where: { id: revenue.id },
      data: { date: input.date, collectionDate: input.date, bankAccountId: input.bankAccountId, budgetUnitId: revenue.budgetUnitId ?? account.budgetUnitId, status: "Arrecadada", stage: "ARRECADADA" },
    });
    const movement = await tx.treasuryMovement.create({
      data: { date: input.date, type: "Revenue", resourceSourceId: revenue.resourceSourceId, direction: "Entrada", valueDecimal: value, history: collected.history, bankAccountId: input.bankAccountId, financialYearId: year.id, revenueId: collected.id, sourceModule: collected.sourceModule, sourceType: collected.sourceType, sourceId: collected.sourceId ?? collected.id, eventType: "REVENUE_COLLECTED", idempotencyKey: `${input.idempotencyKey}:TREASURY` },
    });
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
  db: PrismaClient,
  actor: FinanceActor,
  input: { revenueId: string; date: Date; justification: string },
) {
  return db.$transaction((tx) => reverseRevenueInTransaction(tx, actor, input));
}

/** Tax callers supply the linked payment inside their encompassing transaction. */
export async function reverseRevenueInTransaction(
  tx: Prisma.TransactionClient,
  actor: FinanceActor,
  input: { revenueId: string; date: Date; justification: string; taxPaymentId?: string },
) {
  if (!input.justification.trim()) throw new FinanceError("A justificativa do estorno da receita e obrigatoria.");
    await assertAdvanceRefundReversalAllowed(tx, actor, input.revenueId);
    await lockRevenue(tx, input.revenueId);
    const revenue = await tx.revenue.findUnique({
      where: { id: input.revenueId },
      include: { treasuryMovement: true, taxIntegration: true, reversal: true, resourceRedistributions: { select: { id: true } } },
    });
    if (!revenue) throw new FinanceError("Receita nao encontrada.");
    if (revenue.stage !== "ARRECADADA" || !revenue.treasuryMovement || revenue.reversal) throw new FinanceError("Somente receitas arrecadadas sem estorno anterior podem ser estornadas.");
    if (revenue.budgetUnitId) assertActorBudgetUnit(actor, revenue.budgetUnitId);
    else if (actor.allowedBudgetUnitIds) throw new FinanceError("Receita legada sem unidade gestora conciliada.");
    if (revenue.taxIntegration && revenue.taxIntegration.taxPaymentId !== input.taxPaymentId) throw new FinanceError("A receita originada de pagamento tributario deve ser estornada pelo fluxo tributario proprio.");
    if (input.taxPaymentId && revenue.taxIntegration?.taxPaymentId !== input.taxPaymentId) throw new FinanceError("O pagamento tributário diverge da origem da receita.");
    if (revenue.resourceRedistributions.length) throw new FinanceError("A receita possui redistribuicoes por fonte. Regularize-as antes do estorno.");
    const value = requiredDecimal(revenue.valueDecimal, "Revenue.valueDecimal");
    const bankAccount = await tx.bankAccount.findUnique({
      where: { id: revenue.treasuryMovement.bankAccountId },
      select: { accountingPlanId: true, budgetUnitId: true },
    });
    const year = await financialYearForPosting(tx, input.date, bankAccount?.budgetUnitId);
    if (year.id !== revenue.financialYearId) throw new FinanceError("O estorno deve ocorrer no mesmo exercicio financeiro da receita arrecadada.");
    if (revenue.collectionDate && input.date < revenue.collectionDate) throw new FinanceError("O estorno não pode anteceder a arrecadação.");
    await lockBankAccount(tx, revenue.treasuryMovement.bankAccountId);
    const balance = await getBankAccountBalance(tx, revenue.treasuryMovement.bankAccountId, input.date);
    if ((await getBankResourceSourceSpendableBalance(tx, revenue.treasuryMovement.bankAccountId, revenue.resourceSourceId, input.date)).lt(value)) throw new FinanceError("Saldo por fonte insuficiente para estornar a receita.");
    if (balance.lessThan(value)) throw new FinanceError("Saldo financeiro insuficiente para estornar a receita.");
    const movement = await tx.treasuryMovement.create({
      data: { date: input.date, type: "RevenueReversal", resourceSourceId: revenue.resourceSourceId, direction: "Saída", valueDecimal: value, history: `Estorno de receita ${revenue.id}: ${input.justification.trim()}`, bankAccountId: revenue.treasuryMovement.bankAccountId, financialYearId: year.id, sourceModule: "FINANCEIRO", sourceType: "REVENUE_REVERSAL", sourceId: revenue.id, eventType: "REVENUE_REVERSED", idempotencyKey: `FINANCEIRO:REVENUE:${revenue.id}:REVERSED` },
    });
    const reversal = await tx.revenueReversal.create({
      data: { revenueId: revenue.id, date: input.date, valueDecimal: value, justification: input.justification.trim(), financialYearId: year.id, treasuryMovementId: movement.id },
    });
    const reversed = await tx.revenue.update({ where: { id: revenue.id }, data: { status: "Estornada", stage: "ESTORNADA", reversedAt: input.date } });
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
  db: PrismaClient,
  actor: FinanceActor,
  input: { revenueId: string; date: Date; value: Prisma.Decimal | string | number; destinationResourceSourceId: string; history: string; idempotencyKey?: string },
) {
  const value = money(input.value);
  if (!input.history.trim()) throw new FinanceError("Informe o historico da redistribuicao de fonte.");
  if (!Number.isFinite(input.date.getTime())) throw new FinanceError("Data de redistribuição inválida.");
  return db.$transaction(async (tx) => {
    await lockRevenue(tx, input.revenueId);
    const revenue = await tx.revenue.findUnique({ where: { id: input.revenueId }, select: { id: true, budgetUnitId: true, stage: true, valueDecimal: true, resourceSourceId: true, financialYearId: true, bankAccountId: true, collectionDate: true, revenueNatureId: true } });
    if (!revenue) throw new FinanceError("Receita da redistribuição não encontrada.");
    if (revenue.budgetUnitId) assertActorBudgetUnit(actor, revenue.budgetUnitId);
    else if (actor.allowedBudgetUnitIds) throw new FinanceError("Receita legada sem unidade gestora conciliada.");
    if (input.idempotencyKey?.trim()) {
      const existing = await tx.revenueResourceRedistribution.findUnique({ where: { idempotencyKey: input.idempotencyKey.trim() } });
      if (existing) {
        if (existing.revenueId !== revenue.id || existing.date.getTime() !== input.date.getTime() || !existing.valueDecimal.equals(value) || existing.destinationResourceSourceId !== input.destinationResourceSourceId || existing.history !== input.history.trim()) throw new FinanceError("Chave da redistribuição já utilizada com outro conteúdo.");
        return existing;
      }
    }
    if (revenue.stage !== "ARRECADADA") throw new FinanceError("Somente receitas arrecadadas podem ter fonte redistribuida.");
    if (revenue.collectionDate && input.date < revenue.collectionDate) throw new FinanceError("Redistribuição não pode anteceder a arrecadação.");
    if (revenue.resourceSourceId === input.destinationResourceSourceId) throw new FinanceError("A fonte de destino deve ser diferente da fonte de origem.");
    const [destination, redistributed, bankAccount] = await Promise.all([
      tx.resourceSource.findUnique({ where: { id: input.destinationResourceSourceId }, select: { id: true } }),
      tx.revenueResourceRedistribution.aggregate({ where: { revenueId: revenue.id }, _sum: { valueDecimal: true } }),
      revenue.bankAccountId ? tx.bankAccount.findUnique({ where: { id: revenue.bankAccountId }, select: { budgetUnitId: true } }) : null,
    ]);
    if (bankAccount?.budgetUnitId && revenue.budgetUnitId && bankAccount.budgetUnitId !== revenue.budgetUnitId) throw new FinanceError("Banco e receita divergem na unidade gestora.");
    const budgetUnitId = revenue.budgetUnitId ?? bankAccount?.budgetUnitId ?? undefined;
    const year = await financialYearForPosting(tx, input.date, budgetUnitId);
    if (year.id !== revenue.financialYearId) throw new FinanceError("A redistribuicao deve ocorrer no mesmo exercicio financeiro da receita.");
    if (!destination) throw new FinanceError("Fonte de destino nao encontrada.");
    const available = requiredDecimal(revenue.valueDecimal, "Revenue.valueDecimal").minus(redistributed._sum.valueDecimal ?? new Prisma.Decimal(0));
    if (available.lessThan(value)) throw new FinanceError("A redistribuicao excede o valor ainda disponivel na fonte de origem.");
    if (!revenue.bankAccountId) throw new FinanceError("Receita sem conta bancária documental para redistribuição.");
    await lockBankAccount(tx, revenue.bankAccountId);
    await assertBankResourceSource(tx, revenue.bankAccountId, destination.id);
    if ((await getBankResourceSourceSpendableBalance(tx, revenue.bankAccountId, revenue.resourceSourceId, input.date)).lt(value)) throw new FinanceError("Redistribuição excede o saldo bancário disponível na fonte de origem.");
    const redistribution = await tx.revenueResourceRedistribution.create({
      data: { revenueId: revenue.id, date: input.date, valueDecimal: value, sourceResourceSourceId: revenue.resourceSourceId, destinationResourceSourceId: destination.id, financialYearId: year.id, history: input.history.trim(), idempotencyKey: input.idempotencyKey?.trim() || undefined },
    });
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

export async function dailyTreasuryBulletin(tx: Db, date: Date, bankAccountId?: string) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const movements = await tx.treasuryMovement.findMany({
    where: { status: "Confirmado", ...(bankAccountId ? { bankAccountId } : {}), date: { gte: start, lt: end } },
    select: { direction: true, type: true, valueDecimal: true },
  });
  const opening = await tx.treasuryMovement.findMany({
    where: { status: "Confirmado", ...(bankAccountId ? { bankAccountId } : {}), date: { lt: start } },
    select: { direction: true, valueDecimal: true },
  });
  const openingBalance = opening.reduce((total, movement) => total.plus(signedValue(movement.direction, movement.valueDecimal)), new Prisma.Decimal(0));
  const incoming = movements.filter((movement) => movement.direction === "Entrada").reduce((total, movement) => total.plus(movement.valueDecimal), new Prisma.Decimal(0));
  const outgoing = movements.filter((movement) => movement.direction === "Saída").reduce((total, movement) => total.plus(movement.valueDecimal), new Prisma.Decimal(0));
  return { date: start, openingBalance, incoming, outgoing, closingBalance: openingBalance.plus(incoming).minus(outgoing), movements };
}

export async function basicCashflow(tx: Db, startDate: Date, endDate: Date, bankAccountId?: string) {
  const movements = await tx.treasuryMovement.findMany({
    where: { status: "Confirmado", ...(bankAccountId ? { bankAccountId } : {}), date: { gte: startDate, lte: endDate } },
    select: { date: true, direction: true, valueDecimal: true },
    orderBy: { date: "asc" },
  });
  return movements.reduce<Record<string, { incoming: Prisma.Decimal; outgoing: Prisma.Decimal; net: Prisma.Decimal }>>((days, movement) => {
    const key = movement.date.toISOString().slice(0, 10);
    const entry = days[key] ?? { incoming: new Prisma.Decimal(0), outgoing: new Prisma.Decimal(0), net: new Prisma.Decimal(0) };
    if (movement.direction === "Entrada") entry.incoming = entry.incoming.plus(movement.valueDecimal);
    else entry.outgoing = entry.outgoing.plus(movement.valueDecimal);
    entry.net = entry.incoming.minus(entry.outgoing);
    days[key] = entry;
    return days;
  }, {});
}

function parseCsvLine(line: string, separator: string) {
  const values: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') { value += '"'; index += 1; }
      else quoted = !quoted;
    } else if (character === separator && !quoted) { values.push(value.trim()); value = ""; }
    else value += character;
  }
  values.push(value.trim());
  return values;
}

function parseCsvAmount(raw: string) {
  const value = raw.trim();
  // Brazilian values use dots as thousands separators only when a comma is present.
  const normalized = value.includes(",") ? value.replace(/\./g, "").replace(",", ".") : value;
  return new Prisma.Decimal(normalized);
}

function parseCsvDate(raw: string) {
  const value = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new FinanceError("CSV contém data inválida. Use o formato YYYY-MM-DD.");
  const date = new Date(`${value}T12:00:00.000Z`);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value) {
    throw new FinanceError("CSV contém data inválida.");
  }
  return date;
}

function assertActorCanAccessBankAccount(actor: FinanceActor, budgetUnitId: string | null) {
  if (actor.allowedBudgetUnitIds && (!budgetUnitId || !actor.allowedBudgetUnitIds.includes(budgetUnitId))) {
    throw new FinanceError("Acesso negado à Unidade Gestora da conta bancária.");
  }
}

export async function importBankStatementCsv(
  db: PrismaClient,
  actor: FinanceActor,
  input: { bankAccountId: string; content: string; fileName?: string; separator?: "," | ";"; originalBytes?: Uint8Array },
) {
  if (input.originalBytes) {
    let decoded: string;
    try { decoded = new TextDecoder("utf-8", { fatal: true }).decode(input.originalBytes); }
    catch { throw new FinanceError("O CSV deve estar codificado em UTF-8."); }
    if (decoded !== input.content) throw new FinanceError("O conteúdo CSV não corresponde aos bytes originais.");
  }
  const separator = input.separator ?? (input.content.split("\n")[0]?.includes(";") ? ";" : ",");
  const rows = input.content.split(/\r?\n/).filter((row) => row.trim());
  if (rows.length < 2) throw new FinanceError("O CSV deve ter cabeçalho e ao menos um lançamento.");
  const headers = parseCsvLine(rows[0], separator).map((header) => header.toLowerCase().trim());
  const required = ["date", "description", "amount"];
  if (!required.every((header) => headers.includes(header))) throw new FinanceError("O CSV deve conter as colunas date, description e amount.");
  const bytes = input.originalBytes ?? Buffer.from(input.content, "utf8");
  const checksum = createHash("sha256").update(bytes).digest("hex");
  try {
    return await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "BankAccount" WHERE id = ${input.bankAccountId} FOR UPDATE`;
      const account = await tx.bankAccount.findUnique({ where: { id: input.bankAccountId }, select: { id: true, budgetUnitId: true, isActive: true } });
      if (!account) throw new FinanceError("Conta bancária não encontrada.");
      if (!account.isActive) throw new FinanceError("A importação exige uma conta bancária ativa.");
      assertActorCanAccessBankAccount(actor, account.budgetUnitId);
      const existing = await tx.bankStatementImport.findUnique({ where: { bankAccountId_checksum: { bankAccountId: input.bankAccountId, checksum } } });
      if (existing) return existing;
      const importRecord = await tx.bankStatementImport.create({ data: { bankAccountId: account.id, format: "CSV", fileName: input.fileName?.trim() || undefined, checksum, originalBytes: Buffer.from(bytes), originalEncoding: "utf-8" } });
      for (const row of rows.slice(1)) {
        const values = parseCsvLine(row, separator);
        const item = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
        const amount = parseCsvAmount(item.amount);
        if (!amount.isFinite() || amount.isZero()) throw new FinanceError("CSV contém valor inválido ou zero.");
        const date = parseCsvDate(item.date);
        await tx.bankStatementItem.create({ data: { statementImportId: importRecord.id, date, description: item.description || undefined, reference: item.reference || undefined, direction: amount.isNegative() ? "Saída" : "Entrada", valueDecimal: amount.abs() } });
      }
      await audit(tx, actor, "IMPORT", "BankStatementImport", importRecord.id, { format: "CSV", fileName: importRecord.fileName });
      return importRecord;
    });
  } catch (error) {
    // A concurrent upload of the same file loses the unique-key race but is still idempotent.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await db.bankStatementImport.findUnique({ where: { bankAccountId_checksum: { bankAccountId: input.bankAccountId, checksum } } });
      if (existing) return existing;
    }
    throw error;
  }
}

export async function matchBankStatementItemToTreasuryMovement(
  db: PrismaClient,
  actor: FinanceActor,
  input: { statementItemId: string; treasuryMovementId: string },
) {
  if (!input.statementItemId.trim() || !input.treasuryMovementId.trim()) {
    throw new FinanceError("Selecione o lançamento do extrato e o movimento de tesouraria.");
  }
  return db.$transaction(async (tx) => {
    await lockBankStatementItem(tx, input.statementItemId);
    await lockTreasuryMovement(tx, input.treasuryMovementId);

    const [statementItem, treasuryMovement] = await Promise.all([
      tx.bankStatementItem.findUnique({
        where: { id: input.statementItemId },
        select: {
          id: true,
          status: true,
          treasuryMovementId: true,
          bankAccountId: true,
          direction: true,
          sinal: true,
          valueDecimal: true,
          banco: true,
          agencia: true,
          contaNumero: true,
          statementImport: { select: { bankAccountId: true, bankAccount: { select: { budgetUnitId: true } } } },
        },
      }),
      tx.treasuryMovement.findUnique({
        where: { id: input.treasuryMovementId },
        select: { id: true, bankAccountId: true, status: true, direction: true, valueDecimal: true, bankAccount: { select: { bankName: true, agency: true, accountNumber: true, budgetUnitId: true } }, statementItems: { select: { id: true } } },
      }),
    ]);
    if (!statementItem) throw new FinanceError("Item de extrato não encontrado.");
    if (!treasuryMovement) throw new FinanceError("Movimento de tesouraria não encontrado.");
    const budgetUnitId = statementItem.statementImport?.bankAccount?.budgetUnitId ?? treasuryMovement.bankAccount.budgetUnitId;
    if (budgetUnitId) {
      assertActorCanAccessBankAccount(actor, budgetUnitId);
    }
    if (statementItem.status !== "Pendente" || statementItem.treasuryMovementId) {
      throw new FinanceError("O item de extrato já foi conciliado.");
    }
    const bankAccountId = statementItem.bankAccountId ?? statementItem.statementImport?.bankAccountId;
    if (bankAccountId && bankAccountId !== treasuryMovement.bankAccountId) {
      throw new FinanceError("O movimento de tesouraria deve pertencer à mesma conta bancária do extrato.");
    }
    if (
      (statementItem.banco && statementItem.banco !== treasuryMovement.bankAccount.bankName)
      || (statementItem.agencia && statementItem.agencia !== treasuryMovement.bankAccount.agency)
      || (statementItem.contaNumero && statementItem.contaNumero !== treasuryMovement.bankAccount.accountNumber)
    ) {
      throw new FinanceError("O movimento de tesouraria deve pertencer ao mesmo banco, agência e conta do extrato.");
    }
    const statementDirection = statementItem.sinal === "DEBITO" || statementItem.direction === "DEBIT" || statementItem.direction === "Saída" || statementItem.valueDecimal.lessThan(0) ? "Saída" : "Entrada";
    const movementDirection = treasuryMovement.direction === "DEBIT" || treasuryMovement.direction === "Saída" ? "Saída" : "Entrada";
    if (statementDirection !== movementDirection) {
      throw new FinanceError("O movimento de tesouraria deve possuir o mesmo sentido do lançamento bancário.");
    }
    if (!statementItem.valueDecimal.abs().equals(treasuryMovement.valueDecimal.abs())) {
      throw new FinanceError("O movimento de tesouraria deve possuir o mesmo valor do lançamento bancário.");
    }
    if (treasuryMovement.status !== "Confirmado") {
      throw new FinanceError("Somente movimentos de tesouraria confirmados podem ser conciliados.");
    }
    if (treasuryMovement.statementItems.length) {
      throw new FinanceError("O movimento de tesouraria já está vinculado a outro item de extrato.");
    }
    if (await tx.bankReconciliationAllocation.count({ where: { group: { status: "EFETIVADO" }, OR: [{ statementItemId: statementItem.id }, { treasuryMovementId: treasuryMovement.id }] } })) throw new FinanceError("Lançamento já possui alocações de conciliação; utilize o saldo parcial no fluxo N:N.");

    const matched = await tx.bankStatementItem.update({
      where: { id: statementItem.id },
      data: { treasuryMovementId: treasuryMovement.id, status: "Conciliado" },
    });
    await audit(tx, actor, "MATCH", "BankStatementItem", matched.id, {
      treasuryMovementId: treasuryMovement.id,
      bankAccountId: treasuryMovement.bankAccountId,
    }, undefined, budgetUnitId ?? undefined);
    return matched;
  });
}

function accountingMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

async function lockAccountingPeriod(tx: Db, financialYearId: string, date: Date) {
  if (!Number.isFinite(date.getTime())) throw new FinanceError("Competência contábil inválida.");
  const key = `ACCOUNTING_PERIOD:${financialYearId}:${accountingMonth(date).toISOString()}`;
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`;
}

export async function assertAccountingPeriodOpen(tx: Db, financialYearId: string, date: Date) {
  await lockAccountingPeriod(tx, financialYearId, date);
  const close = await tx.monthlyAccountingClose.findUnique({
    where: { financialYearId_competence: { financialYearId, competence: accountingMonth(date) } },
    select: { status: true },
  });
  if (close && close.status !== "ABERTO") throw new FinanceError("A competencia contabil nao esta aberta para novas postagens.");
}

export type AccountingLine = {
  accountId: string;
  type: "Débito" | "Crédito";
  value: Prisma.Decimal | string | number;
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
  value: Prisma.Decimal | string | number;
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

function accountingTotals(lines: AccountingLine[]) {
  if (lines.length < 2) throw new FinanceError("Uma partida contabil exige ao menos dois lancamentos.");
  const totals = lines.reduce((result, line) => {
    if (!line.accountId || !["Débito", "Crédito"].includes(line.type)) throw new FinanceError("Conta e natureza contabil invalidas.");
    const value = money(line.value);
    if (line.type === "Débito") result.debit = result.debit.plus(value);
    else result.credit = result.credit.plus(value);
    return result;
  }, { debit: new Prisma.Decimal(0), credit: new Prisma.Decimal(0) });
  if (!totals.debit.equals(totals.credit)) throw new FinanceError("A postagem foi bloqueada: debitos e creditos devem ser iguais.");
  return totals;
}

async function resolveAccountingScope(
  tx: Prisma.TransactionClient,
  actor: FinanceActor,
  input: AccountingPostingInput,
): Promise<{ governmentEntityId: string; budgetUnitId: string } | null> {
  let budgetUnitId = input.budgetUnitId?.trim() || null;
  if (input.governmentEntityId && !budgetUnitId) throw new FinanceError("Informe a unidade gestora junto à entidade do lançamento contábil.");

  if (input.sourceId) {
    const suppliedBudgetUnitId = budgetUnitId;
    const sourceType = input.sourceType ?? "";
    const canonicalRevenue = await tx.revenue.findFirst({ where: { id: input.sourceId, sourceModule: input.sourceModule ?? "MANUAL", sourceType }, select: { budgetUnitId: true } });
    const canonicalSource = !!canonicalRevenue || ["BUDGET_APPROPRIATION_OPENING", "COMMITMENT", "COMMITMENT_REVERSAL", "COMMITMENT_MOVEMENT", "SETTLEMENT", "PAYMENT", "WITHHOLDING_PAYABLE", "BANK_ACCOUNT", "BANK_ACCOUNT_OPENING_BALANCE", "BANK_STATEMENT_INVESTMENT_TRANSFER", "BANK_STATEMENT_CLASSIFICATION", "PLANNING_BUDGET", "REVENUE_REVERSAL", "REVENUE_RESOURCE_REDISTRIBUTION"].includes(sourceType);
    if (canonicalSource) budgetUnitId = null;
    if (sourceType === "BUDGET_APPROPRIATION_OPENING") {
      budgetUnitId = (await tx.budgetAppropriation.findUnique({ where: { id: input.sourceId }, select: { budgetUnitId: true } }))?.budgetUnitId ?? null;
    } else if (["COMMITMENT", "COMMITMENT_REVERSAL"].includes(sourceType)) {
      budgetUnitId = (await tx.commitment.findUnique({ where: { id: input.sourceId }, select: { appropriation: { select: { budgetUnitId: true } } } }))?.appropriation.budgetUnitId ?? null;
    } else if (sourceType === "COMMITMENT_MOVEMENT") {
      budgetUnitId = (await tx.commitmentMovement.findUnique({ where: { id: input.sourceId }, select: { commitment: { select: { appropriation: { select: { budgetUnitId: true } } } } } }))?.commitment.appropriation.budgetUnitId ?? null;
    } else if (sourceType === "SETTLEMENT") {
      budgetUnitId = (await tx.settlement.findUnique({ where: { id: input.sourceId }, select: { commitment: { select: { appropriation: { select: { budgetUnitId: true } } } } } }))?.commitment.appropriation.budgetUnitId ?? null;
    } else if (sourceType === "PAYMENT") {
      budgetUnitId = (await tx.payment.findUnique({ where: { id: input.sourceId }, select: { commitment: { select: { appropriation: { select: { budgetUnitId: true } } } } } }))?.commitment.appropriation.budgetUnitId ?? null;
    } else if (sourceType === "WITHHOLDING_PAYABLE") {
      budgetUnitId = (await tx.withholdingPayable.findUnique({ where: { id: input.sourceId }, select: { retention: { select: { payment: { select: { commitment: { select: { appropriation: { select: { budgetUnitId: true } } } } } } } } } }))?.retention.payment.commitment.appropriation.budgetUnitId ?? null;
    } else if (["BANK_ACCOUNT", "BANK_ACCOUNT_OPENING_BALANCE"].includes(sourceType)) {
      budgetUnitId = (await tx.bankAccount.findUnique({ where: { id: input.sourceId }, select: { budgetUnitId: true } }))?.budgetUnitId ?? null;
    } else if (["BANK_STATEMENT_INVESTMENT_TRANSFER", "BANK_STATEMENT_CLASSIFICATION"].includes(sourceType)) {
      const item = await tx.bankStatementItem.findUnique({ where: { id: input.sourceId }, select: { bankAccount: { select: { budgetUnitId: true } } } });
      budgetUnitId = item?.bankAccount?.budgetUnitId ?? null;
    } else if (sourceType === "PLANNING_BUDGET") {
      const movement = await tx.planningLineMovement.findUnique({ where: { id: input.sourceId }, select: { line: { select: { budgetUnitId: true } } } });
      if (movement) budgetUnitId = movement.line.budgetUnitId;
      else budgetUnitId = (await tx.planningBudgetLine.findUnique({ where: { id: input.sourceId }, select: { budgetUnitId: true } }))?.budgetUnitId ?? null;
    } else if (sourceType === "REVENUE_REVERSAL") {
      budgetUnitId = (await tx.revenueReversal.findUnique({ where: { id: input.sourceId }, select: { revenue: { select: { budgetUnitId: true } } } }))?.revenue.budgetUnitId ?? null;
    } else if (sourceType === "REVENUE_RESOURCE_REDISTRIBUTION") {
      budgetUnitId = (await tx.revenueResourceRedistribution.findUnique({ where: { id: input.sourceId }, select: { revenue: { select: { budgetUnitId: true } } } }))?.revenue.budgetUnitId ?? null;
    } else if (canonicalRevenue) {
      budgetUnitId = canonicalRevenue.budgetUnitId;
    }
    if (canonicalSource && suppliedBudgetUnitId && suppliedBudgetUnitId !== budgetUnitId) throw new FinanceError("A unidade gestora informada diverge da origem canônica do lançamento.");
    if (canonicalSource && !budgetUnitId && suppliedBudgetUnitId) throw new FinanceError("Origem canônica sem unidade gestora conciliada.");
  }

  if (!budgetUnitId) return null;
  assertActorBudgetUnit(actor, budgetUnitId);
  const bindings = await tx.planningEntityUnit.findMany({ where: { budgetUnitId }, select: { governmentEntityId: true } });
  const governmentEntityId = input.governmentEntityId ?? (bindings.length === 1 ? bindings[0].governmentEntityId : null);
  if (!governmentEntityId || !bindings.some((binding) => binding.governmentEntityId === governmentEntityId)) throw new FinanceError("Unidade gestora sem vínculo único e válido à entidade para contabilização.");
  return { governmentEntityId, budgetUnitId };
}

export async function postAccountingTransaction(
  db: PrismaClient,
  actor: FinanceActor,
  input: AccountingPostingInput,
) {
  return db.$transaction((tx) => postAccountingTransactionInTransaction(tx, actor, input));
}

export async function postAccountingTransactionInTransaction(
  tx: Prisma.TransactionClient,
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
  const originalClassifications = new Map<string, Prisma.InputJsonObject>();
  for (const line of input.lines.filter(line => line.originalEntryId)) {
    const original = await tx.accountingEntry.findFirst({ where: { id: line.originalEntryId, transactionId: input.reversalOfId, accountId: line.accountId, type: line.type === "Débito" ? "Crédito" : "Débito" }, select: { classificationSnapshot: true, transaction: { select: { governmentEntityId: true, budgetUnitId: true, status: true } } } });
    if (!original) throw new FinanceError("Linha original não pertence à contraparte da transação estornada.");
    if (!original.transaction || original.transaction.status !== "POSTADO" || original.transaction.governmentEntityId !== (accountingScope?.governmentEntityId ?? null) || original.transaction.budgetUnitId !== (accountingScope?.budgetUnitId ?? null)) throw new FinanceError("Estorno deve preservar o ente e a unidade gestora da transação original.");
    if (original.classificationSnapshot && typeof original.classificationSnapshot === "object" && !Array.isArray(original.classificationSnapshot)) originalClassifications.set(line.originalEntryId!, original.classificationSnapshot as Prisma.InputJsonObject);
  }
  const yearScope = await tx.financialYear.findUnique({ where: { id: input.financialYearId }, select: { governmentEntityId: true } });
  if (accountingScope && yearScope?.governmentEntityId !== accountingScope.governmentEntityId) throw new FinanceError("A entidade do lançamento contábil deve corresponder à entidade do exercício financeiro.");
  if (!accountingScope && yearScope?.governmentEntityId) throw new FinanceError("O exercício da entidade exige lançamento com entidade e unidade gestora identificadas.");
  await lockAccountingPeriod(tx, input.financialYearId, input.date);
  if (input.idempotencyKey) {
    const existing = await tx.accountingTransaction.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (existing) {
      const entries = await tx.accountingEntry.findMany({ where: { transactionId: existing.id }, select: { accountId: true, type: true, valueDecimal: true, classificationSnapshot: true } });
      const explicitLineMapping = input.lines.some(line => line.originalEntryId);
      const expected = input.lines.map((line) => `${line.accountId}:${line.type}:${money(line.value).toFixed(2)}${explicitLineMapping ? `:${line.originalEntryId ?? ""}` : ""}`).sort();
      const persisted = entries.map((entry) => {
        const snapshot = entry.classificationSnapshot as Prisma.JsonObject | null;
        const originalId = typeof snapshot?.originalEntryId === "string" ? snapshot.originalEntryId : "";
        return `${entry.accountId}:${entry.type}:${entry.valueDecimal?.toFixed(2) ?? "NULL"}${explicitLineMapping ? `:${originalId}` : ""}`;
      }).sort();
      if (existing.financialYearId !== input.financialYearId || existing.governmentEntityId !== (accountingScope?.governmentEntityId ?? null) || existing.budgetUnitId !== (accountingScope?.budgetUnitId ?? null) || existing.date.getTime() !== input.date.getTime() || existing.history !== input.history.trim() || existing.sourceModule !== (input.sourceModule?.trim() || "MANUAL") || existing.sourceType !== (input.sourceType?.trim() || "ACCOUNTING_TRANSACTION") || existing.sourceId !== (input.sourceId?.trim() || null) || existing.eventType !== (input.eventType?.trim() || "MANUAL_POSTING") || existing.reversalOfId !== (input.reversalOfId ?? null) || JSON.stringify(expected) !== JSON.stringify(persisted)) throw new FinanceError("Chave contábil já registrada com outros dados ou escopo.");
      return existing;
    }
  }
  if (input.sourceModule === "PLANEJAMENTO" && input.sourceType === "PLANNING_BUDGET" && /^PLANNING_(BUDGET_OPENING_(REVENUE|EXPENSE)|(REVENUE|EXPENSE)_(INCREASE|DECREASE))$/.test(input.eventType ?? "")) {
    const year = await tx.financialYear.findUniqueOrThrow({ where: { id: input.financialYearId } });
    if (!["Preparação", "Aberto"].includes(year.status) || input.date < year.startDate || input.date > year.endDate || input.date.getUTCFullYear() !== year.year) throw new FinanceError("Exercício indisponível para contabilização orçamentária de Planejamento.");
   } else if (annualOrigin && annualOrigin.edition.stage !== "OPENING" || annualResultReversal) {
     const year = await tx.financialYear.findUniqueOrThrow({ where: { id: input.financialYearId } });
     if (year.status !== "Em Encerramento" || input.date.getTime() !== year.endDate.getTime() || await tx.monthlyAccountingClose.count({ where: { financialYearId: year.id, status: "FECHADO" } }) !== 12) throw new FinanceError("Partidas de encerramento exigem exercício em encerramento com doze competências fechadas.");
   } else await assertFinancialYearOpen(tx, input.financialYearId, input.date);
   if ((!annualOrigin || annualOrigin.edition.stage === "OPENING") && !annualResultReversal) await assertAccountingPeriodOpen(tx, input.financialYearId, input.date);
  const accounts = await tx.accountingPlan.findMany({ where: { id: { in: input.lines.map((line) => line.accountId) } }, select: { id: true, code: true } });
  if (accounts.length !== new Set(input.lines.map((line) => line.accountId)).size) throw new FinanceError("Uma ou mais contas contabeis nao foram encontradas.");
  let classifications: Map<string, Prisma.InputJsonObject>;
   try { classifications = await resolveAccountClassificationSnapshots(tx, accounts.filter(account => input.lines.some((line, index) => line.accountId === account.id && !line.originalEntryId && !annualOrigin?.memories[index].classification)), input.date, accountingScope ?? undefined); }
  catch (error) { throw new FinanceError(error instanceof Error ? error.message : "Classificação contábil inválida."); }
  const dimensions = accountingScope ? await resolveAccountingSourceDimensions(tx, { ...input, ...accountingScope }) : null;
  const lineDimensions: Array<Prisma.InputJsonObject | null> = [];
   for (const [index, line] of input.lines.entries()) {
     const classification = line.originalEntryId ? originalClassifications.get(line.originalEntryId) : annualOrigin?.memories[index].classification ?? classifications.get(line.accountId);
     const resolved = annualOrigin ? annualOrigin.memories[index].dimensions : accountingScope && input.reversalOfId ? await resolveAccountingReversalLineDimensions(tx, { ...input, ...accountingScope }, input.reversalOfId, line.accountId, line.type, line.originalEntryId) : accountingScope && classification && input.sourceType === "REVENUE_RESOURCE_REDISTRIBUTION" ? await resolveAccountingLineSourceDimensions(tx, { ...input, ...accountingScope }, line.type, classification) : dimensions;
     if (annualOrigin?.memories[index].classification) { lineDimensions.push(resolved); continue; }
     const msc = accountingScope ? await composeMscLineDimensions(tx, { ...accountingScope, date: input.date }, line.accountId, resolved) : null;
    lineDimensions.push(msc ? { ...resolved, msc, mscReadiness: msc.status === "DOCUMENTED" ? "MSC_DOCUMENTED" : "MSC_NOT_RECONCILED" } : resolved);
  }
  if (accountingScope && classifications.size && input.sourceType === "REVENUE_RESOURCE_REDISTRIBUTION" && new Set(lineDimensions.map(dimension => dimension?.resourceSourceId)).size !== 2) throw new FinanceError("Redistribuição deve identificar fonte de origem e destino em linhas distintas.");
   const currentAccounts = accounts.filter(account => input.lines.some((line, index) => line.accountId === account.id && !line.originalEntryId && !annualOrigin?.memories[index].classification));
  const childAccount = currentAccounts.length ? await tx.accountingPlan.findFirst({ where: { OR: currentAccounts.map((account) => ({ code: { startsWith: `${account.code}.` } })) }, select: { id: true } }) : null;
  if (childAccount) throw new FinanceError("A postagem exige conta analítica de último nível; conta sintética com desdobramentos não aceita partidas.");
  const transaction = await tx.accountingTransaction.create({
    data: {
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
      entries: {
        create: input.lines.map((line, index) => {
          const value = money(line.value);
          const classification = line.originalEntryId ? originalClassifications.get(line.originalEntryId) : annualOrigin?.memories[index].classification ?? classifications.get(line.accountId);
          const classificationSnapshot = classification ? { ...classification, ...(line.originalEntryId ? { originalEntryId: line.originalEntryId } : {}), ...(line.annualBalanceOriginEntryId ? { annualBalanceOriginEntryId: line.annualBalanceOriginEntryId } : {}), dimensions: lineDimensions[index] } : line.originalEntryId || line.annualBalanceOriginEntryId || lineDimensions[index]?.msc ? { ...(line.originalEntryId ? { originalEntryId: line.originalEntryId } : {}), ...(line.annualBalanceOriginEntryId ? { annualBalanceOriginEntryId: line.annualBalanceOriginEntryId } : {}), dimensions: lineDimensions[index], classificationResolution: "NOT_RECONCILED" } : undefined;
          return { date: input.date, value: legacyMoney(value), valueDecimal: value, classificationSnapshot, type: line.type, history: input.history.trim(), accountId: line.accountId, authorId: actor.employeeId! };
        }),
      },
    },
  });
  await audit(tx, actor, "POST", "AccountingTransaction", transaction.id, { debit: jsonMoney(totals.debit), credit: jsonMoney(totals.credit), lineCount: input.lines.length, eventType: transaction.eventType }, input.financialYearId);
  await recordAccountingMunicipalCosts(tx, actor, transaction, input.lines, accounts);
  return transaction;
}

async function reverseAccountingForSource(
  tx: Prisma.TransactionClient,
  actor: FinanceActor,
  input: { financialYearId: string; date: Date; sourceType: string; sourceId: string; eventType: string; history: string; idempotencyKey: string },
) {
  const original = await tx.accountingTransaction.findFirst({
    where: { financialYearId: input.financialYearId, sourceType: input.sourceType, sourceId: input.sourceId, status: "POSTADO" },
    include: { entries: true, reversedBy: { select: { id: true } } },
    orderBy: { postedAt: "asc" },
  });
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
  db: PrismaClient,
  actor: FinanceActor,
  input: AccountingEventInput,
) {
  return db.$transaction((tx) => postAccountingEventInTransaction(tx, actor, input));
}

export async function postAccountingEventInTransaction(
  tx: Prisma.TransactionClient,
  actor: FinanceActor,
  input: AccountingEventInput,
) {
  const value = money(input.value);
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`ACCOUNTING_RULE:${input.eventCode}`}, 0))::text`;
  const event = await tx.accountingEventCatalog.findUnique({ where: { code: input.eventCode }, include: { rules: { where: { isActive: true }, include: { components: { orderBy: { sequence: "asc" } } } } } });
  if (!event?.isActive || event.rules.length !== 1) throw new FinanceError("O evento contabil deve possuir exatamente uma regra ativa antes da postagem.");
  const rule = event.rules[0];
  if (rule.isReference && process.env.CELERIFLOW_ACCOUNTING_MODE !== "POC") {
    throw new FinanceError("A regra contabil de referencia so pode ser usada no modo POC. Configure a matriz PCASP homologada para este ambiente.");
  }
  const lines: AccountingLine[] = [
    { accountId: input.debitAccountId ?? rule.debitAccountId, type: "Débito", value },
    { accountId: input.creditAccountId ?? rule.creditAccountId, type: "Crédito", value },
  ];
  let payment: Awaited<ReturnType<typeof tx.payment.findUniqueOrThrow>> | null = null;
  let bankAccountId: string | null = null;
  if (rule.components.some(component => component.valueBasis !== "EVENT_VALUE" || component.creditFromOriginBank)) {
    if (input.sourceModule !== "FINANCEIRO" || input.sourceType !== "PAYMENT" || !input.sourceId || !["PAGAMENTO_EFETIVADO", "RAP_PROCESSADO_PAGAMENTO", "RAP_NAO_PROCESSADO_PAGAMENTO"].includes(input.eventCode)) throw new FinanceError("Bases de pagamento e banco de origem exigem pagamento financeiro canônico.");
    payment = await tx.payment.findUniqueOrThrow({ where: { id: input.sourceId } });
    const origin = await tx.commitment.findUniqueOrThrow({ where: { id: payment.commitmentId }, select: { appropriation: { select: { financialYearId: true } } } });
    const payable = payment.payableCarryForwardId ? await tx.payableCarryForward.findUniqueOrThrow({ where: { id: payment.payableCarryForwardId }, select: { type: true } }) : null;
    const expectedEvent = payable ? payable.type === "NAO_PROCESSADO" ? "RAP_NAO_PROCESSADO_PAGAMENTO" : "RAP_PROCESSADO_PAGAMENTO" : "PAGAMENTO_EFETIVADO";
    if (input.financialYearId !== (payment.executionFinancialYearId ?? origin.appropriation.financialYearId) || input.eventCode !== expectedEvent) throw new FinanceError("Evento e exercício contábil devem corresponder à execução do pagamento.");
    const gross = requiredDecimal(payment.valueDecimal, "Payment.valueDecimal");
    const net = requiredDecimal(payment.netValueDecimal, "Payment.netValueDecimal");
    if (payment.status !== "Paga" || payment.date.getTime() !== input.date.getTime() || !gross.eq(value) || net.lt(0) || net.gt(gross)) throw new FinanceError("A composição contábil diverge do pagamento confirmado.");
    const bank = await tx.bankAccount.findUniqueOrThrow({ where: { id: payment.bankAccountId } });
    bankAccountId = bank.accountingPlanId;
    if (rule.components.some(component => component.creditFromOriginBank) && !bankAccountId) throw new FinanceError("Banco de origem sem conta contábil conciliada.");
  }
  for (const component of rule.components) {
    if (!["EVENT_VALUE", "PAYMENT_NET", "PAYMENT_RETENTION"].includes(component.valueBasis)) throw new FinanceError("Base de composição contábil inválida.");
    const componentValue = component.valueBasis === "EVENT_VALUE" ? value
      : component.valueBasis === "PAYMENT_NET" ? requiredDecimal(payment!.netValueDecimal, "Payment.netValueDecimal")
      : value.minus(requiredDecimal(payment!.netValueDecimal, "Payment.netValueDecimal"));
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
  db: PrismaClient,
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
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`ACCOUNTING_RULE:${input.eventCode.trim()}`}, 0))::text`;
    const accountIds = [...new Set([input.debitAccountId, input.creditAccountId, ...(input.components ?? []).flatMap(component => [component.debitAccountId, component.creditAccountId])])];
    const accounts = await tx.accountingPlan.count({ where: { id: { in: accountIds } } });
    if (accounts !== accountIds.length) throw new FinanceError("As contas da regra contabil nao foram encontradas.");
    const event = await tx.accountingEventCatalog.upsert({ where: { code: input.eventCode.trim() }, create: { code: input.eventCode.trim(), name: input.eventName.trim(), description: input.description?.trim() || undefined }, update: { name: input.eventName.trim(), description: input.description?.trim() || undefined, isActive: true } });
    const replaced = await tx.accountingPostingRule.findMany({ where: { eventId: event.id, isActive: true, NOT: { debitAccountId: input.debitAccountId, creditAccountId: input.creditAccountId } }, select: { id: true } });
    if (replaced.length) await tx.accountingPostingRule.updateMany({ where: { id: { in: replaced.map(rule => rule.id) } }, data: { isActive: false } });
    const rule = await tx.accountingPostingRule.upsert({ where: { eventId_debitAccountId_creditAccountId: { eventId: event.id, debitAccountId: input.debitAccountId, creditAccountId: input.creditAccountId } }, create: { eventId: event.id, debitAccountId: input.debitAccountId, creditAccountId: input.creditAccountId, description: input.description?.trim() || undefined, isReference: input.isReference ?? false }, update: { isActive: true, description: input.description?.trim() || undefined, isReference: input.isReference ?? false } });
    const previousComponents = await tx.accountingPostingComponent.findMany({ where: { ruleId: rule.id }, orderBy: { sequence: "asc" } });
    if (input.components !== undefined) {
      await tx.accountingPostingComponent.deleteMany({ where: { ruleId: rule.id } });
      if (input.components.length) await tx.accountingPostingComponent.createMany({ data: input.components.map((component, index) => ({ ...component, ruleId: rule.id, sequence: index + 1 })) });
    }
    await audit(tx, actor, "UPSERT", "AccountingPostingRule", rule.id, { eventCode: event.code, debitAccountId: rule.debitAccountId, creditAccountId: rule.creditAccountId, isReference: rule.isReference, replacedRuleIds: replaced.map(previous => previous.id), previousComponents, components: input.components ?? previousComponents });
    return rule;
  });
}

export async function accountingTrialBalance(tx: Db, financialYearId: string, throughDate?: Date, budgetUnitIds?: string[]) {
  const entries = await tx.accountingEntry.findMany({
    where: { transaction: { financialYearId, status: "POSTADO", ...(budgetUnitIds ? { budgetUnitId: { in: budgetUnitIds } } : {}), ...(throughDate ? { date: { lte: throughDate } } : {}) } },
    include: { account: { select: { id: true, code: true, name: true, type: true } }, transaction: { select: { date: true } } },
    orderBy: { account: { code: "asc" } },
  });
  return Object.values(entries.reduce<Record<string, { account: typeof entries[number]["account"]; debit: Prisma.Decimal; credit: Prisma.Decimal; balance: Prisma.Decimal }>>((result, entry) => {
    const current = result[entry.accountId] ?? { account: entry.account, debit: new Prisma.Decimal(0), credit: new Prisma.Decimal(0), balance: new Prisma.Decimal(0) };
    const value = requiredDecimal(entry.valueDecimal, "AccountingEntry.valueDecimal");
    if (entry.type === "Débito") current.debit = current.debit.plus(value);
    else current.credit = current.credit.plus(value);
    current.balance = current.debit.minus(current.credit);
    result[entry.accountId] = current;
    return result;
  }, {}));
}

export async function accountingPendingChecks(tx: Db, financialYearId: string, competence: Date) {
  const monthStart = accountingMonth(competence);
  const nextMonth = new Date(monthStart);
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  const year = await tx.financialYear.findUnique({ where: { id: financialYearId }, select: { startDate: true, governmentEntityId: true } });
  if (!year) throw new FinanceError("Exercicio financeiro nao encontrado.");
  const preparedPrograms = await preparedAnnualPaymentProgramIds(tx, financialYearId);
  const [draftTransactions, emittedPayments, openReconciliations] = await Promise.all([
    tx.accountingTransaction.count({ where: { financialYearId, status: "RASCUNHO", date: { lt: nextMonth } } }),
    tx.payment.count({ where: { status: "Emitida", ...(preparedPrograms.length ? { id: { notIn: preparedPrograms } } : {}), date: { gte: year.startDate, lt: nextMonth }, OR: [{ executionFinancialYearId: financialYearId }, { executionFinancialYearId: null, commitment: { appropriation: { financialYearId } } }] } }),
    tx.bankStatementItem.count({ where: { status: { in: ["Pendente", "Parcial"] }, date: { gte: year.startDate, lt: nextMonth }, ...(year.governmentEntityId ? { OR: [
      { bankAccount: { is: { budgetUnit: { is: { planningEntityUnit: { is: { governmentEntityId: year.governmentEntityId } } } } } } },
      { bankAccountId: null, statementImport: { bankAccount: { budgetUnit: { planningEntityUnit: { governmentEntityId: year.governmentEntityId } } } } },
      { bankAccountId: null, statementImportId: null },
    ] } : {}) } }),
  ]);
  return { draftTransactions, emittedPayments, openReconciliations, total: draftTransactions + emittedPayments + openReconciliations };
}

export async function closeAccountingMonth(db: PrismaClient, actor: FinanceActor, financialYearId: string, competence: Date) {
  return requestAccountingMonthClose(db, actor, financialYearId, competence);
}

export async function requestAccountingMonthClose(db: PrismaClient, actor: FinanceActor, financialYearId: string, competence: Date) {
  return db.$transaction(async (tx) => {
    await assertAccountingYearScope(tx, actor, financialYearId);
    await lockAccountingPeriod(tx, financialYearId, competence);
    const year = await tx.financialYear.findUnique({ where: { id: financialYearId } });
    if (!year || !["Aberto", "Em Encerramento"].includes(year.status)) throw new FinanceError("O exercicio nao esta disponivel para fechamento contabil.");
    const month = accountingMonth(competence);
    if (month < accountingMonth(year.startDate) || month > accountingMonth(year.endDate)) throw new FinanceError("A competencia nao pertence ao exercicio financeiro.");
    const pending = await accountingPendingChecks(tx, financialYearId, month);
    if (pending.total) throw new FinanceError("O fechamento mensal foi bloqueado por pendencias de contabilizacao, pagamentos ou conciliacao.");
    const existing = await tx.monthlyAccountingClose.findUnique({ where: { financialYearId_competence: { financialYearId, competence: month } } });
    if (existing && existing.status !== "ABERTO") throw new FinanceError("A competencia ja possui um fechamento ou uma solicitacao pendente.");
    const close = existing ?? await tx.monthlyAccountingClose.create({
      data: { financialYearId, competence: month, status: "PENDENTE_FECHAMENTO", pendingSummary: pending },
    });
    if (existing) await tx.monthlyAccountingClose.update({ where: { id: close.id }, data: { status: "PENDENTE_FECHAMENTO", pendingSummary: pending } });
    await tx.monthlyAccountingCloseEvent.create({
      data: { monthlyAccountingCloseId: close.id, action: "CLOSE_REQUESTED", pendingSummary: pending, requestedByUsuarioId: actor.usuarioId },
    });
    await audit(tx, actor, "REQUEST_CLOSE", "MonthlyAccountingClose", close.id, pending, financialYearId);
    return close;
  });
}

export async function authorizeAccountingMonthClose(db: PrismaClient, actor: FinanceActor, financialYearId: string, competence: Date) {
  return db.$transaction(async (tx) => {
    await assertAccountingYearScope(tx, actor, financialYearId);
    await lockAccountingPeriod(tx, financialYearId, competence);
    const month = accountingMonth(competence);
    const close = await tx.monthlyAccountingClose.findUnique({ where: { financialYearId_competence: { financialYearId, competence: month } } });
    if (!close || close.status !== "PENDENTE_FECHAMENTO") throw new FinanceError("Nao ha solicitacao de fechamento mensal pendente para esta competencia.");
    const request = await tx.monthlyAccountingCloseEvent.findFirst({
      where: { monthlyAccountingCloseId: close.id, action: "CLOSE_REQUESTED" },
      orderBy: { createdAt: "desc" },
    });
    if (!request) throw new FinanceError("A solicitacao de fechamento mensal nao possui evidencia valida.");
    if (request.requestedByUsuarioId === actor.usuarioId) throw new FinanceError("Segregacao de funcoes: o solicitante nao pode autorizar o proprio fechamento.");
    const year = await tx.financialYear.findUnique({ where: { id: financialYearId } });
    if (!year || !["Aberto", "Em Encerramento"].includes(year.status)) throw new FinanceError("O exercicio nao esta disponivel para fechamento contabil.");
    const pending = await accountingPendingChecks(tx, financialYearId, month);
    if (pending.total) throw new FinanceError("A autorizacao do fechamento mensal foi bloqueada por novas pendencias.");
    const closedAt = new Date();
    const updated = await tx.monthlyAccountingClose.update({
      where: { id: close.id },
      data: {
        status: "FECHADO",
        pendingSummary: pending,
        // The close row keeps its original closure identity; later cycles are immutable events below.
        closedByUsuarioId: close.closedByUsuarioId ?? actor.usuarioId,
        closedByEmployeeId: close.closedByEmployeeId ?? actor.employeeId,
        closedAt: close.closedAt ?? closedAt,
      },
    });
    const closureEvidence = { closedByUsuarioId: actor.usuarioId, closedByEmployeeId: actor.employeeId, closedAt: closedAt.toISOString() };
    await tx.monthlyAccountingCloseEvent.create({
      data: { monthlyAccountingCloseId: close.id, action: "CLOSE_AUTHORIZED", pendingSummary: pending, closureEvidence, requestedByUsuarioId: request.requestedByUsuarioId, authorizedByUsuarioId: actor.usuarioId, authorizedAt: closedAt },
    });
    await audit(tx, actor, "AUTHORIZE_CLOSE", "MonthlyAccountingClose", close.id, { ...pending, requestedByUsuarioId: request.requestedByUsuarioId }, financialYearId);
    return updated;
  });
}

export async function requestAccountingMonthReopen(db: PrismaClient, actor: FinanceActor, financialYearId: string, competence: Date, justification: string) {
  if (!justification.trim()) throw new FinanceError("A justificativa para reabertura mensal e obrigatoria.");
  return db.$transaction(async (tx) => {
    await assertAccountingYearScope(tx, actor, financialYearId);
    await lockAccountingPeriod(tx, financialYearId, competence);
    const year = await tx.financialYear.findUnique({ where: { id: financialYearId } });
    if (!year || !["Aberto", "Em Encerramento"].includes(year.status)) throw new FinanceError("O exercicio nao esta disponivel para reabertura contabil.");
    const month = accountingMonth(competence);
    const close = await tx.monthlyAccountingClose.findUnique({ where: { financialYearId_competence: { financialYearId, competence: month } } });
    if (!close || close.status !== "FECHADO") throw new FinanceError("Somente uma competencia atualmente fechada pode ser reaberta.");
    const latestClosure = await tx.monthlyAccountingCloseEvent.findFirst({ where: { monthlyAccountingCloseId: close.id, action: "CLOSE_AUTHORIZED" }, orderBy: { createdAt: "desc" } });
    const closureEvidence = latestClosure?.closureEvidence ?? { closedByUsuarioId: close.closedByUsuarioId, closedByEmployeeId: close.closedByEmployeeId, closedAt: close.closedAt?.toISOString() };
    await tx.monthlyAccountingClose.update({ where: { id: close.id }, data: { status: "PENDENTE_REABERTURA" } });
    await tx.monthlyAccountingCloseEvent.create({
      data: { monthlyAccountingCloseId: close.id, action: "REOPEN_REQUESTED", justification: justification.trim(), closureEvidence, requestedByUsuarioId: actor.usuarioId },
    });
    await audit(tx, actor, "REQUEST_REOPEN", "MonthlyAccountingClose", close.id, { justification: justification.trim(), closureEvidence }, financialYearId);
    return close;
  });
}

export async function authorizeAccountingMonthReopen(db: PrismaClient, actor: FinanceActor, financialYearId: string, competence: Date) {
  return db.$transaction(async (tx) => {
    await assertAccountingYearScope(tx, actor, financialYearId);
    await lockAccountingPeriod(tx, financialYearId, competence);
    const month = accountingMonth(competence);
    const close = await tx.monthlyAccountingClose.findUnique({ where: { financialYearId_competence: { financialYearId, competence: month } } });
    if (!close || close.status !== "PENDENTE_REABERTURA") throw new FinanceError("Nao ha solicitacao de reabertura mensal pendente para esta competencia.");
    const request = await tx.monthlyAccountingCloseEvent.findFirst({ where: { monthlyAccountingCloseId: close.id, action: "REOPEN_REQUESTED" }, orderBy: { createdAt: "desc" } });
    if (!request) throw new FinanceError("A solicitacao de reabertura mensal nao possui evidencia valida.");
    if (request.requestedByUsuarioId === actor.usuarioId) throw new FinanceError("Segregacao de funcoes: o solicitante nao pode autorizar a propria reabertura.");
    const year = await tx.financialYear.findUnique({ where: { id: financialYearId } });
    if (!year || !["Aberto", "Em Encerramento"].includes(year.status)) throw new FinanceError("O exercicio nao esta disponivel para reabertura contabil.");
    const authorizedAt = new Date();
    const updated = await tx.monthlyAccountingClose.update({ where: { id: close.id }, data: { status: "ABERTO" } });
    await tx.monthlyAccountingCloseEvent.create({
      data: { monthlyAccountingCloseId: close.id, action: "REOPEN_AUTHORIZED", justification: request.justification, closureEvidence: request.closureEvidence ?? undefined, requestedByUsuarioId: request.requestedByUsuarioId, authorizedByUsuarioId: actor.usuarioId, authorizedAt },
    });
    await audit(tx, actor, "AUTHORIZE_REOPEN", "MonthlyAccountingClose", close.id, { justification: request.justification, requestedByUsuarioId: request.requestedByUsuarioId }, financialYearId);
    return updated;
  });
}

async function lockAccountingYearPeriods(tx: Prisma.TransactionClient, actor: FinanceActor, financialYearId: string) {
  await assertAccountingYearScope(tx, actor, financialYearId);
  const origin = await tx.financialYear.findUniqueOrThrow({ where: { id: financialYearId } });
  // Shared with every posting and monthly close/reopen, in stable calendar order.
  for (let month = 0; month < 12; month++) await lockAccountingPeriod(tx, financialYearId, new Date(Date.UTC(origin.year, month, 1)));
  await tx.$queryRaw`SELECT id FROM "FinancialYear" WHERE id = ${financialYearId} FOR UPDATE`;
  return tx.financialYear.findUniqueOrThrow({ where: { id: financialYearId } });
}

export async function prepareAnnualAccountingClose(db: PrismaClient, actor: FinanceActor, financialYearId: string) {
  return db.$transaction(async (tx) => {
    const year = await lockAccountingYearPeriods(tx, actor, financialYearId);
    const closes = await tx.monthlyAccountingClose.count({ where: { financialYearId, status: "FECHADO" } });
    if (closes < 12) throw new FinanceError("O encerramento anual exige os doze fechamentos mensais.");
    const pending = await accountingPendingChecks(tx, financialYearId, year.endDate);
    if (pending.total) throw new FinanceError("O encerramento anual possui pendencias operacionais.");
    const consistency = await inspectAnnualConsistency(tx, actor, financialYearId);
    if (consistency.counts.errors) throw new FinanceError(`O encerramento anual possui ${consistency.counts.errors} inconsistências. Emita o relatório de conferência pré-encerramento.`);
    const registrationSummary = await reconcileAnnualPayableRegistrations(tx, actor, financialYearId, "Apuração individual de RAP na preparação do encerramento anual.");
    const payableCandidates = await tx.commitment.count({ where: { appropriation: { financialYearId }, status: { in: ACTIVE_COMMITMENT_STATUSES }, date: { lte: year.endDate } } });
    const existing = await tx.annualAccountingClose.findUnique({ where: { financialYearId } });
    if (existing?.status === "ENCERRADO") throw new FinanceError("O encerramento anual final ja foi concluido.");
    const annual = existing
      ? await tx.annualAccountingClose.update({ where: { id: existing.id }, data: { status: "PRONTO_PARA_VALIDACAO", pendingSummary: pending, preparedByUsuarioId: actor.usuarioId, preparedAt: new Date() } })
      : await tx.annualAccountingClose.create({ data: { financialYearId, status: "PRONTO_PARA_VALIDACAO", pendingSummary: pending, preparedByUsuarioId: actor.usuarioId, preparedAt: new Date() } });
    if (year.status === "Aberto") await tx.financialYear.update({ where: { id: financialYearId }, data: { status: "Em Encerramento" } });
    await audit(tx, actor, "PREPARE_CLOSE", "AnnualAccountingClose", annual.id, { ...pending, payableCandidates, registrationSummary, consistencyCounts: consistency.counts }, financialYearId);
    return annual;
  }, { timeout: 60000 });
}

export async function trackPayableCarryForwardPayment(
  db: PrismaClient,
  actor: FinanceActor,
  input: { payableCarryForwardId: string; paymentId: string; value: Prisma.Decimal | string | number },
) {
  const value = money(input.value);
  return db.$transaction(async (tx) => {
    await lockPayment(tx, input.paymentId);
    const paymentOrigin = await tx.payment.findUniqueOrThrow({ where: { id: input.paymentId }, select: { commitmentId: true } });
    await lockCommitment(tx, paymentOrigin.commitmentId);
    await lockPayableCarryForward(tx, input.payableCarryForwardId);
    const payable = await tx.payableCarryForward.findUnique({
      where: { id: input.payableCarryForwardId },
      include: { originFinancialYear: true, events: { where: { action: "PAGAMENTO_RASTREADO" }, select: { valueDecimal: true } }, commitment: { include: { appropriation: { select: { budgetUnitId: true } } } } },
    });
    if (!payable) throw new FinanceError("Resto a pagar não encontrado.");
    assertActorBudgetUnit(actor, payable.commitment.appropriation.budgetUnitId);
    await lockPayment(tx, input.paymentId);
    const payment = await tx.payment.findUnique({ where: { id: input.paymentId }, select: { id: true, commitmentId: true, status: true, date: true, valueDecimal: true, payableCarryForwardId: true } });
    if (!payment || payment.status !== "Paga") throw new FinanceError("Selecione um pagamento interno já efetivado.");
    if (payment.commitmentId !== payable.commitmentId) throw new FinanceError("O pagamento selecionado não pertence ao empenho do resto a pagar.");
    if (payment.payableCarryForwardId && payment.payableCarryForwardId !== payable.id) throw new FinanceError("Pagamento nativo pertence a outra inscrição de RAP.");
    const paymentTracking = await tx.payableCarryForwardEvent.findMany({ where: { paymentId: payment.id, action: "PAGAMENTO_RASTREADO" }, select: { payableCarryForwardId: true, valueDecimal: true } });
    const replay = paymentTracking.find((event) => event.payableCarryForwardId === payable.id);
    if (replay) {
      if (!requiredDecimal(replay.valueDecimal, "PayableCarryForwardEvent.valueDecimal").equals(value)) throw new FinanceError("Pagamento já acompanhado com outro valor neste resto a pagar.");
      return payable;
    }
    if (paymentTracking.length) throw new FinanceError("O pagamento já está vinculado ao acompanhamento de outro resto a pagar.");
    if (!["PENDENTE", "PAGAMENTO_PARCIAL_RASTREADO"].includes(payable.status)) throw new FinanceError("Somente restos a pagar pendentes podem receber acompanhamento de pagamento.");
    if (payment.date <= payable.originFinancialYear.endDate) throw new FinanceError("O pagamento acompanhado deve ser posterior ao exercício de origem do resto a pagar.");
    const paymentValue = requiredDecimal(payment.valueDecimal, "Payment.valueDecimal");
    const alreadyAllocated = paymentTracking.reduce((sum, event) => sum.plus(requiredDecimal(event.valueDecimal, "PayableCarryForwardEvent.valueDecimal")), new Prisma.Decimal(0));
    if (alreadyAllocated.plus(value).greaterThan(paymentValue)) throw new FinanceError("Os acompanhamentos acumulados não podem exceder o valor bruto do pagamento.");
    const tracked = await carryForwardAllocatedValue(tx, payable.id);
    if (tracked.plus(value).greaterThan(payable.valueDecimal)) throw new FinanceError("O valor acompanhado excede o saldo inscrito do resto a pagar.");
    const status = tracked.plus(value).equals(payable.valueDecimal) ? "PAGO_RASTREADO" : "PAGAMENTO_PARCIAL_RASTREADO";
    await tx.payableCarryForwardEvent.create({ data: { payableCarryForwardId: payable.id, action: "PAGAMENTO_RASTREADO", paymentId: payment.id, valueDecimal: value, actorUsuarioId: actor.usuarioId } });
    const updated = await tx.payableCarryForward.update({ where: { id: payable.id }, data: { status } });
    await audit(tx, actor, "TRACK_PAYMENT", "PayableCarryForward", payable.id, { paymentId: payment.id, value: jsonMoney(value), status }, payable.financialYearId, payable.commitment.appropriation.budgetUnitId);
    return updated;
  });
}

export async function cancelPayableCarryForward(
  db: PrismaClient,
  actor: FinanceActor,
  input: { payableCarryForwardId: string; justification: string },
) {
  if (!input.justification.trim()) throw new FinanceError("A justificativa do cancelamento do resto a pagar é obrigatória.");
  return db.$transaction(async (tx) => {
    await lockPayableCarryForward(tx, input.payableCarryForwardId);
    const payable = await tx.payableCarryForward.findUnique({ where: { id: input.payableCarryForwardId }, include: { commitment: { include: { appropriation: { select: { budgetUnitId: true } } } } } });
    if (!payable) throw new FinanceError("Resto a pagar não encontrado.");
    assertActorBudgetUnit(actor, payable.commitment.appropriation.budgetUnitId);
    if (!["PENDENTE", "PAGAMENTO_PARCIAL_RASTREADO"].includes(payable.status)) throw new FinanceError("Somente restos a pagar pendentes podem ser cancelados neste acompanhamento interno.");
    if (await tx.payment.count({ where: { payableCarryForwardId: payable.id, status: { in: ACTIVE_PAYMENT_STATUSES } } })) throw new FinanceError("Cancele ou estorne as ordens nativas antes de cancelar a inscrição de RAP.");
    if (await tx.settlement.count({ where: { payableCarryForwardId: payable.id, status: ACTIVE_SETTLEMENT_STATUS } })) throw new FinanceError("Cancele as liquidações nativas antes de cancelar a inscrição de RAP.");
    if (await tx.payableCarryForwardSettlementLink.count({ where: { payableCarryForwardId: payable.id, status: "ACTIVE" } })) throw new FinanceError("Desmovimente o transporte antes de cancelar uma inscrição com liquidações herdadas.");
    const justification = input.justification.trim();
    await tx.payableCarryForwardEvent.create({ data: { payableCarryForwardId: payable.id, action: "CANCELAMENTO_REGISTRADO", justification, actorUsuarioId: actor.usuarioId } });
    const updated = await tx.payableCarryForward.update({ where: { id: payable.id }, data: { status: "CANCELADO" } });
    await audit(tx, actor, "CANCEL", "PayableCarryForward", payable.id, { previousStatus: payable.status, justification }, payable.financialYearId, payable.commitment.appropriation.budgetUnitId);
    return updated;
  });
}

export async function reregisterPayableCarryForward(
  db: PrismaClient,
  actor: FinanceActor,
  input: { payableCarryForwardId: string; targetFinancialYearId: string; justification: string },
) {
  if (!input.justification.trim()) throw new FinanceError("A justificativa da reinscrição do resto a pagar é obrigatória.");
  return db.$transaction(async (tx) => {
    await lockPayableCarryForward(tx, input.payableCarryForwardId);
    const payable = await tx.payableCarryForward.findUnique({
      where: { id: input.payableCarryForwardId },
      include: {
        financialYear: true,
        commitment: { include: { appropriation: { select: { budgetUnitId: true } } } },
        successorPayableCarryForward: { select: { id: true } },
        events: { where: { action: "PAGAMENTO_RASTREADO" }, select: { id: true } },
      },
    });
    if (!payable) throw new FinanceError("Resto a pagar não encontrado.");
    assertActorBudgetUnit(actor, payable.commitment.appropriation.budgetUnitId);
    if (payable.status !== "PENDENTE") throw new FinanceError("A reinscrição exige um resto a pagar ainda pendente e sem acompanhamento de pagamento.");
    if (await tx.payment.count({ where: { payableCarryForwardId: payable.id, status: { in: ACTIVE_PAYMENT_STATUSES } } })) throw new FinanceError("Cancele ou estorne as ordens nativas antes de reinscrever o RAP.");
    if (await tx.settlement.count({ where: { payableCarryForwardId: payable.id, status: ACTIVE_SETTLEMENT_STATUS } })) throw new FinanceError("Cancele as liquidações nativas antes de reinscrever o RAP.");
    if (await tx.payableCarryForwardSettlementLink.count({ where: { payableCarryForwardId: payable.id, status: "ACTIVE" } })) throw new FinanceError("Use o transporte anual nativo para reinscrever RAP com liquidações herdadas.");
    if (payable.events.length) throw new FinanceError("Não é possível reinscrever um resto a pagar que já possui pagamento acompanhado.");
    if (payable.successorPayableCarryForward) throw new FinanceError("Este resto a pagar já possui reinscrição registrada.");
    const targetYear = await tx.financialYear.findUnique({ where: { id: input.targetFinancialYearId } });
    if (!targetYear || targetYear.status !== OPEN_STATUS) throw new FinanceError("O exercício de destino deve existir e estar aberto para reinscrição interna.");
    const unit = await tx.planningEntityUnit.findUnique({ where: { budgetUnitId: payable.commitment.appropriation.budgetUnitId }, select: { governmentEntityId: true } });
    if (!unit || targetYear.governmentEntityId !== unit.governmentEntityId || payable.financialYear.governmentEntityId !== unit.governmentEntityId) throw new FinanceError("Reinscrição exige exercícios da mesma entidade da UG de origem.");
    if (targetYear.id === payable.financialYearId || targetYear.year <= payable.financialYear.year) throw new FinanceError("A reinscrição deve apontar para um exercício posterior.");
    const existingTarget = await tx.payableCarryForward.findUnique({
      where: { financialYearId_commitmentId_type: { financialYearId: targetYear.id, commitmentId: payable.commitmentId, type: payable.type } },
      select: { id: true },
    });
    if (existingTarget) throw new FinanceError("Já existe um resto a pagar do mesmo tipo para este empenho no exercício de destino.");
    const justification = input.justification.trim();
    const successor = await tx.payableCarryForward.create({
      data: {
        financialYearId: targetYear.id,
        originFinancialYearId: payable.originFinancialYearId,
        commitmentId: payable.commitmentId,
        previousPayableCarryForwardId: payable.id,
        valueDecimal: payable.valueDecimal,
        type: payable.type,
        notes: `Reinscrição interna do RAP ${payable.id}.`,
        events: { create: { action: "REINSCRICAO_RECEBIDA", justification, actorUsuarioId: actor.usuarioId, valueDecimal: payable.valueDecimal } },
      },
    });
    await tx.payableCarryForwardEvent.create({ data: { payableCarryForwardId: payable.id, action: "REINSCRICAO_REGISTRADA", justification, actorUsuarioId: actor.usuarioId, valueDecimal: payable.valueDecimal } });
    await tx.payableCarryForward.update({ where: { id: payable.id }, data: { status: "REINSCRITO" } });
    const payload = { targetPayableCarryForwardId: successor.id, targetFinancialYearId: targetYear.id, justification, value: jsonMoney(payable.valueDecimal) };
    await audit(tx, actor, "REREGISTER", "PayableCarryForward", payable.id, payload, payable.financialYearId, payable.commitment.appropriation.budgetUnitId);
    await audit(tx, actor, "REREGISTER", "PayableCarryForward", successor.id, { ...payload, sourcePayableCarryForwardId: payable.id }, targetYear.id, payable.commitment.appropriation.budgetUnitId);
    return successor;
  });
}

export async function finalizeAnnualAccountingClose(db: PrismaClient, actor: FinanceActor, financialYearId: string) {
  return db.$transaction(async (tx) => {
    const year = await lockAccountingYearPeriods(tx, actor, financialYearId);
    if (!year || year.status !== "Em Encerramento") throw new FinanceError("O exercicio deve estar em encerramento para o fechamento anual final.");
    const closedMonths = await tx.monthlyAccountingClose.count({ where: { financialYearId, status: "FECHADO" } });
    if (closedMonths !== 12) throw new FinanceError("O encerramento anual final exige doze competencias atualmente fechadas.");
    const pending = await accountingPendingChecks(tx, financialYearId, year.endDate);
    if (pending.total) throw new FinanceError("O encerramento anual final possui pendencias operacionais.");
    const annual = await tx.annualAccountingClose.findUnique({ where: { financialYearId } });
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
    const updated = await tx.annualAccountingClose.update({ where: { id: annual.id }, data: { status: "ENCERRADO", pendingSummary: pending, closedByUsuarioId: actor.usuarioId, closedByEmployeeId: actor.employeeId, closedAt } });
    await tx.financialYear.update({ where: { id: financialYearId }, data: { status: "Encerrado" } });
    await audit(tx, actor, "FINAL_CLOSE", "AnnualAccountingClose", updated.id, { ...pending, closedMonths, closedAt: closedAt.toISOString() }, financialYearId);
    await audit(tx, actor, "STATUS_CHANGE", "FinancialYear", financialYearId, { previousStatus: year.status, status: "Encerrado", annualAccountingCloseId: updated.id }, financialYearId);
    return updated;
  }, { timeout: 60000 });
}

// -----------------------------------------------------------------------------
// Fechamento Financeiro Diário por Conta Bancária e Fonte de Recursos
// -----------------------------------------------------------------------------
export async function closeDailyTreasuryByAccountAndSource(
  db: PrismaClient,
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

  return db.$transaction(async (tx) => {
    await lockBankAccount(tx, input.bankAccountId);
    const account = await tx.bankAccount.findUnique({ where: { id: input.bankAccountId } });
    if (!account) throw new FinanceError("Conta bancária não encontrada.");
    assertActorCanAccessBankAccount(actor, account.budgetUnitId);

    const resourceSourceId = await assertBankResourceSource(tx, account.id, input.resourceSourceId ?? account.resourceSourceId);
    const openingBalance = await getBankResourceSourceBalance(tx, account.id, resourceSourceId, new Date(startOfDay.getTime() - 1));
    const closingBalance = await getBankResourceSourceBalance(tx, account.id, resourceSourceId, endOfDay);

    // Movimentos de tesouraria do dia
    const movements = await tx.treasuryMovement.findMany({
      where: {
        bankAccountId: account.id,
        resourceSourceId,
        date: { gte: startOfDay, lte: endOfDay },
        status: "Confirmado",
      },
    });

    const totalEntries = movements
      .filter((m) => signedValue(m.direction, m.valueDecimal).isPositive())
      .reduce((sum, m) => sum.plus(m.valueDecimal), new Prisma.Decimal(0));

    const totalExits = movements
      .filter((m) => signedValue(m.direction, m.valueDecimal).isNegative())
      .reduce((sum, m) => sum.plus(m.valueDecimal), new Prisma.Decimal(0));

    const redistributions = await tx.revenueResourceRedistribution.findMany({ where: { revenue: { bankAccountId: account.id }, date: { gte: startOfDay, lte: endOfDay }, OR: [{ sourceResourceSourceId: resourceSourceId }, { destinationResourceSourceId: resourceSourceId }] }, select: { sourceResourceSourceId: true, valueDecimal: true } });
    const redistributionIn = redistributions.filter(row => row.sourceResourceSourceId !== resourceSourceId).reduce((sum, row) => sum.plus(row.valueDecimal), new Prisma.Decimal(0));
    const redistributionOut = redistributions.filter(row => row.sourceResourceSourceId === resourceSourceId).reduce((sum, row) => sum.plus(row.valueDecimal), new Prisma.Decimal(0));

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
  db: PrismaClient,
  input: {
    bankAccountId: string;
    startDate: Date;
    endDate: Date;
  },
) {
  if (Number.isNaN(input.startDate.getTime()) || Number.isNaN(input.endDate.getTime()) || input.startDate > input.endDate) throw new FinanceError("Informe um período válido para o extrato bancário.");
  const account = await db.bankAccount.findUnique({ where: { id: input.bankAccountId } });
  if (!account) throw new FinanceError("Conta bancária não encontrada.");

  const accountName = `${account.bankName} (${account.accountType})`;

  const movements = await db.treasuryMovement.findMany({
    where: {
      bankAccountId: account.id,
      date: { gte: input.startDate, lte: input.endDate },
      status: "Confirmado",
    },
    orderBy: [{ date: "asc" }, { id: "asc" }],
  });

  const priorMovements = await db.treasuryMovement.findMany({
    where: {
      bankAccountId: account.id,
      date: { lt: input.startDate },
      status: "Confirmado",
    },
  });

  const openingBalance = priorMovements.reduce((sum, m) => sum.plus(signedValue(m.direction, m.valueDecimal)), new Prisma.Decimal(0));

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
  db: PrismaClient,
  input: {
    bankAccountId: string;
    referenceDate: Date;
  },
) {
  const account = await db.bankAccount.findUnique({ where: { id: input.bankAccountId } });
  if (!account) throw new FinanceError("Conta bancária não encontrada.");
  const latestReconciliation = await db.bankReconciliation.findFirst({
    where: { bankAccountId: account.id, status: "Conciliado", periodEnd: { lte: input.referenceDate } },
    orderBy: { periodEnd: "desc" },
  });
  if (!latestReconciliation) {
    throw new FinanceError("Não há conciliação confirmada para informar o saldo do extrato nesta referência.");
  }

  const accountName = `${account.bankName} (${account.accountType})`;

  // Itens do extrato não conciliados (pendentes / regularizações)
  const unconciledStatementItems = await db.bankStatementItem.findMany({
    where: {
      statementImport: { bankAccountId: account.id },
      status: "Pendente",
      date: { lte: input.referenceDate },
    },
  });

  // Movimentos de tesouraria não vinculados a extrato (pendentes)
  const unconciledTreasuryMovements = await db.treasuryMovement.findMany({
    where: {
      bankAccountId: account.id,
      status: "Confirmado",
      date: { lte: input.referenceDate },
      statementItems: { none: {} },
    },
  });

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
