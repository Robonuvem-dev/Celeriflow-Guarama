import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import { databaseTimestamp } from "@/db/temporal";
import { sstProfessionalRoles, sstQuestionnaires } from "@/db/schema/sst-clinical";
import { people } from "@/db/schema/people";
import { employees, roles } from "@/db/schema/administration";
import type { SstPageOption, SstPagePerson, SstPageResult, SstProfessionalPageDto, SstQuestionnairePageDto } from "@/lib/contracts/sst-pages";

export async function readSstQuestionnairesPage(database: DatabaseExecutor, unitIds: string[], params: { q?: string; page?: string }): Promise<SstPageResult<{ id: string; code: string; title: string; version: number }>> {
  const where = and(eq(sstQuestionnaires.discipline, "MEDICINE"), inArray(sstQuestionnaires.budgetUnitId, unitIds), params.q?.trim() ? ilike(sstQuestionnaires.title, `%${params.q.trim().slice(0, 200)}%`) : undefined);
  const [{ total }] = await database.select({ total: sql<number>`count(*)::int` }).from(sstQuestionnaires).where(where);
  const n = Number(params.page);
  const page = Math.min(Number.isFinite(n) ? Math.max(1, Math.trunc(n)) : 1, Math.max(1, Math.ceil(total / 20)));
  const records = await database.select({ id: sstQuestionnaires.id, code: sstQuestionnaires.code, title: sstQuestionnaires.title, version: sstQuestionnaires.version }).from(sstQuestionnaires).where(where).orderBy(desc(sstQuestionnaires.createdAt), asc(sstQuestionnaires.id)).limit(20).offset((page - 1) * 20);
  return { total, page, records };
}
export async function findSstQuestionnaireScope(database: DatabaseExecutor, id: string): Promise<{ budgetUnitId: string; discipline: string } | undefined> {
  const [row] = await database.select({ budgetUnitId: sstQuestionnaires.budgetUnitId, discipline: sstQuestionnaires.discipline }).from(sstQuestionnaires).where(eq(sstQuestionnaires.id, id));
  return row;
}
export async function findSstQuestionnairePage(database: DatabaseExecutor, id: string): Promise<SstQuestionnairePageDto | undefined> {
  const [row] = await database.select().from(sstQuestionnaires).where(eq(sstQuestionnaires.id, id));
  return row;
}
export async function searchSstWorkerPeople(database: DatabaseExecutor, term: string): Promise<SstPagePerson[]> {
  return (await database.execute<SstPagePerson>(sql`SELECT p.id,p."fullName" FROM "Person" p WHERE p."fullName" ILIKE ${`%${term.trim().slice(0, 200)}%`} AND EXISTS(SELECT 1 FROM "Employee" e WHERE e."personId"=p.id) ORDER BY p."fullName",p.id LIMIT 20`)).rows;
}
export async function searchSstPageVaccines(database: DatabaseExecutor, term: string): Promise<SstPageOption[]> {
  return (await database.execute<SstPageOption>(sql`SELECT id,name FROM "Vaccine" WHERE "isActive" AND name ILIKE ${`%${term.trim().slice(0, 200)}%`} ORDER BY name,id LIMIT 20`)).rows;
}
export async function searchSstPageMedicines(database: DatabaseExecutor, term: string): Promise<SstPageOption[]> {
  return (await database.execute<SstPageOption>(sql`SELECT id,name FROM "Medicine" WHERE "isActive" AND name ILIKE ${`%${term.trim().slice(0, 200)}%`} ORDER BY name,id LIMIT 20`)).rows;
}
export async function readSstUserProfessionals(database: DatabaseExecutor, unitId: string, discipline: string, usuarioId: string, latestFirst: boolean): Promise<SstProfessionalPageDto[]> {
  const query = database.select({ role: sstProfessionalRoles, person: { fullName: people.fullName } }).from(sstProfessionalRoles).innerJoin(people, eq(people.id, sstProfessionalRoles.personId)).where(and(eq(sstProfessionalRoles.budgetUnitId, unitId), eq(sstProfessionalRoles.discipline, discipline), eq(sstProfessionalRoles.isActive, true), eq(sstProfessionalRoles.usuarioId, usuarioId)));
  const rows = latestFirst ? await query.orderBy(desc(sstProfessionalRoles.startsAt)).limit(100) : await query.limit(100);
  return rows.map(row => ({ ...row.role, person: row.person }));
}
export async function readSstClinicalQuestionnaireOptions(database: DatabaseExecutor, unitId: string | undefined, discipline: string, params: { templateQ?: string; questionnaireVersionId?: string }): Promise<{
  versions: { id: string; title: string; version: number }[]; selected: SstQuestionnairePageDto | null | undefined;
}> {
  const scope = unitId ? and(eq(sstQuestionnaires.budgetUnitId, unitId), eq(sstQuestionnaires.discipline, discipline)) : sql`FALSE`;
  const versions = unitId ? await database.select({ id: sstQuestionnaires.id, title: sstQuestionnaires.title, version: sstQuestionnaires.version }).from(sstQuestionnaires).where(and(scope, params.templateQ?.trim() ? ilike(sstQuestionnaires.title, `%${params.templateQ.trim().slice(0, 200)}%`) : undefined)).orderBy(desc(sstQuestionnaires.createdAt), asc(sstQuestionnaires.id)).limit(20) : [];
  const selected = unitId && params.questionnaireVersionId ? (await database.select().from(sstQuestionnaires).where(and(scope, eq(sstQuestionnaires.id, params.questionnaireVersionId))).limit(1))[0] : null;
  return { versions, selected };
}
export async function readSstRestrictionOptions(database: DatabaseExecutor, units: { id: string; secretariatId: string }[], names: string[]): Promise<{
  employees: { id: string; name: string; roleId: string | null }[];
  roles: { id: string; council: string; person: { fullName: string } }[];
  attributes: { id: string; roleId: string; description: string }[]; canonicalRoles: SstPageOption[];
}> {
  const workers = names.length ? await database.select({ id: employees.id, name: employees.name, roleId: employees.roleId }).from(employees).where(and(eq(employees.isActive, true), or(...names.map(name => ilike(employees.name, `%${name}%`))), inArray(employees.secretariatId, units.map(u => u.secretariatId)))).orderBy(asc(employees.name), asc(employees.id)).limit(20) : [];
  const professionalRows = units.length ? (await database.execute<{ id: string; council: string; fullName: string }>(sql`SELECT r."id",r."council",p."fullName" FROM "SstProfessionalRole" r JOIN "Person" p ON p."id"=r."personId" WHERE r."budgetUnitId" IN (${sql.join(units.map(u => sql`${u.id}`), sql`,`)}) AND r."discipline"='MEDICINE' AND r."isActive" ORDER BY p."fullName",r."id"`)).rows : [];
  const attributes = (await database.execute<{ id: string; roleId: string; description: string }>(sql`SELECT id,"roleId",description FROM "SstRoleAttribute" ORDER BY "roleId","description"`)).rows;
  const canonicalRoles = await database.select({ id: roles.id, name: roles.name }).from(roles).where(eq(roles.isActive, true)).orderBy(asc(roles.name), asc(roles.id));
  return { employees: workers, roles: professionalRows.map(r => ({ id: r.id, council: r.council, person: { fullName: r.fullName } })), attributes, canonicalRoles };
}
export async function readSstRestrictionDetailsOptions(database: DatabaseExecutor, id: string, unitId: string): Promise<{
  outbox: { status: string; dueAt: Date; providerReceipt: string | null }[];
  doctors: { id: string; fullName: string; council: string }[];
}> {
  const outbox = (await database.execute<{ status: string; dueAt: string | Date; providerReceipt: string | null }>(sql`SELECT "status","dueAt","providerReceipt" FROM "SstRestrictionEmailOutbox" WHERE "restrictionId"=${id}`)).rows.map(row => ({ ...row, dueAt: databaseTimestamp(row.dueAt) }));
  const doctors = (await database.execute<{ id: string; fullName: string; council: string }>(sql`SELECT r."id",p."fullName",r."council" FROM "SstProfessionalRole" r JOIN "Person" p ON p."id"=r."personId" WHERE r."budgetUnitId"=${unitId} AND r."discipline"='MEDICINE' AND r."isActive" ORDER BY p."fullName",r."id"`)).rows;
  return { outbox, doctors };
}
