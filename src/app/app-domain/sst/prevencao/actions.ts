"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AccessError, getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { SstValidationError } from "@/lib/sst/errors";
import { createPrevention, updateMeeting } from "@/lib/sst/prevention-service";
function message(error: unknown) { return error instanceof z.ZodError ? `${error.issues[0]?.path.join(" → ") || "Campos"}: ${error.issues[0]?.message || "Confira os campos."}` : error instanceof AccessError || error instanceof SstValidationError ? error.message : "Não foi possível concluir a operação de prevenção."; }
function refresh(id: string) { revalidatePath("/sst/prevencao"); revalidatePath(`/sst/prevencao/${id}`); revalidatePath("/app-domain/sst/prevencao"); }
export async function savePrevention(form: FormData) {
  try {
    const context = await getTenantContextForModuleOperation("SST", "create");
    const id = await createPrevention(context, { budgetUnitId: form.get("budgetUnitId"), title: form.get("title"), submissionKey: form.get("submissionKey"), payload: JSON.parse(String(form.get("payload"))) });
    refresh(id); return { error: null, id };
  } catch (error) { return { error: message(error) }; }
}
export async function postponeMeeting(form: FormData) {
  try {
    const context = await getTenantContextForModuleOperation("SST", "update");
    const id = await updateMeeting(context, { id: form.get("id"), at: form.get("at"), reason: form.get("reason") }, "postpone");
    refresh(id); return { error: null, id };
  } catch (error) { return { error: message(error) }; }
}
export async function closeMeeting(form: FormData) {
  try {
    const context = await getTenantContextForModuleOperation("SST", "update");
    const id = await updateMeeting(context, { id: form.get("id"), minutes: form.get("minutes"), presence: form.getAll("participant").map(String).map(employeeId => ({ employeeId, present: form.get(`present.${employeeId}`) === "on" })) }, "minutes");
    refresh(id); return { error: null, id };
  } catch (error) { return { error: message(error) }; }
}
