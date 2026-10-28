"use server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { healthDatabaseConnection } from "@/lib/saude/health-transaction";
import { healthFamilies, healthHouseholds, healthMicroareas, healthTerritoryAreas, healthFamilyDocuments } from "@/db/schema/health-territory";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { assertHealthUnitAccess } from "@/lib/platform/tenant-context";
import { uploadProcessFile, deleteUploadedDocument } from "@/lib/platform/blob";
import { ingestGedDocument } from "@/lib/documents/document-flow-service";
import { assessHomeCare, changePrimaryFamilyMember, createHomeCareRequest, movePrimaryFamily, performHomeCare, recordCollectiveActivity, recordFoodMarkers, recordVisitOutcome, savePrimaryFamily, savePrimaryHousehold } from "@/lib/saude/primary-care-service";
const text = (data: FormData, key: string) => String(data.get(key) || "").trim();
const nullable = (data: FormData, key: string) => text(data, key) || null;
const number = (data: FormData, key: string) => text(data, key) ? Number(text(data, key)) : null;
const refresh = () => { revalidatePath("/saude/territorio"); revalidatePath("/saude/territorio/atencao-primaria"); revalidatePath("/social/familias"); };
export async function uploadFamilyDocumentAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "update");
  const [family] = await (context.database ?? db).select({ masterFamilyId: healthFamilies.masterFamilyId, unitId: healthFamilies.unitId, territoryUnitId: healthTerritoryAreas.unitId }).from(healthFamilies).leftJoin(healthHouseholds, eq(healthHouseholds.id, healthFamilies.householdId)).leftJoin(healthMicroareas, eq(healthMicroareas.id, healthHouseholds.microareaId)).leftJoin(healthTerritoryAreas, eq(healthTerritoryAreas.id, healthMicroareas.areaId)).where(eq(healthFamilies.id, text(data, "familyId"))).limit(1);
  if (!family) throw new Error("Família não encontrada.");
  const unitId = family.unitId || family.territoryUnitId;
  if (unitId) assertHealthUnitAccess(context.user, unitId); else if (context.user.hasHealthAccessScope) throw new Error("Família sem unidade autorizada.");
  if (!family.masterFamilyId) throw new Error("Vincule a família comum antes de anexar documentos.");
  const masterFamilyId = family.masterFamilyId;
  const file = data.get("file"); if (!(file instanceof File)) throw new Error("Selecione um documento.");
  const blob = await uploadProcessFile(file);
  try { await ingestGedDocument(healthDatabaseConnection(context), { title: text(data, "title") || file.name, documentType: "Documento familiar", documentClassCode: "SAUDE_DOCUMENTO_PADRAO", fileUrl: blob.url, content: new Uint8Array(await file.arrayBuffer()), actorUsuarioId: context.user.id, afterCreate: async (tx, documentId) => { await tx.insert(healthFamilyDocuments).values({ familyId: masterFamilyId, documentId, actorUsuarioId: context.user.id }); } }); }
  catch (error) { await deleteUploadedDocument(blob).catch(() => {}); throw error; }
  refresh();
}
export async function saveHouseholdDetailsAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "update");
  await savePrimaryHousehold(context, { id: text(data, "id") || undefined, householdCode: text(data, "householdCode"), microareaId: text(data, "microareaId"), addressId: text(data, "addressId"), housingDetails: { housingType: text(data, "housingType"), possession: text(data, "possession"), location: text(data, "location"), rooms: Number(text(data, "rooms")), residents: Number(text(data, "residents")), construction: text(data, "construction"), access: text(data, "access"), waterSupply: text(data, "waterSupply"), waterTreatment: text(data, "waterTreatment"), sewage: text(data, "sewage"), garbage: text(data, "garbage"), electricity: data.get("electricity") === "on", animals: text(data, "animals").split(";").map(value => value.trim()).filter(Boolean), notes: text(data, "notes") } }); refresh();
}
export async function savePrimaryFamilyAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "update");
  await savePrimaryFamily(context, Object.fromEntries(["id", "masterFamilyId", "familyCode", "responsiblePersonId", "householdId", "unitId", "teamId", "classification", "familyType"].map(key => [key, key === "id" ? text(data, key) || undefined : ["masterFamilyId", "teamId"].includes(key) ? nullable(data, key) : text(data, key)]))); refresh();
}
export async function changeFamilyMemberAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "update");
  await changePrimaryFamilyMember(context, Object.fromEntries(["familyId", "personId", "kinship", "operation", "effectiveAt", "reason"].map(key => [key, text(data, key)]))); refresh();
}
export async function moveFamilyAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "update");
  await movePrimaryFamily(context, { familyId: text(data, "familyId"), householdId: nullable(data, "householdId"), outsideMunicipality: data.get("outsideMunicipality") === "on", effectiveAt: text(data, "effectiveAt"), reason: text(data, "reason") }); refresh();
}
export async function recordVisitOutcomeAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "update");
  await recordVisitOutcome(context, { visitId: text(data, "visitId"), personId: text(data, "personId"), outcome: text(data, "outcome"), refusalReason: nullable(data, "refusalReason"), weight: number(data, "weight"), height: number(data, "height"), bloodPressure: nullable(data, "bloodPressure"), temperature: number(data, "temperature"), heartRate: number(data, "heartRate"), bloodGlucose: number(data, "bloodGlucose") }); refresh();
}
export async function createHomeCareRequestAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "create");
  await createHomeCareRequest(context, { patientId: text(data, "patientId"), unitId: text(data, "unitId"), requestedAt: text(data, "requestedAt"), reason: text(data, "reason") }); refresh();
}
export async function assessHomeCareAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "update");
  await assessHomeCare(context, { requestId: text(data, "requestId"), assessedAt: text(data, "assessedAt"), eligible: text(data, "eligible") === "true", modality: text(data, "modality"), cidReferenceId: nullable(data, "cidReferenceId"), character: text(data, "character"), evaluation: text(data, "evaluation") }); refresh();
}
export async function performHomeCareAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "update");
  await performHomeCare(context, { requestId: text(data, "requestId"), assessmentId: text(data, "assessmentId"), performedAt: text(data, "performedAt"), narrative: text(data, "narrative"), procedureId: nullable(data, "procedureId") }); refresh();
}
export async function recordCollectiveActivityAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "create");
  await recordCollectiveActivity(context, { unitId: text(data, "unitId"), teamId: text(data, "teamId"), occurredAt: text(data, "occurredAt"), activityType: text(data, "activityType"), themes: data.getAll("themes"), practices: data.getAll("practices"), participantIds: data.getAll("participantIds"), procedureId: nullable(data, "procedureId"), notes: nullable(data, "notes") }); refresh();
}
export async function recordFoodMarkersAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "create");
  const markers = Object.fromEntries([...data.entries()].filter(([key]) => key.startsWith("marker.")).map(([key, value]) => [key.slice(7), value]));
  await recordFoodMarkers(context, { patientId: text(data, "patientId"), unitId: text(data, "unitId"), recordedAt: text(data, "recordedAt"), ageGroup: text(data, "ageGroup"), place: text(data, "place"), markers }); refresh();
}
