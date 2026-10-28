import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { db, databaseConnection } from "@/db/client";
import { getPostgresError } from "@/db/errors";
import { portalServiceUploads } from "@/db/schema/portal-services";
import { documentVersions } from "@/db/schema/document-workflow";
import { findActivePortalAccount, readPublishedPortalService } from "@/db/repositories/portal-content/services";
import { getFile, getBlobDocumentPrefix } from "@/lib/platform/blob";
import { ingestGedDocument } from "@/lib/documents/document-flow-service";
import { readOwnPortalRequest } from "./requests";
import { digitalServiceSchema } from "./services-policy";
import { validPortalBlobUrl } from "./evidence-policy";

export const portalEvidenceTypes = ["application/pdf", "image/jpeg", "image/png"];
export const portalEvidenceLimit = 10 * 1024 * 1024;
export function portalEvidencePrefix(ownerId: string) { return `${getBlobDocumentPrefix()}autoatendimento/${ownerId}/`; }

export async function resolvePortalEvidence(ownerId: string, serviceId: string, code: string, requestId: string) {
  if (!await findActivePortalAccount(db, ownerId)) throw new Error("Conta indisponível.");
  const own = requestId ? await readOwnPortalRequest(db, ownerId, requestId) : null;
  if (own && own.status !== "AGUARDANDO_COMPLEMENTO") throw new Error("Solicitação sem exigência aberta.");
  const service = own ? { id: own.serviceId, version: own.serviceVersion, configuration: (own.snapshot as { configuration: unknown }).configuration } : await readPublishedPortalService(db, serviceId);
  if (!service) throw new Error("Serviço indisponível.");
  const requirement = digitalServiceSchema.parse(service.configuration).documents.find((item) => item.code === code);
  if (!requirement) throw new Error("Documento não previsto nesta versão do serviço.");
  return { service, requirement };
}

export async function registerPortalEvidence(input: { ownerId: string; serviceId: string; code: string; requestId: string; filename: string; url: string }) {
  if (!validPortalBlobUrl(input.url, portalEvidencePrefix(input.ownerId))) throw new Error("Arquivo fora do armazenamento do titular.");
  const [previousVersion] = await db.select({ id: documentVersions.id }).from(documentVersions).where(eq(documentVersions.fileUrl, input.url)).limit(1);
  const previous = previousVersion ? (await db.select().from(portalServiceUploads).where(and(eq(portalServiceUploads.documentVersionId, previousVersion.id), eq(portalServiceUploads.ownerId, input.ownerId))).limit(1))[0] : null;
  if (previous) {
    if (previous.serviceId !== input.serviceId || previous.code !== input.code || (previous.targetRequestId || "") !== input.requestId) throw new Error("Arquivo já registrado para outra finalidade.");
    return { uploadId: previous.id, filename: previous.filename };
  }
  const { service, requirement } = await resolvePortalEvidence(input.ownerId, input.serviceId, input.code, input.requestId);
  const file = await getFile(input.url);
  if (!file?.stream || !file.blob.pathname.startsWith(portalEvidencePrefix(input.ownerId)) || file.blob.size > portalEvidenceLimit || !portalEvidenceTypes.includes(file.blob.contentType || "")) throw new Error("Arquivo inválido ou fora do armazenamento do titular.");
  const bytes = new Uint8Array(await new Response(file.stream).arrayBuffer());
  if (!bytes.length || bytes.length > portalEvidenceLimit) throw new Error("Tamanho do arquivo inválido.");
  let uploadId = "";
  try {
    await ingestGedDocument(databaseConnection, { title: requirement.label, documentType: "Anexo de Autoatendimento", documentClassCode: requirement.documentClassCode, actorUsuarioId: input.ownerId, fileUrl: input.url, content: bytes, afterCreate: async (tx, documentId) => {
      const [version] = await tx.select({ id: documentVersions.id }).from(documentVersions).where(and(eq(documentVersions.documentId, documentId), eq(documentVersions.versionNumber, 1))).limit(1);
      if (!version) throw new Error("Versão documental indisponível.");
      const [upload] = await tx.insert(portalServiceUploads).values({ ownerId: input.ownerId, serviceId: service.id, serviceVersion: service.version, code: input.code, documentId, documentVersionId: version.id, filename: input.filename, pathname: file.blob.pathname, targetRequestId: input.requestId || null }).returning({ id: portalServiceUploads.id });
      uploadId = upload.id;
    } });
  } catch (error) {
    if (getPostgresError(error)?.code !== "23505") throw error;
    const [duplicate] = await db.select().from(portalServiceUploads).where(and(eq(portalServiceUploads.pathname, file.blob.pathname), eq(portalServiceUploads.ownerId, input.ownerId), eq(portalServiceUploads.serviceId, service.id), eq(portalServiceUploads.serviceVersion, service.version), eq(portalServiceUploads.code, input.code), input.requestId ? eq(portalServiceUploads.targetRequestId, input.requestId) : isNull(portalServiceUploads.targetRequestId))).limit(1);
    if (!duplicate) throw error;
    uploadId = duplicate.id;
  }
  return { uploadId, filename: input.filename };
}
