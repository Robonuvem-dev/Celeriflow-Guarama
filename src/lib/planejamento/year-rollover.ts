import "server-only";
import { Prisma } from "@prisma/client";
import { planningInstrumentWhere, type PlanningContext } from "./access";
import { assertWholePiece, jsonValue, linePosition, type LegalInstrument, type PlanningTx } from "./operations-core";
import { planningLineClassification } from "./classification";
import { distributePlanningMonths } from "./scheduling";

/** Copies relationships and operational configuration, never prior-year execution. */
export async function copyPlanningYearConfiguration(tx: PlanningTx, context: PlanningContext, target: LegalInstrument, previousInstrumentId?: string) {
  const candidates = await tx.planningInstrument.findMany({ where: { ...planningInstrumentWhere(context), ...(previousInstrumentId ? { id: previousInstrumentId } : {}), governmentEntityId: target.governmentEntityId, kind: "LOA", startYear: target.startYear - 1, annualBudgetLaw: { is: { status: "PUBLISHED" } } }, include: { fiscalRules: true, lines: { include: { quotas: { orderBy: { month: "asc" } } } } } });
  if (candidates.length > 1) throw new Error("Mais de uma LOA publicada no exercício anterior. Reconcilie a peça de origem antes da implantação.");
  const source = candidates[0];
  if (previousInstrumentId && !source) throw new Error("Origem publicada do exercício anterior não encontrada na entidade autorizada.");
   if (!source) return { sourceId: null, configurationStatus: "FIRST_YEAR_OR_NO_PUBLISHED_PREDECESSOR", copiedRules: 0, copiedSchedules: 0, copiedSources: 0, copiedAnnualPrograms: 0, sharedCatalogs: ["GovernmentEntity", "PlanningEntityUnit", "ResourceSource", "RevenueNature", "ExpenseNature"] };
  await assertWholePiece(tx, context, source.id);
  const targetLines = await tx.planningBudgetLine.findMany({ where: { instrumentId: target.id }, include: { quotas: true } });
  const targetRules = await tx.planningFiscalRule.findMany({ where: { instrumentId: target.id } });
  let copiedRules = 0; let copiedSchedules = 0;
  let copiedSources = 0, copiedAnnualPrograms = 0;
  const bindings = await tx.planningInstrumentSource.findMany({ where: { instrumentId: source.id } });
  for (const binding of bindings) { await planningLineClassification(tx, target, { year: target.startYear, resourceSourceId: binding.resourceSourceId }); copiedSources++; }
  const annual = await tx.planningAnnualProgram.findMany({ where: { instrumentId: source.id } });
  const targetPpaId = target.parent?.parent?.multiYearPlanId;
  for (const selection of annual) {
    const original = await tx.programPPA.findUniqueOrThrow({ where: { id: selection.programId }, select: { code: true } });
    const program = await tx.programPPA.findFirst({ where: { multiYearPlanId: targetPpaId ?? "", code: original.code }, select: { id: true } });
    if (!program) throw new Error(`Mapeie o programa anual ${original.code} no PPA do novo exercício antes de implantar.`);
    await tx.planningAnnualProgram.upsert({ where: { instrumentId_programId_year: { instrumentId: target.id, programId: program.id, year: target.startYear } }, create: { instrumentId: target.id, programId: program.id, year: target.startYear, priority: selection.priority }, update: {} }); copiedAnnualPrograms++;
  }
  for (const rule of source.fiscalRules) {
    if (targetRules.some((existing) => existing.type === rule.type)) continue;
    const definition = rule.definition as { revenueCodes: string[]; expenseCodes: string[]; excludedRevenueCodes: string[]; excludedExpenseCodes: string[] };
    const required = [...definition.revenueCodes, ...definition.expenseCodes, ...definition.excludedRevenueCodes, ...definition.excludedExpenseCodes];
    if (required.some((code) => !targetLines.some((line) => line.code === code))) throw new Error(`Composição ${rule.type} da origem contém códigos ausentes no novo exercício. Compatibilize antes de implantar.`);
    await tx.planningFiscalRule.create({ data: { instrumentId: target.id, type: rule.type, normativeReference: rule.normativeReference, definition: rule.definition as Prisma.InputJsonValue, updatedById: context.user.id } });
    copiedRules++;
  }
  for (const line of targetLines) {
    if (line.quotas.length || line.kind === "TRANSFER") continue;
    const predecessor = source.lines.find((row) => row.code === line.code && row.kind === line.kind && row.budgetUnitId === line.budgetUnitId && row.resourceSourceId === line.resourceSourceId && row.expenseNatureId === line.expenseNatureId && row.revenueNatureId === line.revenueNatureId);
    if (!predecessor?.quotas.length) continue;
    if (predecessor.quotas.length !== 12) throw new Error(`Programação anterior de ${line.code} está incompleta.`);
    const calculation = predecessor.quotas[0].calculation as { weights?: string[] };
    const weights = calculation.weights?.length === 12 ? calculation.weights : predecessor.quotas.map((row) => (row.calculation as { initialPlanned?: string }).initialPlanned ?? row.planned.toString());
    const total = await linePosition(tx, line.id);
    const values = distributePlanningMonths(total.toFixed(2), weights);
    for (const [index, value] of values.entries()) await tx.planningQuota.create({ data: { lineId: line.id, kind: line.kind, month: index + 1, periodMonths: predecessor.quotas[index].periodMonths, planned: value, disbursementPlanned: line.kind === "EXPENSE" ? value : 0, method: "YEAR_ROLLOVER", calculation: jsonValue({ total: total.toFixed(2), initialPlanned: value.toFixed(2), initialDisbursement: line.kind === "EXPENSE" ? value.toFixed(2) : "0.00", sourceInstrumentId: source.id, sourceRevision: source.revision, sourceLineId: predecessor.id, sourceMethod: predecessor.quotas[index].method, weights, stage: line.kind === "EXPENSE" ? "EMPENHADA" : "ARRECADADA", disbursementStage: "PAGA", rounding: "LARGEST_REMAINDER" }) } });
    copiedSchedules++;
  }
  return { sourceId: source.id, sourceRevision: source.revision, configurationStatus: "COPIED_WITHOUT_EXECUTION", copiedRules, copiedSchedules, copiedSources, copiedAnnualPrograms, notCopied: ["Atos finais e assinaturas", "Realizados e eventos de execução", "Bloqueios/fechamentos", "Credenciais e permissões", "Renúncias/obras/memórias de outro exercício"], sharedCatalogs: ["GovernmentEntity", "PlanningEntityUnit", "ResourceSource", "RevenueNature", "ExpenseNature"] };
}
