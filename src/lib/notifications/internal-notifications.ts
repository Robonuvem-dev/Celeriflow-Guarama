import type { Prisma } from "@prisma/client";
import { auditEventTypes, writeAuditEvent } from "@/lib/platform/audit-evidence";
import { validateInternalNotification, type InternalNotificationInput } from "./notification-policy";
export { internalNotificationPriorities, assertInternalNotificationPriority, buildInternalNotificationDedupeKey, type InternalNotificationInput, type InternalNotificationPriority } from "./notification-policy";
export { listInternalNotifications, countUnreadInternalNotifications, markInternalNotificationRead } from "@/db/repositories/platform/notifications";

function isUniqueViolation(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

// Call inside the source operation transaction so the entity and its notification succeed together.
export async function createInternalNotifications(tx: Prisma.TransactionClient, input: InternalNotificationInput) {
  const { priority, dedupeKey, recipients } = validateInternalNotification(input);
  let created = 0;

  for (const userId of recipients) {
    const existing = await tx.protocolNotification.findFirst({ where: { userId, dedupeKey }, select: { id: true } });
    if (existing) continue;

    try {
      const notification = await tx.protocolNotification.create({
        data: {
          userId,
          processId: input.processId ?? null,
          sourceModule: input.sourceModule,
          entityType: input.entityType,
          entityId: input.entityId,
          type: input.type,
          title: input.title.trim(),
          message: input.message.trim(),
          priority,
          dedupeKey,
        },
        select: { id: true },
      });
      await writeAuditEvent(tx, {
        actorUsuarioId: input.actorUsuarioId,
        eventType: auditEventTypes.internalNotificationCreated,
        targetType: "INTERNAL_NOTIFICATION",
        targetId: notification.id,
      });
      created += 1;
    } catch (error) {
      // The partial unique index is the final guard when two workers race on the same event.
      if (!isUniqueViolation(error)) throw error;
    }
  }

  return { created, dedupeKey };
}

