"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AccessError, getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { registerFunctionalPeriod, registerVerifiedEntityMapping } from "@/lib/sst/functional-service";
import { SstValidationError } from "@/lib/sst/errors";
import { saveReasonRegimePolicy } from "@/lib/sst/functional-certificate-service";

function failure(error: unknown) {
  return { error: error instanceof z.ZodError ? error.issues[0]?.message || "Confira os dados." : error instanceof AccessError || error instanceof SstValidationError ? error.message : "Não foi possível salvar. Confira mapeamento UG/entidade, vigência e sobreposição de períodos." };
}
export async function saveFunctionalPeriod(form: FormData) {
  try {
    const context = await getTenantContextForModuleOperation("SST", "create");
    const id = await registerFunctionalPeriod(context, { ...Object.fromEntries(form), voided: form.get("voided") === "on" });
    revalidatePath("/sst/vinculos"); revalidatePath("/app-domain/sst/vinculos");
    return { error: null, id };
  } catch (error) { return failure(error); }
}
export async function saveEntityMapping(form: FormData) {
  try {
    const context = await getTenantContextForModuleOperation("SST", "create");
    const id = await registerVerifiedEntityMapping(context, Object.fromEntries(form));
    revalidatePath("/sst/vinculos"); revalidatePath("/app-domain/sst/vinculos");
    return { error: null, id };
  } catch (error) { return failure(error); }
}
export async function saveRegimePolicy(form: FormData) {
  try {
    const context = await getTenantContextForModuleOperation("SST", "update");
    const id = await saveReasonRegimePolicy(context, { ...Object.fromEntries(form), restrictedRegimeIds: form.getAll("restrictedRegimeIds").map(String) });
    revalidatePath("/sst/vinculos"); return { error: null, id };
  } catch (error) { return failure(error); }
}
