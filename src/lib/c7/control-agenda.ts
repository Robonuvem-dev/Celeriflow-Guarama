import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseExecutor, type DatabaseTransaction } from "@/db/transaction";
import type { JsonObject } from "@/db/json";
import { appendControlEvent, firstControlEvent, getControlEvent, getControlPlan, listControlEvents, listControlPlans, lockControlPlan } from "@/db/repositories/internal-control/records";
import { controlAgendaRecipients, controlBudgetUnit, controlCostCenter, controlCurrentCenters, controlUnitUsers } from "@/db/repositories/internal-control/references";
import { C7OperationError } from "./operations-service";
import { auditEventTypes } from "@/lib/contracts/audit";
import { insertAuditEvent as writeAuditEvent } from "@/db/repositories/platform/audit";

type Actor = { usuarioId: string; allowedBudgetUnitIds?: string[] };
export type ControlObligation = { title: string; description: string; dueAt: string; criticality: "BAIXA" | "MEDIA" | "ALTA"; alertDays: number; expirationDays: number; viewerIds: string[]; closerIds: string[]; costCenterId: string | null };
const day = 86400000;

export function readControlObligation(snapshot: unknown): ControlObligation | null {
  if (!snapshot || typeof snapshot !== "object") return null;
  const data = snapshot as Record<string, unknown>;
  if (typeof data.title !== "string" || typeof data.description !== "string" || typeof data.dueAt !== "string" || !Number.isFinite(new Date(data.dueAt).getTime()) || !["BAIXA", "MEDIA", "ALTA"].includes(String(data.criticality)) || !Number.isSafeInteger(data.alertDays) || !Number.isSafeInteger(data.expirationDays) || !Array.isArray(data.viewerIds) || !data.viewerIds.every(id => typeof id === "string") || !Array.isArray(data.closerIds) || !data.closerIds.every(id => typeof id === "string") || !(data.costCenterId === null || typeof data.costCenterId === "string")) return null;
  return data as unknown as ControlObligation;
}

async function planForAgenda(tx: DatabaseTransaction, actor: Actor, planId: string, open: boolean) {
  await lockControlPlan(tx, planId);
  const plan = await getControlPlan(tx, planId);
  if (!plan?.budgetUnitId || (open && plan.status !== "ABERTO")) throw new C7OperationError("Agenda exige plano com UG conciliada e aberto para alterações.");
  if (actor.allowedBudgetUnitIds && !actor.allowedBudgetUnitIds.includes(plan.budgetUnitId)) throw new C7OperationError("Agenda fora das unidades gestoras autorizadas.");
  return plan;
}

