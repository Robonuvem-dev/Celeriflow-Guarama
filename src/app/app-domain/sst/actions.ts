"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getTenantContextForModuleOperation, isSystemAdministrator, AccessError } from "@/lib/platform/tenant-context";
import { registerCertificate, registerCertificateReason, assessCertificate } from "@/lib/sst/certificate-service";
import { assertSstClinicalAccess } from "@/lib/sst/access";
import { uploadProcessFile } from "@/lib/platform/blob";
import { ingestGedDocument } from "@/lib/documents/document-flow-service";
import { writeAuditEvent, auditEventTypes } from "@/lib/platform/audit-evidence";
import { SstValidationError } from "@/lib/sst/errors";

function errorResult(error: unknown) {
  if (error instanceof z.ZodError) return { error: error.issues[0]?.message || "Confira os campos informados." };
  if (error instanceof AccessError) return { error: error.message };
  if (error instanceof SstValidationError) return { error: error.message };
  return { error: "Não foi possível concluir a operação. Confira os dados e tente novamente." };
}

function refresh() {
  revalidatePath("/sst", "layout");
  revalidatePath("/app-domain/sst", "layout");
  revalidatePath("/rh/licencas");
  revalidatePath("/app-domain/rh/licencas");
  revalidatePath("/portal-servidor/ferias");
}

export async function createSstCertificate(form: FormData) {
  try {
    const context = await getTenantContextForModuleOperation("SST", "create");
    const result = await registerCertificate(context, { ...Object.fromEntries(form), cidCodes: String(form.get("cidCodes") || "").split(/[,;\s]+/).filter(Boolean) });
    refresh();
    return { error: null, ...result };
  } catch (error) { return errorResult(error); }
}

export async function createSstReason(form: FormData) {
  try {
    const context = await getTenantContextForModuleOperation("SST", "create");
    const id = await registerCertificateReason(context, {
      ...Object.fromEntries(form), restrictedRoleIds: form.getAll("restrictedRoleIds").map(String), restrictedRegimeIds: form.getAll("restrictedRegimeIds").map(String),
      autoProtocol: form.get("autoProtocol") === "on", autoPresentedAt: form.get("autoPresentedAt") === "on",
      printReceipt: form.get("printReceipt") === "on", suggestLeave: form.get("suggestLeave") === "on",
      createLeaveOnApproval: form.get("createLeaveOnApproval") === "on",
    });
    refresh(); return { error: null, id };
  } catch (error) { return errorResult(error); }
}

export async function assessSstCertificate(form: FormData) {
  try {
    const context = await getTenantContextForModuleOperation("SST", "update");
    const id = await assessCertificate(context, { ...Object.fromEntries(form), confirmLeave: form.get("confirmLeave") === "on" });
    refresh(); return { error: null, id };
  } catch (error) { return errorResult(error); }
}

export async function attachSstCertificateDocument(form: FormData) {
  try {
    const context = await getTenantContextForModuleOperation("SST", "update");
    const certificateId = z.string().min(1).parse(form.get("certificateId"));
    const certificate = await context.prisma.sstMedicalCertificate.findUnique({ where: { id: certificateId }, select: { budgetUnitId: true } });
    if (!certificate) throw new SstValidationError("Atestado não encontrado.");
    await assertSstClinicalAccess(context, certificate.budgetUnitId);
    const file = form.get("file");
    if (!(file instanceof File) || !file.size || file.size > 10 * 1024 * 1024 || !["application/pdf", "image/jpeg", "image/png"].includes(file.type)) throw new SstValidationError("Selecione um anexo PDF, JPG ou PNG de até 10 MB.");
    const blob = await uploadProcessFile(file);
    const result = await ingestGedDocument(context.prisma, {
      title: "Anexo ocupacional restrito", documentType: "SST_ATESTADO", documentClassCode: "SST_OCUPACIONAL",
      fileUrl: blob.url, content: new Uint8Array(await file.arrayBuffer()), actorUsuarioId: context.user.id,
      afterCreate: async (tx, documentId) => { await tx.sstCertificateDocument.create({ data: { certificateId, documentId, createdById: context.user.id } }); },
    });
    refresh(); return { error: null, id: result.documentId };
  } catch (error) { return errorResult(error); }
}

export async function saveSstAccessGrant(form: FormData) {
  try {
    const context = await getTenantContextForModuleOperation("SST", "update");
    if (!isSystemAdministrator(context.user)) throw new AccessError("Somente o administrador técnico pode configurar acesso clínico.", 403);
    const usuarioId = z.string().min(1).parse(form.get("usuarioId"));
    const budgetUnitId = z.string().min(1).parse(form.get("budgetUnitId"));
    const data = { canReadClinical: form.get("canReadClinical") === "on", canAssess: form.get("canAssess") === "on", isActive: form.get("isActive") === "on" };
    if (data.canAssess && !data.canReadClinical) throw new SstValidationError("Perícias exigem leitura clínica habilitada.");
    await context.prisma.$transaction(async (tx) => {
      if (!await tx.usuario.findUnique({ where: { id: usuarioId }, select: { id: true } })) throw new SstValidationError("Usuário não encontrado.");
      const grant = await tx.sstAccessGrant.upsert({ where: { usuarioId_budgetUnitId: { usuarioId, budgetUnitId } }, create: { usuarioId, budgetUnitId, ...data }, update: data });
      await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "SST_ACCESS_GRANT", targetId: grant.id });
    });
    refresh(); return { error: null };
  } catch (error) { return errorResult(error); }
}
