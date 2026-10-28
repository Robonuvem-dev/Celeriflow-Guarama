import { createHash } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction } from "@/db/transaction";
import { hrRoleLegalHistory } from "@/db/schema/personnel-legal";
import { roles } from "@/db/schema/administration";
import { legalTexts, legalTextVersions } from "@/db/schema/master-data";
import { documents } from "@/db/schema/registry";
import { documentVersions } from "@/db/schema/document-workflow";
import { insertAuditEvent } from "@/db/repositories/platform/audit";
import type { RoleLegalHistoryEvent } from "@/lib/contracts/personnel";
import { z } from "zod";
import { assertCostScope } from "@/lib/financeiro/cost-ledger";
import type { CostActor } from "@/lib/financeiro/cost-types";
import { auditEventTypes } from "@/lib/contracts/audit";

export const roleLegalHistoryInput = z.object({ financialYearId: z.string().min(1), roleId: z.string().min(1), effectiveFrom: z.iso.date(), expectedVersion: z.number().int().min(0), state: z.enum(["EXISTING", "EXTINGUISHED"]), designation: z.string().trim().min(1).max(300), authorizedSeats: z.number().int().min(0).max(1000000), legalReference: z.string().trim().min(3).max(4000), legalTextVersionId: z.string().min(1), documentVersionId: z.string().min(1), reason: z.string().trim().min(10).max(4000), rectification: z.boolean().default(false), idempotencyKey: z.string().trim().min(1).max(150) }).strict().refine(value => value.state !== "EXTINGUISHED" || value.authorizedSeats === 0, "Cargo extinto deve ter zero vagas autorizadas.");
export type RoleLegalHistoryInput = z.input<typeof roleLegalHistoryInput>;
export class RoleLegalHistoryError extends Error {}

export async function recordRoleLegalHistory(connection: DatabaseConnection, actor: CostActor, raw: RoleLegalHistoryInput): Promise<RoleLegalHistoryEvent> {
  const input = roleLegalHistoryInput.parse(raw);
  const requestHash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  return withDatabaseTransaction(connection, async tx => {
    const year = await assertCostScope(tx, actor, input.financialYearId, undefined, true);
    const governmentEntityId = year.governmentEntityId!;
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`HR_ROLE_LEGAL:${governmentEntityId}:${input.roleId}`},0))::text`);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`HR_ROLE_LEGAL_REQUEST:${governmentEntityId}:${input.idempotencyKey}`},0))::text`);
    const [priorRequest] = await tx.select().from(hrRoleLegalHistory).where(and(eq(hrRoleLegalHistory.governmentEntityId, governmentEntityId), eq(hrRoleLegalHistory.idempotencyKey, input.idempotencyKey))).limit(1);
    if (priorRequest) {
      if (priorRequest.requestHash !== requestHash || priorRequest.actorUsuarioId !== actor.usuarioId) throw new RoleLegalHistoryError("Chave legal já utilizada com outros dados ou responsável.");
      return priorRequest;
    }
    const [previous] = await tx.select().from(hrRoleLegalHistory).where(and(eq(hrRoleLegalHistory.governmentEntityId, governmentEntityId), eq(hrRoleLegalHistory.roleId, input.roleId))).orderBy(desc(hrRoleLegalHistory.version)).limit(1);
    if ((previous?.version ?? 0) !== input.expectedVersion) throw new RoleLegalHistoryError("O histórico do cargo foi alterado; recarregue a última versão.");
    const effectiveFrom = new Date(`${input.effectiveFrom}T00:00:00.000Z`);
    if (previous ? input.rectification ? effectiveFrom.getTime() !== previous.effectiveFrom.getTime() : effectiveFrom <= previous.effectiveFrom : input.rectification) throw new RoleLegalHistoryError("Nova posição deve suceder a vigência anterior; retificação conserva a data da última posição.");
    const [role] = await tx.select({ id: roles.id }).from(roles).where(eq(roles.id, input.roleId)).limit(1);
    if (!role) throw new Error("Cargo não encontrado.");
    await tx.execute(sql`SELECT id FROM "LegalTextVersion" WHERE id=${input.legalTextVersionId} FOR SHARE`);
    const [legal] = await tx.select({ id: legalTextVersions.id, documentId: legalTextVersions.documentId, governmentEntityId: legalTexts.governmentEntityId }).from(legalTextVersions).innerJoin(legalTexts, eq(legalTexts.id, legalTextVersions.legalTextId)).where(eq(legalTextVersions.id, input.legalTextVersionId)).limit(1);
    if (!legal?.documentId || legal.governmentEntityId !== governmentEntityId) throw new RoleLegalHistoryError("Vincule versão do ato legal documentada e pertencente à entidade.");
    await tx.execute(sql`SELECT id FROM "Document" WHERE id=${legal.documentId} FOR SHARE`);
    await tx.execute(sql`SELECT id FROM "DocumentVersion" WHERE id=${input.documentVersionId} FOR SHARE`);
    const [version] = await tx.select({ id: documentVersions.id, documentId: documentVersions.documentId, status: documentVersions.status, hashSha256: documentVersions.hashSha256, fileUrl: documentVersions.fileUrl, documentStatus: documents.status }).from(documentVersions).innerJoin(documents, eq(documents.id, documentVersions.documentId)).where(eq(documentVersions.id, input.documentVersionId)).limit(1);
    if (!version || version.documentId !== legal.documentId || version.documentStatus !== "Válido" || !["FINAL", "SIGNED"].includes(version.status) || !/^[a-fA-F0-9]{64}$/.test(version.hashSha256)) throw new RoleLegalHistoryError("Selecione versão GED final/assinada com hash do ato legal correspondente.");
    const [event] = await tx.insert(hrRoleLegalHistory).values({ governmentEntityId, roleId: input.roleId, effectiveFrom, version: input.expectedVersion + 1, state: input.state, designation: input.designation, authorizedSeats: input.authorizedSeats, legalReference: input.legalReference, legalTextVersionId: legal.id, documentId: legal.documentId, documentVersionId: version.id, documentHash: version.hashSha256, documentFileUrl: version.fileUrl, reason: input.reason, rectification: input.rectification, previousEventId: previous?.id, actorUsuarioId: actor.usuarioId, idempotencyKey: input.idempotencyKey, requestHash }).returning();
    await insertAuditEvent(tx, { actorUsuarioId: actor.usuarioId, eventType: auditEventTypes.administrativeMutation, targetType: "HR_ROLE_LEGAL_HISTORY", targetId: event.id });
    return event;
  });
}
