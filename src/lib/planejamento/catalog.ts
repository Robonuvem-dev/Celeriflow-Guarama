import "server-only";
import { and, eq, ne } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import { withDatabaseTransaction } from "@/db/transaction";
import { planningExpenseNatures, planningResourceSources, planningRevenueAllocations, planningRevenueNatures } from "@/db/schema/planning-legal";
import { financialAuditLogs } from "@/db/schema/finance-identity";
import { planningConnection } from "./database";
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
  return withDatabaseTransaction(planningConnection(context), async (tx) => {
    const record = input.kind === "SOURCE"
      ? (await tx.insert(planningResourceSources).values({ code: input.code, name: input.name, tceCode: input.tceCode, stnGroup: input.stnGroup, stnSpecification: input.stnSpecification, stnDetail: input.stnDetail, referenceYear: input.referenceYear }).returning())[0]
      : input.kind === "REVENUE" ? (await tx.insert(planningRevenueNatures).values({ code: input.code, name: input.name, degree: input.degree, shortCode: input.shortCode, referenceYear: input.referenceYear }).returning())[0]
        : (await tx.insert(planningExpenseNatures).values({ code: input.code, name: input.name }).returning())[0];
    await tx.insert(financialAuditLogs).values({ authorUsuarioId: context.user.id, action: "PLANNING_CATALOG_CREATE", entityType: input.kind, entityId: record.id, payload: { code: input.code, referenceYear: input.referenceYear } });
    return record.id;
  });
}

export async function saveRevenueAllocation(context: PlanningContext, raw: unknown) {
  assertPlanningOperation(context, "update");
  const input = z.object({ revenueNatureId: z.string().min(1), resourceSourceId: z.string().min(1), percentage: z.string().regex(/^\d{1,3}(\.\d{1,6})?$/) }).parse(raw);
  const percentage = new Decimal(input.percentage);
  if (percentage.lessThanOrEqualTo(0) || percentage.greaterThan(100)) throw new Error("Percentual deve ser maior que zero e até 100%.");
  return withDatabaseTransaction(planningConnection(context), async (tx) => {
    await tx.select({ id: planningRevenueNatures.id }).from(planningRevenueNatures).where(eq(planningRevenueNatures.id, input.revenueNatureId)).for("update");
    const [nature, source, allocations] = await Promise.all([
      tx.select().from(planningRevenueNatures).where(eq(planningRevenueNatures.id, input.revenueNatureId)).limit(1).then(rows => rows[0]),
      tx.select().from(planningResourceSources).where(eq(planningResourceSources.id, input.resourceSourceId)).limit(1).then(rows => rows[0]),
      tx.select().from(planningRevenueAllocations).where(and(eq(planningRevenueAllocations.revenueNatureId, input.revenueNatureId), ne(planningRevenueAllocations.resourceSourceId, input.resourceSourceId))),
    ]);
    if (!nature || !source) throw new Error("Natureza ou fonte não encontrada.");
    if (allocations.reduce((sum, row) => sum.plus(row.percentage), percentage).greaterThan(100)) throw new Error("A soma dos percentuais não pode ultrapassar 100%.");
    const [record] = await tx.insert(planningRevenueAllocations).values({ ...input, percentage }).onConflictDoUpdate({ target: [planningRevenueAllocations.revenueNatureId, planningRevenueAllocations.resourceSourceId], set: { percentage } }).returning();
    await tx.insert(financialAuditLogs).values({ authorUsuarioId: context.user.id, action: "PLANNING_ALLOCATION_SAVE", entityType: "REVENUE_NATURE", entityId: nature.id, payload: { resourceSourceId: source.id, percentage: percentage.toString() } });
    return record.id;
  });
}
