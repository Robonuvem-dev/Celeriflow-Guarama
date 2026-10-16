"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AccessError, getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { registerQuestionnaireVersion, registerAnamnesis } from "@/lib/sst/questionnaire-service";
import { SstValidationError } from "@/lib/sst/errors";

function message(error: unknown) {
  return error instanceof AccessError || error instanceof SstValidationError ? error.message : error instanceof z.ZodError ? error.issues[0]?.message || "Confira os campos." : "Não foi possível salvar o registro ocupacional.";
}
export async function saveSstQuestionnaire(form: FormData) {
  try {
    const context = await getTenantContextForModuleOperation("SST", "create");
    const id = await registerQuestionnaireVersion(context, { ...Object.fromEntries(form), questions: JSON.parse(String(form.get("questions") || "[]")) });
    revalidatePath("/sst/questionarios"); revalidatePath("/app-domain/sst/questionarios");
    return { error: null, id };
  } catch (error) { return { error: message(error) }; }
}
export async function saveSstAnamnesis(form: FormData) {
  try {
    const context = await getTenantContextForModuleOperation("SST", "create");
    const id = await registerAnamnesis(context, { ...Object.fromEntries(form), answers: JSON.parse(String(form.get("answers") || "{}")) });
    revalidatePath(`/sst/aso/${String(form.get("asoId"))}/anamnese`);
    revalidatePath(`/app-domain/sst/aso/${String(form.get("asoId"))}/anamnese`);
    return { error: null, id };
  } catch (error) { return { error: message(error) }; }
}
