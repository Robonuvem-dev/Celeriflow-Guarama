import { Prisma } from "@prisma/client";
import { constructionCaseWhere, type ConstructionAccess } from "./construction-policy";
import { definitionSchema } from "./construction-rules";
import { assertConstructionDocumentChangeFeesSatisfied, assertConstructionFeesSatisfied, getConstructionPropertyDebts } from "./construction-taxation";
import { assertMandatoryInspections, calculateCompletionBalance, completionSchema, constructionCurrentPublishedArtifactWhere, inspectionPlanSchema, inspectionRequestSchema, inspectionResultSchema, lifecycleStartSchema, propertyUpdateSchema, validateLifecycleEvidence } from "./construction-lifecycle-policy";
import { createValidatedProcess } from "@/lib/protocols/service";
import { notifyProtocolDepartment } from "@/lib/protocols/notifications";
import { assertConstructionInspectionRequestDeadline } from "./construction-lifecycle-deadlines";
import { calculateInspectionCorrectionDeadline } from "./construction-lifecycle-deadline-policy";

const date = (value: string) => new Date(`${value}T00:00:00Z`);
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

async function scopedCase(tx: Prisma.TransactionClient, access: ConstructionAccess, caseId: string, roles = ["MANAGER", "ANALYST", "INSPECTOR"]) {
  if (!access.employeeId || (!access.administrator && !access.roles.some((role) => roles.includes(role)))) throw new Error("Operação exige servidor com papel urbanístico vigente.");
  await tx.$queryRaw`SELECT "id" FROM "ConstructionCase" WHERE "id"=${caseId} FOR UPDATE`;
  const record = await tx.constructionCase.findFirst({ where: { AND: [{ id: caseId }, constructionCaseWhere(access)] }, include: { process: true, configuration: true, inspectionPlan: true, lifecycleStart: true, properties: true } });
  if (!record) throw new Error("Solicitação indisponível no seu setor.");
  if (["Aguardando Recebimento", "Arquivado", "Cancelado", "Rejeitado", "Concluido", "Concluído"].includes(record.process.status)) throw new Error("Receba e mantenha o processo ativo em Protocolos.");
  if (record.reviewStatus !== "APPROVED") throw new Error("O projeto precisa estar deferido para iniciar seu ciclo de execução.");
  return record;
}

async function documents(tx: Prisma.TransactionClient, processId: string, ids: string[]) {
  const unique = [...new Set(ids)];
  const found = await tx.document.findMany({ where: { id: { in: unique }, processDocuments: { some: { processId } }, status: { in: ["Válido", "Assinado"] }, OR: [{ validUntil: null }, { validUntil: { gte: new Date() } }] }, select: { id: true, title: true, versions: { orderBy: { versionNumber: "desc" }, take: 1, select: { id: true, hashSha256: true, versionNumber: true, status: true } } } });
  if (found.length !== unique.length || found.some((item) => !item.versions.length || !["FINAL", "SIGNED"].includes(item.versions[0].status))) throw new Error("Documentos devem pertencer ao processo e ter versão GED atual válida.");
  return found;
}

async function event(tx: Prisma.TransactionClient, record: { processId: string; process: { currentDepartmentId: string | null } }, access: ConstructionAccess, type: string, description: string, metadata: unknown) {
  await tx.processEvent.create({ data: { processId: record.processId, departmentId: record.process.currentDepartmentId, employeeId: access.employeeId, eventType: type, description, metadata: JSON.stringify(metadata) } });
}

function replay(existing: { caseId: string; createdBy: string; id: string } | null, caseId: string, actorId: string) {
  if (!existing) return null;
  if (existing.caseId !== caseId || existing.createdBy !== actorId) throw new Error("Chave de operação indisponível.");
  return existing.id;
}

async function fulfillExternalRequest(tx: Prisma.TransactionClient, caseId: string, requestId: string | undefined, kind: string, actorId: string, resultId: string) {
  if (!requestId) return;
  const request = await tx.constructionServiceRequest.findFirst({ where: { id: requestId, caseId, kind, status: "PENDING" } });
  if (!request) throw new Error("Pedido externo indisponível ou já atendido.");
  await tx.constructionServiceRequest.update({ where: { id: request.id }, data: { status: "FULFILLED", resolvedBy: actorId, resolvedAt: new Date(), resolution: JSON.stringify({ operation: kind, lifecycleRecordId: resultId }) } });
}

