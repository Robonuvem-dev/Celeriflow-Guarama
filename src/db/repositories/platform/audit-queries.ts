import { and, eq, gte, sql } from "drizzle-orm";
import type { AuditEventPage, AuditEventSummary, AuditUsageSummary } from "@/lib/contracts/audit";
import { buildAuditEventPageQuery, buildAuditEventWhere, createAuditEventPage, type AuditEventFilters, type AuditEventQuery } from "@/lib/platform/audit-query";
import type { DatabaseExecutor } from "../../transaction";
import { auditEvents } from "../../schema/audit";
import { accessProfiles, users } from "../../schema/identity";

export async function loadAuditEventPage(db: DatabaseExecutor, query: AuditEventQuery): Promise<AuditEventPage> {
  const selection = buildAuditEventPageQuery(query);
  const rows = await db.select({
    id: auditEvents.id, actorUsuarioId: auditEvents.actorUsuarioId, eventType: auditEvents.eventType, targetType: auditEvents.targetType, targetId: auditEvents.targetId, createdAt: auditEvents.createdAt,
    actorName: users.nome, actorEmail: users.email, profileName: accessProfiles.nome,
  }).from(auditEvents).innerJoin(users, eq(auditEvents.actorUsuarioId, users.id)).innerJoin(accessProfiles, eq(users.perfilId, accessProfiles.id))
    .where(selection.where).orderBy(...selection.orderBy).limit(selection.take);
  const events = rows.map(({ actorName, actorEmail, profileName, ...record }) => ({ ...record, actorUsuario: { nome: actorName, email: actorEmail, perfil: { nome: profileName } } }));
  return createAuditEventPage(events, query);
}

export async function loadAuditEventSummary(db: DatabaseExecutor, filters: AuditEventFilters, last24Hours: Date): Promise<AuditEventSummary> {
  const where = buildAuditEventWhere(filters);
  const [totals, recents, events, targets] = await Promise.all([
    db.select({ value: sql<number>`count(*)::int` }).from(auditEvents).where(where),
    db.select({ value: sql<number>`count(*)::int` }).from(auditEvents).where(and(where, gte(auditEvents.createdAt, last24Hours))),
    db.select({ eventType: auditEvents.eventType, count: sql<number>`count(*)::int` }).from(auditEvents).where(where).groupBy(auditEvents.eventType),
    db.select({ targetType: auditEvents.targetType, count: sql<number>`count(*)::int` }).from(auditEvents).where(where).groupBy(auditEvents.targetType),
  ]);
  return { total: totals[0].value, recent: recents[0].value, eventGroups: events.map(row => ({ eventType: row.eventType, _count: { _all: row.count } })), targetGroups: targets.map(row => ({ targetType: row.targetType, _count: { _all: row.count } })) };
}

export async function loadAuditUsageSummary(db: DatabaseExecutor, last24Hours: Date): Promise<AuditUsageSummary> {
  const [totals, recents, activeUsers] = await Promise.all([
    db.select({ value: sql<number>`count(*)::int` }).from(auditEvents),
    db.select({ value: sql<number>`count(*)::int` }).from(auditEvents).where(gte(auditEvents.createdAt, last24Hours)),
    db.select({ actorUsuarioId: auditEvents.actorUsuarioId }).from(auditEvents).where(gte(auditEvents.createdAt, last24Hours)).groupBy(auditEvents.actorUsuarioId),
  ]);
  return { totalEvents: totals[0].value, eventsLast24Hours: recents[0].value, activeUsers };
}
