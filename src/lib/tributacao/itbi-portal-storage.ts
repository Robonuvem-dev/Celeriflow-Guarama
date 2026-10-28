import "server-only";
import { createHash } from "node:crypto";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import type { DatabaseConnection } from "@/db/connection";
import { databaseConnection } from "@/db/client";
import { taxRegistryEntries } from "@/db/schema/taxation-registry";
import { documentVersions } from "@/db/schema/document-workflow";
import { documents } from "@/db/schema/registry";
import { firstItbiRegistryEntry, insertItbiProcessDocument, insertItbiRegistryEntry, itbiRegistryPosition, lockItbiRecord, updateItbiDeclaration } from "@/db/repositories/tax-itbi/records";
import { getFile, getBlobDocumentPrefix, downloadFilename, uploadProcessFile, deleteUploadedDocument } from "@/lib/platform/blob";
import { ingestGedDocument } from "@/lib/documents/document-flow-service";
import { validPortalBlobUrl } from "@/lib/portal-cidadao/evidence-policy";
import { assertPortalItbiAccess, assertInternalItbiProcessAccess } from "./itbi-process-channel";
import type { TaxActor } from "./index";
import { linkItbiPropertyAttachments } from "./itbi-attachments";
import { taxScopeSnapshot } from "./scope";
import { renderConfiguredItbiDocument } from "./itbi-document-models";
import { attributeItbiHistory } from "./itbi-history";

export const itbiUploadTypes = ["application/pdf", "image/jpeg", "image/png"];
export const itbiUploadLimit = 10 * 1024 * 1024;
export function itbiUploadPrefix(usuarioId: string, declarationId: string) { return `${getBlobDocumentPrefix()}itbi/${usuarioId}/${declarationId}/`; }
class DuplicateUpload extends Error {}

export function assertItbiContent(content: Uint8Array, mime: string | undefined) {
  if (!content.length || content.length > itbiUploadLimit) throw new Error("Tamanho do arquivo inválido.");
  const valid = mime === "application/pdf" ? Buffer.from(content.subarray(0, 5)).toString("ascii") === "%PDF-"
    : mime === "image/jpeg" ? content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff
    : mime === "image/png" && Buffer.from(content.subarray(0, 8)).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (!valid) throw new Error("O conteúdo não corresponde ao tipo PDF, JPEG ou PNG informado.");
}

export async function registerInternalItbiUpload(connection: DatabaseConnection, actor: TaxActor, declarationId: string, file: File) {
  await assertInternalItbiProcessAccess(connection.db, actor, declarationId);
  if (!file.name.trim() || file.name.length > 240 || /[\x00-\x1f\x7f]/.test(file.name) || !itbiUploadTypes.includes(file.type) || file.size > itbiUploadLimit) throw new Error("Envie PDF, JPEG ou PNG de até 10 MB com nome válido.");
  const content = new Uint8Array(await file.arrayBuffer());
  assertItbiContent(content, file.type);
  const blob = await uploadProcessFile(file);
  let documentId = "";
  try {
    await ingestGedDocument(connection, { title: file.name, documentType: "Anexo de ITBI", documentClassCode: "ITBI_EVIDENCE", publicLabel: "Anexo privado de ITBI", actorUsuarioId: actor.usuarioId, fileUrl: blob.url, content, afterCreate: async (tx, id) => {
      await attributeItbiHistory(tx, actor);
      await lockItbiRecord(tx, "ItbiDeclaration", declarationId);
      const { declaration, scope } = await assertInternalItbiProcessAccess(tx, actor, declarationId);
      if (["CANCELADA", "RETIFICADA", "INDEFERIDA"].includes(declaration.status)) throw new Error("Processo encerrado para anexos.");
      await insertItbiRegistryEntry(tx, { entityType: "ITBI_DECLARATION", entityId: declaration.id, category: "ITBI_PROCESS_MESSAGE", title: file.name, processId: declaration.processId, documentId: id, actorUsuarioId: actor.usuarioId, data: { ...scope, kind: "ATTACHMENT", external: false, usuarioId: actor.usuarioId, documentId: id, filename: file.name, url: blob.url } });
      if (declaration.processId) await insertItbiProcessDocument(tx, { processId: declaration.processId, documentId: id, purpose: "Anexo interno de ITBI", employeeId: actor.employeeId });
      await linkItbiPropertyAttachments(tx, actor, declaration.id, [id]);
      await updateItbiDeclaration(tx, declaration.id, {}, { eventType: "ANEXO_INTERNO_RECEBIDO", description: file.name, actorUsuarioId: actor.usuarioId, payload: { documentId: id } });
      documentId = id;
    } });
  } catch (error) {
    await deleteUploadedDocument(blob).catch(() => undefined);
    throw error;
  }
  return { documentId, filename: file.name };
}

