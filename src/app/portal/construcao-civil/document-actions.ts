"use server";
import { revalidatePath } from "next/cache";
import { databaseConnection } from "@/db/client";
import { withDatabaseTransaction } from "@/db/transaction";
import { constructionActionMessage } from "@/lib/obras/construction-errors";
import { z } from "zod";
import { getConstructionPortalIdentity } from "@/lib/obras/construction-portal-access";
import { requestConstructionArtifactChange, constructionDocumentRequestSchema } from "@/lib/obras/construction-document-requests";
export async function requestConstructionDocumentChange(input: unknown) {
  try { const data = constructionDocumentRequestSchema.parse(input); const identity = await getConstructionPortalIdentity(); await withDatabaseTransaction(databaseConnection, (tx) => requestConstructionArtifactChange(tx, identity.id, data)); revalidatePath(`/portal/construcao-civil/${data.caseId}/documentos`); revalidatePath(`/obras/construcao-civil/${data.caseId}/documentos`); return { success: true }; } catch (error) { return { error: error instanceof z.ZodError ? error.message : constructionActionMessage(error, "Não foi possível registrar o pedido.") }; }
}
