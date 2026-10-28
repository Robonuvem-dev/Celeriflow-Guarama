import { and, eq, inArray, sql } from "drizzle-orm";
import type { DatabaseExecutor } from "../../transaction";
import { sstCats, sstCatEvidence } from "../../schema/sst-accidents";

export type OwnAccidentRecord = {
  id: string; occurredAt: Date; createdAt: Date; kind: string;
  data: Record<string, unknown>; snapshot: Record<string, string | null>;
};
export async function findOwnAccident(db: DatabaseExecutor, employeeId: string, id: string): Promise<OwnAccidentRecord | null> {
  const [row] = await db.select({ id: sstCats.id, occurredAt: sstCats.occurredAt, createdAt: sstCats.createdAt, kind: sstCats.kind, data: sstCats.data, snapshot: sstCats.snapshot }).from(sstCats).where(and(eq(sstCats.id, id), eq(sstCats.employeeId, employeeId))).limit(1);
  return row ?? null;
}
export async function readOwnAccidentMilestones(db: DatabaseExecutor, employeeId: string, ids: string[]): Promise<{ id: string; status: string }[]> {
  if (!ids.length) return [];
  return db.select({ id: sstCats.id, status: sql<string>`CASE WHEN bool_or(${sstCatEvidence.kind} = 'HOMOLOGATION') THEN 'HOMOLOGADA' WHEN bool_or(${sstCatEvidence.kind} = 'INVESTIGATION') THEN 'EM_ANALISE' ELSE 'COMUNICADA' END` }).from(sstCats).leftJoin(sstCatEvidence, eq(sstCatEvidence.catId, sstCats.id)).where(and(inArray(sstCats.id, ids), eq(sstCats.employeeId, employeeId))).groupBy(sstCats.id);
}
