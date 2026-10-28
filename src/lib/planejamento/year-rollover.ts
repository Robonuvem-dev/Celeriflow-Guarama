import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import { planningBudgetLaws, planningInstruments, planningLines, planningQuotas } from "@/db/schema/planning-budget";
import { planningAnnualPrograms, planningFiscalRules, planningInstrumentSources, planningPrograms } from "@/db/schema/planning-legal";
import { planningInstrumentScope } from "@/db/repositories/planning/scope";
import { rolloverFiscalDefinition, rolloverQuotaCalculation } from "@/lib/contracts/planning-execution-operations";
import type { PlanningContext } from "./access";
import { assertWholePiece, jsonValue, linePosition, type LegalInstrument, type PlanningTx } from "./operations-core";
import { planningLineClassification } from "./classification";
import { distributePlanningMonths } from "./scheduling";

/** Copies relationships and operational configuration, never prior-year execution. */
export async function copyPlanningYearConfiguration(tx: PlanningTx, context: PlanningContext, target: LegalInstrument, previousInstrumentId?: string) {
  const candidates = await tx.select({ instrument: planningInstruments }).from(planningInstruments).innerJoin(planningBudgetLaws, eq(planningBudgetLaws.id, planningInstruments.annualBudgetLawId)).where(and(planningInstrumentScope(context), previousInstrumentId ? eq(planningInstruments.id, previousInstrumentId) : undefined, eq(planningInstruments.governmentEntityId, target.governmentEntityId), eq(planningInstruments.kind, "LOA"), eq(planningInstruments.startYear, target.startYear - 1), eq(planningBudgetLaws.status, "PUBLISHED")));
  if (candidates.length > 1) throw new Error("Mais de uma LOA publicada no exercício anterior. Reconcilie a peça de origem antes da implantação.");
  const source = candidates[0]?.instrument;
  if (previousInstrumentId && !source) throw new Error("Origem publicada do exercício anterior não encontrada na entidade autorizada.");
   if (!source) return { sourceId: null, configurationStatus: "FIRST_YEAR_OR_NO_PUBLISHED_PREDECESSOR", copiedRules: 0, copiedSchedules: 0, copiedSources: 0, copiedAnnualPrograms: 0, sharedCatalogs: ["GovernmentEntity", "PlanningEntityUnit", "ResourceSource", "RevenueNature", "ExpenseNature"] };
  await assertWholePiece(tx, context, source.id);
  const withQuotas = async (instrumentId: string) => {
    const lines = await tx.select().from(planningLines).where(eq(planningLines.instrumentId, instrumentId));
    return Promise.all(lines.map(async line => ({ ...line, quotas: await tx.select().from(planningQuotas).where(eq(planningQuotas.lineId, line.id)).orderBy(asc(planningQuotas.month)) })));
  };
  const targetLines = await withQuotas(target.id);
  const sourceLines = await withQuotas(source.id);
  const sourceRules = await tx.select().from(planningFiscalRules).where(eq(planningFiscalRules.instrumentId, source.id));
  const targetRules = await tx.select().from(planningFiscalRules).where(eq(planningFiscalRules.instrumentId, target.id));
  let copiedRules = 0; let copiedSchedules = 0;
  let copiedSources = 0, copiedAnnualPrograms = 0;
  const bindings = await tx.select().from(planningInstrumentSources).where(eq(planningInstrumentSources.instrumentId, source.id));
  for (const binding of bindings) { await planningLineClassification(tx, target, { year: target.startYear, resourceSourceId: binding.resourceSourceId }); copiedSources++; }
  const annual = await tx.select().from(planningAnnualPrograms).where(eq(planningAnnualPrograms.instrumentId, source.id));
  const targetPpaId = target.parent?.parent?.multiYearPlanId;
  for (const selection of annual) {
    const [original] = await tx.select({ code: planningPrograms.code }).from(planningPrograms).where(eq(planningPrograms.id, selection.programId)).limit(1);
    if (!original) throw new Error("Programa anual de origem não encontrado.");
    const [program] = await tx.select({ id: planningPrograms.id }).from(planningPrograms).where(and(eq(planningPrograms.multiYearPlanId, targetPpaId ?? ""), eq(planningPrograms.code, original.code))).limit(1);
    if (!program) throw new Error(`Mapeie o programa anual ${original.code} no PPA do novo exercício antes de implantar.`);
    await tx.insert(planningAnnualPrograms).values({ instrumentId: target.id, programId: program.id, year: target.startYear, priority: selection.priority }).onConflictDoNothing({ target: [planningAnnualPrograms.instrumentId, planningAnnualPrograms.programId, planningAnnualPrograms.year] }); copiedAnnualPrograms++;
  }
  for (const rule of sourceRules) {
    if (targetRules.some((existing) => existing.type === rule.type)) continue;
    const definition = rolloverFiscalDefinition.parse(rule.definition);
    const required = [...definition.revenueCodes, ...definition.expenseCodes, ...definition.excludedRevenueCodes, ...definition.excludedExpenseCodes];
    if (required.some((code) => !targetLines.some((line) => line.code === code))) throw new Error(`Composição ${rule.type} da origem contém códigos ausentes no novo exercício. Compatibilize antes de implantar.`);
    await tx.insert(planningFiscalRules).values({ instrumentId: target.id, type: rule.type, normativeReference: rule.normativeReference, definition: rule.definition, updatedById: context.user.id });
    copiedRules++;
  }
  for (const line of targetLines) {
    if (line.quotas.length || line.kind === "TRANSFER") continue;
    const predecessor = sourceLines.find((row) => row.code === line.code && row.kind === line.kind && row.budgetUnitId === line.budgetUnitId && row.resourceSourceId === line.resourceSourceId && row.expenseNatureId === line.expenseNatureId && row.revenueNatureId === line.revenueNatureId);
    if (!predecessor?.quotas.length) continue;
    if (predecessor.quotas.length !== 12) throw new Error(`Programação anterior de ${line.code} está incompleta.`);
    const calculation = rolloverQuotaCalculation.parse(predecessor.quotas[0].calculation);
    const weights = calculation.weights?.length === 12 ? calculation.weights : predecessor.quotas.map((row) => rolloverQuotaCalculation.parse(row.calculation).initialPlanned ?? row.planned.toString());
    const total = await linePosition(tx, line.id);
    const values = distributePlanningMonths(total.toFixed(2), weights);
    for (const [index, value] of values.entries()) await tx.insert(planningQuotas).values({ lineId: line.id, kind: line.kind, month: index + 1, periodMonths: predecessor.quotas[index].periodMonths, planned: value, disbursementPlanned: line.kind === "EXPENSE" ? value : new Decimal("0"), method: "YEAR_ROLLOVER", calculation: jsonValue({ total: total.toFixed(2), initialPlanned: value.toFixed(2), initialDisbursement: line.kind === "EXPENSE" ? value.toFixed(2) : "0.00", sourceInstrumentId: source.id, sourceRevision: source.revision, sourceLineId: predecessor.id, sourceMethod: predecessor.quotas[index].method, weights, stage: line.kind === "EXPENSE" ? "EMPENHADA" : "ARRECADADA", disbursementStage: "PAGA", rounding: "LARGEST_REMAINDER" }) });
    copiedSchedules++;
  }
  return { sourceId: source.id, sourceRevision: source.revision, configurationStatus: "COPIED_WITHOUT_EXECUTION", copiedRules, copiedSchedules, copiedSources, copiedAnnualPrograms, notCopied: ["Atos finais e assinaturas", "Realizados e eventos de execução", "Bloqueios/fechamentos", "Credenciais e permissões", "Renúncias/obras/memórias de outro exercício"], sharedCatalogs: ["GovernmentEntity", "PlanningEntityUnit", "ResourceSource", "RevenueNature", "ExpenseNature"] };
}
