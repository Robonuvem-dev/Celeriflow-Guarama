import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { InternalNotificationInput, InternalNotificationRecord } from "@/lib/contracts/notifications";
import { validateInternalNotification } from "@/lib/notifications/notification-policy";
import { auditEventTypes } from "@/lib/contracts/audit";
import type { DatabaseExecutor, DatabaseTransaction } from "../../transaction";
import { internalNotifications } from "../../schema/notifications";
import { insertAuditEvent } from "./audit";

/** Use within the source operation's Drizzle transaction. */
export async function insertInternalNotifications(tx: DatabaseTransaction, input: InternalNotificationInput): Promise<{ created: number; dedupeKey: string }> {
  const { priority, dedupeKey, recipients } = validateInternalNotification(input);
  let created = 0;
  for (const userId of recipients) {
    // DO NOTHING preserves a usable transaction when the partial unique index
    // resolves concurrent producers racing to deliver the same event.
    const [notification] = await tx.insert(internalNotifications).values({ userId, processId: input.processId ?? null, sourceModule: input.sourceModule, entityType: input.entityType, entityId: input.entityId, type: input.type, title: input.title.trim(), message: input.message.trim(), priority, dedupeKey }).onConflictDoNothing().returning({ id: internalNotifications.id });
    if (!notification) continue;
    await insertAuditEvent(tx, { actorUsuarioId: input.actorUsuarioId, eventType: auditEventTypes.internalNotificationCreated, targetType: "INTERNAL_NOTIFICATION", targetId: notification.id });
    created++;
  }
  return { created, dedupeKey };
}

export async function listInternalNotifications(db: DatabaseExecutor, userId: string, options: { sourceModule?: string; take?: number } = {}): Promise<InternalNotificationRecord[]> {
  return db.select().from(internalNotifications).where(and(eq(internalNotifications.userId, userId), options.sourceModule ? eq(internalNotifications.sourceModule, options.sourceModule) : undefined)).orderBy(desc(internalNotifications.createdAt)).limit(options.take ?? 50);
}

export async function countUnreadInternalNotifications(db: DatabaseExecutor, userId: string): Promise<number> {
  const [row] = await db.select({ value: sql<number>`count(*)::int` }).from(internalNotifications).where(and(eq(internalNotifications.userId, userId), isNull(internalNotifications.readAt)));
  return row.value;
}

export async function markInternalNotificationRead(tx: DatabaseTransaction, notificationId: string, userId: string): Promise<boolean> {
  const [updated] = await tx.update(internalNotifications).set({ readAt: new Date() }).where(and(eq(internalNotifications.id, notificationId), eq(internalNotifications.userId, userId), isNull(internalNotifications.readAt))).returning({ id: internalNotifications.id });
  if (!updated) return false;
  await insertAuditEvent(tx, { actorUsuarioId: userId, eventType: auditEventTypes.internalNotificationRead, targetType: "INTERNAL_NOTIFICATION", targetId: updated.id });
  return true;
}

export async function listVisibleNotificationProcessTargets(db: DatabaseExecutor, processIds: string[], access: { administrator: boolean; departmentId: string | null }): Promise<{ id: string; protocolNumber: string }[]> {
  if (!processIds.length) return [];
  const scope = access.administrator ? sql`TRUE` : access.departmentId
    ? sql`(p."currentDepartmentId"=${access.departmentId} OR EXISTS(SELECT 1 FROM "ProcessMovement" m WHERE m."processId"=p.id AND (m."fromDepartmentId"=${access.departmentId} OR m."toDepartmentId"=${access.departmentId})))`
    : sql`p.id=${"__sem-departamento__"}`;
  const result = await db.execute<{ id: string; protocolNumber: string }>(sql`SELECT p.id,p."protocolNumber" FROM "Process" p WHERE p.id IN (${sql.join(processIds.map(id => sql`${id}`), sql`, `)}) AND ${scope}`);
  return result.rows;
}
