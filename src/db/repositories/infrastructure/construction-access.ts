import { and, eq, exists, getTableColumns, isNull, sql } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import type { ConstructionAccess } from "@/lib/contracts/construction";
import { constructionCases, constructionParticipants, constructionPortalIdentities, constructionProfessionals } from "@/db/schema/construction-core";
import { processes } from "@/db/schema/processes";
import { people } from "@/db/schema/people";
import { companies } from "@/db/schema/registry";

export async function findActiveConstructionPortalIdentity(db: DatabaseExecutor, principal: { firebaseUid: string; email: string }, today: Date) {
  const [row] = await db.select({ id: constructionPortalIdentities.id, professionalId: constructionPortalIdentities.professionalId, professionalType: constructionProfessionals.professionalType, fullName: people.fullName })
    .from(constructionPortalIdentities).innerJoin(constructionProfessionals, eq(constructionProfessionals.id, constructionPortalIdentities.professionalId)).innerJoin(people, eq(people.id, constructionProfessionals.personId))
    .where(and(eq(constructionPortalIdentities.firebaseUid, principal.firebaseUid), eq(constructionPortalIdentities.email, principal.email), eq(constructionPortalIdentities.isActive, true), eq(constructionProfessionals.isActive, true), eq(people.status, "Ativo"), sql`${constructionProfessionals.startsAt} <= ${today.toISOString().slice(0, 10)}::date`, sql`(${constructionProfessionals.endsAt} IS NULL OR ${constructionProfessionals.endsAt} >= ${today.toISOString().slice(0, 10)}::date)`)).limit(1);
  return row ? { id: row.id, professionalId: row.professionalId, professional: { professionalType: row.professionalType, person: { fullName: row.fullName } } } : null;
}

export async function findConstructionCaseForAccess(db: DatabaseExecutor, id: string, access: ConstructionAccess) {
  if (!access.administrator && (!access.departmentId || !access.roles.length)) return null;
  const [row] = await db.select({ ...getTableColumns(constructionCases), process: getTableColumns(processes), person: { fullName: people.fullName }, company: { corporateName: companies.corporateName } }).from(constructionCases)
    .innerJoin(processes, eq(processes.id, constructionCases.processId)).leftJoin(people, eq(people.id, processes.personId)).leftJoin(companies, eq(companies.id, processes.companyId))
    .where(and(eq(constructionCases.id, id), access.administrator ? undefined : eq(processes.currentDepartmentId, access.departmentId!))).limit(1);
  if (!row) return null;
  const { person, company, ...record } = row;
  return { ...record, process: { ...record.process, person, company } };
}

export async function findConstructionCaseForPortal(db: DatabaseExecutor, id: string, identityId: string) {
  const [row] = await db.select({ ...getTableColumns(constructionCases), process: getTableColumns(processes) }).from(constructionCases).innerJoin(processes, eq(processes.id, constructionCases.processId))
    .where(and(eq(constructionCases.id, id), exists(db.select({ id: constructionParticipants.id }).from(constructionParticipants).where(and(eq(constructionParticipants.caseId, constructionCases.id), eq(constructionParticipants.identityId, identityId), eq(constructionParticipants.isActive, true), isNull(constructionParticipants.endsAt)))))).limit(1);
  return row ?? null;
}
