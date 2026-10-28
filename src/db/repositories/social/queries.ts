import { and, asc, count, desc, eq, getTableColumns, gte, inArray, lt, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { DatabaseExecutor } from "../../transaction";
import { employees, institutions, secretariats } from "../../schema/administration";
import { people } from "../../schema/people";
import { realEstates, addresses } from "../../schema/registry";
import { socialAttendances, socialBenefits, socialBenefitQuotas, socialBenefitRequests, socialBenefitRequestItems, socialBenefitStocks, socialCatalogEntries, socialFamilies, socialFamilyMembers, socialFinancialEntries, socialMinimumWages, socialNetworkOrganizations, socialPersonFacts, socialPersonProfiles, socialProfessionalLinks, socialPrograms, socialReferrals, socialUnits, socialVisits } from "../../schema/social";
import { socialAttendanceWhere, socialHistoryWhere, type SocialAccess } from "@/lib/social/access-policy";
import type { SocialAttendanceDetails, SocialBenefitQuotaRecord, SocialBenefitRecord, SocialBenefitRequestDetails, SocialBenefitStockRecord, SocialCatalogRecord, SocialFamilyDetails, SocialFinancialEntryRecord, SocialNetworkOrganizationRecord, SocialPersonFactRecord, SocialPersonProfileRecord, SocialProfessionalLinkRecord, SocialProgramRecord, SocialReferralDetails, SocialUnitDetails } from "@/lib/contracts/social";
import type { PersonRecord, RealEstateRecord } from "@/lib/contracts/registry";
import type { EmployeeRecord, InstitutionRecord } from "@/lib/contracts/administration";
import { socialBenefitConcessions } from "../../schema/social";
import { socialBudgetAppropriations, socialExpenseNatures } from "../../schema/social-finance-options";

const representative = alias(people, "representative");
const professionalPerson = alias(people, "professional_person");

export async function findSocialInstitution(database: DatabaseExecutor): Promise<InstitutionRecord | null> {
  const [row] = await database.select().from(institutions).limit(1);
  return row ?? null;
}

export async function listSocialUnits(database: DatabaseExecutor): Promise<SocialUnitDetails[]> {
  const rows = await database.select({ unit: socialUnits, realEstate: realEstates, manager: employees }).from(socialUnits).leftJoin(realEstates, eq(realEstates.id, socialUnits.realEstateId)).leftJoin(employees, eq(employees.id, socialUnits.managerId)).orderBy(asc(socialUnits.name));
  return rows.map(({ unit, ...relations }) => ({ ...unit, ...relations }));
}

export async function listSocialRealEstates(database: DatabaseExecutor): Promise<RealEstateRecord[]> { return database.select().from(realEstates).orderBy(asc(realEstates.streetName)); }
export async function listSocialEmployees(database: DatabaseExecutor): Promise<EmployeeRecord[]> { return database.select().from(employees).where(eq(employees.isActive, true)).orderBy(asc(employees.name)); }
export async function listSocialPeople(database: DatabaseExecutor): Promise<PersonRecord[]> { return database.select().from(people).orderBy(asc(people.fullName)); }

export async function listSocialFamilies(database: DatabaseExecutor): Promise<SocialFamilyDetails[]> {
  const rows = await database.select({ family: socialFamilies, representative: people }).from(socialFamilies).innerJoin(people, eq(people.id, socialFamilies.representativeId)).orderBy(desc(socialFamilies.createdAt));
  const members = rows.length ? await database.select().from(socialFamilyMembers).where(inArray(socialFamilyMembers.familyId, rows.map(row => row.family.id))) : [];
  return rows.map(({ family, representative }) => ({ ...family, representative, members: members.filter(member => member.familyId === family.id) }));
}

export async function listSocialAttendances(database: DatabaseExecutor, access: SocialAccess): Promise<SocialAttendanceDetails[]> {
  const rows = await database.select({ attendance: socialAttendances, family: socialFamilies, representative, person: people, unit: socialUnits, professional: employees, professionalPerson }).from(socialAttendances)
    .innerJoin(socialFamilies, eq(socialFamilies.id, socialAttendances.familyId)).innerJoin(representative, eq(representative.id, socialFamilies.representativeId))
    .leftJoin(people, eq(people.id, socialAttendances.personId)).innerJoin(socialUnits, eq(socialUnits.id, socialAttendances.unitId)).innerJoin(employees, eq(employees.id, socialAttendances.professionalId)).leftJoin(professionalPerson, eq(professionalPerson.id, employees.personId))
    .where(socialAttendanceWhere(access)).orderBy(desc(socialAttendances.date));
  return rows.map(row => ({ ...row.attendance, family: { ...row.family, representative: row.representative }, person: row.person, unit: row.unit, professional: { ...row.professional, person: row.professionalPerson } }));
}

export async function socialAttendanceOptions(database: DatabaseExecutor, access: SocialAccess): Promise<{ families: { id: string; representative: { fullName: string } }[]; units: { id: string; name: string }[]; professionals: { id: string; name: string }[] }> {
  const [families, units, professionals] = await Promise.all([
    database.select({ id: socialFamilies.id, representative: { fullName: people.fullName } }).from(socialFamilies).innerJoin(people, eq(people.id, socialFamilies.representativeId)).where(!access.administrator && !access.links.length ? sql`false` : undefined).orderBy(asc(people.fullName)),
    database.select({ id: socialUnits.id, name: socialUnits.name }).from(socialUnits).where(and(eq(socialUnits.isActive, true), access.administrator ? undefined : inArray(socialUnits.id, access.links.map(link => link.unitId)))).orderBy(asc(socialUnits.name)),
    database.select({ id: employees.id, name: employees.name }).from(employees).where(and(eq(employees.isActive, true), access.administrator ? undefined : eq(employees.id, access.employeeId || ""))).orderBy(asc(employees.name)),
  ]);
  return { families, units, professionals };
}

export async function listSocialCatalogs(database: DatabaseExecutor, kinds?: string[]): Promise<SocialCatalogRecord[]> { return database.select().from(socialCatalogEntries).where(kinds ? and(eq(socialCatalogEntries.isActive, true), inArray(socialCatalogEntries.kind, kinds)) : undefined).orderBy(...(kinds ? [asc(socialCatalogEntries.name)] : [asc(socialCatalogEntries.kind), asc(socialCatalogEntries.name)])); }
export async function listSocialWages(database: DatabaseExecutor): Promise<{ id: string; validFrom: Date; value: import("@/db/decimal").Decimal; createdAt: Date; updatedAt: Date }[]> { return database.select().from(socialMinimumWages).orderBy(desc(socialMinimumWages.validFrom)); }
export async function listSocialBenefits(database: DatabaseExecutor): Promise<SocialBenefitRecord[]> { return database.select().from(socialBenefits).orderBy(asc(socialBenefits.name)); }
export async function listSocialPrograms(database: DatabaseExecutor): Promise<SocialProgramRecord[]> { return database.select().from(socialPrograms).orderBy(asc(socialPrograms.name)); }

export async function socialBenefitFinanceOptions(database: DatabaseExecutor) {
  const [secretariatRows, appropriationRows] = await Promise.all([
    database.select().from(secretariats).orderBy(asc(secretariats.name)),
    database.select({ appropriation: socialBudgetAppropriations, expenseNature: socialExpenseNatures }).from(socialBudgetAppropriations).innerJoin(socialExpenseNatures, eq(socialExpenseNatures.id, socialBudgetAppropriations.expenseNatureId)).orderBy(asc(socialBudgetAppropriations.code)),
  ]);
  return { secretariats: secretariatRows, appropriations: appropriationRows.map(({ appropriation, expenseNature }) => ({ ...appropriation, expenseNature })) };
}

export async function socialPersonAttendances(database: DatabaseExecutor, access: SocialAccess, personId: string): Promise<{ id: string; date: Date; type: string; description: string; secrecyLevel: string; unit: { name: string } }[]> {
  return database.select({ id: socialAttendances.id, date: socialAttendances.date, type: socialAttendances.type, description: socialAttendances.description, secrecyLevel: socialAttendances.secrecyLevel, unit: { name: socialUnits.name } }).from(socialAttendances).innerJoin(socialUnits, eq(socialUnits.id, socialAttendances.unitId)).where(and(eq(socialAttendances.personId, personId), socialAttendanceWhere(access))).orderBy(desc(socialAttendances.date));
}

export async function socialAccessibleUnitOptions(database: DatabaseExecutor, access: SocialAccess): Promise<{ id: string; name: string }[]> {
  return database.select({ id: socialUnits.id, name: socialUnits.name }).from(socialUnits).where(and(eq(socialUnits.isActive, true), access.administrator ? undefined : inArray(socialUnits.id, access.links.map(link => link.unitId)))).orderBy(asc(socialUnits.name));
}

export async function listSocialLinks(database: DatabaseExecutor): Promise<(SocialProfessionalLinkRecord & { employee: { name: string }; unit: { name: string } })[]> {
  const rows = await database.select({ link: socialProfessionalLinks, employee: { name: employees.name }, unit: { name: socialUnits.name } }).from(socialProfessionalLinks).innerJoin(employees, eq(employees.id, socialProfessionalLinks.employeeId)).innerJoin(socialUnits, eq(socialUnits.id, socialProfessionalLinks.unitId)).orderBy(asc(employees.name), asc(socialUnits.name));
  return rows.map(({ link, ...relations }) => ({ ...link, ...relations }));
}

export async function listSocialReferrals(database: DatabaseExecutor, access: SocialAccess, id?: string): Promise<SocialReferralDetails[]> {
  const rows = await database.select({ referral: socialReferrals, unit: { name: socialUnits.name }, destinationOrganization: socialNetworkOrganizations }).from(socialReferrals).innerJoin(socialUnits, eq(socialUnits.id, socialReferrals.unitId)).innerJoin(socialNetworkOrganizations, eq(socialNetworkOrganizations.id, socialReferrals.destinationOrganizationId)).where(and(id ? eq(socialReferrals.id, id) : undefined, access.administrator ? undefined : inArray(socialReferrals.unitId, access.links.map(link => link.unitId)))).orderBy(desc(socialReferrals.referredAt));
  return rows.map(({ referral, ...relations }) => ({ ...referral, ...relations }));
}
export async function listSocialOrganizations(database: DatabaseExecutor): Promise<SocialNetworkOrganizationRecord[]> { return database.select().from(socialNetworkOrganizations).orderBy(asc(socialNetworkOrganizations.name)); }

export async function listSocialBenefitRequests(database: DatabaseExecutor, access: SocialAccess, id?: string): Promise<SocialBenefitRequestDetails[]> {
  const rows = await database.select({ request: socialBenefitRequests, unit: { name: socialUnits.name, streetAddress: socialUnits.streetAddress, municipality: socialUnits.municipality }, familyCode: socialFamilies.familyCode, representative: { fullName: people.fullName, socialName: people.socialName, cpf: people.cpf } }).from(socialBenefitRequests).innerJoin(socialUnits, eq(socialUnits.id, socialBenefitRequests.unitId)).innerJoin(socialFamilies, eq(socialFamilies.id, socialBenefitRequests.familyId)).innerJoin(people, eq(people.id, socialFamilies.representativeId)).where(and(id ? eq(socialBenefitRequests.id, id) : undefined, access.administrator ? undefined : inArray(socialBenefitRequests.unitId, access.links.map(link => link.unitId)))).orderBy(desc(socialBenefitRequests.createdAt));
  const items = rows.length ? await database.select({ ...getTableColumns(socialBenefitRequestItems), benefit: { name: socialBenefits.name } }).from(socialBenefitRequestItems).innerJoin(socialBenefits, eq(socialBenefits.id, socialBenefitRequestItems.benefitId)).where(inArray(socialBenefitRequestItems.requestId, rows.map(row => row.request.id))) : [];
  return rows.map(row => ({ ...row.request, unit: row.unit, family: { familyCode: row.familyCode, representative: row.representative }, items: items.filter(item => item.requestId === row.request.id) }));
}

export async function listSocialBenefitStocks(database: DatabaseExecutor, access: SocialAccess): Promise<SocialBenefitStockRecord[]> {
  const rows = await database.select({ stock: socialBenefitStocks, benefit: { name: socialBenefits.name }, unit: { name: socialUnits.name } }).from(socialBenefitStocks).innerJoin(socialBenefits, eq(socialBenefits.id, socialBenefitStocks.benefitId)).innerJoin(socialUnits, eq(socialUnits.id, socialBenefitStocks.unitId)).where(access.administrator ? undefined : inArray(socialBenefitStocks.unitId, access.links.map(link => link.unitId))).orderBy(asc(socialBenefits.name));
  return rows.map(({ stock, ...relations }) => ({ ...stock, ...relations }));
}
export async function listSocialBenefitQuotas(database: DatabaseExecutor, access: SocialAccess): Promise<SocialBenefitQuotaRecord[]> {
  const rows = await database.select({ quota: socialBenefitQuotas, benefit: { name: socialBenefits.name }, unit: { name: socialUnits.name } }).from(socialBenefitQuotas).innerJoin(socialBenefits, eq(socialBenefits.id, socialBenefitQuotas.benefitId)).innerJoin(socialUnits, eq(socialUnits.id, socialBenefitQuotas.unitId)).where(access.administrator ? undefined : inArray(socialBenefitQuotas.unitId, access.links.map(link => link.unitId))).orderBy(desc(socialBenefitQuotas.startsAt));
  return rows.map(({ quota, ...relations }) => ({ ...quota, ...relations }));
}

export async function findSocialPerson(database: DatabaseExecutor, id: string): Promise<(Pick<PersonRecord, "id" | "fullName" | "socialName" | "cpf" | "birthDate" | "gender" | "raceColor" | "motherName" | "fatherName" | "educationLevel" | "phonePrimary" | "status"> & { socialProfile: SocialPersonProfileRecord | null }) | null> {
  const [row] = await database.select({ id: people.id, fullName: people.fullName, socialName: people.socialName, cpf: people.cpf, birthDate: people.birthDate, gender: people.gender, raceColor: people.raceColor, motherName: people.motherName, fatherName: people.fatherName, educationLevel: people.educationLevel, phonePrimary: people.phonePrimary, status: people.status, socialProfile: socialPersonProfiles }).from(people).leftJoin(socialPersonProfiles, eq(socialPersonProfiles.personId, people.id)).where(eq(people.id, id));
  return row ?? null;
}
export async function listSocialFacts(database: DatabaseExecutor, access: SocialAccess, personId: string): Promise<(SocialPersonFactRecord & { catalog: { name: string }; unit: { name: string } })[]> {
  const rows = await database.select({ fact: socialPersonFacts, catalog: { name: socialCatalogEntries.name }, unit: { name: socialUnits.name } }).from(socialPersonFacts).innerJoin(socialCatalogEntries, eq(socialCatalogEntries.id, socialPersonFacts.catalogId)).innerJoin(socialUnits, eq(socialUnits.id, socialPersonFacts.unitId)).where(and(eq(socialPersonFacts.personId, personId), socialHistoryWhere(access))).orderBy(desc(socialPersonFacts.identifiedAt), asc(socialPersonFacts.id));
  return rows.map(({ fact, ...relations }) => ({ ...fact, ...relations }));
}
export async function listSocialFinancialEntries(database: DatabaseExecutor, access: SocialAccess, personId: string): Promise<(SocialFinancialEntryRecord & { catalog: { name: string }; unit: { name: string } })[]> {
  const rows = await database.select({ entry: socialFinancialEntries, catalog: { name: socialCatalogEntries.name }, unit: { name: socialUnits.name } }).from(socialFinancialEntries).innerJoin(socialCatalogEntries, eq(socialCatalogEntries.id, socialFinancialEntries.catalogId)).innerJoin(socialUnits, eq(socialUnits.id, socialFinancialEntries.unitId)).where(and(eq(socialFinancialEntries.personId, personId), socialHistoryWhere(access, socialFinancialEntries))).orderBy(desc(socialFinancialEntries.competence), asc(socialFinancialEntries.id));
  return rows.map(({ entry, ...relations }) => ({ ...entry, ...relations }));
}

export async function listSocialPeoplePage(database: DatabaseExecutor, access: SocialAccess, q: string, requestedPage: string | undefined): Promise<{ total: number; page: number; persons: { id: string; fullName: string; socialName: string | null; cpf: string | null; status: string; socialProfile: { nis: string | null } | null }[] }> {
  const scope: SQL = !access.administrator && !access.links.length ? sql`false` : q ? sql`(${people.fullName} ILIKE ${`%${q}%`} OR ${people.cpf} LIKE ${`%${q}%`} OR ${socialPersonProfiles.nis} LIKE ${`%${q}%`})` : sql`true`;
  const [totalRow] = await database.select({ total: count() }).from(people).leftJoin(socialPersonProfiles, eq(socialPersonProfiles.personId, people.id)).where(scope);
  const total = totalRow.total;
  const page = Math.min(Math.max(1, Math.ceil(total / 20)), Math.max(1, Number.parseInt(requestedPage || "1", 10) || 1));
  const persons = await database.select({ id: people.id, fullName: people.fullName, socialName: people.socialName, cpf: people.cpf, status: people.status, socialProfile: { nis: socialPersonProfiles.nis } }).from(people).leftJoin(socialPersonProfiles, eq(socialPersonProfiles.personId, people.id)).where(scope).orderBy(asc(people.fullName), asc(people.id)).offset((page - 1) * 20).limit(20);
  return { total, page, persons };
}

export async function listSocialVisits(database: DatabaseExecutor, access: SocialAccess): Promise<{ id: string; scheduledDate: Date; objective: string; status: string; family: { representative: { fullName: string }; address: { streetName: string | null } | null }; professional: { name: string; person: { fullName: string } | null } }[]> {
  const rows = await database.select({ id: socialVisits.id, scheduledDate: socialVisits.scheduledDate, objective: socialVisits.objective, status: socialVisits.status, representativeName: representative.fullName, address: { streetName: addresses.streetName }, professionalName: employees.name, professionalPerson: { fullName: professionalPerson.fullName } }).from(socialVisits).innerJoin(socialFamilies, eq(socialFamilies.id, socialVisits.familyId)).innerJoin(representative, eq(representative.id, socialFamilies.representativeId)).leftJoin(addresses, eq(addresses.id, socialFamilies.addressId)).innerJoin(employees, eq(employees.id, socialVisits.professionalId)).leftJoin(professionalPerson, eq(professionalPerson.id, employees.personId)).where(access.administrator ? undefined : and(eq(socialVisits.professionalId, access.employeeId || ""), inArray(socialVisits.unitId, access.links.map(link => link.unitId)))).orderBy(asc(socialVisits.scheduledDate));
  return rows.map(row => ({ id: row.id, scheduledDate: row.scheduledDate, objective: row.objective, status: row.status, family: { representative: { fullName: row.representativeName }, address: row.address }, professional: { name: row.professionalName, person: row.professionalPerson } }));
}

export async function socialProntuarioOptions(database: DatabaseExecutor, access: SocialAccess): Promise<{ familias: { id: string; familyCode: string | null; nis: string | null }[]; persons: { id: string; fullName: string }[] }> {
  const denied = !access.administrator && !access.links.length;
  const [familias, persons] = await Promise.all([
    database.select({ id: socialFamilies.id, familyCode: socialFamilies.familyCode, nis: socialFamilies.nis }).from(socialFamilies).where(denied ? sql`false` : undefined).orderBy(asc(socialFamilies.familyCode)),
    database.select({ id: people.id, fullName: people.fullName }).from(people).where(denied ? sql`false` : undefined).orderBy(asc(people.fullName)),
  ]);
  return { familias, persons };
}

export async function socialReferralOptions(database: DatabaseExecutor, access: SocialAccess): Promise<{ people: { id: string; fullName: string }[]; families: { id: string; representative: { fullName: string } }[] }> {
  const denied = !access.administrator && !access.links.length;
  const [persons, families] = await Promise.all([
    database.select({ id: people.id, fullName: people.fullName }).from(people).where(and(eq(people.status, "Ativo"), denied ? sql`false` : undefined)).orderBy(asc(people.fullName)),
    database.select({ id: socialFamilies.id, representative: { fullName: people.fullName } }).from(socialFamilies).innerJoin(people, eq(people.id, socialFamilies.representativeId)).where(and(eq(socialFamilies.status, "Ativo"), denied ? sql`false` : undefined)).orderBy(asc(people.fullName)),
  ]);
  return { people: persons, families };
}

export async function socialDashboardTotals(database: DatabaseExecutor, access: SocialAccess, monthStart: Date, nextMonth: Date): Promise<[number, number, number, number, number]> {
  const units = access.links.map(link => link.unitId);
  const [[family], [unit], [attendance], [concession], [delivery]] = await Promise.all([
    database.select({ total: count() }).from(socialFamilies).where(and(eq(socialFamilies.status, "Ativo"), access.administrator ? undefined : sql`EXISTS (SELECT 1 FROM ${socialAttendances} WHERE ${socialAttendances.familyId}=${socialFamilies.id} AND ${socialAttendanceWhere(access)})`)),
    database.select({ total: count() }).from(socialUnits).where(and(eq(socialUnits.isActive, true), inArray(socialUnits.type, ["CRAS", "CREAS"]), access.administrator ? undefined : inArray(socialUnits.id, units))),
    database.select({ total: count() }).from(socialAttendances).where(and(socialAttendanceWhere(access), eq(socialAttendances.isActive, true), gte(socialAttendances.date, monthStart), lt(socialAttendances.date, nextMonth))),
    database.select({ total: count() }).from(socialBenefitConcessions).where(and(inArray(socialBenefitConcessions.status, ["Concedido", "Entregue"]), gte(socialBenefitConcessions.date, monthStart), lt(socialBenefitConcessions.date, nextMonth), access.administrator ? undefined : eq(socialBenefitConcessions.professionalId, access.employeeId || ""))),
    database.select({ total: count() }).from(socialBenefitRequestItems).innerJoin(socialBenefitRequests, eq(socialBenefitRequests.id, socialBenefitRequestItems.requestId)).where(and(eq(socialBenefitRequestItems.status, "DELIVERED"), gte(socialBenefitRequestItems.deliveredAt, monthStart), lt(socialBenefitRequestItems.deliveredAt, nextMonth), access.administrator ? undefined : inArray(socialBenefitRequests.unitId, units))),
  ]);
  return [family.total, unit.total, attendance.total, concession.total, delivery.total];
}

export async function socialReferralReceiptSubject(database: DatabaseExecutor, referral: SocialReferralDetails): Promise<{ person: Pick<PersonRecord, "fullName" | "socialName" | "cpf"> | null; family: { familyCode: string | null; representative: Pick<PersonRecord, "fullName" | "socialName" | "cpf"> } | null; reason: { name: string } | null; priority: { name: string } | null }> {
  const [person] = referral.personId ? await database.select({ fullName: people.fullName, socialName: people.socialName, cpf: people.cpf }).from(people).where(eq(people.id, referral.personId)) : [];
  const [family] = referral.familyId ? await database.select({ familyCode: socialFamilies.familyCode, representative: { fullName: people.fullName, socialName: people.socialName, cpf: people.cpf } }).from(socialFamilies).innerJoin(people, eq(people.id, socialFamilies.representativeId)).where(eq(socialFamilies.id, referral.familyId)) : [];
  const [reason] = await database.select({ name: socialCatalogEntries.name }).from(socialCatalogEntries).where(eq(socialCatalogEntries.id, referral.reasonId));
  const [priority] = referral.priorityTypeId ? await database.select({ name: socialCatalogEntries.name }).from(socialCatalogEntries).where(eq(socialCatalogEntries.id, referral.priorityTypeId)) : [];
  return { person: person ?? null, family: family ?? null, reason: reason ?? null, priority: priority ?? null };
}
