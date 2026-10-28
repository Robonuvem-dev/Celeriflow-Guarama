import "server-only";
import { and, eq } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import { withDatabaseTransaction } from "@/db/transaction";
import { planningAppropriations, planningLines } from "@/db/schema/planning-budget";
import { planningFixations, planningIntegrationCommands } from "@/db/schema/planning-legal";
import { requireCatalogLine } from "@/db/repositories/planning-catalog-operations/records";
import { planningConnection } from "./database";
import { z } from "zod";
import { assertPlanningLegalAuthority, type PlanningContext } from "./access";
import { contentHash, jsonValue, linePosition, lockLegalInstrument, planningAudit } from "./operations-core";

/** Binds an unlinked canonical appropriation without recreating balances or execution. */
export async function reconcilePlanningLegacyAppropriation(context: PlanningContext, raw: unknown) {
  assertPlanningLegalAuthority(context);
  const input = z.object({ instrumentId: z.string().min(1), lineId: z.string().min(1), appropriationId: z.string().min(1), reason: z.string().trim().min(1).max(4000), accountingEvidence: z.string().trim().min(1).max(4000) }).parse(raw);
  return withDatabaseTransaction(planningConnection(context), async (tx) => {
    const piece = await lockLegalInstrument(tx, context, input.instrumentId);
    if (!piece.annualBudgetLaw) throw new Error("Reconciliação de dotações exige LOA.");
    const line = await requireCatalogLine(tx, context, and(eq(planningLines.id, input.lineId), eq(planningLines.instrumentId, piece.id), eq(planningLines.kind, "EXPENSE"))!);
    const [prior] = await tx.select().from(planningIntegrationCommands).where(eq(planningIntegrationCommands.idempotencyKey, `legacy-binding:${line.id}`)).limit(1);
    if (prior) { const payload = prior.payload; if (!payload || typeof payload !== "object" || Array.isArray(payload) || payload.inputHash !== contentHash(input)) throw new Error("Reconciliação já registrada com outros dados."); return line.id; }
    if (piece.implantedAt || line.appropriationId) throw new Error("A vinculação deve ocorrer antes da implantação e sem substituir dotação já associada.");
    await tx.select({ id: planningAppropriations.id }).from(planningAppropriations).where(eq(planningAppropriations.id, input.appropriationId)).for("update");
    const [legacy] = await tx.select().from(planningAppropriations).where(and(eq(planningAppropriations.id, input.appropriationId), eq(planningAppropriations.financialYearId, piece.annualBudgetLaw.financialYearId), eq(planningAppropriations.budgetUnitId, line.budgetUnitId))).limit(1);
    const [linked] = await tx.select({ id: planningLines.id }).from(planningLines).where(eq(planningLines.appropriationId, input.appropriationId)).limit(1);
    if (!legacy || linked || legacy.expenseNatureId !== line.expenseNatureId || legacy.resourceSourceId !== line.resourceSourceId || legacy.programPPAId && legacy.programPPAId !== line.programId || legacy.actionPPAId && legacy.actionPPAId !== line.actionId) throw new Error("Dotação legada incompatível com entidade, exercício, classificação ou cadeia do PPA.");
    const original = legacy.initialValueDecimal ?? new Decimal(legacy.initialValue);
    const updated = legacy.updatedValueDecimal ?? new Decimal(legacy.updatedValue);
    const committed = legacy.committedValueDecimal ?? new Decimal(legacy.committedValue);
    if (!original.equals(line.originalValue) || !updated.equals(await linePosition(tx, line.id))) throw new Error("Valores originais/atualizados divergem. Importe e reconcilie o histórico antes de vincular; saldos não serão inferidos ou sobrescritos.");
    const [fixation] = await tx.select().from(planningFixations).where(and(eq(planningFixations.annualBudgetLawId, piece.annualBudgetLaw.id), eq(planningFixations.code, line.code))).limit(1);
    if (!fixation) throw new Error("Fixação legal não encontrada.");
    if (legacy.annualBudgetExpenseFixationId && legacy.annualBudgetExpenseFixationId !== fixation.id) throw new Error("Dotação já vinculada a outra fixação legal; adote a peça canônica de origem antes de reconciliar.");
    await tx.update(planningAppropriations).set({ annualBudgetExpenseFixationId: fixation.id, programPPAId: line.programId, actionPPAId: line.actionId, initialValueDecimal: original, updatedValueDecimal: updated, committedValueDecimal: committed }).where(eq(planningAppropriations.id, legacy.id));
    await tx.update(planningLines).set({ appropriationId: legacy.id }).where(eq(planningLines.id, line.id));
    await tx.insert(planningIntegrationCommands).values({ type: "LEGACY_BUDGET_BINDING_VERIFICATION", sourceId: line.id, idempotencyKey: `legacy-binding:${line.id}`, payload: jsonValue({ instrumentId: piece.id, lineId: line.id, appropriationId: legacy.id, original: original.toFixed(2), updated: updated.toFixed(2), committed: committed.toFixed(2), accountingEvidence: input.accountingEvidence, inputHash: contentHash(input), status: "ASSOCIATED_ACCOUNTING_VERIFICATION_PENDING" }) });
    await planningAudit(tx, context, piece.id, "PLANNING_LEGACY_BIND", input);
    return line.id;
  });
}
