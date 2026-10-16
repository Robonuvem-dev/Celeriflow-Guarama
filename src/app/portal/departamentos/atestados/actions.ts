"use server";
import { revalidatePath } from "next/cache";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { registerDepartmentCertificate } from "@/lib/portal-servidor/department-certificates";

export async function registerDepartmentCertificateAction(raw: unknown) {
  try {
    const context = await getTenantContextForModuleOperation("SST", "create");
    const result = await registerDepartmentCertificate(context, raw);
    revalidatePath("/portal/departamentos/atestados"); revalidatePath("/sst/atestados");
    return { id: result.id, error: "" };
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível receber o atestado." }; }
}
