import "server-only";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { AccessError, canViewModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { assertPlanningOperation, planningInstrumentWhere, type PlanningContext } from "./access";
import { canonicalPiece, finalizeLegalRevision, lockLegalInstrument, contentHash, planningAudit, snapshotVersion } from "./operations-core";
import { planningDateSchema } from "./revisions";

export async function readPlanningRclExecution(context: PlanningContext, entityId: string, references: { budgetUnitId: string; resourceSourceId: string; revenueNature: { id: string } | null }[], asOf: string) {
  if (!canViewModule(context.user, "FINANCEIRO")) return { status: "RESTRICTED" as const, rows: [], total: null };
  const [runtime] = await context.prisma.$queryRaw<{ ready: boolean }[]>`SELECT (to_regclass('"MonthlyAccountingClose"') IS NOT NULL AND to_regclass('"TreasuryMovement"') IS NOT NULL AND to_regclass('"Revenue"') IS NOT NULL) AS ready`;
  if (!runtime?.ready) return { status: "UNAVAILABLE" as const, rows: [], total: null };
  planningDateSchema.parse(asOf);
  if (asOf > new Date().toISOString().slice(0, 10)) throw new Error("RCL executada não admite corte futuro.");
  const units = await context.prisma.planningEntityUnit.findMany({ where: { governmentEntityId: entityId }, select: { budgetUnitId: true } });
  if (!units.length || references.some(reference => !units.some(unit => unit.budgetUnitId === reference.budgetUnitId))) throw new AccessError("Composição da RCL contém unidade fora da entidade selecionada.", 403);
  if (!isSystemAdministrator(context.user) && units.some((unit) => !context.user.allowedBudgetUnitIds.includes(unit.budgetUnitId))) throw new AccessError("RCL do ente exige todas as unidades autorizadas.", 403);
  const until = new Date(`${asOf}T23:59:59.999Z`), from = new Date(Date.UTC(until.getUTCFullYear(), until.getUTCMonth() - 11, 1));
  const months = Array.from({ length: 12 }, (_, index) => new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + index, 1)));
  const completeMonth = until.getTime() === new Date(Date.UTC(until.getUTCFullYear(), until.getUTCMonth() + 1, 1) - 1).getTime();
  const years = await context.prisma.financialYear.findMany({ where: { governmentEntityId: entityId, year: { in: [...new Set(months.map((month) => month.getUTCFullYear()))] } }, select: { id: true, year: true } });
  const closes = await context.prisma.monthlyAccountingClose.findMany({ where: { financialYearId: { in: years.map((year) => year.id) }, competence: { gte: from, lte: until }, status: "FECHADO" }, select: { competence: true } });
  if (!completeMonth || months.some((month) => !closes.some((close) => close.competence.getTime() === month.getTime()))) return { status: "INCOMPLETE" as const, rows: months.map((month, at) => ({ competência: month.toISOString().slice(0, 7), situação: !closes.some((close) => close.competence.getTime() === month.getTime()) ? "Histórico/fechamento não confirmado" : at === months.length - 1 && !completeMonth ? "Corte não encerra competência mensal completa" : "Fechada" })), total: null };
  const definitions = references.filter((reference) => reference.revenueNature).map((reference) => ({ revenueNatureId: reference.revenueNature!.id, resourceSourceId: reference.resourceSourceId, bankAccount: { is: { budgetUnitId: reference.budgetUnitId } } }));
  if (!definitions.length) throw new Error("Configure as receitas e exclusões da RCL.");
  const facts = await context.prisma.treasuryMovement.findMany({ where: { status: "Confirmado", date: { gte: from, lte: until }, OR: [{ revenue: { is: { OR: definitions } } }, { revenueReversal: { is: { revenue: { OR: definitions } } } }] }, select: { id: true, date: true, type: true, valueDecimal: true, revenue: { select: { classification: true } }, revenueReversal: { select: { revenue: { select: { classification: true } } } } } });
  const rows = months.map((month) => {
    const selected = facts.filter((fact) => fact.date.getUTCFullYear() === month.getUTCFullYear() && fact.date.getUTCMonth() === month.getUTCMonth());
    const amount = selected.reduce((sum, fact) => { const deduction = (fact.revenue?.classification ?? fact.revenueReversal?.revenue.classification) === "REDUTORA"; const reversal = fact.type === "RevenueReversal"; return sum.plus(fact.valueDecimal.mul((deduction ? -1 : 1) * (reversal ? -1 : 1))); }, new Prisma.Decimal(0));
    return { competência: month.toISOString().slice(0, 7), valorExecutado: amount.toFixed(2), movimentos: selected.length, memória: contentHash(selected.map((fact) => fact.id).sort()) };
  });
  return { status: "CONNECTED" as const, rows, total: rows.reduce((sum, row) => sum.plus(row.valorExecutado), new Prisma.Decimal(0)).toFixed(2) };
}

