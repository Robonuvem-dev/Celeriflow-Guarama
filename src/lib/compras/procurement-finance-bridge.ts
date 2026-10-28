import { and, eq, inArray, sql } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseExecutor, type DatabaseTransaction } from "@/db/transaction";
import { expenses } from "@/db/schema/finance-expenses";
import { procurementContracts } from "@/db/schema/procurement-core";
import { procurementLifecycleEvents, purchaseReceipts } from "@/db/schema/procurement-requests";
import { instrumentMeasurements } from "@/db/schema/procurement-instruments";
import { procurementAppropriations } from "@/db/schema/procurement-budget";
import { procurementCommitments, procurementSettlements } from "@/db/schema/procurement-finance";
import { loadAuthorizationReservation, loadAuthorizationSettlement, loadContractAuthorizationOrigin, loadReceiptAuthorizationOrigin } from "@/db/repositories/procurement/finance-bridge";
import { lockPlanningBudgetForAppropriation } from "@/lib/planejamento/execution-bridge";
import {
  cancelCommitmentInTransaction,
  cancelSettlementInTransaction,
  createBudgetReservationInTransaction,
  createCommitmentInTransaction,
  createExpenseRequestInTransaction,
  createSettlementInTransaction,
  type FinanceActor,
} from "@/lib/financeiro";

type Db = DatabaseConnection;
type InstrumentSource = { sourceType: "CONTRACT" | "COVENANT"; sourceId: string };

export class ProcurementFinanceBridgeError extends Error {}

export const procurementFinanceEventTypes = {
  expenseAuthorizationCreated: "PROCUREMENT_EXPENSE_AUTHORIZATION_CREATED",
  supplyAuthorizationCreated: "PROCUREMENT_SUPPLY_AUTHORIZATION_CREATED",
  supplyAuthorizationCancelled: "PROCUREMENT_SUPPLY_AUTHORIZATION_CANCELLED",
  liquidationAuthorizationCreated: "PROCUREMENT_LIQUIDATION_AUTHORIZATION_CREATED",
  liquidationAuthorizationCancelled: "PROCUREMENT_LIQUIDATION_AUTHORIZATION_CANCELLED",
  commitmentCreated: "PROCUREMENT_COMMITMENT_CREATED",
  commitmentCancelled: "PROCUREMENT_COMMITMENT_CANCELLED",
  settlementCreated: "PROCUREMENT_SETTLEMENT_CREATED",
  settlementCancelled: "PROCUREMENT_SETTLEMENT_CANCELLED",
} as const;

export type ExpenseAuthorizationAllocation = {
  sourceItemId: string;
  originId: string;
  sourceQuantity: number;
  originQuantity: number;
  budgetAppropriationId: string;
  valueDecimal: Decimal | string | number;
};

export type ExpenseAuthorizationPlanItem = {
  appropriationId: string;
  valueDecimal: Decimal;
};

function requiredText(value: string, label: string) {
  const normalized = value.trim();
  if (!normalized) throw new ProcurementFinanceBridgeError(`${label} é obrigatório.`);
  return normalized;
}

function validDate(value: Date, label: string) {
  if (Number.isNaN(value.valueOf())) throw new ProcurementFinanceBridgeError(`${label} inválida.`);
  return value;
}

function decimal(value: Decimal | string | number, label: string, options: { positive?: boolean } = {}) {
  let parsed: Decimal;
  try {
    parsed = new Decimal(value);
  } catch {
    throw new ProcurementFinanceBridgeError(`${label} inválido.`);
  }
  if (!parsed.isFinite() || parsed.isNegative() || (options.positive && parsed.isZero())) {
    throw new ProcurementFinanceBridgeError(`${label} inválido.`);
  }
  return parsed.toDecimalPlaces(2);
}

function sameMoney(left: Decimal | null, right: Decimal) {
  return left !== null && new Decimal(left).toDecimalPlaces(2).equals(right.toDecimalPlaces(2));
}

function positiveQuantity(value: number, label: string) {
  if (!Number.isFinite(value) || value <= 0) throw new ProcurementFinanceBridgeError(`${label} deve ser maior que zero.`);
  return value;
}

function sourceForMeasurement(measurement: { contractId: string | null; covenantId: string | null }): InstrumentSource {
  if (measurement.contractId && !measurement.covenantId) return { sourceType: "CONTRACT", sourceId: measurement.contractId };
  if (measurement.covenantId && !measurement.contractId) return { sourceType: "COVENANT", sourceId: measurement.covenantId };
  throw new ProcurementFinanceBridgeError("A medição não possui um instrumento de origem válido.");
}

function eventInput(
  eventType: string,
  entityType: string,
  entityId: string,
  source: InstrumentSource,
  actor: FinanceActor,
  idempotencyKey: string,
) {
  return {
    eventType,
    entityType,
    entityId,
    sourceType: source.sourceType,
    sourceId: source.sourceId,
    actorUsuarioId: requiredText(actor.usuarioId, "Usuário responsável"),
    idempotencyKey,
  };
}

function assertSameLifecycleEvent<T extends { eventType: string; entityType: string; entityId: string; sourceType: string | null; sourceId: string | null }>(
  event: T,
  expected: ReturnType<typeof eventInput>,
): T {
  if (
    event.eventType !== expected.eventType
    || event.entityType !== expected.entityType
    || event.entityId !== expected.entityId
    || event.sourceType !== expected.sourceType
    || event.sourceId !== expected.sourceId
  ) {
    throw new ProcurementFinanceBridgeError("A chave de idempotência já está vinculada a outro ato de Compras.");
  }
  return event;
}

async function ensureLifecycleEvent(db: DatabaseTransaction, input: ReturnType<typeof eventInput>) {
  const select = { eventType: procurementLifecycleEvents.eventType, entityType: procurementLifecycleEvents.entityType, entityId: procurementLifecycleEvents.entityId, sourceType: procurementLifecycleEvents.sourceType, sourceId: procurementLifecycleEvents.sourceId, id: procurementLifecycleEvents.id };
  const [existing] = await db.select(select).from(procurementLifecycleEvents).where(eq(procurementLifecycleEvents.idempotencyKey, input.idempotencyKey)).limit(1);
  if (existing) return assertSameLifecycleEvent(existing, input);

  const [inserted] = await db.insert(procurementLifecycleEvents).values(input).onConflictDoNothing({ target: procurementLifecycleEvents.idempotencyKey }).returning(select);
  if (inserted) return inserted;
  const [concurrent] = await db.select(select).from(procurementLifecycleEvents).where(eq(procurementLifecycleEvents.idempotencyKey, input.idempotencyKey)).limit(1);
  if (!concurrent) throw new ProcurementFinanceBridgeError("Não foi possível confirmar o ato concorrente de Compras.");
  return assertSameLifecycleEvent(concurrent, input);
}

function eventKey(step: string, sourceType: string, sourceId: string, detail?: string) {
  return buildProcurementFinanceIdempotencyKey(step, sourceType, sourceId, detail);
}

