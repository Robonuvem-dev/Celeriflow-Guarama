"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AccessError, getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { StockServiceError } from "@/lib/patrimonio/stock-service";
import { SstValidationError } from "@/lib/sst/errors";
import { registerEquipment, registerEquipmentDelivery, registerEquipmentEvent, setEquipmentStockPolicy, mapEquipmentRequirement } from "@/lib/sst/equipment-service";

function message(error:unknown) {
  return error instanceof AccessError || error instanceof SstValidationError || error instanceof StockServiceError ? error.message : error instanceof z.ZodError ? error.issues[0]?.message || "Confira os campos." : "Não foi possível salvar. Confira se o material já possui complemento EPI/EPC nesta UG.";
}
function refresh() { revalidatePath("/sst/equipamentos","layout"); revalidatePath("/app-domain/sst/equipamentos","layout"); }
export async function saveEquipment(form:FormData) {
  try { const context=await getTenantContextForModuleOperation("SST","create"); const id=await registerEquipment(context,{...Object.fromEntries(form),caValidUntil:form.get("caValidUntil")||null,supplierId:form.get("supplierId")||null}); refresh(); return {error:null,id}; } catch(error) { return {error:message(error)}; }
}
export async function saveEquipmentDelivery(form:FormData) {
  try { const context=await getTenantContextForModuleOperation("SST","create"); const id=await registerEquipmentDelivery(context,{...Object.fromEntries(form),employeeIds:form.getAll("employeeIds"),warehouseId:form.get("warehouseId")||null}); refresh(); return {error:null,id}; } catch(error) { return {error:message(error)}; }
}
export async function saveEquipmentEvent(form:FormData) {
  try { const context=await getTenantContextForModuleOperation("SST","create"); const id=await registerEquipmentEvent(context,{...Object.fromEntries(form),itemIds:form.getAll("itemIds"),nextReviewAt:form.get("nextReviewAt")||null}); refresh(); return {error:null,id}; } catch(error) { return {error:message(error)}; }
}
export async function saveEquipmentPolicy(form:FormData) {
  try { const context=await getTenantContextForModuleOperation("SST","update"); const id=await setEquipmentStockPolicy(context,z.string().min(1).parse(form.get("budgetUnitId")),form.get("integrateStock")==="on"); refresh(); return {error:null,id}; } catch(error) { return {error:message(error)}; }
}
export async function saveEquipmentRequirement(form:FormData) {
  try { const context=await getTenantContextForModuleOperation("SST","create"); const id=await mapEquipmentRequirement(context,Object.fromEntries(form)); refresh(); return {error:null,id}; } catch(error) { return {error:message(error)}; }
}
