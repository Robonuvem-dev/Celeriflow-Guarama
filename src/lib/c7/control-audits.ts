import { createHash } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { C7OperationError } from "./operations-service";
import { readControlChecklist, type ControlChecklistGroup } from "./control-checklists";
import { writeAuditEvent, auditEventTypes } from "@/lib/platform/audit-evidence";

type Actor = { usuarioId: string; allowedBudgetUnitIds?: string[] };
type Event = { id: string; eventType: string; actorId: string; reason: string; snapshot: Prisma.JsonValue; createdAt: Date };
export type ControlAudit = { title: string; description: string; checklistId: string; originAuditId: string | null; startAt: string; endAt: string; responseDueAt: string; auditorId: string; recipientId: string; costCenterId: string; groups: ControlChecklistGroup[] };
export type AuditAnswer = { number: number; response: string; reason: string };
export type AuditAnalysis = { number: number; conclusion: "REGULAR" | "IRREGULAR"; reason: string; correctiveAction?: string };
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const memory = (value: Prisma.JsonValue) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const text = (value: string, label: string) => { if (!value?.trim()) throw new C7OperationError(`${label} é obrigatório.`); return value.trim(); };

export function readControlAudit(snapshot: unknown): ControlAudit | null {
  if (!snapshot || typeof snapshot !== "object") return null;
  const value = snapshot as Record<string, unknown>;
  if (["title", "description", "checklistId", "auditorId", "recipientId", "costCenterId"].some(key => typeof value[key] !== "string") || ["startAt", "endAt", "responseDueAt"].some(key => typeof value[key] !== "string" || !Number.isFinite(new Date(value[key] as string).getTime()))) return null;
  const checklist = readControlChecklist({ title: value.title, category: "AUDIT", groups: value.groups });
  if (!checklist || !(value.originAuditId === null || typeof value.originAuditId === "string")) return null;
  return { ...value, groups: checklist.groups } as ControlAudit;
}