/** F4 calls this after its APPROVED PROJECT review, in the same transaction. */
export async function setConstructionInspectionPlan(tx: Prisma.TransactionClient, access: ConstructionAccess, actorId: string, input: unknown) {
  const data = inspectionPlanSchema.parse(input);
  const record = await scopedCase(tx, access, data.caseId, ["MANAGER", "ANALYST"]);
  const existing = replay(await tx.constructionInspectionPlan.findUnique({ where: { requestKey: data.requestKey } }), data.caseId, actorId);
  if (existing) return existing;
  if (record.inspectionPlan) throw new Error("Plano do deferimento já registrado; seu histórico é imutável.");
  const review = await tx.constructionReview.findFirst({ where: { id: data.reviewId, caseId: data.caseId, reviewType: "PROJECT", decision: "APPROVED", revision: record.revisionCount } });
  if (!review) throw new Error("Vincule o parecer de deferimento desta revisão.");
  const types = await tx.constructionCatalogEntry.findMany({ where: { id: { in: data.inspectionTypeIds }, kind: "INSPECTION_TYPE", isActive: true }, select: { id: true, name: true, description: true } });
  if (types.length !== data.inspectionTypeIds.length) throw new Error("Selecione tipos de vistoria ativos.");
  const definition = await tx.constructionDefinitionVersion.findFirst({ where: { kind: "INSPECTION" }, orderBy: { version: "desc" } });
  if (!definition) throw new Error("Publique o checklist de vistoria antes de definir o plano.");
  const plan = await tx.constructionInspectionPlan.create({ data: { caseId: data.caseId, requestKey: data.requestKey, reviewId: review.id, inspectionTypes: json(types), definitionSnapshot: json({ version: definition.version, definition: definitionSchema.parse(definition.definition) }), createdBy: actorId } });
  await event(tx, record, access, "CONSTRUCTION_INSPECTION_PLAN", "Plano de vistorias obrigatórias do deferimento.", { planId: plan.id, reviewId: review.id, types });
  return plan.id;
}

export async function startConstructionLifecycle(tx: Prisma.TransactionClient, access: ConstructionAccess, actorId: string, input: unknown) {
  const data = lifecycleStartSchema.parse(input);
  const record = await scopedCase(tx, access, data.caseId, ["MANAGER", "ANALYST"]);
  const existing = replay(await tx.constructionLifecycleStart.findUnique({ where: { requestKey: data.requestKey } }), data.caseId, actorId);
  if (existing) return existing;
  if (record.lifecycleStart) throw new Error("O início já está registrado.");
  if (!record.inspectionPlan) throw new Error("Defina as vistorias obrigatórias do deferimento.");
  if (date(data.startedAt) > new Date()) throw new Error("Início não pode ser futuro.");
  const permit = await tx.constructionIssuedDocument.findFirst({ where: { caseId: record.id, kind: "PERMIT", ...constructionCurrentPublishedArtifactWhere() }, orderBy: { publishedAt: "desc" }, select: { id: true, publishedAt: true } });
  if (!permit) throw new Error("Publique um alvará vigente antes de iniciar a execução.");
  if (data.startedAt < permit.publishedAt!.toISOString().slice(0, 10)) throw new Error("Início deve ser posterior à publicação do alvará.");
  await assertConstructionFeesSatisfied(tx, record.id, record.category === "SUBDIVISION" ? "SUBDIVISION" : "PERMIT");
  const evidence = await documents(tx, record.processId, data.documentIds);
  const start = await tx.constructionLifecycleStart.create({ data: { caseId: record.id, requestKey: data.requestKey, startedAt: date(data.startedAt), notes: data.notes, evidenceSnapshot: json(evidence), createdBy: actorId } });
  await fulfillExternalRequest(tx, record.id, data.serviceRequestId, "START", actorId, start.id);
  await event(tx, record, access, "CONSTRUCTION_STARTED", data.notes, { startId: start.id, category: record.category, startedAt: data.startedAt });
  return start.id;
}

