import { Prisma } from "@prisma/client";
import { currentPresentationEntries } from "../planejamento/catalog-presentation";

type Origin = { sourceModule?: string; sourceType?: string; sourceId?: string; date: Date; governmentEntityId: string; budgetUnitId: string };
const appropriationSelection = { id: true, resourceSourceId: true, expenseNatureId: true, budgetUnitId: true, financialYear: { select: { governmentEntityId: true } }, programPPA: { select: { id: true, code: true } }, actionPPA: { select: { id: true, code: true } }, planningLine: { select: { id: true, functionCode: true, subfunctionCode: true } } } satisfies Prisma.BudgetAppropriationSelect;
type BudgetDimensionsOrigin = Prisma.BudgetAppropriationGetPayload<{ select: typeof appropriationSelection }>;
const planningLineSelection = { id: true, resourceSourceId: true, budgetUnitId: true, revenueNatureId: true, expenseNatureId: true, functionCode: true, subfunctionCode: true, classificationSnapshot: true, instrument: { select: { governmentEntityId: true } }, program: { select: { id: true, code: true } }, action: { select: { id: true, code: true } } } satisfies Prisma.PlanningBudgetLineSelect;

/** Source dimensions come from canonical operations, never from account prefixes or user names. */
export async function resolveAccountingSourceDimensions(tx: Prisma.TransactionClient, origin: Origin) {
  const type = origin.sourceType ?? "";
  const id = origin.sourceId;
  let resourceSourceId: string | null = null;
  let appropriation: BudgetDimensionsOrigin | null = null;
  let revenueNatureId: string | null = null;
  let planningLine: Prisma.PlanningBudgetLineGetPayload<{ select: typeof planningLineSelection }> | null = null;
  if (id) {
    if (type === "BUDGET_APPROPRIATION_OPENING") appropriation = await tx.budgetAppropriation.findUnique({ where: { id }, select: appropriationSelection });
    else if (["COMMITMENT", "COMMITMENT_REVERSAL"].includes(type)) appropriation = (await tx.commitment.findUnique({ where: { id }, select: { appropriation: { select: appropriationSelection } } }))?.appropriation ?? null;
    else if (type === "COMMITMENT_MOVEMENT") appropriation = (await tx.commitmentMovement.findUnique({ where: { id }, select: { commitment: { select: { appropriation: { select: appropriationSelection } } } } }))?.commitment.appropriation ?? null;
    else if (type === "SETTLEMENT") appropriation = (await tx.settlement.findUnique({ where: { id }, select: { commitment: { select: { appropriation: { select: appropriationSelection } } } } }))?.commitment.appropriation ?? null;
    else if (type === "PAYMENT") appropriation = (await tx.payment.findUnique({ where: { id }, select: { commitment: { select: { appropriation: { select: appropriationSelection } } } } }))?.commitment.appropriation ?? null;
    else if (type === "WITHHOLDING_PAYABLE") appropriation = (await tx.withholdingPayable.findUnique({ where: { id }, select: { retention: { select: { payment: { select: { commitment: { select: { appropriation: { select: appropriationSelection } } } } } } } } }))?.retention.payment.commitment.appropriation ?? null;
    else if (type === "STOCK_CONSUMPTION" && origin.sourceModule === "PATRIMONIO") {
      let movementId: string | null = id;
      const visited = new Set<string>();
      while (movementId) {
        if (visited.has(movementId)) throw new Error("Ciclo documental na origem do consumo de estoque.");
        visited.add(movementId);
        const movement: Prisma.MaterialMovementGetPayload<{ select: { settlementId: true; returnedMovementId: true; reversedMovementId: true } }> = await tx.materialMovement.findUniqueOrThrow({ where: { id: movementId }, select: { settlementId: true, returnedMovementId: true, reversedMovementId: true } });
        if (movement.settlementId) {
          const settlement = await tx.settlement.findUniqueOrThrow({ where: { id: movement.settlementId }, select: { commitment: { select: { appropriation: { select: appropriationSelection } } } } });
          appropriation = settlement.commitment.appropriation;
          if (appropriation.budgetUnitId !== origin.budgetUnitId || appropriation.financialYear.governmentEntityId !== origin.governmentEntityId) throw new Error("Consumo e classificação de fonte devem pertencer ao mesmo ente/UG da aquisição.");
          resourceSourceId = appropriation.resourceSourceId;
          break;
        }
        movementId = movement.returnedMovementId ?? movement.reversedMovementId;
      }
    }
    else if (["BANK_ACCOUNT", "BANK_ACCOUNT_OPENING_BALANCE"].includes(type)) resourceSourceId = (await tx.bankAccount.findUnique({ where: { id }, select: { resourceSourceId: true } }))?.resourceSourceId ?? null;
    else if (["TREASURY_TRANSFER", "BANK_STATEMENT_INVESTMENT_TRANSFER"].includes(type)) {
      const transfers = await tx.treasuryTransfer.findMany({ where: { OR: [{ id }, { sourceMovement: { sourceId: id, sourceType: type } }] }, select: { sourceMovement: { select: { resourceSourceId: true } } }, take: 2 });
      if (transfers.length === 1) resourceSourceId = transfers[0].sourceMovement.resourceSourceId;
    }
    else if (type === "BANK_STATEMENT_CLASSIFICATION") resourceSourceId = (await tx.bankStatementItem.findUnique({ where: { id }, select: { bankAccount: { select: { resourceSourceId: true } } } }))?.bankAccount?.resourceSourceId ?? null;
    else if (["TAX_CREDIT", "TAX_REFUND", "TAX_CREDIT_REVERSAL", "TAX_REFUND_REVERSAL"].includes(type)) {
      const registry = await tx.taxRegistryEntry.findUnique({ where: { id }, select: { data: true } });
      const data = registry?.data && typeof registry.data === "object" && !Array.isArray(registry.data) ? registry.data as Prisma.JsonObject : null;
      if (typeof data?.resourceSourceId === "string") resourceSourceId = data.resourceSourceId;
      else if (typeof data?.sourceCreditId === "string") {
        const credit = await tx.taxRegistryEntry.findUniqueOrThrow({ where: { id: data.sourceCreditId }, select: { data: true } });
        const creditData = credit.data && typeof credit.data === "object" && !Array.isArray(credit.data) ? credit.data as Prisma.JsonObject : null;
        if (typeof creditData?.resourceSourceId === "string") resourceSourceId = creditData.resourceSourceId;
      }
    }
    else if (type === "PLANNING_BUDGET") {
      const movement = await tx.planningLineMovement.findUnique({ where: { id }, select: { line: { select: planningLineSelection } } });
      planningLine = movement?.line ?? await tx.planningBudgetLine.findUnique({ where: { id }, select: planningLineSelection });
      if (planningLine && (planningLine.budgetUnitId !== origin.budgetUnitId || planningLine.instrument.governmentEntityId !== origin.governmentEntityId)) throw new Error("Linha de Planejamento diverge do ente/UG contábil.");
      resourceSourceId = planningLine?.resourceSourceId ?? null;
    } else if (type === "REVENUE_REVERSAL") {
      const reversal = await tx.revenueReversal.findUnique({ where: { id }, select: { revenue: { select: { resourceSourceId: true, revenueNatureId: true } } } });
      resourceSourceId = reversal?.revenue.resourceSourceId ?? null;
      revenueNatureId = reversal?.revenue.revenueNatureId ?? null;
    }
    else if (type === "REVENUE_RESOURCE_REDISTRIBUTION") {
      // This event has two different sources. A single source would falsify its analytical dimensions.
      return { governmentEntityId: origin.governmentEntityId, budgetUnitId: origin.budgetUnitId, resourceSourceId: null, sourceResolution: "MULTIPLE_SOURCES_REQUIRE_LINE_MAPPING" } satisfies Prisma.InputJsonObject;
    } else {
      // Financial revenue postings use Revenue.id; their integration sourceId belongs to the sector.
      const canonicalRevenue = await tx.revenue.findFirst({ where: { id, sourceModule: origin.sourceModule ?? "MANUAL", sourceType: type, budgetUnitId: origin.budgetUnitId, financialYear: { governmentEntityId: origin.governmentEntityId } }, select: { resourceSourceId: true, revenueNatureId: true } });
      const revenues = canonicalRevenue ? [canonicalRevenue] : await tx.revenue.findMany({ where: { sourceModule: origin.sourceModule ?? "MANUAL", sourceType: type, sourceId: id, budgetUnitId: origin.budgetUnitId, financialYear: { governmentEntityId: origin.governmentEntityId } }, select: { resourceSourceId: true, revenueNatureId: true }, take: 2 });
      if (revenues.length === 1) { resourceSourceId = revenues[0].resourceSourceId; revenueNatureId = revenues[0].revenueNatureId; }
    }
  }
  if (appropriation) {
    if (appropriation.budgetUnitId !== origin.budgetUnitId || appropriation.financialYear.governmentEntityId !== origin.governmentEntityId) throw new Error("Dimensões orçamentárias divergem do ente/UG da origem.");
    resourceSourceId = appropriation.resourceSourceId;
  }
  const budgetDimensions: Prisma.InputJsonObject | null = appropriation ? {
    appropriationId: appropriation.id, expenseNatureId: appropriation.expenseNatureId,
    expenseClassification: await resolveDimensionClassification(tx, origin, "EXPENSE", appropriation.expenseNatureId),
    program: appropriation.programPPA, action: appropriation.actionPPA,
    planningLineId: appropriation.planningLine?.id ?? null,
    functionCode: appropriation.planningLine?.functionCode ?? null, subfunctionCode: appropriation.planningLine?.subfunctionCode ?? null,
  } : planningLine ? {
    planningLineId: planningLine.id, expenseNatureId: planningLine.expenseNatureId, revenueNatureId: planningLine.revenueNatureId,
    expenseClassification: planningLine.expenseNatureId ? await resolveDimensionClassification(tx, origin, "EXPENSE", planningLine.expenseNatureId) : null,
    revenueClassification: planningLine.revenueNatureId ? await resolveDimensionClassification(tx, origin, "REVENUE", planningLine.revenueNatureId) : null,
    program: planningLine.program, action: planningLine.action, functionCode: planningLine.functionCode, subfunctionCode: planningLine.subfunctionCode,
    planningClassificationSnapshot: planningLine.classificationSnapshot as Prisma.InputJsonValue | null,
  } : revenueNatureId ? { revenueNatureId, revenueClassification: await resolveDimensionClassification(tx, origin, "REVENUE", revenueNatureId) } : null;
  return { ...await classifiedSourceDimensions(tx, origin, resourceSourceId), budgetDimensions };
}

