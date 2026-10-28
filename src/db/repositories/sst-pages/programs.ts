import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import { sstPrograms, sstExposureGroups, sstProgramGroups } from "@/db/schema/sst-programs";
import { sstBudgetUnits } from "@/db/schema/sst-reference";
import type { SstPageOption, SstPageResult, SstProgramPageDto, SstProgramGroupPageDto } from "@/lib/contracts/sst-pages";

export async function readSstProgramsPage(database: DatabaseExecutor, unitIds: string[], unitId: string | undefined, requestedPage: string | undefined): Promise<SstPageResult<SstProgramPageDto> & { groups: (SstPageOption & { code: string })[] }> {
  const where = inArray(sstPrograms.budgetUnitId, unitId ? [unitId] : unitIds);
  const [{ total }] = await database.select({ total: sql<number>`count(*)::int` }).from(sstPrograms).where(where);
  const page = Math.min(Math.max(1, Math.trunc(Number(requestedPage)) || 1), Math.max(1, Math.ceil(total / 20)));
  const records = await database.select().from(sstPrograms).where(where).orderBy(desc(sstPrograms.createdAt), asc(sstPrograms.id)).limit(20).offset((page - 1) * 20);
  const groups = unitId ? await database.select({ id: sstExposureGroups.id, code: sstExposureGroups.code, name: sstExposureGroups.name }).from(sstExposureGroups).where(and(eq(sstExposureGroups.budgetUnitId, unitId), eq(sstExposureGroups.isActive, true))).orderBy(asc(sstExposureGroups.code)).limit(200) : [];
  return { total, page, records, groups };
}

export async function findSstProgramScope(database: DatabaseExecutor, id: string): Promise<{ budgetUnitId: string } | undefined> {
  const [scope] = await database.select({ budgetUnitId: sstPrograms.budgetUnitId }).from(sstPrograms).where(eq(sstPrograms.id, id));
  return scope;
}

export async function findSstProgramPage(database: DatabaseExecutor, id: string): Promise<(SstProgramPageDto & { budgetUnit: { name: string }; groups: SstProgramGroupPageDto[] }) | null> {
  const [row] = await database.select({ program: sstPrograms, budgetUnit: { name: sstBudgetUnits.name } }).from(sstPrograms).innerJoin(sstBudgetUnits, eq(sstBudgetUnits.id, sstPrograms.budgetUnitId)).where(eq(sstPrograms.id, id));
  if (!row) return null;
  return { ...row.program, budgetUnit: row.budgetUnit, groups: await database.select().from(sstProgramGroups).where(eq(sstProgramGroups.programId, id)) };
}