export async function requestConstructionInspection(tx: Prisma.TransactionClient, access: ConstructionAccess, actorId: string, input: unknown) {
  const data = inspectionRequestSchema.parse(input);
  const record = await scopedCase(tx, access, data.caseId);
  const old = await tx.constructionInspection.findUnique({ where: { requestKey: data.requestKey } });
  const existing = replay(old ? { ...old, createdBy: old.requestedBy } : null, data.caseId, actorId);
  if (existing) return existing;
  if (!record.lifecycleStart || !record.inspectionPlan) throw new Error("Registre o início e o plano de vistorias.");
  if (await tx.constructionCompletion.findFirst({ where: { caseId: record.id, kind: "TOTAL" } })) throw new Error("Obra já concluída integralmente.");
  const types = record.inspectionPlan.inspectionTypes as { id: string }[];
  if (!types.some((type) => type.id === data.inspectionTypeId)) throw new Error("Tipo não pertence ao plano aprovado.");
  if (data.scheduledAt && date(data.scheduledAt) < record.lifecycleStart.startedAt) throw new Error("Agendamento anterior ao início.");
  if (await tx.constructionInspection.findFirst({ where: { caseId: record.id, inspectionTypeId: data.inspectionTypeId, status: "REQUESTED" } })) throw new Error("Existe pedido pendente para esta vistoria.");
  const corrections = await assertConstructionInspectionRequestDeadline(tx, record.id, { inspectionTypeId: data.inspectionTypeId, scheduledAt: data.scheduledAt });
  const latest = await tx.constructionInspection.aggregate({ where: { caseId: record.id }, _max: { sequence: true } });
  const inspection = await tx.constructionInspection.create({ data: { caseId: record.id, sequence: (latest._max.sequence || 0) + 1, requestKey: data.requestKey, inspectionTypeId: data.inspectionTypeId, reinspectionOfId: corrections[0]?.inspectionId || null, correctionSnapshot: corrections.length ? json({ reinspectionOfId: corrections[0].inspectionId, requirementNote: corrections[0].requirementNote, effectiveDeadline: corrections[0].effectiveDeadline, latestExtension: corrections[0].latestExtension }) : undefined, scheduledAt: data.scheduledAt ? date(data.scheduledAt) : null, requestNotes: data.notes, definitionSnapshot: record.inspectionPlan.definitionSnapshot as Prisma.InputJsonValue, requestedBy: actorId } });
  await fulfillExternalRequest(tx, record.id, data.serviceRequestId, "INSPECTION", actorId, inspection.id);
  await event(tx, record, access, "CONSTRUCTION_INSPECTION_REQUESTED", data.notes, { inspectionId: inspection.id });
  return inspection.id;
}

export async function recordConstructionInspection(tx: Prisma.TransactionClient, access: ConstructionAccess, actorId: string, input: unknown) {
  const data = inspectionResultSchema.parse(input);
  const record = await scopedCase(tx, access, data.caseId, ["INSPECTOR", "MANAGER"]);
  const inspection = await tx.constructionInspection.findFirst({ where: { id: data.inspectionId, caseId: record.id } });
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
  await tx.constructionInspection.update({ where: { id: inspection.id }, data: { status: data.decision, inspectedAt: date(data.inspectedAt), resultNotes: data.notes, inspectedBy: actorId, resultRequestKey: data.requestKey, correctionDeadline: correction?.deadline || null, requirementNote: correction ? data.requirementNote : null, correctionSnapshot: correction ? json(correction.memory) : undefined, evidenceSnapshot: json({ ...evidence, documents: docs, inspectorEmployeeId: access.employeeId, correction: correction?.memory || null }) } });
  await event(tx, record, access, "CONSTRUCTION_INSPECTION_RESULT", data.notes, { inspectionId: inspection.id, decision: data.decision, correction: correction?.memory || null });
  if (correction) {
    await tx.constructionMessage.create({ data: { caseId: record.id, requestKey: data.requestKey, employeeId: access.employeeId, content: `Vistoria reprovada. Exigência de ajuste: ${data.requirementNote}. Prazo: ${correction.deadline.toISOString().slice(0, 10)} (fim do dia UTC). Solicite nova vistoria dentro do prazo; após vencimento, solicite regularização motivada ao gestor.`, evidenceSnapshot: json({ inspectionId: inspection.id, correction: correction.memory }) } });
    if (record.process.currentDepartmentId) await notifyProtocolDepartment(tx, actorId, record.process.currentDepartmentId, { processId: record.processId, type: "DEADLINE", title: "Vistoria reprovada — prazo de ajuste", message: `${data.requirementNote} Prazo: ${correction.deadline.toISOString().slice(0, 10)}.`, priority: "ALTA", dedupeDiscriminator: `inspection-failed:${inspection.id}` });
  }
  return inspection.id;
}

