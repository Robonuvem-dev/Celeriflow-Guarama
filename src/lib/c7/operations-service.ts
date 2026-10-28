import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseTransaction } from "@/db/transaction";
import type { JsonObject } from "@/db/json";
import { auditEventTypes } from "@/lib/contracts/audit";
import { insertAuditEvent as writeAuditEvent } from "@/db/repositories/platform/audit";
import { appendControlEvent, getControlFinding, getControlPlan, insertControlFinding, listControlEvents, lockControlFinding, lockControlPlan, requireControlFinding, requireControlPlan, unresolvedControlFindings } from "@/db/repositories/internal-control/records";
import { controlBudgetUnit, controlUnitBinding } from "@/db/repositories/internal-control/references";
import { controlFindings, controlPlans } from "@/db/schema/internal-control";
import { employees } from "@/db/schema/administration";
import { documents } from "@/db/schema/registry";
import { and, eq } from "drizzle-orm";

export class C7OperationError extends Error {}

type Actor = { usuarioId: string; allowedBudgetUnitIds?: string[] };

function assertPlanScope(actor: Actor, budgetUnitId: string | null) {
  if (actor.allowedBudgetUnitIds && (!budgetUnitId || !actor.allowedBudgetUnitIds.includes(budgetUnitId))) throw new C7OperationError("Plano de controle fora das unidades gestoras autorizadas.");
}

function required(value: string | undefined, label: string) {
  const normalized = value?.trim();
  if (!normalized) throw new C7OperationError(`${label} é obrigatório.`);
  return normalized;
}

function optionalDate(value?: Date) {
  if (!value) return undefined;
  if (Number.isNaN(value.valueOf())) throw new C7OperationError("Data inválida.");
  return value;
}

export async function createInternalControlPlan(db: DatabaseConnection, actor: Actor, input: { title: string; reference: string; dueAt?: Date; budgetUnitId?: string }) {
  const title = required(input.title, "Título do plano");
  const reference = required(input.reference, "Referência");
  const dueAt = optionalDate(input.dueAt);
  const budgetUnitId = input.budgetUnitId?.trim() || null;
  assertPlanScope(actor, budgetUnitId);
  if (!budgetUnitId) throw new C7OperationError("Selecione a unidade gestora do plano.");
  if (budgetUnitId && !await controlUnitBinding(db.db, budgetUnitId)) throw new C7OperationError("A unidade gestora do plano deve estar vinculada à entidade.");
  return withDatabaseTransaction(db, async (tx) => {
    const ownerId = required(actor.usuarioId, "Usuário responsável");
    const [plan] = await tx.insert(controlPlans).values({ title, reference, dueAt, budgetUnitId, ownerId }).returning();
    await appendControlEvent(tx, { planId: plan.id, eventType: "PLAN_CREATED", actorId: ownerId, reason: reference, snapshot: { title, reference, budgetUnitId, dueAt: dueAt?.toISOString() ?? null } });
    await writeAuditEvent(tx, { actorUsuarioId: ownerId, eventType: auditEventTypes.administrativeMutation, targetType: "INTERNAL_CONTROL_PLAN", targetId: plan.id });
    return plan;
  });
}

export async function createInternalControlFinding(db: DatabaseConnection, actor: Actor, input: { planId: string; title: string; description: string; responsibleId?: string; evidenceDocumentId?: string; dueAt?: Date }) {
  return withDatabaseTransaction(db, tx => createInternalControlFindingInTransaction(tx, actor, input));
}

