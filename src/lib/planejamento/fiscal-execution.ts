import "server-only";
import { and, eq, gt, gte, inArray, lte, sql } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import { withDatabaseTransaction } from "@/db/transaction";
import { planningEntityUnits } from "@/db/schema/planning-budget";
import { planningWaivers } from "@/db/schema/planning-legal";
import { planningBankAccounts } from "@/db/schema/planning-financial-sources";
import { financialYears } from "@/db/schema/finance-years";
import { monthlyAccountingCloses } from "@/db/schema/finance-accounting";
import { taxFinancialMappings } from "@/db/schema/tax-accounting";
import { taxAssessments, taxGuides } from "@/db/schema/taxation-core";
import { executionBenefitGrants } from "@/db/schema/planning-execution-operations";
import { planningInstrumentScope } from "@/db/repositories/planning/scope";
import { readRclTreasuryFacts } from "@/db/repositories/planning-execution-operations/fiscal-execution";
import type { RclReference } from "@/lib/contracts/planning-execution-operations";
import { z } from "zod";
import { AccessError, canViewModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { assertPlanningOperation, type PlanningContext } from "./access";
import { planningConnection, planningDatabase } from "./database";
import { canonicalPiece, finalizeLegalRevision, lockLegalInstrument, contentHash, planningAudit, snapshotVersion } from "./operations-core";
import { planningDateSchema } from "./revisions";

export async function readPlanningRclExecution(context: PlanningContext, entityId: string, references: RclReference[], asOf: string) {
  if (!canViewModule(context.user, "FINANCEIRO")) return { status: "RESTRICTED" as const, rows: [], total: null };
  const db = planningDatabase(context);
  const runtime = (await db.execute<{ ready: boolean }>(sql`SELECT (to_regclass('"MonthlyAccountingClose"') IS NOT NULL AND to_regclass('"TreasuryMovement"') IS NOT NULL AND to_regclass('"Revenue"') IS NOT NULL) AS ready`)).rows[0];
  if (!runtime?.ready) return { status: "UNAVAILABLE" as const, rows: [], total: null };
  planningDateSchema.parse(asOf);
  if (asOf > new Date().toISOString().slice(0, 10)) throw new Error("RCL executada não admite corte futuro.");
  const units = await db.select({ budgetUnitId: planningEntityUnits.budgetUnitId }).from(planningEntityUnits).where(eq(planningEntityUnits.governmentEntityId, entityId));
  if (!units.length || references.some(reference => !units.some(unit => unit.budgetUnitId === reference.budgetUnitId))) throw new AccessError("Composição da RCL contém unidade fora da entidade selecionada.", 403);
  if (!isSystemAdministrator(context.user) && units.some((unit) => !context.user.allowedBudgetUnitIds.includes(unit.budgetUnitId))) throw new AccessError("RCL do ente exige todas as unidades autorizadas.", 403);
  const until = new Date(`${asOf}T23:59:59.999Z`), from = new Date(Date.UTC(until.getUTCFullYear(), until.getUTCMonth() - 11, 1));
  const months = Array.from({ length: 12 }, (_, index) => new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + index, 1)));
  const completeMonth = until.getTime() === new Date(Date.UTC(until.getUTCFullYear(), until.getUTCMonth() + 1, 1) - 1).getTime();
  const years = await db.select({ id: financialYears.id, year: financialYears.year }).from(financialYears).where(and(eq(financialYears.governmentEntityId, entityId), inArray(financialYears.year, [...new Set(months.map((month) => month.getUTCFullYear()))])));
  const closes = await db.select({ competence: monthlyAccountingCloses.competence }).from(monthlyAccountingCloses).where(and(inArray(monthlyAccountingCloses.financialYearId, years.map(year => year.id)), gte(monthlyAccountingCloses.competence, from), lte(monthlyAccountingCloses.competence, until), eq(monthlyAccountingCloses.status, "FECHADO")));
  if (!completeMonth || months.some((month) => !closes.some((close) => close.competence.getTime() === month.getTime()))) return { status: "INCOMPLETE" as const, rows: months.map((month, at) => ({ competência: month.toISOString().slice(0, 7), situação: !closes.some((close) => close.competence.getTime() === month.getTime()) ? "Histórico/fechamento não confirmado" : at === months.length - 1 && !completeMonth ? "Corte não encerra competência mensal completa" : "Fechada" })), total: null };
  const facts = await readRclTreasuryFacts(db, references, from, until);
  const rows = months.map((month) => {
    const selected = facts.filter((fact) => fact.date.getUTCFullYear() === month.getUTCFullYear() && fact.date.getUTCMonth() === month.getUTCMonth());
    const amount = selected.reduce((sum, fact) => { const deduction = (fact.revenue?.classification ?? fact.revenueReversal?.revenue.classification) === "REDUTORA"; const reversal = fact.type === "RevenueReversal"; return sum.plus(fact.valueDecimal.mul((deduction ? -1 : 1) * (reversal ? -1 : 1))); }, new Decimal("0"));
    return { competência: month.toISOString().slice(0, 7), valorExecutado: amount.toFixed(2), movimentos: selected.length, memória: contentHash(selected.map((fact) => fact.id).sort()) };
  });
  return { status: "CONNECTED" as const, rows, total: rows.reduce((sum, row) => sum.plus(row.valorExecutado), new Decimal("0")).toFixed(2) };
}