async function lockAuthorizationAppropriation(tx: DatabaseTransaction, appropriationId: string) {
  await lockPlanningBudgetForAppropriation(tx, appropriationId);
  await tx.execute(sql`SELECT id FROM "BudgetAppropriation" WHERE id = ${appropriationId} FOR UPDATE`);
}

async function lockAuthorizationCommitment(tx: DatabaseTransaction, commitmentId: string) {
  const id = requiredText(commitmentId, "Empenho");
  const [origin] = await tx.select({ appropriationId: procurementCommitments.appropriationId }).from(procurementCommitments).where(eq(procurementCommitments.id, id)).limit(1);
  if (!origin) throw new ProcurementFinanceBridgeError("Empenho não encontrado.");
  await lockAuthorizationAppropriation(tx, origin.appropriationId);
  await tx.execute(sql`SELECT id FROM "Commitment" WHERE id = ${id} FOR UPDATE`);
  const [commitment] = await tx.select({ contractId: procurementCommitments.contractId, covenantId: procurementCommitments.covenantId }).from(procurementCommitments).where(eq(procurementCommitments.id, id)).limit(1);
  // Execution actions lock this same header before checking/cancelling an AL.
  if (commitment?.contractId) await tx.execute(sql`SELECT id FROM "Contract" WHERE id = ${commitment.contractId} FOR UPDATE`);
  if (commitment?.covenantId) await tx.execute(sql`SELECT id FROM "Covenant" WHERE id = ${commitment.covenantId} FOR UPDATE`);
}

export function buildProcurementFinanceIdempotencyKey(step: string, sourceType: string, sourceId: string, detail?: string) {
  const parts = [
    "C5",
    "PROCUREMENT_FINANCE",
    requiredText(step, "Etapa financeira"),
    requiredText(sourceType, "Tipo da origem"),
    requiredText(sourceId, "Origem"),
  ];
  if (detail !== undefined) parts.push(requiredText(detail, "Detalhe da origem"));
  return parts.join(":");
}

export function isContractSupplyAuthorizationEligible(status: string, startDate: Date, endDate: Date, authorizedAt: Date) {
  return status === "Vigente"
    && !Number.isNaN(startDate.valueOf())
    && !Number.isNaN(endDate.valueOf())
    && !Number.isNaN(authorizedAt.valueOf())
    && startDate <= authorizedAt
    && authorizedAt <= endDate;
}

export function isPurchaseReceiptLiquidationAuthorizationEligible(status: string) {
  return status === "APPROVED";
}

export function isInstrumentMeasurementLiquidationAuthorizationEligible(status: string) {
  return status === "Atestada";
}

export function buildExpenseAuthorizationPlan(
  allocations: readonly ExpenseAuthorizationAllocation[],
  contractValue: Decimal | string | number,
): ExpenseAuthorizationPlanItem[] {
  const expectedValue = decimal(contractValue, "Valor do contrato", { positive: true });
  if (!allocations.length) throw new ProcurementFinanceBridgeError("O contrato não possui alocações orçamentárias de origem.");

  const sourceQuantities = new Map<string, number>();
  const originTotals = new Map<string, number>();
  const origins = new Map<string, { sourceItemId: string; originQuantity: number }>();
  const appropriationsBySource = new Map<string, Set<string>>();
  const byAppropriation = new Map<string, Decimal>();

  for (const allocation of allocations) {
    const sourceItemId = requiredText(allocation.sourceItemId, "Item de origem");
    const originId = requiredText(allocation.originId, "Vínculo do item de origem");
    const appropriationId = requiredText(allocation.budgetAppropriationId, "Dotação orçamentária");
    const sourceQuantity = positiveQuantity(allocation.sourceQuantity, "Quantidade do item de origem");
    const originQuantity = positiveQuantity(allocation.originQuantity, "Quantidade vinculada ao processo");
    if (originQuantity > sourceQuantity) {
      throw new ProcurementFinanceBridgeError("A quantidade vinculada ao processo excede a quantidade do item de origem.");
    }

    const knownSourceQuantity = sourceQuantities.get(sourceItemId);
    if (knownSourceQuantity !== undefined && knownSourceQuantity !== sourceQuantity) {
      throw new ProcurementFinanceBridgeError("O item de origem possui quantidades conflitantes.");
    }
    sourceQuantities.set(sourceItemId, sourceQuantity);
    const appropriations = appropriationsBySource.get(sourceItemId) ?? new Set<string>();
    appropriations.add(appropriationId);
    appropriationsBySource.set(sourceItemId, appropriations);
    const knownOrigin = origins.get(originId);
    if (knownOrigin) {
      if (knownOrigin.sourceItemId !== sourceItemId || knownOrigin.originQuantity !== originQuantity) {
        throw new ProcurementFinanceBridgeError("O vínculo do item de origem possui dados conflitantes.");
      }
    } else {
      origins.set(originId, { sourceItemId, originQuantity });
      originTotals.set(sourceItemId, (originTotals.get(sourceItemId) ?? 0) + originQuantity);
    }

    const allocatedValue = decimal(allocation.valueDecimal, "Valor da alocação");
    const apportionedValue = allocatedValue.mul(originQuantity).div(sourceQuantity);
    byAppropriation.set(appropriationId, (byAppropriation.get(appropriationId) ?? new Decimal(0)).plus(apportionedValue));
  }

  for (const [sourceItemId, originTotal] of originTotals) {
    if (originTotal > sourceQuantities.get(sourceItemId)! + 0.0000001) {
      throw new ProcurementFinanceBridgeError("O item de origem foi vinculado ao processo acima de sua quantidade disponível.");
    }
    if (originTotal < sourceQuantities.get(sourceItemId)! - 0.0000001 && appropriationsBySource.get(sourceItemId)!.size > 1) {
      throw new ProcurementFinanceBridgeError("Não é seguro ratear parcialmente um item de origem entre várias dotações.");
    }
  }

  const plan = [...byAppropriation]
    .map(([appropriationId, valueDecimal]) => ({ appropriationId, valueDecimal: valueDecimal.toDecimalPlaces(2) }))
    .filter((item) => item.valueDecimal.greaterThan(0))
    .sort((left, right) => left.appropriationId.localeCompare(right.appropriationId));
  const plannedValue = plan.reduce((total, item) => total.plus(item.valueDecimal), new Decimal(0));
  if (!plannedValue.equals(expectedValue)) {
    throw new ProcurementFinanceBridgeError("As dotações herdadas não conciliam exatamente com o valor atualizado do contrato.");
  }
  return plan;
}