export async function scheduleControlObligation(db: DatabaseConnection, actor: Actor, input: { planId: string; title: string; description: string; dueAt: Date; criticality: "BAIXA" | "MEDIA" | "ALTA"; alertDays: number; expirationDays: number; viewerIds: string[]; closerIds: string[]; costCenterId?: string; idempotencyKey: string }) {
  if (!input.title?.trim() || !input.description?.trim() || !input.idempotencyKey?.trim() || !Number.isFinite(input.dueAt.getTime())) throw new C7OperationError("Informe título, descrição, prazo e chave da obrigação.");
  if (!["BAIXA", "MEDIA", "ALTA"].includes(input.criticality) || !Number.isSafeInteger(input.alertDays) || input.alertDays < 0 || input.alertDays > 365 || !Number.isSafeInteger(input.expirationDays) || input.expirationDays < 0 || input.expirationDays > 365) throw new C7OperationError("Criticidade ou prazos da agenda inválidos (0 a 365 dias).");
  if (!input.closerIds.length || new Set(input.closerIds).size !== input.closerIds.length || new Set(input.viewerIds).size !== input.viewerIds.length) throw new C7OperationError("Defina responsáveis pela baixa e selecione usuários sem duplicidade.");
  return withDatabaseTransaction(db, async tx => {
    const plan = await planForAgenda(tx, actor, input.planId, true);
    if (plan.ownerId !== actor.usuarioId) throw new C7OperationError("Somente o controlador do plano pode agendar obrigações.");
    const ids = [...new Set([...input.viewerIds, ...input.closerIds])].sort();
    const users = await controlUnitUsers(tx, plan.budgetUnitId!, ids);
    if (users.length !== ids.length) throw new C7OperationError("Todos os usuários devem estar ativos e vinculados à UG do plano.");
    if (input.costCenterId) {
      const [center, unit] = await Promise.all([controlCostCenter(tx, input.costCenterId), controlBudgetUnit(tx, plan.budgetUnitId!)]);
      if (!center?.isActive || !unit.planningEntityUnit || center.governmentEntityId !== unit.planningEntityUnit.governmentEntityId || center.secretariatId !== unit.secretariatId) throw new C7OperationError("Centro de custo deve estar ativo e conciliado à entidade e secretaria da UG.");
    }
    const snapshot = { title: input.title.trim(), description: input.description.trim(), dueAt: input.dueAt.toISOString(), criticality: input.criticality, alertDays: input.alertDays, expirationDays: input.expirationDays, viewerIds: [...input.viewerIds].sort(), closerIds: [...input.closerIds].sort(), costCenterId: input.costCenterId || null, idempotencyKey: input.idempotencyKey.trim() };
    const prior = await firstControlEvent(tx, { planId: plan.id, eventTypes: ["CONTROL_OBLIGATION_SCHEDULED"], snapshotKey: "idempotencyKey", snapshotValue: snapshot.idempotencyKey });
    if (prior) {
      const old = readControlObligation(prior.snapshot);
      if (!old || Object.entries(snapshot).some(([key, value]) => JSON.stringify((prior.snapshot as JsonObject)[key]) !== JSON.stringify(value))) throw new C7OperationError("Chave da obrigação já usada com outros dados.");
      return prior;
    }
    if (input.dueAt < new Date()) throw new C7OperationError("O prazo de uma nova obrigação deve ser futuro.");
    const event = await appendControlEvent(tx, { planId: plan.id, eventType: "CONTROL_OBLIGATION_SCHEDULED", actorId: actor.usuarioId, reason: snapshot.description, snapshot });
    await writeAuditEvent(tx, { actorUsuarioId: actor.usuarioId, eventType: auditEventTypes.administrativeMutation, targetType: "CONTROL_OBLIGATION", targetId: event.id });
    return event;
  });
}

export async function completeControlObligation(db: DatabaseConnection, actor: Actor, input: { obligationId: string; reason: string }) {
  return withDatabaseTransaction(db, async tx => {
    const event = await getControlEvent(tx, input.obligationId);
    const obligation = event?.eventType === "CONTROL_OBLIGATION_SCHEDULED" ? readControlObligation(event.snapshot) : null;
    if (!event || !obligation || !obligation.closerIds.includes(actor.usuarioId)) throw new C7OperationError("Somente usuários designados podem baixar a obrigação.");
    await planForAgenda(tx, actor, event.planId, true);
    const overdue = new Date() > new Date(new Date(obligation.dueAt).getTime() + obligation.expirationDays * day);
    const reason = input.reason?.trim() ?? "";
    const prior = await firstControlEvent(tx, { planId: event.planId, eventTypes: ["CONTROL_OBLIGATION_COMPLETED"], snapshotKey: "obligationId", snapshotValue: event.id });
    if (prior) {
      if (prior.actorId !== actor.usuarioId || prior.reason !== reason) throw new C7OperationError("Obrigação já baixada com outros dados.");
      return prior;
    }
    if ((obligation.criticality !== "BAIXA" || overdue) && !reason) throw new C7OperationError("A criticidade ou atraso exige justificativa da baixa.");
    const completion = await appendControlEvent(tx, { planId: event.planId, eventType: "CONTROL_OBLIGATION_COMPLETED", actorId: actor.usuarioId, reason, snapshot: { obligationId: event.id, criticality: obligation.criticality, completedLate: overdue } });
    await writeAuditEvent(tx, { actorUsuarioId: actor.usuarioId, eventType: auditEventTypes.administrativeMutation, targetType: "CONTROL_OBLIGATION", targetId: event.id });
    return completion;
  });
}

