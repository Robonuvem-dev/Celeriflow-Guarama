import type { Prisma, PrismaClient } from "@prisma/client";
import { C7OperationError } from "./operations-service";
import { writeAuditEvent, auditEventTypes } from "@/lib/platform/audit-evidence";

type Actor = { usuarioId: string; allowedBudgetUnitIds?: string[] };
type Notice = { recipientId: string; title: string; dueAt: string; documentIds: string[]; findingId: string | null };
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const required = (value: string, label: string) => { if (!value?.trim()) throw new C7OperationError(`${label} é obrigatório.`); return value.trim(); };

export function readControlNotice(snapshot: unknown): Notice | null {
  if (!snapshot || typeof snapshot !== "object") return null;
  const item = snapshot as Record<string, unknown>;
  if (typeof item.recipientId !== "string" || typeof item.title !== "string" || typeof item.dueAt !== "string" || !Array.isArray(item.documentIds) || !item.documentIds.every(id => typeof id === "string") || !(item.findingId === null || typeof item.findingId === "string")) return null;
  return { recipientId: item.recipientId, title: item.title, dueAt: item.dueAt, documentIds: item.documentIds as string[], findingId: item.findingId };
}

async function lockPlan(tx: Prisma.TransactionClient, actor: Actor, id: string) {
  await tx.$queryRaw`SELECT id FROM "InternalControlPlan" WHERE id = ${id} FOR UPDATE`;
  const plan = await tx.internalControlPlan.findUnique({ where: { id } });
  if (!plan || plan.status !== "ABERTO" || !plan.budgetUnitId) throw new C7OperationError("A operação exige plano aberto com UG conciliada.");
  if (actor.allowedBudgetUnitIds && !actor.allowedBudgetUnitIds.includes(plan.budgetUnitId)) throw new C7OperationError("Plano fora das unidades gestoras autorizadas.");
  return plan;
}

async function documentSnapshots(tx: Prisma.TransactionClient, ids: string[]) {
  if (new Set(ids).size !== ids.length || ids.length > 20) throw new C7OperationError("Selecione até vinte documentos distintos.");
  const documents = await tx.document.findMany({ where: { id: { in: ids }, status: "Válido" }, select: { id: true, title: true, fileUrl: true, updatedAt: true } });
  if (documents.length !== ids.length) throw new C7OperationError("Todos os anexos devem ser documentos GED válidos.");
  return documents;
}

export async function sendControlNotice(db: PrismaClient, actor: Actor, input: { planId: string; findingId?: string; recipientId: string; title: string; message: string; dueAt: Date; documentIds: string[]; idempotencyKey: string }) {
  const title = required(input.title, "Título");
  const message = required(input.message, "Mensagem");
  const key = required(input.idempotencyKey, "Chave da notificação");
  if (!Number.isFinite(input.dueAt.getTime())) throw new C7OperationError("Prazo inválido.");
  return db.$transaction(async tx => {
    const plan = await lockPlan(tx, actor, input.planId);
    if (plan.ownerId !== actor.usuarioId) throw new C7OperationError("A notificação deve ser enviada pelo controlador responsável pelo plano.");
    const previous = await tx.internalControlEvent.findFirst({ where: { planId: plan.id, eventType: "CONTROL_NOTICE_SENT", snapshot: { path: ["idempotencyKey"], equals: key } } });
    if (previous) {
      const old = readControlNotice(previous.snapshot);
      if (previous.actorId !== actor.usuarioId || previous.reason !== message || !old || old.recipientId !== input.recipientId || old.title !== title || old.dueAt !== input.dueAt.toISOString() || old.findingId !== (input.findingId || null) || JSON.stringify(old.documentIds) !== JSON.stringify([...input.documentIds].sort())) throw new C7OperationError("Chave já utilizada para outra notificação.");
      return previous;
    }
    const recipient = await tx.usuario.findFirst({ where: { id: input.recipientId, ativo: true, unidadesGestoras: { some: { budgetUnitId: plan.budgetUnitId! } } }, select: { id: true, nome: true } });
    if (!recipient) throw new C7OperationError("O destinatário deve ser usuário ativo da UG do plano.");
    if (input.findingId && !await tx.internalControlFinding.findFirst({ where: { id: input.findingId, planId: plan.id, status: { not: "RESOLVIDO" } } })) throw new C7OperationError("Apontamento pendente não pertence ao plano.");
    const documents = await documentSnapshots(tx, input.documentIds);
    const snapshot = json({ recipientId: recipient.id, recipientName: recipient.nome, title, dueAt: input.dueAt.toISOString(), documentIds: [...input.documentIds].sort(), documents, findingId: input.findingId || null, idempotencyKey: key });
    if (input.dueAt < new Date()) throw new C7OperationError("O prazo de uma nova notificação não pode estar vencido.");
    const event = await tx.internalControlEvent.create({ data: { planId: plan.id, findingId: input.findingId, eventType: "CONTROL_NOTICE_SENT", actorId: actor.usuarioId, reason: message, snapshot } });
    await writeAuditEvent(tx, { actorUsuarioId: actor.usuarioId, eventType: auditEventTypes.internalNotificationCreated, targetType: "CONTROL_NOTICE", targetId: event.id });
    return event;
  });
}

