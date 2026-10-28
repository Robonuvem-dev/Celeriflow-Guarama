import { and, desc, eq, gte, inArray, isNotNull, isNull, lte, max, or, sql } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import type { JsonValue } from "@/db/json";
import type { DatabaseTransaction } from "@/db/transaction";
import { constructionCases, constructionCaseProperties, constructionCatalogEntries, constructionConfigVersions, constructionLifecycleStarts, constructionReviews } from "@/db/schema/construction-core";
import { constructionInspectionPlans, constructionInspections, constructionCompletions, constructionCompletionSequences, constructionPropertyUpdates } from "@/db/schema/construction-lifecycle";
import { constructionMessages, constructionServiceRequests } from "@/db/schema/construction-portal";
import { constructionDefinitionVersions } from "@/db/schema/construction-viability";
import { constructionIssuedDocuments } from "@/db/schema/construction-documents";
import { departments, employees } from "@/db/schema/administration";
import { processEvents, processes } from "@/db/schema/processes";
import { realEstates } from "@/db/schema/registry";
import { findConstructionCaseForAccess } from "@/db/repositories/infrastructure/construction-access";
import { listConstructionEvidenceDocuments } from "@/db/repositories/infrastructure/construction-documents";
import type { ConstructionAccess } from "./construction-policy";
import { definitionSchema } from "./construction-rules";
import { assertConstructionDocumentChangeFeesSatisfied, assertConstructionFeesSatisfied, getConstructionPropertyDebts } from "./construction-taxation-gates";
import { assertMandatoryInspections, calculateCompletionBalance, completionSchema, inspectionPlanSchema, inspectionRequestSchema, inspectionResultSchema, lifecycleStartSchema, propertyUpdateSchema, validateLifecycleEvidence } from "./construction-lifecycle-policy";
import { createValidatedProcess } from "@/lib/protocols/service";
import { notifyProtocolDepartment } from "@/lib/protocols/notifications";
import { assertConstructionInspectionRequestDeadline } from "./construction-lifecycle-deadlines";
import { calculateInspectionCorrectionDeadline } from "./construction-lifecycle-deadline-policy";

const date = (value: string) => new Date(`${value}T00:00:00Z`);
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as JsonValue;

function currentPublishedArtifact(now = new Date()) {
  return and(eq(constructionIssuedDocuments.status, "PUBLISHED"), isNotNull(constructionIssuedDocuments.publishedAt), lte(constructionIssuedDocuments.publishedAt, now), or(isNull(constructionIssuedDocuments.validUntil), gte(constructionIssuedDocuments.validUntil, now)));
}

async function scopedCase(tx: DatabaseTransaction, access: ConstructionAccess, caseId: string, roles = ["MANAGER", "ANALYST", "INSPECTOR"]) {
  if (!access.employeeId || (!access.administrator && !access.roles.some((role) => roles.includes(role)))) throw new Error("Operação exige servidor com papel urbanístico vigente.");
  await tx.execute(sql`SELECT "id" FROM "ConstructionCase" WHERE "id"=${caseId} FOR UPDATE`);
  const record = await findConstructionCaseForAccess(tx, caseId, access);
  if (!record) throw new Error("Solicitação indisponível no seu setor.");
  if (["Aguardando Recebimento", "Arquivado", "Cancelado", "Rejeitado", "Concluido", "Concluído"].includes(record.process.status)) throw new Error("Receba e mantenha o processo ativo em Protocolos.");
  if (record.reviewStatus !== "APPROVED") throw new Error("O projeto precisa estar deferido para iniciar seu ciclo de execução.");
  const [[configuration], [inspectionPlan], [lifecycleStart], properties] = await Promise.all([
    tx.select().from(constructionConfigVersions).where(eq(constructionConfigVersions.id, record.configurationId)).limit(1),
    tx.select().from(constructionInspectionPlans).where(eq(constructionInspectionPlans.caseId, caseId)).limit(1),
    tx.select().from(constructionLifecycleStarts).where(eq(constructionLifecycleStarts.caseId, caseId)).limit(1),
    tx.select().from(constructionCaseProperties).where(eq(constructionCaseProperties.caseId, caseId)),
  ]);
  if (!configuration) throw new Error("Configuração urbanística indisponível.");
  return { ...record, configuration, inspectionPlan: inspectionPlan ?? null, lifecycleStart: lifecycleStart ?? null, properties };
}

