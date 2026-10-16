"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AccessError, getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { registerServiceOrder, registerTechnicalResponsibility, revokeFoundationalRecord } from "@/lib/sst/service-order-service";
import { SstValidationError } from "@/lib/sst/errors";

function failure(error: unknown) { return { error: error instanceof z.ZodError ? error.issues[0]?.message || "Confira os dados." : error instanceof AccessError || error instanceof SstValidationError ? error.message : "Não foi possível registrar a operação." }; }
function refresh() { revalidatePath("/sst/ordens-servico"); revalidatePath("/app-domain/sst/ordens-servico"); }
export async function saveServiceOrder(form: FormData) {
  try {
    const context = await getTenantContextForModuleOperation("SST", "create");
    const id = await registerServiceOrder(context, { ...Object.fromEntries(form), trainingRequirements: String(form.get("trainingRequirements") || "").split(";").map((s) => s.trim()).filter(Boolean), equipmentRequirements: form.getAll("materialId").map(String).map((materialId, i) => ({ materialId, quantity: form.getAll("quantity")[i], requirement: form.getAll("requirement")[i] })).filter((r) => r.materialId) });
    refresh(); return { error: null, id };
  } catch (error) { return failure(error); }
}
export async function saveTechnicalResponsibility(form: FormData) {
  try {
    const context = await getTenantContextForModuleOperation("SST", "create");
    const id = await registerTechnicalResponsibility(context, Object.fromEntries(form));
    refresh(); return { error: null, id };
  } catch (error) { return failure(error); }
}
export async function revokeTechnicalRecord(form: FormData) {
  try {
    const context = await getTenantContextForModuleOperation("SST", "update");
    const id = await revokeFoundationalRecord(context, Object.fromEntries(form));
    refresh(); return { error: null, id };
  } catch (error) { return failure(error); }
}
