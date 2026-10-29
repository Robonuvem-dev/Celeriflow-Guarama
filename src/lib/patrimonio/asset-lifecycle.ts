import { and, asc, desc, eq, gt, lt, notInArray, sql } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseTransaction } from "@/db/transaction";
import { assets as assetTable, assetCategories, assetIntegrationPendingConfigurations, assetMaintenances, assetValueAdjustments, assetValueHistories, assetWriteOffs } from "@/db/schema/assets";
import { departments } from "@/db/schema/administration";
import { financialAuditLogs } from "@/db/schema/finance-identity";
import { FinanceError, postAccountingEventInTransaction, recordConfirmedRevenue, type FinanceActor } from "@/lib/financeiro";
import { resolveAssetValuationScope, assertAssetValuationOrigin, postAssetValuation, type AssetValuationContext } from "./valuation-accounting";
import { recordMunicipalCostSource } from "@/lib/financeiro/cost-ledger";

export class AssetLifecycleError extends Error {}

const activeDepreciation = sql`NOT EXISTS (SELECT 1 FROM "AccountingTransaction" r WHERE r."reversalOfId"=${assetValueHistories.accountingTransactionId})`;
const activeAdjustment = sql`NOT EXISTS (SELECT 1 FROM "AccountingTransaction" r WHERE r."reversalOfId"=${assetValueAdjustments.accountingTransactionId})`;

export type DepreciationInput = {
  acquisitionValue: number;
  bookValue: number;
  lifeSpanMonths: number;
  periodNumber: number;
};

export type AssetDisposalInput = {
  assetId: string;
  date: Date;
  type: "Baixa" | "Alienação";
  reason: string;
  justification: string;
  disposalValue?: number;
  actor?: FinanceActor;
  financial?: { budgetUnitId: string; bankAccountId?: string; revenueNatureId?: string; resourceSourceId?: string };
};

export type AssetValueAdjustmentType = "REVALUATION" | "IMPAIRMENT" | "SUBSEQUENT_COST";

export type AssetValueAdjustmentInput = {
  assetId: string;
  date: Date;
  type: AssetValueAdjustmentType;
  value: number;
  justification: string;
  evidence: string;
  idempotencyKey?: string;
};

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function normalizeReferenceMonth(value: Date) {
  if (Number.isNaN(value.valueOf())) throw new AssetLifecycleError("Competência de depreciação inválida.");
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1, 12));
}

export function calculateStraightLineDepreciation(input: DepreciationInput) {
  if (!Number.isFinite(input.acquisitionValue) || input.acquisitionValue < 0) {
    throw new AssetLifecycleError("O valor de aquisição do bem é inválido.");
  }
  if (!Number.isFinite(input.bookValue) || input.bookValue < 0) {
    throw new AssetLifecycleError("O valor contábil do bem é inválido.");
  }
  if (!Number.isInteger(input.lifeSpanMonths) || input.lifeSpanMonths <= 0) {
    throw new AssetLifecycleError("A categoria do bem deve ter vida útil em meses maior que zero.");
  }
  if (input.periodNumber < 1 || input.periodNumber > input.lifeSpanMonths) return 0;

  const regularInstallment = roundCurrency(input.acquisitionValue / input.lifeSpanMonths);
  const finalInstallment = roundCurrency(input.acquisitionValue - regularInstallment * (input.lifeSpanMonths - 1));
  const scheduledAmount = input.periodNumber === input.lifeSpanMonths ? finalInstallment : regularInstallment;
  return roundCurrency(Math.min(input.bookValue, scheduledAmount));
}

export function calculateAssetDisposal(bookValue: number, disposalValue: number) {
  if (!Number.isFinite(bookValue) || bookValue < 0 || !Number.isFinite(disposalValue) || disposalValue < 0) {
    throw new AssetLifecycleError("Os valores da baixa patrimonial são inválidos.");
  }
  const normalizedBookValue = roundCurrency(bookValue);
  const normalizedDisposalValue = roundCurrency(disposalValue);
  return {
    bookValue: normalizedBookValue,
    disposalValue: normalizedDisposalValue,
    gainLoss: roundCurrency(normalizedDisposalValue - normalizedBookValue),
  };
}