async function documents(tx: DatabaseTransaction, processId: string, ids: string[]) {
  const unique = [...new Set(ids)];
  const found = await listConstructionEvidenceDocuments(tx, processId, unique);
  if (found.length !== unique.length || found.some((item) => !item.versions.length || !["FINAL", "SIGNED"].includes(item.versions[0].status))) throw new Error("Documentos devem pertencer ao processo e ter versão GED atual válida.");
  return found;
}

async function event(tx: DatabaseTransaction, record: { processId: string; process: { currentDepartmentId: string | null } }, access: ConstructionAccess, type: string, description: string, metadata: unknown) {
  await tx.insert(processEvents).values({ processId: record.processId, departmentId: record.process.currentDepartmentId, employeeId: access.employeeId, eventType: type, description, metadata: JSON.stringify(metadata) });
}

function replay(existing: { caseId: string; createdBy: string; id: string } | null | undefined, caseId: string, actorId: string) {
  if (!existing) return null;
  if (existing.caseId !== caseId || existing.createdBy !== actorId) throw new Error("Chave de operação indisponível.");
  return existing.id;
}

async function fulfillExternalRequest(tx: DatabaseTransaction, caseId: string, requestId: string | undefined, kind: string, actorId: string, resultId: string) {
  if (!requestId) return;
  const [request] = await tx.select().from(constructionServiceRequests).where(and(eq(constructionServiceRequests.id, requestId), eq(constructionServiceRequests.caseId, caseId), eq(constructionServiceRequests.kind, kind), eq(constructionServiceRequests.status, "PENDING"))).limit(1);
  if (!request) throw new Error("Pedido externo indisponível ou já atendido.");
  await tx.update(constructionServiceRequests).set({ status: "ACCEPTED", resolvedBy: actorId, resolvedAt: new Date(), resolution: JSON.stringify({ operation: kind, lifecycleRecordId: resultId }) }).where(eq(constructionServiceRequests.id, request.id));
}

/** F4 calls this after its APPROVED PROJECT review, in the same transaction. */
export async function setConstructionInspectionPlan(tx: DatabaseTransaction, access: ConstructionAccess, actorId: string, input: unknown) {
  const data = inspectionPlanSchema.parse(input);
  const record = await scopedCase(tx, access, data.caseId, ["MANAGER", "ANALYST"]);
  const [old] = await tx.select().from(constructionInspectionPlans).where(eq(constructionInspectionPlans.requestKey, data.requestKey)).limit(1);
  const existing = replay(old, data.caseId, actorId);
  if (existing) return existing;
  if (record.inspectionPlan) throw new Error("Plano do deferimento já registrado; seu histórico é imutável.");
  const [review] = await tx.select().from(constructionReviews).where(and(eq(constructionReviews.id, data.reviewId), eq(constructionReviews.caseId, data.caseId), eq(constructionReviews.reviewType, "PROJECT"), eq(constructionReviews.decision, "APPROVED"), eq(constructionReviews.revision, record.revisionCount))).limit(1);
  if (!review) throw new Error("Vincule o parecer de deferimento desta revisão.");
  const types = await tx.select({ id: constructionCatalogEntries.id, name: constructionCatalogEntries.name, description: constructionCatalogEntries.description }).from(constructionCatalogEntries).where(and(inArray(constructionCatalogEntries.id, data.inspectionTypeIds), eq(constructionCatalogEntries.kind, "INSPECTION_TYPE"), eq(constructionCatalogEntries.isActive, true)));
  if (types.length !== data.inspectionTypeIds.length) throw new Error("Selecione tipos de vistoria ativos.");
  const [definition] = await tx.select().from(constructionDefinitionVersions).where(eq(constructionDefinitionVersions.kind, "INSPECTION")).orderBy(desc(constructionDefinitionVersions.version)).limit(1);
  if (!definition) throw new Error("Publique o checklist de vistoria antes de definir o plano.");
  const [plan] = await tx.insert(constructionInspectionPlans).values({ caseId: data.caseId, requestKey: data.requestKey, reviewId: review.id, inspectionTypes: json(types), definitionSnapshot: json({ version: definition.version, definition: definitionSchema.parse(definition.definition) }), createdBy: actorId }).returning();
  await event(tx, record, access, "CONSTRUCTION_INSPECTION_PLAN", "Plano de vistorias obrigatórias do deferimento.", { planId: plan.id, reviewId: review.id, types });
  return plan.id;
}

