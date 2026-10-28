import { and, asc, count, desc, eq, inArray, max, sql } from 'drizzle-orm';
import type { DatabaseExecutor } from '../../transaction';
import { financialYears } from '../../schema/finance-years';
import { governmentEntities, legalTexts, legalTextVersions } from '../../schema/master-data';
import { documents } from '../../schema/registry';
import { documentVersions } from '../../schema/document-workflow';
import { roles } from '../../schema/administration';
import { hrRoleLegalHistory } from '../../schema/personnel-legal';
import type { PermissionUser } from '@/lib/contracts/identity';
import type { RoleLegalHistoryEvent } from '@/lib/contracts/personnel-pages';
import { isSystemAdministrator } from '@/lib/platform/tenant-context';

type LegalYear = { id: string; year: number; governmentEntity: { id: string; name: string } | null };
type LegalAct = { id: string; versionNumber: number; legalText: { type: string; number: string }; document: { versions: Array<{ id: string; versionNumber: number; hashSha256: string }> } | null };
export function readRoleLegalYears(db: DatabaseExecutor, user: PermissionUser): Promise<LegalYear[]> {
  return db.select({ id: financialYears.id, year: financialYears.year, governmentEntity: { id: governmentEntities.id, name: governmentEntities.name } }).from(financialYears).leftJoin(governmentEntities, eq(governmentEntities.id, financialYears.governmentEntityId)).where(sql`EXISTS (SELECT 1 FROM "PlanningEntityUnit" u WHERE u."governmentEntityId"=${governmentEntities.id} ${isSystemAdministrator(user) ? sql`` : sql`AND u."budgetUnitId"=ANY(${sql.param(user.allowedBudgetUnitIds)}::text[])`})`).orderBy(desc(financialYears.year), asc(financialYears.id));
}
export async function readRoleLegalHistoryPage(db: DatabaseExecutor, entityId: string, roleId: string | undefined, page: number): Promise<{ roles: Array<{ id: string; name: string }>; acts: LegalAct[]; history: RoleLegalHistoryEvent[]; count: number; latest: Array<{ roleId: string; _max: { version: number | null } }> }> {
  const where = and(eq(hrRoleLegalHistory.governmentEntityId, entityId), roleId ? eq(hrRoleLegalHistory.roleId, roleId) : undefined);
  const [roleRows, actRows, history, totals, latest] = await Promise.all([
    db.select({ id: roles.id, name: roles.name }).from(roles).orderBy(asc(roles.name), asc(roles.id)),
    db.select({ id: legalTextVersions.id, versionNumber: legalTextVersions.versionNumber, documentId: documents.id, legalText: { type: legalTexts.type, number: legalTexts.number } }).from(legalTextVersions).innerJoin(legalTexts, eq(legalTexts.id, legalTextVersions.legalTextId)).innerJoin(documents, eq(documents.id, legalTextVersions.documentId)).where(and(eq(legalTexts.governmentEntityId, entityId), eq(documents.status, 'Válido'), sql`EXISTS (SELECT 1 FROM "DocumentVersion" v WHERE v."documentId"=${documents.id} AND v.status IN ('FINAL','SIGNED'))`)).orderBy(asc(legalTextVersions.legalTextId), desc(legalTextVersions.versionNumber)),
    db.select().from(hrRoleLegalHistory).where(where).orderBy(desc(hrRoleLegalHistory.effectiveFrom), desc(hrRoleLegalHistory.version), desc(hrRoleLegalHistory.id)).limit(30).offset((page - 1) * 30),
    db.select({ value: count() }).from(hrRoleLegalHistory).where(where),
    db.select({ roleId: hrRoleLegalHistory.roleId, version: max(hrRoleLegalHistory.version) }).from(hrRoleLegalHistory).where(eq(hrRoleLegalHistory.governmentEntityId, entityId)).groupBy(hrRoleLegalHistory.roleId),
  ]);
  const versions = actRows.length ? await db.select({ id: documentVersions.id, documentId: documentVersions.documentId, versionNumber: documentVersions.versionNumber, hashSha256: documentVersions.hashSha256 }).from(documentVersions).where(and(inArray(documentVersions.documentId, actRows.map(row => row.documentId)), inArray(documentVersions.status, ['FINAL', 'SIGNED']))).orderBy(desc(documentVersions.versionNumber)) : [];
  return { roles: roleRows, acts: actRows.map(({ documentId, ...act }) => ({ ...act, document: { versions: versions.filter(version => version.documentId === documentId) } })), history, count: totals[0].value, latest: latest.map(row => ({ roleId: row.roleId, _max: { version: row.version } })) };
}
