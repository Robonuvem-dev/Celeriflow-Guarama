"use server";
import { revalidatePath } from "next/cache";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { addVaccineAdverseConduct, configureVaccineStock, recordVaccinationCardEvent, recordVaccineAdverseEvent, revokeVaccinationCardEvent, saveVaccinationCampaign, saveVaccineCalendarRule, saveVaccineCodeMapping, saveVaccineInteraction, saveVaccineManufacturer } from "@/lib/saude/vaccination-registry-service";
import { configureVaccineLot, prepareVaccineVial, receiveVaccineVials, reconcileOpenedVaccineVial, registerExistingOpenedVaccineVial } from "@/lib/saude/vaccination-stock-service";
const text = (data: FormData, key: string) => String(data.get(key) || "").trim();
const nullable = (data: FormData, key: string) => text(data, key) || null;
const numberOrNull = (data: FormData, key: string) => text(data, key) ? Number(text(data, key)) : null;
function numeric(data: FormData, key: string) { if (!text(data, key)) throw new Error("Preencha os campos numéricos obrigatórios."); return Number(text(data, key)); }
function localDate(data: FormData, key: string, required = true, end = false) {
  const value = text(data, key);
  if (!value) { if (required) throw new Error(`Informe a data de ${key}.`); return null; }
  return value.includes("T") ? `${value}${value.length === 16 ? ":00" : ""}-03:00` : `${value}T${end ? "23:59:59" : "00:00:00"}-03:00`;
}
function refresh(patientId?: string) {
  for (const path of ["/saude/vacinacao", "/saude/vacinacao/gestao", "/saude/vacinacao/carteiras", "/saude/farmacia", "/portal-paciente/saude"]) revalidatePath(path);
  if (patientId) revalidatePath(`/saude/vacinacao/carteira/${patientId}`);
}
export async function manufacturerAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "update");
  await saveVaccineManufacturer(context, { id: text(data, "id") || undefined, name: text(data, "name"), rndsCode: nullable(data, "rndsCode"), sourceReference: nullable(data, "sourceReference") }); refresh();
}
export async function vaccineMappingAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "update");
  await saveVaccineCodeMapping(context, { vaccineId: text(data, "vaccineId"), system: text(data, "system"), code: text(data, "code"), version: text(data, "version"), sourceReference: text(data, "sourceReference") }); refresh();
}
export async function vaccineStockConfigurationAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "update");
  await configureVaccineStock(context, { vaccineId: text(data, "vaccineId"), diluentMaterialId: nullable(data, "diluentMaterialId"), diluentUnitsPerVial: numeric(data, "diluentUnitsPerVial"), useAfterOpeningHours: numberOrNull(data, "useAfterOpeningHours"), rndsAuthorized: data.get("rndsAuthorized") === "on" }); refresh();
}
export async function vaccineCalendarAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "update");
  await saveVaccineCalendarRule(context, { code: text(data, "code"), vaccineId: text(data, "vaccineId"), doseNumber: numeric(data, "doseNumber"), strategy: text(data, "strategy"), ageUnit: text(data, "ageUnit"), minimumAge: numeric(data, "minimumAge"), maximumAge: numberOrNull(data, "maximumAge"), minimumIntervalDays: numeric(data, "minimumIntervalDays"), repeatEveryMonths: numberOrNull(data, "repeatEveryMonths"), required: data.get("required") === "on", enabled: data.get("enabled") === "on", validFrom: localDate(data, "validFrom"), validUntil: localDate(data, "validUntil", false, true), sourceReference: text(data, "sourceReference") }); refresh();
}
export async function vaccineInteractionAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "update");
  await saveVaccineInteraction(context, { firstVaccineId: text(data, "firstVaccineId"), secondVaccineId: text(data, "secondVaccineId"), minimumIntervalDays: numeric(data, "minimumIntervalDays"), allowSameDay: data.get("allowSameDay") === "on", sourceReference: text(data, "sourceReference") }); refresh();
}
export async function vaccinationCampaignAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "update");
  await saveVaccinationCampaign(context, { name: text(data, "name"), startsAt: localDate(data, "startsAt"), endsAt: localDate(data, "endsAt", true, true), publicInformation: text(data, "publicInformation") }); refresh();
}
export async function receiveVaccineVialsAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "create");
  await receiveVaccineVials(context, { vaccineId: text(data, "vaccineId"), warehouseId: text(data, "warehouseId"), batchNumber: text(data, "batchNumber"), expirationDate: text(data, "expirationDate"), vials: numeric(data, "vials"), dosesPerVial: numeric(data, "dosesPerVial"), costPerVial: numeric(data, "costPerVial"), manufacturerId: nullable(data, "manufacturerId"), entryType: text(data, "entryType"), supplierId: nullable(data, "supplierId"), donorName: nullable(data, "donorName"), idempotencyKey: text(data, "idempotencyKey") }); refresh();
}
export async function vaccineLotAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "update");
  await configureVaccineLot(context, { stockId: text(data, "stockId"), dosesPerVial: numeric(data, "dosesPerVial"), manufacturerId: nullable(data, "manufacturerId"), manufacturerName: nullable(data, "manufacturerName") }); refresh();
}
export async function existingVialAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "update");
  await registerExistingOpenedVaccineVial(context, { stockId: text(data, "stockId"), remainingDoses: numeric(data, "remainingDoses"), openedAt: localDate(data, "openedAt"), expiresAt: localDate(data, "expiresAt", false), sourceReference: text(data, "sourceReference") }); refresh();
}
export async function prepareVialAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "update");
  await prepareVaccineVial(context, { stockId: text(data, "stockId"), openedAt: localDate(data, "openedAt"), diluentStockId: nullable(data, "diluentStockId"), preparationKey: text(data, "preparationKey"), sourceReference: text(data, "sourceReference") }); refresh();
}
export async function reconcileVialAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "update");
  await reconcileOpenedVaccineVial(context, { vialId: text(data, "vialId"), remainingDoses: numeric(data, "remainingDoses"), reason: text(data, "reason") }); refresh();
}
export async function vaccinationCardEventAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "create");
  await recordVaccinationCardEvent(context, { patientId: text(data, "patientId"), vaccineId: text(data, "vaccineId"), unitId: text(data, "unitId"), professionalId: nullable(data, "professionalId"), kind: text(data, "kind"), doseNumber: numeric(data, "doseNumber"), strategy: text(data, "strategy"), occurredAt: localDate(data, "occurredAt"), scheduledFor: localDate(data, "scheduledFor", false), until: localDate(data, "until", false, true), reason: text(data, "reason"), sourceReference: nullable(data, "sourceReference"), lotNumber: nullable(data, "lotNumber") }); refresh(text(data, "patientId"));
}
export async function revokeVaccinationCardEventAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "update");
  const event = await revokeVaccinationCardEvent(context, { eventId: text(data, "eventId"), reason: text(data, "reason") }); refresh(event.patientId);
}
export async function vaccineAdverseEventAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "create");
  await recordVaccineAdverseEvent(context, { patientId: text(data, "patientId"), vaccineId: text(data, "vaccineId"), unitId: text(data, "unitId"), vaccinationRecordId: nullable(data, "vaccinationRecordId"), occurredAt: localDate(data, "occurredAt"), eventType: text(data, "eventType"), lesionType: text(data, "lesionType"), lesionLocation: text(data, "lesionLocation"), severity: text(data, "severity"), clinicalNotes: text(data, "clinicalNotes") }); refresh(text(data, "patientId"));
}
export async function vaccineAdverseConductAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "update");
  const event = await context.prisma.healthVaccineAdverseEvent.findUniqueOrThrow({ where: { id: text(data, "eventId") }, select: { patientId: true } });
  await addVaccineAdverseConduct(context, { eventId: text(data, "eventId"), occurredAt: localDate(data, "occurredAt"), professionalId: nullable(data, "professionalId"), conduct: text(data, "conduct"), narrative: text(data, "narrative") }); refresh(event.patientId);
}
