"use server";
import { z } from "zod";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { getIdTokenPrincipal } from "@/lib/platform/session";
import { resolveConstructionAccess } from "@/lib/obras/construction-access";
import { db } from "@/db/client";
import { findConstructionCaseForAccess } from "@/db/repositories/infrastructure/construction-access";
import { getConstructionProjectStamp, publishConstructionProjectStamp, stampConstructionApprovedProject } from "@/lib/obras/construction-project-stamp";
import { registerRequestedInternalDocumentSignature, requestInternalDocumentSignatures } from "@/lib/documents/document-flow-service";
import { readConstructionPdf } from "@/lib/obras/construction-document-storage";
import { constructionActionMessage } from "@/lib/obras/construction-errors";
function message(error: unknown) { return constructionActionMessage(error, "Operação de carimbo indisponível."); }
function refresh(id: string) { revalidatePath(`/obras/construcao-civil/${id}/documentos`); revalidatePath(`/portal/construcao-civil/${id}/documentos`); }
async function scoped(id: string) {
  const context = await getTenantContextForModuleOperation("OBRAS", "update"); const access = await resolveConstructionAccess(context); const database = context.database ?? db; const row = await getConstructionProjectStamp(database, id);
  if (!row || !await findConstructionCaseForAccess(database, row.caseId, access)) throw new Error("Cópia derivada indisponível no seu setor.");
  await readConstructionPdf(row.fileUrl, row.hashSha256); return { context, access, row };
}
export async function stampAndRequestConstructionProjectSignatures(input: unknown) {
  try { const context = await getTenantContextForModuleOperation("OBRAS", "update"); const access = await resolveConstructionAccess(context); const id = await stampConstructionApprovedProject(context, access, input); const row = await getConstructionProjectStamp(context.database ?? db, id); refresh(row!.caseId); return { success: true }; } catch (error) { return { error: message(error) }; }
}
export async function retryConstructionProjectSignatures(id: string) {
  try { const { context, access, row } = await scoped(id); if (!access.administrator && !access.roles.includes("MANAGER")) throw new Error("Solicitação de assinatura exige gestor."); const snapshot = z.object({ signerIds: z.array(z.string()).min(1) }).passthrough().parse(row.stampSnapshot); await requestInternalDocumentSignatures(context, row.documentId, snapshot.signerIds, { constructionProjectStampId: row.id, demonstration: "Cópia derivada demonstrativa" }); refresh(row.caseId); return { success: true }; } catch (error) { return { error: message(error) }; }
}
export async function signConstructionProjectStamp(input: unknown) {
  try { const data = z.object({ id: z.string().min(1), reauthenticationToken: z.string().min(1) }).parse(input); const { context, row } = await scoped(data.id); const principal = await getIdTokenPrincipal(data.reauthenticationToken); if (!principal || principal.firebaseUid !== context.user.firebaseUid || Date.now() - principal.authTime * 1000 > 300000 || principal.authTime * 1000 > Date.now() + 30000) throw new Error("Confirme novamente sua senha para assinar a cópia derivada."); const h = await headers(); await registerRequestedInternalDocumentSignature(context, row.documentId, { ipAddress: h.get("x-forwarded-for")?.split(",")[0]?.trim() || null, userAgent: h.get("user-agent") }, new Date()); refresh(row.caseId); return { success: true }; } catch (error) { return { error: message(error) }; }
}
export async function publishConstructionStampedProject(id: string) {
  try { const { context, access, row } = await scoped(id); await publishConstructionProjectStamp(context, access, id); refresh(row.caseId); return { success: true }; } catch (error) { return { error: message(error) }; }
}
