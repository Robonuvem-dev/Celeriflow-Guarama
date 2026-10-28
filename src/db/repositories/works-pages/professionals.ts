import { and, asc, count, desc, eq, getTableColumns, ne } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import type { WorksSearch } from "@/lib/contracts/works-pages";
import { constructionProfessionals as profiles, constructionPortalIdentities as identities } from "@/db/schema/construction-core";
import { constructionCompanyProfiles as companyProfiles, constructionProfessionalEmployers as employers, constructionStaffRoles as staff } from "@/db/schema/construction-portal";
import { people } from "@/db/schema/people";
import { companies } from "@/db/schema/registry";
import { departments, employees } from "@/db/schema/administration";
import { contains, listPageCompanies, listPageDepartments, listPageEmployees, listPagePeople, worksPage } from "./shared";

export async function loadPageCompanies(database: DatabaseExecutor, input: WorksSearch) {
  const where = and(input.status === "all" ? undefined : eq(companyProfiles.isActive, input.status === "active"), input.q ? contains(companies.corporateName, input.q) : undefined);
  const total = (await database.select({ value: count() }).from(companyProfiles).innerJoin(companies, eq(companies.id, companyProfiles.companyId)).where(where))[0].value;
  const page = worksPage(input.page, total);
  const [rows, options] = await Promise.all([
    database.select({ ...getTableColumns(companyProfiles), company: { corporateName: companies.corporateName } }).from(companyProfiles).innerJoin(companies, eq(companies.id, companyProfiles.companyId)).where(where).orderBy(asc(companies.corporateName), asc(companyProfiles.id)).offset((page - 1) * 20).limit(20),
    listPageCompanies(database, false),
  ]);
  return { total, page, rows, companies: options };
}
export async function loadPageStaff(database: DatabaseExecutor, input: WorksSearch) {
  const where = and(input.status === "all" ? undefined : eq(staff.isActive, input.status === "active"), input.q ? contains(employees.name, input.q) : undefined);
  const total = (await database.select({ value: count() }).from(staff).innerJoin(employees, eq(employees.id, staff.employeeId)).where(where))[0].value;
  const page = worksPage(input.page, total);
  const [links, employeeOptions, departmentOptions] = await Promise.all([
    database.select({ ...getTableColumns(staff), employee: { name: employees.name }, department: { name: departments.name } }).from(staff).innerJoin(employees, eq(employees.id, staff.employeeId)).innerJoin(departments, eq(departments.id, staff.departmentId)).where(where).orderBy(asc(employees.name), desc(staff.startsAt)).offset((page - 1) * 20).limit(20),
    listPageEmployees(database), listPageDepartments(database),
  ]);
  return { total, page, links, employees: employeeOptions, departments: departmentOptions };
}
export async function loadPageProfessionals(database: DatabaseExecutor, input: WorksSearch & { tab: string }) {
  const profileWhere = and(input.status === "all" ? undefined : eq(profiles.isActive, input.status === "active"), input.q ? contains(people.fullName, input.q) : undefined);
  const employerWhere = and(input.status === "all" ? undefined : eq(employers.isActive, input.status === "active"), input.q ? contains(companies.corporateName, input.q) : undefined);
  const total = input.tab === "professionals" ? (await database.select({ value: count() }).from(profiles).innerJoin(people, eq(people.id, profiles.personId)).where(profileWhere))[0].value
    : (await database.select({ value: count() }).from(employers).innerJoin(companies, eq(companies.id, employers.companyId)).where(employerWhere))[0].value;
  const page = worksPage(input.page, total);
  const [profileRows, employerRows, personOptions, companyOptions, professionalOptions] = await Promise.all([
    input.tab === "professionals" ? database.select({ ...getTableColumns(profiles), person: { fullName: people.fullName } }).from(profiles).innerJoin(people, eq(people.id, profiles.personId)).where(profileWhere).orderBy(asc(people.fullName), asc(profiles.id)).offset((page - 1) * 20).limit(20) : [],
    input.tab === "companies" ? database.select({ employer: employers, company: { corporateName: companies.corporateName }, professional: profiles, person: { fullName: people.fullName } }).from(employers).innerJoin(companies, eq(companies.id, employers.companyId)).innerJoin(profiles, eq(profiles.id, employers.professionalId)).innerJoin(people, eq(people.id, profiles.personId)).where(employerWhere).orderBy(asc(companies.corporateName), asc(employers.id)).offset((page - 1) * 20).limit(20).then(rows => rows.map(row => ({ ...row.employer, company: row.company, professional: { ...row.professional, person: row.person } }))) : [],
    listPagePeople(database), listPageCompanies(database),
    database.select({ id: profiles.id, person: { fullName: people.fullName }, council: profiles.council, registration: profiles.registration }).from(profiles).innerJoin(people, eq(people.id, profiles.personId)).where(and(eq(profiles.isActive, true), ne(profiles.professionalType, "BROKER"))).orderBy(asc(people.fullName)),
  ]);
  return { total, page, profiles: profileRows, employers: employerRows, people: personOptions, companies: companyOptions, professionalOptions };
}
export function listPagePortalIdentities(database: DatabaseExecutor) {
  return database.select({ id: identities.id, fullName: people.fullName }).from(identities).innerJoin(profiles, eq(profiles.id, identities.professionalId)).innerJoin(people, eq(people.id, profiles.personId)).where(eq(identities.isActive, true))
    .then(rows => rows.map(row => ({ id: row.id, professional: { person: { fullName: row.fullName } } })));
}
export function listPagePortalProfessionals(database: DatabaseExecutor) {
  return database.select({ ...getTableColumns(profiles), person: { fullName: people.fullName }, portalIdentity: { firebaseUid: identities.firebaseUid, email: identities.email, isActive: identities.isActive } }).from(profiles).innerJoin(people, eq(people.id, profiles.personId)).leftJoin(identities, eq(identities.professionalId, profiles.id)).orderBy(asc(people.fullName));
}