export async function startConstructionLifecycle(tx: DatabaseTransaction, access: ConstructionAccess, actorId: string, input: unknown) {
  const data = lifecycleStartSchema.parse(input);
  const record = await scopedCase(tx, access, data.caseId, ["MANAGER", "ANALYST"]);
  const [old] = await tx.select().from(constructionLifecycleStarts).where(eq(constructionLifecycleStarts.requestKey, data.requestKey)).limit(1);
  const existing = replay(old, data.caseId, actorId);
  if (existing) return existing;
  if (record.lifecycleStart) throw new Error("O início já está registrado.");
  if (!record.inspectionPlan) throw new Error("Defina as vistorias obrigatórias do deferimento.");
  if (date(data.startedAt) > new Date()) throw new Error("Início não pode ser futuro.");
  const [permit] = await tx.select({ id: constructionIssuedDocuments.id, publishedAt: constructionIssuedDocuments.publishedAt }).from(constructionIssuedDocuments).where(and(eq(constructionIssuedDocuments.caseId, record.id), eq(constructionIssuedDocuments.kind, "PERMIT"), currentPublishedArtifact())).orderBy(desc(constructionIssuedDocuments.publishedAt)).limit(1);
  if (!permit) throw new Error("Publique um alvará vigente antes de iniciar a execução.");
  if (data.startedAt < permit.publishedAt!.toISOString().slice(0, 10)) throw new Error("Início deve ser posterior à publicação do alvará.");
  await assertConstructionFeesSatisfied(tx, record.id, record.category === "SUBDIVISION" ? "SUBDIVISION" : "PERMIT");
  const evidence = await documents(tx, record.processId, data.documentIds);
  const [start] = await tx.insert(constructionLifecycleStarts).values({ caseId: record.id, requestKey: data.requestKey, startedAt: date(data.startedAt), notes: data.notes, evidenceSnapshot: json(evidence), createdBy: actorId }).returning();
  await fulfillExternalRequest(tx, record.id, data.serviceRequestId, "START", actorId, start.id);
  await event(tx, record, access, "CONSTRUCTION_STARTED", data.notes, { startId: start.id, category: record.category, startedAt: data.startedAt });
  return start.id;
}

