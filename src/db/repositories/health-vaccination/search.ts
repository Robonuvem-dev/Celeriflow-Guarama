import { and, desc, eq, gt, ilike, inArray, isNotNull, isNull, like, lte, or, sql } from "drizzle-orm";
import type { DatabaseExecutor } from "../../transaction";
import { employees } from "../../schema/administration";
import { materials, materialStocks, warehouses } from "../../schema/assets-stock";
import { healthAppointments } from "../../schema/health-agenda";
import { healthMaterialProfiles } from "../../schema/health-pharmacy";
import { healthPatientContacts, patients } from "../../schema/health-registration";
import { healthProfessionals, healthProfessionalAssignments, healthUnits } from "../../schema/health-workforce";
import { neighborhoods } from "../../schema/localities";
import { people } from "../../schema/people";
import { addresses } from "../../schema/registry";
import { vaccines, vaccinationRecords, healthVaccinationCampaigns, healthVaccinationCardEvents, healthVaccineLotProfiles, healthVaccineOpenedVials } from "../../schema/health-vaccination";

export async function listVaccinationSearchPatients(db: DatabaseExecutor, query: string, unitIds?: string[]) {
  const search = query.trim();
  const rows = await db.select({ patient: patients, person: people, referenceUnit: { name: healthUnits.name } }).from(patients)
    .innerJoin(people, eq(people.id, patients.personId)).leftJoin(healthUnits, eq(healthUnits.id, patients.referenceUnitId))
    .where(and(eq(patients.status, "Ativo"), eq(people.status, "Ativo"), isNull(people.deathDate),
      unitIds ? or(inArray(patients.referenceUnitId, unitIds),
        sql`EXISTS (SELECT 1 FROM ${vaccinationRecords} WHERE ${vaccinationRecords.patientId}=${patients.id} AND ${inArray(vaccinationRecords.unitId, unitIds)})`,
        sql`EXISTS (SELECT 1 FROM ${healthAppointments} WHERE ${healthAppointments.patientId}=${patients.id} AND ${inArray(healthAppointments.unitId, unitIds)})`) : undefined,
      search ? or(ilike(people.fullName, `%${search}%`), like(patients.cns, `%${search}%`), like(people.cpf, `%${search}%`)) : undefined)).orderBy(people.fullName);
  const personIds = rows.map(row => row.person.id), patientIds = rows.map(row => row.patient.id);
  const [residences, contacts] = rows.length ? await Promise.all([
    db.selectDistinctOn([addresses.personId], { address: addresses, neighborhood: neighborhoods }).from(addresses).leftJoin(neighborhoods, eq(neighborhoods.id, addresses.neighborhoodId))
      .where(and(inArray(addresses.personId, personIds), isNull(addresses.canonicalAddressId), or(eq(addresses.addressType, "Residencial"), isNull(addresses.addressType))))
      .orderBy(addresses.personId, desc(addresses.createdAt), desc(addresses.id)),
    db.selectDistinctOn([healthPatientContacts.patientId], { patientId: healthPatientContacts.patientId, phone: healthPatientContacts.phone }).from(healthPatientContacts)
      .where(and(inArray(healthPatientContacts.patientId, patientIds), eq(healthPatientContacts.isActive, true))).orderBy(healthPatientContacts.patientId),
  ]) : [[], []];
  const addressByPerson = new Map(residences.map(row => [row.address.personId, { ...row.address, neighborhood: row.neighborhood }]));
  const contactByPatient = new Map(contacts.map(row => [row.patientId, { phone: row.phone }]));
  return rows.map(({ patient, person, referenceUnit }) => {
    const address = addressByPerson.get(person.id), contact = contactByPatient.get(patient.id);
    return { ...patient, person: { ...person, addresses: address ? [address] : [] }, referenceUnit, contactRecords: contact ? [contact] : [] };
  });
}

export async function listVaccinationSearchHistory(db: DatabaseExecutor, patientIds: string[], at: Date, unitIds?: string[]) {
  const [records, events] = await Promise.all([
    db.select({ id: vaccinationRecords.id, patientId: vaccinationRecords.patientId, vaccineId: vaccinationRecords.vaccineId, doseNumber: vaccinationRecords.doseNumber, strategy: vaccinationRecords.strategy, date: vaccinationRecords.date })
      .from(vaccinationRecords).where(and(inArray(vaccinationRecords.patientId, patientIds), lte(vaccinationRecords.date, at), unitIds ? inArray(vaccinationRecords.unitId, unitIds) : undefined)),
    db.select().from(healthVaccinationCardEvents).where(and(inArray(healthVaccinationCardEvents.patientId, patientIds), lte(healthVaccinationCardEvents.occurredAt, at), unitIds ? inArray(healthVaccinationCardEvents.unitId, unitIds) : undefined)),
  ]);
  return [records, events] as const;
}

