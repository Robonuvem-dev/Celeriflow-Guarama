import { and, asc, desc, eq, getTableColumns, like, or, sql } from "drizzle-orm";
import type { DatabaseExecutor } from "../../transaction";
import type { HealthManagementPeriod } from "@/lib/contracts/health-management-operations";
import { healthSusReferences, healthSusProcedures } from "../../schema/health-catalogs";
import { healthUnits, healthProfessionals, healthTeams, healthProfessionalAssignments } from "../../schema/health-workforce";
import { healthSpecialties, healthUnitSpecialties, healthSpecialtyGroups, healthSpecialtyGroupMembers, healthServiceAssignments, healthServices, healthHabilitations } from "../../schema/health-administration";
import { employees, institutions, roles } from "../../schema/administration";
import { people } from "../../schema/people";
import { patients } from "../../schema/health-registration";
import { addresses, companies } from "../../schema/registry";
import { neighborhoods } from "../../schema/localities";
import { procurementCovenants } from "../../schema/procurement-instruments";
import { reportTemplates } from "../../schema/report-template";
import { managementContains, managementPeriod, managementUnitScope } from "./common";

export function readManagementCids(db: DatabaseExecutor, active?: boolean, cid?: string) {
  return db.select({ code: healthSusReferences.code, description: healthSusReferences.description, classification: healthSusReferences.classification, source: healthSusReferences.source, competence: healthSusReferences.competence, isActive: healthSusReferences.isActive }).from(healthSusReferences)
    .where(and(eq(healthSusReferences.kind, "CID"), eq(healthSusReferences.isCurrent, true), active !== undefined ? eq(healthSusReferences.isActive, active) : undefined, cid ? or(managementContains(healthSusReferences.code, cid), managementContains(healthSusReferences.description, cid)) : undefined)).orderBy(asc(healthSusReferences.code), asc(healthSusReferences.source));
}

export function readManagementProcedures(db: DatabaseExecutor, options: { active?: boolean; financing?: string; procedure?: string; byFinancing?: boolean; limit?: number }) {
  const query = db.select({ code: healthSusProcedures.code, description: healthSusProcedures.description, financing: healthSusProcedures.financing, groupName: healthSusProcedures.groupName, complexity: healthSusProcedures.complexity, unitValue: healthSusProcedures.unitValue, source: healthSusProcedures.source, competence: healthSusProcedures.competence, isActive: healthSusProcedures.isActive }).from(healthSusProcedures)
    .where(and(eq(healthSusProcedures.isCurrent, true), options.active !== undefined ? eq(healthSusProcedures.isActive, options.active) : undefined, managementContains(healthSusProcedures.financing, options.financing), options.procedure ? or(managementContains(healthSusProcedures.code, options.procedure), managementContains(healthSusProcedures.description, options.procedure)) : undefined))
    .orderBy(...(options.byFinancing ? [asc(healthSusProcedures.financing), asc(healthSusProcedures.code)] : options.limit !== undefined ? [asc(healthSusProcedures.code)] : [asc(healthSusProcedures.code), desc(healthSusProcedures.competence)])).$dynamic();
  return options.limit !== undefined ? query.limit(options.limit) : query;
}

export function readManagementCovenants(db: DatabaseExecutor, period: HealthManagementPeriod, covenant?: string, status?: string) {
  const t = procurementCovenants;
  return db.select({ number: t.number, grantor: t.grantor, description: t.description, totalValueDecimal: t.totalValueDecimal, startDate: t.startDate, endDate: t.endDate, status: t.status }).from(t)
    .where(and(covenant ? or(managementContains(t.number, covenant), managementContains(t.grantor, covenant), managementContains(t.description, covenant)) : undefined, status ? eq(t.status, status) : undefined, managementPeriod(t.startDate, period))).orderBy(desc(t.startDate), asc(t.number));
}