export async function requestConstructionInspection(tx: DatabaseTransaction, access: ConstructionAccess, actorId: string, input: unknown) {
  const data = inspectionRequestSchema.parse(input);
  const record = await scopedCase(tx, access, data.caseId);
  const [old] = await tx.select().from(constructionInspections).where(eq(constructionInspections.requestKey, data.requestKey)).limit(1);
  const existing = replay(old ? { ...old, createdBy: old.requestedBy } : null, data.caseId, actorId);
  if (existing) return existing;
  if (!record.lifecycleStart || !record.inspectionPlan) throw new Error("Registre o início e o plano de vistorias.");
  if ((await tx.select({ id: constructionCompletions.id }).from(constructionCompletions).where(and(eq(constructionCompletions.caseId, record.id), eq(constructionCompletions.kind, "TOTAL"))).limit(1)).length) throw new Error("Obra já concluída integralmente.");
  const types = record.inspectionPlan.inspectionTypes as { id: string }[];
  if (!types.some((type) => type.id === data.inspectionTypeId)) throw new Error("Tipo não pertence ao plano aprovado.");
  if (data.scheduledAt && date(data.scheduledAt) < record.lifecycleStart.startedAt) throw new Error("Agendamento anterior ao início.");
  if ((await tx.select({ id: constructionInspections.id }).from(constructionInspections).where(and(eq(constructionInspections.caseId, record.id), eq(constructionInspections.inspectionTypeId, data.inspectionTypeId), eq(constructionInspections.status, "REQUESTED"))).limit(1)).length) throw new Error("Existe pedido pendente para esta vistoria.");
  const corrections = await assertConstructionInspectionRequestDeadline(tx, record.id, { inspectionTypeId: data.inspectionTypeId, scheduledAt: data.scheduledAt });
  const [latest] = await tx.select({ sequence: max(constructionInspections.sequence) }).from(constructionInspections).where(eq(constructionInspections.caseId, record.id));
  const [inspection] = await tx.insert(constructionInspections).values({ caseId: record.id, sequence: (latest.sequence || 0) + 1, requestKey: data.requestKey, inspectionTypeId: data.inspectionTypeId, reinspectionOfId: corrections[0]?.inspectionId || null, correctionSnapshot: corrections.length ? json({ reinspectionOfId: corrections[0].inspectionId, requirementNote: corrections[0].requirementNote, effectiveDeadline: corrections[0].effectiveDeadline, latestExtension: corrections[0].latestExtension }) : undefined, scheduledAt: data.scheduledAt ? date(data.scheduledAt) : null, requestNotes: data.notes, definitionSnapshot: record.inspectionPlan.definitionSnapshot, requestedBy: actorId }).returning();
  await fulfillExternalRequest(tx, record.id, data.serviceRequestId, "INSPECTION", actorId, inspection.id);
  await event(tx, record, access, "CONSTRUCTION_INSPECTION_REQUESTED", data.notes, { inspectionId: inspection.id });
  return inspection.id;
}

export async function recordConstructionInspection(tx: DatabaseTransaction, access: ConstructionAccess, actorId: string, input: unknown) {
  const data = inspectionResultSchema.parse(input);
  const record = await scopedCase(tx, access, data.caseId, ["INSPECTOR", "MANAGER"]);
  const [inspection] = await tx.select().from(constructionInspections).where(and(eq(constructionInspections.id, data.inspectionId), eq(constructionInspections.caseId, record.id))).limit(1);
  if (!inspection) throw new Error("Pedido de vistoria indisponível.");
  if (inspection.resultRequestKey === data.requestKey && inspection.inspectedBy === actorId) return inspection.id;
  if (inspection.status !== "REQUESTED") throw new Error("Resultado imutável. Registre novo pedido para nova vistoria.");
  if (!record.lifecycleStart || date(data.inspectedAt) < record.lifecycleStart.startedAt || date(data.inspectedAt) > new Date()) throw new Error("Data de vistoria fora do período de execução.");
  if (inspection.reinspectionOfId) await assertConstructionInspectionRequestDeadline(tx, record.id, { inspectionTypeId: inspection.inspectionTypeId, scheduledAt: data.inspectedAt });
  const snapshot = inspection.definitionSnapshot as { definition: unknown };
  const evidence = validateLifecycleEvidence(snapshot.definition, data, data.decision === "APPROVED");
  const docs = await documents(tx, record.processId, Object.values(data.documentIds));
  if (data.decision === "APPROVED") await assertConstructionFeesSatisfied(tx, record.id, "INSPECTION");
  const correction = data.decision === "FAILED" ? calculateInspectionCorrectionDeadline({ category: record.category, correctionDays: record.configuration.correctionDays, configurationId: record.configurationId, configurationVersion: record.configuration.version, inspectedAt: data.inspectedAt, requirementNote: data.requirementNote! }) : null;
  await tx.update(constructionInspections).set({ status: data.decision, inspectedAt: date(data.inspectedAt), resultNotes: data.notes, inspectedBy: actorId, resultRequestKey: data.requestKey, correctionDeadline: correction?.deadline || null, requirementNote: correction ? data.requirementNote : null, correctionSnapshot: correction ? json(correction.memory) : undefined, evidenceSnapshot: json({ ...evidence, documents: docs, inspectorEmployeeId: access.employeeId, correction: correction?.memory || null }) }).where(eq(constructionInspections.id, inspection.id));
  await event(tx, record, access, "CONSTRUCTION_INSPECTION_RESULT", data.notes, { inspectionId: inspection.id, decision: data.decision, correction: correction?.memory || null });
  if (correction) {
    await tx.insert(constructionMessages).values({ caseId: record.id, requestKey: data.requestKey, employeeId: access.employeeId, content: `Vistoria reprovada. Exigência de ajuste: ${data.requirementNote}. Prazo: ${correction.deadline.toISOString().slice(0, 10)} (fim do dia UTC). Solicite nova vistoria dentro do prazo; após vencimento, solicite regularização motivada ao gestor.`, evidenceSnapshot: json({ inspectionId: inspection.id, correction: correction.memory }) });
    if (record.process.currentDepartmentId) await notifyProtocolDepartment(tx, actorId, record.process.currentDepartmentId, { processId: record.processId, type: "DEADLINE", title: "Vistoria reprovada — prazo de ajuste", message: `${data.requirementNote} Prazo: ${correction.deadline.toISOString().slice(0, 10)}.`, priority: "ALTA", dedupeDiscriminator: `inspection-failed:${inspection.id}` });
  }
  return inspection.id;
}