async function readiness(tx: Prisma.TransactionClient, caseId: string) {
  await tx.$queryRaw`SELECT "id" FROM "ConstructionCase" WHERE "id"=${caseId} FOR UPDATE`;
  const record = await tx.constructionCase.findUniqueOrThrow({ where: { id: caseId }, include: { configuration: true, lifecycleStart: true, inspectionPlan: true, inspections: { orderBy: { sequence: "desc" } }, completions: { orderBy: { createdAt: "desc" } } } });
  if (record.reviewStatus !== "APPROVED" || !record.lifecycleStart || !record.inspectionPlan) throw new Error("Conclusão exige projeto deferido, início registrado e plano de vistorias.");
  assertMandatoryInspections(record.inspectionPlan.inspectionTypes as { id: string }[], record.inspections);
  const debts = record.configuration.checkPropertyDebts ? await getConstructionPropertyDebts(tx, caseId) : { checked: false, reason: "Consulta de débitos desabilitada na configuração do processo." };
  if ("debts" in debts && debts.debts.length) throw new Error("Há débitos imobiliários pendentes. Regularize na Tributação.");
  return { record, debts };
}

export async function completeConstructionLifecycle(tx: Prisma.TransactionClient, access: ConstructionAccess, actorId: string, input: unknown) {
  const data = completionSchema.parse(input);
  const scoped = await scopedCase(tx, access, data.caseId, ["ANALYST", "MANAGER"]);
  const existing = replay(await tx.constructionCompletion.findUnique({ where: { requestKey: data.requestKey } }), data.caseId, actorId);
  if (existing) return existing;
  const { record, debts } = await readiness(tx, data.caseId);
  if (record.completions.some((item) => item.kind === "TOTAL")) throw new Error("Conclusão total já registrada.");
  if (date(data.completedAt) < record.lifecycleStart!.startedAt || date(data.completedAt) > new Date() || record.completions.some((item) => item.completedAt > date(data.completedAt)) || record.inspections.some((item) => item.status === "APPROVED" && item.inspectedAt! > date(data.completedAt))) throw new Error("Conclusão deve ser posterior ao início, às vistorias e às conclusões anteriores, sem data futura.");
  const balance = calculateCompletionBalance(record.totalArea, record.completions.map((item) => item.area), data.area, data.kind);
  const definition = await tx.constructionDefinitionVersion.findFirst({ where: { kind: "COMPLETION" }, orderBy: { version: "desc" } });
  if (!definition) throw new Error("Publique o checklist de conclusão.");
  const evidence = validateLifecycleEvidence(definition.definition, data, true);
  const docs = await documents(tx, record.processId, Object.values(data.documentIds));
  const year = new Date().getUTCFullYear();
  const sequence = await tx.constructionCompletionSequence.upsert({ where: { year }, create: { year, nextNumber: 2 }, update: { nextNumber: { increment: 1 } } });
  const completion = await tx.constructionCompletion.create({ data: { caseId: record.id, requestKey: data.requestKey, number: `CONC-${year}-${String(sequence.nextNumber - 1).padStart(6, "0")}`, kind: data.kind, completedAt: date(data.completedAt), ...balance, notes: data.notes, evidenceSnapshot: json({ ...evidence, documents: docs, definitionVersion: definition.version, definition: definition.definition, inspectionIds: record.inspections.filter((item) => item.status === "APPROVED").map((item) => item.id) }), debtSnapshot: json(debts), createdBy: actorId } });
  await fulfillExternalRequest(tx, record.id, data.serviceRequestId, "COMPLETION", actorId, completion.id);
  await event(tx, scoped, access, "CONSTRUCTION_COMPLETED", data.notes, { completionId: completion.id, number: completion.number, ...balance, kind: data.kind });
  return completion.id;
}

