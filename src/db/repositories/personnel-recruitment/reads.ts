import { and, asc, desc, eq, gte, inArray, isNull, lte, or, sql, type SQL } from 'drizzle-orm';
import type { DatabaseExecutor, DatabaseTransaction } from '../../transaction';
import * as t from '../../schema/personnel-recruitment';
import type { RecruitmentApplication, RecruitmentRule, RecruitmentRuleSet, RecruitmentRuleWithSet } from '@/lib/contracts/personnel-recruitment';

export async function readPublicRecruitmentRules(db: DatabaseExecutor, now: Date): Promise<Array<{ id: string; name: string; value: RecruitmentRule['value'] }>> {
  return db.select({ id: t.recruitmentRules.id, name: t.recruitmentRules.name, value: t.recruitmentRules.value }).from(t.recruitmentRules)
    .innerJoin(t.recruitmentRuleSets, eq(t.recruitmentRuleSets.id, t.recruitmentRules.ruleSetId))
    .where(and(eq(t.recruitmentRules.category, 'PORTAL'), eq(t.recruitmentRules.valueType, 'JSON'), eq(t.recruitmentRules.isActive, true), eq(t.recruitmentRuleSets.status, 'ATIVA'), lte(t.recruitmentRuleSets.effectiveFrom, now), or(isNull(t.recruitmentRuleSets.effectiveUntil), gte(t.recruitmentRuleSets.effectiveUntil, now))))
    .orderBy(desc(t.recruitmentRules.createdAt), asc(t.recruitmentRules.id));
}
export async function readInstitutionalRecruitmentVersions(db: DatabaseExecutor, ids: string[]): Promise<Array<{ id: string }>> {
  if (!ids.length) return [];
  return db.select({ id: t.recruitmentDocumentVersions.id }).from(t.recruitmentDocumentVersions)
    .innerJoin(t.recruitmentDocuments, eq(t.recruitmentDocuments.id, t.recruitmentDocumentVersions.documentId))
    .where(and(inArray(t.recruitmentDocumentVersions.id, ids), inArray(t.recruitmentDocumentVersions.status, ['FINAL', 'SIGNED']), eq(t.recruitmentDocuments.status, 'Válido'), isNull(t.recruitmentDocuments.personId)));
}
export async function requireRecruitmentRuleSet(db: DatabaseExecutor, id: string): Promise<RecruitmentRuleSet> {
  const [set] = await db.select({ status: t.recruitmentRuleSets.status, effectiveFrom: t.recruitmentRuleSets.effectiveFrom, effectiveUntil: t.recruitmentRuleSets.effectiveUntil }).from(t.recruitmentRuleSets).where(eq(t.recruitmentRuleSets.id, id)).limit(1);
  if (!set) throw new Error('Configuração RH não encontrada.');
  return set;
}
export async function requireRecruitmentRule(db: DatabaseExecutor, id: string): Promise<RecruitmentRule> {
  const [rule] = await db.select().from(t.recruitmentRules).where(eq(t.recruitmentRules.id, id)).limit(1);
  if (!rule) throw new Error('Edital não encontrado.');
  return rule;
}
export async function requireRecruitmentRuleWithSet(db: DatabaseExecutor, id: string): Promise<RecruitmentRuleWithSet> {
  const rule = await requireRecruitmentRule(db, id);
  return { ...rule, ruleSet: await requireRecruitmentRuleSet(db, rule.ruleSetId) };
}
export async function countRecruitmentApplications(db: DatabaseExecutor, condition?: SQL): Promise<number> {
  const [row] = await db.select({ total: sql<number>`count(*)::int` }).from(t.recruitmentApplications).where(condition);
  return row.total;
}
export async function countNoticeRecruitmentApplications(db: DatabaseExecutor, noticeId: string): Promise<number> {
  return countRecruitmentApplications(db, eq(t.recruitmentApplications.noticeRuleId, noticeId));
}
export async function findRecruitmentApplicationReplay(db: DatabaseExecutor, noticeId: string, cpf: string, userId: string): Promise<RecruitmentApplication | null> {
  const [application] = await db.select().from(t.recruitmentApplications).where(and(eq(t.recruitmentApplications.noticeRuleId, noticeId), or(eq(t.recruitmentApplications.cpf, cpf), eq(t.recruitmentApplications.applicantUserId, userId)))).limit(1);
  return application ?? null;
}
export async function hasActiveRecruitmentApplicant(db: DatabaseExecutor, id: string): Promise<boolean> {
  return (await db.select({ id: t.recruitmentUsers.id }).from(t.recruitmentUsers).innerJoin(t.recruitmentProfiles, eq(t.recruitmentProfiles.id, t.recruitmentUsers.perfilId)).where(and(eq(t.recruitmentUsers.id, id), eq(t.recruitmentUsers.ativo, true), eq(t.recruitmentProfiles.ativo, true))).limit(1)).length > 0;
}
export async function nextRecruitmentApplicationNumber(db: DatabaseExecutor, noticeId: string): Promise<number> {
  const [row] = await db.select({ next: sql<number>`COALESCE(MAX(${t.recruitmentApplications.number}),0)::int+1` }).from(t.recruitmentApplications).where(eq(t.recruitmentApplications.noticeRuleId, noticeId));
  return row.next;
}
export function readOwnRecruitmentApplicationRows(db: DatabaseExecutor, userId: string): Promise<RecruitmentApplication[]> {
  return db.select().from(t.recruitmentApplications).where(eq(t.recruitmentApplications.applicantUserId, userId)).orderBy(desc(t.recruitmentApplications.createdAt), asc(t.recruitmentApplications.id));
}
export function recruitmentApplicationScope(administrator: boolean, unitIds: string[]): SQL {
  if (administrator) return sql`true`;
  if (!unitIds.length) return sql`false`;
  return sql`${t.recruitmentApplications.snapshot} #>> '{policy,budgetUnitId}' IN (${sql.join(unitIds.map(id => sql`${id}`), sql`,`)})`;
}
export function readRecruitmentReviewRows(db: DatabaseExecutor, scope: SQL, offset: number): Promise<RecruitmentApplication[]> {
  return db.select().from(t.recruitmentApplications).where(scope).orderBy(asc(t.recruitmentApplications.createdAt), asc(t.recruitmentApplications.id)).limit(20).offset(offset);
}
export async function lockRecruitmentApplicationRow(tx: DatabaseTransaction, id: string): Promise<RecruitmentApplication | null> {
  const [application] = await tx.select().from(t.recruitmentApplications).where(eq(t.recruitmentApplications.id, id)).for('update');
  return application ?? null;
}
