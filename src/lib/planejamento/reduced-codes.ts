import "server-only";
import { z } from "zod";
import { assertPlanningOperation, planningLineWhere, type PlanningContext } from "./access";
import { assertWholePiece, planningAudit } from "./operations-core";
import { lockPlanningInstrument } from "./service";

export async function setPlanningReducedCode(context: PlanningContext, raw: unknown) {
  assertPlanningOperation(context, "update");
  const input = z.object({ instrumentId: z.string().min(1), lineId: z.string().min(1), reducedCode: z.string().trim().min(1).max(80) }).parse(raw);
  return context.prisma.$transaction(async (tx) => {
    const piece = await lockPlanningInstrument(tx, context, input.instrumentId);
    if (piece.implantedAt) throw new Error("Códigos não podem ser alterados após implantação.");
    const line = await tx.planningBudgetLine.findFirstOrThrow({ where: { AND: [planningLineWhere(context), { id: input.lineId, instrumentId: piece.id }] } });
    await tx.planningBudgetLine.update({ where: { id: line.id }, data: { reducedCode: input.reducedCode } });
    await planningAudit(tx, context, piece.id, "PLANNING_REDUCED_CODE", input);
    return line.id;
  });
}

export async function reorderPlanningExpenseCodes(context: PlanningContext, raw: unknown) {
  assertPlanningOperation(context, "update");
  const input = z.object({ instrumentId: z.string().min(1), orderedCodes: z.string().trim().min(1), prefix: z.string().trim().regex(/^[A-Za-z0-9.-]{0,16}$/).default("D") }).parse(raw);
  const codes = input.orderedCodes.split(/[,;\s]+/).filter(Boolean);
  if (new Set(codes).size !== codes.length || codes.length > 1000) throw new Error("Informe códigos distintos, na ordem desejada.");
  return context.prisma.$transaction(async (tx) => {
    const piece = await lockPlanningInstrument(tx, context, input.instrumentId);
    await assertWholePiece(tx, context, piece.id);
    if (piece.implantedAt || await tx.planningBudgetLine.count({ where: { instrumentId: piece.id, appropriationId: { not: null } } })) throw new Error("Reordenação exige peça em elaboração e sem início de execução.");
    const lines = await tx.planningBudgetLine.findMany({ where: { instrumentId: piece.id, kind: "EXPENSE" } });
    if (lines.length !== codes.length || codes.some((code) => !lines.some((line) => line.code === code))) throw new Error("A lista deve conter todas as dotações de despesa da peça, uma única vez.");
    await tx.planningBudgetLine.updateMany({ where: { instrumentId: piece.id, kind: "EXPENSE" }, data: { reducedCode: null } });
    for (const [index, code] of codes.entries()) await tx.planningBudgetLine.update({ where: { id: lines.find((line) => line.code === code)!.id }, data: { reducedCode: `${input.prefix}${String(index + 1).padStart(6, "0")}` } });
    await planningAudit(tx, context, piece.id, "PLANNING_REORDER_REDUCED_CODES", input);
    return piece.id;
  });
}