export async function registerItbiPortalUpload(input: { usuarioId: string; declarationId: string; filename: string; url: string }) {
  if (!input.filename.trim() || input.filename.length > 240 || /[\x00-\x1f\x7f]/.test(input.filename)) throw new Error("Nome do arquivo inválido.");
  const db = databaseConnection.db;
  await assertPortalItbiAccess(db, input.usuarioId, input.declarationId);
  const prefix = itbiUploadPrefix(input.usuarioId, input.declarationId);
  if (!validPortalBlobUrl(input.url, prefix)) throw new Error("Arquivo fora do armazenamento deste processo.");
  const findPrevious = () => firstItbiRegistryEntry(db, and(itbiRegistryPosition("ITBI_DECLARATION", input.declarationId, "ITBI_PROCESS_MESSAGE"), sql`${taxRegistryEntries.data}->'kind' = '"ATTACHMENT"'::jsonb`, sql`${taxRegistryEntries.data}->'url' = ${JSON.stringify(input.url)}::jsonb`, sql`${taxRegistryEntries.data}->'usuarioId' = ${JSON.stringify(input.usuarioId)}::jsonb`)!);
  const previous = await findPrevious();
  if (previous) return { documentId: String(taxScopeSnapshot(previous.data).documentId), filename: String(taxScopeSnapshot(previous.data).filename) };
  const file = await getFile(input.url);
  if (!file?.stream || !file.blob.pathname.startsWith(prefix) || file.blob.size > itbiUploadLimit || !itbiUploadTypes.includes(file.blob.contentType ?? "")) throw new Error("Arquivo inválido para o processo ITBI.");
  const content = new Uint8Array(await new Response(file.stream).arrayBuffer());
  assertItbiContent(content, file.blob.contentType);
  let documentId = "";
  try {
    await ingestGedDocument(databaseConnection, { title: input.filename, documentType: "Anexo de ITBI", documentClassCode: "ITBI_EVIDENCE", publicLabel: "Anexo privado de ITBI", actorUsuarioId: input.usuarioId, fileUrl: input.url, content, afterCreate: async (tx, id) => {
      await attributeItbiHistory(tx, { usuarioId: input.usuarioId });
      await lockItbiRecord(tx, "ItbiDeclaration", input.declarationId);
      const { declaration, scope } = await assertPortalItbiAccess(tx, input.usuarioId, input.declarationId);
      if (["CANCELADA", "RETIFICADA", "INDEFERIDA"].includes(declaration.status)) throw new Error("Processo encerrado para anexos.");
      const duplicate = await firstItbiRegistryEntry(tx, and(itbiRegistryPosition("ITBI_DECLARATION", declaration.id, "ITBI_PROCESS_MESSAGE"), sql`${taxRegistryEntries.data}->'url' = ${JSON.stringify(input.url)}::jsonb`)!);
      if (duplicate) throw new DuplicateUpload();
      await insertItbiRegistryEntry(tx, { entityType: "ITBI_DECLARATION", entityId: declaration.id, category: "ITBI_PROCESS_MESSAGE", title: input.filename, processId: declaration.processId, documentId: id, actorUsuarioId: input.usuarioId, data: { ...scope, kind: "ATTACHMENT", external: true, usuarioId: input.usuarioId, documentId: id, filename: input.filename, url: input.url } });
      await insertItbiProcessDocument(tx, { processId: declaration.processId!, documentId: id, purpose: "Anexo externo de ITBI" });
      await linkItbiPropertyAttachments(tx, { usuarioId: input.usuarioId, employeeId: null, allowedBudgetUnitIds: [scope.budgetUnitId] }, declaration.id, [id]);
      await updateItbiDeclaration(tx, declaration.id, {}, { eventType: "ANEXO_EXTERNO_RECEBIDO", description: input.filename, actorUsuarioId: input.usuarioId, payload: { documentId: id } });
      documentId = id;
    } });
  } catch (error) {
    if (!(error instanceof DuplicateUpload)) throw error;
    const previous = await findPrevious(); if (!previous) throw error;
    documentId = String(taxScopeSnapshot(previous.data).documentId);
  }
  return { documentId, filename: input.filename };
}

export async function downloadItbiProcessAttachment(connection: DatabaseConnection, auth: { usuarioId: string } | { actor: TaxActor }, declarationId: string, documentId: string) {
  const db = connection.db;
  if ("actor" in auth) await assertInternalItbiProcessAccess(db, auth.actor, declarationId);
  else await assertPortalItbiAccess(db, auth.usuarioId, declarationId);
  const generated = await firstItbiRegistryEntry(db, and(eq(taxRegistryEntries.entityType, "ITBI_CONFIGURED_DOCUMENT"), eq(taxRegistryEntries.category, "ITBI_DOCUMENT_ISSUANCE"), eq(taxRegistryEntries.documentId, documentId), sql`${taxRegistryEntries.data}->'declarationId' = ${JSON.stringify(declarationId)}::jsonb`)!);
  if (generated) {
    const bytes = await renderConfiguredItbiDocument(connection, auth, generated.id);
    return new Response(bytes, { headers: { "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="declaracao-itbi.pdf"', "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  }
  const linked = await firstItbiRegistryEntry(db, and(itbiRegistryPosition("ITBI_DECLARATION", declarationId, "ITBI_PROCESS_MESSAGE"), or(eq(taxRegistryEntries.documentId, documentId), sql`${taxRegistryEntries.data}->'documentIds' @> ${JSON.stringify([documentId])}::jsonb`))!);
  if (!linked) throw new Error("Anexo não pertence a este processo.");
  const versionRow = (await db.select({ version: documentVersions }).from(documentVersions).innerJoin(documents, eq(documents.id, documentVersions.documentId)).where(and(eq(documentVersions.documentId, documentId), inArray(documentVersions.status, ["FINAL", "SIGNED"]), inArray(documents.status, ["Válido", "Assinado"]))).orderBy(desc(documentVersions.versionNumber)).limit(1))[0];
  const version = versionRow?.version;
  if (!version) throw new Error("Versão GED indisponível.");
  const file = await getFile(version.fileUrl); if (!file?.stream) throw new Error("Arquivo indisponível.");
  const bytes = new Uint8Array(await new Response(file.stream).arrayBuffer());
  if (createHash("sha256").update(bytes).digest("hex") !== version.hashSha256) throw new Error("Integridade do anexo inválida.");
  return new Response(bytes, { headers: { "Content-Type": file.blob.contentType || "application/octet-stream", "Content-Disposition": `attachment; filename="${downloadFilename(file.blob.pathname)}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
