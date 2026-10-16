"use server";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { saveCatLayout } from "@/lib/sst/accident-layout-service";
import { accidentActionError } from "@/lib/sst/accident-errors";
import { revalidatePath } from "next/cache";
export async function saveInssCatLayout(form: FormData) {
  try {
    const context = await getTenantContextForModuleOperation("SST","create"), f = Object.fromEntries(form.entries());
    const id = await saveCatLayout(context,{ ...f, fields: JSON.parse(String(f.fields)), medicalFields: JSON.parse(String(f.medicalFields || "{}")) });
    revalidatePath(`/sst/acidentes/${id}`); return { error: null, id };
  } catch (error) { return { error: accidentActionError(error) }; }
}
