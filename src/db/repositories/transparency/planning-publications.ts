import { and, asc, count, desc, eq, ilike, sql } from "drizzle-orm";
import type { DatabaseExecutor } from "../../transaction";
import { governmentEntities } from "../../schema/master-data";
import { publicPlanningReportPublications as publications, publicPlanningReportSnapshots as snapshots, transparencyPlanningInstruments as instruments } from "../../schema/transparency-planning";

export async function listPublishedPlanningReports(db: DatabaseExecutor, input: { year?: number; entity?: string; page: number }) {
  const runtime = await db.execute<{ ready: boolean }>(sql`SELECT to_regclass('"PlanningReportPublication"') IS NOT NULL AS ready`);
  if (!runtime.rows[0]?.ready) return { total: 0, page: 1, records: [] };
  const pattern = `%${(input.entity || "").replace(/[\\%_]/g, "\\$&")}%`;
  const where = and(eq(publications.status, "PUBLISHED"), input.year ? eq(instruments.startYear, input.year) : undefined, input.entity ? ilike(governmentEntities.name, pattern) : undefined);
  const [{ total }] = await db.select({ total: count() }).from(publications)
    .innerJoin(snapshots, eq(snapshots.id, publications.snapshotId)).innerJoin(instruments, eq(instruments.id, snapshots.instrumentId))
    .innerJoin(governmentEntities, eq(governmentEntities.id, instruments.governmentEntityId)).where(where);
  const page = Math.min(input.page, Math.max(1, Math.ceil(total / 20)));
  const rows = await db.select({ publicKey: publications.publicKey, title: publications.title, format: publications.format, hash: publications.fileHash, publishedAt: publications.publishedAt, type: snapshots.reportType, year: instruments.startYear, entity: governmentEntities.name }).from(publications)
    .innerJoin(snapshots, eq(snapshots.id, publications.snapshotId)).innerJoin(instruments, eq(instruments.id, snapshots.instrumentId))
    .innerJoin(governmentEntities, eq(governmentEntities.id, instruments.governmentEntityId)).where(where)
    .orderBy(desc(publications.publishedAt), asc(publications.publicKey)).limit(20).offset((page - 1) * 20);
  return { total, page, records: rows.map(({ publicKey, publishedAt, ...row }) => ({ ...row, publishedAt: publishedAt?.toISOString() ?? null, url: `/api/transparencia/planejamento/${publicKey}`, completeness: "Documento para conferência — leiaute não homologado" })) };
}

export async function readPublishedPlanningReport(db: DatabaseExecutor, publicKey: string) {
  const [row] = await db.select({ fileUrl: publications.fileUrl, fileHash: publications.fileHash, filename: publications.filename, contentType: publications.contentType }).from(publications)
    .where(and(eq(publications.publicKey, publicKey), eq(publications.status, "PUBLISHED"))).limit(1);
  return row ?? null;
}