async function classifiedSourceDimensions(tx: Prisma.TransactionClient, origin: Origin, resourceSourceId: string | null) {
  const sourceClassification = resourceSourceId ? await resolveDimensionClassification(tx, origin, "SOURCE", resourceSourceId) : null;
  return { governmentEntityId: origin.governmentEntityId, budgetUnitId: origin.budgetUnitId, resourceSourceId, sourceResolution: resourceSourceId ? "CANONICAL_ORIGIN" : "NOT_RECONCILED", sourceClassification, mscReadiness: sourceClassification ? "CLASSIFIED_SOURCE_LAYOUT_PENDING" : "NOT_RECONCILED" } satisfies Prisma.InputJsonObject;
}

async function resolveDimensionClassification(tx: Prisma.TransactionClient, origin: Origin, kind: "SOURCE" | "REVENUE" | "EXPENSE", canonicalId: string): Promise<Prisma.InputJsonObject | null> {
  const day = origin.date.toISOString().slice(0, 10);
  const bindings = await tx.planningCatalogEntry.findMany({ where: { kind, canonicalId, version: { status: "PUBLISHED", year: origin.date.getUTCFullYear() } }, include: { version: { select: { year: true, sourceHash: true, normativeReference: true } } } });
  const current = currentPresentationEntries(bindings.filter(entry => {
    const attrs = entry.attributes as Prisma.JsonObject;
    return attrs && typeof attrs.effectiveFrom === "string" && typeof attrs.effectiveUntil === "string"
      && attrs.effectiveFrom <= day && attrs.effectiveUntil >= day
      && (!attrs.governmentEntityId || attrs.governmentEntityId === origin.governmentEntityId)
      && (!attrs.budgetUnitId || attrs.budgetUnitId === origin.budgetUnitId);
  }), day);
  const replaced = new Set(current.flatMap(entry => {
    const attrs = entry.attributes as Prisma.JsonObject;
    return attrs.operational === true && attrs.pocOnly === false && typeof attrs.predecessorEntryId === "string" ? [attrs.predecessorEntryId] : [];
  }));
  const applicable = current.filter(entry => !replaced.has(entry.id));
  if (applicable.length > 1) throw new Error(`Dimensão ${kind} com classificações publicadas sobrepostas; concilie antes da postagem.`);
  if (applicable.length === 1) {
    const entry = applicable[0];
    const attrs = entry.attributes as Prisma.JsonObject;
    if (attrs.pocOnly === true && process.env.CELERIFLOW_ACCOUNTING_MODE !== "POC") throw new Error("Classificação de ensaio não pode classificar uma partida municipal.");
    return { entryId: entry.id, versionId: entry.versionId, canonicalId, externalCode: entry.code, sourceHash: entry.version.sourceHash, normativeReference: entry.version.normativeReference, attributes: attrs as Prisma.InputJsonObject };
  }
  return null;
}

