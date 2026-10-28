import type { InternalNotificationInput, InternalNotificationPriority } from "@/lib/contracts/notifications";
export type { InternalNotificationInput, InternalNotificationPriority } from "@/lib/contracts/notifications";
export const internalNotificationPriorities = ["BAIXA", "NORMAL", "ALTA", "URGENTE"] as const;
const typedName = /^[A-Z][A-Z0-9_]*$/;

export function assertInternalNotificationPriority(value: string): asserts value is InternalNotificationPriority {
  if (!internalNotificationPriorities.includes(value as InternalNotificationPriority)) throw new Error("Prioridade de notificacao invalida.");
}

function assertTypedEntity(sourceModule: string, entityType: string, entityId: string) {
  if (!typedName.test(sourceModule) || !typedName.test(entityType) || !entityId.trim()) throw new Error("Origem ou entidade da notificacao invalida.");
}

export function buildInternalNotificationDedupeKey(input: Pick<InternalNotificationInput, "sourceModule" | "entityType" | "entityId" | "type" | "dedupeDiscriminator">): string {
  assertTypedEntity(input.sourceModule, input.entityType, input.entityId);
  if (!input.type.trim() || !input.dedupeDiscriminator.trim()) throw new Error("Chave de deduplicacao invalida.");
  return [input.sourceModule, input.entityType, input.entityId, input.type.trim(), input.dedupeDiscriminator.trim()].join(":");
}

export function validateInternalNotification(input: InternalNotificationInput): { priority: InternalNotificationPriority; recipients: string[]; dedupeKey: string } {
  const priority = input.priority ?? "NORMAL";
  assertInternalNotificationPriority(priority);
  assertTypedEntity(input.sourceModule, input.entityType, input.entityId);
  if (!input.actorUsuarioId || !input.title.trim() || !input.message.trim()) throw new Error("Dados da notificacao invalidos.");
  if (input.processId && (input.sourceModule !== "PROCESSOS" || input.entityType !== "PROCESS" || input.processId !== input.entityId)) throw new Error("Relacao de processo inconsistente com a entidade da notificacao.");
  return { priority, dedupeKey: buildInternalNotificationDedupeKey(input), recipients: [...new Set(input.recipientUserIds.filter(Boolean))] };
}
