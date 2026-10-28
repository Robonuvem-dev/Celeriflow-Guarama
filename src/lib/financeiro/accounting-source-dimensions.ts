import type { DatabaseExecutor } from "@/db/transaction";
import type { JsonObject } from "@/db/json";
import { listAccountingClassifications, findAccountingTransaction, listAccountingEntries } from "@/db/repositories/finance/accounting";
import { readAppropriationDimensions, readPlanningLineDimensions, readAccountingStockOrigin, findAccountingBankSource, findAccountingTransferSources, findAccountingTaxCreditData, findAccountingRevenueSources, readAccountingRedistribution, type AppropriationDimensions, type PlanningLineDimensions } from "@/db/repositories/finance/accounting-origins";
import { currentPresentationEntries } from "../planejamento/catalog-presentation";

type Origin = { sourceModule?: string; sourceType?: string; sourceId?: string; date: Date; governmentEntityId: string; budgetUnitId: string };

/** Source dimensions come from canonical operations, never from account prefixes or user names. */
export async function resolveAccountingSourceDimensions(tx: DatabaseExecutor, origin: Origin): Promise<JsonObject> {
  const type = origin.sourceType ?? "";
  const id = origin.sourceId;
  let resourceSourceId: string | null = null;
  let appropriation: AppropriationDimensions | null = null;
  let revenueNatureId: string | null = null;
  let planningLine: PlanningLineDimensions | null = null;
  if (id) {
    if (["BUDGET_APPROPRIATION_OPENING", "COMMITMENT", "COMMITMENT_REVERSAL", "COMMITMENT_MOVEMENT", "SETTLEMENT", "PAYMENT", "WITHHOLDING_PAYABLE"].includes(type)) appropriation = await readAppropriationDimensions(tx, type, id);
    else if (type === "STOCK_CONSUMPTION" && origin.sourceModule === "PATRIMONIO") {
      let movementId: string | null = id;
      const visited = new Set<string>();
      while (movementId) {
        if (visited.has(movementId)) throw new Error("Ciclo documental na origem do consumo de estoque.");
        visited.add(movementId);
        const movement = await readAccountingStockOrigin(tx, movementId);
        if (movement.settlementId) {
          appropriation = await readAppropriationDimensions(tx, "SETTLEMENT", movement.settlementId);
          if (!appropriation) throw new Error("Liquidação de origem do consumo não encontrada.");
          if (appropriation.budgetUnitId !== origin.budgetUnitId || appropriation.financialYear.governmentEntityId !== origin.governmentEntityId) throw new Error("Consumo e classificação de fonte devem pertencer ao mesmo ente/UG da aquisição.");
          resourceSourceId = appropriation.resourceSourceId;
          break;
        }
        movementId = movement.returnedMovementId ?? movement.reversedMovementId;
      }
    }
    else if (["BANK_ACCOUNT", "BANK_ACCOUNT_OPENING_BALANCE"].includes(type)) resourceSourceId = await findAccountingBankSource(tx, type, id);
    else if (["TREASURY_TRANSFER", "BANK_STATEMENT_INVESTMENT_TRANSFER"].includes(type)) {
      const transfers = await findAccountingTransferSources(tx, type, id);
      if (transfers.length === 1) resourceSourceId = transfers[0].resourceSourceId;
    }
    else if (type === "BANK_STATEMENT_CLASSIFICATION") resourceSourceId = await findAccountingBankSource(tx, type, id);
    else if (["TAX_CREDIT", "TAX_REFUND", "TAX_CREDIT_REVERSAL", "TAX_REFUND_REVERSAL"].includes(type)) {
      const registry = await findAccountingTaxCreditData(tx, id);
      const data = registry && typeof registry === "object" && !Array.isArray(registry) ? registry : null;
      if (typeof data?.resourceSourceId === "string") resourceSourceId = data.resourceSourceId;
      else if (typeof data?.sourceCreditId === "string") {
        const credit = await findAccountingTaxCreditData(tx, data.sourceCreditId);
        if (!credit) throw new Error("Crédito de origem não encontrado.");
        const creditData = typeof credit === "object" && !Array.isArray(credit) ? credit : null;
        if (typeof creditData?.resourceSourceId === "string") resourceSourceId = creditData.resourceSourceId;
      }
    }
    else if (type === "PLANNING_BUDGET") {
      planningLine = await readPlanningLineDimensions(tx, id);
      if (planningLine && (planningLine.budgetUnitId !== origin.budgetUnitId || planningLine.instrument.governmentEntityId !== origin.governmentEntityId)) throw new Error("Linha de Planejamento diverge do ente/UG contábil.");
      resourceSourceId = planningLine?.resourceSourceId ?? null;
    } else if (type === "REVENUE_REVERSAL") {
      const [reversal] = await findAccountingRevenueSources(tx, origin, true);
      resourceSourceId = reversal?.resourceSourceId ?? null;
      revenueNatureId = reversal?.revenueNatureId ?? null;
    }
    else if (type === "REVENUE_RESOURCE_REDISTRIBUTION") {
      // This event has two different sources. A single source would falsify its analytical dimensions.
      return { governmentEntityId: origin.governmentEntityId, budgetUnitId: origin.budgetUnitId, resourceSourceId: null, sourceResolution: "MULTIPLE_SOURCES_REQUIRE_LINE_MAPPING" };
    } else {
      // Financial revenue postings use Revenue.id; their integration sourceId belongs to the sector.
      const revenues = await findAccountingRevenueSources(tx, origin);
      if (revenues.length === 1) { resourceSourceId = revenues[0].resourceSourceId; revenueNatureId = revenues[0].revenueNatureId; }
    }
  }
  if (appropriation) {
    if (appropriation.budgetUnitId !== origin.budgetUnitId || appropriation.financialYear.governmentEntityId !== origin.governmentEntityId) throw new Error("Dimensões orçamentárias divergem do ente/UG da origem.");
    resourceSourceId = appropriation.resourceSourceId;
  }
  const budgetDimensions: JsonObject | null = appropriation ? {
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
    planningClassificationSnapshot: planningLine.classificationSnapshot,
  } : revenueNatureId ? { revenueNatureId, revenueClassification: await resolveDimensionClassification(tx, origin, "REVENUE", revenueNatureId) } : null;
  return { ...await classifiedSourceDimensions(tx, origin, resourceSourceId), budgetDimensions };
}

