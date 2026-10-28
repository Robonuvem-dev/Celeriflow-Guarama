import { and, eq } from "drizzle-orm";
import type { DatabaseExecutor } from "../../transaction";
import { sstAccessGrants, sstDisciplineGrants } from "../../schema/sst-access";

export async function findSstClinicalGrant(db: DatabaseExecutor, usuarioId: string, budgetUnitId: string): Promise<{ isActive: boolean; canReadClinical: boolean; canAssess: boolean } | null> {
  const [grant] = await db.select({ isActive: sstAccessGrants.isActive, canReadClinical: sstAccessGrants.canReadClinical, canAssess: sstAccessGrants.canAssess }).from(sstAccessGrants).where(and(eq(sstAccessGrants.usuarioId, usuarioId), eq(sstAccessGrants.budgetUnitId, budgetUnitId))).limit(1);
  return grant ?? null;
}
export async function findSstDisciplineGrant(db: DatabaseExecutor, usuarioId: string, budgetUnitId: string, discipline: string): Promise<{ isActive: boolean; canRead: boolean; canWrite: boolean } | null> {
  const [grant] = await db.select({ isActive: sstDisciplineGrants.isActive, canRead: sstDisciplineGrants.canRead, canWrite: sstDisciplineGrants.canWrite }).from(sstDisciplineGrants).where(and(eq(sstDisciplineGrants.usuarioId, usuarioId), eq(sstDisciplineGrants.budgetUnitId, budgetUnitId), eq(sstDisciplineGrants.discipline, discipline))).limit(1);
  return grant ?? null;
}
