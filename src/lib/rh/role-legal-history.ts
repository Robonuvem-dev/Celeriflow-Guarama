import { createHash } from "node:crypto";
import { type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { assertCostScope } from "@/lib/financeiro/cost-ledger";
import type { CostActor } from "@/lib/financeiro/cost-types";
import { auditEventTypes, writeAuditEvent } from "@/lib/platform/audit-evidence";

export const roleLegalHistoryInput = z.object({ financialYearId: z.string().min(1), roleId: z.string().min(1), effectiveFrom: z.iso.date(), expectedVersion: z.number().int().min(0), state: z.enum(["EXISTING", "EXTINGUISHED"]), designation: z.string().trim().min(1).max(300), authorizedSeats: z.number().int().min(0).max(1000000), legalReference: z.string().trim().min(3).max(4000), legalTextVersionId: z.string().min(1), documentVersionId: z.string().min(1), reason: z.string().trim().min(10).max(4000), rectification: z.boolean().default(false), idempotencyKey: z.string().trim().min(1).max(150) }).strict().refine(value => value.state !== "EXTINGUISHED" || value.authorizedSeats === 0, "Cargo extinto deve ter zero vagas autorizadas.");
export type RoleLegalHistoryInput = z.input<typeof roleLegalHistoryInput>;
export class RoleLegalHistoryError extends Error {}

export async function recordRoleLegalHistory(db: PrismaClient, actor: CostActor, raw: RoleLegalHistoryInput) {
  const input = roleLegalHistoryInput.parse(raw);
  const requestHash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  return db.$transaction(async tx => {
    const year = await assertCostScope(tx, actor, input.financialYearId, undefined, true);
    const governmentEntityId = year.governmentEntityId!;
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`HR_ROLE_LEGAL:${governmentEntityId}:${input.roleId}`},0))::text`;
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`HR_ROLE_LEGAL_REQUEST:${governmentEntityId}:${input.idempotencyKey}`},0))::text`;
    const priorRequest = await tx.hrRoleLegalHistory.findUnique({ where: { governmentEntityId_idempotencyKey: { governmentEntityId, idempotencyKey: input.idempotencyKey } } });
    if (priorRequest) {
      if (priorRequest.requestHash !== requestHash || priorRequest.actorUsuarioId !== actor.usuarioId) throw new RoleLegalHistoryError("Chave legal já utilizada com outros dados ou responsável.");
      return priorRequest;
    }
    const previous = await tx.hrRoleLegalHistory.findFirst({ where: { governmentEntityId, roleId: input.roleId }, orderBy: { version: "desc" } });
    if ((previous?.version ?? 0) !== input.expectedVersion) throw new RoleLegalHistoryError("O histórico do cargo foi alterado; recarregue a última versão.");
    const effectiveFrom = new Date(`${input.effectiveFrom}T00:00:00.000Z`);
    if (previous ? input.rectification ? effectiveFrom.getTime() !== previous.effectiveFrom.getTime() : effectiveFrom <= previous.effectiveFrom : input.rectification) throw new RoleLegalHistoryError("Nova posição deve suceder a vigência anterior; retificação conserva a data da última posição.");
    await tx.role.findUniqueOrThrow({ where: { id: input.roleId } });
    await tx.$queryRaw`SELECT id FROM "LegalTextVersion" WHERE id=${input.legalTextVersionId} FOR SHARE`;
    const legal = await tx.legalTextVersion.findUnique({ where: { id: input.legalTextVersionId }, include: { legalText: true } });
    if (!legal?.documentId || legal.legalText.governmentEntityId !== governmentEntityId) throw new RoleLegalHistoryError("Vincule versão do ato legal documentada e pertencente à entidade.");
    await tx.$queryRaw`SELECT id FROM "Document" WHERE id=${legal.documentId} FOR SHARE`;
    await tx.$queryRaw`SELECT id FROM "DocumentVersion" WHERE id=${input.documentVersionId} FOR SHARE`;
    const version = await tx.documentVersion.findUnique({ where: { id: input.documentVersionId }, include: { document: true } });
    if (!version || version.documentId !== legal.documentId || version.document.status !== "Válido" || !["FINAL", "SIGNED"].includes(version.status) || !/^[a-fA-F0-9]{64}$/.test(version.hashSha256)) throw new RoleLegalHistoryError("Selecione versão GED final/assinada com hash do ato legal correspondente.");
    const event = await tx.hrRoleLegalHistory.create({ data: { governmentEntityId, roleId: input.roleId, effectiveFrom, version: input.expectedVersion + 1, state: input.state, designation: input.designation, authorizedSeats: input.authorizedSeats, legalReference: input.legalReference, legalTextVersionId: legal.id, documentId: legal.documentId, documentVersionId: version.id, documentHash: version.hashSha256, documentFileUrl: version.fileUrl, reason: input.reason, rectification: input.rectification, previousEventId: previous?.id, actorUsuarioId: actor.usuarioId, idempotencyKey: input.idempotencyKey, requestHash } });
    await writeAuditEvent(tx, { actorUsuarioId: actor.usuarioId, eventType: auditEventTypes.administrativeMutation, targetType: "HR_ROLE_LEGAL_HISTORY", targetId: event.id });
    return event;
  });
}