export async function listVaccinationFormRows(db: DatabaseExecutor, unitIds?: string[]) {
  const warehouseScope = unitIds ? inArray(warehouses.healthUnitId, unitIds) : isNotNull(warehouses.healthUnitId);
  const [vaccineRows, stockRows, diluentRows, vials, professionalRows, campaigns] = await Promise.all([
    db.select({ id: vaccines.id, name: vaccines.name, diluentMaterialId: vaccines.diluentMaterialId }).from(vaccines).where(and(eq(vaccines.isActive, true), isNotNull(vaccines.materialId))).orderBy(vaccines.name),
    db.select({ stock: materialStocks, warehouse: warehouses, profile: healthVaccineLotProfiles, vaccineId: vaccines.id }).from(materialStocks)
      .innerJoin(warehouses, eq(warehouses.id, materialStocks.warehouseId)).innerJoin(materials, eq(materials.id, materialStocks.materialId)).innerJoin(vaccines, eq(vaccines.materialId, materials.id))
      .leftJoin(healthVaccineLotProfiles, eq(healthVaccineLotProfiles.stockId, materialStocks.id)).where(and(gt(materialStocks.quantity, 0), warehouseScope, eq(vaccines.isActive, true))).orderBy(materialStocks.expirationDate),
    db.select({ stock: materialStocks, warehouse: warehouses, materialName: materials.name }).from(materialStocks)
      .innerJoin(warehouses, eq(warehouses.id, materialStocks.warehouseId)).innerJoin(materials, eq(materials.id, materialStocks.materialId)).innerJoin(healthMaterialProfiles, eq(healthMaterialProfiles.materialId, materials.id))
      .where(and(gt(materialStocks.quantity, 0), warehouseScope, eq(materials.isActive, true), eq(healthMaterialProfiles.productKind, "DILUENT"), eq(healthMaterialProfiles.isActive, true))),
    db.select({ vial: healthVaccineOpenedVials }).from(healthVaccineOpenedVials).innerJoin(materialStocks, eq(materialStocks.id, healthVaccineOpenedVials.stockId)).innerJoin(warehouses, eq(warehouses.id, materialStocks.warehouseId))
      .where(and(gt(healthVaccineOpenedVials.remainingDoses, 0), warehouseScope)).orderBy(healthVaccineOpenedVials.openedAt),
    db.select({ professional: healthProfessionals, employee: { name: employees.name } }).from(healthProfessionals).innerJoin(employees, eq(employees.id, healthProfessionals.employeeId))
      .where(and(eq(healthProfessionals.isActive, true), eq(employees.isActive, true), unitIds ? or(inArray(healthProfessionals.unitId, unitIds),
        sql`EXISTS (SELECT 1 FROM ${healthProfessionalAssignments} WHERE ${healthProfessionalAssignments.professionalId}=${healthProfessionals.id} AND ${healthProfessionalAssignments.isActive}=true AND ${inArray(healthProfessionalAssignments.unitId, unitIds)})`) : undefined)).orderBy(employees.name),
    db.select().from(healthVaccinationCampaigns).orderBy(desc(healthVaccinationCampaigns.startsAt)),
  ]);
  const professionalIds = professionalRows.map(row => row.professional.id);
  const assignments = professionalIds.length ? await db.select({ professionalId: healthProfessionalAssignments.professionalId, unitId: healthProfessionalAssignments.unitId }).from(healthProfessionalAssignments)
    .where(and(inArray(healthProfessionalAssignments.professionalId, professionalIds), eq(healthProfessionalAssignments.isActive, true))) : [];
  return {
    vaccines: vaccineRows,
    stocks: stockRows.map(row => ({ ...row.stock, warehouse: row.warehouse, vaccineLotProfile: row.profile, material: { vaccine: { id: row.vaccineId } } })),
    diluents: diluentRows.map(row => ({ ...row.stock, warehouse: row.warehouse, material: { name: row.materialName } })),
    vials: vials.map(row => row.vial),
    professionals: professionalRows.map(row => ({ ...row.professional, employee: row.employee, assignments: assignments.filter(link => link.professionalId === row.professional.id).map(link => ({ unitId: link.unitId })) })),
    campaigns,
  };
}
