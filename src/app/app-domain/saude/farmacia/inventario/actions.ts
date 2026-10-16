"use server";
import { revalidatePath } from "next/cache";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { closePharmacyInventory, countPharmacyInventory, startPharmacyInventory, submitPharmacyInventory } from "@/lib/saude/pharmacy-inventory-service";
const text = (data: FormData, key: string) => String(data.get(key) || "").trim();
function refresh() { for (const path of ["/saude/farmacia/inventario", "/saude/farmacia", "/saude/farmacia/dispensacoes", "/patrimonio/inventarios", "/patrimonio/materiais"]) revalidatePath(path); }
export async function startPharmacyInventoryAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "create");
  await startPharmacyInventory(context, text(data, "warehouseId")); refresh();
}
export async function countPharmacyInventoryAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "update");
  await countPharmacyInventory(context, { sessionId: text(data, "sessionId"), itemId: text(data, "itemId"), countedQuantity: text(data, "countedQuantity") === "" ? Number.NaN : Number(text(data, "countedQuantity")), divergenceType: text(data, "divergenceType"), countEvidence: text(data, "countEvidence"), adjustmentReason: text(data, "adjustmentReason") }); refresh();
}
export async function submitPharmacyInventoryAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "update");
  await submitPharmacyInventory(context, text(data, "sessionId")); refresh();
}
export async function closePharmacyInventoryAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "update");
  await closePharmacyInventory(context, { sessionId: text(data, "sessionId"), approvalEvidence: text(data, "approvalEvidence") }); refresh();
}