export async function readPlanningWaiverRealization(context: PlanningContext, entityId: string, taxId: string | null | undefined, year: number, asOf: string) {
  if (!canViewModule(context.user, "TRIBUTACAO")) return { status: "RESTRICTED" as const, value: null, originIds: [] as string[] };
  if (!taxId) return { status: "UNMAPPED" as const, value: null, originIds: [] as string[] };
  if (asOf > new Date().toISOString().slice(0, 10) || Number(asOf.slice(0, 4)) < year) return { status: "INCOMPLETE" as const, value: null, originIds: [] as string[] };
  const [runtime] = await context.prisma.$queryRaw<{ ready: boolean }[]>`SELECT to_regclass('"TaxBenefitGrant"') IS NOT NULL AS ready`;
  if (!runtime?.ready) return { status: "UNAVAILABLE" as const, value: null, originIds: [] as string[] };
  const mapping = await context.prisma.taxFinancialMapping.findUnique({ where: { taxId }, select: { defaultBankAccount: { select: { budgetUnitId: true } } } });
  const unitId = mapping?.defaultBankAccount.budgetUnitId;
  if (!unitId || !await context.prisma.planningEntityUnit.count({ where: { budgetUnitId: unitId, governmentEntityId: entityId } })) return { status: "UNMAPPED" as const, value: null, originIds: [] as string[] };
  if (!isSystemAdministrator(context.user) && !context.user.allowedBudgetUnitIds.includes(unitId)) throw new AccessError("Benefícios tributários fora das unidades autorizadas.", 403);
  const grants = await context.prisma.taxBenefitGrant.findMany({ where: { status: "CONCEDIDO", grantedAt: { gte: new Date(`${year}-01-01`), lte: new Date(`${asOf < `${year}-12-31` ? asOf : `${year}-12-31`}T23:59:59.999Z`) }, renunciationDecimal: { gt: 0 } }, select: { id: true, sourceId: true, sourceType: true, renunciationDecimal: true } });
  let total = new Prisma.Decimal(0); const ids: string[] = [];
  for (const grant of grants) {
    let assessmentId: string | null = null;
    if (["TAX_ASSESSMENT", "ASSESSMENT", "LANCAMENTO", "LANÇAMENTO"].includes(grant.sourceType.toUpperCase())) assessmentId = grant.sourceId;
    else if (["TAX_GUIDE", "GUIDE", "GUIA"].includes(grant.sourceType.toUpperCase())) assessmentId = (await context.prisma.taxGuide.findUnique({ where: { id: grant.sourceId }, select: { assessmentId: true } }))?.assessmentId ?? null;
    else return { status: "UNRECONCILED" as const, value: null, originIds: [] as string[] };
    const assessment = assessmentId ? await context.prisma.taxAssessment.findUnique({ where: { id: assessmentId }, select: { taxId: true, year: true } }) : null;
    if (!assessment) return { status: "UNRECONCILED" as const, value: null, originIds: [] as string[] };
    if (assessment.taxId === taxId && assessment.year === year) { total = total.plus(grant.renunciationDecimal); ids.push(grant.id); }
  }
  return { status: "CONNECTED" as const, value: total.toFixed(2), originIds: ids };
}

export async function synchronizePlanningWaiver(context: PlanningContext, raw: unknown) {
  assertPlanningOperation(context, "update");
  const input = z.object({ waiverId: z.string().min(1), asOf: planningDateSchema }).parse(raw);
  return context.prisma.$transaction(async (tx) => {
    const record = await tx.planningRevenueWaiver.findFirstOrThrow({ where: { id: input.waiverId, instrument: planningInstrumentWhere(context) } });
    const piece = await lockLegalInstrument(tx, context, record.instrumentId);
    const result = await readPlanningWaiverRealization({ ...context, prisma: tx } as PlanningContext, piece.governmentEntityId, record.taxId, record.year, input.asOf);
    if (result.status !== "CONNECTED") throw new Error(`Realizado da renúncia não apurado: ${result.status}.`);
    const canonical = canonicalPiece(piece);
    if (["SANCTIONED", "PUBLISHED"].includes(canonical?.status ?? "")) await snapshotVersion(tx, context, piece.id, new Date(input.asOf), canonical?.legalActNumber ?? "Acompanhamento", "Antes do acompanhamento de renúncia");
    await tx.planningRevenueWaiver.update({ where: { id: record.id }, data: { realizedValue: result.value, realizedThrough: new Date(input.asOf), originKey: contentHash(result.originIds.sort()) } });
    await planningAudit(tx, context, piece.id, "PLANNING_WAIVER_REALIZATION", { waiverId: record.id, asOf: input.asOf, value: result.value, originHash: contentHash(result.originIds.sort()) });
    if (["SANCTIONED", "PUBLISHED"].includes(canonical?.status ?? "")) await finalizeLegalRevision(tx, context, piece, new Date(input.asOf), canonical?.legalActNumber ?? "Acompanhamento", "Realizado tributário preservado");
    return record.id;
  });
}
