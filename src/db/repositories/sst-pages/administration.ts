import { and, asc, desc, eq, gte, ilike, inArray, isNull, lte, not, or, sql } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import { sstCertificateReasons } from "@/db/schema/sst-certificates";
import { sstAccessGrants } from "@/db/schema/sst-access";
import { sstBudgetUnits } from "@/db/schema/sst-reference";
import { departments, employees, roles } from "@/db/schema/administration";
import { hrEmploymentRegimes } from "@/db/schema/personnel-configuration";
import { users } from "@/db/schema/identity";
import { people } from "@/db/schema/people";
import { sstProfessionalRoles } from "@/db/schema/sst-clinical";
import { sstBoards, sstBoardMembers, sstPlannedShifts } from "@/db/schema/sst-agenda";
import { sstExposureGroups } from "@/db/schema/sst-programs";
import { exposureMemberWhere } from "@/lib/sst/exposure-policy";
import type { SstAccessGrantPageDto, SstBoardPageDto, SstExposurePageDto, SstPageOption, SstPageResult, SstPageUnit, SstPageUser, SstProfessionalPageDto, SstReasonPageDto, SstShiftPageDto } from "@/lib/contracts/sst-pages";

function pageNumber(value: string | undefined, total: number): number {
  return Math.min(Math.max(1, Math.trunc(Number(value)) || 1), Math.max(1, Math.ceil(total / 20)));
}

export async function readSstSettingsPage(database: DatabaseExecutor, unitIds: string[], requestedPage: string | undefined, admin: boolean): Promise<{
  total: number; page: number; reasons: (SstPageOption & { code: string; budgetUnit: { name: string } })[];
  roles: SstPageOption[]; regimes: SstPageOption[]; users: SstPageUser[]; grants: SstAccessGrantPageDto[];
}> {
  const where = inArray(sstCertificateReasons.budgetUnitId, unitIds);
  const [{ total }] = await database.select({ total: sql<number>`count(*)::int` }).from(sstCertificateReasons).where(where);
  const page = pageNumber(requestedPage, total);
  const reasons = await database.select({ id: sstCertificateReasons.id, code: sstCertificateReasons.code, name: sstCertificateReasons.name, budgetUnit: { name: sstBudgetUnits.name } }).from(sstCertificateReasons).innerJoin(sstBudgetUnits, eq(sstBudgetUnits.id, sstCertificateReasons.budgetUnitId)).where(where).orderBy(asc(sstCertificateReasons.budgetUnitId), asc(sstCertificateReasons.code)).limit(20).offset((page - 1) * 20);
  const roleOptions = await database.select({ id: roles.id, name: roles.name }).from(roles).orderBy(asc(roles.name));
  const regimes = await database.select({ id: hrEmploymentRegimes.id, name: hrEmploymentRegimes.name }).from(hrEmploymentRegimes).where(eq(hrEmploymentRegimes.isActive, true)).orderBy(asc(hrEmploymentRegimes.name), asc(hrEmploymentRegimes.id));
  const userOptions = admin ? await database.select({ id: users.id, nome: users.nome }).from(users).where(eq(users.ativo, true)).orderBy(asc(users.nome)) : [];
  const grants = admin ? await database.select({ grant: sstAccessGrants, budgetUnit: { name: sstBudgetUnits.name } }).from(sstAccessGrants).innerJoin(sstBudgetUnits, eq(sstBudgetUnits.id, sstAccessGrants.budgetUnitId)).orderBy(desc(sstAccessGrants.createdAt)).limit(100).then(rows => rows.map(row => ({ ...row.grant, budgetUnit: row.budgetUnit }))) : [];
  return { total, page, reasons, roles: roleOptions, regimes, users: userOptions, grants };
}

export async function findSstReasonPage(database: DatabaseExecutor, id: string): Promise<SstReasonPageDto | null> {
  const [reason] = await database.select().from(sstCertificateReasons).where(eq(sstCertificateReasons.id, id));
  return reason ? { ...reason, restrictedRoleIds: reason.restrictedRoleIds ?? [] } : null;
}