async function contractForExpenseAuthorizations(db: DatabaseExecutor, contractId: string, authorizedAt: Date) {
  const contract = await loadContractAuthorizationOrigin(db, contractId);
  if (!contract) throw new ProcurementFinanceBridgeError("Contrato não encontrado.");
  if (!contract.sourceBudgetUnitId) throw new ProcurementFinanceBridgeError("O contrato não possui Unidade Gestora de origem para gerar AE.");
  if (contract.supplier.status !== "Ativo") throw new ProcurementFinanceBridgeError("O fornecedor do contrato não está ativo.");
  if (!isContractSupplyAuthorizationEligible(contract.status, contract.startDate, contract.endDate, authorizedAt)) {
    throw new ProcurementFinanceBridgeError("A geração de AE exige contrato vigente na data autorizada.");
  }
  if (!contract.process.items.length) throw new ProcurementFinanceBridgeError("O contrato não possui itens de processo para herdar as dotações.");

  const hasOrigins = contract.process.items.some((item) => item.requestItemOrigins.length > 0);
  if (hasOrigins && contract.process.items.some((item) => !item.requestItemOrigins.length)) {
    throw new ProcurementFinanceBridgeError("Todos os itens do processo devem possuir origem de solicitação para gerar AE.");
  }

  const allocations: ExpenseAuthorizationAllocation[] = hasOrigins
    ? contract.process.items.flatMap((item) => item.requestItemOrigins.flatMap((origin) => origin.purchaseRequestItem.budgetAllocations.map((allocation) => ({
      sourceItemId: origin.purchaseRequestItem.id,
      originId: origin.id,
      sourceQuantity: origin.purchaseRequestItem.quantity,
      originQuantity: origin.quantity,
      budgetAppropriationId: allocation.budgetAppropriationId,
      valueDecimal: allocation.valueDecimal,
    }))))
    : (contract.process.purchaseRequest?.items ?? []).flatMap((item) => item.budgetAllocations.map((allocation) => ({
      sourceItemId: item.id,
      originId: `LEGACY:${item.id}`,
      sourceQuantity: item.quantity,
      originQuantity: item.quantity,
      budgetAppropriationId: allocation.budgetAppropriationId,
      valueDecimal: allocation.valueDecimal,
    })));
  const plan = buildExpenseAuthorizationPlan(allocations, contract.updatedValue);
  const appropriations = await db.select({ id: procurementAppropriations.id, budgetUnitId: procurementAppropriations.budgetUnitId }).from(procurementAppropriations).where(inArray(procurementAppropriations.id, plan.map(item => item.appropriationId)));
  if (appropriations.length !== plan.length || appropriations.some((appropriation) => appropriation.budgetUnitId !== contract.sourceBudgetUnitId)) {
    throw new ProcurementFinanceBridgeError("As dotações herdadas devem pertencer à Unidade Gestora de origem do contrato.");
  }
  return { contract, plan };
}

function assertDerivedExpense(
  expense: {
    appropriationId: string;
    supplierId: string | null;
    secretariatId: string;
    sourceModule: string;
    sourceType: string;
    sourceId: string | null;
    eventType: string;
    valueDecimal: Decimal | null;
  },
  input: { appropriationId: string; supplierId: string; secretariatId: string; contractId: string; valueDecimal: Decimal },
) {
  if (
    expense.appropriationId !== input.appropriationId
    || expense.supplierId !== input.supplierId
    || expense.secretariatId !== input.secretariatId
    || expense.sourceModule !== "COMPRAS"
    || expense.sourceType !== "CONTRACT"
    || expense.sourceId !== input.contractId
    || expense.eventType !== procurementFinanceEventTypes.expenseAuthorizationCreated
    || !sameMoney(expense.valueDecimal, input.valueDecimal)
  ) {
    throw new ProcurementFinanceBridgeError("A AE existente não corresponde à origem contratual informada.");
  }
}

export async function deriveExpenseAuthorizationsForContract(
  db: Db,
  actor: FinanceActor,
  contractId: string,
  authorizedAt = new Date(),
) {
  const normalizedContractId = requiredText(contractId, "Contrato");
  validDate(authorizedAt, "Data da autorização");
  return withDatabaseTransaction(db, async tx => {
  const { contract, plan } = await contractForExpenseAuthorizations(tx, normalizedContractId, authorizedAt);
  const authorizations: Array<{ expenseId: string; appropriationId: string; valueDecimal: Decimal; eventId: string }> = [];

  for (const item of plan) {
    await lockAuthorizationAppropriation(tx, item.appropriationId);
    const [appropriation] = await tx.select({ budgetUnitId: procurementAppropriations.budgetUnitId }).from(procurementAppropriations).where(eq(procurementAppropriations.id, item.appropriationId)).limit(1);
    if (!appropriation || (actor.allowedBudgetUnitIds && !actor.allowedBudgetUnitIds.includes(appropriation.budgetUnitId))) throw new ProcurementFinanceBridgeError("Operação financeira fora das unidades autorizadas.");
    const key = eventKey("AE", "CONTRACT", contract.id, item.appropriationId);
    let [expense] = await tx.select().from(expenses).where(eq(expenses.idempotencyKey, key)).limit(1);
    if (!expense) {
      expense = await createExpenseRequestInTransaction(tx, actor, {
        date: authorizedAt,
        description: `AE ${contract.number}: ${contract.object}`,
        value: item.valueDecimal,
        appropriationId: item.appropriationId,
        supplierId: contract.supplierId,
        secretariatId: contract.secretariatId,
        sourceModule: "COMPRAS",
        sourceType: "CONTRACT",
        sourceId: contract.id,
        eventType: procurementFinanceEventTypes.expenseAuthorizationCreated,
        idempotencyKey: key,
      });
    }
    assertDerivedExpense(expense, {
      appropriationId: item.appropriationId,
      supplierId: contract.supplierId,
      secretariatId: contract.secretariatId,
      contractId: contract.id,
      valueDecimal: item.valueDecimal,
    });
    const event = await ensureLifecycleEvent(tx, eventInput(
      procurementFinanceEventTypes.expenseAuthorizationCreated,
      "EXPENSE_AUTHORIZATION",
      expense.id,
      { sourceType: "CONTRACT", sourceId: contract.id },
      actor,
      eventKey("AE_EVENT", "CONTRACT", contract.id, item.appropriationId),
    ));
    authorizations.push({ expenseId: expense.id, appropriationId: item.appropriationId, valueDecimal: item.valueDecimal, eventId: event.id });
  }
  return authorizations;
  });
}