export async function readManagementAddresses(db: DatabaseExecutor, unitIds: string[] | undefined, query?: string, municipality?: string) {
  const rows = await db.select({ address: getTableColumns(addresses), neighborhood: { name: neighborhoods.name, city: neighborhoods.city, state: neighborhoods.state }, person: { fullName: people.fullName }, company: { corporateName: companies.corporateName }, unit: { name: healthUnits.name } }).from(addresses).leftJoin(neighborhoods, eq(neighborhoods.id, addresses.neighborhoodId)).leftJoin(people, eq(people.id, addresses.personId)).leftJoin(patients, eq(patients.personId, people.id)).leftJoin(companies, eq(companies.id, addresses.companyId)).leftJoin(healthUnits, eq(healthUnits.addressId, addresses.id))
    .where(and(unitIds ? or(managementUnitScope(healthUnits.id, unitIds), managementUnitScope(patients.referenceUnitId, unitIds)) : undefined, query ? or(managementContains(addresses.streetName, query), like(addresses.zipCode, `%${query}%`), managementContains(people.fullName, query), managementContains(healthUnits.name, query)) : undefined, managementContains(neighborhoods.city, municipality))).orderBy(asc(addresses.streetName), asc(addresses.number), asc(addresses.id));
  return rows.map(r => ({ ...r.address, neighborhood: r.neighborhood, person: r.person, company: r.company, healthUnit: r.unit }));
}

export async function readManagementUnits(db: DatabaseExecutor, unitIds: string[] | undefined, active?: boolean) {
  const rows = await db.select({ unit: getTableColumns(healthUnits), manager: { name: employees.name }, address: { streetName: addresses.streetName, number: addresses.number }, neighborhood: { name: neighborhoods.name, city: neighborhoods.city, state: neighborhoods.state },
    teams: sql<number>`(select count(*) from ${healthTeams} where ${healthTeams.unitId}=${healthUnits.id})`.mapWith(Number), specialties: sql<number>`(select count(*) from ${healthUnitSpecialties} where ${healthUnitSpecialties.unitId}=${healthUnits.id})`.mapWith(Number), assignments: sql<number>`(select count(*) from ${healthProfessionalAssignments} where ${healthProfessionalAssignments.unitId}=${healthUnits.id})`.mapWith(Number) }).from(healthUnits).leftJoin(employees, eq(employees.id, healthUnits.managerId)).leftJoin(addresses, eq(addresses.id, healthUnits.addressId)).leftJoin(neighborhoods, eq(neighborhoods.id, addresses.neighborhoodId))
    .where(and(managementUnitScope(healthUnits.id, unitIds), active !== undefined ? eq(healthUnits.isActive, active) : undefined)).orderBy(asc(healthUnits.name), asc(healthUnits.id));
  return rows.map(r => ({ ...r.unit, manager: r.manager, address: r.address ? { ...r.address, neighborhood: r.neighborhood } : null, _count: { teams: r.teams, specialties: r.specialties, professionalAssignments: r.assignments } }));
}

export async function readManagementUnitSpecialties(db: DatabaseExecutor, unitIds: string[] | undefined, specialtyId?: string, active?: boolean) {
  const rows = await db.select({ isActive: healthUnitSpecialties.isActive, unit: { name: healthUnits.name, cnes: healthUnits.cnes }, specialty: { code: healthSpecialties.code, name: healthSpecialties.name, isActive: healthSpecialties.isActive } }).from(healthUnitSpecialties).innerJoin(healthUnits, eq(healthUnits.id, healthUnitSpecialties.unitId)).innerJoin(healthSpecialties, eq(healthSpecialties.id, healthUnitSpecialties.specialtyId))
    .where(and(managementUnitScope(healthUnitSpecialties.unitId, unitIds), specialtyId ? eq(healthUnitSpecialties.specialtyId, specialtyId) : undefined, active !== undefined ? eq(healthUnitSpecialties.isActive, active) : undefined)).orderBy(asc(healthUnits.name), asc(healthSpecialties.name));
  return rows;
}

