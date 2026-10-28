import "server-only";
import { and, eq, sql } from "drizzle-orm";
import type { DatabaseConnection } from "@/db/connection";
import { taxRegistryEntries } from "@/db/schema/taxation-registry";
import { firstItbiRegistryEntry, insertItbiRegistryEntry, itbiRegistryPosition, lockItbiKey, readItbiRegistryEntries } from "@/db/repositories/tax-itbi/records";
import { z } from "zod";
import { getBlobDocumentPrefix, getFile } from "@/lib/platform/blob";
import { validPortalBlobUrl } from "@/lib/portal-cidadao/evidence-policy";
import { ingestGedDocument } from "@/lib/documents/document-flow-service";
import { assertOnlineItbiDraftAccess } from "./itbi-online";
import { assertItbiContent, itbiUploadLimit, itbiUploadTypes } from "./itbi-portal-storage";
import { taxScopeSnapshot } from "./scope";
import { assertPortalItbiAccess } from "./itbi-process-channel";

export const itbiDraftUploadSchema = z.object({ notaryId: z.string().min(1), requestKey: z.uuid(), propertyId: z.string().min(1), filename: z.string().trim().min(1).max(240).refine(value => !/[\x00-\x1f\x7f]/.test(value), "Nome do arquivo inválido.") }).strict();
export function itbiDraftUploadPrefix(usuarioId: string, requestKey: string) { z.uuid().parse(requestKey); return `${getBlobDocumentPrefix()}itbi-drafts/${usuarioId}/${requestKey}/`; }
class ExistingDraftAttachment extends Error { constructor(readonly documentId: string) { super("Anexo já preparado."); } }

export async function registerOnlineItbiDraftUpload(connection: DatabaseConnection, usuarioId: string, raw: z.input<typeof itbiDraftUploadSchema> & { url: string }) {
  const db = connection.db;
  const { url, ...payload } = raw; const input = itbiDraftUploadSchema.parse(payload);
  const existing = await firstItbiRegistryEntry(db, and(itbiRegistryPosition("ONLINE_ITBI_DRAFT", `${usuarioId}:${input.requestKey}`, "ONLINE_ITBI_DRAFT_ATTACHMENT"), eq(taxRegistryEntries.actorUsuarioId, usuarioId), sql`${taxRegistryEntries.data}->'url' = ${JSON.stringify(url)}::jsonb`)!);
  if (existing?.documentId) {
    const data = taxScopeSnapshot(existing.data);
    if (data.notaryId !== input.notaryId || data.propertyId !== input.propertyId || existing.title !== input.filename) throw new Error("Arquivo já preparado com outros dados.");
    const submitted = await firstItbiRegistryEntry(db, itbiRegistryPosition("ONLINE_ITBI_REQUEST", `${usuarioId}:${input.requestKey}`, "ONLINE_ITBI_REQUEST"));
    if (submitted) await assertPortalItbiAccess(db, usuarioId, String(taxScopeSnapshot(submitted.data).declarationId));
    else await assertOnlineItbiDraftAccess(db, usuarioId, input);
    return { documentId: existing.documentId, filename: existing.title };
  }
  await assertOnlineItbiDraftAccess(db, usuarioId, input);
  const prefix = itbiDraftUploadPrefix(usuarioId, input.requestKey);
  if (!validPortalBlobUrl(url, prefix)) throw new Error("Anexo fora do armazenamento desta solicitação.");
  const file = await getFile(url);
  if (!file?.stream || !file.blob.pathname.startsWith(prefix) || file.blob.size > itbiUploadLimit || !itbiUploadTypes.includes(file.blob.contentType ?? "")) throw new Error("Arquivo inválido para a solicitação ITBI.");
  const bytes = new Uint8Array(await new Response(file.stream).arrayBuffer()); assertItbiContent(bytes, file.blob.contentType);
  let documentId = "";
  try {
    await ingestGedDocument(connection, { title: input.filename, documentType: "Anexo de solicitação ITBI", documentClassCode: "ITBI_EVIDENCE", publicLabel: "Anexo privado de ITBI", actorUsuarioId: usuarioId, fileUrl: url, content: bytes, afterCreate: async (tx, id) => {
      await lockItbiKey(tx, `ONLINE_ITBI_REQUEST:${usuarioId}:${input.requestKey}`);
      const scope = await assertOnlineItbiDraftAccess(tx, usuarioId, input);
      const entityId = `${usuarioId}:${input.requestKey}`;
      const entries = await readItbiRegistryEntries(tx, itbiRegistryPosition("ONLINE_ITBI_DRAFT", entityId, "ONLINE_ITBI_DRAFT_ATTACHMENT"));
      const previous = entries.find(entry => taxScopeSnapshot(entry.data).url === url);
      if (previous?.documentId) throw new ExistingDraftAttachment(previous.documentId);
      if (entries.length >= 20) throw new Error("A solicitação admite até 20 anexos preparados.");
      await insertItbiRegistryEntry(tx, { entityType: "ONLINE_ITBI_DRAFT", entityId, category: "ONLINE_ITBI_DRAFT_ATTACHMENT", title: input.filename, documentId: id, actorUsuarioId: usuarioId, data: { ...scope, ...input, usuarioId, url, bytes: bytes.length } });
      documentId = id;
    } });
  } catch (error) { if (!(error instanceof ExistingDraftAttachment)) throw error; documentId = error.documentId; }
  return { documentId, filename: input.filename };
}
