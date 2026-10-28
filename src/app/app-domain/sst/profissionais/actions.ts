"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { AccessError, getTenantContextForModuleOperation, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { registerProfessionalRole, registerDisciplineGrant } from "@/lib/sst/clinical-service";
import { SstValidationError } from "@/lib/sst/errors";
import { auditEventTypes } from "@/lib/platform/audit-evidence";
import { insertAuditEvent as writeAuditEvent } from "@/db/repositories/platform/audit";
import { eq } from "drizzle-orm";
import { sstProfessionalRoles } from "@/db/schema/sst-clinical";
import { withDatabaseTransaction } from "@/db/transaction";
import { sstContextConnection } from "@/lib/sst/database";

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
    await withDatabaseTransaction(sstContextConnection(context), async (tx) => { if (!(await tx.update(sstProfessionalRoles).set({ isActive: false }).where(eq(sstProfessionalRoles.id, id)).returning({ id: sstProfessionalRoles.id })).length) throw new SstValidationError("Profissional não encontrado."); await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "SST_PROFESSIONAL_INACTIVATED", targetId: id }); });
    refresh(); return { error: null, id };
  } catch (error) { return { error: message(error) }; }
}
