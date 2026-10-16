import "server-only";
import { z } from "zod";
import { AccessError } from "@/lib/platform/tenant-context";
import { assertPlanningOperation, planningInstrumentWhere, planningUnitWhere, type PlanningContext } from "./access";
import { lockPlanningInstrument } from "./service";

const text = z.string().trim().min(1).max(4000);
const hearingInput = z.object({ instrumentId: z.string().min(1), title: text.max(200), heldAt: z.coerce.date(), location: text.max(200), minutes: text.optional() });
const demandInput = z.object({ hearingId: z.string().min(1), requesterName: text.max(200), email: z.string().email().optional(), phone: z.string().trim().max(40).optional(), neighborhood: text.max(200), request: text, responsibleUnitId: z.string().min(1) }).refine((value) => value.email || value.phone, "Informe e-mail ou telefone de contato.");

export async function registerPlanningHearing(context: PlanningContext, raw: unknown) {
  assertPlanningOperation(context, "create");
  const input = hearingInput.parse(raw);
  return context.prisma.$transaction(async (tx) => {
    await lockPlanningInstrument(tx, context, input.instrumentId);
    const record = await tx.planningHearing.create({ data: { ...input, createdById: context.user.id } });
    await tx.financialAuditLog.create({ data: { authorUsuarioId: context.user.id, action: "PLANNING_HEARING_CREATE", entityType: "PLANNING_HEARING", entityId: record.id, payload: { instrumentId: input.instrumentId, heldAt: input.heldAt.toISOString() } } });
    return record.id;
  });
}

export async function registerCommunityDemand(context: PlanningContext, raw: unknown) {
  assertPlanningOperation(context, "create");
  const input = demandInput.parse(raw);
  return context.prisma.$transaction(async (tx) => {
    const hearing = await tx.planningHearing.findFirst({ where: { id: input.hearingId, instrument: planningInstrumentWhere(context) }, include: { instrument: true } });
    if (!hearing) throw new AccessError("Audiência não encontrada nesta entidade.", 404);
    const unit = await tx.budgetUnit.findFirst({ where: { AND: [planningUnitWhere(context), { id: input.responsibleUnitId, planningEntityUnit: { is: { governmentEntityId: hearing.instrument.governmentEntityId } } }] } });
    if (!unit) throw new AccessError("Órgão responsável não autorizado nesta entidade.", 403);
    const record = await tx.planningCommunityDemand.create({ data: input });
    await tx.financialAuditLog.create({ data: { authorUsuarioId: context.user.id, action: "PLANNING_DEMAND_CREATE", entityType: "PLANNING_COMMUNITY_DEMAND", entityId: record.id, payload: { hearingId: hearing.id, responsibleUnitId: unit.id } } });
    return record.id;
  });
}

export async function decideCommunityDemand(context: PlanningContext, raw: unknown) {
  assertPlanningOperation(context, "update");
  const input = z.object({ demandId: z.string().min(1), status: z.enum(["ACCEPTED", "REJECTED"]), opinion: text }).parse(raw);
  return context.prisma.$transaction(async (tx) => {
    const demand = await tx.planningCommunityDemand.findFirst({ where: { id: input.demandId, hearing: { instrument: planningInstrumentWhere(context) }, responsibleUnit: planningUnitWhere(context) } });
    if (!demand) throw new AccessError("Solicitação não encontrada neste escopo.", 404);
    const result = await tx.planningCommunityDemand.updateMany({ where: { id: demand.id, status: "PENDING" }, data: { status: input.status, opinion: input.opinion } });
    if (result.count !== 1) throw new Error("A solicitação já foi analisada. Atualize a consulta.");
    await tx.financialAuditLog.create({ data: { authorUsuarioId: context.user.id, action: "PLANNING_DEMAND_DECIDE", entityType: "PLANNING_COMMUNITY_DEMAND", entityId: demand.id, payload: { status: input.status, opinion: input.opinion } } });
    return demand.id;
  });
}
