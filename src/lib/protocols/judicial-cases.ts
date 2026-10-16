import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { protocolScope, type ProtocolContext } from "./access";
import { auditEventTypes, writeAuditEvent } from "@/lib/platform/audit-evidence";

export class JudicialCaseError extends Error {}
export const judicialCaseInput = z.object({ processId: z.string().min(1), budgetUnitId: z.string().min(1), caseNumber: z.string().trim().min(3).max(100), court: z.string().trim().min(3).max(300), openedAt: z.iso.date(), status: z.enum(["OPEN", "SUSPENDED", "CLOSED", "RECLASSIFIED"]), effectiveAt: z.iso.date(), expectedVersion: z.number().int().min(0), reason: z.string().trim().min(10).max(4000), documentVersionId: z.string().min(1), idempotencyKey: z.string().trim().min(1).max(150), municipalDefendantConfirmed: z.boolean() }).strict().refine(value => value.status === "RECLASSIFIED" || value.municipalDefendantConfirmed, "Confirme documentalmente a entidade como demandada ou reclassifique o vínculo incorreto.");
export type JudicialCaseInput = z.infer<typeof judicialCaseInput>;

export async function recordProcessJudicialCase(context: ProtocolContext, raw: JudicialCaseInput) {
  const input = judicialCaseInput.parse(raw);
  if (!context.protocolAccess.canUpdate) throw new JudicialCaseError("Alteração de processos não autorizada.");
  const requestHash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  return context.prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Process" WHERE id=${input.processId} FOR UPDATE`;
    const process = await tx.process.findFirst({ where: { AND: [{ id: input.processId }, protocolScope(context)] }, select: { id: true, protocolNumber: true, currentDepartmentId: true, status: true } });
    if (!process || (!context.protocolAccess.isAdmin && process.currentDepartmentId !== context.user.departmentId)) throw new JudicialCaseError("Registro judicial exige processo autorizado no setor atual.");
    if (["Arquivado", "Concluído", "Aguardando Recebimento"].includes(process.status)) throw new JudicialCaseError("Receba/reabra o processo antes de registrar andamento judicial.");
    if (context.user.allowedBudgetUnitIds && !context.protocolAccess.isAdmin && !context.user.allowedBudgetUnitIds.includes(input.budgetUnitId)) throw new JudicialCaseError("UG judicial fora do escopo autorizado.");
    const binding = await tx.planningEntityUnit.findUnique({ where: { budgetUnitId: input.budgetUnitId }, include: { budgetUnit: true } });
    if (!binding) throw new JudicialCaseError("UG judicial exige ente nativo vinculado.");
    const department = process.currentDepartmentId ? await tx.department.findUnique({ where: { id: process.currentDepartmentId }, select: { secretariatId: true } }) : null;
    if (!department || department.secretariatId !== binding.budgetUnit.secretariatId) throw new JudicialCaseError("Setor atual deve pertencer à secretaria da UG judicial.");
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`JUDICIAL_REQUEST:${input.idempotencyKey}`},0))::text`;
    const prior = await tx.processJudicialCaseEvent.findUnique({ where: { idempotencyKey: input.idempotencyKey }, include: { case: true } });
    if (prior) { if (prior.requestHash !== requestHash || prior.actorUsuarioId !== context.user.id || prior.case.processId !== process.id) throw new JudicialCaseError("Chave judicial já utilizada com outros dados/responsável."); return prior; }
    const existing = await tx.processJudicialCase.findUnique({ where: { processId: process.id }, include: { events: { orderBy: { version: "desc" }, take: 1 } } });
    if ((existing?.version ?? 0) !== input.expectedVersion) throw new JudicialCaseError("Posição judicial alterada; recarregue a última versão.");
    if (!existing && input.status === "RECLASSIFIED") throw new JudicialCaseError("Reclassificação exige registro anterior; não cadastre inicialmente uma ação sem ente demandado comprovado.");
    const openedAt = new Date(`${input.openedAt}T00:00:00.000Z`), effectiveAt = new Date(`${input.effectiveAt}T00:00:00.000Z`);
    if (openedAt > effectiveAt || effectiveAt > new Date() || (existing?.events[0] && effectiveAt < existing.events[0].effectiveAt)) throw new JudicialCaseError("Andamento judicial não pode anteceder abertura/última posição nem ser futuro.");
    if (existing && (existing.caseNumber !== input.caseNumber || existing.court !== input.court || existing.budgetUnitId !== input.budgetUnitId || existing.governmentEntityId !== binding.governmentEntityId || existing.openedAt.getTime() !== openedAt.getTime())) throw new JudicialCaseError("Identificação e escopo judicial são permanentes; registre reclassificação fundamentada para vínculo incorreto.");
    await tx.$queryRaw`SELECT id FROM "DocumentVersion" WHERE id=${input.documentVersionId} FOR SHARE`;
    const document = await tx.documentVersion.findFirst({ where: { id: input.documentVersionId, status: { in: ["FINAL", "SIGNED"] }, document: { status: "Válido", processDocuments: { some: { processId: process.id } } } }, select: { id: true, documentId: true, fileUrl: true, hashSha256: true } });
    if (!document || !/^[a-fA-F0-9]{64}$/.test(document.hashSha256)) throw new JudicialCaseError("Andamento exige evidência GED final/assinada anexada ao processo.");
    const caseRecord = existing ? await tx.processJudicialCase.update({ where: { id: existing.id }, data: { status: input.status, version: { increment: 1 } } }) : await tx.processJudicialCase.create({ data: { processId: process.id, governmentEntityId: binding.governmentEntityId, budgetUnitId: input.budgetUnitId, caseNumber: input.caseNumber, court: input.court, openedAt, status: input.status } });
    const event = await tx.processJudicialCaseEvent.create({ data: { caseId: caseRecord.id, version: caseRecord.version, status: input.status, effectiveAt, reason: input.reason, documentVersionId: document.id, documentHash: document.hashSha256, actorUsuarioId: context.user.id, idempotencyKey: input.idempotencyKey, requestHash, snapshot: { governmentEntityId: binding.governmentEntityId, budgetUnitId: input.budgetUnitId, processId: process.id, protocolNumber: process.protocolNumber, municipalRole: input.status === "RECLASSIFIED" ? "RECLASSIFIED" : "DEFENDANT", municipalDefendantConfirmed: input.municipalDefendantConfirmed, caseNumber: input.caseNumber, court: input.court, openedAt: input.openedAt, documentId: document.documentId, documentFileUrl: document.fileUrl, origin: "INTERNAL_DOCUMENTED_REGISTRATION" } } });
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "PROCESS_JUDICIAL_CASE_EVENT", targetId: event.id });
    return event;
  });
}

export const judicialCaseFilters = z.object({ entityId: z.string().optional(), status: z.enum(["OPEN", "SUSPENDED", "CLOSED", "RECLASSIFIED"]).optional(), q: z.string().trim().max(200).optional(), from: z.iso.date().optional(), through: z.iso.date().optional(), page: z.coerce.number().int().min(1).max(100000).default(1) }).refine(value => !value.from || !value.through || value.from <= value.through, "Período inválido.");
export function judicialCaseWhere(context: ProtocolContext, governmentEntityId: string, input: z.infer<typeof judicialCaseFilters>): Prisma.ProcessJudicialCaseWhereInput {
  return { governmentEntityId, ...(!context.protocolAccess.isAdmin ? { budgetUnitId: { in: context.user.allowedBudgetUnitIds } } : {}), process: protocolScope(context), ...(input.status ? { status: input.status } : { status: { in: ["OPEN", "SUSPENDED"] } }), ...(input.q ? { OR: [{ caseNumber: { contains: input.q, mode: "insensitive" } }, { court: { contains: input.q, mode: "insensitive" } }, { process: { protocolNumber: { contains: input.q, mode: "insensitive" } } }] } : {}), ...(input.from || input.through ? { openedAt: { ...(input.from ? { gte: new Date(`${input.from}T00:00:00Z`) } : {}), ...(input.through ? { lte: new Date(`${input.through}T23:59:59.999Z`) } : {}) } } : {}) };
}
