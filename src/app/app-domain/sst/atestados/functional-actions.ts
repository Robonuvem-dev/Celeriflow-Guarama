"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getTenantContextForModuleOperation, AccessError } from "@/lib/platform/tenant-context";
import { confirmCertificateLeave, reviseCertificateDecision } from "@/lib/sst/functional-certificate-service";
import { SstValidationError } from "@/lib/sst/errors";
import { reconcileCertificateLeavePayroll } from "@/lib/sst/functional-leave-posting";

function failure(error: unknown) { return { error: error instanceof z.ZodError ? error.issues[0]?.message || "Confira os campos." : error instanceof AccessError || error instanceof SstValidationError ? error.message : "Não foi possível concluir a decisão." }; }
function refresh() { revalidatePath("/sst/atestados"); revalidatePath("/app-domain/sst/atestados"); revalidatePath("/rh/licencas"); revalidatePath("/app-domain/rh/licencas"); }
export async function reconcileSstLeavePayroll(form: FormData) {
  try {
    const context = await getTenantContextForModuleOperation("SST", "update");
    const result = await reconcileCertificateLeavePayroll(context, { ...Object.fromEntries(form), confirmPayrollScope: form.get("confirmPayrollScope") === "on" });
    if (result.status === "BLOCKED") return { error: `Postagem bloqueada: ${result.blockers.join(" · ")}` };
    refresh(); revalidatePath("/rh/folha"); revalidatePath("/app-domain/rh/folha");
    return { error: null, id: String(form.get("certificateId")), originId: result.originId, amount: result.amount };
  } catch (error) { return failure(error); }
}
export async function confirmSstLeave(form: FormData) {
  try {
    const context = await getTenantContextForModuleOperation("SST", "update");
    const id = await confirmCertificateLeave(context, { ...Object.fromEntries(form), confirmed: form.get("confirmed") === "on" });
    refresh(); return { error: null, id };
  } catch (error) { return failure(error); }
}
export async function reviseSstDecision(form: FormData) {
  try {
    const context = await getTenantContextForModuleOperation("SST", "update");
    const id = await reviseCertificateDecision(context, { ...Object.fromEntries(form), confirmLeave: form.get("confirmLeave") === "on" });
    refresh(); return { error: null, id };
  } catch (error) { return failure(error); }
}
