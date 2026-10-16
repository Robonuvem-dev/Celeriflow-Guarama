import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getFile, getBlobDocumentPrefix } from "@/lib/platform/blob";
import { ingestGedDocument } from "@/lib/documents/document-flow-service";
import { readOwnPortalRequest } from "./requests";
import { digitalServiceSchema } from "./services-policy";
import { validPortalBlobUrl } from "./evidence-policy";

export const portalEvidenceTypes = ["application/pdf", "image/jpeg", "image/png"];
export const portalEvidenceLimit = 10 * 1024 * 1024;
export function portalEvidencePrefix(ownerId: string) { return `${getBlobDocumentPrefix()}autoatendimento/${ownerId}/`; }

export async function resolvePortalEvidence(ownerId: string, serviceId: string, code: string, requestId: string) {
  if (!await prisma.usuario.findFirst({ where: { id: ownerId, ativo: true, perfil: { ativo: true } }, select: { id: true } })) throw new Error("Conta indisponível.");
  const own = requestId ? await readOwnPortalRequest(prisma, ownerId, requestId) : null;
  if (own && own.status !== "AGUARDANDO_COMPLEMENTO") throw new Error("Solicitação sem exigência aberta.");
  const service = own ? { id: own.serviceId, version: own.serviceVersion, configuration: (own.snapshot as { configuration: unknown }).configuration } : await prisma.portalServiceConfiguration.findFirst({ where: { id: serviceId, published: true, publicService: { isActive: true } } });
  if (!service) throw new Error("Serviço indisponível.");
  const requirement = digitalServiceSchema.parse(service.configuration).documents.find((item) => item.code === code);
  if (!requirement) throw new Error("Documento não previsto nesta versão do serviço.");
  return { service, requirement };
}

export async function registerPortalEvidence(input: { ownerId: string; serviceId: string; code: string; requestId: string; filename: string; url: string }) {
  if (!validPortalBlobUrl(input.url, portalEvidencePrefix(input.ownerId))) throw new Error("Arquivo fora do armazenamento do titular.");
  const previousVersion = await prisma.documentVersion.findFirst({ where: { fileUrl: input.url }, select: { id: true } });
  const previous = previousVersion ? await prisma.portalServiceUpload.findFirst({ where: { documentVersionId: previousVersion.id, ownerId: input.ownerId } }) : null;
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
    await ingestGedDocument(prisma, { title: requirement.label, documentType: "Anexo de Autoatendimento", documentClassCode: requirement.documentClassCode, actorUsuarioId: input.ownerId, fileUrl: input.url, content: bytes, afterCreate: async (tx, documentId) => {
      const version = await tx.documentVersion.findFirstOrThrow({ where: { documentId, versionNumber: 1 }, select: { id: true } });
      const upload = await tx.portalServiceUpload.create({ data: { ownerId: input.ownerId, serviceId: service.id, serviceVersion: service.version, code: input.code, documentId, documentVersionId: version.id, filename: input.filename, pathname: file.blob.pathname, targetRequestId: input.requestId || null } });
      uploadId = upload.id;
    } });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    const duplicate = await prisma.portalServiceUpload.findFirst({ where: { pathname: file.blob.pathname, ownerId: input.ownerId, serviceId: service.id, serviceVersion: service.version, code: input.code, targetRequestId: input.requestId || null } });
    if (!duplicate) throw error;
    uploadId = duplicate.id;
  }
  return { uploadId, filename: input.filename };
}