export async function recordSupplyAuthorizationForContract(
  db: Db,
  actor: FinanceActor,
  contractId: string,
  authorizedAt = new Date(),
) {
  const normalizedContractId = requiredText(contractId, "Contrato");
  validDate(authorizedAt, "Data da autorização");
  return withDatabaseTransaction(db, async tx => {
  const contract = await loadContractAuthorizationOrigin(tx, normalizedContractId);
  if (!contract) throw new ProcurementFinanceBridgeError("Contrato não encontrado.");
  if (!isContractSupplyAuthorizationEligible(contract.status, contract.startDate, contract.endDate, authorizedAt)) {
    throw new ProcurementFinanceBridgeError("A geração de AF exige contrato vigente na data autorizada.");
  }
  if (contract.supplier.status !== "Ativo") throw new ProcurementFinanceBridgeError("O fornecedor do contrato não está ativo.");
  if (!contract.process.items.length) throw new ProcurementFinanceBridgeError("A AF exige itens de fornecimento vinculados ao contrato.");

  const itemsValue = contract.process.items.reduce((total, item) => {
    const quantity = positiveQuantity(item.quantity, "Quantidade do item de fornecimento");
    if (item.estimatedUnitValue === null || !Number.isFinite(item.estimatedUnitValue) || item.estimatedUnitValue < 0) {
      throw new ProcurementFinanceBridgeError("Todos os itens da AF devem possuir valor unitário válido.");
    }
    return total.plus(new Decimal(String(quantity)).mul(item.estimatedUnitValue));
  }, new Decimal(0)).toDecimalPlaces(2);
  if (!itemsValue.equals(decimal(contract.updatedValue, "Valor atualizado do contrato", { positive: true }))) {
    throw new ProcurementFinanceBridgeError("Os itens de fornecimento não conciliam exatamente com o valor atualizado do contrato.");
  }

  return ensureLifecycleEvent(tx, eventInput(
    procurementFinanceEventTypes.supplyAuthorizationCreated,
    "SUPPLY_AUTHORIZATION",
    contract.id,
    { sourceType: "CONTRACT", sourceId: contract.id },
    actor,
    eventKey("AF", "CONTRACT", contract.id),
  ));
  });
}

function receiptValue(items: Array<{ quantity: number; unitCost: number }>, options: { positive?: boolean } = {}) {
  if (!items.length) throw new ProcurementFinanceBridgeError("O recebimento não possui itens para gerar AL.");
  const value = items.reduce((total, item) => {
    const quantity = positiveQuantity(item.quantity, "Quantidade recebida");
    if (!Number.isFinite(item.unitCost) || item.unitCost < 0) throw new ProcurementFinanceBridgeError("Custo unitário do recebimento inválido.");
    return total.plus(new Decimal(String(quantity)).mul(item.unitCost));
  }, new Decimal(0)).toDecimalPlaces(2);
  if (options.positive !== false && value.lessThanOrEqualTo(0)) {
    throw new ProcurementFinanceBridgeError("O recebimento deve possuir valor positivo para gerar AL.");
  }
  return value;
}

export async function recordPurchaseReceiptLiquidationAuthorization(
  db: DatabaseTransaction,
  actor: FinanceActor,
  purchaseReceiptId: string,
) {
  const receipt = await loadReceiptAuthorizationOrigin(db, requiredText(purchaseReceiptId, "Recebimento"));
  if (!receipt) throw new ProcurementFinanceBridgeError("Recebimento não encontrado.");
  if (!isPurchaseReceiptLiquidationAuthorizationEligible(receipt.status)) {
    throw new ProcurementFinanceBridgeError("A AL exige um recebimento aprovado.");
  }
  const valueDecimal = receiptValue(receipt.items, { positive: false });
  if (valueDecimal.isZero()) return null;
  const event = await ensureLifecycleEvent(db, eventInput(
    procurementFinanceEventTypes.liquidationAuthorizationCreated,
    "LIQUIDATION_AUTHORIZATION",
    receipt.id,
    { sourceType: "CONTRACT", sourceId: receipt.contractId },
    actor,
    eventKey("AL", "PURCHASE_RECEIPT", receipt.id),
  ));
  return { eventId: event.id, valueDecimal };
}

export async function recordInstrumentMeasurementLiquidationAuthorization(
  db: DatabaseTransaction,
  actor: FinanceActor,
  measurementId: string,
) {
  const [measurement] = await db.select().from(instrumentMeasurements).where(eq(instrumentMeasurements.id, requiredText(measurementId, "Medição"))).limit(1);
  if (!measurement) throw new ProcurementFinanceBridgeError("Medição não encontrada.");
  if (!isInstrumentMeasurementLiquidationAuthorizationEligible(measurement.status)) return null;
  const valueDecimal = decimal(measurement.valueDecimal, "Valor da medição");
  if (valueDecimal.isZero()) return null;
  const source = sourceForMeasurement(measurement);
  const event = await ensureLifecycleEvent(db, eventInput(
    procurementFinanceEventTypes.liquidationAuthorizationCreated,
    "LIQUIDATION_AUTHORIZATION",
    measurement.id,
    source,
    actor,
    eventKey("AL", "INSTRUMENT_MEASUREMENT", measurement.id),
  ));
  return { eventId: event.id, valueDecimal };
}

async function contractForExpenseAuthorization(db: DatabaseExecutor, expenseId: string) {
  const [expense] = await db.select().from(expenses).where(eq(expenses.id, requiredText(expenseId, "AE"))).limit(1);
  if (!expense) throw new ProcurementFinanceBridgeError("AE não encontrada.");
  if (
    expense.sourceModule !== "COMPRAS"
    || expense.sourceType !== "CONTRACT"
    || !expense.sourceId
    || expense.eventType !== procurementFinanceEventTypes.expenseAuthorizationCreated
    || !expense.supplierId
  ) {
    throw new ProcurementFinanceBridgeError("A solicitação de despesa não é uma AE contratual derivada pelo bridge.");
  }
  const [contract] = await db.select().from(procurementContracts).where(eq(procurementContracts.id, expense.sourceId)).limit(1);
  if (!contract) throw new ProcurementFinanceBridgeError("O contrato de origem da AE não foi encontrado.");
  if (contract.supplierId !== expense.supplierId) throw new ProcurementFinanceBridgeError("O fornecedor da AE não corresponde ao contrato de origem.");
  return { expense, contract };
}

async function recordCommitmentEvent(db: DatabaseTransaction, actor: FinanceActor, commitmentId: string, contractId: string) {
  return ensureLifecycleEvent(db, eventInput(
    procurementFinanceEventTypes.commitmentCreated,
    "COMMITMENT",
    commitmentId,
    { sourceType: "CONTRACT", sourceId: contractId },
    actor,
    eventKey("COMMITMENT", "CONTRACT", contractId, commitmentId),
  ));
}