export async function createInternalControlFindingInTransaction(tx: DatabaseTransaction, actor: Actor, input: { planId: string; title: string; description: string; responsibleId?: string; evidenceDocumentId?: string; dueAt?: Date }) {
  const planId = required(input.planId, "Plano de controle");
  const title = required(input.title, "Título do apontamento");
  const description = required(input.description, "Descrição do apontamento");
  const dueAt = optionalDate(input.dueAt);
  await lockControlPlan(tx, planId);
  const [plan, responsible, evidence] = await Promise.all([
    getControlPlan(tx, planId),
    input.responsibleId?.trim() ? tx.select({ id: employees.id, secretariatId: employees.secretariatId }).from(employees).where(and(eq(employees.id, input.responsibleId.trim()), eq(employees.isActive, true))).then(rows => rows[0]) : null,
    input.evidenceDocumentId?.trim() ? tx.select({ id: documents.id }).from(documents).where(and(eq(documents.id, input.evidenceDocumentId.trim()), eq(documents.status, "Válido"))).then(rows => rows[0]) : null,
  ]);
  if (!plan || plan.status !== "ABERTO") throw new C7OperationError("O apontamento exige um plano de controle aberto.");
  assertPlanScope(actor, plan.budgetUnitId);
  if (responsible && plan.budgetUnitId) {
    const unit = await controlBudgetUnit(tx, plan.budgetUnitId);
    if (responsible.secretariatId !== unit.secretariatId) throw new C7OperationError("O responsável deve pertencer à secretaria da unidade gestora do plano.");
  }
  if (input.responsibleId?.trim() && !responsible) throw new C7OperationError("Servidor responsável não encontrado ou inativo.");
  if (input.evidenceDocumentId?.trim() && !evidence) throw new C7OperationError("A evidência deve apontar para um documento GED válido.");
  const finding = await insertControlFinding(tx, { planId, title, description, dueAt, responsibleId: responsible?.id, evidenceDocumentId: evidence?.id });
  await appendControlEvent(tx, { planId, findingId: finding.id, eventType: "FINDING_CREATED", actorId: actor.usuarioId, reason: description, snapshot: { title, responsibleId: responsible?.id ?? null, evidenceDocumentId: evidence?.id ?? null, dueAt: dueAt?.toISOString() ?? null } });
  await writeAuditEvent(tx, { actorUsuarioId: required(actor.usuarioId, "Usuário responsável"), eventType: auditEventTypes.internalControlFindingRegistered, targetType: "INTERNAL_CONTROL_FINDING", targetId: finding.id });
  return finding;
}

export async function resolveInternalControlFinding(db: DatabaseConnection, actor: Actor, findingId: string, reason: string) {
  return withDatabaseTransaction(db, tx => resolveInternalControlFindingInTransaction(tx, actor, findingId, reason));
}

export async function resolveInternalControlFindingInTransaction(tx: DatabaseTransaction, actor: Actor, findingId: string, reason: string) {
  const id = required(findingId, "Apontamento");
  const justification = required(reason, "Justificativa da resolução");
  const origin = await getControlFinding(tx, id);
  if (!origin) throw new C7OperationError("Apontamento não encontrado.");
  await lockControlPlan(tx, origin.planId);
  await lockControlFinding(tx, id);
  const finding = await getControlFinding(tx, id);
  if (!finding || finding.status === "RESOLVIDO") throw new C7OperationError("Apontamento não encontrado ou já resolvido.");
  assertPlanScope(actor, finding.plan.budgetUnitId);
  if (finding.plan.status !== "ABERTO") throw new C7OperationError("A resolução exige plano aberto.");
  await assertControlNoticesReviewed(tx, finding.planId, id);
  const [resolved] = await tx.update(controlFindings).set({ status: "RESOLVIDO", resolvedAt: new Date() }).where(eq(controlFindings.id, id)).returning();
  await appendControlEvent(tx, { planId: finding.planId, findingId: id, eventType: "FINDING_RESOLVED", actorId: actor.usuarioId, reason: justification, snapshot: { previousStatus: finding.status, status: resolved.status, evidenceDocumentId: finding.evidenceDocumentId, resolvedAt: resolved.resolvedAt!.toISOString() } });
  await writeAuditEvent(tx, { actorUsuarioId: required(actor.usuarioId, "Usuário responsável"), eventType: auditEventTypes.internalControlFindingRegistered, targetType: "INTERNAL_CONTROL_FINDING", targetId: resolved.id });
  return resolved;
}

