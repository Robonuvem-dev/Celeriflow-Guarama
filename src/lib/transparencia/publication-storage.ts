import "server-only";
import { createHash } from "node:crypto";
import type { DatabaseExecutor } from "@/db/transaction";
import { insertPublicationUpload, readPublication } from "@/db/repositories/transparency/publications";
import { getFile, getBlobDocumentPrefix } from "@/lib/platform/blob";
import { publicationMetadataSchema,isTransparencyCollectionEnabled } from "./publication-policy";
import {getTransparencySettings} from "./presentation-settings";

export const publicDocumentTypes = ["application/pdf", "image/png", "image/jpeg", "text/csv", "text/plain", "application/zip"];
export const publicationUploadLimit = 100 * 1024 * 1024;
export function publicationUploadPrefix(userId: string, uploadId: string) {
  return `${getBlobDocumentPrefix()}transparencia/${userId}/${uploadId}/`;
}
export function validatePublicFileBytes(bytes: Uint8Array, contentType: string) {
  if (!bytes.length || bytes.length > publicationUploadLimit || !publicDocumentTypes.includes(contentType)) throw new Error("Arquivo vazio, muito grande ou formato não permitido.");
  const data = Buffer.from(bytes);
  if (contentType === "application/pdf" && data.subarray(0, 5).toString() !== "%PDF-") throw new Error("PDF inválido.");
  if (contentType === "image/png" && data.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") throw new Error("PNG inválido.");
  if (contentType === "image/jpeg" && data.subarray(0, 3).toString("hex") !== "ffd8ff") throw new Error("JPEG inválido.");
  if (contentType === "application/zip" && data.subarray(0, 2).toString() !== "PK") throw new Error("ZIP inválido.");
}
export async function registerPublicationUpload(db: DatabaseExecutor, data: { uploadId: string; userId: string; url: string; pathname: string; filename: string; metadata: unknown }) {
  const metadata = publicationMetadataSchema.parse(data.metadata);
  const settings=await getTransparencySettings(db);if(!isTransparencyCollectionEnabled(metadata.collectionSlug,settings)||!settings.availableYears.includes(metadata.year))throw new Error("Consulta ou exercício não publicado na configuração.");
  if (!data.pathname.startsWith(publicationUploadPrefix(data.userId, data.uploadId))) throw new Error("Arquivo fora do upload autorizado.");
  const existing = await readPublication(db, data.uploadId);
  if (existing) { if (existing.filePathname !== data.pathname) throw new Error("Identidade de upload divergente."); return existing; }
  const file = await getFile(data.url);
  if (!file || file.blob.pathname !== data.pathname) throw new Error("Arquivo ainda não confirmado no Vercel Blob. Tente confirmar novamente.");
  const contentType = (file.blob.contentType || "").split(";")[0];
  const bytes = new Uint8Array(await new Response(file.stream).arrayBuffer());
  validatePublicFileBytes(bytes, contentType);
  return insertPublicationUpload(db, { id: data.uploadId, ...metadata, order: 0, values: { origin: "Upload municipal no Vercel Blob", name: metadata.title, uploadedBy: data.userId, sizeBytes: bytes.length }, fileUrl: data.url, filePathname: data.pathname, filename: data.filename, contentType, sha256: createHash("sha256").update(bytes).digest("hex") });
}
