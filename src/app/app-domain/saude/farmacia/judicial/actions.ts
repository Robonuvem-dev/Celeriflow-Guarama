"use server";
import { revalidatePath } from "next/cache";
import { assertHealthUnitAccess, getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { createPharmacyJudicialCase, renewPharmacyJudicialCase, savePharmacyLawyer, transitionPharmacyJudicialCase } from "@/lib/saude/pharmacy-judicial-service";
import { dispenseElectronicPrescription, dispenseManualMedicine } from "@/lib/saude/pharmacy-dispensation-service";
import { deleteUploadedDocument, uploadProcessFile } from "@/lib/platform/blob";
import { ingestGedDocument } from "@/lib/documents/document-flow-service";
import { eq } from "drizzle-orm";
import { db, databaseConnection } from "@/db/client";
import { healthPharmacyJudicialCases as cases, healthPharmacyJudicialItems as items, healthPharmacyJudicialDocuments } from "@/db/schema/health-pharmacy";
import { patients } from "@/db/schema/health-registration";
import { documents } from "@/db/schema/registry";
import { pharmacyRecord, readPharmacyStock } from "@/db/repositories/health-pharmacy/records";
const text = (data: FormData, key: string) => String(data.get(key) || "").trim();
function refresh() { revalidatePath("/saude/farmacia/judicial"); revalidatePath("/saude/farmacia/dispensacoes"); revalidatePath("/saude/farmacia"); }

export async function savePharmacyLawyerAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "update");
  await savePharmacyLawyer(context, { personId: text(data, "personId"), registration: text(data, "registration"), registrationState: text(data, "registrationState") }); refresh();
}
export async function createJudicialCaseAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "create");
  await createPharmacyJudicialCase(context, { caseNumber: text(data, "caseNumber"), patientId: text(data, "patientId"), unitId: text(data, "unitId"), lawyerId: text(data, "lawyerId"), openedAt: text(data, "openedAt"), validUntil: `${text(data, "validUntil")}T23:59:59-03:00`, reason: text(data, "reason"), processId: text(data, "processId") || null, purchaseRequestId: text(data, "purchaseRequestId") || null, items: JSON.parse(text(data, "items")) }); refresh();
}
export async function transitionJudicialCaseAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "update");
  await transitionPharmacyJudicialCase(context, { caseId: text(data, "caseId"), status: text(data, "status"), reason: text(data, "reason") }); refresh();
}
export async function renewJudicialCaseAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "update");
  await renewPharmacyJudicialCase(context, { caseId: text(data, "caseId"), validUntil: `${text(data, "validUntil")}T23:59:59-03:00`, reason: text(data, "reason") }); refresh();
}
export async function dispenseJudicialCaseAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "create");
  const database = context.database ?? db;
  const row = pharmacyRecord((await database.select({ item: items, case: cases }).from(items).innerJoin(cases, eq(cases.id, items.caseId)).where(eq(items.id, text(data, "itemId"))).limit(1))[0]);
  const item = { ...row.item, case: row.case };
  assertHealthUnitAccess(context.user, item.case.unitId);
  const stock = await readPharmacyStock(database, text(data, "stockId"));
  const shared = { judicialCaseItemId: item.id, warehouseId: stock.warehouseId, batchNumber: stock.batchNumber, quantity: Number(text(data, "quantity")), idempotencyKey: text(data, "idempotencyKey") };
  if (item.prescriptionItemId) await dispenseElectronicPrescription(context, { ...shared, prescriptionItemId: item.prescriptionItemId });
  else await dispenseManualMedicine(context, { ...shared, medicineId: item.medicineId, patientId: item.case.patientId, prescriptionType: text(data, "prescriptionType"), prescriberProfessionalId: text(data, "prescriberProfessionalId") || null, dosage: item.dosage });
  refresh();
}
export async function uploadJudicialDocumentAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "update");
  const row = pharmacyRecord((await (context.database ?? db).select({ case: cases, patient: patients }).from(cases).innerJoin(patients, eq(patients.id, cases.patientId)).where(eq(cases.id, text(data, "caseId"))).limit(1))[0]);
  const current = { ...row.case, patient: row.patient };
  assertHealthUnitAccess(context.user, current.unitId);
  const file = data.get("file");
  if (!(file instanceof File) || file.size <= 0 || file.size > 3 * 1024 * 1024) throw new Error("Selecione digitalização de até 3 MB.");
  const blob = await uploadProcessFile(file);
  try {
    await ingestGedDocument(databaseConnection, { title: text(data, "title") || file.name, documentType: "Processo judicial farmacêutico", documentClassCode: "SAUDE_DOCUMENTO_PADRAO", fileUrl: blob.url, content: new Uint8Array(await file.arrayBuffer()), actorUsuarioId: context.user.id, afterCreate: async (tx, documentId) => {
      await tx.update(documents).set({ personId: current.patient.personId }).where(eq(documents.id, documentId));
      await tx.insert(healthPharmacyJudicialDocuments).values({ caseId: current.id, documentId, actorUsuarioId: context.user.id });
    } });
  } catch (error) { await deleteUploadedDocument(blob).catch(() => {}); throw error; }
  refresh();
}