export function calculateAssetValueAdjustment(bookValue: number, type: AssetValueAdjustmentType, value: number) {
  if (!Number.isFinite(bookValue) || bookValue < 0 || !Number.isFinite(value)) {
    throw new AssetLifecycleError("Os valores do ajuste patrimonial são inválidos.");
  }
  const openingValue = roundCurrency(bookValue);
  const normalizedValue = roundCurrency(value);
  if (type === "SUBSEQUENT_COST") {
    if (normalizedValue <= 0) throw new AssetLifecycleError("O custo subsequente deve ser maior que zero.");
    return { openingValue, adjustmentValue: normalizedValue, closingValue: roundCurrency(openingValue + normalizedValue) };
  }
  if (normalizedValue < 0) throw new AssetLifecycleError("O valor contábil ajustado deve ser maior ou igual a zero.");
  if (type === "IMPAIRMENT" && normalizedValue >= openingValue) {
    throw new AssetLifecycleError("A perda por impairment deve reduzir o valor contábil do bem.");
  }
  if (type === "REVALUATION" && normalizedValue === openingValue) {
    throw new AssetLifecycleError("A reavaliação deve alterar o valor contábil do bem.");
  }
  return {
    openingValue,
    adjustmentValue: roundCurrency(normalizedValue - openingValue),
    closingValue: normalizedValue,
  };
}

function depreciationPeriod(acquisitionDate: Date, referenceMonth: Date) {
  return (referenceMonth.getUTCFullYear() - acquisitionDate.getUTCFullYear()) * 12
    + referenceMonth.getUTCMonth() - acquisitionDate.getUTCMonth() + 1;
}

function depreciationPostingDate(referenceMonth: Date) {
  return new Date(Date.UTC(referenceMonth.getUTCFullYear(), referenceMonth.getUTCMonth() + 1, 0, 12));
}

