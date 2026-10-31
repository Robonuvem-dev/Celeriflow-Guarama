import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db, databaseConnection } from "@/db/client";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction } from "@/db/transaction";
import { documents } from "@/db/schema/registry";
import { documentClasses, documentVersions } from "@/db/schema/document-workflow";
import { gedCentralSignatures, gedEntries, gedOperationLeases } from "@/db/schema/ged-management";
import { requireManagedDocument } from "@/db/repositories/documents/ged";
import { insertAuditEvent } from "@/db/repositories/platform/audit";
import { signCentralFile } from "@/lib/signatures/central-service";
import { CENTRAL_MAX_BYTES, centralBlobStore, type CentralBlobStore } from "@/lib/signatures/central-storage";
import { CentralError } from "@/lib/signatures/central-error";
import type { CentralSignatureMethod } from "@/lib/contracts/signature-central";
import type { AppContext } from "@/lib/platform/tenant-context";
import { canUseGed } from "./ged-access";
import { readGedBytes } from "./ged-storage";

export async function signGedVersionInCentral(context: AppContext, input: { documentId: string; versionId: string; requestId: string; signerId: string; documentTypeId: string; method: CentralSignatureMethod; integrationId?: string; password: string }, dependencies: { connection?: DatabaseConnection; storage?: CentralBlobStore; readFile?: typeof readGedBytes } = {}) {
  if (!canUseGed(context.user, "edit")) throw new CentralError("Sem permissão para assinar documentos do acervo.", 403);
  const connection = dependencies.connection ?? databaseConnection;
  if ((context.database ?? db) !== connection.db) throw new CentralError("Conexão incompatível com o contexto documental.", 503);
  const token = randomUUID();
  const lockKey = `DOCUMENT_SIGNATURE:${input.documentId}`;
  const document = await withDatabaseTransaction(connection, async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`);
    const current = await requireManagedDocument(context, input.documentId, tx);
    if (current.versionId !== input.versionId || current.versionStatus !== "FINAL" || current.checkoutOwnerId || !["HOMOLOGADO", "ASSINADO_CENTRAL"].includes(current.editorialStatus)) throw new CentralError("Selecione a versão vigente homologada, sem reserva de edição.");
    const [policy] = await tx.select({ policy: documentClasses.signaturePolicy }).from(documents).innerJoin(documentClasses, eq(documentClasses.id, documents.documentClassId)).where(eq(documents.id, current.id));
    if (!policy || !["INTERNAL_ALLOWED", "ICP_REQUIRED"].includes(policy.policy) || (policy.policy === "ICP_REQUIRED" && input.method === "INTERNAL")) throw new CentralError("O método não atende à política de assinatura da classe documental.");
    if (current.byteLength > CENTRAL_MAX_BYTES) throw new CentralError("A Central aceita originais de até 3 MiB.", 413);
    const [lease] = await tx.select().from(gedOperationLeases).where(eq(gedOperationLeases.documentId, current.id));
    if (lease && lease.expiresAt > new Date()) throw new CentralError("Documento em assinatura. Repita com a mesma tentativa após a conclusão.", 409);
    await tx.insert(gedOperationLeases).values({ documentId: current.id, token, expiresAt: new Date(Date.now() + 5 * 60_000) }).onConflictDoUpdate({ target: gedOperationLeases.documentId, set: { token, expiresAt: new Date(Date.now() + 5 * 60_000) } });
    return current;
  });
  try {
    const bytes = await (dependencies.readFile ?? readGedBytes)(document.fileUrl, document.hashSha256);
    // No outer transaction: Central commits its durable upload intent before
    // writing Blob. The GED lease is compatible with transaction-pooled Neon.
    const centralContext = { ...context, database: connection.db, databaseConnection: connection };
    const record = await signCentralFile(centralContext, { file: new File([new Uint8Array(bytes)], document.filename, { type: document.mimeType }), signerId: input.signerId, documentTypeId: input.documentTypeId, method: input.method, integrationId: input.integrationId, password: input.password, requestId: input.requestId }, dependencies.storage ?? centralBlobStore);
    return await withDatabaseTransaction(connection, async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`);
      const [lease] = await tx.select().from(gedOperationLeases).where(eq(gedOperationLeases.documentId, document.id));
      if (!lease || lease.token !== token || lease.expiresAt <= new Date()) throw new CentralError("A reserva de assinatura expirou. Repita com o mesmo requestId para recuperar o vínculo.", 409);
      const current = await requireManagedDocument(context, document.id, tx);
      if (current.versionId !== input.versionId || current.checkoutOwnerId) throw new CentralError("A versão mudou; o comprovante permanece na Central.", 409);
      const [linked] = await tx.select().from(gedCentralSignatures).where(eq(gedCentralSignatures.recordId, record.id));
      if (linked && linked.versionId !== input.versionId) throw new CentralError("Esta tentativa pertence a outra versão documental.");
      await tx.insert(gedCentralSignatures).values({ recordId: record.id, versionId: input.versionId }).onConflictDoNothing();
      await tx.update(documentVersions).set({ lockedAt: sql`coalesce(${documentVersions.lockedAt},now())` }).where(eq(documentVersions.id, input.versionId));
      await tx.update(gedEntries).set({ editorialStatus: "ASSINADO_CENTRAL" }).where(eq(gedEntries.documentId, document.id));
      await tx.update(documents).set({ status: "Assinado" }).where(eq(documents.id, document.id));
      await insertAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: "DOCUMENT_SIGNATURE_REGISTERED", targetType: "GED_CENTRAL_SIGNATURE", targetId: record.id });
      return record;
    });
  } finally {
    await connection.db.delete(gedOperationLeases).where(and(eq(gedOperationLeases.documentId, document.id), eq(gedOperationLeases.token, token)));
  }
}