export async function respondControlNotice(db: PrismaClient, actor: Actor, input: { noticeId: string; response: string; documentIds: string[] }) {
  const response = required(input.response, "Resposta");
  return db.$transaction(async tx => {
    const notice = await tx.internalControlEvent.findUnique({ where: { id: input.noticeId } });
    const data = notice?.eventType === "CONTROL_NOTICE_SENT" ? readControlNotice(notice.snapshot) : null;
    if (!notice || !data || data.recipientId !== actor.usuarioId) throw new C7OperationError("Somente o destinatário pode responder à notificação.");
    await lockPlan(tx, actor, notice.planId);
    const prior = await tx.internalControlEvent.findFirst({ where: { planId: notice.planId, eventType: "CONTROL_NOTICE_RESPONDED", snapshot: { path: ["noticeId"], equals: notice.id } } });
    if (prior) {
      const old = prior.snapshot as Prisma.JsonObject;
      if (prior.reason !== response || JSON.stringify(old.documentIds) !== JSON.stringify([...input.documentIds].sort())) throw new C7OperationError("Resposta já registrada; uma nova solicitação exige outra notificação.");
      return prior;
    }
    const documents = await documentSnapshots(tx, input.documentIds);
    const event = await tx.internalControlEvent.create({ data: { planId: notice.planId, findingId: notice.findingId, eventType: "CONTROL_NOTICE_RESPONDED", actorId: actor.usuarioId, reason: response, snapshot: json({ noticeId: notice.id, recipientId: actor.usuarioId, documentIds: [...input.documentIds].sort(), documents, respondedLate: new Date() > new Date(data.dueAt) }) } });
    await writeAuditEvent(tx, { actorUsuarioId: actor.usuarioId, eventType: auditEventTypes.administrativeMutation, targetType: "CONTROL_NOTICE_RESPONSE", targetId: event.id });
    return event;
  });
}

export async function reviewControlNoticeResponse(db: PrismaClient, actor: Actor, input: { noticeId: string; accepted: boolean; reason: string }) {
  const reason = required(input.reason, "Análise da resposta");
  if (typeof input.accepted !== "boolean") throw new C7OperationError("Informe a decisão da análise.");
  return db.$transaction(async tx => {
    const notice = await tx.internalControlEvent.findUnique({ where: { id: input.noticeId } });
    const data = notice?.eventType === "CONTROL_NOTICE_SENT" ? readControlNotice(notice.snapshot) : null;
    if (!notice || !data) throw new C7OperationError("Notificação não encontrada.");
    const plan = await lockPlan(tx, actor, notice.planId);
    if (plan.ownerId !== actor.usuarioId && notice.actorId !== actor.usuarioId) throw new C7OperationError("A análise exige o controlador do plano ou remetente da notificação.");
    if (data.recipientId === actor.usuarioId) throw new C7OperationError("O destinatário não pode analisar sua própria resposta.");
    const response = await tx.internalControlEvent.findFirst({ where: { planId: notice.planId, eventType: "CONTROL_NOTICE_RESPONDED", snapshot: { path: ["noticeId"], equals: notice.id } } });
    if (!response) throw new C7OperationError("Aguarde a resposta do destinatário.");
    const previous = await tx.internalControlEvent.findFirst({ where: { planId: notice.planId, eventType: "CONTROL_NOTICE_REVIEWED", snapshot: { path: ["noticeId"], equals: notice.id } } });
    if (previous) {
      if (previous.reason !== reason || (previous.snapshot as Prisma.JsonObject).accepted !== input.accepted) throw new C7OperationError("Resposta já analisada; preserve a decisão e emita nova notificação.");
      return previous;
    }
    const event = await tx.internalControlEvent.create({ data: { planId: notice.planId, findingId: notice.findingId, eventType: "CONTROL_NOTICE_REVIEWED", actorId: actor.usuarioId, reason, snapshot: { noticeId: notice.id, responseId: response.id, accepted: input.accepted } } });
    await writeAuditEvent(tx, { actorUsuarioId: actor.usuarioId, eventType: auditEventTypes.administrativeMutation, targetType: "CONTROL_NOTICE_REVIEW", targetId: event.id });
    return event;
  });
}
