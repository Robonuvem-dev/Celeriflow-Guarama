import { createHash } from "node:crypto";
import { and, desc, eq, gte, ilike, inArray, lte, or, sql } from "drizzle-orm";
import { databaseConnection } from "@/db/client";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction } from "@/db/transaction";
import { processJudicialCases, processJudicialCaseEvents, judicialBudgetUnits } from "@/db/schema/process-judicial";
import { processes, processDocuments } from "@/db/schema/processes";
import { documentVersions } from "@/db/schema/document-workflow";
import { documents } from "@/db/schema/registry";
import { departments } from "@/db/schema/administration";
import { planningEntityUnits } from "@/db/schema/planning-catalog";
import { z } from "zod";
import { protocolScopeCondition, type ProtocolScopeContext } from "./access";
import { auditEventTypes } from "@/lib/contracts/audit";
import { insertAuditEvent } from "@/db/repositories/platform/audit";

export class JudicialCaseError extends Error {}
export const judicialCaseInput = z.object({ processId: z.string().min(1), budgetUnitId: z.string().min(1), caseNumber: z.string().trim().min(3).max(100), court: z.string().trim().min(3).max(300), openedAt: z.iso.date(), status: z.enum(["OPEN", "SUSPENDED", "CLOSED", "RECLASSIFIED"]), effectiveAt: z.iso.date(), expectedVersion: z.number().int().min(0), reason: z.string().trim().min(10).max(4000), documentVersionId: z.string().min(1), idempotencyKey: z.string().trim().min(1).max(150), municipalDefendantConfirmed: z.boolean() }).strict().refine(value => value.status === "RECLASSIFIED" || value.municipalDefendantConfirmed, "Confirme documentalmente a entidade como demandada ou reclassifique o vínculo incorreto.");
export type JudicialCaseInput = z.infer<typeof judicialCaseInput>;

