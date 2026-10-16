"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { getIdTokenPrincipal } from "@/lib/platform/session";
import { resolveConstructionAccess } from "@/lib/obras/construction-access";
import { constructionCaseWhere } from "@/lib/obras/construction-policy";
import { createConstructionPdfRevision, issueConstructionDocument, publishConstructionArtifact, publishConstructionDocumentTemplate } from "@/lib/obras/construction-documents-service";
import { requestInternalDocumentSignatures, registerRequestedInternalDocumentSignature } from "@/lib/documents/document-flow-service";
import { recordA1Failure, signDocumentVersionWithA1 } from "@/lib/signatures/a1-signature-service";
import { readConstructionPdf } from "@/lib/obras/construction-document-storage";

function message(error: unknown) { return error instanceof z.ZodError ? error.issues[0].message : error instanceof Error && !error.name.startsWith("Prisma") ? error.message : "Não foi possível concluir a operação documental."; }
function refresh(caseId?: string) { revalidatePath("/obras/construcao-civil/documentos"); if (caseId) { revalidatePath(`/obras/construcao-civil/${caseId}/documentos`); revalidatePath(`/portal/construcao-civil/${caseId}/documentos`); } }
async function scopedArtifact(id: string) {
  const context = await getTenantContextForModuleOperation("OBRAS", "update"); const access = await resolveConstructionAccess(context);
  const issued = await context.prisma.constructionIssuedDocument.findUnique({ where: { id } });
  if (!issued || !await context.prisma.constructionCase.findFirst({ where: { AND: [{ id: issued.caseId }, constructionCaseWhere(access)] }, select: { id: true } })) throw new Error("Documento indisponível no seu setor.");
  if (issued.status !== "ISSUED") throw new Error("Documento já publicado ou substituído.");
  await readConstructionPdf(issued.fileUrl, issued.hashSha256);
  return { context, access, issued };
}
export async function saveConstructionDocumentTemplate(input: unknown) {
  try { const context = await getTenantContextForModuleOperation("OBRAS", "update"); const access = await resolveConstructionAccess(context); await context.prisma.$transaction((tx) => publishConstructionDocumentTemplate(tx, access, context.user.id, input)); refresh(); return { success: true }; } catch (error) { return { error: message(error) }; }
}
export async function emitConstructionDocument(input: unknown) {
  try { const context = await getTenantContextForModuleOperation("OBRAS", "update"); const access = await resolveConstructionAccess(context); const id = await issueConstructionDocument(context.prisma, access, context.user.id, input); const row = await context.prisma.constructionIssuedDocument.findUniqueOrThrow({ where: { id } }); refresh(row.caseId); return { success: true, id }; } catch (error) { return { error: message(error) }; }
}
export async function publishConstructionDocument(id: string) {
  try { const context = await getTenantContextForModuleOperation("OBRAS", "update"); const access = await resolveConstructionAccess(context); await context.prisma.$transaction((tx) => publishConstructionArtifact(tx, access, context.user.id, id), { timeout: 30000 }); const row = await context.prisma.constructionIssuedDocument.findUniqueOrThrow({ where: { id } }); refresh(row.caseId); return { success: true }; } catch (error) { return { error: message(error) }; }
}
export async function requestConstructionDocumentSignatures(input: unknown) {
  try {
    const data = z.object({ issuedDocumentId: z.string().min(1), signerIds: z.array(z.string().min(1)).min(1).max(20) }).parse(input); const { context, access, issued } = await scopedArtifact(data.issuedDocumentId);
    if (!access.administrator && !access.roles.includes("MANAGER")) throw new Error("Solicitação de assinatura exige gestor.");
    await requestInternalDocumentSignatures(context, issued.documentId, data.signerIds, { constructionIssuedDocumentId: issued.id, demonstration: "Assinatura interna GED, sem PAdES" }); refresh(issued.caseId); return { success: true };
  } catch (error) { return { error: message(error) }; }
}
export async function signConstructionDocumentInternally(input: unknown) {
  try {
    const data = z.object({ issuedDocumentId: z.string().min(1), reauthenticationToken: z.string().min(1) }).parse(input); const { context, issued } = await scopedArtifact(data.issuedDocumentId);
    const principal = await getIdTokenPrincipal(data.reauthenticationToken);
    if (!principal || principal.firebaseUid !== context.user.firebaseUid || Date.now() - principal.authTime * 1000 > 300000 || principal.authTime * 1000 > Date.now() + 30000) throw new Error("Confirme sua senha novamente para assinar.");
    const h = await headers(); await registerRequestedInternalDocumentSignature(context, issued.documentId, { ipAddress: h.get("x-forwarded-for")?.split(",")[0]?.trim() || null, userAgent: h.get("user-agent") }, new Date()); refresh(issued.caseId); return { success: true };
  } catch (error) { return { error: message(error) }; }
}
export async function signConstructionDocumentA1(input: unknown) {
  let failure: { certificateId: string; documentVersionId: string; actorUsuarioId: string } | undefined;
  try {
    const data = z.object({ issuedDocumentId: z.string().min(1), certificateId: z.string().min(1) }).parse(input); const { context, access, issued } = await scopedArtifact(data.issuedDocumentId);
    if (!access.administrator && !access.roles.includes("MANAGER")) throw new Error("Assinatura A1 exige gestor urbanístico.");
    failure = { certificateId: data.certificateId, documentVersionId: issued.documentVersionId, actorUsuarioId: context.user.id };
    await signDocumentVersionWithA1(context.prisma, context.user, { documentVersionId: issued.documentVersionId, certificateId: data.certificateId, purpose: "GED" }); refresh(issued.caseId); return { success: true };
  } catch (error) {
    if (failure) {
      try { const context = await getTenantContextForModuleOperation("OBRAS", "update"); await recordA1Failure(context.prisma, { ...failure, purpose: "GED", errorCode: "CONSTRUCTION_A1_FAILED" }); }
      catch { /* Preserve the client action's error contract if the failed reference cannot be audited. */ }
    }
    return { error: message(error) };
  }
}
export async function annotateConstructionProject(input: unknown) {
  try { const data = z.object({ caseId: z.string().min(1), documentId: z.string().min(1), sourceVersionId: z.string().min(1), requestKey: z.uuid(), annotations: z.array(z.unknown()).min(1).max(300) }).parse(input); const context = await getTenantContextForModuleOperation("OBRAS", "update"); const access = await resolveConstructionAccess(context); await createConstructionPdfRevision(context, access, data); refresh(data.caseId); return { success: true }; } catch (error) { return { error: message(error) }; }
}
