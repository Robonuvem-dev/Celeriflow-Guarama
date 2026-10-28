"use server";
import { revalidatePath } from "next/cache";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { cancelMedicineDispensation, correctMedicineDispensation, dispenseElectronicPrescription, dispenseManualMedicine } from "@/lib/saude/pharmacy-dispensation-service";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { medicines } from "@/db/schema/health-prescriptions";
import { pharmacyRecord, readPharmacyStock } from "@/db/repositories/health-pharmacy/records";
const text = (data: FormData, key: string) => String(data.get(key) || "").trim();
const nullable = (data: FormData, key: string) => text(data, key) || null;
function refresh() {
  for (const path of ["/saude/farmacia/dispensacoes", "/saude/farmacia", "/saude/gerencial", "/saude/relatorios", "/portal-paciente/saude", "/patrimonio/materiais"]) revalidatePath(path);
}
export async function dispenseFromManagerAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "create");
  const stock = await readPharmacyStock(context.database ?? db, text(data, "stockId"));
  await dispenseElectronicPrescription(context, { prescriptionItemId: text(data, "prescriptionItemId"), warehouseId: stock.warehouseId, batchNumber: stock.batchNumber, quantity: Number(text(data, "quantity")), receiverPersonId: nullable(data, "receiverPersonId"), receiverRelationship: nullable(data, "receiverRelationship"), observation: nullable(data, "observation"), nextWithdrawalAt: nullable(data, "nextWithdrawalAt"), idempotencyKey: text(data, "idempotencyKey") });
  refresh();
}
export async function dispenseManualAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "create");
  const database = context.database ?? db;
  const stock = await readPharmacyStock(database, text(data, "stockId"));
  const medicine = pharmacyRecord((await database.select().from(medicines).where(and(eq(medicines.materialId, stock.materialId), eq(medicines.isActive, true))).limit(1))[0]);
  await dispenseManualMedicine(context, { medicineId: medicine.id, patientId: text(data, "patientId"), warehouseId: stock.warehouseId, batchNumber: stock.batchNumber, quantity: Number(text(data, "quantity")), prescriptionType: text(data, "prescriptionType"), prescriberProfessionalId: nullable(data, "prescriberProfessionalId"), dosage: text(data, "dosage"), receiverPersonId: nullable(data, "receiverPersonId"), receiverRelationship: nullable(data, "receiverRelationship"), observation: nullable(data, "observation"), nextWithdrawalAt: nullable(data, "nextWithdrawalAt"), idempotencyKey: text(data, "idempotencyKey") });
  refresh();
}
export async function cancelDispensationAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "delete");
  await cancelMedicineDispensation(context, { dispensationId: text(data, "dispensationId"), reason: text(data, "reason") });
  refresh();
}
export async function correctDispensationAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "update");
  await correctMedicineDispensation(context, { dispensationId: text(data, "dispensationId"), quantity: Number(text(data, "quantity")), batchNumber: text(data, "batchNumber"), reason: text(data, "reason") });
  refresh();
}