/** F5 gate. Caller must authorize the case; keep this inside the issuance transaction. */
export async function assertConstructionCompletionReady(tx: Prisma.TransactionClient, caseId: string, completionId?: string, documentRequestId?: string) {
  const { record, debts } = await readiness(tx, caseId);
  const completion = completionId ? record.completions.find((item) => item.id === completionId) : record.completions[0];
  if (!completion) throw new Error("Registre a conclusão parcial ou total antes de emitir habite-se.");
  if (documentRequestId) await assertConstructionDocumentChangeFeesSatisfied(tx, caseId, documentRequestId);
  else await assertConstructionFeesSatisfied(tx, caseId, "HABITE_SE");
  return { completionId: completion.id, number: completion.number, kind: completion.kind, completedAt: completion.completedAt.toISOString().slice(0, 10), area: completion.area.toFixed(4), cumulativeArea: completion.cumulativeArea.toFixed(4), remainingArea: completion.remainingArea.toFixed(4), occupancyDocumentId: completion.occupancyDocumentId, debts };
}

/** F5 calls after GED emission, in the same transaction. */
export async function linkConstructionOccupancyDocument(tx: Prisma.TransactionClient, caseId: string, completionId: string, documentId: string) {
  await assertConstructionCompletionReady(tx, caseId, completionId);
  const completion = await tx.constructionCompletion.findFirstOrThrow({ where: { id: completionId, caseId } });
  if (completion.occupancyDocumentId && completion.occupancyDocumentId !== documentId) throw new Error("Conclusão já possui habite-se vinculado.");
  await documents(tx, (await tx.constructionCase.findUniqueOrThrow({ where: { id: caseId } })).processId, [documentId]);
  await tx.constructionCompletion.update({ where: { id: completion.id }, data: { occupancyDocumentId: documentId } });
}

export async function openConstructionPropertyUpdate(tx: Prisma.TransactionClient, access: ConstructionAccess, actorId: string, input: unknown) {
  const data = propertyUpdateSchema.parse(input);
  const record = await scopedCase(tx, access, data.caseId, ["MANAGER", "ANALYST"]);
  const completion = await tx.constructionCompletion.findFirst({ where: { id: data.completionId, caseId: record.id }, include: { propertyUpdate: true } });
  if (!completion) throw new Error("Conclusão indisponível.");
  if (completion.propertyUpdate) return completion.propertyUpdate.id;
  const old = await tx.constructionPropertyUpdate.findUnique({ where: { requestKey: data.requestKey } });
  if (old) throw new Error("Chave pertence a outra atualização.");
  if (record.category === "BUILDING" && !completion.occupancyDocumentId) throw new Error("Emita e vincule o habite-se antes de abrir a atualização imobiliária.");
  if (record.category === "BUILDING" && !await tx.constructionIssuedDocument.findFirst({ where: { caseId: record.id, completionId: completion.id, kind: "OCCUPANCY", documentId: completion.occupancyDocumentId!, ...constructionCurrentPublishedArtifactWhere() }, select: { id: true } })) throw new Error("Assine e publique um habite-se vigente vinculado antes da atualização imobiliária.");
  if (data.changes.some((item) => !record.properties.some((property) => property.realEstateId === item.realEstateId))) throw new Error("Atualize apenas imóveis vinculados à solicitação.");
  const employee = await tx.employee.findFirst({ where: { id: access.employeeId!, isActive: true, departmentId: access.departmentId, department: { isActive: true } }, select: { id: true } });
  if (!employee) throw new Error("Seu vínculo a servidor/setor precisa estar ativo.");
  const process = await createValidatedProcess(tx, employee, actorId, { processTypeId: data.processTypeId, subjectId: data.subjectId, personId: record.process.personId, companyId: record.process.companyId, description: `Atualização imobiliária vinculada ao processo ${record.process.protocolNumber}, conclusão ${completion.number}.` });
  const update = await tx.constructionPropertyUpdate.create({ data: { completionId: completion.id, requestKey: data.requestKey, processId: process.id, proposedSnapshot: json(data.changes), createdBy: actorId } });
  await event(tx, record, access, "CONSTRUCTION_PROPERTY_UPDATE_OPENED", "Processo de atualização imobiliária aberto.", { updateId: update.id, linkedProcessId: process.id, completionId: completion.id });
  await tx.processEvent.create({ data: { processId: process.id, eventType: "CONSTRUCTION_LINKED_PROCESS", description: "Atualização imobiliária vinculada à conclusão urbanística.", employeeId: access.employeeId, metadata: JSON.stringify({ caseId: record.id, sourceProcessId: record.processId, completionId: completion.id, updateId: update.id }) } });
  return update.id;
}