export async function createCommitmentFromExpenseAuthorization(
  db: Db,
  actor: FinanceActor,
  input: {
    expenseId: string;
    reservationId?: string;
    reservationNumber: string;
    commitmentNumber: string;
    date: Date;
    value?: Decimal | string | number;
    type: string;
    history?: string;
  },
) {
  const date = validDate(input.date, "Data do empenho");
  const reservationNumber = requiredText(input.reservationNumber, "Número da reserva");
  const commitmentNumber = requiredText(input.commitmentNumber, "Número do empenho");
  return withDatabaseTransaction(db, async (tx) => {
  const db = tx;
  const [origin] = await db.select({ appropriationId: expenses.appropriationId }).from(expenses).where(eq(expenses.id, input.expenseId)).limit(1);
  if (!origin) throw new ProcurementFinanceBridgeError("AE não encontrada.");
   // Follow the native Planning instrument → appropriation → expense lock order.
   await lockAuthorizationAppropriation(db, origin.appropriationId);
  await db.execute(sql`SELECT id FROM "Expense" WHERE id = ${input.expenseId} FOR UPDATE`);
  const { expense, contract } = await contractForExpenseAuthorization(db, input.expenseId);
  const [appropriation] = await db.select({ budgetUnitId: procurementAppropriations.budgetUnitId }).from(procurementAppropriations).where(eq(procurementAppropriations.id, expense.appropriationId)).limit(1);
  if (!appropriation) throw new ProcurementFinanceBridgeError("Dotação da AE não encontrada.");
  if (actor.allowedBudgetUnitIds && !actor.allowedBudgetUnitIds.includes(appropriation.budgetUnitId)) throw new ProcurementFinanceBridgeError("Operação financeira fora das unidades autorizadas.");
  const valueDecimal = decimal(expense.valueDecimal ?? "0", "Valor da AE", { positive: true });
  if (input.value !== undefined && !decimal(input.value, "Valor do empenho", { positive: true }).equals(valueDecimal)) {
    throw new ProcurementFinanceBridgeError("O empenho deve corresponder integralmente ao valor da AE.");
  }

  const requestedReservationId = input.reservationId === undefined
    ? undefined
    : requiredText(input.reservationId, "Reserva");
  const existingReservation = await loadAuthorizationReservation(db, { id: requestedReservationId, expenseId: expense.id });
  if (requestedReservationId && !existingReservation) {
    throw new ProcurementFinanceBridgeError("Reserva não encontrada.");
  }
  if (existingReservation && existingReservation.expenseId !== expense.id) {
    throw new ProcurementFinanceBridgeError("A reserva informada não pertence à AE.");
  }
  if (existingReservation?.number !== undefined && existingReservation.number !== reservationNumber) {
    throw new ProcurementFinanceBridgeError("A AE já possui uma reserva com outro número.");
  }
  if (existingReservation?.commitment) {
    if (existingReservation.commitment.number !== commitmentNumber) {
      throw new ProcurementFinanceBridgeError("A AE já possui um empenho com outro número.");
    }
    if (existingReservation.commitment.status === "Anulado") {
      throw new ProcurementFinanceBridgeError("O empenho anterior da AE está anulado; emita uma nova AE antes de gerar outro empenho.");
    }
    const previous = existingReservation.commitment;
    const expectedHistory = input.history?.trim() || `Empenho da AE do contrato ${contract.number}: ${contract.object}`;
    if (previous.date.getTime() !== date.getTime() || previous.type !== input.type || previous.history !== expectedHistory || !previous.valueDecimal?.equals(valueDecimal) || previous.appropriationId !== expense.appropriationId || previous.supplierId !== expense.supplierId || previous.contractId !== contract.id) throw new ProcurementFinanceBridgeError("A AE já possui empenho com outros dados; preserve a origem.");
    const event = await recordCommitmentEvent(db, actor, existingReservation.commitment.id, contract.id);
    return { commitment: existingReservation.commitment, eventId: event.id };
  }
  if (!existingReservation && expense.status !== "Aprovada") {
    throw new ProcurementFinanceBridgeError("A emissão do empenho exige uma AE aprovada pelo fluxo financeiro.");
  }

  const reservation = existingReservation ?? await createBudgetReservationInTransaction(db, actor, {
    number: reservationNumber,
    date,
    value: valueDecimal,
    appropriationId: expense.appropriationId,
    expenseId: expense.id,
    justification: `Reserva da AE derivada do contrato ${contract.number}.`,
  });
  if (reservation.status !== "Ativa") {
    throw new ProcurementFinanceBridgeError("A reserva da AE não está ativa para emissão do empenho.");
  }

  const commitment = await createCommitmentInTransaction(db, actor, {
      number: commitmentNumber,
      date,
      value: valueDecimal,
      type: input.type,
      history: input.history?.trim() || `Empenho da AE do contrato ${contract.number}: ${contract.object}`,
      appropriationId: expense.appropriationId,
      supplierId: expense.supplierId!,
      reservationId: reservation.id,
      contractId: contract.id,
    });
  const event = await recordCommitmentEvent(db, actor, commitment.id, contract.id);
  return { commitment, eventId: event.id };
  }, { timeoutMs: 60000 });
}

function assertCommitmentSource(
  commitment: { contractId: string | null; covenantId: string | null },
  source: InstrumentSource,
) {
  const belongs = source.sourceType === "CONTRACT"
    ? commitment.contractId === source.sourceId
    : commitment.covenantId === source.sourceId;
  if (!belongs) throw new ProcurementFinanceBridgeError("O empenho não pertence à origem da AL.");
}

async function recordSettlementEvent(db: DatabaseTransaction, actor: FinanceActor, settlementId: string, source: InstrumentSource, sourceEntityId: string) {
  return ensureLifecycleEvent(db, eventInput(
    procurementFinanceEventTypes.settlementCreated,
    "SETTLEMENT",
    settlementId,
    source,
    actor,
    eventKey("SETTLEMENT", source.sourceType, sourceEntityId, settlementId),
  ));
}