export function controlAuditPosition(auditId: string, events: Event[]) {
  const related = events.filter(event => ["AUDIT_SENT", "AUDIT_RESPONSE", "AUDIT_REVIEW", "AUDIT_CLOSED", "AUDIT_CANCELLED"].includes(event.eventType) && memory(event.snapshot).auditId === auditId).sort((a, b) => Number(memory(a.snapshot).sequence ?? 0) - Number(memory(b.snapshot).sequence ?? 0) || a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
  const latest = related.at(-1);
  const status = !latest ? "SCHEDULED" : latest.eventType === "AUDIT_SENT" ? "SENT" : latest.eventType === "AUDIT_RESPONSE" ? "ANSWERED" : latest.eventType === "AUDIT_REVIEW" ? memory(latest.snapshot).accepted === true ? "REVIEWED" : "RETURNED" : latest.eventType === "AUDIT_CLOSED" ? "CLOSED" : latest.eventType === "AUDIT_CANCELLED" ? "CANCELLED" : "SCHEDULED";
  return { status, related, latest, response: related.filter(event => event.eventType === "AUDIT_RESPONSE").at(-1), review: related.filter(event => event.eventType === "AUDIT_REVIEW").at(-1), sent: related.find(event => event.eventType === "AUDIT_SENT") };
}

async function planFor(tx: Prisma.TransactionClient, actor: Actor, planId: string) {
  await tx.$queryRaw`SELECT id FROM "InternalControlPlan" WHERE id=${planId} FOR UPDATE`;
  const plan = await tx.internalControlPlan.findUnique({ where: { id: planId } });
  if (!plan?.budgetUnitId || plan.status !== "ABERTO" || (actor.allowedBudgetUnitIds && !actor.allowedBudgetUnitIds.includes(plan.budgetUnitId))) throw new C7OperationError("Auditoria exige plano aberto com UG autorizada.");
  return plan;
}

async function documentsFor(tx: Prisma.TransactionClient, ids: string[]) {
  if (!Array.isArray(ids) || ids.length > 20 || new Set(ids).size !== ids.length) throw new C7OperationError("Selecione até vinte anexos GED distintos.");
  const documents = await tx.document.findMany({ where: { id: { in: ids }, status: "Válido" }, select: { id: true, title: true, fileUrl: true, updatedAt: true } });
  if (documents.length !== ids.length) throw new C7OperationError("Anexos da auditoria devem ser documentos GED válidos.");
  return documents;
}

async function replayFor(tx: Prisma.TransactionClient, planId: string, key: string, requestHash: string) {
  const previous = await tx.internalControlEvent.findFirst({ where: { planId, eventType: { in: ["AUDIT_SCHEDULED", "AUDIT_SENT", "AUDIT_RESPONSE", "AUDIT_REVIEW", "AUDIT_CLOSED", "AUDIT_CANCELLED"] }, snapshot: { path: ["idempotencyKey"], equals: key } } });
  if (previous && memory(previous.snapshot).requestHash !== requestHash) throw new C7OperationError("Chave da auditoria já utilizada com outro comando/conteúdo.");
  return previous;
}

export async function scheduleControlAudit(db: PrismaClient, actor: Actor, input: { planId: string; checklistId: string; originAuditId?: string; selectedNumbers: number[]; title: string; description: string; startAt: Date; endAt: Date; responseDueAt: Date; auditorId: string; recipientId: string; costCenterId: string; documentIds: string[]; idempotencyKey: string }) {
  const title = text(input.title, "Título"), description = text(input.description, "Descrição"), key = text(input.idempotencyKey, "Chave da auditoria");
  if (![input.startAt, input.endAt, input.responseDueAt].every(date => Number.isFinite(date.getTime())) || input.startAt > input.endAt || input.endAt > input.responseDueAt) throw new C7OperationError("Datas da auditoria devem respeitar início, fim e prazo de resposta.");
  if (!input.selectedNumbers?.length || new Set(input.selectedNumbers).size !== input.selectedNumbers.length || input.auditorId === input.recipientId) throw new C7OperationError("Selecione itens distintos e auditor independente do destinatário.");
  return db.$transaction(async tx => {
    const plan = await planFor(tx, actor, input.planId);
    if (plan.ownerId !== actor.usuarioId) throw new C7OperationError("Somente o controlador do plano pode agendar/duplicar auditorias.");
    const requestHash = hash({ command: "SCHEDULE", ...input, title, description, idempotencyKey: key, actorId: actor.usuarioId, selectedNumbers: [...input.selectedNumbers].sort((a, b) => a - b), documentIds: [...input.documentIds].sort() });
    const replay = await replayFor(tx, plan.id, key, requestHash); if (replay) return replay;
    const edition = await tx.internalControlEvent.findUnique({ where: { id: input.checklistId }, include: { plan: true } });
    const checklist = edition?.eventType === "CHECKLIST_PUBLISHED" ? readControlChecklist(edition.snapshot) : null;
    const [unit, sourceUnit, users, center] = await Promise.all([
      tx.budgetUnit.findUniqueOrThrow({ where: { id: plan.budgetUnitId! }, include: { planningEntityUnit: true } }),
      edition?.plan.budgetUnitId ? tx.planningEntityUnit.findUnique({ where: { budgetUnitId: edition.plan.budgetUnitId } }) : null,
      tx.usuario.findMany({ where: { id: { in: [input.auditorId, input.recipientId] }, ativo: true, unidadesGestoras: { some: { budgetUnitId: plan.budgetUnitId! } } }, select: { id: true } }),
      tx.costCenter.findUnique({ where: { id: input.costCenterId } }),
    ]);
    if (!checklist || !edition || !sourceUnit || !unit.planningEntityUnit || sourceUnit.governmentEntityId !== unit.planningEntityUnit.governmentEntityId || (actor.allowedBudgetUnitIds && !actor.allowedBudgetUnitIds.includes(sourceUnit.budgetUnitId))) throw new C7OperationError("Checklist de origem deve pertencer à mesma entidade e ao escopo autorizado.");
    if (users.length !== 2 || !center?.isActive || center.governmentEntityId !== unit.planningEntityUnit.governmentEntityId || center.secretariatId !== unit.secretariatId) throw new C7OperationError("Auditor, destinatário e centro devem estar ativos e conciliados à UG/ente.");
    if (input.selectedNumbers.some(number => !checklist.groups.some(group => group.items.some(item => item.number === number)))) throw new C7OperationError("Item selecionado não pertence à edição de origem.");
    let originHash: string | null = null;
    if (input.originAuditId) {
      const origin = await tx.internalControlEvent.findUnique({ where: { id: input.originAuditId } });
      const original = origin?.eventType === "AUDIT_SCHEDULED" ? readControlAudit(origin.snapshot) : null;
      if (!origin || origin.planId !== plan.id || !original || original.checklistId !== input.checklistId || input.selectedNumbers.some(number => !original.groups.some(group => group.items.some(item => item.number === number)))) throw new C7OperationError("Duplicação deve selecionar itens da auditoria original do plano.");
      originHash = hash(origin.snapshot);
    }
    const documents = await documentsFor(tx, input.documentIds);
    const event = await tx.internalControlEvent.create({ data: { planId: plan.id, eventType: "AUDIT_SCHEDULED", actorId: actor.usuarioId, reason: description, snapshot: json({ title, description, checklistId: edition.id, originAuditId: input.originAuditId ?? null, originHash, startAt: input.startAt.toISOString(), endAt: input.endAt.toISOString(), responseDueAt: input.responseDueAt.toISOString(), auditorId: input.auditorId, recipientId: input.recipientId, costCenterId: center.id, groups: checklist.groups.map(group => ({ ...group, items: group.items.filter(item => input.selectedNumbers.includes(item.number)) })).filter(group => group.items.length), sourceChecklistHash: hash(edition.snapshot), documents, idempotencyKey: key, requestHash }) } });
    await writeAuditEvent(tx, { actorUsuarioId: actor.usuarioId, eventType: auditEventTypes.administrativeMutation, targetType: "CONTROL_AUDIT", targetId: event.id });
    return event;
  });
}

async function auditFor(tx: Prisma.TransactionClient, actor: Actor, auditId: string) {
  const event = await tx.internalControlEvent.findUnique({ where: { id: auditId } });
  const audit = event?.eventType === "AUDIT_SCHEDULED" ? readControlAudit(event.snapshot) : null;
  if (!event || !audit) throw new C7OperationError("Auditoria agendada não encontrada.");
  const plan = await planFor(tx, actor, event.planId);
  const events = await tx.internalControlEvent.findMany({ where: { planId: event.planId, snapshot: { path: ["auditId"], equals: event.id } } });
  return { event, audit, plan, position: controlAuditPosition(event.id, events) };
}

async function persist(tx: Prisma.TransactionClient, actor: Actor, origin: Awaited<ReturnType<typeof auditFor>>, eventType: string, reason: string, key: string, requestHash: string, extra: Record<string, unknown>) {
  const event = await tx.internalControlEvent.create({ data: { planId: origin.plan.id, eventType, actorId: actor.usuarioId, reason, snapshot: json({ auditId: origin.event.id, sequence: origin.position.related.length + 1, idempotencyKey: key, requestHash, ...extra }) } });
  await writeAuditEvent(tx, { actorUsuarioId: actor.usuarioId, eventType: auditEventTypes.administrativeMutation, targetType: "CONTROL_AUDIT_EVENT", targetId: event.id });
  return event;
}

export async function sendControlAudit(db: PrismaClient, actor: Actor, input: { auditId: string; reason: string; idempotencyKey: string }) {
  return db.$transaction(async tx => {
    const origin = await auditFor(tx, actor, input.auditId);
    if (![origin.plan.ownerId, origin.audit.auditorId].includes(actor.usuarioId)) throw new C7OperationError("Envio exige controlador ou auditor designado.");
    const reason = text(input.reason, "Fundamento do envio"), key = text(input.idempotencyKey, "Chave do envio"), requestHash = hash({ command: "SEND", ...input, reason, actorId: actor.usuarioId });
    const replay = await replayFor(tx, origin.plan.id, key, requestHash); if (replay) return replay;
    if (origin.position.status !== "SCHEDULED") throw new C7OperationError("Somente auditoria agendada pode ser enviada.");
    if (new Date(origin.audit.responseDueAt) < new Date()) throw new C7OperationError("O prazo da auditoria está vencido; cancele e agende novo ciclo com prazo adequado.");
    const recipient = await tx.usuario.count({ where: { id: origin.audit.recipientId, ativo: true, unidadesGestoras: { some: { budgetUnitId: origin.plan.budgetUnitId! } } } });
    if (!recipient) throw new C7OperationError("Destinatário não está mais ativo na UG.");
    const diagnostics: Array<{ number: number; rule: string; response: string; sourceIds: string[]; irregularSourceIds: string[] }> = [];
    for (const group of origin.audit.groups) for (const item of group.items.filter(item => item.diagnosticRule)) {
      const accounts = await tx.bankAccount.findMany({ where: { budgetUnitId: origin.plan.budgetUnitId!, isActive: true }, select: { id: true, resourceSourceId: true }, orderBy: { id: "asc" } });
      if (!accounts.length) throw new C7OperationError("Item automático sem contas bancárias na UG; selecione itens aplicáveis ou configure a origem antes do envio.");
      const missing = accounts.filter(account => !account.resourceSourceId).map(account => account.id);
      diagnostics.push({ number: item.number, rule: item.diagnosticRule!, response: missing.length ? group.irregularResponse : group.responses[0], sourceIds: accounts.map(account => account.id), irregularSourceIds: missing });
    }
    return persist(tx, actor, origin, "AUDIT_SENT", reason, key, requestHash, { recipientId: origin.audit.recipientId, responseDueAt: origin.audit.responseDueAt, diagnostics });
  });
}

export async function respondControlAudit(db: PrismaClient, actor: Actor, input: { auditId: string; answers: AuditAnswer[]; documentIds: string[]; idempotencyKey: string }) {
  return db.$transaction(async tx => {
    const origin = await auditFor(tx, actor, input.auditId);
    if (origin.audit.recipientId !== actor.usuarioId) throw new C7OperationError("Somente o destinatário designado responde à auditoria.");
    const key = text(input.idempotencyKey, "Chave da resposta"), requestHash = hash({ command: "RESPOND", ...input, answers: [...input.answers].sort((a, b) => a.number - b.number), documentIds: [...input.documentIds].sort(), actorId: actor.usuarioId });
    const replay = await replayFor(tx, origin.plan.id, key, requestHash); if (replay) return replay;
    if (!["SENT", "RETURNED"].includes(origin.position.status)) throw new C7OperationError("Resposta exige auditoria enviada ou devolvida para reapresentação.");
    const manual = origin.audit.groups.flatMap(group => group.items.filter(item => !item.diagnosticRule).map(item => ({ group, item })));
    if (input.answers.length !== manual.length || new Set(input.answers.map(answer => answer.number)).size !== input.answers.length) throw new C7OperationError("Responda uma vez cada item manual selecionado.");
    for (const answer of input.answers) {
      const entry = manual.find(entry => entry.item.number === answer.number);
      if (!entry || !entry.group.responses.includes(answer.response) || !answer.reason?.trim()) throw new C7OperationError("Resposta/pergunta inválida ou sem fundamento.");
    }
    const documents = await documentsFor(tx, input.documentIds);
    return persist(tx, actor, origin, "AUDIT_RESPONSE", "Questionário respondido pelo destinatário", key, requestHash, { answers: input.answers.map(answer => ({ ...answer, reason: answer.reason.trim() })), documents, supersedesResponseId: origin.position.response?.id ?? null, submittedLate: new Date() > new Date(origin.audit.responseDueAt) });
  });
}

export async function reviewControlAudit(db: PrismaClient, actor: Actor, input: { auditId: string; accepted: boolean; reason: string; analyses: AuditAnalysis[]; documentIds: string[]; idempotencyKey: string }) {
  return db.$transaction(async tx => {
    const origin = await auditFor(tx, actor, input.auditId);
    if (origin.audit.auditorId !== actor.usuarioId || origin.audit.recipientId === actor.usuarioId) throw new C7OperationError("Análise exige auditor designado independente do destinatário.");
    const reason = text(input.reason, "Parecer da análise"), key = text(input.idempotencyKey, "Chave da análise"), requestHash = hash({ command: "REVIEW", ...input, reason, analyses: [...input.analyses].sort((a, b) => a.number - b.number), documentIds: [...input.documentIds].sort(), actorId: actor.usuarioId });
    const replay = await replayFor(tx, origin.plan.id, key, requestHash); if (replay) return replay;
    if (origin.position.status !== "ANSWERED" || !origin.position.response) throw new C7OperationError("Analise a resposta mais recente da auditoria.");
    if (typeof input.accepted !== "boolean") throw new C7OperationError("Informe a decisão da análise.");
    const items = origin.audit.groups.flatMap(group => group.items.map(item => ({ group, item })));
    if (new Set(input.analyses.map(analysis => analysis.number)).size !== input.analyses.length || (input.accepted && input.analyses.length !== items.length)) throw new C7OperationError("A análise aceita exige conclusão fundamentada de todos os itens, sem repetição.");
    const diagnostics = memory(origin.position.sent!.snapshot).diagnostics;
    const findings: Array<{ number: number; findingId: string }> = [];
    for (const analysis of input.analyses) {
      const entry = items.find(entry => entry.item.number === analysis.number);
      if (!entry || !["REGULAR", "IRREGULAR"].includes(analysis.conclusion) || !analysis.reason?.trim() || (analysis.conclusion === "IRREGULAR" && !analysis.correctiveAction?.trim())) throw new C7OperationError("Análise exige item válido, conclusão, parecer e providência para irregularidades.");
      if (entry.item.diagnosticRule && input.accepted) {
        const diagnostic = Array.isArray(diagnostics) ? diagnostics.find(value => value && typeof value === "object" && !Array.isArray(value) && value.number === analysis.number) : null;
        if (!diagnostic || typeof diagnostic !== "object" || Array.isArray(diagnostic) || (diagnostic.response === entry.group.irregularResponse) !== (analysis.conclusion === "IRREGULAR")) throw new C7OperationError("Conclusão automática deve corresponder à evidência congelada do envio.");
      }
      if (input.accepted && analysis.conclusion === "IRREGULAR") {
        const finding = await tx.internalControlFinding.create({ data: { planId: origin.plan.id, title: `${analysis.number}. ${entry.item.question}`, description: analysis.reason.trim(), status: "EM_TRATAMENTO", dueAt: new Date(origin.audit.responseDueAt) } });
        await tx.internalControlEvent.create({ data: { planId: origin.plan.id, findingId: finding.id, eventType: "CONTROL_OPINION", actorId: actor.usuarioId, reason: analysis.reason.trim(), snapshot: { auditId: origin.event.id, correctiveAction: analysis.correctiveAction!.trim(), number: analysis.number } } });
        findings.push({ number: analysis.number, findingId: finding.id });
      }
    }
    const documents = await documentsFor(tx, input.documentIds);
    return persist(tx, actor, origin, "AUDIT_REVIEW", reason, key, requestHash, { accepted: input.accepted, responseId: origin.position.response.id, analyses: input.analyses, documents, findings });
  });
}

export async function transitionControlAudit(db: PrismaClient, actor: Actor, input: { auditId: string; decision: "CLOSE" | "CANCEL"; reason: string; idempotencyKey: string }) {
  return db.$transaction(async tx => {
    const origin = await auditFor(tx, actor, input.auditId);
    if (![origin.audit.auditorId, origin.plan.ownerId].includes(actor.usuarioId) || actor.usuarioId === origin.audit.recipientId) throw new C7OperationError("Decisão exige auditor/controlador independente do destinatário.");
    const reason = text(input.reason, "Justificativa da decisão"), key = text(input.idempotencyKey, "Chave da decisão"), requestHash = hash({ command: "TRANSITION", ...input, reason, actorId: actor.usuarioId });
    const replay = await replayFor(tx, origin.plan.id, key, requestHash); if (replay) return replay;
    if (!["CLOSE", "CANCEL"].includes(input.decision) || ["CLOSED", "CANCELLED"].includes(origin.position.status)) throw new C7OperationError("Auditoria já encerrada/cancelada ou decisão inválida.");
    if (input.decision === "CLOSE") {
      if (origin.position.status !== "REVIEWED") throw new C7OperationError("Encerramento exige análise aceita da última resposta.");
      const findings = origin.position.related.filter(event => event.eventType === "AUDIT_REVIEW").flatMap(event => { const values = memory(event.snapshot).findings; return Array.isArray(values) ? values.flatMap(value => value && typeof value === "object" && !Array.isArray(value) && typeof value.findingId === "string" ? [value.findingId] : []) : []; });
      if (findings.length && await tx.internalControlFinding.count({ where: { id: { in: findings }, status: { not: "RESOLVIDO" } } })) throw new C7OperationError("Regularize os apontamentos da auditoria antes de encerrar.");
    }
    return persist(tx, actor, origin, input.decision === "CLOSE" ? "AUDIT_CLOSED" : "AUDIT_CANCELLED", reason, key, requestHash, { previousStatus: origin.position.status });
  });
}
