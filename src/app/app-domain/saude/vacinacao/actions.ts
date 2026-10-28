"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { assertHealthUnitAccess, getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { recordVaccination } from "@/lib/saude/vaccination-service";
import { recordVaccineDoseLoss } from "@/lib/saude/vaccination-stock-service";
import { executeConfiguredHealthHttp } from "@/lib/integrations/runtime";
import { db } from "@/db/client";
import { eq } from "drizzle-orm";
import { vaccines, vaccinationRecords } from "@/db/schema/health-vaccination";
import { patients } from "@/db/schema/health-registration";
import { healthProfessionals, healthUnits } from "@/db/schema/health-workforce";
import { pharmacyRecord, readPharmacyStock } from "@/db/repositories/health-pharmacy/records";

const text = (data: FormData, name: string) => String(data.get(name) || "").trim();

export async function recordVaccinationAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "create");
  const database = context.database ?? db;
  const stockId = text(data, "stockId"), stock = stockId ? await readPharmacyStock(database, stockId) : null;
  const vaccine = pharmacyRecord((await database.select({ materialId: vaccines.materialId }).from(vaccines).where(eq(vaccines.id, text(data, "vaccineId"))).limit(1))[0]);
  if (stock && stock.materialId !== vaccine.materialId) throw new Error("Lote não corresponde ao imunobiológico selecionado.");
  await recordVaccination(context, { vaccineId: text(data, "vaccineId"), patientId: text(data, "patientId"), warehouseId: stock?.warehouseId || text(data, "warehouseId"), batchNumber: stock?.batchNumber || text(data, "batchNumber"), doseNumber: Number(data.get("doseNumber")), quantity: Number(data.get("quantity") || 1), appliedAt: text(data, "appliedAt") ? `${text(data, "appliedAt")}:00-03:00` : undefined, professionalId: text(data, "professionalId") || null, careGroup: text(data, "careGroup"), campaignId: text(data, "campaignId") || null, openedVialId: text(data, "openedVialId") || null, diluentStockId: text(data, "diluentStockId") || null, appointmentId: text(data, "appointmentId") || null, medicalRecordId: text(data, "medicalRecordId") || null, citizenCondition: text(data, "citizenCondition") || "NONE", strategy: text(data, "strategy"), applicationSite: text(data, "applicationSite"), applicationReason: text(data, "applicationReason"), administrationRoute: text(data, "administrationRoute"), shift: text(data, "shift"), idempotencyKey: text(data, "idempotencyKey") || randomUUID() });
  for (const path of ["/saude/vacinacao", "/saude/vacinacao/carteiras", `/saude/vacinacao/carteira/${text(data, "patientId")}`, "/saude/vacinacao/gestao", "/portal-paciente/saude"]) revalidatePath(path);
}

export async function recordVaccineLossAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "update");
  await recordVaccineDoseLoss(context, { stockId: text(data, "stockId"), openedVialId: text(data, "openedVialId") || null, quantity: Number(data.get("quantity")), reason: text(data, "reason"), idempotencyKey: text(data, "idempotencyKey") || randomUUID() });
  revalidatePath("/saude/vacinacao");
}

export async function exportVaccinationAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "update");
  const database = context.database ?? db;
  const [row] = await database.select({ record: vaccinationRecords, vaccine: vaccines, patient: patients, professional: healthProfessionals, unit: healthUnits }).from(vaccinationRecords).innerJoin(vaccines, eq(vaccines.id, vaccinationRecords.vaccineId)).innerJoin(patients, eq(patients.id, vaccinationRecords.patientId)).innerJoin(healthProfessionals, eq(healthProfessionals.id, vaccinationRecords.professionalId)).innerJoin(healthUnits, eq(healthUnits.id, vaccinationRecords.unitId)).where(eq(vaccinationRecords.id, text(data, "recordId"))).limit(1);
  if (!row) throw new Error("Ficha de vacinação não encontrada.");
  const record = { ...row.record, vaccine: row.vaccine, patient: row.patient, professional: row.professional, unit: row.unit };
  assertHealthUnitAccess(context.user, record.unitId);
  await executeConfiguredHealthHttp(database, { code: "ESUS_VACINACAO", operation: "EXPORT_ESUS_VACCINATION", payload: { version: "LOCAL-1", record } });
  revalidatePath("/saude/vacinacao");
}
