import { Prisma, type PrismaClient } from "@prisma/client";
import { FinanceError, postAccountingEventInTransaction, recordConfirmedRevenue, type FinanceActor } from "@/lib/financeiro";
import { resolveAssetValuationScope, assertAssetValuationOrigin, postAssetValuation, type AssetValuationContext } from "./valuation-accounting";
import { recordMunicipalCostSource } from "@/lib/financeiro/cost-ledger";

export class AssetLifecycleError extends Error {}

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

export async function depreciateAssetsForMonth(db: PrismaClient, referenceDate: Date, accounting?: AssetValuationContext) {
  if (!accounting) throw new AssetLifecycleError("Selecione a UG e o responsável pela depreciação.");
  const referenceMonth = normalizeReferenceMonth(referenceDate);
  const postingDate = depreciationPostingDate(referenceMonth);
  return db.$transaction(async tx => {
  const scope = await resolveAssetValuationScope(tx, accounting, postingDate);
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`ASSET_DEPRECIATION:${accounting.budgetUnitId}`}, 0))::text`;
  const assets = await tx.asset.findMany({
    where: { status: { notIn: ["Baixado", "Inativo"] }, department: { secretariatId: scope.unit.secretariatId! }, OR: [{ budgetUnitId: accounting.budgetUnitId }, { budgetUnitId: null, purchaseReceiptItem: { purchaseReceipt: { commitment: { appropriation: { budgetUnitId: accounting.budgetUnitId } } } } }, { budgetUnitId: null, purchaseReceiptItemId: null }] },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  let processed = 0;
  let skipped = 0;
  for (const asset of assets) {
    const created = await (async () => {
        await tx.$queryRaw`SELECT id FROM "Asset" WHERE id = ${asset.id} FOR UPDATE`;
        await assertAssetValuationOrigin(tx, asset.id, accounting, scope.unit.secretariatId!);
        const existing = await tx.assetValueHistory.findUnique({
          where: { assetId_referenceMonth: { assetId: asset.id, referenceMonth } },
          select: { id: true, accountingTransaction: { select: { reversedBy: { select: { id: true } } } } },
        });
        if (existing?.accountingTransaction?.reversedBy) throw new AssetLifecycleError("Competência estornada preservada no histórico; registre correção fundamentada em vez de reprocessar o mesmo fato.");
        if (existing) return false;

        const futureHistory = await tx.assetValueHistory.findFirst({
          where: { assetId: asset.id, referenceMonth: { gt: referenceMonth }, OR: [{ accountingTransactionId: null }, { accountingTransaction: { reversedBy: { is: null } } }] },
          select: { id: true },
        });
        if (futureHistory) throw new AssetLifecycleError("Há competência posterior processada; concilie a sequência patrimonial.");
        const previousHistory = await tx.assetValueHistory.findFirst({ where: { assetId: asset.id, referenceMonth: { lt: referenceMonth }, OR: [{ accountingTransactionId: null }, { accountingTransaction: { reversedBy: { is: null } } }] }, orderBy: { referenceMonth: "desc" }, select: { referenceMonth: true } });
        if (previousHistory && depreciationPeriod(previousHistory.referenceMonth, referenceMonth) !== 2) throw new AssetLifecycleError("Processe as competências patrimoniais intermediárias antes deste mês.");
        if (await tx.assetValueAdjustment.findFirst({ where: { assetId: asset.id, date: { gt: postingDate }, OR: [{ accountingTransactionId: null }, { accountingTransaction: { reversedBy: { is: null } } }] }, select: { id: true } })) throw new AssetLifecycleError("A competência antecede ajuste patrimonial já registrado; concilie a sequência antes da depreciação.");

        const currentAsset = await tx.asset.findUniqueOrThrow({
          where: { id: asset.id },
          select: { currentValue: true, currentValueDecimal: true, status: true, acquisitionDate: true, categoryId: true, category: { select: { lifeSpan: true, isActive: true } } },
        });
        if (currentAsset.status === "Baixado" || currentAsset.status === "Inativo") return false;
        if (currentAsset.acquisitionDate > postingDate) return false;

        // Recalculate over the remaining useful life so capitalized costs and
        // valuation changes are amortized prospectively, not retroactively.
        const currentPeriod = depreciationPeriod(currentAsset.acquisitionDate, referenceMonth);
        if (!currentAsset.category.isActive || currentAsset.category.lifeSpan <= 0 || !Number.isFinite(currentAsset.currentValue) || currentAsset.currentValue < 0) throw new AssetLifecycleError("Categoria, vida útil ou valor patrimonial inválidos.");
        const remainingPeriods = currentAsset.category.lifeSpan - currentPeriod + 1;
        const opening = currentAsset.currentValueDecimal ?? new Prisma.Decimal(String(currentAsset.currentValue)).toDecimalPlaces(2);
        const depreciation = remainingPeriods > 0 && currentPeriod > 0
          ? opening.div(remainingPeriods).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
          : new Prisma.Decimal(0);
        if (depreciation.isZero()) return false;
        const actualDepreciation = Number(depreciation);
        const closing = opening.minus(depreciation);
        const closingValue = Number(closing);

        const history = await tx.assetValueHistory.create({
          data: {
            assetId: asset.id,
            referenceMonth,
            openingValue: currentAsset.currentValue,
            depreciation: actualDepreciation,
            closingValue,
            openingValueDecimal: opening,
            depreciationDecimal: depreciation,
            closingValueDecimal: closing,
            lifeSpanMonths: currentAsset.category.lifeSpan,
          },
        });
        const transaction = await postAssetValuation(tx, accounting, { assetId: asset.id, date: postingDate, eventCode: `ASSET_DEPRECIATION:${currentAsset.categoryId}`, value: depreciation, key: `PATRIMONIO:DEPRECIATION:${asset.id}:${referenceMonth.toISOString()}`, history: `Depreciação patrimonial ${asset.id}` });
        await tx.assetValueHistory.update({ where: { id: history.id }, data: { accountingTransactionId: transaction.id } });
        await tx.asset.update({ where: { id: asset.id }, data: { currentValue: closingValue, currentValueDecimal: closing, budgetUnitId: accounting.budgetUnitId } });
        await recordMunicipalCostSource(tx, accounting.actor, { financialYearId: scope.financialYearId, budgetUnitId: accounting.budgetUnitId, sourceType: "DEPRECIATION", sourceId: history.id, expenseDate: postingDate, amount: depreciation, dimensions: { assetId: asset.id, categoryId: currentAsset.categoryId }, evidence: { assetId: asset.id, historyId: history.id, accountingTransactionId: transaction.id, referenceMonth: referenceMonth.toISOString(), opening: opening.toFixed(2), closing: closing.toFixed(2) } });
        await tx.financialAuditLog.create({ data: { action: "ASSET_DEPRECIATION", entityType: "AssetValueHistory", entityId: history.id, authorUsuarioId: accounting.actor.usuarioId, authorEmployeeId: accounting.actor.employeeId, financialYearId: scope.financialYearId, payload: { assetId: asset.id, budgetUnitId: accounting.budgetUnitId, accountingTransactionId: transaction.id, opening: opening.toFixed(2), depreciation: depreciation.toFixed(2), closing: closing.toFixed(2) } } });
        return true;
      })();
    if (created) processed += 1;
    else skipped += 1;
  }
  return { referenceMonth, processed, skipped };
  }, { timeout: 60000 });
}

export async function recordAssetValueAdjustment(db: PrismaClient, input: AssetValueAdjustmentInput, accounting?: AssetValuationContext) {
  if (!accounting || !input.idempotencyKey?.trim()) throw new AssetLifecycleError("Informe UG, responsável e chave do ajuste patrimonial.");
  if (!input.assetId.trim() || !input.justification.trim() || !input.evidence.trim()) {
    throw new AssetLifecycleError("Bem, justificativa e evidência são obrigatórios.");
  }
  if (!["REVALUATION", "IMPAIRMENT", "SUBSEQUENT_COST"].includes(input.type)) {
    throw new AssetLifecycleError("Tipo de ajuste patrimonial inválido.");
  }
  if (Number.isNaN(input.date.valueOf())) throw new AssetLifecycleError("Data do ajuste inválida.");

  return db.$transaction(async (tx) => {
    const scope = await resolveAssetValuationScope(tx, accounting, input.date);
    await tx.$queryRaw`SELECT id FROM "Asset" WHERE id = ${input.assetId} FOR UPDATE`;
    await assertAssetValuationOrigin(tx, input.assetId, accounting, scope.unit.secretariatId!);
    const adjustmentId = `PATRIMONIO:ADJUSTMENT:${input.idempotencyKey!.trim()}`;
    const prior = await tx.assetValueAdjustment.findUnique({ where: { id: adjustmentId } });
    if (prior) {
      const requested = input.type === "SUBSEQUENT_COST" ? prior.adjustmentValueDecimal ?? prior.adjustmentValue : prior.closingValueDecimal ?? prior.closingValue;
      if (prior.assetId !== input.assetId || prior.type !== input.type || prior.date.getTime() !== input.date.getTime() || !new Prisma.Decimal(String(requested)).eq(String(roundCurrency(input.value))) || prior.justification !== input.justification.trim() || prior.evidence !== input.evidence.trim()) throw new AssetLifecycleError("Ajuste já registrado com outros dados.");
      const posting = await tx.accountingTransaction.findUnique({ where: { idempotencyKey: `${adjustmentId}:ACCOUNTING` }, select: { sourceId: true, budgetUnitId: true } });
      if (!posting || posting.sourceId !== input.assetId || posting.budgetUnitId !== accounting.budgetUnitId) throw new AssetLifecycleError("Ajuste anterior sem partida conciliada à origem e UG; regularize antes da repetição.");
      return prior;
    }
    const asset = await tx.asset.findUnique({
      where: { id: input.assetId },
      select: { id: true, categoryId: true, status: true, acquisitionDate: true, acquisitionValue: true, acquisitionValueDecimal: true, currentValue: true, currentValueDecimal: true },
    });
    if (!asset) throw new AssetLifecycleError("Bem patrimonial não encontrado.");
    if (asset.status === "Baixado" || asset.status === "Inativo") throw new AssetLifecycleError("Não é possível ajustar um bem baixado ou inativo.");
    if (input.date < asset.acquisitionDate) throw new AssetLifecycleError("O ajuste não pode ser anterior à aquisição do bem.");
    const latestDepreciation = await tx.assetValueHistory.findFirst({
      where: { assetId: asset.id, OR: [{ accountingTransactionId: null }, { accountingTransaction: { reversedBy: { is: null } } }] }, orderBy: { referenceMonth: "desc" }, select: { referenceMonth: true },
    });
    if (latestDepreciation && input.date <= depreciationPostingDate(latestDepreciation.referenceMonth)) {
      throw new AssetLifecycleError("O ajuste deve ser posterior à última competência de depreciação processada.");
    }

    const latestAdjustment = await tx.assetValueAdjustment.findFirst({ where: { assetId: asset.id, OR: [{ accountingTransactionId: null }, { accountingTransaction: { reversedBy: { is: null } } }] }, orderBy: { date: "desc" }, select: { date: true } });
    if (latestAdjustment && input.date < latestAdjustment.date) throw new AssetLifecycleError("O ajuste não pode anteceder outro ajuste já registrado.");

    const opening = asset.currentValueDecimal ?? new Prisma.Decimal(String(asset.currentValue)).toDecimalPlaces(2);
    const requestedValue = new Prisma.Decimal(String(input.value)).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    calculateAssetValueAdjustment(Number(opening), input.type, Number(requestedValue));
    const closing = input.type === "SUBSEQUENT_COST" ? opening.plus(requestedValue) : requestedValue;
    const delta = closing.minus(opening);
    const calculation = { openingValue: Number(opening), adjustmentValue: Number(delta), closingValue: Number(closing) };
    const updated = await tx.asset.updateMany({
      where: { id: asset.id, currentValue: asset.currentValue, status: { notIn: ["Baixado", "Inativo"] } },
      data: {
        currentValue: calculation.closingValue,
        currentValueDecimal: closing,
        budgetUnitId: accounting.budgetUnitId,
        ...(input.type === "SUBSEQUENT_COST" ? { acquisitionValue: Number((asset.acquisitionValueDecimal ?? new Prisma.Decimal(String(asset.acquisitionValue))).plus(delta)), acquisitionValueDecimal: (asset.acquisitionValueDecimal ?? new Prisma.Decimal(String(asset.acquisitionValue))).plus(delta) } : {}),
      },
    });
    if (updated.count !== 1) throw new AssetLifecycleError("O valor do bem foi alterado por outra operação. Revise e tente novamente.");
    const adjustment = await tx.assetValueAdjustment.create({
      data: {
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
      },
    });
    const eventCode = input.type === "REVALUATION" ? calculation.adjustmentValue > 0 ? "ASSET_REVALUATION_GAIN" : "ASSET_REVALUATION_LOSS" : input.type === "IMPAIRMENT" ? "ASSET_IMPAIRMENT" : "ASSET_SUBSEQUENT_COST";
    const transaction = await postAssetValuation(tx, accounting, { assetId: asset.id, date: input.date, eventCode: `${eventCode}:${asset.categoryId}`, value: delta.abs(), key: `${adjustmentId}:ACCOUNTING`, history: input.justification.trim() });
    const recorded = await tx.assetValueAdjustment.update({ where: { id: adjustment.id }, data: { accountingTransactionId: transaction.id } });
    await tx.financialAuditLog.create({ data: { action: "ASSET_VALUE_ADJUSTMENT", entityType: "AssetValueAdjustment", entityId: adjustment.id, authorUsuarioId: accounting.actor.usuarioId, authorEmployeeId: accounting.actor.employeeId, financialYearId: scope.financialYearId, payload: { assetId: asset.id, budgetUnitId: accounting.budgetUnitId, accountingTransactionId: transaction.id, ...calculation } } });
    return recorded;
  });
}

async function postDisposalGainLossOrRecordPending(
  tx: Prisma.TransactionClient,
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
    budgetUnitId ? tx.planningEntityUnit.findUnique({ where: { budgetUnitId }, select: { governmentEntityId: true } }).then(async (binding) => binding ? tx.financialYear.findFirst({ where: { governmentEntityId: binding.governmentEntityId, status: "Aberto", startDate: { lte: writeOff.date }, endDate: { gte: writeOff.date } }, select: { id: true } }) : null) : null,
    tx.accountingEventCatalog.findUnique({ where: { code: eventCode }, include: { rules: { where: { isActive: true }, select: { isReference: true } } } }),
  ]);
  const configurationReason = reason
    ?? (!year ? "Não há exercício financeiro aberto para a data da baixa."
      : !event?.isActive || event.rules.length !== 1 ? `O evento ${eventCode} deve possuir exatamente uma regra ativa.`
        : event.rules[0].isReference && process.env.CELERIFLOW_ACCOUNTING_MODE !== "POC" ? "A regra do evento é apenas de referência e não está homologada para este ambiente."
          : undefined);
  if (configurationReason) {
    await tx.assetIntegrationPendingConfiguration.create({ data: { assetWriteOffId: writeOff.id, expectedEventCode: eventCode, reason: configurationReason } });
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
    await tx.assetWriteOff.update({ where: { id: writeOff.id }, data: { accountingTransactionId: transaction.id } });
    return { accountingTransactionId: transaction.id, pending: false };
  } catch (error) {
    if (!(error instanceof FinanceError)) throw error;
    await tx.assetIntegrationPendingConfiguration.create({ data: { assetWriteOffId: writeOff.id, expectedEventCode: eventCode, reason: error.message } });
    return { accountingTransactionId: null, pending: true };
  }
}

export async function recordAssetDisposal(db: PrismaClient, input: AssetDisposalInput) {
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

  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Asset" WHERE id = ${input.assetId} FOR UPDATE`;
    const asset = await tx.asset.findUnique({
      where: { id: input.assetId },
      select: { id: true, budgetUnitId: true, acquisitionDate: true, status: true, currentValue: true, currentValueDecimal: true, name: true, department: { select: { secretariatId: true } }, maintenances: { where: { status: { in: ["Solicitada", "Em manutenção"] } }, select: { id: true }, take: 1 } },
    });
    if (!asset) throw new AssetLifecycleError("Bem patrimonial não encontrado.");
    if (input.date < asset.acquisitionDate) throw new AssetLifecycleError("A baixa não pode anteceder a aquisição do bem.");
    if (asset.status === "Baixado" || asset.status === "Inativo") throw new AssetLifecycleError("Este bem está baixado ou inativo.");
    if (asset.maintenances.length) throw new AssetLifecycleError("Conclua as manutenções abertas antes da baixa patrimonial.");
    if (input.actor) {
      const unitId = input.financial?.budgetUnitId;
      if (!unitId) throw new AssetLifecycleError("Selecione a unidade gestora responsável pela baixa.");
      if (input.actor.allowedBudgetUnitIds && !input.actor.allowedBudgetUnitIds.includes(unitId)) throw new AssetLifecycleError("Baixa fora das unidades gestoras autorizadas.");
      const unit = await tx.budgetUnit.findUnique({ where: { id: unitId }, select: { secretariatId: true, planningEntityUnit: { select: { governmentEntityId: true } } } });
      if (!unit?.planningEntityUnit || (asset.department?.secretariatId && asset.department.secretariatId !== unit.secretariatId)) throw new AssetLifecycleError("A UG selecionada diverge da lotação administrativa do bem.");
      await resolveAssetValuationScope(tx, { actor: input.actor, budgetUnitId: unitId }, input.date);
      await assertAssetValuationOrigin(tx, asset.id, { actor: input.actor, budgetUnitId: unitId }, unit.secretariatId);
    }
    const latestAdjustment = await tx.assetValueAdjustment.findFirst({ where: { assetId: asset.id, OR: [{ accountingTransactionId: null }, { accountingTransaction: { reversedBy: { is: null } } }] }, orderBy: { date: "desc" }, select: { date: true } });
    if (latestAdjustment && input.date < latestAdjustment.date) throw new AssetLifecycleError("A baixa não pode anteceder ajuste já registrado.");

    const latestDepreciation = await tx.assetValueHistory.findFirst({ where: { assetId: asset.id, OR: [{ accountingTransactionId: null }, { accountingTransaction: { reversedBy: { is: null } } }] }, orderBy: { referenceMonth: "desc" }, select: { referenceMonth: true } });
    if (latestDepreciation && input.date < depreciationPostingDate(latestDepreciation.referenceMonth)) throw new AssetLifecycleError("A baixa não pode anteceder a última depreciação processada.");

    const existing = await tx.assetWriteOff.findFirst({ where: { assetId: asset.id }, select: { id: true } });
    if (existing) throw new AssetLifecycleError("Este bem já possui uma baixa registrada.");

    const calculation = calculateAssetDisposal(Number(asset.currentValueDecimal ?? asset.currentValue), disposalValue);
    const writeOff = await tx.assetWriteOff.create({
      data: {
        assetId: asset.id,
        date: input.date,
        type: input.type,
        reason: input.reason.trim(),
        justification: input.justification.trim(),
        ...calculation,
      },
    });

    // Se for Alienação com valor recebido > 0, gera receita, tesouraria e contabilização automática
    let alienationRevenueId: string | null = null;
    let alienationTreasuryMovementId: string | null = null;

    if (input.type === "Alienação" && disposalValue > 0 && input.actor) {
      const financial = input.financial;
      if (!financial?.bankAccountId || !financial.revenueNatureId || !financial.resourceSourceId) throw new AssetLifecycleError("Alienação recebida exige conta arrecadadora, natureza e fonte explicitamente selecionadas.");
      const account = await tx.bankAccount.findUniqueOrThrow({ where: { id: financial.bankAccountId } });
      if (account.budgetUnitId !== financial.budgetUnitId) throw new AssetLifecycleError("Conta de alienação pertence a outra unidade gestora.");
      const revenue = await recordConfirmedRevenue(tx, input.actor, {
        date: input.date, value: new Prisma.Decimal(String(disposalValue)),
        revenueNatureId: financial.revenueNatureId, resourceSourceId: financial.resourceSourceId, bankAccountId: financial.bankAccountId,
        history: `Receita de alienação do bem patrimonial ${asset.name}`, sourceModule: "PATRIMONIO", sourceType: "ASSET_ALIENATION",
        sourceId: writeOff.id, eventType: "REVENUE_COLLECTED", idempotencyKey: `PATRIMONIO:ASSET_ALIENATION_REVENUE:${writeOff.id}`,
      });
      alienationRevenueId = revenue.id;
      alienationTreasuryMovementId = revenue.treasuryMovement?.id ?? null;
    }

    const integration = await postDisposalGainLossOrRecordPending(tx, writeOff, input.actor, input.financial?.budgetUnitId);
    await tx.asset.update({ where: { id: asset.id }, data: { status: "Baixado" } });
    return { ...writeOff, integration, alienationRevenueId, alienationTreasuryMovementId };
  });
}