async function classifiedSourceDimensions(tx: DatabaseExecutor, origin: Origin, resourceSourceId: string | null) {
  const sourceClassification = resourceSourceId ? await resolveDimensionClassification(tx, origin, "SOURCE", resourceSourceId) : null;
  return { governmentEntityId: origin.governmentEntityId, budgetUnitId: origin.budgetUnitId, resourceSourceId, sourceResolution: resourceSourceId ? "CANONICAL_ORIGIN" : "NOT_RECONCILED", sourceClassification, mscReadiness: sourceClassification ? "CLASSIFIED_SOURCE_LAYOUT_PENDING" : "NOT_RECONCILED" };
}

async function resolveDimensionClassification(tx: DatabaseExecutor, origin: Origin, kind: "SOURCE" | "REVENUE" | "EXPENSE", canonicalId: string): Promise<JsonObject | null> {
  const day = origin.date.toISOString().slice(0, 10);
  const bindings = await listAccountingClassifications(tx, kind, [canonicalId], origin.date.getUTCFullYear());
  const current = currentPresentationEntries(bindings.filter(entry => {
    const attrs = entry.attributes as JsonObject;
    return attrs && typeof attrs.effectiveFrom === "string" && typeof attrs.effectiveUntil === "string"
      && attrs.effectiveFrom <= day && attrs.effectiveUntil >= day
      && (!attrs.governmentEntityId || attrs.governmentEntityId === origin.governmentEntityId)
      && (!attrs.budgetUnitId || attrs.budgetUnitId === origin.budgetUnitId);
  }), day);
  const replaced = new Set(current.flatMap(entry => {
    const attrs = entry.attributes as JsonObject;
    return attrs.operational === true && attrs.pocOnly === false && typeof attrs.predecessorEntryId === "string" ? [attrs.predecessorEntryId] : [];
  }));
  const applicable = current.filter(entry => !replaced.has(entry.id));
  if (applicable.length > 1) throw new Error(`Dimensão ${kind} com classificações publicadas sobrepostas; concilie antes da postagem.`);
  if (applicable.length === 1) {
    const entry = applicable[0];
    const attrs = entry.attributes as JsonObject;
    if (attrs.pocOnly === true && process.env.CELERIFLOW_ACCOUNTING_MODE !== "POC") throw new Error("Classificação de ensaio não pode classificar uma partida municipal.");
    return { entryId: entry.id, versionId: entry.versionId, canonicalId, externalCode: entry.code, sourceHash: entry.version.sourceHash, normativeReference: entry.version.normativeReference, attributes: attrs };
  }
  return null;
}