async function readiness(tx: DatabaseTransaction, caseId: string) {
  await tx.execute(sql`SELECT "id" FROM "ConstructionCase" WHERE "id"=${caseId} FOR UPDATE`);
  const [base] = await tx.select().from(constructionCases).where(eq(constructionCases.id, caseId)).limit(1);
  if (!base) throw new Error("Solicitação indisponível.");
  const [[configuration], [lifecycleStart], [inspectionPlan], inspections, completions] = await Promise.all([
    tx.select().from(constructionConfigVersions).where(eq(constructionConfigVersions.id, base.configurationId)).limit(1),
    tx.select().from(constructionLifecycleStarts).where(eq(constructionLifecycleStarts.caseId, caseId)).limit(1),
    tx.select().from(constructionInspectionPlans).where(eq(constructionInspectionPlans.caseId, caseId)).limit(1),
    tx.select().from(constructionInspections).where(eq(constructionInspections.caseId, caseId)).orderBy(desc(constructionInspections.sequence)),
    tx.select().from(constructionCompletions).where(eq(constructionCompletions.caseId, caseId)).orderBy(desc(constructionCompletions.createdAt)),
  ]);
  if (!configuration) throw new Error("Configuração urbanística indisponível.");
  const record = { ...base, configuration, lifecycleStart: lifecycleStart ?? null, inspectionPlan: inspectionPlan ?? null, inspections, completions };
  if (record.reviewStatus !== "APPROVED" || !record.lifecycleStart || !record.inspectionPlan) throw new Error("Conclusão exige projeto deferido, início registrado e plano de vistorias.");
  assertMandatoryInspections(record.inspectionPlan.inspectionTypes as { id: string }[], record.inspections);
  const debts = record.configuration.checkPropertyDebts ? await getConstructionPropertyDebts(tx, caseId) : { checked: false, reason: "Consulta de débitos desabilitada na configuração do processo." };
  if ("debts" in debts && debts.debts.length) throw new Error("Há débitos imobiliários pendentes. Regularize na Tributação.");
  return { record, debts };
}