export async function createSettlementFromPurchaseReceiptAuthorization(
  db: Db,
  actor: FinanceActor,
  input: {
    purchaseReceiptId: string;
    commitmentId: string;
    date?: Date;
    value?: Decimal | string | number;
    authorId?: string;
    documentRef?: string;
    fiscalDocumentNumber?: string;
    fiscalDocumentSeries?: string;
    fiscalDocumentIssueDate?: Date;
    fiscalDocumentAccessKey?: string;
    notes?: string;
    serviceCode?: string;
    retentionRuleIds?: string[];
  },
) {
  return withDatabaseTransaction(db, async (tx) => {
  const db = tx;
   await lockAuthorizationCommitment(db, input.commitmentId);
  await db.execute(sql`SELECT id FROM "PurchaseReceipt" WHERE id = ${requiredText(input.purchaseReceiptId, "Recebimento")} FOR UPDATE`);
  const receipt = await loadReceiptAuthorizationOrigin(db, requiredText(input.purchaseReceiptId, "Recebimento"));
  if (!receipt || !isPurchaseReceiptLiquidationAuthorizationEligible(receipt.status)) {
    throw new ProcurementFinanceBridgeError("A liquidação exige um recebimento aprovado.");
  }
  const source: InstrumentSource = { sourceType: "CONTRACT", sourceId: receipt.contractId };
  const [commitment] = await db.select({ id: procurementCommitments.id, contractId: procurementCommitments.contractId, covenantId: procurementCommitments.covenantId, appropriation: { budgetUnitId: procurementAppropriations.budgetUnitId } }).from(procurementCommitments).innerJoin(procurementAppropriations, eq(procurementAppropriations.id, procurementCommitments.appropriationId)).where(eq(procurementCommitments.id, requiredText(input.commitmentId, "Empenho"))).limit(1);
  if (!commitment) throw new ProcurementFinanceBridgeError("Empenho não encontrado.");
  assertCommitmentSource(commitment, source);
  if (actor.allowedBudgetUnitIds && !actor.allowedBudgetUnitIds.includes(commitment.appropriation.budgetUnitId)) throw new ProcurementFinanceBridgeError("Operação financeira fora das unidades autorizadas.");
  await recordPurchaseReceiptLiquidationAuthorization(db, actor, receipt.id);
  const valueDecimal = receiptValue(receipt.items);
  const date = validDate(input.date ?? receipt.receivedAt, "Data da liquidação");
  const documentRef = `AL-${receipt.number}`;
  if (input.value !== undefined && !decimal(input.value, "Valor da liquidação", { positive: true }).equals(valueDecimal)) {
    throw new ProcurementFinanceBridgeError("A liquidação deve corresponder integralmente ao valor do recebimento atestado.");
  }
  if (input.authorId && input.authorId !== receipt.attesterId) {
    throw new ProcurementFinanceBridgeError("O responsável pela liquidação deve corresponder ao atestador do recebimento.");
  }
  if (input.documentRef?.trim() && input.documentRef.trim() !== documentRef) {
    throw new ProcurementFinanceBridgeError("A referência da liquidação deve corresponder à AL do recebimento.");
  }
  const existing = await loadAuthorizationSettlement(db, { commitmentId: commitment.id, documentId: receipt.documentId, documentRef });
  if (existing) {
    if (!sameMoney(existing.valueDecimal, valueDecimal) || existing.authorId !== receipt.attesterId || existing.status !== "Liquidado") {
      throw new ProcurementFinanceBridgeError("A liquidação existente não corresponde à AL do recebimento.");
    }
    assertSettlementReplay(existing, { ...input, date });
    const event = await recordSettlementEvent(db, actor, existing.id, source, receipt.id);
    return { settlement: existing, eventId: event.id };
  }

  const settlement = await createSettlementInTransaction(db, actor, {
    date,
    value: valueDecimal,
    documentRef,
    documentId: receipt.documentId,
    commitmentId: commitment.id,
    authorId: receipt.attesterId,
    fiscalDocumentNumber: input.fiscalDocumentNumber,
    fiscalDocumentSeries: input.fiscalDocumentSeries,
    fiscalDocumentIssueDate: input.fiscalDocumentIssueDate,
    fiscalDocumentAccessKey: input.fiscalDocumentAccessKey,
    notes: input.notes,
    serviceCode: input.serviceCode,
    retentionRuleIds: input.retentionRuleIds,
  });
  const event = await recordSettlementEvent(db, actor, settlement.id, source, receipt.id);
  return { settlement, eventId: event.id };
  }, { timeoutMs: 60000 });
}

export async function createSettlementFromInstrumentMeasurementAuthorization(
  db: Db,
  actor: FinanceActor,
  input: {
    measurementId: string;
    commitmentId: string;
    documentId?: string;
    authorId: string;
    date?: Date;
    value?: Decimal | string | number;
    documentRef?: string;
    fiscalDocumentNumber?: string;
    fiscalDocumentSeries?: string;
    fiscalDocumentIssueDate?: Date;
    fiscalDocumentAccessKey?: string;
    notes?: string;
    serviceCode?: string;
    retentionRuleIds?: string[];
  },
) {
  return withDatabaseTransaction(db, async (tx) => {
  const db = tx;
   await lockAuthorizationCommitment(db, input.commitmentId);
  await db.execute(sql`SELECT id FROM "InstrumentMeasurement" WHERE id = ${requiredText(input.measurementId, "Medição")} FOR UPDATE`);
  const [measurement] = await db.select().from(instrumentMeasurements).where(eq(instrumentMeasurements.id, requiredText(input.measurementId, "Medição"))).limit(1);
  if (!measurement || !isInstrumentMeasurementLiquidationAuthorizationEligible(measurement.status)) {
    throw new ProcurementFinanceBridgeError("A liquidação exige uma medição atestada.");
  }
  const authorization = await recordInstrumentMeasurementLiquidationAuthorization(db, actor, measurement.id);
  if (!authorization) throw new ProcurementFinanceBridgeError("A medição atestada não possui valor positivo para gerar AL.");
  const source = sourceForMeasurement(measurement);
  const [commitment] = await db.select({ id: procurementCommitments.id, contractId: procurementCommitments.contractId, covenantId: procurementCommitments.covenantId, appropriation: { budgetUnitId: procurementAppropriations.budgetUnitId } }).from(procurementCommitments).innerJoin(procurementAppropriations, eq(procurementAppropriations.id, procurementCommitments.appropriationId)).where(eq(procurementCommitments.id, requiredText(input.commitmentId, "Empenho"))).limit(1);
  if (!commitment) throw new ProcurementFinanceBridgeError("Empenho não encontrado.");
  assertCommitmentSource(commitment, source);
  if (actor.allowedBudgetUnitIds && !actor.allowedBudgetUnitIds.includes(commitment.appropriation.budgetUnitId)) throw new ProcurementFinanceBridgeError("Operação financeira fora das unidades autorizadas.");
  const documentId = input.documentId?.trim() || measurement.documentId;
  if (!documentId) throw new ProcurementFinanceBridgeError("A liquidação da medição exige documento GED válido.");
  const authorId = requiredText(input.authorId, "Responsável pelo ateste");
  const date = validDate(input.date ?? measurement.measuredAt, "Data da liquidação");
  const documentRef = `AL-MED-${measurement.id}`;
  if (input.value !== undefined && !decimal(input.value, "Valor da liquidação", { positive: true }).equals(authorization.valueDecimal)) {
    throw new ProcurementFinanceBridgeError("A liquidação deve corresponder integralmente ao valor da medição atestada.");
  }
  if (input.documentRef?.trim() && input.documentRef.trim() !== documentRef) {
    throw new ProcurementFinanceBridgeError("A referência da liquidação deve corresponder à AL da medição.");
  }
  const existing = await loadAuthorizationSettlement(db, { commitmentId: commitment.id, documentId, documentRef });
  if (existing) {
    if (!sameMoney(existing.valueDecimal, authorization.valueDecimal) || existing.authorId !== authorId || existing.status !== "Liquidado") {
      throw new ProcurementFinanceBridgeError("A liquidação existente não corresponde à AL da medição.");
    }
    assertSettlementReplay(existing, { ...input, date });
    const event = await recordSettlementEvent(db, actor, existing.id, source, measurement.id);
    return { settlement: existing, eventId: event.id };
  }

  const settlement = await createSettlementInTransaction(db, actor, {
    date,
    value: authorization.valueDecimal,
    documentRef,
    documentId,
    commitmentId: commitment.id,
    authorId,
    fiscalDocumentNumber: input.fiscalDocumentNumber,
    fiscalDocumentSeries: input.fiscalDocumentSeries,
    fiscalDocumentIssueDate: input.fiscalDocumentIssueDate,
    fiscalDocumentAccessKey: input.fiscalDocumentAccessKey,
    notes: input.notes,
    serviceCode: input.serviceCode,
    retentionRuleIds: input.retentionRuleIds,
  });
  const event = await recordSettlementEvent(db, actor, settlement.id, source, measurement.id);
  return { settlement, eventId: event.id };
  }, { timeoutMs: 60000 });
}

