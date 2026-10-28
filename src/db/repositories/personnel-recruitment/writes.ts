import { eq, sql } from 'drizzle-orm';
import type { DatabaseTransaction } from '../../transaction';
import { recruitmentApplications, recruitmentRules } from '../../schema/personnel-recruitment';
import type { RecruitmentApplication, RecruitmentNoticeWrite } from '@/lib/contracts/personnel-recruitment';

export async function lockRecruitment(tx: DatabaseTransaction, key: string): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${key}))::text`);
}
export async function createRecruitmentNoticeRule(tx: DatabaseTransaction, data: RecruitmentNoticeWrite & { ruleSetId: string; code: string }): Promise<string> {
  const [rule] = await tx.insert(recruitmentRules).values(data).returning({ id: recruitmentRules.id });
  return rule.id;
}
export async function updateRecruitmentNoticeRule(tx: DatabaseTransaction, id: string, data: RecruitmentNoticeWrite): Promise<string> {
  const [rule] = await tx.update(recruitmentRules).set(data).where(eq(recruitmentRules.id, id)).returning({ id: recruitmentRules.id });
  if (!rule) throw new Error('Edital não encontrado.');
  return rule.id;
}
export async function insertRecruitmentApplication(tx: DatabaseTransaction, application: Pick<RecruitmentApplication, 'id' | 'noticeRuleId' | 'applicantUserId' | 'cpf' | 'roleCode' | 'number' | 'snapshot' | 'requestHash'>): Promise<void> {
  await tx.insert(recruitmentApplications).values({ ...application, status: 'RECEBIDA' });
}
export async function updateRecruitmentApplicationDecision(tx: DatabaseTransaction, id: string, input: { status: 'DEFERIDA' | 'INDEFERIDA'; decision: string; decidedById: string }): Promise<void> {
  // Keep PostgreSQL transaction time, as in the original UPDATE ... now().
  await tx.update(recruitmentApplications).set({ ...input, decidedAt: sql`now()` }).where(eq(recruitmentApplications.id, id));
}
