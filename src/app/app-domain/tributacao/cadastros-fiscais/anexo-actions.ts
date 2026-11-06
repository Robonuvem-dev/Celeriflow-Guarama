"use server";

import { revalidatePath } from "next/cache";
import { isSystemAdministrator } from "@/lib/platform/tenant-context";
import { taxActionContext } from "@/db/repositories/tax-actions/context";
import { latestActionRegistryEntry, insertActionRegistryEntries, insertActionAudit, actionFiscalEntityExists } from "@/db/repositories/tax-actions/registry";
import { uploadProcessFile, deleteUploadedDocument } from "@/lib/platform/blob";
import { ingestGedDocument } from "@/lib/documents/document-flow-service";
import { touchPropertyMetadata } from "@/lib/tributacao/property-history";

const ALLOWED_MIME_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15MB

export async function uploadCadastralAttachment(
  entityType: "REAL_ESTATE" | "ECONOMIC_REGISTRATION",
  entityId: string,
  formData: FormData
): Promise<{ error?: string; success?: boolean; documentId?: string }> {
  try {
    const file = formData.get("file");
    const title = String(formData.get("title") || "").trim();
    const documentType = String(formData.get("documentType") || "Documento Cadastral").trim();

    if (!(file instanceof File) || file.size === 0) {
      return { error: "Selecione um arquivo válido (PDF ou imagem JPG/PNG)." };
    }

    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return { error: "Tipo de arquivo inválido. Apenas PDF, JPG ou PNG são permitidos." };
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      return { error: "O tamanho do arquivo não pode exceder 15 MB." };
    }

    const { connection, user } = await taxActionContext("create");
    const allowedUgs = isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds;

    const exists = await actionFiscalEntityExists(connection.db, entityType, entityId);
    if (!exists) {
      return { error: "Cadastro de origem não encontrado." };
    }

    const fileBytes = new Uint8Array(await file.arrayBuffer());

    // Upload seguro para armazenamento de blobs privado da plataforma
    const blob = await uploadProcessFile(file);

    try {
      const displayTitle = title || file.name;
      const ingestResult = await ingestGedDocument(connection, {
        title: displayTitle,
        documentType: documentType || (file.type === "application/pdf" ? "Documento PDF" : "Imagem Cadastral"),
        documentClassCode: "GED_INTERNAL_ALLOWED",
        publicLabel: displayTitle,
        fileUrl: blob.url,
        content: fileBytes,
        actorUsuarioId: user.id,
        afterCreate: async (tx, documentId) => {
          const previous = await latestActionRegistryEntry(tx, entityType, entityId, "DOCUMENTO", displayTitle);
          const [entry] = await insertActionRegistryEntries(tx, [
            {
              entityType,
              entityId,
              category: "DOCUMENTO",
              title: displayTitle,
              data: {
                details: `Arquivo ${file.name} (${(file.size / 1024).toFixed(1)} KB) anexado diretamente à ficha.`,
                filename: file.name,
                mimeType: file.type,
                sizeBytes: file.size,
                url: blob.url,
              },
              status: "ATIVO",
              source: "INTERNO",
              effectiveFrom: new Date(),
              documentId,
              actorUsuarioId: user.id,
              version: (previous?.version ?? 0) + 1,
            },
          ]);

          if (entityType === "REAL_ESTATE") {
            await touchPropertyMetadata(tx, user.id, entityId, null);
          }

          await insertActionAudit(tx, {
            action: "CREATE",
            entityType: "TaxRegistryEntry",
            entityId: entry.id,
            payload: {
              targetType: entityType,
              targetId: entityId,
              category: "DOCUMENTO",
              documentId,
              filename: file.name,
              mimeType: file.type,
            },
            authorUsuarioId: user.id,
            authorEmployeeId: user.employeeId,
          });
        },
      });

      if (entityType === "REAL_ESTATE") {
        revalidatePath(`/tributacao/imoveis/${entityId}`);
      } else {
        revalidatePath(`/tributacao/economico/${entityId}`);
      }

      return { success: true, documentId: ingestResult.documentId };
    } catch (ingestErr) {
      await deleteUploadedDocument(blob).catch(() => undefined);
      throw ingestErr;
    }
  } catch (error) {
    console.error("Erro ao realizar upload de documento cadastral:", error);
    return { error: error instanceof Error ? error.message : "Falha ao enviar arquivo." };
  }
}