export async function readManagementSpecialtyGroups(db: DatabaseExecutor, unitIds: string[] | undefined, active?: boolean) {
  const groups = await db.select().from(healthSpecialtyGroups).where(and(active !== undefined ? eq(healthSpecialtyGroups.isActive, active) : undefined,
    sql`exists (select 1 from ${healthSpecialtyGroupMembers} join ${healthUnitSpecialties} on ${healthUnitSpecialties.specialtyId}=${healthSpecialtyGroupMembers.specialtyId} where ${healthSpecialtyGroupMembers.groupId}=${healthSpecialtyGroups.id} and ${healthUnitSpecialties.isActive}=true ${unitIds ? sql`and ${managementUnitScope(healthUnitSpecialties.unitId, unitIds)}` : sql``})`)).orderBy(asc(healthSpecialtyGroups.name));
  return Promise.all(groups.map(async group => {
    const members = await db.select({ id: healthSpecialties.id, name: healthSpecialties.name }).from(healthSpecialtyGroupMembers).innerJoin(healthSpecialties, eq(healthSpecialties.id, healthSpecialtyGroupMembers.specialtyId)).where(eq(healthSpecialtyGroupMembers.groupId, group.id));
    const specialties = await Promise.all(members.map(async member => ({ specialty: { name: member.name, unitLinks: await db.select({ unit: { id: healthUnits.id, name: healthUnits.name, cnes: healthUnits.cnes } }).from(healthUnitSpecialties).innerJoin(healthUnits, eq(healthUnits.id, healthUnitSpecialties.unitId)).where(and(eq(healthUnitSpecialties.specialtyId, member.id), eq(healthUnitSpecialties.isActive, true), managementUnitScope(healthUnitSpecialties.unitId, unitIds))) } })));
    return { ...group, specialties };
  }));
}

export async function readManagementAssignments(db: DatabaseExecutor, options: { unitIds?: string[]; professionalId?: string; specialtyId?: string; active?: boolean; bySpecialty?: boolean; unordered?: boolean }) {
  const rows = await db.select({ assignment: getTableColumns(healthProfessionalAssignments), unit: { name: healthUnits.name, cnes: healthUnits.cnes }, specialty: { code: healthSpecialties.code, name: healthSpecialties.name }, professional: getTableColumns(healthProfessionals), employee: { name: employees.name, registration: employees.registration } }).from(healthProfessionalAssignments).innerJoin(healthUnits, eq(healthUnits.id, healthProfessionalAssignments.unitId)).leftJoin(healthSpecialties, eq(healthSpecialties.id, healthProfessionalAssignments.specialtyId)).innerJoin(healthProfessionals, eq(healthProfessionals.id, healthProfessionalAssignments.professionalId)).innerJoin(employees, eq(employees.id, healthProfessionals.employeeId))
    .where(and(managementUnitScope(healthProfessionalAssignments.unitId, options.unitIds), options.professionalId ? eq(healthProfessionalAssignments.professionalId, options.professionalId) : undefined, options.specialtyId ? eq(healthProfessionalAssignments.specialtyId, options.specialtyId) : undefined, options.active !== undefined ? eq(healthProfessionalAssignments.isActive, options.active) : undefined))
    .orderBy(...(options.unordered ? [] : options.bySpecialty ? [asc(healthSpecialties.name), asc(employees.name), asc(healthUnits.name)] : [asc(healthUnits.name), asc(employees.name)]));
  return rows.map(r => ({ ...r.assignment, unit: r.unit, specialty: r.specialty, professional: { ...r.professional, employee: r.employee } }));
}