export async function recordProcessJudicialCase(context: ProtocolScopeContext, raw: JudicialCaseInput, connection: DatabaseConnection = databaseConnection) {
  const input = judicialCaseInput.parse(raw);
  if (!context.protocolAccess.canUpdate) throw new JudicialCaseError("Alteração de processos não autorizada.");
  const requestHash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  return withDatabaseTransaction(connection, async tx => {
    await tx.execute(sql`SELECT id FROM "Process" WHERE id=${input.processId} FOR UPDATE`);
    const [process] = await tx.select({ id: processes.id, protocolNumber: processes.protocolNumber, currentDepartmentId: processes.currentDepartmentId, status: processes.status }).from(processes).where(and(eq(processes.id, input.processId), protocolScopeCondition(context))).limit(1);
    if (!process || (!context.protocolAccess.isAdmin && process.currentDepartmentId !== context.user.departmentId)) throw new JudicialCaseError("Registro judicial exige processo autorizado no setor atual.");
    if (["Arquivado", "Concluído", "Aguardando Recebimento"].includes(process.status)) throw new JudicialCaseError("Receba/reabra o processo antes de registrar andamento judicial.");
    if (context.user.allowedBudgetUnitIds && !context.protocolAccess.isAdmin && !context.user.allowedBudgetUnitIds.includes(input.budgetUnitId)) throw new JudicialCaseError("UG judicial fora do escopo autorizado.");
    const [binding] = await tx.select({ governmentEntityId: planningEntityUnits.governmentEntityId, secretariatId: judicialBudgetUnits.secretariatId }).from(planningEntityUnits).innerJoin(judicialBudgetUnits, eq(judicialBudgetUnits.id, planningEntityUnits.budgetUnitId)).where(eq(planningEntityUnits.budgetUnitId, input.budgetUnitId)).limit(1);
    if (!binding) throw new JudicialCaseError("UG judicial exige ente nativo vinculado.");
    const department = process.currentDepartmentId ? (await tx.select({ secretariatId: departments.secretariatId }).from(departments).where(eq(departments.id, process.currentDepartmentId)).limit(1))[0] : null;
    if (!department || department.secretariatId !== binding.secretariatId) throw new JudicialCaseError("Setor atual deve pertencer à secretaria da UG judicial.");
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`JUDICIAL_REQUEST:${input.idempotencyKey}`},0))::text`);
    const [priorRow] = await tx.select({ event: processJudicialCaseEvents, case: processJudicialCases }).from(processJudicialCaseEvents).innerJoin(processJudicialCases, eq(processJudicialCases.id, processJudicialCaseEvents.caseId)).where(eq(processJudicialCaseEvents.idempotencyKey, input.idempotencyKey)).limit(1);
    const prior = priorRow ? { ...priorRow.event, case: priorRow.case } : null;
    if (prior) { if (prior.requestHash !== requestHash || prior.actorUsuarioId !== context.user.id || prior.case.processId !== process.id) throw new JudicialCaseError("Chave judicial já utilizada com outros dados/responsável."); return prior; }
    const [existingCase] = await tx.select().from(processJudicialCases).where(eq(processJudicialCases.processId, process.id)).limit(1);
    const existing = existingCase ? { ...existingCase, events: await tx.select().from(processJudicialCaseEvents).where(eq(processJudicialCaseEvents.caseId, existingCase.id)).orderBy(desc(processJudicialCaseEvents.version)).limit(1) } : null;
    if ((existing?.version ?? 0) !== input.expectedVersion) throw new JudicialCaseError("Posição judicial alterada; recarregue a última versão.");
    if (!existing && input.status === "RECLASSIFIED") throw new JudicialCaseError("Reclassificação exige registro anterior; não cadastre inicialmente uma ação sem ente demandado comprovado.");
    const openedAt = new Date(`${input.openedAt}T00:00:00.000Z`), effectiveAt = new Date(`${input.effectiveAt}T00:00:00.000Z`);
    if (openedAt > effectiveAt || effectiveAt > new Date() || (existing?.events[0] && effectiveAt < existing.events[0].effectiveAt)) throw new JudicialCaseError("Andamento judicial não pode anteceder abertura/última posição nem ser futuro.");
    if (existing && (existing.caseNumber !== input.caseNumber || existing.court !== input.court || existing.budgetUnitId !== input.budgetUnitId || existing.governmentEntityId !== binding.governmentEntityId || existing.openedAt.getTime() !== openedAt.getTime())) throw new JudicialCaseError("Identificação e escopo judicial são permanentes; registre reclassificação fundamentada para vínculo incorreto.");
    await tx.execute(sql`SELECT id FROM "DocumentVersion" WHERE id=${input.documentVersionId} FOR SHARE`);
    const [document] = await tx.select({ id: documentVersions.id, documentId: documentVersions.documentId, fileUrl: documentVersions.fileUrl, hashSha256: documentVersions.hashSha256 }).from(documentVersions).innerJoin(documents, eq(documents.id, documentVersions.documentId)).innerJoin(processDocuments, and(eq(processDocuments.documentId, documents.id), eq(processDocuments.processId, process.id))).where(and(eq(documentVersions.id, input.documentVersionId), inArray(documentVersions.status, ["FINAL", "SIGNED"]), eq(documents.status, "Válido"))).limit(1);
    if (!document || !/^[a-fA-F0-9]{64}$/.test(document.hashSha256)) throw new JudicialCaseError("Andamento exige evidência GED final/assinada anexada ao processo.");
    const [caseRecord] = existing ? await tx.update(processJudicialCases).set({ status: input.status, version: sql`${processJudicialCases.version} + 1` }).where(eq(processJudicialCases.id, existing.id)).returning() : await tx.insert(processJudicialCases).values({ processId: process.id, governmentEntityId: binding.governmentEntityId, budgetUnitId: input.budgetUnitId, caseNumber: input.caseNumber, court: input.court, openedAt, status: input.status }).returning();
    const [event] = await tx.insert(processJudicialCaseEvents).values({ caseId: caseRecord.id, version: caseRecord.version, status: input.status, effectiveAt, reason: input.reason, documentVersionId: document.id, documentHash: document.hashSha256, actorUsuarioId: context.user.id, idempotencyKey: input.idempotencyKey, requestHash, snapshot: { governmentEntityId: binding.governmentEntityId, budgetUnitId: input.budgetUnitId, processId: process.id, protocolNumber: process.protocolNumber, municipalRole: input.status === "RECLASSIFIED" ? "RECLASSIFIED" : "DEFENDANT", municipalDefendantConfirmed: input.municipalDefendantConfirmed, caseNumber: input.caseNumber, court: input.court, openedAt: input.openedAt, documentId: document.documentId, documentFileUrl: document.fileUrl, origin: "INTERNAL_DOCUMENTED_REGISTRATION" } }).returning();
    await insertAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "PROCESS_JUDICIAL_CASE_EVENT", targetId: event.id });
    return event;
  }, { timeoutMs: 5_000 });
}

export const judicialCaseFilters = z.object({ entityId: z.string().optional(), status: z.enum(["OPEN", "SUSPENDED", "CLOSED", "RECLASSIFIED"]).optional(), q: z.string().trim().max(200).optional(), from: z.iso.date().optional(), through: z.iso.date().optional(), page: z.coerce.number().int().min(1).max(100000).default(1) }).refine(value => !value.from || !value.through || value.from <= value.through, "Período inválido.");
export function judicialCaseWhere(context: ProtocolScopeContext, governmentEntityId: string, input: z.infer<typeof judicialCaseFilters>) {
  const pattern = `%${(input.q || "").replace(/[\\%_]/g, "\\$&")}%`;
  return and(eq(processJudicialCases.governmentEntityId, governmentEntityId), context.protocolAccess.isAdmin ? undefined : inArray(processJudicialCases.budgetUnitId, context.user.allowedBudgetUnitIds), sql`EXISTS(SELECT 1 FROM ${processes} WHERE ${processes.id}=${processJudicialCases.processId} AND ${protocolScopeCondition(context)})`, input.status ? eq(processJudicialCases.status, input.status) : inArray(processJudicialCases.status, ["OPEN", "SUSPENDED"]), input.q ? or(ilike(processJudicialCases.caseNumber, pattern), ilike(processJudicialCases.court, pattern), sql`EXISTS(SELECT 1 FROM ${processes} WHERE ${processes.id}=${processJudicialCases.processId} AND ${processes.protocolNumber} ILIKE ${pattern})`) : undefined, input.from ? gte(processJudicialCases.openedAt, new Date(`${input.from}T00:00:00Z`)) : undefined, input.through ? lte(processJudicialCases.openedAt, new Date(`${input.through}T23:59:59.999Z`)) : undefined);
}