export async function readSstReasonOptions(database: DatabaseExecutor, id: string): Promise<{
  roles: SstPageOption[]; regimes: SstPageOption[]; policy: { restrictedRegimeIds: string[] } | undefined;
}> {
  const roleOptions = await database.select({ id: roles.id, name: roles.name }).from(roles).orderBy(asc(roles.name));
  const regimes = await database.select({ id: hrEmploymentRegimes.id, name: hrEmploymentRegimes.name }).from(hrEmploymentRegimes).orderBy(asc(hrEmploymentRegimes.name), asc(hrEmploymentRegimes.id));
  const { rows: [policy] } = await database.execute<{ restrictedRegimeIds: string[] }>(sql`SELECT "restrictedRegimeIds" FROM "SstReasonRegimePolicy" WHERE "reasonId"=${id} ORDER BY version DESC LIMIT 1`);
  return { roles: roleOptions, regimes, policy };
}

export async function readSstProfessionalsPage(database: DatabaseExecutor, unitIds: string[], requestedPage: string | undefined, admin: boolean): Promise<SstPageResult<SstProfessionalPageDto> & { users: SstPageUser[] }> {
  const userOptions = admin ? await database.select({ id: users.id, nome: users.nome }).from(users).where(eq(users.ativo, true)).orderBy(asc(users.nome)) : [];
  const where = inArray(sstProfessionalRoles.budgetUnitId, unitIds);
  const [{ total }] = await database.select({ total: sql<number>`count(*)::int` }).from(sstProfessionalRoles).where(where);
  const n = Number(requestedPage);
  const page = Math.min(Number.isFinite(n) ? Math.max(1, Math.trunc(n)) : 1, Math.max(1, Math.ceil(total / 20)));
  const records = await database.select({ role: sstProfessionalRoles, person: { fullName: people.fullName } }).from(sstProfessionalRoles).innerJoin(people, eq(people.id, sstProfessionalRoles.personId)).where(where).orderBy(desc(sstProfessionalRoles.createdAt), asc(sstProfessionalRoles.id)).limit(20).offset((page - 1) * 20).then(rows => rows.map(row => ({ ...row.role, person: row.person })));
  return { users: userOptions, total, page, records };
}

export async function readSstShiftsPage(database: DatabaseExecutor, unitIds: string[], unit: SstPageUnit | undefined, requestedPage: string | undefined): Promise<{ employees: SstPageOption[]; shifts: SstShiftPageDto[]; total: number; page: number }> {
  const workers = unit ? await database.select({ id: employees.id, name: employees.name }).from(employees).where(eq(employees.secretariatId, unit.secretariatId)).orderBy(asc(employees.name)) : [];
  const where = inArray(sstPlannedShifts.budgetUnitId, unit ? [unit.id] : unitIds);
  const [{ total }] = await database.select({ total: sql<number>`count(*)::int` }).from(sstPlannedShifts).where(where);
  const page = pageNumber(requestedPage, total);
  const shifts = await database.select({ shift: sstPlannedShifts, employee: { name: employees.name } }).from(sstPlannedShifts).innerJoin(employees, eq(employees.id, sstPlannedShifts.employeeId)).where(where).orderBy(desc(sstPlannedShifts.startsAt), asc(sstPlannedShifts.id)).limit(20).offset((page - 1) * 20).then(rows => rows.map(row => ({ ...row.shift, employee: row.employee })));
  return { employees: workers, total, page, shifts };
}

