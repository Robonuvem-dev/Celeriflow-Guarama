import { and, asc, desc, eq, gte, ilike, inArray, lte, sql } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import type { JsonValue } from "@/db/json";
import { databaseTimestamp } from "@/db/temporal";
import { sstAsos, sstAnamneses, sstQuestionnaires } from "@/db/schema/sst-clinical";
import { sstPrograms, sstProgramGroups } from "@/db/schema/sst-programs";
import { people } from "@/db/schema/people";
import { companies } from "@/db/schema/registry";
import type { SstPageResult, SstProgramGroupPageDto, SstQuestionnairePageDto } from "@/lib/contracts/sst-pages";

export async function readSstAsosPage(database: DatabaseExecutor, unitIds: string[], params: { q?: string; page?: string }, from: Date | undefined, to: Date | undefined): Promise<SstPageResult<{
  id: string; kind: string; result: string; performedAt: Date; validUntil: Date; snapshot: JsonValue;
}>> {
  const where = and(inArray(sstAsos.budgetUnitId, unitIds), params.q?.trim() ? sql`EXISTS(SELECT 1 FROM ${people} WHERE ${people.id}=${sstAsos.personId} AND ${people.fullName} ILIKE ${`%${params.q.trim().slice(0, 200)}%`})` : undefined, from ? gte(sstAsos.validUntil, from) : undefined, to ? lte(sstAsos.validUntil, to) : undefined);
  const [{ total }] = await database.select({ total: sql<number>`count(*)::int` }).from(sstAsos).where(where);
  const requestedPage = Number(params.page);
  const page = Math.min(Number.isFinite(requestedPage) ? Math.max(1, Math.trunc(requestedPage)) : 1, Math.max(1, Math.ceil(total / 20)));
  const records = await database.select({ id: sstAsos.id, kind: sstAsos.kind, result: sstAsos.result, performedAt: sstAsos.performedAt, validUntil: sstAsos.validUntil, snapshot: sstAsos.snapshot }).from(sstAsos).where(where).orderBy(desc(sstAsos.performedAt), asc(sstAsos.id)).limit(20).offset((page - 1) * 20);
  return { total, page, records };
}
export async function searchSstAsoLaboratories(database: DatabaseExecutor, term: string): Promise<{ id: string; corporateName: string }[]> {
  return database.select({ id: companies.id, corporateName: companies.corporateName }).from(companies).where(ilike(companies.corporateName, `%${term.trim().slice(0, 200)}%`)).orderBy(asc(companies.corporateName), asc(companies.id)).limit(20);
}
export async function readSstAsoPrograms(database: DatabaseExecutor, unitId: string): Promise<(SstProgramGroupPageDto & { program: { code: string; version: number } })[]> {
  return database.select({ group: sstProgramGroups, program: { code: sstPrograms.code, version: sstPrograms.version } }).from(sstProgramGroups).innerJoin(sstPrograms, eq(sstPrograms.id, sstProgramGroups.programId)).where(and(eq(sstPrograms.budgetUnitId, unitId), eq(sstPrograms.kind, "PCMSO"))).orderBy(desc(sstPrograms.createdAt), asc(sstProgramGroups.id)).limit(200).then(rows => rows.map(row => ({ ...row.group, program: row.program })));
}
export async function readSstAsoQuestionnaires(database: DatabaseExecutor, unitId: string): Promise<SstQuestionnairePageDto[]> {
  return database.select().from(sstQuestionnaires).where(and(eq(sstQuestionnaires.budgetUnitId, unitId), eq(sstQuestionnaires.discipline, "MEDICINE"))).orderBy(desc(sstQuestionnaires.createdAt), asc(sstQuestionnaires.id)).limit(200);
}
export async function readSstAsoFunctionalPeriods(database: DatabaseExecutor, unitId: string, personIds: string[]): Promise<{
  id: string; employeeName: string; contractReference: string; governmentEntityId: string; startsAt: Date; endsAt: Date;
}[]> {
  const result = await database.execute<{ id: string; employeeName: string; contractReference: string; governmentEntityId: string; startsAt: string | Date; endsAt: string | Date }>(sql`SELECT p.id,e.name AS "employeeName",p."contractReference",p."governmentEntityId",p."startsAt",p."endsAt" FROM "HrEmployeeFunctionalPeriod" p JOIN "Employee" e ON e.id=p."employeeId" WHERE p."budgetUnitId"=${unitId} AND e."personId"=ANY(${sql.param(personIds)}::text[]) AND NOT p.voided AND NOT EXISTS (SELECT 1 FROM "HrEmployeeFunctionalPeriod" n WHERE n."supersedesId"=p.id) ORDER BY p."startsAt" DESC,p.id LIMIT 200`);
  return result.rows.map(row => ({ ...row, startsAt: databaseTimestamp(row.startsAt), endsAt: databaseTimestamp(row.endsAt) }));
}
export async function findSstAsoSettings(database: DatabaseExecutor, unitId: string): Promise<{ suggestedResults: string[]; vacationWarningDays: number } | undefined> {
  return (await database.execute<{ suggestedResults: string[]; vacationWarningDays: number }>(sql`SELECT "suggestedResults","vacationWarningDays" FROM "SstAsoFlowSettings" WHERE "budgetUnitId"=${unitId}`)).rows[0];
}
export async function findSstAsoScope(database: DatabaseExecutor, id: string): Promise<{ budgetUnitId: string } | undefined> {
  return (await database.select({ budgetUnitId: sstAsos.budgetUnitId }).from(sstAsos).where(eq(sstAsos.id, id)))[0];
}
export async function findSstAsoCorrection(database: DatabaseExecutor, id: string): Promise<{ kind: string; replacementAsoId: string | null } | undefined> {
  return (await database.execute<{ kind: string; replacementAsoId: string | null }>(sql`SELECT kind,"replacementAsoId" FROM "SstAsoCorrection" WHERE "asoId"=${id}`)).rows[0];
}
export async function readSstAnamnesisHistory(database: DatabaseExecutor, id: string, unitId: string, search: { q?: string; page?: string; questionnaireVersionId?: string }): Promise<{
  versions: { id: string; code: string; title: string; version: number }[];
  selected: SstQuestionnairePageDto | null | undefined; total: number; page: number;
  history: { id: string; revision: number; createdAt: Date; questionnaireVersion: { title: string; version: number } }[];
}> {
  const versionScope = and(eq(sstQuestionnaires.discipline, "MEDICINE"), eq(sstQuestionnaires.budgetUnitId, unitId));
  const versions = await database.select({ id: sstQuestionnaires.id, code: sstQuestionnaires.code, title: sstQuestionnaires.title, version: sstQuestionnaires.version }).from(sstQuestionnaires).where(and(versionScope, search.q?.trim() ? ilike(sstQuestionnaires.title, `%${search.q.trim().slice(0, 200)}%`) : undefined)).orderBy(desc(sstQuestionnaires.createdAt), asc(sstQuestionnaires.id)).limit(20);
  const selected = search.questionnaireVersionId ? (await database.select().from(sstQuestionnaires).where(and(versionScope, eq(sstQuestionnaires.id, search.questionnaireVersionId))).limit(1))[0] : null;
  const [{ total }] = await database.select({ total: sql<number>`count(*)::int` }).from(sstAnamneses).where(eq(sstAnamneses.asoId, id));
  const requestedPage = Number(search.page);
  const page = Math.min(Number.isFinite(requestedPage) ? Math.max(1, Math.trunc(requestedPage)) : 1, Math.max(1, Math.ceil(total / 20)));
  const history = await database.select({ id: sstAnamneses.id, revision: sstAnamneses.revision, createdAt: sstAnamneses.createdAt, questionnaireVersion: { title: sstQuestionnaires.title, version: sstQuestionnaires.version } }).from(sstAnamneses).innerJoin(sstQuestionnaires, eq(sstQuestionnaires.id, sstAnamneses.questionnaireVersionId)).where(eq(sstAnamneses.asoId, id)).orderBy(desc(sstAnamneses.revision), asc(sstAnamneses.id)).limit(20).offset((page - 1) * 20);
  return { versions, selected, total, page, history };
}
export async function findSstAnamnesisScope(database: DatabaseExecutor, id: string): Promise<{ aso: { budgetUnitId: string } } | undefined> {
  return (await database.select({ aso: { budgetUnitId: sstAsos.budgetUnitId } }).from(sstAnamneses).innerJoin(sstAsos, eq(sstAsos.id, sstAnamneses.asoId)).where(eq(sstAnamneses.id, id)))[0];
}
export async function findSstAnamnesisPage(database: DatabaseExecutor, id: string): Promise<{
  id: string; asoId: string; questionnaireVersionId: string; revision: number; answers: JsonValue;
  snapshot: JsonValue; revisionReason: string; submissionKey: string; requestHash: string; createdById: string; createdAt: Date;
} | undefined> {
  return (await database.select().from(sstAnamneses).where(eq(sstAnamneses.id, id)))[0];
}
