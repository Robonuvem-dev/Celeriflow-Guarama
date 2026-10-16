"use server";
import { revalidatePath } from "next/cache";
import { assertHealthUnitAccess, getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { createPharmacyJudicialCase, renewPharmacyJudicialCase, savePharmacyLawyer, transitionPharmacyJudicialCase } from "@/lib/saude/pharmacy-judicial-service";
import { dispenseElectronicPrescription, dispenseManualMedicine } from "@/lib/saude/pharmacy-dispensation-service";
import { deleteUploadedDocument, uploadProcessFile } from "@/lib/platform/blob";
import { ingestGedDocument } from "@/lib/documents/document-flow-service";
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
  const item = await context.prisma.healthPharmacyJudicialItem.findUniqueOrThrow({ where: { id: text(data, "itemId") }, include: { case: true } });
  assertHealthUnitAccess(context.user, item.case.unitId);
  const stock = await context.prisma.materialStock.findUniqueOrThrow({ where: { id: text(data, "stockId") } });
  const shared = { judicialCaseItemId: item.id, warehouseId: stock.warehouseId, batchNumber: stock.batchNumber, quantity: Number(text(data, "quantity")), idempotencyKey: text(data, "idempotencyKey") };
  if (item.prescriptionItemId) await dispenseElectronicPrescription(context, { ...shared, prescriptionItemId: item.prescriptionItemId });
  else await dispenseManualMedicine(context, { ...shared, medicineId: item.medicineId, patientId: item.case.patientId, prescriptionType: text(data, "prescriptionType"), prescriberProfessionalId: text(data, "prescriberProfessionalId") || null, dosage: item.dosage });
  refresh();
}
export async function uploadJudicialDocumentAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "update");
  const current = await context.prisma.healthPharmacyJudicialCase.findUniqueOrThrow({ where: { id: text(data, "caseId") }, include: { patient: true } });
  assertHealthUnitAccess(context.user, current.unitId);
  const file = data.get("file");
  if (!(file instanceof File) || file.size <= 0 || file.size > 3 * 1024 * 1024) throw new Error("Selecione digitalização de até 3 MB.");
  const blob = await uploadProcessFile(file);
  try {
    await ingestGedDocument(context.prisma, { title: text(data, "title") || file.name, documentType: "Processo judicial farmacêutico", documentClassCode: "SAUDE_DOCUMENTO_PADRAO", fileUrl: blob.url, content: new Uint8Array(await file.arrayBuffer()), actorUsuarioId: context.user.id, afterCreate: async (tx, documentId) => {
      await tx.document.update({ where: { id: documentId }, data: { personId: current.patient.personId } });
      await tx.healthPharmacyJudicialDocument.create({ data: { caseId: current.id, documentId, actorUsuarioId: context.user.id } });
    } });
  } catch (error) { await deleteUploadedDocument(blob).catch(() => {}); throw error; }
  refresh();
}