export async function readSstBoardsPage(database: DatabaseExecutor, unitIds: string[], requestedPage: string | undefined): Promise<{ boards: SstBoardPageDto[]; total: number; page: number }> {
  const where = inArray(sstBoards.budgetUnitId, unitIds);
  const [{ total }] = await database.select({ total: sql<number>`count(*)::int` }).from(sstBoards).where(where);
  const page = pageNumber(requestedPage, total);
  const boardRows = await database.select({ board: sstBoards, budgetUnit: { name: sstBudgetUnits.name } }).from(sstBoards).innerJoin(sstBudgetUnits, eq(sstBudgetUnits.id, sstBoards.budgetUnitId)).where(where).orderBy(desc(sstBoards.startsAt), asc(sstBoards.id)).limit(20).offset((page - 1) * 20);
  const members = await database.select({ member: sstBoardMembers, person: { fullName: people.fullName } }).from(sstBoardMembers).innerJoin(people, eq(people.id, sstBoardMembers.personId)).where(inArray(sstBoardMembers.boardId, boardRows.map(row => row.board.id))).then(rows => rows.map(row => ({ ...row.member, person: row.person })));
  const boards = boardRows.map(row => ({ ...row.board, budgetUnit: row.budgetUnit, members: members.filter(member => member.boardId === row.board.id) }));
  return { boards, total, page };
}

export async function readSstExposurePage(database: DatabaseExecutor, unit: SstPageUnit | undefined, params: { groupId?: string; without?: string; q?: string; page?: string; groupPage?: string }, now: Date): Promise<{
  groups: SstExposurePageDto[]; selected: SstExposurePageDto | undefined; departments: SstPageOption[]; roles: SstPageOption[];
  workers: { id: string; name: string; registration: string | null; roleId: string | null; departmentId: string | null }[];
  groupTotal: number; total: number; page: number; groupPage: number;
}> {
  const groupWhere = and(eq(sstExposureGroups.budgetUnitId, unit?.id || "__no_unit__"), eq(sstExposureGroups.isActive, true), lte(sstExposureGroups.startsAt, now), or(isNull(sstExposureGroups.endsAt), gte(sstExposureGroups.endsAt, now)));
  const groups = (await database.select().from(sstExposureGroups).where(groupWhere).orderBy(asc(sstExposureGroups.code), asc(sstExposureGroups.id)).limit(2000)).map(group => ({ ...group, departmentIds: group.departmentIds ?? [], roleIds: group.roleIds ?? [] }));
  const [{ total: groupTotal }] = await database.select({ total: sql<number>`count(*)::int` }).from(sstExposureGroups).where(groupWhere);
  if (groupTotal > 2000) throw new Error("Restrinja os grupos vigentes antes de consultar os servidores sem GHE.");
  const selected = groups.find(item => item.id === params.groupId);
  const departmentOptions = unit ? await database.select({ id: departments.id, name: departments.name }).from(departments).where(eq(departments.secretariatId, unit.secretariatId)).orderBy(asc(departments.name)) : [];
  const roleOptions = await database.select({ id: roles.id, name: roles.name }).from(roles).where(eq(roles.isActive, true)).orderBy(asc(roles.name));
  const memberWhere = unit ? and(exposureMemberWhere(params.without !== "1" && selected ? selected : { roleIds: [], departmentIds: [] }, unit.secretariatId), params.without === "1" && groups.length ? not(sql`COALESCE(${or(...groups.map(group => exposureMemberWhere(group, unit.secretariatId)))}, FALSE)`) : undefined, params.q ? ilike(employees.name, `%${params.q}%`) : undefined) : eq(employees.id, "__no_employee__");
  const [{ total }] = await database.select({ total: sql<number>`count(*)::int` }).from(employees).where(memberWhere);
  const page = pageNumber(params.page, total);
  const workers = await database.select({ id: employees.id, name: employees.name, registration: employees.registration, roleId: employees.roleId, departmentId: employees.departmentId }).from(employees).where(memberWhere).orderBy(asc(employees.name), asc(employees.id)).limit(20).offset((page - 1) * 20);
  const groupPage = pageNumber(params.groupPage, groups.length);
  return { groups, selected, departments: departmentOptions, roles: roleOptions, workers, groupTotal, total, page, groupPage };
}
