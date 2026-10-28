import "server-only";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { withDatabaseTransaction } from "@/db/transaction";
import { planningBudgetUnits, planningEntityUnits, planningHearings, planningInstruments } from "@/db/schema/planning-budget";
import { catalogCommunityDemands } from "@/db/schema/planning-catalog-operations";
import { financialAuditLogs } from "@/db/schema/finance-identity";
import { planningInstrumentScope, planningUnitScope } from "@/db/repositories/planning/scope";
import { lockCatalogDraftInstrument } from "@/db/repositories/planning-catalog-operations/records";
import { planningConnection } from "./database";
import { AccessError } from "@/lib/platform/tenant-context";
import { assertPlanningOperation, type PlanningContext } from "./access";

const text = z.string().trim().min(1).max(4000);
const hearingInput = z.object({ instrumentId: z.string().min(1), title: text.max(200), heldAt: z.coerce.date(), location: text.max(200), minutes: text.optional() });
const demandInput = z.object({ hearingId: z.string().min(1), requesterName: text.max(200), email: z.string().email().optional(), phone: z.string().trim().max(40).optional(), neighborhood: text.max(200), request: text, responsibleUnitId: z.string().min(1) }).refine((value) => value.email || value.phone, "Informe e-mail ou telefone de contato.");

export async function registerPlanningHearing(context: PlanningContext, raw: unknown) {
  assertPlanningOperation(context, "create");
  const input = hearingInput.parse(raw);
  return withDatabaseTransaction(planningConnection(context), async (tx) => {
    await lockCatalogDraftInstrument(tx, context, input.instrumentId);
    const [record] = await tx.insert(planningHearings).values({ ...input, createdById: context.user.id }).returning();
    await tx.insert(financialAuditLogs).values({ authorUsuarioId: context.user.id, action: "PLANNING_HEARING_CREATE", entityType: "PLANNING_HEARING", entityId: record.id, payload: { instrumentId: input.instrumentId, heldAt: input.heldAt.toISOString() } });
    return record.id;
  });
}

export async function registerCommunityDemand(context: PlanningContext, raw: unknown) {
  assertPlanningOperation(context, "create");
  const input = demandInput.parse(raw);
  return withDatabaseTransaction(planningConnection(context), async (tx) => {
    const [hearing] = await tx.select({ id: planningHearings.id, governmentEntityId: planningInstruments.governmentEntityId }).from(planningHearings).innerJoin(planningInstruments, eq(planningInstruments.id, planningHearings.instrumentId)).where(and(eq(planningHearings.id, input.hearingId), planningInstrumentScope(context))).limit(1);
    if (!hearing) throw new AccessError("Audiência não encontrada nesta entidade.", 404);
    const [unit] = await tx.select({ id: planningBudgetUnits.id }).from(planningBudgetUnits).innerJoin(planningEntityUnits, eq(planningEntityUnits.budgetUnitId, planningBudgetUnits.id)).where(and(planningUnitScope(context, planningBudgetUnits.id), eq(planningBudgetUnits.id, input.responsibleUnitId), eq(planningEntityUnits.governmentEntityId, hearing.governmentEntityId))).limit(1);
    if (!unit) throw new AccessError("Órgão responsável não autorizado nesta entidade.", 403);
    const [record] = await tx.insert(catalogCommunityDemands).values(input).returning();
    await tx.insert(financialAuditLogs).values({ authorUsuarioId: context.user.id, action: "PLANNING_DEMAND_CREATE", entityType: "PLANNING_COMMUNITY_DEMAND", entityId: record.id, payload: { hearingId: hearing.id, responsibleUnitId: unit.id } });
    return record.id;
  });
}

export async function decideCommunityDemand(context: PlanningContext, raw: unknown) {
  assertPlanningOperation(context, "update");
  const input = z.object({ demandId: z.string().min(1), status: z.enum(["ACCEPTED", "REJECTED"]), opinion: text }).parse(raw);
  return withDatabaseTransaction(planningConnection(context), async (tx) => {
    const [demand] = await tx.select({ id: catalogCommunityDemands.id }).from(catalogCommunityDemands).innerJoin(planningHearings, eq(planningHearings.id, catalogCommunityDemands.hearingId)).where(and(eq(catalogCommunityDemands.id, input.demandId), planningInstrumentScope(context, planningHearings.instrumentId), planningUnitScope(context, catalogCommunityDemands.responsibleUnitId))).limit(1);
    if (!demand) throw new AccessError("Solicitação não encontrada neste escopo.", 404);
    const result = await tx.update(catalogCommunityDemands).set({ status: input.status, opinion: input.opinion }).where(and(eq(catalogCommunityDemands.id, demand.id), eq(catalogCommunityDemands.status, "PENDING"))).returning({ id: catalogCommunityDemands.id });
    if (result.length !== 1) throw new Error("A solicitação já foi analisada. Atualize a consulta.");
    await tx.insert(financialAuditLogs).values({ authorUsuarioId: context.user.id, action: "PLANNING_DEMAND_DECIDE", entityType: "PLANNING_COMMUNITY_DEMAND", entityId: demand.id, payload: { status: input.status, opinion: input.opinion } });
    return demand.id;
  });
}