export async function depreciateAssetsForMonth(db: DatabaseConnection, referenceDate: Date, accounting?: AssetValuationContext) {
  if (!accounting) throw new AssetLifecycleError("Selecione a UG e o responsável pela depreciação.");
  const referenceMonth = normalizeReferenceMonth(referenceDate);
  const postingDate = depreciationPostingDate(referenceMonth);
  return withDatabaseTransaction(db, async tx => {
  const scope = await resolveAssetValuationScope(tx, accounting, postingDate);
   await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`ASSET_DEPRECIATION:${accounting.budgetUnitId}`}, 0))::text`);
   const assets = await tx.select({ id: assetTable.id }).from(assetTable).innerJoin(departments, eq(departments.id, assetTable.departmentId)).where(and(
     notInArray(assetTable.status, ["Baixado", "Inativo"]), eq(departments.secretariatId, scope.unit.secretariatId),
      sql`(${assetTable.budgetUnitId}=${accounting.budgetUnitId} OR (${assetTable.budgetUnitId} IS NULL AND (${assetTable.purchaseReceiptItemId} IS NULL OR EXISTS (SELECT 1 FROM "PurchaseReceiptItem" i JOIN "PurchaseReceipt" r ON r.id=i."purchaseReceiptId" JOIN "Commitment" c ON c."purchaseReceiptId"=r.id JOIN "BudgetAppropriation" b ON b.id=c."appropriationId" WHERE i.id=${assetTable.purchaseReceiptItemId} AND b."budgetUnitId"=${accounting.budgetUnitId}))))`,
   )).orderBy(asc(assetTable.id));
  let processed = 0;
  let skipped = 0;
  for (const asset of assets) {
    const created = await (async () => {
         await tx.execute(sql`SELECT id FROM "Asset" WHERE id = ${asset.id} FOR UPDATE`);
        await assertAssetValuationOrigin(tx, asset.id, accounting, scope.unit.secretariatId!);
         const [existing] = await tx.select({ id: assetValueHistories.id, reversed: sql<boolean>`EXISTS (SELECT 1 FROM "AccountingTransaction" r WHERE r."reversalOfId"=${assetValueHistories.accountingTransactionId})` }).from(assetValueHistories).where(and(eq(assetValueHistories.assetId, asset.id), eq(assetValueHistories.referenceMonth, referenceMonth))).limit(1);
         if (existing?.reversed) throw new AssetLifecycleError("Competência estornada preservada no histórico; registre correção fundamentada em vez de reprocessar o mesmo fato.");
        if (existing) return false;

         const [futureHistory] = await tx.select({ id: assetValueHistories.id }).from(assetValueHistories).where(and(eq(assetValueHistories.assetId, asset.id), gt(assetValueHistories.referenceMonth, referenceMonth), activeDepreciation)).limit(1);
        if (futureHistory) throw new AssetLifecycleError("Há competência posterior processada; concilie a sequência patrimonial.");
         const [previousHistory] = await tx.select({ referenceMonth: assetValueHistories.referenceMonth }).from(assetValueHistories).where(and(eq(assetValueHistories.assetId, asset.id), lt(assetValueHistories.referenceMonth, referenceMonth), activeDepreciation)).orderBy(desc(assetValueHistories.referenceMonth)).limit(1);
        if (previousHistory && depreciationPeriod(previousHistory.referenceMonth, referenceMonth) !== 2) throw new AssetLifecycleError("Processe as competências patrimoniais intermediárias antes deste mês.");
         if ((await tx.select({ id: assetValueAdjustments.id }).from(assetValueAdjustments).where(and(eq(assetValueAdjustments.assetId, asset.id), gt(assetValueAdjustments.date, postingDate), activeAdjustment)).limit(1)).length) throw new AssetLifecycleError("A competência antecede ajuste patrimonial já registrado; concilie a sequência antes da depreciação.");

         const [currentAsset] = await tx.select({ currentValue: assetTable.currentValue, currentValueDecimal: assetTable.currentValueDecimal, status: assetTable.status, acquisitionDate: assetTable.acquisitionDate, categoryId: assetTable.categoryId, category: { lifeSpan: assetCategories.lifeSpan, isActive: assetCategories.isActive } }).from(assetTable).innerJoin(assetCategories, eq(assetCategories.id, assetTable.categoryId)).where(eq(assetTable.id, asset.id)).limit(1);
         if (!currentAsset) throw new AssetLifecycleError("Bem patrimonial não encontrado.");
        if (currentAsset.status === "Baixado" || currentAsset.status === "Inativo") return false;
        if (currentAsset.acquisitionDate > postingDate) return false;

        // Recalculate over the remaining useful life so capitalized costs and
        // valuation changes are amortized prospectively, not retroactively.
        const currentPeriod = depreciationPeriod(currentAsset.acquisitionDate, referenceMonth);
        if (!currentAsset.category.isActive || currentAsset.category.lifeSpan <= 0 || !Number.isFinite(currentAsset.currentValue) || currentAsset.currentValue < 0) throw new AssetLifecycleError("Categoria, vida útil ou valor patrimonial inválidos.");
        const remainingPeriods = currentAsset.category.lifeSpan - currentPeriod + 1;
         const opening = currentAsset.currentValueDecimal ?? new Decimal(String(currentAsset.currentValue)).toDecimalPlaces(2);
        const depreciation = remainingPeriods > 0 && currentPeriod > 0
           ? opening.div(remainingPeriods).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
           : new Decimal(0);
        if (depreciation.isZero()) return false;
        const actualDepreciation = Number(depreciation);
        const closing = opening.minus(depreciation);
        const closingValue = Number(closing);

         const [history] = await tx.insert(assetValueHistories).values({
            assetId: asset.id,
            referenceMonth,
            openingValue: currentAsset.currentValue,
            depreciation: actualDepreciation,
            closingValue,
            openingValueDecimal: opening,
            depreciationDecimal: depreciation,
            closingValueDecimal: closing,
            lifeSpanMonths: currentAsset.category.lifeSpan,
         }).returning();
        const transaction = await postAssetValuation(tx, accounting, { assetId: asset.id, date: postingDate, eventCode: `ASSET_DEPRECIATION:${currentAsset.categoryId}`, value: depreciation, key: `PATRIMONIO:DEPRECIATION:${asset.id}:${referenceMonth.toISOString()}`, history: `Depreciação patrimonial ${asset.id}` });
         await tx.update(assetValueHistories).set({ accountingTransactionId: transaction.id }).where(eq(assetValueHistories.id, history.id));
         await tx.update(assetTable).set({ currentValue: closingValue, currentValueDecimal: closing, budgetUnitId: accounting.budgetUnitId }).where(eq(assetTable.id, asset.id));
        await recordMunicipalCostSource(tx, accounting.actor, { financialYearId: scope.financialYearId, budgetUnitId: accounting.budgetUnitId, sourceType: "DEPRECIATION", sourceId: history.id, expenseDate: postingDate, amount: depreciation, dimensions: { assetId: asset.id, categoryId: currentAsset.categoryId }, evidence: { assetId: asset.id, historyId: history.id, accountingTransactionId: transaction.id, referenceMonth: referenceMonth.toISOString(), opening: opening.toFixed(2), closing: closing.toFixed(2) } });
         await tx.insert(financialAuditLogs).values({ action: "ASSET_DEPRECIATION", entityType: "AssetValueHistory", entityId: history.id, authorUsuarioId: accounting.actor.usuarioId, authorEmployeeId: accounting.actor.employeeId, financialYearId: scope.financialYearId, payload: { assetId: asset.id, budgetUnitId: accounting.budgetUnitId, accountingTransactionId: transaction.id, opening: opening.toFixed(2), depreciation: depreciation.toFixed(2), closing: closing.toFixed(2) } });
        return true;
      })();
    if (created) processed += 1;
    else skipped += 1;
  }
  return { referenceMonth, processed, skipped };
   }, { timeoutMs: 60000 });
}

export async function recordAssetValueAdjustment(db: DatabaseConnection, input: AssetValueAdjustmentInput, accounting?: AssetValuationContext) {
  if (!accounting || !input.idempotencyKey?.trim()) throw new AssetLifecycleError("Informe UG, responsável e chave do ajuste patrimonial.");
  if (!input.assetId.trim() || !input.justification.trim() || !input.evidence.trim()) {
    throw new AssetLifecycleError("Bem, justificativa e evidência são obrigatórios.");
  }
  if (!["REVALUATION", "IMPAIRMENT", "SUBSEQUENT_COST"].includes(input.type)) {
    throw new AssetLifecycleError("Tipo de ajuste patrimonial inválido.");
  }
  if (Number.isNaN(input.date.valueOf())) throw new AssetLifecycleError("Data do ajuste inválida.");

  return withDatabaseTransaction(db, async (tx) => {
    const scope = await resolveAssetValuationScope(tx, accounting, input.date);
    await tx.execute(sql`SELECT id FROM "Asset" WHERE id = ${input.assetId} FOR UPDATE`);
    await assertAssetValuationOrigin(tx, input.assetId, accounting, scope.unit.secretariatId!);
    const adjustmentId = `PATRIMONIO:ADJUSTMENT:${input.idempotencyKey!.trim()}`;
    const [prior] = await tx.select().from(assetValueAdjustments).where(eq(assetValueAdjustments.id, adjustmentId)).limit(1);
    if (prior) {
      const requested = input.type === "SUBSEQUENT_COST" ? prior.adjustmentValueDecimal ?? prior.adjustmentValue : prior.closingValueDecimal ?? prior.closingValue;
      if (prior.assetId !== input.assetId || prior.type !== input.type || prior.date.getTime() !== input.date.getTime() || !new Decimal(String(requested)).eq(String(roundCurrency(input.value))) || prior.justification !== input.justification.trim() || prior.evidence !== input.evidence.trim()) throw new AssetLifecycleError("Ajuste já registrado com outros dados.");
      const posting = (await tx.execute<{ sourceId: string | null; budgetUnitId: string | null }>(sql`SELECT "sourceId", "budgetUnitId" FROM "AccountingTransaction" WHERE "idempotencyKey"=${`${adjustmentId}:ACCOUNTING`}`)).rows[0];
      if (!posting || posting.sourceId !== input.assetId || posting.budgetUnitId !== accounting.budgetUnitId) throw new AssetLifecycleError("Ajuste anterior sem partida conciliada à origem e UG; regularize antes da repetição.");
      return prior;
    }
    const [asset] = await tx.select().from(assetTable).where(eq(assetTable.id, input.assetId)).limit(1);
    if (!asset) throw new AssetLifecycleError("Bem patrimonial não encontrado.");
    if (asset.status === "Baixado" || asset.status === "Inativo") throw new AssetLifecycleError("Não é possível ajustar um bem baixado ou inativo.");
    if (input.date < asset.acquisitionDate) throw new AssetLifecycleError("O ajuste não pode ser anterior à aquisição do bem.");
    const [latestDepreciation] = await tx.select({ referenceMonth: assetValueHistories.referenceMonth }).from(assetValueHistories).where(and(eq(assetValueHistories.assetId, asset.id), activeDepreciation)).orderBy(desc(assetValueHistories.referenceMonth)).limit(1);
    if (latestDepreciation && input.date <= depreciationPostingDate(latestDepreciation.referenceMonth)) {
      throw new AssetLifecycleError("O ajuste deve ser posterior à última competência de depreciação processada.");
    }

    const [latestAdjustment] = await tx.select({ date: assetValueAdjustments.date }).from(assetValueAdjustments).where(and(eq(assetValueAdjustments.assetId, asset.id), activeAdjustment)).orderBy(desc(assetValueAdjustments.date)).limit(1);
    if (latestAdjustment && input.date < latestAdjustment.date) throw new AssetLifecycleError("O ajuste não pode anteceder outro ajuste já registrado.");

    const opening = asset.currentValueDecimal ?? new Decimal(String(asset.currentValue)).toDecimalPlaces(2);
    const requestedValue = new Decimal(String(input.value)).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    calculateAssetValueAdjustment(Number(opening), input.type, Number(requestedValue));
    const closing = input.type === "SUBSEQUENT_COST" ? opening.plus(requestedValue) : requestedValue;
    const delta = closing.minus(opening);
    const calculation = { openingValue: Number(opening), adjustmentValue: Number(delta), closingValue: Number(closing) };
    const updated = await tx.update(assetTable).set({
        currentValue: calculation.closingValue,
        currentValueDecimal: closing,
        budgetUnitId: accounting.budgetUnitId,
        ...(input.type === "SUBSEQUENT_COST" ? { acquisitionValue: Number((asset.acquisitionValueDecimal ?? new Decimal(String(asset.acquisitionValue))).plus(delta)), acquisitionValueDecimal: (asset.acquisitionValueDecimal ?? new Decimal(String(asset.acquisitionValue))).plus(delta) } : {}),
    }).where(and(eq(assetTable.id, asset.id), eq(assetTable.currentValue, asset.currentValue), notInArray(assetTable.status, ["Baixado", "Inativo"]))).returning({ id: assetTable.id });
    if (updated.length !== 1) throw new AssetLifecycleError("O valor do bem foi alterado por outra operação. Revise e tente novamente.");
    const [adjustment] = await tx.insert(assetValueAdjustments).values({
        id: adjustmentId,
        assetId: asset.id,
        type: input.type,
        date: input.date,
        ...calculation,
        openingValueDecimal: opening,
        adjustmentValueDecimal: delta,
        closingValueDecimal: closing,
        justification: input.justification.trim(),
        evidence: input.evidence.trim(),
    }).returning();
    const eventCode = input.type === "REVALUATION" ? calculation.adjustmentValue > 0 ? "ASSET_REVALUATION_GAIN" : "ASSET_REVALUATION_LOSS" : input.type === "IMPAIRMENT" ? "ASSET_IMPAIRMENT" : "ASSET_SUBSEQUENT_COST";
    const transaction = await postAssetValuation(tx, accounting, { assetId: asset.id, date: input.date, eventCode: `${eventCode}:${asset.categoryId}`, value: delta.abs(), key: `${adjustmentId}:ACCOUNTING`, history: input.justification.trim() });
    const [recorded] = await tx.update(assetValueAdjustments).set({ accountingTransactionId: transaction.id }).where(eq(assetValueAdjustments.id, adjustment.id)).returning();
    await tx.insert(financialAuditLogs).values({ action: "ASSET_VALUE_ADJUSTMENT", entityType: "AssetValueAdjustment", entityId: adjustment.id, authorUsuarioId: accounting.actor.usuarioId, authorEmployeeId: accounting.actor.employeeId, financialYearId: scope.financialYearId, payload: { assetId: asset.id, budgetUnitId: accounting.budgetUnitId, accountingTransactionId: transaction.id, ...calculation } });
    return recorded;
  });
}

async function postDisposalGainLossOrRecordPending(
  tx: DatabaseTransaction,
  writeOff: { id: string; date: Date; gainLoss: number },
  actor?: FinanceActor,
  budgetUnitId?: string,
) {
  if (writeOff.gainLoss === 0) return { accountingTransactionId: null, pending: false };
  const eventCode = writeOff.gainLoss > 0 ? "ASSET_DISPOSAL_GAIN" : "ASSET_DISPOSAL_LOSS";
  const reason = !actor?.employeeId
    ? "A baixa não possui servidor responsável apto a postar o evento contábil."
    : undefined;
  const [year, event] = reason ? [null, null] : await Promise.all([
    budgetUnitId ? tx.execute<{ id: string }>(sql`SELECT y.id FROM "FinancialYear" y JOIN "PlanningEntityUnit" p ON p."governmentEntityId"=y."governmentEntityId" WHERE p."budgetUnitId"=${budgetUnitId} AND y.status='Aberto' AND y."startDate"<=${writeOff.date} AND y."endDate">=${writeOff.date} LIMIT 1`).then(result => result.rows[0] ?? null) : null,
    tx.execute<{ isActive: boolean; activeRules: number; isReference: boolean | null }>(sql`SELECT e."isActive", (SELECT count(*)::int FROM "AccountingPostingRule" r WHERE r."eventId"=e.id AND r."isActive"=true) AS "activeRules", (SELECT bool_or(r."isReference") FROM "AccountingPostingRule" r WHERE r."eventId"=e.id AND r."isActive"=true) AS "isReference" FROM "AccountingEventCatalog" e WHERE e.code=${eventCode}`).then(result => result.rows[0] ?? null),
  ]);
  const configurationReason = reason
    ?? (!year ? "Não há exercício financeiro aberto para a data da baixa."
      : !event?.isActive || event.activeRules !== 1 ? `O evento ${eventCode} deve possuir exatamente uma regra ativa.`
        : event.isReference && process.env.CELERIFLOW_ACCOUNTING_MODE !== "POC" ? "A regra do evento é apenas de referência e não está homologada para este ambiente."
          : undefined);
  if (configurationReason) {
    await tx.insert(assetIntegrationPendingConfigurations).values({ assetWriteOffId: writeOff.id, expectedEventCode: eventCode, reason: configurationReason });
    return { accountingTransactionId: null, pending: true };
  }

  try {
    const transaction = await postAccountingEventInTransaction(tx, actor!, {
      financialYearId: year!.id,
      budgetUnitId,
      date: writeOff.date,
      eventCode,
      value: Math.abs(writeOff.gainLoss),
      history: `Resultado de baixa patrimonial ${writeOff.id}`,
      sourceModule: "PATRIMONIO",
      sourceType: "ASSET_WRITE_OFF",
      sourceId: writeOff.id,
      idempotencyKey: `PATRIMONIO:ASSET_WRITE_OFF:${writeOff.id}:${eventCode}`,
    });
    await tx.update(assetWriteOffs).set({ accountingTransactionId: transaction.id }).where(eq(assetWriteOffs.id, writeOff.id));
    return { accountingTransactionId: transaction.id, pending: false };
  } catch (error) {
    if (!(error instanceof FinanceError)) throw error;
    await tx.insert(assetIntegrationPendingConfigurations).values({ assetWriteOffId: writeOff.id, expectedEventCode: eventCode, reason: error.message });
    return { accountingTransactionId: null, pending: true };
  }
}

export async function recordAssetDisposal(db: DatabaseConnection, input: AssetDisposalInput) {
  if (!input.assetId.trim() || !input.reason.trim() || !input.justification.trim()) {
    throw new AssetLifecycleError("Bem, motivo e justificativa são obrigatórios.");
  }
  if (input.type !== "Baixa" && input.type !== "Alienação") {
    throw new AssetLifecycleError("Tipo de baixa patrimonial inválido.");
  }
  if (Number.isNaN(input.date.valueOf())) throw new AssetLifecycleError("Data da baixa inválida.");
  const disposalValue = roundCurrency(input.disposalValue ?? 0);
  if (!Number.isFinite(disposalValue) || disposalValue < 0) {
    throw new AssetLifecycleError("O valor de alienação deve ser maior ou igual a zero.");
  }
  if (input.type === "Baixa" && disposalValue !== 0) {
    throw new AssetLifecycleError("Baixa sem alienação não pode registrar valor recebido.");
  }

  return withDatabaseTransaction(db, async (tx) => {
    await tx.execute(sql`SELECT id FROM "Asset" WHERE id = ${input.assetId} FOR UPDATE`);
    const [loaded] = await tx.select({ asset: assetTable, secretariatId: departments.secretariatId }).from(assetTable).leftJoin(departments, eq(departments.id, assetTable.departmentId)).where(eq(assetTable.id, input.assetId)).limit(1);
    const asset = loaded?.asset;
    if (!asset) throw new AssetLifecycleError("Bem patrimonial não encontrado.");
    if (input.date < asset.acquisitionDate) throw new AssetLifecycleError("A baixa não pode anteceder a aquisição do bem.");
    if (asset.status === "Baixado" || asset.status === "Inativo") throw new AssetLifecycleError("Este bem está baixado ou inativo.");
    if ((await tx.select({ id: assetMaintenances.id }).from(assetMaintenances).where(and(eq(assetMaintenances.assetId, asset.id), sql`${assetMaintenances.status} IN ('Solicitada','Em manutenção')`)).limit(1)).length) throw new AssetLifecycleError("Conclua as manutenções abertas antes da baixa patrimonial.");
    if (input.actor) {
      const unitId = input.financial?.budgetUnitId;
      if (!unitId) throw new AssetLifecycleError("Selecione a unidade gestora responsável pela baixa.");
      if (input.actor.allowedBudgetUnitIds && !input.actor.allowedBudgetUnitIds.includes(unitId)) throw new AssetLifecycleError("Baixa fora das unidades gestoras autorizadas.");
      const unit = (await tx.execute<{ secretariatId: string; governmentEntityId: string | null }>(sql`SELECT u."secretariatId", p."governmentEntityId" FROM "BudgetUnit" u LEFT JOIN "PlanningEntityUnit" p ON p."budgetUnitId"=u.id WHERE u.id=${unitId}`)).rows[0];
      if (!unit?.governmentEntityId || (loaded?.secretariatId && loaded.secretariatId !== unit.secretariatId)) throw new AssetLifecycleError("A UG selecionada diverge da lotação administrativa do bem.");
      await resolveAssetValuationScope(tx, { actor: input.actor, budgetUnitId: unitId }, input.date);
      await assertAssetValuationOrigin(tx, asset.id, { actor: input.actor, budgetUnitId: unitId }, unit.secretariatId);
    }
    const [latestAdjustment] = await tx.select({ date: assetValueAdjustments.date }).from(assetValueAdjustments).where(and(eq(assetValueAdjustments.assetId, asset.id), activeAdjustment)).orderBy(desc(assetValueAdjustments.date)).limit(1);
    if (latestAdjustment && input.date < latestAdjustment.date) throw new AssetLifecycleError("A baixa não pode anteceder ajuste já registrado.");

    const [latestDepreciation] = await tx.select({ referenceMonth: assetValueHistories.referenceMonth }).from(assetValueHistories).where(and(eq(assetValueHistories.assetId, asset.id), activeDepreciation)).orderBy(desc(assetValueHistories.referenceMonth)).limit(1);
    if (latestDepreciation && input.date < depreciationPostingDate(latestDepreciation.referenceMonth)) throw new AssetLifecycleError("A baixa não pode anteceder a última depreciação processada.");

    const [existing] = await tx.select({ id: assetWriteOffs.id }).from(assetWriteOffs).where(eq(assetWriteOffs.assetId, asset.id)).limit(1);
    if (existing) throw new AssetLifecycleError("Este bem já possui uma baixa registrada.");

    const calculation = calculateAssetDisposal(Number(asset.currentValueDecimal ?? asset.currentValue), disposalValue);
    const [writeOff] = await tx.insert(assetWriteOffs).values({
        assetId: asset.id,
        date: input.date,
        type: input.type,
        reason: input.reason.trim(),
        justification: input.justification.trim(),
        ...calculation,
    }).returning();

    // Se for Alienação com valor recebido > 0, gera receita, tesouraria e contabilização automática
    let alienationRevenueId: string | null = null;
    let alienationTreasuryMovementId: string | null = null;

    if (input.type === "Alienação" && disposalValue > 0 && input.actor) {
      const financial = input.financial;
      if (!financial?.bankAccountId || !financial.revenueNatureId || !financial.resourceSourceId) throw new AssetLifecycleError("Alienação recebida exige conta arrecadadora, natureza e fonte explicitamente selecionadas.");
      const account = (await tx.execute<{ budgetUnitId: string | null }>(sql`SELECT "budgetUnitId" FROM "BankAccount" WHERE id=${financial.bankAccountId}`)).rows[0];
      if (!account || account.budgetUnitId !== financial.budgetUnitId) throw new AssetLifecycleError("Conta de alienação pertence a outra unidade gestora.");
      const revenue = await recordConfirmedRevenue(tx, input.actor, {
        date: input.date, value: new Decimal(String(disposalValue)),
        revenueNatureId: financial.revenueNatureId, resourceSourceId: financial.resourceSourceId, bankAccountId: financial.bankAccountId,
        history: `Receita de alienação do bem patrimonial ${asset.name}`, sourceModule: "PATRIMONIO", sourceType: "ASSET_ALIENATION",
        sourceId: writeOff.id, eventType: "REVENUE_COLLECTED", idempotencyKey: `PATRIMONIO:ASSET_ALIENATION_REVENUE:${writeOff.id}`,
      });
      alienationRevenueId = revenue.id;
      alienationTreasuryMovementId = revenue.treasuryMovement?.id ?? null;
    }

    const integration = await postDisposalGainLossOrRecordPending(tx, writeOff, input.actor, input.financial?.budgetUnitId);
    await tx.update(assetTable).set({ status: "Baixado" }).where(eq(assetTable.id, asset.id));
    return { ...writeOff, integration, alienationRevenueId, alienationTreasuryMovementId };
  });
}
