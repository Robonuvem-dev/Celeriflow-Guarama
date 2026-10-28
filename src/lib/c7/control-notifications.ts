import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseTransaction } from "@/db/transaction";
import type { JsonObject, JsonValue } from "@/db/json";
import { appendControlEvent, firstControlEvent, getControlEvent, getControlFinding, getControlPlan, lockControlPlan } from "@/db/repositories/internal-control/records";
import { controlDocumentSnapshots, controlUnitUsers } from "@/db/repositories/internal-control/references";
import { C7OperationError } from "./operations-service";
import { auditEventTypes } from "@/lib/contracts/audit";
import { insertAuditEvent as writeAuditEvent } from "@/db/repositories/platform/audit";

type Actor = { usuarioId: string; allowedBudgetUnitIds?: string[] };
type Notice = { recipientId: string; title: string; dueAt: string; documentIds: string[]; findingId: string | null };
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as JsonValue;
const required = (value: string, label: string) => { if (!value?.trim()) throw new C7OperationError(`${label} é obrigatório.`); return value.trim(); };

export function readControlNotice(snapshot: unknown): Notice | null {
  if (!snapshot || typeof snapshot !== "object") return null;
  const item = snapshot as Record<string, unknown>;
  if (typeof item.recipientId !== "string" || typeof item.title !== "string" || typeof item.dueAt !== "string" || !Array.isArray(item.documentIds) || !item.documentIds.every(id => typeof id === "string") || !(item.findingId === null || typeof item.findingId === "string")) return null;
  return { recipientId: item.recipientId, title: item.title, dueAt: item.dueAt, documentIds: item.documentIds as string[], findingId: item.findingId };
}

async function lockPlan(tx: DatabaseTransaction, actor: Actor, id: string) {
  await lockControlPlan(tx, id);
  const plan = await getControlPlan(tx, id);
  if (!plan || plan.status !== "ABERTO" || !plan.budgetUnitId) throw new C7OperationError("A operação exige plano aberto com UG conciliada.");
  if (actor.allowedBudgetUnitIds && !actor.allowedBudgetUnitIds.includes(plan.budgetUnitId)) throw new C7OperationError("Plano fora das unidades gestoras autorizadas.");
  return plan;
}

async function documentSnapshots(tx: DatabaseTransaction, ids: string[]) {
  if (new Set(ids).size !== ids.length || ids.length > 20) throw new C7OperationError("Selecione até vinte documentos distintos.");
  const documents = await controlDocumentSnapshots(tx, ids);
  if (documents.length !== ids.length) throw new C7OperationError("Todos os anexos devem ser documentos GED válidos.");
  return documents;
}

export async function sendControlNotice(db: DatabaseConnection, actor: Actor, input: { planId: string; findingId?: string; recipientId: string; title: string; message: string; dueAt: Date; documentIds: string[]; idempotencyKey: string }) {
  return withDatabaseTransaction(db, tx => sendControlNoticeInTransaction(tx, actor, input));
}

export async function sendControlNoticeInTransaction(tx: DatabaseTransaction, actor: Actor, input: { planId: string; findingId?: string; recipientId: string; title: string; message: string; dueAt: Date; documentIds: string[]; idempotencyKey: string }) {
  const title = required(input.title, "Título");
  const message = required(input.message, "Mensagem");
  const key = required(input.idempotencyKey, "Chave da notificação");
  if (!Number.isFinite(input.dueAt.getTime())) throw new C7OperationError("Prazo inválido.");
  const plan = await lockPlan(tx, actor, input.planId);
  if (plan.ownerId !== actor.usuarioId) throw new C7OperationError("A notificação deve ser enviada pelo controlador responsável pelo plano.");
  const previous = await firstControlEvent(tx, { planId: plan.id, eventTypes: ["CONTROL_NOTICE_SENT"], snapshotKey: "idempotencyKey", snapshotValue: key });
  if (previous) {
    const old = readControlNotice(previous.snapshot);
    if (previous.actorId !== actor.usuarioId || previous.reason !== message || !old || old.recipientId !== input.recipientId || old.title !== title || old.dueAt !== input.dueAt.toISOString() || old.findingId !== (input.findingId || null) || JSON.stringify(old.documentIds) !== JSON.stringify([...input.documentIds].sort())) throw new C7OperationError("Chave já utilizada para outra notificação.");
    return previous;
  }
  const [recipient] = await controlUnitUsers(tx, plan.budgetUnitId!, [input.recipientId]);
  if (!recipient) throw new C7OperationError("O destinatário deve ser usuário ativo da UG do plano.");
  const finding = input.findingId ? await getControlFinding(tx, input.findingId) : null;
  if (input.findingId && (!finding || finding.planId !== plan.id || finding.status === "RESOLVIDO")) throw new C7OperationError("Apontamento pendente não pertence ao plano.");
  const documents = await documentSnapshots(tx, input.documentIds);
  const snapshot = json({ recipientId: recipient.id, recipientName: recipient.nome, title, dueAt: input.dueAt.toISOString(), documentIds: [...input.documentIds].sort(), documents, findingId: input.findingId || null, idempotencyKey: key });
  if (input.dueAt < new Date()) throw new C7OperationError("O prazo de uma nova notificação não pode estar vencido.");
  const event = await appendControlEvent(tx, { planId: plan.id, findingId: input.findingId, eventType: "CONTROL_NOTICE_SENT", actorId: actor.usuarioId, reason: message, snapshot });
  await writeAuditEvent(tx, { actorUsuarioId: actor.usuarioId, eventType: auditEventTypes.internalNotificationCreated, targetType: "CONTROL_NOTICE", targetId: event.id });
  return event;
}