export async function completeConstructionLifecycle(tx: DatabaseTransaction, access: ConstructionAccess, actorId: string, input: unknown) {
  const data = completionSchema.parse(input);
  const scoped = await scopedCase(tx, access, data.caseId, ["ANALYST", "MANAGER"]);
  const [old] = await tx.select().from(constructionCompletions).where(eq(constructionCompletions.requestKey, data.requestKey)).limit(1);
  const existing = replay(old, data.caseId, actorId);
  if (existing) return existing;
  const { record, debts } = await readiness(tx, data.caseId);
  if (record.completions.some((item) => item.kind === "TOTAL")) throw new Error("Conclusão total já registrada.");
  if (date(data.completedAt) < record.lifecycleStart!.startedAt || date(data.completedAt) > new Date() || record.completions.some((item) => item.completedAt > date(data.completedAt)) || record.inspections.some((item) => item.status === "APPROVED" && item.inspectedAt! > date(data.completedAt))) throw new Error("Conclusão deve ser posterior ao início, às vistorias e às conclusões anteriores, sem data futura.");
  const balance = calculateCompletionBalance(record.totalArea, record.completions.map((item) => item.area), data.area, data.kind);
  const [definition] = await tx.select().from(constructionDefinitionVersions).where(eq(constructionDefinitionVersions.kind, "COMPLETION")).orderBy(desc(constructionDefinitionVersions.version)).limit(1);
  if (!definition) throw new Error("Publique o checklist de conclusão.");
  const evidence = validateLifecycleEvidence(definition.definition, data, true);
  const docs = await documents(tx, record.processId, Object.values(data.documentIds));
  const year = new Date().getUTCFullYear();
  const [sequence] = await tx.insert(constructionCompletionSequences).values({ year, nextNumber: 2 }).onConflictDoUpdate({ target: constructionCompletionSequences.year, set: { nextNumber: sql`${constructionCompletionSequences.nextNumber} + 1` } }).returning();
  const completionValues = { ...balance, area: new Decimal(balance.area), cumulativeArea: new Decimal(balance.cumulativeArea), remainingArea: new Decimal(balance.remainingArea) };
  const [completion] = await tx.insert(constructionCompletions).values({ caseId: record.id, requestKey: data.requestKey, number: `CONC-${year}-${String(sequence.nextNumber - 1).padStart(6, "0")}`, kind: data.kind, completedAt: date(data.completedAt), ...completionValues, notes: data.notes, evidenceSnapshot: json({ ...evidence, documents: docs, definitionVersion: definition.version, definition: definition.definition, inspectionIds: record.inspections.filter((item) => item.status === "APPROVED").map((item) => item.id) }), debtSnapshot: json(debts), createdBy: actorId }).returning();
  await fulfillExternalRequest(tx, record.id, data.serviceRequestId, "COMPLETION", actorId, completion.id);
  await event(tx, scoped, access, "CONSTRUCTION_COMPLETED", data.notes, { completionId: completion.id, number: completion.number, ...balance, kind: data.kind });
  return completion.id;
}

/** F5 gate. Caller must authorize the case; keep this inside the issuance transaction. */
export async function assertConstructionCompletionReady(tx: DatabaseTransaction, caseId: string, completionId?: string, documentRequestId?: string) {
  const { record, debts } = await readiness(tx, caseId);
  const completion = completionId ? record.completions.find((item) => item.id === completionId) : record.completions[0];
  if (!completion) throw new Error("Registre a conclusão parcial ou total antes de emitir habite-se.");
  if (documentRequestId) await assertConstructionDocumentChangeFeesSatisfied(tx, caseId, documentRequestId);
  else await assertConstructionFeesSatisfied(tx, caseId, "HABITE_SE");
  return { completionId: completion.id, number: completion.number, kind: completion.kind, completedAt: completion.completedAt.toISOString().slice(0, 10), area: completion.area.toFixed(4), cumulativeArea: completion.cumulativeArea.toFixed(4), remainingArea: completion.remainingArea.toFixed(4), occupancyDocumentId: completion.occupancyDocumentId, debts };
}

