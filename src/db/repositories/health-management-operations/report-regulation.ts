import { and, desc, eq, getTableColumns, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { DatabaseExecutor } from "../../transaction";
import type { HealthManagementPeriod } from "@/lib/contracts/health-management-operations";
import type { PermissionUser } from "@/lib/contracts/identity";
import { healthRegulationRequests as requests, healthRegulationQuotas as quotas, healthRegulationEvents as events } from "../../schema/health-regulation";
import { healthTfdTrips as trips, healthTfdPassengers as passengers, healthTfdRequests as tfdRequests } from "../../schema/health-tfd";
import { healthUnits } from "../../schema/health-workforce";
import { healthSpecialties, healthServices } from "../../schema/health-administration";
import { healthSusProcedures } from "../../schema/health-catalogs";
import { fleetUnits } from "../../schema/fleet";
import { employees } from "../../schema/administration";
import { patients } from "../../schema/health-registration";
import { people } from "../../schema/people";
import { companies, suppliers } from "../../schema/registry";
import { activeTfdPassengerWhere, tfdTripAccessWhere } from "../health-tfd/records";
import { readManagementFirstAddress } from "./report-clinical";
import { managementPeriod, managementUnitScope } from "./common";

export async function readManagementRegulationRequests(db: DatabaseExecutor, options: { unitIds?: string[]; period?: HealthManagementPeriod; professionalId?: string; status?: string; recordId?: string }) {
  const providerPerson = alias(people, "management_reg_provider");
  const rows = await db.select({ request: getTableColumns(requests), person: { id: people.id, fullName: people.fullName }, specialty: { name: healthSpecialties.name }, service: { name: healthServices.name }, procedure: { code: healthSusProcedures.code, description: healthSusProcedures.description }, unit: { name: healthUnits.name }, quota: { id: quotas.id, providerSupplierId: quotas.providerSupplierId, unitValue: quotas.unitValue }, providerPerson: { fullName: providerPerson.fullName }, company: { corporateName: companies.corporateName } }).from(requests)
    .innerJoin(patients, eq(patients.id, requests.patientId)).innerJoin(people, eq(people.id, patients.personId)).leftJoin(healthSpecialties, eq(healthSpecialties.id, requests.specialtyId)).leftJoin(healthServices, eq(healthServices.id, requests.serviceId)).leftJoin(healthSusProcedures, eq(healthSusProcedures.id, requests.procedureId)).leftJoin(healthUnits, eq(healthUnits.id, requests.requestUnitId)).leftJoin(quotas, eq(quotas.id, requests.quotaId)).leftJoin(suppliers, eq(suppliers.id, quotas.providerSupplierId)).leftJoin(providerPerson, eq(providerPerson.id, suppliers.personId)).leftJoin(companies, eq(companies.id, suppliers.companyId))
    .where(options.recordId ? or(eq(requests.id, options.recordId), eq(requests.guideNumber, options.recordId)) : and(managementPeriod(requests.createdAt, options.period), managementUnitScope(requests.requestUnitId, options.unitIds), options.professionalId ? eq(requests.professionalId, options.professionalId) : undefined, options.status && ["RECEBIDA", "EM_ANALISE", "AUTORIZADA", "AGENDADA", "EXECUTADA", "CONCLUIDA", "DEVOLVIDA", "CANCELADA", "ARQUIVADA"].includes(options.status) ? eq(requests.status, options.status) : undefined))
    .orderBy(...(options.recordId ? [] : [desc(requests.createdAt)])).limit(options.recordId ? 1 : 2000);
  return Promise.all(rows.map(async r => ({ ...r.request, patient: { person: { ...r.person, addresses: options.recordId ? [] : await readManagementFirstAddress(db, r.person.id) } }, specialty: r.specialty, service: r.service, procedure: r.procedure, requestUnit: r.unit, quota: r.quota ? { ...r.quota, provider: { person: r.providerPerson, company: r.company } } : null })));
}
export async function readManagementRegulationQuotas(db: DatabaseExecutor, unitIds: string[] | undefined) {
  const rows = await db.select({ quota: getTableColumns(quotas), unit: { name: healthUnits.name }, specialty: { name: healthSpecialties.name }, person: { fullName: people.fullName }, company: { corporateName: companies.corporateName } }).from(quotas).innerJoin(suppliers, eq(suppliers.id, quotas.providerSupplierId)).leftJoin(people, eq(people.id, suppliers.personId)).leftJoin(companies, eq(companies.id, suppliers.companyId)).leftJoin(healthUnits, eq(healthUnits.id, quotas.unitId)).leftJoin(healthSpecialties, eq(healthSpecialties.id, quotas.specialtyId)).where(managementUnitScope(quotas.unitId, unitIds)).orderBy(desc(quotas.period)).limit(2000);
  return rows.map(r => ({ ...r.quota, unit: r.unit, specialty: r.specialty, provider: { person: r.person, company: r.company } }));
}
export async function readManagementRegulationEvents(db: DatabaseExecutor, unitIds: string[] | undefined, period: HealthManagementPeriod) {
  const rows = await db.select({ event: getTableColumns(events), person: { fullName: people.fullName } }).from(events).innerJoin(requests, eq(requests.id, events.requestId)).innerJoin(patients, eq(patients.id, requests.patientId)).innerJoin(people, eq(people.id, patients.personId)).where(and(managementPeriod(events.createdAt, period), managementUnitScope(requests.requestUnitId, unitIds))).orderBy(desc(events.createdAt)).limit(2000);
  return rows.map(r => ({ ...r.event, request: { patient: { person: r.person } } }));
}
export async function readManagementTfdTrips(db: DatabaseExecutor, user: PermissionUser, period: HealthManagementPeriod, recordId?: string) {
  const rows = await db.select({ trip: getTableColumns(trips), vehicle: { name: fleetUnits.name, plate: fleetUnits.plate }, driver: { name: employees.name } }).from(trips).innerJoin(fleetUnits, eq(fleetUnits.id, trips.fleetUnitId)).leftJoin(employees, eq(employees.id, trips.driverEmployeeId)).where(and(tfdTripAccessWhere(user), recordId ? eq(trips.id, recordId) : managementPeriod(trips.date, period))).orderBy(...(recordId ? [] : [desc(trips.date)])).limit(recordId ? 1 : 2000);
  if (!rows.length) return [];
  const links = await db.select({ passenger: getTableColumns(passengers), person: { fullName: people.fullName } }).from(passengers).innerJoin(patients, eq(patients.id, passengers.patientId)).innerJoin(people, eq(people.id, patients.personId)).where(and(managementUnitScope(passengers.tripId, rows.map(r => r.trip.id)), activeTfdPassengerWhere));
  return rows.map(r => ({ ...r.trip, fleetUnit: r.vehicle, driverEmployee: r.driver, passengers: links.filter(p => p.passenger.tripId === r.trip.id).map(p => ({ ...p.passenger, patient: { person: p.person } })) }));
}
export async function readManagementTfdRequest(db: DatabaseExecutor, recordId: string) {
  const rows = await db.select({ request: getTableColumns(tfdRequests), person: { fullName: people.fullName }, unit: { name: healthUnits.name } }).from(tfdRequests).innerJoin(patients, eq(patients.id, tfdRequests.patientId)).innerJoin(people, eq(people.id, patients.personId)).leftJoin(healthUnits, eq(healthUnits.id, tfdRequests.originUnitId)).where(eq(tfdRequests.id, recordId)).limit(1);
  return rows.map(r => ({ ...r.request, patient: { person: r.person }, originUnit: r.unit }))[0] ?? null;
}
