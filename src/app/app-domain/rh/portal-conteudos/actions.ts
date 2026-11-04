"use server";
import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getTenantContextForModuleOperation, assertBudgetUnitAccess } from "@/lib/platform/tenant-context";
import { portalContentSchema, savePortalContent, setPortalContentActive } from "@/lib/portal-servidor/content-catalog";
import { deleteUploadedDocument, uploadFile } from "@/lib/platform/blob";

export async function createPortalContent(form: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("RH", "create");
  const data = portalContentSchema.parse(Object.fromEntries(form));
  assertBudgetUnitAccess(context.user, data.budgetUnitId);
  let blob: Awaited<ReturnType<typeof uploadFile>> | undefined;
  try {
    if (data.kind !== "LOCAL") {
      const file = form.get("file");
      if (!(file instanceof File) || !["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.oasis.opendocument.text", "text/plain"].includes(file.type)) throw new Error("Envie PDF, DOC, DOCX, ODT ou TXT.");
      if (file.size > 4 * 1024 * 1024) throw new Error("O arquivo deve ter até 4 MB.");
      blob = await uploadFile(file);
      data.fileUrl = blob.url; data.fileName = file.name; data.contentType = file.type; data.fileHash = createHash("sha256").update(new Uint8Array(await file.arrayBuffer())).digest("hex");
    }
    await savePortalContent(context, data);
  } catch (error) { if (blob) await deleteUploadedDocument(blob); throw error; }
  revalidatePath("/rh/portal-conteudos"); revalidatePath("/portal-servidor/atendimento"); revalidatePath("/portal-servidor/biblioteca");
}
export async function togglePortalContent(form: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("RH", "update");
  await setPortalContentActive(context, String(form.get("id") || ""), form.get("active") === "true");
  revalidatePath("/rh/portal-conteudos"); revalidatePath("/portal-servidor/atendimento"); revalidatePath("/portal-servidor/biblioteca");
}
