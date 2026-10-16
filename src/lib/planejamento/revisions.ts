import "server-only";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { AccessError } from "@/lib/platform/tenant-context";
import { assertPlanningOperation, planningInstrumentWhere, planningLineWhere, type PlanningContext } from "./access";
import { moneySchema } from "./policy";
import { applyLineDelta, canonicalPiece, finalizeLegalRevision, lockLegalInstrument, planningAudit, snapshotVersion } from "./operations-core";

export const planningDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe uma data válida.").refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Informe uma data válida.");

const movementInput = z.object({
  instrumentId: z.string().min(1), lineId: z.string().min(1),
  effectiveAt: planningDateSchema, amount: moneySchema,
  direction: z.enum(["INCREASE", "DECREASE"]),
  reason: z.string().trim().min(1).max(4000), legalText: z.string().trim().min(1).max(20000),
  legalActNumber: z.string().trim().min(1).max(100), submissionKey: z.string().uuid(),
});

/** Formal financial adjustment. Original appropriations remain immutable. */
export async function registerPlanningMovement(context: PlanningContext, raw: unknown) {
  assertPlanningOperation(context, "update");
  const input = movementInput.parse(raw);
  const effectiveAt = new Date(`${input.effectiveAt}T00:00:00.000Z`);
  const value = new Prisma.Decimal(input.amount).mul(input.direction === "DECREASE" ? -1 : 1);
  if (value.isZero()) throw new Error("A alteração deve ter valor maior que zero.");
  if (input.effectiveAt > new Date().toISOString().slice(0, 10)) throw new Error("O ato deve estar vigente; não é permitido efetivar alteração futura.");
  return context.prisma.$transaction(async (tx) => {
    const instrument = await lockLegalInstrument(tx, context, input.instrumentId);
    const line = await tx.planningBudgetLine.findFirst({ where: { AND: [planningLineWhere(context), { id: input.lineId, instrumentId: instrument.id }] } });
    if (!line) throw new AccessError("Previsão não encontrada nas unidades autorizadas.", 403);
    const previous = await tx.planningLineMovement.findUnique({ where: { idempotencyKey: input.submissionKey } });
    if (previous) {
      if (previous.lineId !== line.id || !previous.value.equals(value) || previous.effectiveAt.getTime() !== effectiveAt.getTime() || previous.reason !== input.reason || previous.legalText !== input.legalText || previous.legalActNumber !== input.legalActNumber || previous.createdById !== context.user.id) throw new Error("Chave de solicitação já utilizada com outros dados.");
      return previous.id;
    }
    const status = instrument.multiYearPlan?.status ?? instrument.budgetGuideline?.status ?? instrument.annualBudgetLaw?.status;
    if (!["SANCTIONED", "PUBLISHED"].includes(status ?? "")) throw new Error("Alterações legais exigem peça sancionada ou publicada.");
    const canonical = canonicalPiece(instrument);
    if (!canonical?.sanctionedAt || input.effectiveAt < canonical.sanctionedAt.toISOString().slice(0, 10)) throw new Error("A data do ato não pode anteceder a sanção da peça; confira o registro da sanção.");
    if (effectiveAt.getUTCFullYear() > instrument.endYear) throw new Error("A data do ato deve pertencer à vigência legal da peça.");
    await snapshotVersion(tx, context, instrument.id, canonical.sanctionedAt, canonical.legalActNumber ?? input.legalActNumber, "Posição anterior à revisão");
    const movementId = await applyLineDelta(tx, context, instrument, { lineId: line.id, value, effectiveAt, reason: input.reason, legalText: input.legalText, legalActNumber: input.legalActNumber, key: input.submissionKey, allowBlocked: true });
    await finalizeLegalRevision(tx, context, instrument, effectiveAt, input.legalActNumber, input.reason);
    await planningAudit(tx, context, instrument.id, "PLANNING_LEGAL_MOVEMENT", { movementId, lineId: line.id, value: value.toFixed(2), effectiveAt: input.effectiveAt, legalActNumber: input.legalActNumber });
    return movementId;
  });
}

export async function getPlanningMovementHistory(context: PlanningContext, instrumentId: string, pageInput = "1") {
  const instrument = await context.prisma.planningInstrument.findFirst({ where: { id: instrumentId, ...planningInstrumentWhere(context) } });
  if (!instrument) throw new AccessError("Peça não encontrada neste escopo.", 404);
  const where = { line: { AND: [planningLineWhere(context), { instrumentId }] } };
  const total = await context.prisma.planningLineMovement.count({ where });
  const requested = Number(pageInput);
  const page = Math.min(Number.isSafeInteger(requested) && requested > 0 ? requested : 1, Math.max(1, Math.ceil(total / 20)));
  const records = await context.prisma.planningLineMovement.findMany({ where, include: { line: { select: { code: true, description: true } } }, orderBy: [{ effectiveAt: "desc" }, { createdAt: "desc" }, { id: "asc" }], take: 20, skip: (page - 1) * 20 });
  return { records, total, page };
}