export async function transitionInternalControlPlan(db: DatabaseConnection, actor: Actor, input: { planId: string; status: "CONCLUIDO" | "ABERTO"; reason: string }) {
  return withDatabaseTransaction(db, tx => transitionInternalControlPlanInTransaction(tx, actor, input));
}

export async function transitionInternalControlPlanInTransaction(tx: DatabaseTransaction, actor: Actor, input: { planId: string; status: "CONCLUIDO" | "ABERTO"; reason: string }) {
  const planId = required(input.planId, "Plano de controle");
  const reason = required(input.reason, "Justificativa da decisão");
  if (!["CONCLUIDO", "ABERTO"].includes(input.status)) throw new C7OperationError("Decisão de plano inválida.");
  await lockControlPlan(tx, planId);
  const plan = await requireControlPlan(tx, planId);
  assertPlanScope(actor, plan.budgetUnitId);
  const expected = input.status === "CONCLUIDO" ? "ABERTO" : "CONCLUIDO";
  if (plan.status !== expected) throw new C7OperationError("O plano não está no estágio esperado para essa decisão.");
  if (input.status === "CONCLUIDO" && (await unresolvedControlFindings(tx, planId)).length) throw new C7OperationError("Resolva todos os apontamentos antes de concluir o plano.");
  if (input.status === "CONCLUIDO") {
    await assertControlNoticesReviewed(tx, planId);
    const agenda = await listControlEvents(tx, { planId, eventTypes: ["CONTROL_OBLIGATION_SCHEDULED", "CONTROL_OBLIGATION_COMPLETED"] });
    const completed = new Set(agenda.filter(event => event.eventType === "CONTROL_OBLIGATION_COMPLETED").map(event => (event.snapshot as JsonObject).obligationId));
    if (agenda.some(event => event.eventType === "CONTROL_OBLIGATION_SCHEDULED" && !completed.has(event.id))) throw new C7OperationError("Baixe as obrigações pendentes da agenda antes de concluir o plano.");
    const checklists = await listControlEvents(tx, { planId, eventTypes: ["CHECKLIST_PUBLISHED"] });
    const answers = await listControlEvents(tx, { planId, eventTypes: ["CHECKLIST_ANSWERED"] });
    const answered = new Set(answers.map(answer => (answer.snapshot as JsonObject).answerKey));
    const audits = await listControlEvents(tx, { planId, eventTypes: ["AUDIT_SCHEDULED", "AUDIT_CLOSED", "AUDIT_CANCELLED"] });
    const endedAudits = new Set(audits.filter(event => event.eventType !== "AUDIT_SCHEDULED").map(event => (event.snapshot as JsonObject).auditId));
    if (audits.some(event => event.eventType === "AUDIT_SCHEDULED" && !endedAudits.has(event.id))) throw new C7OperationError("Encerre ou cancele fundamentadamente as auditorias pendentes antes de concluir o plano.");
    const closedAudits = new Set(audits.filter(event => event.eventType === "AUDIT_CLOSED").map(event => (event.snapshot as JsonObject).auditId));
    for (const audit of audits.filter(event => event.eventType === "AUDIT_SCHEDULED" && closedAudits.has(event.id))) {
      const snapshot = audit.snapshot as JsonObject;
      if (!Array.isArray(snapshot.groups)) throw new C7OperationError("Auditoria encerrada sem questionário conciliado.");
      for (const group of snapshot.groups) if (group && typeof group === "object" && !Array.isArray(group) && Array.isArray(group.items)) {
        for (const item of group.items) if (item && typeof item === "object" && !Array.isArray(item)) answered.add(`${snapshot.checklistId}:${item.number}`);
      }
    }
    for (const checklist of checklists) {
      const groups = (checklist.snapshot as JsonObject).groups;
      if (!Array.isArray(groups)) throw new C7OperationError("Checklist sem grupos conciliados.");
      for (const group of groups) {
        if (!group || typeof group !== "object" || Array.isArray(group) || !Array.isArray(group.items)) throw new C7OperationError("Checklist sem itens conciliados.");
        for (const item of group.items) {
          if (!item || typeof item !== "object" || Array.isArray(item) || !answered.has(`${checklist.id}:${item.number}`)) throw new C7OperationError("Responda todos os itens dos checklists antes de concluir o plano.");
        }
      }
    }
  }
  const [updated] = await tx.update(controlPlans).set({ status: input.status }).where(eq(controlPlans.id, planId)).returning();
  await appendControlEvent(tx, { planId, eventType: input.status === "CONCLUIDO" ? "PLAN_COMPLETED" : "PLAN_REOPENED", actorId: actor.usuarioId, reason, snapshot: { previousStatus: plan.status, status: input.status } });
  await writeAuditEvent(tx, { actorUsuarioId: actor.usuarioId, eventType: auditEventTypes.administrativeMutation, targetType: "INTERNAL_CONTROL_PLAN", targetId: planId });
  return updated;
}