/** F5 calls after GED emission, in the same transaction. */
export async function linkConstructionOccupancyDocument(tx: DatabaseTransaction, caseId: string, completionId: string, documentId: string) {
  await assertConstructionCompletionReady(tx, caseId, completionId);
  const [completion] = await tx.select().from(constructionCompletions).where(and(eq(constructionCompletions.id, completionId), eq(constructionCompletions.caseId, caseId))).limit(1);
  if (!completion) throw new Error("Conclusão indisponível.");
  if (completion.occupancyDocumentId && completion.occupancyDocumentId !== documentId) throw new Error("Conclusão já possui habite-se vinculado.");
  const [record] = await tx.select({ processId: constructionCases.processId }).from(constructionCases).where(eq(constructionCases.id, caseId)).limit(1);
  if (!record) throw new Error("Solicitação indisponível.");
  await documents(tx, record.processId, [documentId]);
  await tx.update(constructionCompletions).set({ occupancyDocumentId: documentId }).where(eq(constructionCompletions.id, completion.id));
}

export async function openConstructionPropertyUpdate(tx: DatabaseTransaction, access: ConstructionAccess, actorId: string, input: unknown) {
  const data = propertyUpdateSchema.parse(input);
  const record = await scopedCase(tx, access, data.caseId, ["MANAGER", "ANALYST"]);
  const [completion] = await tx.select().from(constructionCompletions).where(and(eq(constructionCompletions.id, data.completionId), eq(constructionCompletions.caseId, record.id))).limit(1);
  if (!completion) throw new Error("Conclusão indisponível.");
  const [propertyUpdate] = await tx.select({ id: constructionPropertyUpdates.id }).from(constructionPropertyUpdates).where(eq(constructionPropertyUpdates.completionId, completion.id)).limit(1);
  if (propertyUpdate) return propertyUpdate.id;
  const [old] = await tx.select({ id: constructionPropertyUpdates.id }).from(constructionPropertyUpdates).where(eq(constructionPropertyUpdates.requestKey, data.requestKey)).limit(1);
  if (old) throw new Error("Chave pertence a outra atualização.");
  if (record.category === "BUILDING" && !completion.occupancyDocumentId) throw new Error("Emita e vincule o habite-se antes de abrir a atualização imobiliária.");
  if (record.category === "BUILDING" && !(await tx.select({ id: constructionIssuedDocuments.id }).from(constructionIssuedDocuments).where(and(eq(constructionIssuedDocuments.caseId, record.id), eq(constructionIssuedDocuments.completionId, completion.id), eq(constructionIssuedDocuments.kind, "OCCUPANCY"), eq(constructionIssuedDocuments.documentId, completion.occupancyDocumentId!), currentPublishedArtifact())).limit(1)).length) throw new Error("Assine e publique um habite-se vigente vinculado antes da atualização imobiliária.");
  if (data.changes.some((item) => !record.properties.some((property) => property.realEstateId === item.realEstateId))) throw new Error("Atualize apenas imóveis vinculados à solicitação.");
  const [employee] = await tx.select({ id: employees.id }).from(employees).innerJoin(departments, eq(departments.id, employees.departmentId)).where(and(eq(employees.id, access.employeeId!), eq(employees.isActive, true), access.departmentId === null ? isNull(employees.departmentId) : eq(employees.departmentId, access.departmentId), eq(departments.isActive, true))).limit(1);
  if (!employee) throw new Error("Seu vínculo a servidor/setor precisa estar ativo.");
  const process = await createValidatedProcess(tx, employee, actorId, { processTypeId: data.processTypeId, subjectId: data.subjectId, personId: record.process.personId, companyId: record.process.companyId, description: `Atualização imobiliária vinculada ao processo ${record.process.protocolNumber}, conclusão ${completion.number}.` });
  const [update] = await tx.insert(constructionPropertyUpdates).values({ completionId: completion.id, requestKey: data.requestKey, processId: process.id, proposedSnapshot: json(data.changes), createdBy: actorId }).returning();
  await event(tx, record, access, "CONSTRUCTION_PROPERTY_UPDATE_OPENED", "Processo de atualização imobiliária aberto.", { updateId: update.id, linkedProcessId: process.id, completionId: completion.id });
  await tx.insert(processEvents).values({ processId: process.id, eventType: "CONSTRUCTION_LINKED_PROCESS", description: "Atualização imobiliária vinculada à conclusão urbanística.", employeeId: access.employeeId, metadata: JSON.stringify({ caseId: record.id, sourceProcessId: record.processId, completionId: completion.id, updateId: update.id }) });
  return update.id;
}

