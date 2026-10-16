"use server";
import { revalidatePath } from "next/cache";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { saveNativeBinding } from "@/lib/transparencia/native-bindings";
export async function configureNativeSource(form: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("TRANSPARENCIA", "update");
  await saveNativeBinding(context.prisma, context.user.id, { collectionSlug: form.get("collectionSlug"), sourceType: form.get("sourceType"), sourceId: form.get("sourceId"), governmentEntityId: form.get("governmentEntityId"), enabled: form.has("enabled"), sourceReference: form.get("sourceReference"), details: JSON.parse(String(form.get("details") || "{}")) });
  revalidatePath("/transparencia/fontes"); revalidatePath("/portal/portaldatransparencia");
}
