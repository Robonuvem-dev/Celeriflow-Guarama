"use server";
import { revalidatePath } from "next/cache";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { createMedicalBoard, createAvailability, bookAppointment, blockAvailability, cancelAppointment } from "@/lib/sst/agenda-service";
import { updateCertificateReason } from "@/lib/sst/certificate-service";
import { z } from "zod";
import { AccessError } from "@/lib/platform/tenant-context";
import { SstValidationError } from "@/lib/sst/errors";
import { writeAuditEvent, auditEventTypes } from "@/lib/platform/audit-evidence";
import { assertBudgetUnitAccess } from "@/lib/platform/tenant-context";

function fail(error: unknown) {
  return { error: error instanceof z.ZodError ? error.issues[0]?.message || "Confira os campos." : error instanceof AccessError || error instanceof SstValidationError ? error.message : "Não foi possível salvar. Confira os dados e tente novamente." };
}
function refresh() { revalidatePath("/sst", "layout"); revalidatePath("/app-domain/sst", "layout"); }

export async function saveSstBoard(form: FormData) {
  try {
    const context = await getTenantContextForModuleOperation("SST", "create");
    const ids = form.getAll("personId").map(String);
    const councils = form.getAll("council").map(String);
    const id = await createMedicalBoard(context, { ...Object.fromEntries(form), members: ids.flatMap((personId, index) => personId ? [{ personId, council: councils[index] || "" }] : []) });
    refresh(); return { error: null, id };
  } catch (error) { return fail(error); }
}
export async function saveSstAvailability(form: FormData) {
  try { const id = await createAvailability(await getTenantContextForModuleOperation("SST", "create"), Object.fromEntries(form)); refresh(); return { error: null, id }; }
  catch (error) { return fail(error); }
}
export async function saveSstAppointment(form: FormData) {
  try { const id = await bookAppointment(await getTenantContextForModuleOperation("SST", "create"), Object.fromEntries(form)); refresh(); return { error: null, id }; }
  catch (error) { return fail(error); }
}
export async function saveSstBlock(form: FormData) {
  try { const id = await blockAvailability(await getTenantContextForModuleOperation("SST", "update"), Object.fromEntries(form)); refresh(); return { error: null, id }; }
  catch (error) { return fail(error); }
}
export async function cancelSstAppointment(form: FormData) {
  try { const id = await cancelAppointment(await getTenantContextForModuleOperation("SST", "update"), Object.fromEntries(form)); refresh(); return { error: null, id }; }
  catch (error) { return fail(error); }
}
export async function updateSstReason(form: FormData) {
  try {
    const context = await getTenantContextForModuleOperation("SST", "update");
    const id = await updateCertificateReason(context, z.string().min(1).parse(form.get("id")), {
      ...Object.fromEntries(form), restrictedRoleIds: form.getAll("restrictedRoleIds").map(String), restrictedRegimeIds: form.getAll("restrictedRegimeIds").map(String),
      autoProtocol: form.get("autoProtocol") === "on", autoPresentedAt: form.get("autoPresentedAt") === "on",
      printReceipt: form.get("printReceipt") === "on", suggestLeave: form.get("suggestLeave") === "on", createLeaveOnApproval: form.get("createLeaveOnApproval") === "on",
    });
    refresh(); return { error: null, id };
  } catch (error) { return fail(error); }
}
export async function setSstReasonActive(form: FormData) {
  try {
    const context = await getTenantContextForModuleOperation("SST", "update");
    const id = z.string().min(1).parse(form.get("id"));
    await context.prisma.$transaction(async (tx) => {
      const reason = await tx.sstCertificateReason.findUniqueOrThrow({ where: { id } });
      assertBudgetUnitAccess(context.user, reason.budgetUnitId);
      await tx.sstCertificateReason.update({ where: { id }, data: { isActive: form.get("active") === "true" } });
      await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "SST_REASON_STATUS", targetId: id });
    });
    refresh(); return { error: null, id };
  } catch (error) { return fail(error); }
}