/** A redistribution assigns the original and destination source to different posting lines. */
export async function resolveAccountingLineSourceDimensions(tx: Prisma.TransactionClient, origin: Origin, lineType: "Débito" | "Crédito", classification: Prisma.InputJsonObject) {
  if (origin.sourceType !== "REVENUE_RESOURCE_REDISTRIBUTION" || !origin.sourceId) return resolveAccountingSourceDimensions(tx, origin);
  const attributes = classification.attributes as Prisma.InputJsonObject | undefined;
  const debitSource = attributes?.redistributionDebitSource;
  if (debitSource !== "ORIGIN" && debitSource !== "DESTINATION") throw new Error("Redistribuição exige configuração publicada da fonte da linha de débito; a linha de crédito recebe a contraparte.");
  const redistribution = await tx.revenueResourceRedistribution.findUniqueOrThrow({ where: { id: origin.sourceId }, include: { revenue: { select: { budgetUnitId: true, financialYear: { select: { governmentEntityId: true } } } } } });
  if (redistribution.revenue.budgetUnitId !== origin.budgetUnitId || redistribution.revenue.financialYear?.governmentEntityId !== origin.governmentEntityId) throw new Error("Dimensão de fonte diverge do ente/UG da redistribuição.");
  const isOrigin = lineType === "Débito" ? debitSource === "ORIGIN" : debitSource !== "ORIGIN";
  const sourceId = isOrigin ? redistribution.sourceResourceSourceId : redistribution.destinationResourceSourceId;
  return { ...await classifiedSourceDimensions(tx, origin, sourceId), redistributionId: redistribution.id, sourceRole: isOrigin ? "ORIGIN" : "DESTINATION" } satisfies Prisma.InputJsonObject;
}

