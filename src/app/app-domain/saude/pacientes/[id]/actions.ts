"use server";

import { revalidatePath } from "next/cache";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { configurePatientRegistration, recordPatientDeath, recordPatientPhoneCall, savePatientContact, savePatientRegistrationDetails, scopedPatient } from "@/lib/saude/patient-registration-service";
import { registrationDetailsSchema } from "@/lib/saude/patient-registration-service";
import { uploadProcessFile, deleteUploadedDocument } from "@/lib/platform/blob";
import { ingestGedDocument } from "@/lib/documents/document-flow-service";
import { savePatientAddress } from "@/lib/saude/patient-address-service";

function refresh(id: string) { revalidatePath(`/saude/pacientes/${id}`); revalidatePath("/saude/pacientes"); revalidatePath("/cadastros/pessoas-fisicas"); }
const text = (data: FormData, key: string) => String(data.get(key) || "").trim();
function failure(error: unknown) { return { error: error instanceof Error ? error.message : "Não foi possível concluir a operação." }; }
export async function recordPhoneCallAction(patientId: string, data: FormData) {
  try { const context = await getTenantContextForModuleOperation("SAUDE", "update"); await recordPatientPhoneCall(context, patientId, { calledAt: text(data, "calledAt"), phone: text(data, "phone"), result: text(data, "result"), notes: text(data, "notes") || null, regulationRequestId: text(data, "regulationRequestId") || null }); refresh(patientId); return {}; } catch (error) { return failure(error); }
}

export async function saveRegistrationDetailsAction(patientId: string, raw: unknown) {
  try { const context = await getTenantContextForModuleOperation("SAUDE", "update"); await savePatientRegistrationDetails(context, patientId, registrationDetailsSchema.parse(raw)); refresh(patientId); return {}; } catch (error) { return failure(error); }
}
export async function savePatientAddressAction(patientId: string, data: FormData) {
  try { const context = await getTenantContextForModuleOperation("SAUDE", "update"); await savePatientAddress(context, patientId, Object.fromEntries(["addressType", "zipCode", "streetName", "streetType", "number", "complement", "neighborhoodName", "city", "state"].map(key => [key, text(data, key)]))); refresh(patientId); return {}; } catch (error) { return failure(error); }
}
export async function saveRegistrationPolicyAction(patientId: string, unitId: string, data: FormData) {
  try {
    const context = await getTenantContextForModuleOperation("SAUDE", "update");
    await configurePatientRegistration(context, unitId, { cpfRequiredFromAge: Number(text(data, "cpfRequiredFromAge")), preRegistrationDays: text(data, "preRegistrationDays") ? Number(text(data, "preRegistrationDays")) : null, registrationDays: text(data, "registrationDays") ? Number(text(data, "registrationDays")) : null, allowOutdatedForUrgency: data.get("allowOutdatedForUrgency") === "on", cardTitle: text(data, "cardTitle"), cardFooter: text(data, "cardFooter") });
    refresh(patientId); return {};
  } catch (error) { return failure(error); }
}
export async function savePatientContactAction(patientId: string, data: FormData) {
  try {
    const context = await getTenantContextForModuleOperation("SAUDE", "update");
    await savePatientContact(context, patientId, { id: text(data, "id") || undefined, name: text(data, "name"), phone: text(data, "phone"), kinship: text(data, "kinship"), relationshipKind: text(data, "relationshipKind"), startTime: text(data, "startTime") || null, endTime: text(data, "endTime") || null, isActive: data.get("isActive") !== "false" });
    refresh(patientId); return {};
  } catch (error) { return failure(error); }
}
export async function recordPatientDeathAction(patientId: string, data: FormData) {
  try { const context = await getTenantContextForModuleOperation("SAUDE", "update"); await recordPatientDeath(context, patientId, { deathDate: text(data, "deathDate"), registeredAt: text(data, "registeredAt"), municipality: text(data, "municipality"), cause: text(data, "cause"), cidReferenceId: text(data, "cidReferenceId") || null }); refresh(patientId); return {}; } catch (error) { return failure(error); }
}
export async function uploadPatientDocumentAction(patientId: string, data: FormData) {
  let uploaded: { url: string; pathname: string } | null = null;
  try {
    const context = await getTenantContextForModuleOperation("SAUDE", "update");
    const patient = await scopedPatient(context.prisma, context, patientId);
    const file = data.get("file"), kind = text(data, "kind");
    if (!(file instanceof File) || !["PHOTO", "SCANNED_RECORD", "OTHER"].includes(kind)) throw new Error("Selecione arquivo e tipo válidos.");
    if (kind === "PHOTO" && !["image/jpeg", "image/png"].includes(file.type)) throw new Error("A foto deve ser JPG ou PNG.");
    uploaded = await uploadProcessFile(file);
    const blob = uploaded;
    await ingestGedDocument(context.prisma, { title: text(data, "title") || file.name, documentType: kind === "PHOTO" ? "Foto do paciente" : "Documento do paciente", documentClassCode: "SAUDE_DOCUMENTO_PADRAO", fileUrl: blob.url, content: new Uint8Array(await file.arrayBuffer()), actorUsuarioId: context.user.id, afterCreate: async (tx, documentId) => {
      await tx.document.update({ where: { id: documentId }, data: { personId: patient.personId } });
      await tx.healthPatientDocument.create({ data: { patientId, documentId, kind, actorUsuarioId: context.user.id } });
      if (kind === "PHOTO") await tx.healthPatientRegistration.upsert({ where: { patientId }, create: { patientId, photoDocumentId: documentId }, update: { photoDocumentId: documentId } });
    } });
    uploaded = null; refresh(patientId); return {};
  } catch (error) { if (uploaded) await deleteUploadedDocument(uploaded).catch(() => {}); return failure(error); }
}
