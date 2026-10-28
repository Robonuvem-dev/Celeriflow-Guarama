import "server-only";
import { z } from "zod";
import { and, eq, isNotNull } from "drizzle-orm";
import { withDatabaseTransaction } from "@/db/transaction";
import { planningLines } from "@/db/schema/planning-budget";
import { lockCatalogDraftInstrument, requireCatalogLine } from "@/db/repositories/planning-catalog-operations/records";
import { planningConnection } from "./database";
import { assertPlanningOperation, type PlanningContext } from "./access";
import { assertWholePiece, planningAudit } from "./operations-core";

export async function setPlanningReducedCode(context: PlanningContext, raw: unknown) {
  assertPlanningOperation(context, "update");
  const input = z.object({ instrumentId: z.string().min(1), lineId: z.string().min(1), reducedCode: z.string().trim().min(1).max(80) }).parse(raw);
  return withDatabaseTransaction(planningConnection(context), async (tx) => {
    const piece = await lockCatalogDraftInstrument(tx, context, input.instrumentId);
    if (piece.implantedAt) throw new Error("Códigos não podem ser alterados após implantação.");
    const line = await requireCatalogLine(tx, context, and(eq(planningLines.id, input.lineId), eq(planningLines.instrumentId, piece.id))!);
    await tx.update(planningLines).set({ reducedCode: input.reducedCode }).where(eq(planningLines.id, line.id));
    await planningAudit(tx, context, piece.id, "PLANNING_REDUCED_CODE", input);
    return line.id;
  });
}

export async function reorderPlanningExpenseCodes(context: PlanningContext, raw: unknown) {
  assertPlanningOperation(context, "update");
  const input = z.object({ instrumentId: z.string().min(1), orderedCodes: z.string().trim().min(1), prefix: z.string().trim().regex(/^[A-Za-z0-9.-]{0,16}$/).default("D") }).parse(raw);
  const codes = input.orderedCodes.split(/[,;\s]+/).filter(Boolean);
  if (new Set(codes).size !== codes.length || codes.length > 1000) throw new Error("Informe códigos distintos, na ordem desejada.");
  return withDatabaseTransaction(planningConnection(context), async (tx) => {
    const piece = await lockCatalogDraftInstrument(tx, context, input.instrumentId);
    await assertWholePiece(tx, context, piece.id);
    if (piece.implantedAt || (await tx.select({ id: planningLines.id }).from(planningLines).where(and(eq(planningLines.instrumentId, piece.id), isNotNull(planningLines.appropriationId))).limit(1)).length) throw new Error("Reordenação exige peça em elaboração e sem início de execução.");
    const lines = await tx.select().from(planningLines).where(and(eq(planningLines.instrumentId, piece.id), eq(planningLines.kind, "EXPENSE")));
    if (lines.length !== codes.length || codes.some((code) => !lines.some((line) => line.code === code))) throw new Error("A lista deve conter todas as dotações de despesa da peça, uma única vez.");
    await tx.update(planningLines).set({ reducedCode: null }).where(and(eq(planningLines.instrumentId, piece.id), eq(planningLines.kind, "EXPENSE")));
    for (const [index, code] of codes.entries()) await tx.update(planningLines).set({ reducedCode: `${input.prefix}${String(index + 1).padStart(6, "0")}` }).where(eq(planningLines.id, lines.find((line) => line.code === code)!.id));
    await planningAudit(tx, context, piece.id, "PLANNING_REORDER_REDUCED_CODES", input);
    return piece.id;
  });
}