function assertSettlementReplay(settlement: { date: Date; notes: string | null; fiscalDocumentNumber: string | null; fiscalDocumentSeries: string | null; fiscalDocumentIssueDate: Date | null; fiscalDocumentAccessKey: string | null; retentions: Array<{ retentionRuleId: string }> }, input: { date: Date; notes?: string; fiscalDocumentNumber?: string; fiscalDocumentSeries?: string; fiscalDocumentIssueDate?: Date; fiscalDocumentAccessKey?: string; retentionRuleIds?: string[] }) {
  const text = (value: string | null | undefined) => value?.trim() || null;
  const requestedRules = [...new Set(input.retentionRuleIds ?? [])].sort();
  const previousRules = settlement.retentions.map((item) => item.retentionRuleId).sort();
  if (settlement.date.getTime() !== input.date.getTime() || text(settlement.notes) !== text(input.notes) || text(settlement.fiscalDocumentNumber) !== text(input.fiscalDocumentNumber) || text(settlement.fiscalDocumentSeries) !== text(input.fiscalDocumentSeries) || (settlement.fiscalDocumentIssueDate?.getTime() ?? null) !== (input.fiscalDocumentIssueDate?.getTime() ?? null) || text(settlement.fiscalDocumentAccessKey) !== (input.fiscalDocumentAccessKey?.replace(/\D/g, "") || null) || JSON.stringify(previousRules) !== JSON.stringify(requestedRules)) throw new ProcurementFinanceBridgeError("Liquidação já registrada com outros dados; preserve documento fiscal, competência e retenções.");
}

export async function cancelSupplyAuthorizationForContract(db: Db, actor: FinanceActor, contractId: string) {
  return withDatabaseTransaction(db, tx => cancelSupplyAuthorizationForContractInTransaction(tx, actor, contractId));
}

async function cancelSupplyAuthorizationForContractInTransaction(db: DatabaseTransaction, actor: FinanceActor, contractId: string) {
  const [contract] = await db.select({ id: procurementContracts.id, status: procurementContracts.status }).from(procurementContracts).where(eq(procurementContracts.id, requiredText(contractId, "Contrato"))).limit(1);
  if (!contract) throw new ProcurementFinanceBridgeError("Contrato não encontrado.");
  if (!["Suspenso", "Rescindido"].includes(contract.status)) {
    throw new ProcurementFinanceBridgeError("A anulação da AF exige contrato suspenso ou rescindido.");
  }
  const [receipts, measurements] = await Promise.all([
    db.select({ id: purchaseReceipts.id }).from(purchaseReceipts).where(and(eq(purchaseReceipts.contractId, contract.id), eq(purchaseReceipts.status, "APPROVED"))).limit(1),
    db.select({ id: instrumentMeasurements.id }).from(instrumentMeasurements).where(and(eq(instrumentMeasurements.contractId, contract.id), eq(instrumentMeasurements.status, "Atestada"))).limit(1),
  ]);
  if (receipts.length || measurements.length) {
    throw new ProcurementFinanceBridgeError("A AF não pode ser anulada após recebimento aprovado ou medição atestada.");
  }
  const [authorization] = await db.select({ id: procurementLifecycleEvents.id }).from(procurementLifecycleEvents).where(eq(procurementLifecycleEvents.idempotencyKey, eventKey("AF", "CONTRACT", contract.id))).limit(1);
  if (!authorization) return null;
  return ensureLifecycleEvent(db, eventInput(
    procurementFinanceEventTypes.supplyAuthorizationCancelled,
    "SUPPLY_AUTHORIZATION",
    contract.id,
    { sourceType: "CONTRACT", sourceId: contract.id },
    actor,
    eventKey("AF_CANCEL", "CONTRACT", contract.id),
  ));
}

export async function cancelPurchaseReceiptLiquidationAuthorization(db: DatabaseTransaction, actor: FinanceActor, purchaseReceiptId: string) {
  const [receipt] = await db.select({ id: purchaseReceipts.id, status: purchaseReceipts.status, contractId: purchaseReceipts.contractId }).from(purchaseReceipts).where(eq(purchaseReceipts.id, requiredText(purchaseReceiptId, "Recebimento"))).limit(1);
  if (!receipt) throw new ProcurementFinanceBridgeError("Recebimento não encontrado.");
  if (receipt.status !== "CANCELLED") throw new ProcurementFinanceBridgeError("A anulação da AL exige recebimento cancelado.");
  const [authorization] = await db.select({ id: procurementLifecycleEvents.id }).from(procurementLifecycleEvents).where(eq(procurementLifecycleEvents.idempotencyKey, eventKey("AL", "PURCHASE_RECEIPT", receipt.id))).limit(1);
  if (!authorization) return null;
  return ensureLifecycleEvent(db, eventInput(
    procurementFinanceEventTypes.liquidationAuthorizationCancelled,
    "LIQUIDATION_AUTHORIZATION",
    receipt.id,
    { sourceType: "CONTRACT", sourceId: receipt.contractId },
    actor,
    eventKey("AL_CANCEL", "PURCHASE_RECEIPT", receipt.id),
  ));
}

export async function cancelInstrumentMeasurementLiquidationAuthorization(db: DatabaseTransaction, actor: FinanceActor, measurementId: string) {
  const [measurement] = await db.select().from(instrumentMeasurements).where(eq(instrumentMeasurements.id, requiredText(measurementId, "Medição"))).limit(1);
  if (!measurement) throw new ProcurementFinanceBridgeError("Medição não encontrada.");
  if (measurement.status !== "Cancelada") throw new ProcurementFinanceBridgeError("A anulação da AL exige medição cancelada.");
  const [authorization] = await db.select({ id: procurementLifecycleEvents.id }).from(procurementLifecycleEvents).where(eq(procurementLifecycleEvents.idempotencyKey, eventKey("AL", "INSTRUMENT_MEASUREMENT", measurement.id))).limit(1);
  if (!authorization) return null;
  const source = sourceForMeasurement(measurement);
  return ensureLifecycleEvent(db, eventInput(
    procurementFinanceEventTypes.liquidationAuthorizationCancelled,
    "LIQUIDATION_AUTHORIZATION",
    measurement.id,
    source,
    actor,
    eventKey("AL_CANCEL", "INSTRUMENT_MEASUREMENT", measurement.id),
  ));
}