export async function runControlAgendaAlerts(db: DatabaseConnection, actor: Actor, planId: string) {
  return withDatabaseTransaction(db, async tx => {
    const plan = await planForAgenda(tx, actor, planId, true);
    if (plan.ownerId !== actor.usuarioId) throw new C7OperationError("Alertas devem ser processados pelo controlador do plano.");
    const now = new Date();
    const events = await listControlEvents(tx, { planId, eventTypes: ["CONTROL_OBLIGATION_SCHEDULED", "CONTROL_OBLIGATION_COMPLETED", "CONTROL_OBLIGATION_ALERTED"] });
    const done = new Set(events.filter(event => event.eventType === "CONTROL_OBLIGATION_COMPLETED").map(event => (event.snapshot as JsonObject).obligationId));
    const created = [];
    for (const event of events.filter(event => event.eventType === "CONTROL_OBLIGATION_SCHEDULED" && !done.has(event.id))) {
      const obligation = readControlObligation(event.snapshot);
      if (!obligation) throw new C7OperationError("Obrigação sem memória conciliada.");
      const due = new Date(obligation.dueAt).getTime();
      const phase = now.getTime() > due + obligation.expirationDays * day ? "EXPIRED" : now.getTime() >= due - obligation.alertDays * day ? "DUE_SOON" : null;
      if (!phase) continue;
      const recipients = await controlAgendaRecipients(tx, plan.budgetUnitId!, [...obligation.viewerIds, ...obligation.closerIds], obligation.costCenterId, now);
      for (const recipient of recipients) {
        const alertKey = `${event.id}:${phase}:${recipient.id}`;
        if (events.some(item => item.eventType === "CONTROL_OBLIGATION_ALERTED" && (item.snapshot as JsonObject).alertKey === alertKey)) continue;
        const alert = await appendControlEvent(tx, { planId, eventType: "CONTROL_OBLIGATION_ALERTED", actorId: actor.usuarioId, reason: `${phase === "EXPIRED" ? "Obrigação expirada" : "Obrigação a vencer"}: ${obligation.title}`, snapshot: { obligationId: event.id, recipientId: recipient.id, alertKey, phase, dueAt: obligation.dueAt, criticality: obligation.criticality } });
        await writeAuditEvent(tx, { actorUsuarioId: actor.usuarioId, eventType: auditEventTypes.internalNotificationCreated, targetType: "CONTROL_AGENDA_ALERT", targetId: alert.id });
        created.push(alert);
      }
    }
    return created;
  });
}

export async function readControlAgenda(db: DatabaseExecutor, actor: Actor) {
  const now = new Date();
  const [plans, currentCenters] = await Promise.all([
    listControlPlans(db, { allowedBudgetUnitIds: actor.allowedBudgetUnitIds }),
    controlCurrentCenters(db, actor.usuarioId, now),
  ]);
  const centers = new Set(currentCenters);
  return plans.flatMap(plan => plan.events.filter(event => event.eventType === "CONTROL_OBLIGATION_SCHEDULED").flatMap(event => {
    const obligation = readControlObligation(event.snapshot);
    if (!obligation || !(plan.ownerId === actor.usuarioId || obligation.viewerIds.includes(actor.usuarioId) || obligation.closerIds.includes(actor.usuarioId) || (obligation.costCenterId && centers.has(obligation.costCenterId)))) return [];
    const completion = plan.events.find(item => item.eventType === "CONTROL_OBLIGATION_COMPLETED" && (item.snapshot as JsonObject).obligationId === event.id);
    const alerts = plan.events.filter(item => item.eventType === "CONTROL_OBLIGATION_ALERTED" && (item.snapshot as JsonObject).obligationId === event.id && (item.snapshot as JsonObject).recipientId === actor.usuarioId);
    return [{ ...obligation, id: event.id, planId: plan.id, planTitle: plan.title, planStatus: plan.status, canComplete: obligation.closerIds.includes(actor.usuarioId), completion: completion ? { at: completion.createdAt.toISOString(), reason: completion.reason, actorId: completion.actorId } : null, alerts: alerts.map(alert => ({ id: alert.id, message: alert.reason, at: alert.createdAt.toISOString() })) }];
  }));
}
