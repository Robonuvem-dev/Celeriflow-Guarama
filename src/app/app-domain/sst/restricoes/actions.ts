"use server";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { registerRestriction, registerRoleAttribute, addRestrictionFollowup } from "@/lib/sst/restriction-service";
import { revalidatePath } from "next/cache";
import { accidentActionError } from "@/lib/sst/accident-errors";
export async function saveRestriction(form: FormData) {
  try {
    const context = await getTenantContextForModuleOperation("SST", "create"), f = Object.fromEntries(form.entries());
    const id = await registerRestriction(context, { ...f, cidCodes: String(f.cidCodes).split(";").map(s => s.trim()).filter(Boolean), attributes: JSON.parse(String(f.attributes)), notificationEnabled: f.notificationEnabled === "on", notifyDays: Number(f.notifyDays) });
    revalidatePath("/sst/restricoes"); return { error: null, id };
  } catch (e) { return { error: accidentActionError(e) }; }
}
export async function saveRoleAttribute(form: FormData) {
  try { await registerRoleAttribute(await getTenantContextForModuleOperation("SST", "create"), Object.fromEntries(form.entries())); revalidatePath("/sst/restricoes"); return { error: null }; }
  catch (e) { return { error: accidentActionError(e) }; }
}
export async function saveFollowup(form: FormData) {
  try { const id = await addRestrictionFollowup(await getTenantContextForModuleOperation("SST", "create"), Object.fromEntries(form.entries())); revalidatePath("/sst/restricoes"); return { error: null, id }; }
  catch (e) { return { error: accidentActionError(e) }; }
}
