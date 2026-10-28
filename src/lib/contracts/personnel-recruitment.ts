import type { Database } from '@/db/connection';
import type { JsonValue } from '@/db/json';
import type { PermissionUser } from './identity';

/** Structural subset accepted from AppContext, without an ORM dependency. */
export type RecruitmentContext = { user: PermissionUser; database?: Database };
export type RecruitmentNoticePolicy = {
  origin: 'EDITAL_RECRUTAMENTO'; kind: 'CONCURSO' | 'PSS'; number: string;
  budgetUnitId: string; documentVersionId: string; instructions: string;
  startsAt: string; endsAt: string;
  roles: Array<{ code: string; name: string; requirements: string }>;
  acceptance: string;
};
export type PublicRecruitmentNotice = { id: string; name: string; policy: RecruitmentNoticePolicy };
export type RecruitmentApplication = {
  id: string; noticeRuleId: string; applicantUserId: string; cpf: string;
  roleCode: string; number: number; status: string; snapshot: JsonValue;
  requestHash: string; decision: string | null; decidedById: string | null;
  createdAt: Date; decidedAt: Date | null;
};
export type RecruitmentApplicationPage = { rows: RecruitmentApplication[]; page: number; total: number };
export type RecruitmentRule = {
  id: string; ruleSetId: string; code: string; name: string;
  category: string; valueType: string; isActive: boolean; value: JsonValue;
};
export type RecruitmentRuleSet = { status: string; effectiveFrom: Date; effectiveUntil: Date | null };
export type RecruitmentRuleWithSet = RecruitmentRule & { ruleSet: RecruitmentRuleSet };
export type RecruitmentNoticeWrite = { name: string; category: string; valueType: string; isActive: boolean; value: JsonValue };
