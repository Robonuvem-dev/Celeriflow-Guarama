"use server";

import { revalidatePath } from "next/cache";
import { getTenantContextForModuleOperation, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { recordA1Failure, registerA1Certificate, setA1CertificateStatus, signDocumentVersionWithA1 } from "@/lib/signatures/a1-signature-service";

async function adminContext(operation: "create" | "update") {
  const context = await getTenantContextForModuleOperation("CONFIGURACOES", operation);
  if (!isSystemAdministrator(context.user)) throw new Error("Somente o administrador do sistema pode gerenciar certificados A1.");
  return context;
}

export async function registerCertificateAction(formData: FormData): Promise<void> {
  const context = await adminContext("create");
  const chain = String(formData.get("intermediatePems") || "").split(/\n---CERTIFICATE---\n/).map((value) => value.trim()).filter(Boolean);
  await registerA1Certificate(context.prisma, context.user.id, { alias: String(formData.get("alias") || ""), ownerName: String(formData.get("ownerName") || ""), credentialReference: String(formData.get("credentialReference") || ""), certificatePem: String(formData.get("certificatePem") || ""), intermediatePems: chain, trustedRootPem: String(formData.get("trustedRootPem") || ""), purposes: String(formData.get("purposes") || "GED").split(",").map((value) => value.trim().toUpperCase()).filter(Boolean) });
  revalidatePath("/configuracoes/certificados");
}

export async function setCertificateStatusAction(formData: FormData): Promise<void> {
  const context = await adminContext("update");
  await setA1CertificateStatus(context.prisma, String(formData.get("certificateId")), String(formData.get("status")) as "ACTIVE" | "SUSPENDED" | "REVOKED");
  revalidatePath("/configuracoes/certificados");
}

export async function signVersionWithA1Action(formData: FormData): Promise<void> {
  const context = await adminContext("update");
  const certificateId = String(formData.get("certificateId") || "");
  const documentVersionId = String(formData.get("documentVersionId") || "");
  try {
    await signDocumentVersionWithA1(context.prisma, { id: context.user.id, name: context.user.name, email: context.user.email, employeeId: context.user.employeeId }, { certificateId, documentVersionId, purpose: "GED" });
  } catch (error) {
    await recordA1Failure(context.prisma, { certificateId: certificateId || undefined, documentVersionId: documentVersionId || undefined, actorUsuarioId: context.user.id, purpose: "GED", errorCode: error instanceof Error ? error.name || "SIGNING_FAILED" : "SIGNING_FAILED" });
    throw error;
  }
  revalidatePath("/configuracoes/certificados");
  revalidatePath("/documentos/ged");
}