export async function readPlanningWaiverRealization(context: PlanningContext, entityId: string, taxId: string | null | undefined, year: number, asOf: string) {
  if (!canViewModule(context.user, "TRIBUTACAO")) return { status: "RESTRICTED" as const, value: null, originIds: [] as string[] };
  if (!taxId) return { status: "UNMAPPED" as const, value: null, originIds: [] as string[] };
  if (asOf > new Date().toISOString().slice(0, 10) || Number(asOf.slice(0, 4)) < year) return { status: "INCOMPLETE" as const, value: null, originIds: [] as string[] };
  const db = planningDatabase(context);
  const runtime = (await db.execute<{ ready: boolean }>(sql`SELECT to_regclass('"TaxBenefitGrant"') IS NOT NULL AS ready`)).rows[0];
  if (!runtime?.ready) return { status: "UNAVAILABLE" as const, value: null, originIds: [] as string[] };
  const [mapping] = await db.select({ budgetUnitId: planningBankAccounts.budgetUnitId }).from(taxFinancialMappings).innerJoin(planningBankAccounts, eq(planningBankAccounts.id, taxFinancialMappings.defaultBankAccountId)).where(eq(taxFinancialMappings.taxId, taxId)).limit(1);
  const unitId = mapping?.budgetUnitId;
  if (!unitId || !(await db.select({ budgetUnitId: planningEntityUnits.budgetUnitId }).from(planningEntityUnits).where(and(eq(planningEntityUnits.budgetUnitId, unitId), eq(planningEntityUnits.governmentEntityId, entityId))).limit(1)).length) return { status: "UNMAPPED" as const, value: null, originIds: [] as string[] };
  if (!isSystemAdministrator(context.user) && !context.user.allowedBudgetUnitIds.includes(unitId)) throw new AccessError("Benefícios tributários fora das unidades autorizadas.", 403);
  const grants = await db.select({ id: executionBenefitGrants.id, sourceId: executionBenefitGrants.sourceId, sourceType: executionBenefitGrants.sourceType, renunciationDecimal: executionBenefitGrants.renunciationDecimal }).from(executionBenefitGrants).where(and(eq(executionBenefitGrants.status, "CONCEDIDO"), gte(executionBenefitGrants.grantedAt, new Date(`${year}-01-01`)), lte(executionBenefitGrants.grantedAt, new Date(`${asOf < `${year}-12-31` ? asOf : `${year}-12-31`}T23:59:59.999Z`)), gt(executionBenefitGrants.renunciationDecimal, new Decimal("0"))));
  let total = new Decimal("0"); const ids: string[] = [];
  for (const grant of grants) {
    let assessmentId: string | null = null;
    if (["TAX_ASSESSMENT", "ASSESSMENT", "LANCAMENTO", "LANÇAMENTO"].includes(grant.sourceType.toUpperCase())) assessmentId = grant.sourceId;
    else if (["TAX_GUIDE", "GUIDE", "GUIA"].includes(grant.sourceType.toUpperCase())) assessmentId = (await db.select({ assessmentId: taxGuides.assessmentId }).from(taxGuides).where(eq(taxGuides.id, grant.sourceId)).limit(1))[0]?.assessmentId ?? null;
    else return { status: "UNRECONCILED" as const, value: null, originIds: [] as string[] };
    const assessment = assessmentId ? (await db.select({ taxId: taxAssessments.taxId, year: taxAssessments.year }).from(taxAssessments).where(eq(taxAssessments.id, assessmentId)).limit(1))[0] : null;
    if (!assessment) return { status: "UNRECONCILED" as const, value: null, originIds: [] as string[] };
    if (assessment.taxId === taxId && assessment.year === year) { total = total.plus(grant.renunciationDecimal); ids.push(grant.id); }
  }
  return { status: "CONNECTED" as const, value: total.toFixed(2), originIds: ids };
}

export async function synchronizePlanningWaiver(context: PlanningContext, raw: unknown) {
  assertPlanningOperation(context, "update");
  const input = z.object({ waiverId: z.string().min(1), asOf: planningDateSchema }).parse(raw);
  return withDatabaseTransaction(planningConnection(context), async (tx) => {
    const [record] = await tx.select().from(planningWaivers).where(and(eq(planningWaivers.id, input.waiverId), planningInstrumentScope(context, planningWaivers.instrumentId))).limit(1);
    if (!record) throw new Error("Renúncia não encontrada neste escopo.");
    const piece = await lockLegalInstrument(tx, context, record.instrumentId);
    const result = await readPlanningWaiverRealization({ ...context, database: tx }, piece.governmentEntityId, record.taxId, record.year, input.asOf);
    if (result.status !== "CONNECTED") throw new Error(`Realizado da renúncia não apurado: ${result.status}.`);
    const canonical = canonicalPiece(piece);
    if (["SANCTIONED", "PUBLISHED"].includes(canonical?.status ?? "")) await snapshotVersion(tx, context, piece.id, new Date(input.asOf), canonical?.legalActNumber ?? "Acompanhamento", "Antes do acompanhamento de renúncia");
    await tx.update(planningWaivers).set({ realizedValue: new Decimal(result.value), realizedThrough: new Date(input.asOf), originKey: contentHash(result.originIds.sort()) }).where(eq(planningWaivers.id, record.id));
    await planningAudit(tx, context, piece.id, "PLANNING_WAIVER_REALIZATION", { waiverId: record.id, asOf: input.asOf, value: result.value, originHash: contentHash(result.originIds.sort()) });
    if (["SANCTIONED", "PUBLISHED"].includes(canonical?.status ?? "")) await finalizeLegalRevision(tx, context, piece, new Date(input.asOf), canonical?.legalActNumber ?? "Acompanhamento", "Realizado tributário preservado");
    return record.id;
  });
}