export async function readManagementTeamProfessionals(db: DatabaseExecutor, options: { unitIds?: string[]; teamId?: string; professionalId?: string; active?: boolean }) {
  const rows = await db.select({ professional: getTableColumns(healthProfessionals), employee: { name: employees.name, registration: employees.registration }, team: getTableColumns(healthTeams), unit: { name: healthUnits.name } }).from(healthProfessionals).innerJoin(healthTeams, eq(healthTeams.id, healthProfessionals.teamId)).innerJoin(healthUnits, eq(healthUnits.id, healthTeams.unitId)).innerJoin(employees, eq(employees.id, healthProfessionals.employeeId))
    .where(and(managementUnitScope(healthTeams.unitId, options.unitIds), options.teamId ? eq(healthProfessionals.teamId, options.teamId) : undefined, options.professionalId ? eq(healthProfessionals.id, options.professionalId) : undefined, options.active !== undefined ? eq(healthProfessionals.isActive, options.active) : undefined)).orderBy(asc(healthUnits.name), asc(healthTeams.name), asc(employees.name));
  return rows.map(r => ({ ...r.professional, employee: r.employee, team: { ...r.team, unit: r.unit } }));
}

export async function readManagementProfessionalRecords(db: DatabaseExecutor, unitIds: string[] | undefined, professionalId?: string, active?: boolean) {
  const rows = await db.select({ professional: getTableColumns(healthProfessionals), employee: getTableColumns(employees), role: { name: roles.name }, unit: { name: healthUnits.name }, team: { name: healthTeams.name } }).from(healthProfessionals).innerJoin(employees, eq(employees.id, healthProfessionals.employeeId)).leftJoin(roles, eq(roles.id, employees.roleId)).leftJoin(healthUnits, eq(healthUnits.id, healthProfessionals.unitId)).leftJoin(healthTeams, eq(healthTeams.id, healthProfessionals.teamId))
    .where(and(professionalId ? eq(healthProfessionals.id, professionalId) : undefined, active !== undefined ? eq(healthProfessionals.isActive, active) : undefined, unitIds ? or(managementUnitScope(healthProfessionals.unitId, unitIds), sql`exists(select 1 from ${healthProfessionalAssignments} where ${healthProfessionalAssignments.professionalId}=${healthProfessionals.id} and ${managementUnitScope(healthProfessionalAssignments.unitId, unitIds)})`) : undefined)).orderBy(asc(employees.name), asc(healthProfessionals.id));
  return Promise.all(rows.map(async r => {
    const [assignments, services, habilitations] = await Promise.all([
      readManagementAssignments(db, { professionalId: r.professional.id, unitIds, unordered: true }),
      db.select({ service: { name: healthServices.name } }).from(healthServiceAssignments).innerJoin(healthServices, eq(healthServices.id, healthServiceAssignments.serviceId)).where(and(eq(healthServiceAssignments.professionalId, r.professional.id), eq(healthServiceAssignments.isActive, true))),
      db.select({ description: healthHabilitations.description }).from(healthHabilitations).where(and(eq(healthHabilitations.professionalId, r.professional.id), eq(healthHabilitations.isActive, true))),
    ]);
    return { ...r.professional, employee: { ...r.employee, role: r.role }, unit: r.unit, team: r.team, assignments, serviceAssignments: services, habilitations };
  }));
}

export async function readManagementInstitution(db: DatabaseExecutor) {
  return (await db.select({ name: institutions.name, legalName: institutions.legalName, cnpj: institutions.cnpj, address: institutions.address, city: institutions.city, state: institutions.state }).from(institutions).orderBy(asc(institutions.createdAt)).limit(1))[0] ?? null;
}
export async function readManagementTemplate(db: DatabaseExecutor) {
  return (await db.select({ version: reportTemplates.version, fingerprint: reportTemplates.fingerprint, header: reportTemplates.header, footer: reportTemplates.footer, orientation: reportTemplates.orientation, includeEmissionMetadata: reportTemplates.includeEmissionMetadata }).from(reportTemplates).where(eq(reportTemplates.scope, "GLOBAL")).limit(1))[0] ?? null;
}
