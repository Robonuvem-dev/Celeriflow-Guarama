"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { AccessError, getTenantContextForModuleOperation, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { registerProfessionalRole, registerDisciplineGrant } from "@/lib/sst/clinical-service";
import { SstValidationError } from "@/lib/sst/errors";
import { writeAuditEvent, auditEventTypes } from "@/lib/platform/audit-evidence";

const message = (error: unknown) => error instanceof AccessError || error instanceof SstValidationError ? error.message : error instanceof z.ZodError ? error.issues[0]?.message || "Confira os campos." : "Não foi possível salvar a habilitação/autorização.";
function refresh() { revalidatePath("/sst/profissionais"); revalidatePath("/app-domain/sst/profissionais"); }
export async function saveSstProfessional(form: FormData) {
  try { const context = await getTenantContextForModuleOperation("SST", "create"); const id = await registerProfessionalRole(context, Object.fromEntries(form)); refresh(); return { error: null, id }; }
  catch (error) { return { error: message(error) }; }
}
export async function saveSstDisciplineGrant(form: FormData) {
  try {
    const context = await getTenantContextForModuleOperation("SST", "update");
    const data = { canRead: form.get("canRead") === "on", canWrite: form.get("canWrite") === "on", isActive: form.get("isActive") === "on" };
    const id = await registerDisciplineGrant(context, { ...Object.fromEntries(form), ...data });
    refresh(); return { error: null, id };
  } catch (error) { return { error: message(error) }; }
}
export async function inactivateSstProfessional(form: FormData) {
  try {
    const context = await getTenantContextForModuleOperation("SST", "update");
    if (!isSystemAdministrator(context.user)) throw new AccessError("Inativação exige administração técnica.", 403);
    const id = z.string().min(1).parse(form.get("id"));
    await context.prisma.$transaction(async (tx) => { await tx.sstProfessionalRole.update({ where: { id }, data: { isActive: false } }); await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "SST_PROFESSIONAL_INACTIVATED", targetId: id }); });
    refresh(); return { error: null, id };
  } catch (error) { return { error: message(error) }; }
}
