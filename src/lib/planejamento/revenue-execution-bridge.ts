import { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;
type Actor = { usuarioId: string; allowedBudgetUnitIds?: string[] };
type RevenueFact = { id: string; financialYearId: string | null; revenueNatureId: string; resourceSourceId: string; bankAccountId: string | null; valueDecimal: Prisma.Decimal | null; collectionDate: Date | null };

async function runtime(tx: Tx) {
  const [row] = await tx.$queryRaw<{ ready: boolean }[]>`SELECT (to_regclass('"PlanningBudgetLine"') IS NOT NULL AND to_regclass('"PlanningQuotaEvent"') IS NOT NULL) AS ready`;
  return row?.ready === true;
}

/** Instrument locks precede Revenue/BankAccount locks in all connected receipt paths. */
export async function lockPlanningRevenueBudget(tx: Tx, bankAccountId: string, date: Date) {
  if (!await runtime(tx)) return;
  const account = await tx.bankAccount.findUnique({ where: { id: bankAccountId }, select: { budgetUnitId: true } });
  if (!account?.budgetUnitId) return;
  await tx.$queryRaw`SELECT p.id FROM "PlanningInstrument" p JOIN "PlanningEntityUnit" u ON u."governmentEntityId" = p."governmentEntityId" WHERE p.kind = 'LOA' AND p."startYear" = ${date.getUTCFullYear()} AND u."budgetUnitId" = ${account.budgetUnitId} ORDER BY p.id FOR UPDATE OF p`;
}

async function connectedPiece(tx: Tx, accountId: string, year: number) {
  const account = await tx.bankAccount.findUnique({ where: { id: accountId }, select: { budgetUnitId: true } });
  if (!account?.budgetUnitId) return null;
  const pieces = await tx.planningInstrument.findMany({ where: { kind: "LOA", startYear: year, implantedAt: { not: null }, governmentEntity: { planningUnits: { some: { budgetUnitId: account.budgetUnitId } } }, annualBudgetLaw: { is: { metadata: { path: ["planningInternalExecution"], equals: true } } } }, select: { id: true } });
  if (pieces.length > 1) throw new Error("Orçamento de arrecadação ambíguo; reconcilie a implantação por entidade/exercício.");
  return pieces[0] ? { instrumentId: pieces[0].id, budgetUnitId: account.budgetUnitId } : null;
}

export async function recordPlanningRevenueCollection(tx: Tx, actor: Actor, fact: RevenueFact) {
  if (!await runtime(tx) || !fact.bankAccountId || !fact.collectionDate) return;
  await lockPlanningRevenueBudget(tx, fact.bankAccountId, fact.collectionDate);
  const piece = await connectedPiece(tx, fact.bankAccountId, fact.collectionDate.getUTCFullYear());
  if (!piece) return;
  if (actor.allowedBudgetUnitIds && !actor.allowedBudgetUnitIds.includes(piece.budgetUnitId)) throw new Error("Arrecadação fora das unidades autorizadas.");
  if (!fact.valueDecimal?.greaterThan(0)) throw new Error("Reconcilie o valor Decimal da arrecadação.");
  const key = `finance:revenue:${fact.id}:collected`;
  const duplicate = await tx.planningQuotaEvent.findUnique({ where: { submissionKey: key }, include: { quota: { include: { line: true } } } });
  if (duplicate) {
    if (!duplicate.value.equals(fact.valueDecimal) || duplicate.effectiveAt.getTime() !== fact.collectionDate.getTime() || duplicate.quota.line.instrumentId !== piece.instrumentId) throw new Error("Arrecadação já vinculada com outros dados.");
    return;
  }
  const lines = await tx.planningBudgetLine.findMany({ where: { instrumentId: piece.instrumentId, year: fact.collectionDate.getUTCFullYear(), kind: "REVENUE", budgetUnitId: piece.budgetUnitId, revenueNatureId: fact.revenueNatureId, resourceSourceId: fact.resourceSourceId }, include: { quotas: true } });
  if (lines.length !== 1) throw new Error("Mapeie uma única previsão de receita por natureza, fonte, unidade e exercício antes de arrecadar.");
  const quota = lines[0].quotas.find((row) => row.month === fact.collectionDate!.getUTCMonth() + 1);
  if (!quota || lines[0].quotas.length !== 12 || quota.closedAt) throw new Error("A arrecadação exige doze metas mensais e mês aberto.");
  // Revenue realization can exceed its forecast. It is not an expenditure ceiling.
  await tx.planningQuota.update({ where: { id: quota.id }, data: { consumed: { increment: fact.valueDecimal } } });
  await tx.planningQuotaEvent.create({ data: { quotaId: quota.id, type: "CONSUME", effectiveAt: fact.collectionDate, value: fact.valueDecimal, reason: "Arrecadação canônica — Financeiro", submissionKey: key, createdById: actor.usuarioId } });
}

export async function recordPlanningRevenueReversal(tx: Tx, actor: Actor, fact: RevenueFact, date: Date) {
  if (!await runtime(tx) || !fact.bankAccountId || !fact.collectionDate) return;
  await lockPlanningRevenueBudget(tx, fact.bankAccountId, fact.collectionDate);
  const origin = await tx.planningQuotaEvent.findUnique({ where: { submissionKey: `finance:revenue:${fact.id}:collected` }, include: { quota: { include: { line: true } }, releases: true } });
  if (!origin) {
    if (await connectedPiece(tx, fact.bankAccountId, fact.collectionDate.getUTCFullYear())) throw new Error("Reconcilie a arrecadação anterior antes de estornar sua meta mensal.");
    return;
  }
  if (actor.allowedBudgetUnitIds && !actor.allowedBudgetUnitIds.includes(origin.quota.line.budgetUnitId)) throw new Error("Estorno de arrecadação fora das unidades autorizadas.");
  if (date < origin.effectiveAt || date.getUTCFullYear() !== origin.quota.line.year) throw new Error("Estorno de arrecadação fora da data/exercício da origem.");
  const key = `finance:revenue:${fact.id}:reversed`;
  const duplicate = await tx.planningQuotaEvent.findUnique({ where: { submissionKey: key } });
  if (duplicate) {
    if (duplicate.originEventId !== origin.id || duplicate.effectiveAt.getTime() !== date.getTime() || !duplicate.value.equals(fact.valueDecimal ?? -1)) throw new Error("Estorno de arrecadação já registrado com outros dados.");
    return;
  }
  if (!fact.valueDecimal?.equals(origin.value) || origin.releases.length || origin.quota.consumed.lessThan(origin.value)) throw new Error("O estorno excede ou diverge da arrecadação vinculada.");
  await tx.planningQuota.update({ where: { id: origin.quotaId }, data: { consumed: { decrement: origin.value } } });
  await tx.planningQuotaEvent.create({ data: { quotaId: origin.quotaId, type: "REVERSE", effectiveAt: date, value: origin.value, originEventId: origin.id, reason: "Estorno de arrecadação canônica — Financeiro", submissionKey: key, createdById: actor.usuarioId } });
}

export async function recordPlanningRevenueRedistribution(tx: Tx, actor: Actor, fact: RevenueFact, input: { id: string; destinationResourceSourceId: string; date: Date; valueDecimal: Prisma.Decimal }) {
  if (!await runtime(tx) || !fact.bankAccountId || !fact.collectionDate) return;
  await lockPlanningRevenueBudget(tx, fact.bankAccountId, fact.collectionDate);
  const origin = await tx.planningQuotaEvent.findUnique({ where: { submissionKey: `finance:revenue:${fact.id}:collected` }, include: { quota: { include: { line: true } } } });
  if (!origin) {
    if (await connectedPiece(tx, fact.bankAccountId, fact.collectionDate.getUTCFullYear())) throw new Error("Reconcilie a arrecadação anterior antes de redistribuir sua fonte.");
    return;
  }
  if (actor.allowedBudgetUnitIds && !actor.allowedBudgetUnitIds.includes(origin.quota.line.budgetUnitId)) throw new Error("Redistribuição fora das unidades autorizadas.");
  const key = `finance:revenueRedistribution:${input.id}`;
  if (await tx.planningQuotaEvent.findUnique({ where: { submissionKey: `${key}:out` } })) return;
  if (input.date < origin.effectiveAt || input.date.getUTCFullYear() !== origin.quota.line.year || origin.quota.consumed.lessThan(input.valueDecimal)) throw new Error("Redistribuição fora da data ou saldo da arrecadação.");
  const targets = await tx.planningBudgetLine.findMany({ where: { instrumentId: origin.quota.line.instrumentId, kind: "REVENUE", year: origin.quota.line.year, budgetUnitId: origin.quota.line.budgetUnitId, revenueNatureId: fact.revenueNatureId, resourceSourceId: input.destinationResourceSourceId }, include: { quotas: true } });
  if (targets.length !== 1 || targets[0].quotas.length !== 12) throw new Error("Mapeie uma única previsão de destino com doze metas mensais antes de redistribuir a fonte.");
  const target = targets[0].quotas.find((quota) => quota.month === origin.quota.month)!;
  await tx.planningQuota.update({ where: { id: origin.quotaId }, data: { consumed: { decrement: input.valueDecimal } } });
  await tx.planningQuota.update({ where: { id: target.id }, data: { consumed: { increment: input.valueDecimal } } });
  for (const [quotaId, type, suffix] of [[origin.quotaId, "REVENUE_SOURCE_OUT", "out"], [target.id, "REVENUE_SOURCE_IN", "in"]] as const) await tx.planningQuotaEvent.create({ data: { quotaId, type, value: input.valueDecimal, effectiveAt: input.date, reason: "Redistribuição de fonte da arrecadação canônica", submissionKey: `${key}:${suffix}`, createdById: actor.usuarioId } });
}
