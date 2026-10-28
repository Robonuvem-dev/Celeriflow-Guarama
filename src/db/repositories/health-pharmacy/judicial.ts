import { asc, eq } from "drizzle-orm";
import type { DatabaseExecutor, DatabaseTransaction } from "../../transaction";
import { institutions } from "../../schema/administration";
import { people } from "../../schema/people";
import { documents } from "../../schema/registry";
import { materialStocks } from "../../schema/assets-stock";
import { patients } from "../../schema/health-registration";
import { healthUnits } from "../../schema/health-workforce";
import { medicines } from "../../schema/health-prescriptions";
import { processes } from "../../schema/processes";
import { purchaseRequests } from "../../schema/procurement-requests";
import { healthPharmacyJudicialCases, healthPharmacyJudicialItems, healthPharmacyJudicialEvents, healthPharmacyJudicialDocuments, healthPharmacyLawyers, medicineDispensations } from "../../schema/health-pharmacy";
import { pharmacyRecord } from "./records";

export async function insertPharmacyJudicialCase(tx: DatabaseTransaction, data: typeof healthPharmacyJudicialCases.$inferInsert, items: { medicineId: string; quantity: number; dosage: string; prescriptionItemId: string | null }[], reason: string) {
  const current = pharmacyRecord((await tx.insert(healthPharmacyJudicialCases).values(data).returning())[0]);
  await tx.insert(healthPharmacyJudicialItems).values(items.map(item => ({ ...item, caseId: current.id })));
  await tx.insert(healthPharmacyJudicialEvents).values({ caseId: current.id, toStatus: "OPEN", reason, actorUsuarioId: data.createdByUsuarioId });
  return current;
}

export async function readPharmacyJudicialStatement(db: DatabaseExecutor, current: typeof healthPharmacyJudicialCases.$inferSelect) {
  const [patientRows, lawyerRows, processRows, purchaseRows, itemRows, dispensationRows, events, linkedDocuments, institutionRows, unitRows] = await Promise.all([
    db.select({ patient: patients, person: people }).from(patients).innerJoin(people, eq(people.id, patients.personId)).where(eq(patients.id, current.patientId)).limit(1),
    db.select({ lawyer: healthPharmacyLawyers, person: people }).from(healthPharmacyLawyers).innerJoin(people, eq(people.id, healthPharmacyLawyers.personId)).where(eq(healthPharmacyLawyers.id, current.lawyerId)).limit(1),
    current.processId ? db.select({ protocolNumber: processes.protocolNumber }).from(processes).where(eq(processes.id, current.processId)).limit(1) : [],
    current.purchaseRequestId ? db.select({ number: purchaseRequests.number }).from(purchaseRequests).where(eq(purchaseRequests.id, current.purchaseRequestId)).limit(1) : [],
    db.select({ item: healthPharmacyJudicialItems, medicine: medicines }).from(healthPharmacyJudicialItems).innerJoin(medicines, eq(medicines.id, healthPharmacyJudicialItems.medicineId)).where(eq(healthPharmacyJudicialItems.caseId, current.id)),
    db.select({ dispensation: medicineDispensations, stock: materialStocks }).from(medicineDispensations).innerJoin(healthPharmacyJudicialItems, eq(healthPharmacyJudicialItems.id, medicineDispensations.judicialCaseItemId)).leftJoin(materialStocks, eq(materialStocks.id, medicineDispensations.stockId)).where(eq(healthPharmacyJudicialItems.caseId, current.id)),
    db.select().from(healthPharmacyJudicialEvents).where(eq(healthPharmacyJudicialEvents.caseId, current.id)).orderBy(asc(healthPharmacyJudicialEvents.createdAt)),
    db.select({ link: healthPharmacyJudicialDocuments, document: { title: documents.title } }).from(healthPharmacyJudicialDocuments).innerJoin(documents, eq(documents.id, healthPharmacyJudicialDocuments.documentId)).where(eq(healthPharmacyJudicialDocuments.caseId, current.id)),
    db.select({ name: institutions.name, cnpj: institutions.cnpj }).from(institutions).limit(1),
    db.select({ name: healthUnits.name }).from(healthUnits).where(eq(healthUnits.id, current.unitId)).limit(1),
  ]);
  const patient = pharmacyRecord(patientRows[0]), lawyer = pharmacyRecord(lawyerRows[0]);
  return { ...current, patient: { ...patient.patient, person: patient.person }, lawyer: { ...lawyer.lawyer, person: lawyer.person }, process: processRows[0] ?? null, purchaseRequest: purchaseRows[0] ?? null,
    items: itemRows.map(({ item, medicine }) => ({ ...item, medicine, dispensations: dispensationRows.filter(row => row.dispensation.judicialCaseItemId === item.id).map(({ dispensation, stock }) => ({ ...dispensation, stock })) })),
    events, documents: linkedDocuments.map(({ link, document }) => ({ ...link, document })), institution: institutionRows[0] ?? null, unit: pharmacyRecord(unitRows[0]) };
}
