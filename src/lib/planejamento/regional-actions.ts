import "server-only";
import { and, eq } from "drizzle-orm";
import { planningActions, planningPrograms } from "@/db/schema/planning-legal";
import { planningInstruments } from "@/db/schema/planning-budget";
import { planningRegionalActions } from "@/db/schema/planning-regional-actions";
import { planningInstrumentScope } from "@/db/repositories/planning/scope";
import { withDatabaseTransaction } from "@/db/transaction";
import { insertAuditEvent } from "@/db/repositories/platform/audit";
import { auditEventTypes } from "@/lib/contracts/audit";
import { assertPlanningOperation, type PlanningContext } from "@/lib/planejamento/access";
import { planningConnection } from "@/lib/planejamento/database";
import { regionalActionSchema } from "@/lib/planejamento/regional-action-input";

export async function saveRegionalActionRecord(context: PlanningContext, input: unknown): Promise<void> {
  const data = regionalActionSchema.parse(input);
  const id = data.id;
  assertPlanningOperation(context, id ? "update" : "create");
  await withDatabaseTransaction(planningConnection(context), async tx => {
    const [visible] = await tx.select({ id: planningActions.id }).from(planningActions).innerJoin(planningPrograms, eq(planningPrograms.id, planningActions.programId)).innerJoin(planningInstruments, eq(planningInstruments.multiYearPlanId, planningPrograms.multiYearPlanId)).where(and(eq(planningActions.id, data.actionId), planningInstrumentScope(context))).limit(1);
    if (!visible) throw new Error("Ação fora do planejamento autorizado.");
    const values = { actionId: data.actionId, region: data.region, subactionCode: data.subactionCode, name: data.name, active: data.active };
    if (id) {
      const [updated] = await tx.update(planningRegionalActions).set(values).where(and(eq(planningRegionalActions.id, id), eq(planningRegionalActions.actionId, data.actionId))).returning({ id: planningRegionalActions.id });
      if (!updated) throw new Error("Registro regionalizado não encontrado nesta ação.");
    } else await tx.insert(planningRegionalActions).values({ ...values, createdByUsuarioId: context.user.id });
    await insertAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "PlanningRegionalAction", targetId: id ?? `${data.actionId}:${data.region}:${data.subactionCode}` });
  });
}
