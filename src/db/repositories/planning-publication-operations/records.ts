import { and, asc, count, desc, eq, ilike, inArray, sql } from "drizzle-orm";
import type { DatabaseExecutor, DatabaseTransaction } from "@/db/transaction";
import type { JsonValue } from "@/db/json";
import type { PlanningPublicationContext, PlanningPublicationFormat } from "@/lib/contracts/planning-publication-operations";
import { planningInstrumentScope } from "@/db/repositories/planning/scope";
import { planningInstruments } from "@/db/schema/planning-budget";
import { pageReportSnapshots as snapshots } from "@/db/schema/planning-pages";
import { governmentEntities } from "@/db/schema/master-data";
import { planningPublicationEvents as events, planningReportPublications as publications } from "@/db/schema/planning-publication-operations";
import { isSystemAdministrator } from "@/lib/platform/tenant-context";

export async function publicationRuntimeReady(database: DatabaseExecutor) {
  return (await database.execute<{ ready: boolean }>(sql`SELECT to_regclass('"PlanningReportPublication"') IS NOT NULL AS ready`)).rows[0]?.ready ?? false;
}

export async function publicationBySnapshot(database: DatabaseExecutor, snapshotId: string, format: PlanningPublicationFormat) {
  return (await database.select().from(publications).where(and(eq(publications.snapshotId, snapshotId), eq(publications.format, format))).limit(1))[0] ?? null;
}

export async function scopedPublication(database: DatabaseExecutor, context: PlanningPublicationContext, id: string) {
  const [row] = await database.select({ publication: publications }).from(publications).innerJoin(snapshots, eq(snapshots.id, publications.snapshotId)).where(and(eq(publications.id, id), planningInstrumentScope(context, snapshots.instrumentId))).limit(1);
  if (!row) throw new Error("Publicação não encontrada neste escopo.");
  return row.publication;
}