export async function respondControlNotice(db: DatabaseConnection, actor: Actor, input: { noticeId: string; response: string; documentIds: string[] }) {
  return withDatabaseTransaction(db, tx => respondControlNoticeInTransaction(tx, actor, input));
}

export async function respondControlNoticeInTransaction(tx: DatabaseTransaction, actor: Actor, input: { noticeId: string; response: string; documentIds: string[] }) {
  const response = required(input.response, "Resposta");
  const notice = await getControlEvent(tx, input.noticeId);
  const data = notice?.eventType === "CONTROL_NOTICE_SENT" ? readControlNotice(notice.snapshot) : null;
  if (!notice || !data || data.recipientId !== actor.usuarioId) throw new C7OperationError("Somente o destinatário pode responder à notificação.");
  await lockPlan(tx, actor, notice.planId);
  const prior = await firstControlEvent(tx, { planId: notice.planId, eventTypes: ["CONTROL_NOTICE_RESPONDED"], snapshotKey: "noticeId", snapshotValue: notice.id });
  if (prior) {
    const old = prior.snapshot as JsonObject;
    if (prior.reason !== response || JSON.stringify(old.documentIds) !== JSON.stringify([...input.documentIds].sort())) throw new C7OperationError("Resposta já registrada; uma nova solicitação exige outra notificação.");
    return prior;
  }
  const documents = await documentSnapshots(tx, input.documentIds);
  const event = await appendControlEvent(tx, { planId: notice.planId, findingId: notice.findingId, eventType: "CONTROL_NOTICE_RESPONDED", actorId: actor.usuarioId, reason: response, snapshot: json({ noticeId: notice.id, recipientId: actor.usuarioId, documentIds: [...input.documentIds].sort(), documents, respondedLate: new Date() > new Date(data.dueAt) }) });
  await writeAuditEvent(tx, { actorUsuarioId: actor.usuarioId, eventType: auditEventTypes.administrativeMutation, targetType: "CONTROL_NOTICE_RESPONSE", targetId: event.id });
  return event;
}

export async function reviewControlNoticeResponse(db: DatabaseConnection, actor: Actor, input: { noticeId: string; accepted: boolean; reason: string }) {
  return withDatabaseTransaction(db, tx => reviewControlNoticeResponseInTransaction(tx, actor, input));
}

export async function reviewControlNoticeResponseInTransaction(tx: DatabaseTransaction, actor: Actor, input: { noticeId: string; accepted: boolean; reason: string }) {
  const reason = required(input.reason, "Análise da resposta");
  if (typeof input.accepted !== "boolean") throw new C7OperationError("Informe a decisão da análise.");
  const notice = await getControlEvent(tx, input.noticeId);
  const data = notice?.eventType === "CONTROL_NOTICE_SENT" ? readControlNotice(notice.snapshot) : null;
  if (!notice || !data) throw new C7OperationError("Notificação não encontrada.");
  const plan = await lockPlan(tx, actor, notice.planId);
  if (plan.ownerId !== actor.usuarioId && notice.actorId !== actor.usuarioId) throw new C7OperationError("A análise exige o controlador do plano ou remetente da notificação.");
  if (data.recipientId === actor.usuarioId) throw new C7OperationError("O destinatário não pode analisar sua própria resposta.");
  const response = await firstControlEvent(tx, { planId: notice.planId, eventTypes: ["CONTROL_NOTICE_RESPONDED"], snapshotKey: "noticeId", snapshotValue: notice.id });
  if (!response) throw new C7OperationError("Aguarde a resposta do destinatário.");
  const previous = await firstControlEvent(tx, { planId: notice.planId, eventTypes: ["CONTROL_NOTICE_REVIEWED"], snapshotKey: "noticeId", snapshotValue: notice.id });
  if (previous) {
    if (previous.reason !== reason || (previous.snapshot as JsonObject).accepted !== input.accepted) throw new C7OperationError("Resposta já analisada; preserve a decisão e emita nova notificação.");
    return previous;
  }
  const event = await appendControlEvent(tx, { planId: notice.planId, findingId: notice.findingId, eventType: "CONTROL_NOTICE_REVIEWED", actorId: actor.usuarioId, reason, snapshot: { noticeId: notice.id, responseId: response.id, accepted: input.accepted } });
  await writeAuditEvent(tx, { actorUsuarioId: actor.usuarioId, eventType: auditEventTypes.administrativeMutation, targetType: "CONTROL_NOTICE_REVIEW", targetId: event.id });
  return event;
}
