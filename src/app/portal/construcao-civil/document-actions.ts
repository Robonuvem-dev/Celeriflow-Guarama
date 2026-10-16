"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getConstructionPortalIdentity } from "@/lib/obras/construction-portal-access";
import { requestConstructionArtifactChange, constructionDocumentRequestSchema } from "@/lib/obras/construction-document-requests";
export async function requestConstructionDocumentChange(input: unknown) {
  try { const data = constructionDocumentRequestSchema.parse(input); const identity = await getConstructionPortalIdentity(); await prisma.$transaction((tx) => requestConstructionArtifactChange(tx, identity.id, data)); revalidatePath(`/portal/construcao-civil/${data.caseId}/documentos`); revalidatePath(`/obras/construcao-civil/${data.caseId}/documentos`); return { success: true }; } catch (error) { return { error: error instanceof Error && !error.name.startsWith("Prisma") ? error.message : "Não foi possível registrar o pedido." }; }
}
