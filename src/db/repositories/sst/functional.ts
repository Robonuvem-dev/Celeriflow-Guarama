import { and, asc, eq, gt, lt, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { DatabaseExecutor } from "@/db/transaction";
import { sstFunctionalPeriods } from "@/db/schema/sst-functional";
import { sstProgramGroups, sstPrograms } from "@/db/schema/sst-programs";
import type { HistoricalTechnicalResponsibility } from "@/lib/sst/functional-policy";
import { sstRows, sstTimestamp } from "./sql";

export const sstPeriod = alias(sstFunctionalPeriods, "p");
export async function readSstFunctionalPeriods(database: DatabaseExecutor, predicate: SQL, page?: { limit: number; offset: number }) {
  const query = database.select().from(sstPeriod).where(predicate).orderBy(asc(sstPeriod.startsAt), asc(sstPeriod.id));
  return page ? query.limit(page.limit).offset(page.offset) : query;
}
export async function readSstHistoricalProgramGroups(database: DatabaseExecutor, input: { budgetUnitId: string; from: Date; until: Date; kind?: string }) {
  return database.select({ group: sstProgramGroups, program: sstPrograms }).from(sstProgramGroups).innerJoin(sstPrograms, eq(sstProgramGroups.programId, sstPrograms.id))
    .where(and(eq(sstPrograms.budgetUnitId, input.budgetUnitId), lt(sstPrograms.startsAt, input.until), gt(sstPrograms.endsAt, input.from), input.kind ? eq(sstPrograms.kind, input.kind) : undefined)).orderBy(asc(sstProgramGroups.id))
    .then(rows => rows.map(row => ({ ...row.group, program: row.program })));
}
export async function readSstHistoricalResponsibilities(database: DatabaseExecutor, input: { budgetUnitId: string; from: Date; until: Date; environmentalOnly?: boolean }): Promise<HistoricalTechnicalResponsibility[]> {
  const rows = await sstRows<Omit<HistoricalTechnicalResponsibility, "startsAt" | "endsAt" | "effectiveEndsAt" | "revokedAt"> & { startsAt: string; endsAt: string; effectiveEndsAt: string; revokedAt: string | null; createdAt: string }>(database,
    sql`SELECT r.*,v."createdAt" AS "revokedAt",LEAST(r."endsAt",COALESCE(v."createdAt",r."endsAt")) AS "effectiveEndsAt" FROM "SstTechnicalResponsibility" r LEFT JOIN "SstFoundationalRevocation" v ON v."responsibilityId"=r.id WHERE r."budgetUnitId"=${input.budgetUnitId} ${input.environmentalOnly ? sql`AND r.kind='ENVIRONMENTAL'` : sql``} AND r."startsAt"<${input.until} AND LEAST(r."endsAt",COALESCE(v."createdAt",r."endsAt"))>${input.from} ORDER BY r."startsAt",r.id`);
  return rows.map(row => ({ ...row, startsAt: sstTimestamp(row.startsAt), endsAt: sstTimestamp(row.endsAt), effectiveEndsAt: sstTimestamp(row.effectiveEndsAt), revokedAt: row.revokedAt === null ? null : sstTimestamp(row.revokedAt), createdAt: sstTimestamp(row.createdAt) }));
}