/** Caller must additionally enforce CADASTROS update permission. Uses the cadastral process's sector. */
export async function applyConstructionPropertyUpdate(tx: Prisma.TransactionClient, access: ConstructionAccess, actorId: string, updateId: string) {
  await tx.$queryRaw`SELECT "id" FROM "ConstructionPropertyUpdate" WHERE "id"=${updateId} FOR UPDATE`;
  const update = await tx.constructionPropertyUpdate.findUniqueOrThrow({ where: { id: updateId } });
  const process = await tx.process.findUniqueOrThrow({ where: { id: update.processId } });
  if (!access.employeeId || (!access.administrator && process.currentDepartmentId !== access.departmentId)) throw new Error("Atualização reservada ao setor responsável pelo processo cadastral.");
  if (update.status === "APPLIED") return update.id;
  if (["Aguardando Recebimento", "Arquivado", "Cancelado", "Rejeitado", "Concluido", "Concluído"].includes(process.status)) throw new Error("Receba e mantenha o processo cadastral ativo.");
  const employee = await tx.employee.findFirst({ where: { id: access.employeeId, isActive: true, departmentId: access.departmentId, department: { isActive: true } }, select: { id: true } });
  if (!employee) throw new Error("Servidor precisa ter lotação ativa no setor.");
  const changes = propertyUpdateSchema.shape.changes.parse(update.proposedSnapshot);
  const before = [];
  const after = [];
  // Consistent lock ordering across updates affecting several properties.
  for (const change of [...changes].sort((a, b) => a.realEstateId.localeCompare(b.realEstateId))) {
    await tx.$queryRaw`SELECT "id" FROM "RealEstate" WHERE "id"=${change.realEstateId} FOR UPDATE`;
    const property = await tx.realEstate.findUniqueOrThrow({ where: { id: change.realEstateId }, select: { id: true, builtArea: true, propertyUse: true } });
    if (!new Prisma.Decimal(property.builtArea ?? 0).equals(change.expectedBuiltArea)) throw new Error("Cadastro imobiliário mudou desde a proposta. Revise o processo antes de atualizar.");
    before.push({ ...property, builtArea: new Prisma.Decimal(property.builtArea ?? 0).toFixed(4) });
    await tx.$queryRaw`SELECT set_config('celeriflow.cadastral_actor', ${actorId}, true), set_config('celeriflow.cadastral_process', ${process.id}, true)`;
    await tx.realEstate.update({ where: { id: property.id }, data: { builtArea: Number(change.builtArea), propertyUse: change.propertyUse } });
    after.push({ id: property.id, builtArea: new Prisma.Decimal(change.builtArea).toFixed(4), propertyUse: change.propertyUse });
  }
  await tx.constructionPropertyUpdate.update({ where: { id: update.id }, data: { status: "APPLIED", beforeSnapshot: json(before), afterSnapshot: json(after), appliedBy: actorId, appliedAt: new Date() } });
  await tx.processEvent.create({ data: { processId: process.id, employeeId: access.employeeId, departmentId: process.currentDepartmentId, eventType: "CONSTRUCTION_PROPERTY_UPDATED", description: "Cadastro imobiliário atualizado com histórico antes/depois.", metadata: JSON.stringify({ updateId: update.id, before, after }) } });
  return update.id;
}
