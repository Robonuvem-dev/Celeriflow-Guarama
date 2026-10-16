"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getTenantContextForModuleOperation, AccessError } from "@/lib/platform/tenant-context";
import { registerClinicalRecord, registerOccupationalVaccination } from "@/lib/sst/clinical-service";
import { SstValidationError } from "@/lib/sst/errors";
const message = (error: unknown) => error instanceof AccessError || error instanceof SstValidationError ? error.message : error instanceof z.ZodError ? error.issues[0]?.message || "Confira os campos." : "Não foi possível registrar o atendimento.";
export async function saveSstClinicalRecord(form: FormData) {
  try {
    const context = await getTenantContextForModuleOperation("SST", "create");
    const id = await registerClinicalRecord(context, { ...Object.fromEntries(form), cidCodes: String(form.get("cidCodes") || "").split(/[;,\s]+/).filter(Boolean), requests: JSON.parse(String(form.get("requests") || "[]")), answers: JSON.parse(String(form.get("answers") || "{}")) });
    revalidatePath("/sst/prontuarios"); revalidatePath("/app-domain/sst/prontuarios"); return { error: null, id };
  } catch (error) { return { error: message(error) }; }
}
export async function saveSstVaccination(form: FormData) {
  try {
    const context = await getTenantContextForModuleOperation("SST", "create");
    const id = await registerOccupationalVaccination(context, Object.fromEntries(form));
    revalidatePath("/sst/vacinacao"); revalidatePath("/app-domain/sst/vacinacao"); return { error: null, id };
  } catch (error) { return { error: message(error) }; }
}
