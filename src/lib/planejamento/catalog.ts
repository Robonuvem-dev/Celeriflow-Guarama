import "server-only";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { assertPlanningOperation, type PlanningContext } from "./access";

const catalogInput = z.object({
  kind: z.enum(["SOURCE", "REVENUE", "EXPENSE"]), code: z.string().trim().min(1).max(60),
  name: z.string().trim().min(1).max(200), tceCode: z.string().trim().max(60).optional(),
  stnGroup: z.string().trim().max(60).optional(), stnSpecification: z.string().trim().max(60).optional(),
  stnDetail: z.string().trim().max(60).optional(), referenceYear: z.coerce.number().int().min(1900).max(2200),
  degree: z.coerce.number().int().min(1).max(10).optional(), shortCode: z.string().trim().max(60).optional(),
}).superRefine((input, ctx) => {
  if (input.kind === "SOURCE" && (!input.tceCode || !input.stnGroup || !input.stnSpecification || !input.stnDetail)) ctx.addIssue({ code: "custom", message: "Complete a classificação TCE/STN da fonte." });
  if (input.kind === "REVENUE" && (!input.degree || !input.shortCode)) ctx.addIssue({ code: "custom", message: "Complete o grau e código reduzido da receita." });
});

export async function createPlanningCatalog(context: PlanningContext, raw: unknown) {
  assertPlanningOperation(context, "create");
  const input = catalogInput.parse(raw);
  return context.prisma.$transaction(async (tx) => {
    const record = input.kind === "SOURCE"
      ? await tx.resourceSource.create({ data: { code: input.code, name: input.name, tceCode: input.tceCode, stnGroup: input.stnGroup, stnSpecification: input.stnSpecification, stnDetail: input.stnDetail, referenceYear: input.referenceYear } })
      : input.kind === "REVENUE" ? await tx.revenueNature.create({ data: { code: input.code, name: input.name, degree: input.degree, shortCode: input.shortCode, referenceYear: input.referenceYear } })
        : await tx.expenseNature.create({ data: { code: input.code, name: input.name } });
    await tx.financialAuditLog.create({ data: { authorUsuarioId: context.user.id, action: "PLANNING_CATALOG_CREATE", entityType: input.kind, entityId: record.id, payload: { code: input.code, referenceYear: input.referenceYear } } });
    return record.id;
  });
}

export async function saveRevenueAllocation(context: PlanningContext, raw: unknown) {
  assertPlanningOperation(context, "update");
  const input = z.object({ revenueNatureId: z.string().min(1), resourceSourceId: z.string().min(1), percentage: z.string().regex(/^\d{1,3}(\.\d{1,6})?$/) }).parse(raw);
  const percentage = new Prisma.Decimal(input.percentage);
  if (percentage.lessThanOrEqualTo(0) || percentage.greaterThan(100)) throw new Error("Percentual deve ser maior que zero e até 100%.");
  return context.prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "RevenueNature" WHERE id = ${input.revenueNatureId} FOR UPDATE`;
    const [nature, source, allocations] = await Promise.all([
      tx.revenueNature.findUnique({ where: { id: input.revenueNatureId } }),
      tx.resourceSource.findUnique({ where: { id: input.resourceSourceId } }),
      tx.planningRevenueAllocation.findMany({ where: { revenueNatureId: input.revenueNatureId, resourceSourceId: { not: input.resourceSourceId } } }),
    ]);
    if (!nature || !source) throw new Error("Natureza ou fonte não encontrada.");
    if (allocations.reduce((sum, row) => sum.plus(row.percentage), percentage).greaterThan(100)) throw new Error("A soma dos percentuais não pode ultrapassar 100%.");
    const record = await tx.planningRevenueAllocation.upsert({ where: { revenueNatureId_resourceSourceId: { revenueNatureId: input.revenueNatureId, resourceSourceId: input.resourceSourceId } }, create: { ...input, percentage }, update: { percentage } });
    await tx.financialAuditLog.create({ data: { authorUsuarioId: context.user.id, action: "PLANNING_ALLOCATION_SAVE", entityType: "REVENUE_NATURE", entityId: nature.id, payload: { resourceSourceId: source.id, percentage: percentage.toString() } } });
    return record.id;
  });
}