export async function lockPublicationClaim(tx: DatabaseTransaction, snapshotId: string, format: PlanningPublicationFormat) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`PlanningPublication:${snapshotId}:${format}`}))`);
}

export async function insertPublication(tx: DatabaseTransaction, input: Pick<typeof publications.$inferInsert, "snapshotId" | "format" | "publicKey" | "filename" | "contentType" | "title" | "requestedById" | "reason">) {
  return (await tx.insert(publications).values(input).returning())[0];
}

export async function claimPublication(tx: DatabaseTransaction, id: string, leaseToken: string, leaseExpiresAt: Date) {
  return (await tx.update(publications).set({ status: "ARCHIVING", leaseToken, leaseExpiresAt, attempts: sql`${publications.attempts} + 1`, lastError: null }).where(eq(publications.id, id)).returning())[0];
}

const leasedPublication = (id: string, leaseToken: string) => and(eq(publications.id, id), eq(publications.leaseToken, leaseToken), eq(publications.status, "ARCHIVING"));

export async function savePublicationArtifact(tx: DatabaseTransaction, id: string, leaseToken: string, fileUrl: string, fileHash: string) {
  return (await tx.update(publications).set({ fileUrl, fileHash }).where(leasedPublication(id, leaseToken)).returning({ id: publications.id })).length;
}

export async function finalizePublication(tx: DatabaseTransaction, id: string, leaseToken: string) {
  return (await tx.update(publications).set({ status: "PUBLISHED", publishedAt: new Date(), leaseToken: null, leaseExpiresAt: null, lastError: null }).where(leasedPublication(id, leaseToken)).returning({ id: publications.id })).length;
}

export async function failPublication(tx: DatabaseTransaction, id: string, leaseToken: string) {
  return (await tx.update(publications).set({ status: "FAILED", lastError: "Arquivo/publicação não confirmado; consulte a evidência da tentativa.", leaseToken: null, leaseExpiresAt: null }).where(leasedPublication(id, leaseToken)).returning({ id: publications.id })).length;
}

export async function insertPublicationEvent(tx: DatabaseTransaction, publicationId: string, type: string, actorId: string, payload: JsonValue) {
  await tx.insert(events).values({ publicationId, type, actorId, payload });
}

export async function lockPublication(tx: DatabaseTransaction, id: string) {
  const [row] = await tx.select().from(publications).where(eq(publications.id, id)).for("update");
  if (!row) throw new Error("Publicação não encontrada.");
  return row;
}

export async function withdrawPublication(tx: DatabaseTransaction, id: string) {
  await tx.update(publications).set({ status: "WITHDRAWN", withdrawnAt: new Date() }).where(eq(publications.id, id));
}

export async function publishedPublication(database: DatabaseExecutor, publicKey: string) {
  return (await database.select({ fileUrl: publications.fileUrl, fileHash: publications.fileHash, filename: publications.filename, contentType: publications.contentType }).from(publications).where(and(eq(publications.publicKey, publicKey), eq(publications.status, "PUBLISHED"))).limit(1))[0] ?? null;
}

export async function listPublishedPublications(database: DatabaseExecutor, input: { year?: number; entity?: string; page: number }) {
  const pattern = `%${(input.entity ?? "").replace(/[\\%_]/g, "\\$&")}%`;
  const where = and(eq(publications.status, "PUBLISHED"), input.year ? eq(planningInstruments.startYear, input.year) : undefined, input.entity ? ilike(governmentEntities.name, pattern) : undefined);
  const [{ total }] = await database.select({ total: count() }).from(publications).innerJoin(snapshots, eq(snapshots.id, publications.snapshotId)).innerJoin(planningInstruments, eq(planningInstruments.id, snapshots.instrumentId)).innerJoin(governmentEntities, eq(governmentEntities.id, planningInstruments.governmentEntityId)).where(where);
  const page = Math.min(input.page, Math.max(1, Math.ceil(total / 20)));
  const rows = await database.select({ title: publications.title, year: planningInstruments.startYear, entity: governmentEntities.name, type: snapshots.reportType, format: publications.format, publishedAt: publications.publishedAt, hash: publications.fileHash, publicKey: publications.publicKey }).from(publications).innerJoin(snapshots, eq(snapshots.id, publications.snapshotId)).innerJoin(planningInstruments, eq(planningInstruments.id, snapshots.instrumentId)).innerJoin(governmentEntities, eq(governmentEntities.id, planningInstruments.governmentEntityId)).where(where).orderBy(desc(publications.publishedAt), asc(publications.publicKey)).limit(20).offset((page - 1) * 20);
  return { total, page, records: rows.map(({ publicKey, publishedAt, ...row }) => ({ ...row, publishedAt: publishedAt?.toISOString() ?? null, url: `/api/transparencia/planejamento/${publicKey}`, completeness: "Documento para conferência — leiaute não homologado" })) };
}

export async function publicationManagement(database: DatabaseExecutor, context: PlanningPublicationContext, instrumentId: string, requestedPage: number) {
  const [instrument] = await database.select({ id: planningInstruments.id }).from(planningInstruments).where(and(eq(planningInstruments.id, instrumentId), planningInstrumentScope(context))).limit(1);
  if (!instrument) throw new Error("Peça não encontrada neste escopo.");
  const allowed = await database.select({ id: planningInstruments.id }).from(planningInstruments).where(planningInstrumentScope(context));
  const ids = allowed.map(piece => piece.id);
  if (!ids.length) return { total: 0, page: 1, records: [] };
  const units = isSystemAdministrator(context.user) ? sql`TRUE` : sql`${snapshots.filters} ? 'snapshotUnitIds' AND ${snapshots.filters}->'snapshotUnitIds' <@ ${JSON.stringify(context.user.allowedBudgetUnitIds)}::jsonb`;
  // sql.param is intentional: interpolating a JS array into raw SQL expands it
  // into a tuple rather than one PostgreSQL text[] parameter.
  const scope = and(eq(snapshots.instrumentId, instrumentId), units, sql`NOT EXISTS (SELECT 1 FROM unnest(string_to_array(${snapshots.filters}->>'instrumentIds', ',')) AS selected(id) WHERE NOT (selected.id = ANY(${sql.param(ids)}::text[])))`, sql`(COALESCE(${snapshots.filters}->>'targetId','') = '' OR ${snapshots.filters}->>'targetId' = ANY(${sql.param(ids)}::text[]))`);
  const [{ total }] = await database.select({ total: count() }).from(snapshots).where(scope);
  const page = Math.min(Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1, Math.max(1, Math.ceil(total / 20)));
  const selected = await database.select({ id: snapshots.id, reportType: snapshots.reportType, hash: snapshots.hash, createdAt: snapshots.createdAt }).from(snapshots).where(scope).orderBy(desc(snapshots.createdAt), asc(snapshots.id)).limit(20).offset((page - 1) * 20);
  const artifacts = await database.select({ snapshotId: publications.snapshotId, id: publications.id, status: publications.status, format: publications.format, publicKey: publications.publicKey, fileHash: publications.fileHash, attempts: publications.attempts }).from(publications).where(inArray(publications.snapshotId, selected.map(row => row.id)));
  return { total, page, records: selected.map(row => ({ ...row, publications: artifacts.filter(artifact => artifact.snapshotId === row.id).map(({ id, status, format, publicKey, fileHash, attempts }) => ({ id, status, format, publicKey, fileHash, attempts })) })) };
}