/** Reversal follows the frozen source of its own original line, including a two-source posting. */
export async function resolveAccountingReversalLineDimensions(tx: Prisma.TransactionClient, origin: Origin, reversalOfId: string, accountId: string, lineType: "Débito" | "Crédito", originalEntryId?: string) {
  const original = await tx.accountingTransaction.findUniqueOrThrow({ where: { id: reversalOfId }, select: { governmentEntityId: true, budgetUnitId: true } });
  if (original.governmentEntityId !== origin.governmentEntityId || original.budgetUnitId !== origin.budgetUnitId) throw new Error("Estorno e partida original devem preservar ente/UG.");
  const entries = await tx.accountingEntry.findMany({ where: { transactionId: reversalOfId, accountId, type: lineType === "Débito" ? "Crédito" : "Débito", ...(originalEntryId ? { id: originalEntryId } : {}) }, select: { id: true, classificationSnapshot: true } });
  if (!entries.length) throw new Error("Linha de estorno não possui contraparte na partida original.");
  const memories = entries.map(entry => {
    const snapshot = entry.classificationSnapshot as Prisma.JsonObject | null;
    const dimensions = snapshot?.dimensions as Prisma.JsonObject | null;
    return { entry, dimensions, resourceSourceId: typeof dimensions?.resourceSourceId === "string" ? dimensions.resourceSourceId : null };
  });
  if (new Set(memories.map(memory => JSON.stringify([memory.resourceSourceId, memory.dimensions?.sourceRole ?? null, memory.dimensions?.sourceClassification ?? null, memory.dimensions?.budgetDimensions ?? null]))).size > 1) throw new Error("Estorno possui múltiplas fontes/classificações na mesma conta; exige identificação documental de cada linha original.");
  const memory = memories[0];
  return {
    governmentEntityId: origin.governmentEntityId,
    budgetUnitId: origin.budgetUnitId,
    resourceSourceId: memory.resourceSourceId,
    sourceResolution: memory.resourceSourceId ? "ORIGINAL_LINE" : "NOT_RECONCILED",
    sourceClassification: memory.dimensions?.sourceClassification as Prisma.InputJsonValue | null ?? null,
    mscReadiness: memory.dimensions?.mscReadiness as Prisma.InputJsonValue | null ?? "NOT_RECONCILED",
    originalTransactionId: reversalOfId,
    originalEntryIds: entries.map(entry => entry.id),
    sourceRole: memory.dimensions?.sourceRole ?? null,
    originalClassificationSnapshots: memories.map(row => row.entry.classificationSnapshot as Prisma.InputJsonValue | null),
    budgetDimensions: memory.dimensions?.budgetDimensions as Prisma.InputJsonValue | null ?? null,
  } satisfies Prisma.InputJsonObject;
}
