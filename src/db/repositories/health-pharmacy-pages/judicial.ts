import { and, count, desc, eq, getTableColumns, ilike, isNotNull, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { DatabaseExecutor } from "../../transaction";
import type { PharmacyPageSearch, PharmacyPageUnits } from "../../../lib/contracts/health-pharmacy-pages";
import { healthPharmacyJudicialCases as cases, healthPharmacyJudicialItems as items, healthPharmacyJudicialEvents as events, healthPharmacyJudicialDocuments as links, healthPharmacyLawyers as lawyers, medicineDispensations as dispensations } from "../../schema/health-pharmacy";
import { medicines } from "../../schema/health-prescriptions";
import { patients } from "../../schema/health-registration";
import { people } from "../../schema/people";
import { processes } from "../../schema/processes";
import { purchaseRequests } from "../../schema/procurement-requests";
import { documents } from "../../schema/registry";
import { pharmacyAvailableStocks, pharmacyIds, pharmacyPageNumber, pharmacyPatients, pharmacyPeople, pharmacyPrescriptionOptions, pharmacyProfessionals, pharmacyUnits, pharmacyUnitScope } from "./common";
const lawyerPerson = alias(people, "pharmacy_judicial_lawyer_person");

async function judicialProcesses(db: DatabaseExecutor, units: PharmacyPageUnits) {
  const rows = await db.select({ id: processes.id, protocolNumber: processes.protocolNumber, patientId: patients.id }).from(processes).innerJoin(patients, eq(patients.personId, processes.personId)).where(and(eq(patients.status, "Ativo"), pharmacyUnitScope(patients.referenceUnitId, units))).limit(500);
  return rows.map(row => ({ id: row.id, protocolNumber: row.protocolNumber, person: { patientInfo: { id: row.patientId } } }));
}
export async function readPharmacyJudicialPage(db: DatabaseExecutor, allowed: PharmacyPageUnits, search: PharmacyPageSearch & { person?: string }) {
  const where = and(pharmacyUnitScope(cases.unitId, allowed), search.status ? eq(cases.status, search.status) : undefined, search.q ? or(ilike(cases.caseNumber, `%${search.q}%`), ilike(people.fullName, `%${search.q}%`)) : undefined);
  const [{ total }] = await db.select({ total: count() }).from(cases).innerJoin(patients, eq(patients.id, cases.patientId)).innerJoin(people, eq(people.id, patients.personId)).where(where);
  const page = pharmacyPageNumber(search.page, total);
  const [rows, patientRows, units, lawyerRows, personRows, medicineRows, prescriptions, processRows, purchases, stocks, professionals] = await Promise.all([
    db.select({ current: cases, patient: patients, person: people, lawyer: lawyers, lawyerPerson, process: processes, purchaseRequest: purchaseRequests }).from(cases).innerJoin(patients, eq(patients.id, cases.patientId)).innerJoin(people, eq(people.id, patients.personId)).innerJoin(lawyers, eq(lawyers.id, cases.lawyerId)).innerJoin(lawyerPerson, eq(lawyerPerson.id, lawyers.personId)).leftJoin(processes, eq(processes.id, cases.processId)).leftJoin(purchaseRequests, eq(purchaseRequests.id, cases.purchaseRequestId)).where(where).orderBy(desc(cases.createdAt)).limit(20).offset((page - 1) * 20),
    pharmacyPatients(db, allowed, search.q, 200), pharmacyUnits(db, allowed), db.select({ ...getTableColumns(lawyers), person: people }).from(lawyers).innerJoin(people, eq(people.id, lawyers.personId)).where(eq(lawyers.isActive, true)), pharmacyPeople(db, search.person || undefined),
    db.select({ id: medicines.id, name: medicines.name }).from(medicines).where(and(eq(medicines.isActive, true), isNotNull(medicines.materialId))), pharmacyPrescriptionOptions(db, allowed), judicialProcesses(db, allowed),
    db.select({ id: purchaseRequests.id, number: purchaseRequests.number, object: purchaseRequests.object }).from(purchaseRequests).orderBy(desc(purchaseRequests.createdAt)).limit(200), pharmacyAvailableStocks(db, allowed, { activeWarehouse: true }), pharmacyProfessionals(db, true, true),
  ]);
  const ids = rows.map(row => row.current.id);
  const [itemRows, eventRows, documentRows] = await Promise.all([
    db.select({ ...getTableColumns(items), medicine: medicines }).from(items).innerJoin(medicines, eq(medicines.id, items.medicineId)).where(pharmacyIds(items.caseId, ids)), db.select().from(events).where(pharmacyIds(events.caseId, ids)).orderBy(desc(events.createdAt)),
    db.select({ ...getTableColumns(links), document: documents }).from(links).innerJoin(documents, eq(documents.id, links.documentId)).where(pharmacyIds(links.caseId, ids)),
  ]);
  const active = await db.select({ judicialCaseItemId: dispensations.judicialCaseItemId, quantity: dispensations.quantity }).from(dispensations).where(and(pharmacyIds(dispensations.judicialCaseItemId, itemRows.map(row => row.id)), eq(dispensations.status, "ACTIVE")));
  return { total, page, cases: rows.map(row => ({ ...row.current, patient: { ...row.patient, person: row.person }, lawyer: { ...row.lawyer, person: row.lawyerPerson }, process: row.process, purchaseRequest: row.purchaseRequest, items: itemRows.filter(item => item.caseId === row.current.id).map(item => ({ ...item, dispensations: active.filter(d => d.judicialCaseItemId === item.id).map(d => ({ quantity: d.quantity })) })), events: eventRows.filter(event => event.caseId === row.current.id), documents: documentRows.filter(link => link.caseId === row.current.id) })), patients: patientRows, units, lawyers: lawyerRows, people: personRows, medicines: medicineRows, prescriptions, processes: processRows, purchases, stocks, professionals };
}