export async function cancelCommitmentForCancelledContract(db: Db, actor: FinanceActor, commitmentId: string) {
  return withDatabaseTransaction(db, async (tx) => {
   await lockAuthorizationCommitment(tx, commitmentId);
  const [commitment] = await tx.select({ id: procurementCommitments.id, contractId: procurementCommitments.contractId, status: procurementCommitments.status, appropriation: { budgetUnitId: procurementAppropriations.budgetUnitId } }).from(procurementCommitments).innerJoin(procurementAppropriations, eq(procurementAppropriations.id, procurementCommitments.appropriationId)).where(eq(procurementCommitments.id, requiredText(commitmentId, "Empenho"))).limit(1);
  if (!commitment?.contractId) throw new ProcurementFinanceBridgeError("O empenho não possui contrato de origem para anulação pelo bridge.");
  if (actor.allowedBudgetUnitIds && !actor.allowedBudgetUnitIds.includes(commitment.appropriation.budgetUnitId)) throw new ProcurementFinanceBridgeError("Operação financeira fora das unidades autorizadas.");
  await tx.execute(sql`SELECT id FROM "Contract" WHERE id = ${commitment.contractId} FOR UPDATE`);
  await cancelSupplyAuthorizationForContractInTransaction(tx, actor, commitment.contractId);
  const cancelled = commitment.status === "Anulado"
    ? commitment
    : await cancelCommitmentInTransaction(tx, actor, commitment.id);
  const event = await ensureLifecycleEvent(tx, eventInput(
    procurementFinanceEventTypes.commitmentCancelled,
    "COMMITMENT",
    cancelled.id,
    { sourceType: "CONTRACT", sourceId: commitment.contractId },
    actor,
    eventKey("COMMITMENT_CANCEL", "CONTRACT", commitment.contractId, cancelled.id),
  ));
  return { commitment: cancelled, eventId: event.id };
  }, { timeoutMs: 60000 });
}

async function cancelSettlementForSource(
  db: DatabaseTransaction,
  actor: FinanceActor,
  settlementId: string,
  source: InstrumentSource,
  sourceEntityId: string,
) {
  const [row] = await db.select({ settlement: { id: procurementSettlements.id, status: procurementSettlements.status }, commitment: { contractId: procurementCommitments.contractId, covenantId: procurementCommitments.covenantId }, budgetUnitId: procurementAppropriations.budgetUnitId }).from(procurementSettlements).innerJoin(procurementCommitments, eq(procurementCommitments.id, procurementSettlements.commitmentId)).innerJoin(procurementAppropriations, eq(procurementAppropriations.id, procurementCommitments.appropriationId)).where(eq(procurementSettlements.id, requiredText(settlementId, "Liquidação"))).limit(1);
  const settlement = row ? { ...row.settlement, commitment: { ...row.commitment, appropriation: { budgetUnitId: row.budgetUnitId } } } : null;
  if (!settlement) throw new ProcurementFinanceBridgeError("Liquidação não encontrada.");
  assertCommitmentSource(settlement.commitment, source);
  if (actor.allowedBudgetUnitIds && !actor.allowedBudgetUnitIds.includes(settlement.commitment.appropriation.budgetUnitId)) throw new ProcurementFinanceBridgeError("Operação financeira fora das unidades autorizadas.");
  const [origin] = await db.select().from(procurementLifecycleEvents).where(eq(procurementLifecycleEvents.idempotencyKey, eventKey("SETTLEMENT", source.sourceType, sourceEntityId, settlement.id))).limit(1);
  if (!origin || origin.eventType !== procurementFinanceEventTypes.settlementCreated || origin.entityType !== "SETTLEMENT" || origin.entityId !== settlement.id || origin.sourceType !== source.sourceType || origin.sourceId !== source.sourceId) throw new ProcurementFinanceBridgeError("Liquidação sem vínculo conciliado com este recebimento/medição.");
  const cancelled = settlement.status === "Cancelado"
    ? settlement
    : await cancelSettlementInTransaction(db, actor, settlement.id);
  const event = await ensureLifecycleEvent(db, eventInput(
    procurementFinanceEventTypes.settlementCancelled,
    "SETTLEMENT",
    cancelled.id,
    source,
    actor,
    eventKey("SETTLEMENT_CANCEL", source.sourceType, sourceEntityId, cancelled.id),
  ));
  return { settlement: cancelled, eventId: event.id };
}

export async function cancelSettlementAfterPurchaseReceiptCancellation(
  db: Db,
  actor: FinanceActor,
  input: { purchaseReceiptId: string; settlementId: string },
) {
  return withDatabaseTransaction(db, async (tx) => {
  const db = tx;
  const [settlement] = await db.select({ commitmentId: procurementSettlements.commitmentId }).from(procurementSettlements).where(eq(procurementSettlements.id, input.settlementId)).limit(1);
  if (!settlement) throw new ProcurementFinanceBridgeError("Liquidação não encontrada.");
   await lockAuthorizationCommitment(db, settlement.commitmentId);
  await db.execute(sql`SELECT id FROM "PurchaseReceipt" WHERE id = ${input.purchaseReceiptId} FOR UPDATE`);
  const [receipt] = await db.select({ id: purchaseReceipts.id, contractId: purchaseReceipts.contractId }).from(purchaseReceipts).where(eq(purchaseReceipts.id, requiredText(input.purchaseReceiptId, "Recebimento"))).limit(1);
  if (!receipt) throw new ProcurementFinanceBridgeError("Recebimento não encontrado.");
  const cancellation = await cancelPurchaseReceiptLiquidationAuthorization(db, actor, receipt.id);
  if (!cancellation) throw new ProcurementFinanceBridgeError("Não existe AL de recebimento para anular.");
  return cancelSettlementForSource(db, actor, input.settlementId, { sourceType: "CONTRACT", sourceId: receipt.contractId }, receipt.id);
  }, { timeoutMs: 60000 });
}

export async function cancelSettlementAfterInstrumentMeasurementCancellation(
  db: Db,
  actor: FinanceActor,
  input: { measurementId: string; settlementId: string },
) {
  return withDatabaseTransaction(db, async (tx) => {
  const db = tx;
  const [settlement] = await db.select({ commitmentId: procurementSettlements.commitmentId }).from(procurementSettlements).where(eq(procurementSettlements.id, input.settlementId)).limit(1);
  if (!settlement) throw new ProcurementFinanceBridgeError("Liquidação não encontrada.");
   await lockAuthorizationCommitment(db, settlement.commitmentId);
  await db.execute(sql`SELECT id FROM "InstrumentMeasurement" WHERE id = ${input.measurementId} FOR UPDATE`);
  const [measurement] = await db.select().from(instrumentMeasurements).where(eq(instrumentMeasurements.id, requiredText(input.measurementId, "Medição"))).limit(1);
  if (!measurement) throw new ProcurementFinanceBridgeError("Medição não encontrada.");
  const cancellation = await cancelInstrumentMeasurementLiquidationAuthorization(db, actor, measurement.id);
  if (!cancellation) throw new ProcurementFinanceBridgeError("Não existe AL de medição para anular.");
  return cancelSettlementForSource(db, actor, input.settlementId, sourceForMeasurement(measurement), measurement.id);
  }, { timeoutMs: 60000 });
}