/** A redistribution assigns the original and destination source to different posting lines. */
export async function resolveAccountingLineSourceDimensions(tx: DatabaseExecutor, origin: Origin, lineType: "Débito" | "Crédito", classification: JsonObject): Promise<JsonObject> {
  if (origin.sourceType !== "REVENUE_RESOURCE_REDISTRIBUTION" || !origin.sourceId) return resolveAccountingSourceDimensions(tx, origin);
  const attributes = classification.attributes as JsonObject | undefined;
  const debitSource = attributes?.redistributionDebitSource;
  if (debitSource !== "ORIGIN" && debitSource !== "DESTINATION") throw new Error("Redistribuição exige configuração publicada da fonte da linha de débito; a linha de crédito recebe a contraparte.");
  const redistribution = await readAccountingRedistribution(tx, origin.sourceId);
  if (redistribution.budgetUnitId !== origin.budgetUnitId || redistribution.governmentEntityId !== origin.governmentEntityId) throw new Error("Dimensão de fonte diverge do ente/UG da redistribuição.");
  const isOrigin = lineType === "Débito" ? debitSource === "ORIGIN" : debitSource !== "ORIGIN";
  const sourceId = isOrigin ? redistribution.sourceResourceSourceId : redistribution.destinationResourceSourceId;
  return { ...await classifiedSourceDimensions(tx, origin, sourceId), redistributionId: redistribution.id, sourceRole: isOrigin ? "ORIGIN" : "DESTINATION" };
}

/** Reversal follows the frozen source of its own original line, including a two-source posting. */
export async function resolveAccountingReversalLineDimensions(tx: DatabaseExecutor, origin: Origin, reversalOfId: string, accountId: string, lineType: "Débito" | "Crédito", originalEntryId?: string): Promise<JsonObject> {
  const original = await findAccountingTransaction(tx, reversalOfId);
  if (!original) throw new Error("Transação original não encontrada.");
  if (original.governmentEntityId !== origin.governmentEntityId || original.budgetUnitId !== origin.budgetUnitId) throw new Error("Estorno e partida original devem preservar ente/UG.");
  const entries = await listAccountingEntries(tx, reversalOfId, { accountId, type: lineType === "Débito" ? "Crédito" : "Débito", entryId: originalEntryId });
  if (!entries.length) throw new Error("Linha de estorno não possui contraparte na partida original.");
  const memories = entries.map(entry => {
    const snapshot = entry.classificationSnapshot as JsonObject | null;
    const dimensions = snapshot?.dimensions as JsonObject | null;
    return { entry, dimensions, resourceSourceId: typeof dimensions?.resourceSourceId === "string" ? dimensions.resourceSourceId : null };
  });
  if (new Set(memories.map(memory => JSON.stringify([memory.resourceSourceId, memory.dimensions?.sourceRole ?? null, memory.dimensions?.sourceClassification ?? null, memory.dimensions?.budgetDimensions ?? null]))).size > 1) throw new Error("Estorno possui múltiplas fontes/classificações na mesma conta; exige identificação documental de cada linha original.");
  const memory = memories[0];
  return {
    governmentEntityId: origin.governmentEntityId,
    budgetUnitId: origin.budgetUnitId,
    resourceSourceId: memory.resourceSourceId,
    sourceResolution: memory.resourceSourceId ? "ORIGINAL_LINE" : "NOT_RECONCILED",
    sourceClassification: memory.dimensions?.sourceClassification ?? null,
    mscReadiness: memory.dimensions?.mscReadiness ?? "NOT_RECONCILED",
    originalTransactionId: reversalOfId,
    originalEntryIds: entries.map(entry => entry.id),
    sourceRole: memory.dimensions?.sourceRole ?? null,
    originalClassificationSnapshots: memories.map(row => row.entry.classificationSnapshot),
    budgetDimensions: memory.dimensions?.budgetDimensions ?? null,
  };
}
