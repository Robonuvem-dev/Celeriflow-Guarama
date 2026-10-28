import { z } from "zod";
import { and, desc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import type { DatabaseTransaction } from "@/db/transaction";
import { constructionCases, constructionConfigVersions, constructionReviews } from "@/db/schema/construction-core";
import { constructionDefinitionVersions } from "@/db/schema/construction-viability";
import { constructionStaffRoles } from "@/db/schema/construction-portal";
import { employees } from "@/db/schema/administration";
import { processes, processEvents } from "@/db/schema/processes";
import { findConstructionCaseForAccess } from "@/db/repositories/infrastructure/construction-access";
import { listConstructionEvidenceDocuments } from "@/db/repositories/infrastructure/construction-documents";
import type { ConstructionAccess } from "./construction-policy";
import { definitionSchema, validateConstructionFields } from "./construction-rules";
import { assertConstructionFeesSatisfied } from "./construction-taxation-gates";

export const projectReviewSchema = z.object({ caseId: z.string().min(1), requestKey: z.uuid(), revision: z.number().int().nonnegative(), definitionVersion: z.number().int().nonnegative(), reviewType: z.enum(["PREANALYSIS", "PROJECT"]), decision: z.enum(["CORRECTION_REQUIRED", "APPROVED", "DENIED"]), notes: z.string().trim().min(3).max(10000), checks: z.record(z.string(), z.boolean()), documentIds: z.record(z.string(), z.string()), fieldValues: z.record(z.string(), z.string().max(4000)) });

export async function reviewConstructionProject(tx: DatabaseTransaction, access: ConstructionAccess, actorId: string, rawInput: unknown) {
  const data = projectReviewSchema.parse(rawInput);
  if (!access.administrator && !access.roles.some((role) => ["ANALYST", "MANAGER"].includes(role))) throw new Error("Parecer exige analista ou gestor urbanístico.");
  if (!access.employeeId) throw new Error("Parecer exige vínculo a servidor.");
  await tx.execute(sql`SELECT "id" FROM "ConstructionCase" WHERE "id"=${data.caseId} FOR UPDATE`);
  const record = await findConstructionCaseForAccess(tx, data.caseId, access);
  if (!record) throw new Error("Solicitação indisponível no seu setor.");
  const [existing] = await tx.select().from(constructionReviews).where(eq(constructionReviews.requestKey, data.requestKey)).limit(1);
  if (existing) {
    if (existing.caseId !== record.id || existing.createdBy !== actorId) throw new Error("Referência de parecer indisponível.");
    return existing.id;
  }
  if (!access.administrator && !access.roles.includes("MANAGER") && record.assignedEmployeeId && record.assignedEmployeeId !== access.employeeId) throw new Error("Parecer reservado ao analista responsável.");
  if (!["SUBMITTED", "RESUBMITTED"].includes(record.reviewStatus) || record.revisionCount !== data.revision) throw new Error("A solicitação mudou. Atualize a página antes de decidir.");
  if (["Aguardando Recebimento", "Arquivado", "Cancelado", "Rejeitado", "Concluido", "Concluído"].includes(record.process.status)) throw new Error("Receba e mantenha o processo ativo em Protocolos antes de emitir parecer.");
  const [configuration] = await tx.select().from(constructionConfigVersions).where(eq(constructionConfigVersions.id, record.configurationId)).limit(1);
  if (!configuration) throw new Error("Configuração urbanística indisponível.");
  const [definition] = await tx.select().from(constructionDefinitionVersions).where(eq(constructionDefinitionVersions.kind, "PERMIT")).orderBy(desc(constructionDefinitionVersions.version)).limit(1);
  if ((definition?.version || 0) !== data.definitionVersion) throw new Error("O checklist mudou. Atualize a página.");
  const checklist = definitionSchema.parse(definition?.definition || { fields: [], checks: [], documents: [] });
  const fields = validateConstructionFields(checklist, data.fieldValues);
  if (Object.keys(data.checks).some((key) => !checklist.checks.some((check) => check.key === key))) throw new Error("Critério não previsto no checklist.");
  if (Object.keys(data.documentIds).some((label) => !checklist.documents.some((document) => document.label === label))) throw new Error("Documento não previsto na definição.");
  const ids = [...new Set(Object.values(data.documentIds).filter(Boolean))];
  const documents = await listConstructionEvidenceDocuments(tx, record.processId, ids);
  if (documents.length !== ids.length || documents.some((document) => !document.versions.length || !["FINAL", "SIGNED"].includes(document.versions[0].status))) throw new Error("Os documentos devem pertencer ao processo e possuir versão GED atual válida.");
  if (data.decision === "APPROVED") {
    if (!definition) throw new Error("Publique o checklist de análise antes de aprovar.");
    if (record.revisionCount > configuration.freeRevisions) await assertConstructionFeesSatisfied(tx, record.id, "REANALYSIS");
    if (checklist.checks.some((check) => check.required && data.checks[check.key] !== true)) throw new Error("Todos os critérios obrigatórios precisam estar atendidos.");
    if (checklist.documents.some((document) => document.required && !data.documentIds[document.label])) throw new Error("Vincule todos os documentos obrigatórios.");
  }
  const deadline = data.decision === "CORRECTION_REQUIRED" ? new Date(Date.now() + configuration.correctionDays * 86400000) : null;
  const [review] = await tx.insert(constructionReviews).values({ caseId: record.id, requestKey: data.requestKey, revision: record.revisionCount, reviewType: data.reviewType, decision: data.decision, notes: data.notes, definitionSnapshot: { version: definition?.version || 0, definition: checklist }, evidenceSnapshot: { checks: data.checks, fields, documentIds: data.documentIds, documents }, createdBy: actorId }).returning();
  // Pró-análise favorável mantém a solicitação disponível para análise do projeto.
  const nextStatus = data.reviewType === "PREANALYSIS" && data.decision === "APPROVED" ? record.reviewStatus : data.decision;
  await tx.update(constructionCases).set({ reviewStatus: nextStatus, correctionDeadline: deadline, firstAnalystId: record.firstAnalystId || access.employeeId, assignedEmployeeId: record.assignedEmployeeId || access.employeeId }).where(eq(constructionCases.id, record.id));
  await tx.insert(processEvents).values({ processId: record.processId, eventType: "CONSTRUCTION_PROJECT_REVIEW", description: data.notes, departmentId: record.process.currentDepartmentId, employeeId: access.employeeId, metadata: JSON.stringify({ reviewId: review.id, decision: data.decision, reviewType: data.reviewType, revision: record.revisionCount }) });
  return review.id;
}

export async function resubmitConstructionProject(tx: DatabaseTransaction, access: ConstructionAccess, input: { caseId: string; revision: number; notes: string }) {
  if (!access.administrator && !access.roles.some((role) => ["ANALYST", "MANAGER"].includes(role))) throw new Error("Reenvio interno exige analista ou gestor.");
  await tx.execute(sql`SELECT "id" FROM "ConstructionCase" WHERE "id"=${input.caseId} FOR UPDATE`);
  const record = await findConstructionCaseForAccess(tx, input.caseId, access);
  if (!record || record.reviewStatus !== "CORRECTION_REQUIRED" || record.revisionCount !== input.revision) throw new Error("A solicitação não possui exigência pendente nesta revisão.");
  if (!access.employeeId) throw new Error("Reenvio exige vínculo a servidor.");
  if (!access.administrator && !access.roles.includes("MANAGER") && record.assignedEmployeeId !== access.employeeId) throw new Error("Reenvio reservado ao responsável ou gestor.");
  if (["Aguardando Recebimento", "Arquivado", "Cancelado", "Rejeitado", "Concluido", "Concluído"].includes(record.process.status)) throw new Error("O processo precisa estar recebido e ativo para registrar readequação.");
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
  const [analyst] = record.firstAnalystId ? await tx.select({ id: constructionStaffRoles.id }).from(constructionStaffRoles).innerJoin(employees, eq(employees.id, constructionStaffRoles.employeeId)).where(and(eq(constructionStaffRoles.employeeId, record.firstAnalystId), eq(constructionStaffRoles.departmentId, record.process.currentDepartmentId || ""), inArray(constructionStaffRoles.role, ["ANALYST", "MANAGER"]), eq(constructionStaffRoles.isActive, true), lte(constructionStaffRoles.startsAt, today), or(isNull(constructionStaffRoles.endsAt), gte(constructionStaffRoles.endsAt, today)), eq(employees.isActive, true), record.process.currentDepartmentId === null ? isNull(employees.departmentId) : eq(employees.departmentId, record.process.currentDepartmentId))).limit(1) : [];
  if (!analyst) throw new Error("Analista inicial sem vínculo vigente. Regularize o vínculo antes do retorno.");
  await tx.update(constructionCases).set({ reviewStatus: "RESUBMITTED", revisionCount: sql`${constructionCases.revisionCount} + 1`, assignedEmployeeId: record.firstAnalystId, correctionDeadline: null }).where(eq(constructionCases.id, record.id));
  await tx.update(processes).set({ currentResponsibleEmployeeId: record.firstAnalystId }).where(eq(processes.id, record.processId));
  await tx.insert(processEvents).values({ processId: record.processId, eventType: "CONSTRUCTION_RESUBMITTED", description: input.notes, departmentId: record.process.currentDepartmentId, employeeId: access.employeeId, metadata: JSON.stringify({ revision: record.revisionCount + 1, returnedTo: record.firstAnalystId }) });
}
