import "server-only";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { assertPlanningLegalAuthority, planningLineWhere, type PlanningContext } from "./access";
import { contentHash, jsonValue, linePosition, lockLegalInstrument, planningAudit } from "./operations-core";

/** Binds an unlinked canonical appropriation without recreating balances or execution. */
export async function reconcilePlanningLegacyAppropriation(context: PlanningContext, raw: unknown) {
  assertPlanningLegalAuthority(context);
  const input = z.object({ instrumentId: z.string().min(1), lineId: z.string().min(1), appropriationId: z.string().min(1), reason: z.string().trim().min(1).max(4000), accountingEvidence: z.string().trim().min(1).max(4000) }).parse(raw);
  return context.prisma.$transaction(async (tx) => {
    const piece = await lockLegalInstrument(tx, context, input.instrumentId);
    if (!piece.annualBudgetLaw) throw new Error("Reconciliação de dotações exige LOA.");
    const line = await tx.planningBudgetLine.findFirstOrThrow({ where: { AND: [planningLineWhere(context), { id: input.lineId, instrumentId: piece.id, kind: "EXPENSE" }] } });
    const prior = await tx.planningIntegrationCommand.findUnique({ where: { idempotencyKey: `legacy-binding:${line.id}` } });
    if (prior) { const payload = prior.payload as { inputHash: string }; if (payload.inputHash !== contentHash(input)) throw new Error("Reconciliação já registrada com outros dados."); return line.id; }
    if (piece.implantedAt || line.appropriationId) throw new Error("A vinculação deve ocorrer antes da implantação e sem substituir dotação já associada.");
    await tx.$queryRaw`SELECT id FROM "BudgetAppropriation" WHERE id=${input.appropriationId} FOR UPDATE`;
    const legacy = await tx.budgetAppropriation.findFirst({ where: { id: input.appropriationId, financialYearId: piece.annualBudgetLaw.financialYearId, budgetUnitId: line.budgetUnitId }, include: { planningLine: true } });
    if (!legacy || legacy.planningLine || legacy.expenseNatureId !== line.expenseNatureId || legacy.resourceSourceId !== line.resourceSourceId || legacy.programPPAId && legacy.programPPAId !== line.programId || legacy.actionPPAId && legacy.actionPPAId !== line.actionId) throw new Error("Dotação legada incompatível com entidade, exercício, classificação ou cadeia do PPA.");
    const original = legacy.initialValueDecimal ?? new Prisma.Decimal(legacy.initialValue);
    const updated = legacy.updatedValueDecimal ?? new Prisma.Decimal(legacy.updatedValue);
    const committed = legacy.committedValueDecimal ?? new Prisma.Decimal(legacy.committedValue);
    if (!original.equals(line.originalValue) || !updated.equals(await linePosition(tx, line.id))) throw new Error("Valores originais/atualizados divergem. Importe e reconcilie o histórico antes de vincular; saldos não serão inferidos ou sobrescritos.");
    const fixation = await tx.annualBudgetExpenseFixation.findFirstOrThrow({ where: { annualBudgetLawId: piece.annualBudgetLaw.id, code: line.code } });
    if (legacy.annualBudgetExpenseFixationId && legacy.annualBudgetExpenseFixationId !== fixation.id) throw new Error("Dotação já vinculada a outra fixação legal; adote a peça canônica de origem antes de reconciliar.");
    await tx.budgetAppropriation.update({ where: { id: legacy.id }, data: { annualBudgetExpenseFixationId: fixation.id, programPPAId: line.programId, actionPPAId: line.actionId, initialValueDecimal: original, updatedValueDecimal: updated, committedValueDecimal: committed } });
    await tx.planningBudgetLine.update({ where: { id: line.id }, data: { appropriationId: legacy.id } });
    await tx.planningIntegrationCommand.create({ data: { type: "LEGACY_BUDGET_BINDING_VERIFICATION", sourceId: line.id, idempotencyKey: `legacy-binding:${line.id}`, payload: jsonValue({ instrumentId: piece.id, lineId: line.id, appropriationId: legacy.id, original: original.toFixed(2), updated: updated.toFixed(2), committed: committed.toFixed(2), accountingEvidence: input.accountingEvidence, inputHash: contentHash(input), status: "ASSOCIATED_ACCOUNTING_VERIFICATION_PENDING" }) } });
    await planningAudit(tx, context, piece.id, "PLANNING_LEGACY_BIND", input);
    return line.id;
  });
}
