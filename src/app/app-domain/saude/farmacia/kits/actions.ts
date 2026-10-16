"use server";
import { revalidatePath } from "next/cache";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { deliverPharmacyKit, generatePharmacyKits, recordUncollectedPharmacyKit, returnPharmacyKit, savePharmacyKit } from "@/lib/saude/pharmacy-kit-service";
import { closeHealthCareProgramEnrollment, enrollInHealthCareProgram, saveHealthCareProgram } from "@/lib/saude/care-program-service";
const text = (data: FormData, key: string) => String(data.get(key) || "").trim();
function refresh() { for (const path of ["/saude/farmacia/kits", "/saude/farmacia", "/saude/farmacia/dispensacoes", "/saude/gerencial"]) revalidatePath(path); }
export async function saveKitAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "update");
  await savePharmacyKit(context, { code: text(data, "code"), name: text(data, "name"), items: JSON.parse(text(data, "items")) }); refresh();
}
export async function generateKitsAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "create");
  await generatePharmacyKits(context, { kitId: text(data, "kitId"), warehouseId: text(data, "warehouseId"), patientIds: data.getAll("patientIds").map(String), criteria: { programId: text(data, "programId") || null, neighborhoodId: text(data, "neighborhoodId") || null, careGroup: text(data, "careGroup"), prescriptionValidThrough: text(data, "prescriptionValidThrough") ? `${text(data, "prescriptionValidThrough")}T23:59:59-03:00` : null }, idempotencyKey: text(data, "idempotencyKey") }); refresh();
}
export async function deliverKitAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "create");
  await deliverPharmacyKit(context, { deliveryId: text(data, "deliveryId"), receiverPersonId: text(data, "receiverPersonId") || null, receiverRelationship: text(data, "receiverRelationship") || null, stocks: [...data.entries()].filter(([key]) => key.startsWith("stock.")).map(([key, stockId]) => ({ itemId: key.slice(6), stockId: String(stockId) })) }); refresh();
}
export async function uncollectedKitAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "update");
  await recordUncollectedPharmacyKit(context, { deliveryId: text(data, "deliveryId"), reason: text(data, "reason") }); refresh();
}
export async function returnKitAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "update");
  await returnPharmacyKit(context, { deliveryId: text(data, "deliveryId"), reason: text(data, "reason") }); refresh();
}
export async function saveCareProgramAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "update");
  await saveHealthCareProgram(context, { code: text(data, "code"), name: text(data, "name") }); refresh();
}
export async function enrollCareProgramAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "update");
  await enrollInHealthCareProgram(context, { programId: text(data, "programId"), patientId: text(data, "patientId"), unitId: text(data, "unitId"), startsAt: text(data, "startsAt"), endsAt: text(data, "endsAt") ? `${text(data, "endsAt")}T23:59:59-03:00` : null, reason: text(data, "reason") }); refresh();
}
export async function closeCareProgramAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "update");
  await closeHealthCareProgramEnrollment(context, { enrollmentId: text(data, "enrollmentId"), reason: text(data, "reason") }); refresh();
}
