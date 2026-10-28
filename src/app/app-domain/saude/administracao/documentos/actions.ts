"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getIdTokenPrincipal } from "@/lib/platform/session";
import { AccessError, getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { ingestGedDocument, registerRequestedInternalDocumentSignature, requestInternalDocumentSignatures } from "@/lib/documents/document-flow-service";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { modules } from "@/db/schema/identity";
import { healthStandardDocuments } from "@/db/schema/health-documents";
import { documentSignatures } from "@/db/schema/document-workflow";
import { healthDatabaseConnection } from "@/lib/saude/health-transaction";

type Result = { success: true; documentId: string } | { error: string };

const documentSchema = z.object({
  title: z.string().trim().min(3, "Informe o título.").max(200),
  category: z.enum(["Procedimento", "Orientação", "Formulário", "Protocolo", "Outro"]),
  moduleCode: z.string().trim().min(2).max(50),
  fileUrl: z.string().url("O arquivo armazenado é inválido."),
}).strict();

const signatureSchema = z.object({
  documentId: z.string().min(1),
  page: z.number().int().min(1).max(999),
  position: z.enum(["INFERIOR_DIREITA", "INFERIOR_ESQUERDA", "SUPERIOR_DIREITA", "SUPERIOR_ESQUERDA"]),
  reauthenticationToken: z.string().min(1, "Confirme sua senha para assinar."),
}).strict();

function actionError(error: unknown, fallback: string) {
  if (error instanceof z.ZodError) return error.issues[0]?.message || fallback;
  if (error instanceof AccessError || error instanceof Error) return error.message;
  return fallback;
}

function revalidateDocuments() {
  revalidatePath("/app-domain/saude/administracao/documentos");
  revalidatePath("/app-domain/documentos/ged");
  revalidatePath("/app-domain/documentos/assinaturas");
}

export async function saveHealthStandardDocument(data: unknown): Promise<Result> {
  try {
    const input = documentSchema.parse(data);
    const context = await getTenantContextForModuleOperation("SAUDE", "create");
    const [activeModule] = await (context.database ?? db).select({ id: modules.id }).from(modules).where(and(eq(modules.codigo, input.moduleCode), eq(modules.ativo, true))).limit(1);
    if (!activeModule) throw new Error("Selecione um módulo ativo.");
    const saved = await ingestGedDocument(healthDatabaseConnection(context), {
      title: input.title,
      documentType: "Documento padrão",
      documentClassCode: "SAUDE_DOCUMENTO_PADRAO",
      publicLabel: "Documento padrão da Saúde",
      fileUrl: input.fileUrl,
      actorUsuarioId: context.user.id,
      afterCreate: async (tx, documentId) => {
        await tx.insert(healthStandardDocuments).values({ documentId, category: input.category, moduleCode: input.moduleCode, addedByUsuarioId: context.user.id });
      },
    });
    revalidateDocuments();
    return { success: true, documentId: saved.documentId };
  } catch (error) {
    return { error: actionError(error, "Não foi possível salvar o documento.") };
  }
}

export async function signHealthStandardDocument(data: unknown): Promise<Result> {
  try {
    const input = signatureSchema.parse(data);
    const context = await getTenantContextForModuleOperation("SAUDE", "update");
    const database = context.database ?? db;
    const [link] = await database.select({ documentId: healthStandardDocuments.documentId }).from(healthStandardDocuments).where(and(eq(healthStandardDocuments.documentId, input.documentId), eq(healthStandardDocuments.isActive, true))).limit(1);
    if (!link) throw new Error("Documento padrão não encontrado.");
    const reauthenticatedUser = await getIdTokenPrincipal(input.reauthenticationToken);
    if (!reauthenticatedUser || reauthenticatedUser.firebaseUid !== context.user.firebaseUid) throw new Error("A confirmação de identidade não corresponde ao usuário atual.");
    if (Date.now() - reauthenticatedUser.authTime * 1000 > 5 * 60 * 1000) throw new Error("A confirmação de identidade expirou.");
    const [pending] = await database.select({ id: documentSignatures.id }).from(documentSignatures).where(and(eq(documentSignatures.documentId, input.documentId), eq(documentSignatures.signerUsuarioId, context.user.id), eq(documentSignatures.status, "PENDING"))).limit(1);
    if (!pending) {
      await requestInternalDocumentSignatures(context, input.documentId, [context.user.id], {
        page: input.page,
        position: input.position,
        signatureMode: "INTERNAL_ELECTRONIC",
      });
    }
    const requestHeaders = await headers();
    await registerRequestedInternalDocumentSignature(context, input.documentId, {
      ipAddress: requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
      userAgent: requestHeaders.get("user-agent"),
    }, new Date());
    revalidateDocuments();
    return { success: true, documentId: input.documentId };
  } catch (error) {
    return { error: actionError(error, "Não foi possível assinar o documento.") };
  }
}