async function assertControlNoticesReviewed(tx: DatabaseTransaction, planId: string, findingId?: string) {
  const events = await listControlEvents(tx, { planId, findingId, eventTypes: ["CONTROL_NOTICE_SENT", "CONTROL_NOTICE_REVIEWED"] });
  const reviewed = new Set(events.filter(event => event.eventType === "CONTROL_NOTICE_REVIEWED").map(event => (event.snapshot as JsonObject).noticeId));
  if (events.some(event => event.eventType === "CONTROL_NOTICE_SENT" && !reviewed.has(event.id))) throw new C7OperationError("Responda e analise as notificações pendentes antes de encerrar.");
}

export async function recordInternalControlOpinion(db: DatabaseConnection, actor: Actor, input: { findingId: string; opinion: string; correctiveAction: string; recruitment: boolean; employeeId?: string }) {
  const findingId = required(input.findingId, "Apontamento");
  const opinion = required(input.opinion, "Parecer do controle");
  const correctiveAction = required(input.correctiveAction, "Providência corretiva");
  if (input.recruitment && !input.employeeId?.trim()) throw new C7OperationError("Identifique o servidor da contratação.");
  if (!input.recruitment && input.employeeId?.trim()) throw new C7OperationError("O servidor da contratação exige parecer relativo a contratação.");
  return withDatabaseTransaction(db, async (tx) => {
    const origin = await requireControlFinding(tx, findingId);
    await lockControlPlan(tx, origin.planId);
    await lockControlFinding(tx, findingId);
    const finding = await requireControlFinding(tx, findingId);
    assertPlanScope(actor, finding.plan.budgetUnitId);
    if (finding.plan.status !== "ABERTO" || finding.status === "RESOLVIDO") throw new C7OperationError("Parecer exige plano aberto e apontamento pendente ou em tratamento.");
    const employeeId = input.employeeId?.trim() || null;
    if (employeeId) {
      const [employee] = await tx.select({ secretariatId: employees.secretariatId }).from(employees).where(eq(employees.id, employeeId));
      const unit = finding.plan.budgetUnitId ? await controlBudgetUnit(tx, finding.plan.budgetUnitId) : null;
      if (!employee || !unit || employee.secretariatId !== unit.secretariatId) throw new C7OperationError("Servidor da contratação fora da unidade gestora do plano.");
    }
    const event = await appendControlEvent(tx, { planId: finding.planId, findingId, eventType: "CONTROL_OPINION", actorId: actor.usuarioId, reason: opinion, snapshot: { correctiveAction, recruitment: input.recruitment, employeeId, previousStatus: finding.status, status: "EM_TRATAMENTO" } });
    await tx.update(controlFindings).set({ status: "EM_TRATAMENTO" }).where(eq(controlFindings.id, findingId));
    await writeAuditEvent(tx, { actorUsuarioId: actor.usuarioId, eventType: auditEventTypes.administrativeMutation, targetType: "INTERNAL_CONTROL_EVENT", targetId: event.id });
    return event;
  });
}