/** Caller must additionally enforce CADASTROS update permission. Uses the cadastral process's sector. */
export async function applyConstructionPropertyUpdate(tx: DatabaseTransaction, access: ConstructionAccess, actorId: string, updateId: string) {
  await tx.execute(sql`SELECT "id" FROM "ConstructionPropertyUpdate" WHERE "id"=${updateId} FOR UPDATE`);
  const [update] = await tx.select().from(constructionPropertyUpdates).where(eq(constructionPropertyUpdates.id, updateId)).limit(1);
  if (!update) throw new Error("Atualização indisponível.");
  const [process] = await tx.select().from(processes).where(eq(processes.id, update.processId)).limit(1);
  if (!process) throw new Error("Processo cadastral indisponível.");
  if (!access.employeeId || (!access.administrator && process.currentDepartmentId !== access.departmentId)) throw new Error("Atualização reservada ao setor responsável pelo processo cadastral.");
  if (update.status === "APPLIED") return update.id;
  if (["Aguardando Recebimento", "Arquivado", "Cancelado", "Rejeitado", "Concluido", "Concluído"].includes(process.status)) throw new Error("Receba e mantenha o processo cadastral ativo.");
  const [employee] = await tx.select({ id: employees.id }).from(employees).innerJoin(departments, eq(departments.id, employees.departmentId)).where(and(eq(employees.id, access.employeeId), eq(employees.isActive, true), access.departmentId === null ? isNull(employees.departmentId) : eq(employees.departmentId, access.departmentId), eq(departments.isActive, true))).limit(1);
  if (!employee) throw new Error("Servidor precisa ter lotação ativa no setor.");
  const changes = propertyUpdateSchema.shape.changes.parse(update.proposedSnapshot);
  const before = [];
  const after = [];
  // Consistent lock ordering across updates affecting several properties.
  for (const change of [...changes].sort((a, b) => a.realEstateId.localeCompare(b.realEstateId))) {
    await tx.execute(sql`SELECT "id" FROM "RealEstate" WHERE "id"=${change.realEstateId} FOR UPDATE`);
    const [property] = await tx.select({ id: realEstates.id, builtArea: realEstates.builtArea, propertyUse: realEstates.propertyUse }).from(realEstates).where(eq(realEstates.id, change.realEstateId)).limit(1);
    if (!property) throw new Error("Imóvel indisponível.");
    if (!new Decimal(property.builtArea ?? 0).equals(change.expectedBuiltArea)) throw new Error("Cadastro imobiliário mudou desde a proposta. Revise o processo antes de atualizar.");
    before.push({ ...property, builtArea: new Decimal(property.builtArea ?? 0).toFixed(4) });
    await tx.execute(sql`SELECT set_config('celeriflow.cadastral_actor', ${actorId}, true), set_config('celeriflow.cadastral_process', ${process.id}, true)`);
    await tx.update(realEstates).set({ builtArea: Number(change.builtArea), propertyUse: change.propertyUse }).where(eq(realEstates.id, property.id));
    after.push({ id: property.id, builtArea: new Decimal(change.builtArea).toFixed(4), propertyUse: change.propertyUse });
  }
  await tx.update(constructionPropertyUpdates).set({ status: "APPLIED", beforeSnapshot: json(before), afterSnapshot: json(after), appliedBy: actorId, appliedAt: new Date() }).where(eq(constructionPropertyUpdates.id, update.id));
  await tx.insert(processEvents).values({ processId: process.id, employeeId: access.employeeId, departmentId: process.currentDepartmentId, eventType: "CONSTRUCTION_PROPERTY_UPDATED", description: "Cadastro imobiliário atualizado com histórico antes/depois.", metadata: JSON.stringify({ updateId: update.id, before, after }) });
  return update.id;
}
