import { randomUUID } from "node:crypto";
import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import type { DatabaseConnection } from "@/db/connection";
import { Decimal } from "@/db/decimal";
import { JsonNull, type JsonValue } from "@/db/json";
import { withDatabaseTransaction, type DatabaseTransaction } from "@/db/transaction";
import { employees } from "@/db/schema/administration";
import { people } from "@/db/schema/people";
import { companies, documents, realEstates, taxpayers } from "@/db/schema/registry";
import { processDocuments } from "@/db/schema/processes";
import { taxAssessments, taxGuides, taxInfractions, taxes } from "@/db/schema/taxation-core";
import { taxAuditLogs } from "@/db/schema/taxation-audit";
import { dteCategories, dteMailboxes, dteMessageEvents, dteMessages } from "@/db/schema/taxation-dte";
import { fiscalAssessmentMaps, fiscalDocumentRequests, fiscalDocuments, fiscalFindingOrders, fiscalFindings, fiscalOrderEvents, fiscalOrders, fiscalPenaltyRules, fiscalPlanEvents, fiscalPlanInspectors, fiscalPlanSelections, fiscalPlans, fiscalProductivityConfigs, fiscalProductivityEntries, fiscalProductivityLedger, fiscalProductivityPeriods, fiscalTaskRules, fiscalTemplates } from "@/db/schema/taxation-inspection";
import { insertAuditEvent } from "@/db/repositories/platform/audit";
import { auditEventTypes } from "@/lib/contracts/audit";
import { readFiscalMeshSources } from "@/db/repositories/taxation/fiscal-sources";
import { calculateFiscalAssessment, calculateFiscalProductivity, classifyFiscalFinding, TributarioS7Error } from "./s7-engine";

type Actor = { usuarioId: string; employeeId?: string | null };
const asJson = (value: unknown): JsonValue => JSON.parse(JSON.stringify(value));
const competenceDate = (value: string) => {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) throw new TributarioS7Error("Competência deve estar no formato AAAA-MM.");
  return new Date(`${value}-01T12:00:00.000Z`);
};
const number = (prefix: string) => `${prefix}-${new Date().getUTCFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`;
function required<T>(value: T | undefined, message: string): T {
  if (!value) throw new TributarioS7Error(message);
  return value;
}
async function audit(tx: DatabaseTransaction, actor: Actor | undefined, eventType: string, targetType: string, targetId: string) {
  if (!actor) return;
  await tx.insert(taxAuditLogs).values({ action: eventType, entityType: targetType, entityId: targetId, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId });
  await insertAuditEvent(tx, { actorUsuarioId: actor.usuarioId, eventType: auditEventTypes.administrativeMutation, targetType, targetId });
}
async function lockedOrder(tx: DatabaseTransaction, id: string) {
  return required((await tx.select().from(fiscalOrders).where(eq(fiscalOrders.id, id)).for("update"))[0], "OS não encontrada.");
}
async function orderEvent(tx: DatabaseTransaction, actor: Actor, orderId: string, eventType: string, description: string, employeeId?: string | null, payload?: JsonValue) {
  await tx.insert(fiscalOrderEvents).values({ orderId, eventType, description, actorUsuarioId: actor.usuarioId, employeeId, payload: payload === null ? JsonNull : payload });
}

export async function createFiscalPlan(connection: DatabaseConnection, actor: Actor, input: {
  year: number; name: string; planType: "ANUAL" | "FORCA_TAREFA" | "IMOBILIARIA";
  filters: { cnae?: string; serviceItem?: string; neighborhood?: string; street?: string; propertyType?: string; fiscalSector?: string; fiscalZone?: string };
  taxpayerIds?: string[]; realEstateIds?: string[]; employeeIds: string[];
}) {
  if (!input.employeeIds.length) throw new TributarioS7Error("Selecione ao menos um fiscal responsável.");
  if (!(input.taxpayerIds?.length || input.realEstateIds?.length)) throw new TributarioS7Error("Selecione ao menos um contribuinte ou imóvel.");
  return withDatabaseTransaction(connection, async tx => {
    const subjects = input.taxpayerIds?.length ? await tx.select({ id: taxpayers.id, companyName: companies.corporateName, personName: people.fullName }).from(taxpayers).leftJoin(companies, eq(companies.id, taxpayers.companyId)).leftJoin(people, eq(people.id, taxpayers.personId)).where(inArray(taxpayers.id, input.taxpayerIds)) : [];
    const properties = input.realEstateIds?.length ? await tx.select().from(realEstates).where(inArray(realEstates.id, input.realEstateIds)) : [];
    const inspectors = await tx.select().from(employees).where(and(inArray(employees.id, input.employeeIds), eq(employees.isActive, true)));
    if (inspectors.length !== new Set(input.employeeIds).size) throw new TributarioS7Error("Há fiscal inexistente ou inativo.");
    const [plan] = await tx.insert(fiscalPlans).values({ year: input.year, name: input.name.trim(), planType: input.planType, cnaeFilter: input.filters.cnae || null, serviceItemFilter: input.filters.serviceItem || null, neighborhoodFilter: input.filters.neighborhood || null, streetFilter: input.filters.street || null, propertyTypeFilter: input.filters.propertyType || null, fiscalSectorFilter: input.filters.fiscalSector || null, fiscalZoneFilter: input.filters.fiscalZone || null, filterSnapshot: asJson(input.filters), createdByUsuarioId: actor.usuarioId }).returning();
    const selectionData = [
      ...subjects.map(row => ({ planId: plan.id, taxpayerId: row.id, realEstateId: null, subjectLabel: row.companyName ?? row.personName ?? row.id, sourceData: asJson({ type: "CONTRIBUINTE", filters: input.filters }) })),
      ...properties.map(row => ({ planId: plan.id, taxpayerId: row.taxpayerId, realEstateId: row.id, subjectLabel: `Imóvel ${row.municipalInsc ?? row.registration ?? row.id}`, sourceData: asJson({ type: "IMOVEL", propertyType: row.propertyType, street: row.streetName, fiscalZone: row.fiscalZone, filters: input.filters }) })),
    ];
    const selections = selectionData.length ? await tx.insert(fiscalPlanSelections).values(selectionData).returning() : [];
    const assigned = await tx.insert(fiscalPlanInspectors).values(inspectors.map(row => ({ planId: plan.id, employeeId: row.id }))).returning();
    await tx.insert(fiscalPlanEvents).values({ planId: plan.id, eventType: "CRIADO", description: `Planejamento ${input.planType} criado com ${subjects.length + properties.length} selecionados e ${inspectors.length} fiscais.`, actorUsuarioId: actor.usuarioId });
    await audit(tx, actor, "FISCAL_PLAN_CREATED", "FiscalAuditPlan", plan.id);
    return { ...plan, selections, inspectors: assigned };
  });
}

export async function generatePlanOrders(connection: DatabaseConnection, actor: Actor, planId: string) {
  return withDatabaseTransaction(connection, async tx => {
    const plan = (await tx.select().from(fiscalPlans).where(eq(fiscalPlans.id, planId)).for("update"))[0];
    const selections = await tx.select().from(fiscalPlanSelections).where(eq(fiscalPlanSelections.planId, planId));
    const inspectors = await tx.select().from(fiscalPlanInspectors).where(eq(fiscalPlanInspectors.planId, planId));
    if (!plan || !inspectors.length || !selections.length) throw new TributarioS7Error("Planejamento sem população ou fiscais.");
    let created = 0;
    for (const [index, selection] of selections.entries()) {
      const sourceKey = `PLANO:${plan.id}:${selection.id}`;
      const inspector = inspectors[index % inspectors.length];
      const [order] = await tx.insert(fiscalOrders).values({ orderNumber: number("OS-FISC"), sourceKey, originType: plan.planType, planId: plan.id, taxpayerId: selection.taxpayerId, realEstateId: selection.realEstateId, responsibleEmployeeId: inspector.employeeId, reason: `Execução do planejamento ${plan.name}.`, scope: selection.sourceData === null ? JsonNull : selection.sourceData, createdByUsuarioId: actor.usuarioId }).onConflictDoNothing({ target: fiscalOrders.sourceKey }).returning();
      if (!order) continue;
      await orderEvent(tx, actor, order.id, "EMITIDA", "OS gerada automaticamente a partir do planejamento.", inspector.employeeId);
      created++;
    }
    await tx.update(fiscalPlans).set({ status: "EM_EXECUCAO", approvedAt: plan.approvedAt ?? new Date() }).where(eq(fiscalPlans.id, plan.id));
    await tx.insert(fiscalPlanEvents).values({ planId: plan.id, eventType: "ORDENS_GERADAS", description: `${created} novas OS geradas sem duplicar ordens existentes.`, actorUsuarioId: actor.usuarioId });
    await audit(tx, actor, "FISCAL_PLAN_ORDERS_GENERATED", "FiscalAuditPlan", plan.id);
    return { created, total: selections.length };
  });
}

type StandaloneOrderInput = { originType: "AVULSA" | "SOLICITACAO_FISCAL"; taxpayerId?: string; realEstateId?: string; responsibleEmployeeId: string; requestedByEmployeeId?: string; processId?: string; reason: string };
async function createStandaloneOrderInTransaction(tx: DatabaseTransaction, actor: Actor, input: StandaloneOrderInput) {
  if (!(input.taxpayerId || input.realEstateId)) throw new TributarioS7Error("Informe contribuinte ou imóvel.");
  if (!input.reason.trim()) throw new TributarioS7Error("A ordem precisa de fundamentação.");
  const [order] = await tx.insert(fiscalOrders).values({ orderNumber: number("OS-FISC"), sourceKey: `${input.originType}:${randomUUID()}`, originType: input.originType, taxpayerId: input.taxpayerId || null, realEstateId: input.realEstateId || null, responsibleEmployeeId: input.responsibleEmployeeId, requestedByEmployeeId: input.requestedByEmployeeId || null, processId: input.processId || null, reason: input.reason.trim(), scope: { authorizedFlow: input.originType === "SOLICITACAO_FISCAL" ? "SOLICITACAO_FUNDAMENTADA" : "ORDEM_AVULSA" }, createdByUsuarioId: actor.usuarioId }).returning();
  await orderEvent(tx, actor, order.id, "EMITIDA", `OS ${input.originType} emitida com fundamentação registrada.`, input.responsibleEmployeeId);
  await audit(tx, actor, "FISCAL_ORDER_CREATED", "FiscalServiceOrder", order.id);
  return order;
}
export async function createStandaloneFiscalOrder(connection: DatabaseConnection, actor: Actor, input: StandaloneOrderInput) {
  return withDatabaseTransaction(connection, tx => createStandaloneOrderInTransaction(tx, actor, input));
}
export async function markFiscalOrderRead(connection: DatabaseConnection, actor: Actor, id: string) {
  return withDatabaseTransaction(connection, async tx => {
    const order = await lockedOrder(tx, id);
    const [updated] = await tx.update(fiscalOrders).set({ status: order.status === "EMITIDA" ? "LIDA" : order.status, readAt: order.readAt ?? new Date() }).where(eq(fiscalOrders.id, id)).returning();
    await orderEvent(tx, actor, id, "LIDA", "Leitura da OS registrada pelo fiscal.", order.responsibleEmployeeId);
    await audit(tx, actor, "FISCAL_ORDER_READ", "FiscalServiceOrder", id);
    return updated;
  });
}

async function createFiscalDocument(tx: DatabaseTransaction, actor: Actor, input: { orderId: string; kind: string; status?: string; employeeId: string; templateCode?: string; payload: JsonValue; title: string }) {
  const [item] = await tx.insert(fiscalDocuments).values({ orderId: input.orderId, documentKind: input.kind, documentNumber: number(input.kind), status: input.status ?? "EMITIDO", templateCode: input.templateCode, contentSnapshot: input.payload === null ? JsonNull : input.payload, issuedByEmployeeId: input.employeeId }).returning();
  const [document] = await tx.insert(documents).values({ title: input.title, documentType: `FISCAL_${input.kind}`, fileUrl: `/tributacao/fiscalizacao/documentos/${item.id}`, status: "Válido", publicLabel: "Documento da ação fiscal", notes: "Conteúdo preservado no snapshot da emissão." }).returning();
  await tx.update(fiscalDocuments).set({ documentId: document.id }).where(eq(fiscalDocuments.id, item.id));
  const order = required((await tx.select().from(fiscalOrders).where(eq(fiscalOrders.id, input.orderId)))[0], "OS não encontrada.");
  if (order.processId) await tx.insert(processDocuments).values({ processId: order.processId, documentId: document.id, purpose: input.title });
  await orderEvent(tx, actor, input.orderId, `DOCUMENTO_${input.kind}`, `${input.title} emitido.`, input.employeeId, { documentId: document.id, inspectionDocumentId: item.id });
  await audit(tx, actor, "FISCAL_DOCUMENT_ISSUED", "FiscalInspectionDocument", item.id);
  return { ...item, documentId: document.id };
}
export async function issueTiaf(connection: DatabaseConnection, actor: Actor, input: { orderId: string; requestedDocuments: string[]; deadlineDays: number; acknowledgedBy?: string }) {
  if (!input.requestedDocuments.length) throw new TributarioS7Error("Informe os documentos necessários.");
  const deadline = new Date(Date.now() + input.deadlineDays * 86400000);
  return withDatabaseTransaction(connection, async tx => {
    const order = await lockedOrder(tx, input.orderId);
    const requests = await tx.insert(fiscalDocumentRequests).values(input.requestedDocuments.map(description => ({ orderId: order.id, description, deadlineAt: deadline }))).returning();
    const tiaf = await createFiscalDocument(tx, actor, { orderId: order.id, kind: "TIAF", status: "ABERTO", employeeId: order.responsibleEmployeeId, templateCode: "TIAF_PADRAO", title: `TIAF ${order.orderNumber}`, payload: asJson({ orderNumber: order.orderNumber, taxpayerId: order.taxpayerId, realEstateId: order.realEstateId, startedAt: new Date(), requestedDocuments: input.requestedDocuments, deadlineAt: deadline, inspectorEmployeeId: order.responsibleEmployeeId, acknowledgement: input.acknowledgedBy ? { receivedBy: input.acknowledgedBy, receivedAt: new Date() } : { status: "PENDENTE" }, noticeRule: "Aviso eletrônico não equivale automaticamente à ciência" }) });
    await tx.update(fiscalOrders).set({ status: "EM_ACAO", startedAt: order.startedAt ?? new Date() }).where(eq(fiscalOrders.id, order.id));
    return { tiaf, requests };
  });
}
export async function acknowledgeTiaf(connection: DatabaseConnection, actor: Actor, input: { documentId: string; receivedBy: string }) {
  return withDatabaseTransaction(connection, async tx => {
    const item = (await tx.select().from(fiscalDocuments).where(eq(fiscalDocuments.id, input.documentId)).for("update"))[0];
    if (!item || item.documentKind !== "TIAF" || item.status === "CANCELADO") throw new TributarioS7Error("TIAF indisponível para ciência.");
    const now = new Date();
    const [updated] = await tx.update(fiscalDocuments).set({ status: "REALIZADO", acknowledgedAt: now, acknowledgedBy: input.receivedBy }).where(eq(fiscalDocuments.id, item.id)).returning();
    await orderEvent(tx, actor, item.orderId, "CIENCIA_TIAF", `Ciência registrada para ${input.receivedBy}.`, null, asJson({ documentId: item.id, acknowledgedAt: now }));
    await audit(tx, actor, "FISCAL_TIAF_ACKNOWLEDGED", "FiscalInspectionDocument", item.id);
    return updated;
  });
}
export async function cancelTiaf(connection: DatabaseConnection, actor: Actor, input: { documentId: string; reason: string }) {
  return withDatabaseTransaction(connection, async tx => {
    const item = (await tx.select().from(fiscalDocuments).where(eq(fiscalDocuments.id, input.documentId)).for("update"))[0];
    if (!item || item.documentKind !== "TIAF" || item.status === "CANCELADO") throw new TributarioS7Error("TIAF indisponível para cancelamento.");
    const [updated] = await tx.update(fiscalDocuments).set({ status: "CANCELADO", cancelledAt: new Date() }).where(eq(fiscalDocuments.id, item.id)).returning();
    await orderEvent(tx, actor, item.orderId, "TIAF_CANCELADO", input.reason, null, { documentId: item.id });
    await audit(tx, actor, "FISCAL_TIAF_CANCELLED", "FiscalInspectionDocument", item.id);
    return updated;
  });
}
export async function receiveFiscalDocument(connection: DatabaseConnection, actor: Actor, input: { requestId: string; receivedBy: string; fileUrl?: string }) {
  return withDatabaseTransaction(connection, async tx => {
    const request = (await tx.select().from(fiscalDocumentRequests).where(eq(fiscalDocumentRequests.id, input.requestId)).for("update"))[0];
    if (!request || request.status !== "SOLICITADO") throw new TributarioS7Error("Documento não está pendente de recebimento.");
    const order = await lockedOrder(tx, request.orderId);
    const [document] = await tx.insert(documents).values({ title: `Documento recebido — ${request.description}`, documentType: "FISCAL_RECEBIDO", fileUrl: input.fileUrl || `/tributacao/fiscalizacao/documentos-recebidos/${request.id}`, status: "Válido", publicLabel: "Documento recebido em ação fiscal" }).returning();
    await tx.update(fiscalDocumentRequests).set({ status: "RECEBIDO", receivedDocumentId: document.id, receivedAt: new Date(), receivedBy: input.receivedBy }).where(eq(fiscalDocumentRequests.id, request.id));
    if (order.processId) await tx.insert(processDocuments).values({ processId: order.processId, documentId: document.id, purpose: request.description });
    return createFiscalDocument(tx, actor, { orderId: request.orderId, kind: "RECEBIMENTO", employeeId: order.responsibleEmployeeId, title: `Termo de recebimento ${order.orderNumber}`, payload: asJson({ requestId: request.id, description: request.description, receivedDocumentId: document.id, receivedBy: input.receivedBy, receivedAt: new Date() }) });
  });
}
export async function returnFiscalDocument(connection: DatabaseConnection, actor: Actor, input: { requestId: string; returnedTo: string }) {
  return withDatabaseTransaction(connection, async tx => {
    const request = (await tx.select().from(fiscalDocumentRequests).where(eq(fiscalDocumentRequests.id, input.requestId)).for("update"))[0];
    if (!request || request.status !== "RECEBIDO") throw new TributarioS7Error("Somente documento recebido pode ser devolvido.");
    const order = await lockedOrder(tx, request.orderId);
    await tx.update(fiscalDocumentRequests).set({ status: "DEVOLVIDO", returnedAt: new Date(), returnedTo: input.returnedTo }).where(eq(fiscalDocumentRequests.id, request.id));
    return createFiscalDocument(tx, actor, { orderId: request.orderId, kind: "DEVOLUCAO", employeeId: order.responsibleEmployeeId, title: `Termo de devolução ${order.orderNumber}`, payload: asJson({ requestId: request.id, description: request.description, documentId: request.receivedDocumentId, returnedTo: input.returnedTo, returnedAt: new Date() }) });
  });
}
export async function createFiscalAssessmentMap(connection: DatabaseConnection, actor: Actor, input: { orderId: string; competence: string; obligationType: "PRINCIPAL" | "ACESSORIA"; originalBase: number; assessedBase: number; rate: number; penaltyRate?: number; interestRate?: number; correctionRate?: number; discountRate?: number }) {
  competenceDate(input.competence);
  const calculation = calculateFiscalAssessment(input);
  return withDatabaseTransaction(connection, async tx => {
    await lockedOrder(tx, input.orderId);
    const [totals] = await tx.select({ total: count() }).from(fiscalAssessmentMaps).where(and(eq(fiscalAssessmentMaps.orderId, input.orderId), eq(fiscalAssessmentMaps.obligationType, input.obligationType)));
    const [map] = await tx.insert(fiscalAssessmentMaps).values({ orderId: input.orderId, version: totals.total + 1, obligationType: input.obligationType, competence: input.competence, originalBaseDecimal: calculation.originalBase, assessedBaseDecimal: calculation.assessedBase, rate: calculation.rate, principalDecimal: calculation.principal, penaltyDecimal: calculation.penalty, interestDecimal: calculation.interest, correctionDecimal: calculation.correction, discountDecimal: calculation.discount, totalDecimal: calculation.total, calculationSnapshot: Object.fromEntries(Object.entries(calculation).map(([key, value]) => [key, value.toFixed(2)])), createdByUsuarioId: actor.usuarioId }).returning();
    await audit(tx, actor, "FISCAL_ASSESSMENT_MAP_CREATED", "FiscalAssessmentMap", map.id);
    return map;
  });
}
export async function finalizeFiscalMapAndIssueAuto(connection: DatabaseConnection, actor: Actor, mapId: string) {
  return withDatabaseTransaction(connection, async tx => {
    const map = (await tx.select().from(fiscalAssessmentMaps).where(eq(fiscalAssessmentMaps.id, mapId)).for("update"))[0];
    if (!map) throw new TributarioS7Error("Mapa ou contribuinte da OS não encontrado.");
    const order = await lockedOrder(tx, map.orderId);
    if (!order.taxpayerId) throw new TributarioS7Error("Mapa ou contribuinte da OS não encontrado.");
    const [infraction] = await tx.insert(taxInfractions).values({ infractionType: `Obrigação ${map.obligationType} — ${map.competence}`, penaltyValue: Number(map.totalDecimal), penaltyValueDecimal: map.totalDecimal, defenseDeadline: new Date(Date.now() + 30 * 86400000), taxpayerId: order.taxpayerId }).returning();
    // The tax, assessment, DAM, GED evidence and finalization share this tx.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('FISCAL:AUTO:TAX'))`);
    let tax = (await tx.select().from(taxes).where(eq(taxes.name, "Auto de Infração Fiscal")).limit(1))[0];
    if (!tax) [tax] = await tx.insert(taxes).values({ name: "Auto de Infração Fiscal", taxType: "Imposto" }).returning();
    const calculationSnapshot = map.calculationSnapshot === null ? JsonNull : map.calculationSnapshot;
    const [assessment] = await tx.insert(taxAssessments).values({ year: Number(map.competence.slice(0, 4)), competence: competenceDate(map.competence), originalValue: Number(map.totalDecimal), originalValueDecimal: map.totalDecimal, taxableBaseDecimal: map.assessedBaseDecimal.minus(map.originalBaseDecimal), rate: map.rate, penaltyValueDecimal: map.penaltyDecimal, interestValueDecimal: map.interestDecimal, correctionValueDecimal: map.correctionDecimal, discountValueDecimal: map.discountDecimal, finalValueDecimal: map.totalDecimal, calculationSnapshot, taxId: tax.id, taxpayerId: order.taxpayerId, realEstateId: order.realEstateId, status: "Lançado" }).returning();
    const [guide] = await tx.insert(taxGuides).values({ guideNumber: number("DAM-AUTO"), totalValue: Number(map.totalDecimal), totalValueDecimal: map.totalDecimal, dueDate: new Date(Date.now() + 30 * 86400000), assessmentId: assessment.id, calculationSnapshot }).returning();
    const auto = await createFiscalDocument(tx, actor, { orderId: map.orderId, kind: map.obligationType === "PRINCIPAL" ? "AUTO_PRINCIPAL" : "AUTO_ACESSORIA", employeeId: order.responsibleEmployeeId, title: `Auto de Infração ${order.orderNumber}`, payload: asJson({ mapId: map.id, infractionId: infraction.id, assessmentId: assessment.id, guideId: guide.id, obligationType: map.obligationType, calculation: map.calculationSnapshot, defenseDeadline: infraction.defenseDeadline }) });
    const [guideDoc] = await tx.insert(documents).values({ title: `DAM do Auto ${order.orderNumber}`, documentType: "DAM_AUTO_FISCAL", fileUrl: `/tributacao/guias/${guide.id}`, status: "Válido", publicLabel: "Guia do auto de infração" }).returning();
    await tx.update(taxGuides).set({ documentId: guideDoc.id }).where(eq(taxGuides.id, guide.id));
    await tx.update(fiscalAssessmentMaps).set({ status: "FINALIZADO", finalizedAt: new Date() }).where(eq(fiscalAssessmentMaps.id, map.id));
    return { auto, infraction, guide };
  });
}
export async function issueSeizureTerm(connection: DatabaseConnection, actor: Actor, input: { orderId: string; items: string[]; custodian: string }) {
  if (!input.items.length) throw new TributarioS7Error("Informe os itens apreendidos.");
  return withDatabaseTransaction(connection, async tx => {
    const order = await lockedOrder(tx, input.orderId);
    return createFiscalDocument(tx, actor, { orderId: order.id, kind: "APREENSAO", employeeId: order.responsibleEmployeeId, title: `Termo de apreensão ${order.orderNumber}`, payload: asJson({ items: input.items, custodian: input.custodian, issuedAt: new Date(), physicalAction: "REGISTRO_DECLARADO_PELO_FISCAL" }) });
  });
}
export async function closeFiscalOrder(connection: DatabaseConnection, actor: Actor, input: { orderId: string; result: string }) {
  return withDatabaseTransaction(connection, async tx => {
    const order = await lockedOrder(tx, input.orderId);
    const [tiaf] = await tx.select({ id: fiscalDocuments.id }).from(fiscalDocuments).where(and(eq(fiscalDocuments.orderId, order.id), eq(fiscalDocuments.documentKind, "TIAF"))).limit(1);
    const [map] = await tx.select({ id: fiscalAssessmentMaps.id }).from(fiscalAssessmentMaps).where(and(eq(fiscalAssessmentMaps.orderId, order.id), eq(fiscalAssessmentMaps.status, "FINALIZADO"))).limit(1);
    if (!tiaf || !map) throw new TributarioS7Error("Emita o TIAF e finalize ao menos um mapa antes do encerramento.");
    const [pending] = await tx.select({ id: fiscalDocumentRequests.id }).from(fiscalDocumentRequests).where(and(eq(fiscalDocumentRequests.orderId, order.id), eq(fiscalDocumentRequests.status, "SOLICITADO"))).limit(1);
    if (pending) throw new TributarioS7Error("Há documentos solicitados ainda pendentes.");
    const term = await createFiscalDocument(tx, actor, { orderId: order.id, kind: "ENCERRAMENTO", employeeId: order.responsibleEmployeeId, title: `Termo de encerramento ${order.orderNumber}`, payload: asJson({ result: input.result, closedAt: new Date(), doesNotSettleDebt: true }) });
    await tx.update(fiscalOrders).set({ status: "ENCERRADA", closedAt: new Date() }).where(eq(fiscalOrders.id, order.id));
    await orderEvent(tx, actor, order.id, "ENCERRADA", "Ação fiscal encerrada sem baixa automática de débitos.", order.responsibleEmployeeId);
    return term;
  });
}
export async function communicateFiscalDocumentDte(connection: DatabaseConnection, actor: Actor, documentId: string) {
  return withDatabaseTransaction(connection, async tx => {
    const fiscal = (await tx.select().from(fiscalDocuments).where(eq(fiscalDocuments.id, documentId)).for("update"))[0];
    const order = fiscal ? (await tx.select().from(fiscalOrders).where(eq(fiscalOrders.id, fiscal.orderId)))[0] : null;
    if (!fiscal?.documentId || !order?.taxpayerId) throw new TributarioS7Error("Documento fiscal sem contribuinte ou GED.");
    const [mailbox] = await tx.select().from(dteMailboxes).where(and(eq(dteMailboxes.taxpayerId, order.taxpayerId), eq(dteMailboxes.status, "ATIVA"))).limit(1);
    if (!mailbox) throw new TributarioS7Error("Contribuinte sem caixa DTE ativa.");
    await tx.insert(dteCategories).values({ code: "FISCALIZACAO_TRIBUTARIA", name: "Fiscalização Tributária", defaultDeadlineDays: 15 }).onConflictDoNothing({ target: dteCategories.code });
    const category = required((await tx.select().from(dteCategories).where(eq(dteCategories.code, "FISCALIZACAO_TRIBUTARIA")))[0], "Categoria DTE não encontrada.");
    const key = `FISCAL-DOC:${fiscal.id}`;
    const [prior] = await tx.select().from(dteMessages).where(eq(dteMessages.idempotencyKey, key));
    if (prior) return (await tx.update(dteMessages).set({ documentId: fiscal.documentId }).where(eq(dteMessages.id, prior.id)).returning())[0];
    const [message] = await tx.insert(dteMessages).values({ mailboxId: mailbox.id, categoryId: category.id, subject: `${fiscal.documentKind} — ${order.orderNumber}`, body: "Documento disponibilizado durante ação fiscal. Avisos externos não equivalem automaticamente à leitura ou ciência.", processId: order.processId, documentId: fiscal.documentId, idempotencyKey: key, deadlineAt: new Date(Date.now() + category.defaultDeadlineDays * 86400000), createdByUsuarioId: actor.usuarioId }).returning();
    await tx.insert(dteMessageEvents).values({ messageId: message.id, eventType: "DISPONIBILIZADA", description: "Documento fiscal disponibilizado no DTE.", actorUsuarioId: actor.usuarioId });
    await audit(tx, actor, "FISCAL_DOCUMENT_COMMUNICATED", "DteMessage", message.id);
    return message;
  });
}

export async function runFiscalMeshes(connection: DatabaseConnection, competence: string, actor?: Actor) {
  competenceDate(competence);
  const subjects = await connection.db.select({ id: taxpayers.id, document: sql<string>`coalesce(${companies.cnpj},${people.cpf},'')` }).from(taxpayers).leftJoin(companies, eq(companies.id, taxpayers.companyId)).leftJoin(people, eq(people.id, taxpayers.personId)).where(eq(taxpayers.status, "Ativo"));
  let processed = 0;
  for (const taxpayer of subjects) {
    const changed = await withDatabaseTransaction(connection, async tx => {
      const source = await readFiscalMeshSources(tx, taxpayer.id, taxpayer.document, competence);
      const nfse = new Decimal(source.nfse ?? 0), declared = new Decimal(source.declared ?? 0), desif = new Decimal(source.desif ?? 0), card = new Decimal(source.card ?? 0), rate = new Decimal(source.rate ?? 3);
      const observed = Decimal.max(nfse, desif, card);
      const classification = classifyFiscalFinding({ observed, declared, rate });
      if (classification.difference.isZero() && !source.hasSimple && !observed.gt(0)) return false;
      const causes: string[] = [];
      if (nfse.gt(declared)) causes.push("NFS-e superior à declaração do Simples");
      if (card.gt(declared)) causes.push("Movimentação de cartões/bancos superior à declaração");
      if (desif.gt(declared)) causes.push("Receita DES-IF superior à declaração comparável");
      if (!source.hasRegistration) causes.push("Cadastro mercantil sem inscrição ativa");
      const values = { status: classification.status, nfseDecimal: nfse, simplesDeclaredDecimal: declared, cardDecimal: card, desifDecimal: desif, comparableBaseDecimal: classification.observed, differenceDecimal: classification.difference, rate, potentialTaxDecimal: classification.potentialTax, causes, sourceSnapshot: { sources: ["NFSE", "SIMPLES", "CARTOES_BANCOS", "MERCANTIL", "DESIF"], classification: "INDICIO_NAO_FRAUDE" } };
      const [finding] = await tx.insert(fiscalFindings).values({ taxpayerId: taxpayer.id, competence, findingType: "MALHA_ISS_INTEGRADA", ...values }).onConflictDoUpdate({ target: [fiscalFindings.taxpayerId, fiscalFindings.competence, fiscalFindings.findingType], set: { ...values, lastProcessedAt: new Date() } }).returning();
      await audit(tx, actor, "FISCAL_MESH_PROCESSED", "FiscalMeshFinding", finding.id);
      return true;
    });
    if (changed) processed++;
  }
  return { processed };
}
export async function createOrderFromMesh(connection: DatabaseConnection, actor: Actor, input: { findingId: string; responsibleEmployeeId: string }) {
  return withDatabaseTransaction(connection, async tx => {
    const finding = required((await tx.select().from(fiscalFindings).where(eq(fiscalFindings.id, input.findingId)).for("update"))[0], "Indício de malha não encontrado.");
    const [existing] = await tx.select({ order: fiscalOrders }).from(fiscalFindingOrders).innerJoin(fiscalOrders, eq(fiscalOrders.id, fiscalFindingOrders.orderId)).where(eq(fiscalFindingOrders.findingId, finding.id)).limit(1);
    if (existing) return existing.order;
    const order = await createStandaloneOrderInTransaction(tx, actor, { originType: "AVULSA", taxpayerId: finding.taxpayerId, responsibleEmployeeId: input.responsibleEmployeeId, reason: `Analisar indício ${finding.findingType} da competência ${finding.competence}; não há declaração automática de fraude.` });
    await tx.insert(fiscalFindingOrders).values({ findingId: finding.id, orderId: order.id });
    await tx.update(fiscalFindings).set({ status: "EM_ANALISE" }).where(eq(fiscalFindings.id, finding.id));
    return order;
  });
}
export async function saveFiscalTemplate(connection: DatabaseConnection, actor: Actor, input: { code: string; name: string; documentKind: string; bodyTemplate: string }) {
  return withDatabaseTransaction(connection, async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`FISCAL:TEMPLATE:${input.code}`}))`);
    const [latest] = await tx.select().from(fiscalTemplates).where(eq(fiscalTemplates.code, input.code)).orderBy(desc(fiscalTemplates.version)).limit(1);
    const [template] = await tx.insert(fiscalTemplates).values({ ...input, version: (latest?.version ?? 0) + 1, requiredFields: ["orderNumber", "subject", "inspector", "issuedAt"], effectiveFrom: new Date(), createdByUsuarioId: actor.usuarioId }).returning();
    await audit(tx, actor, "FISCAL_TEMPLATE_SAVED", "FiscalDocumentTemplate", template.id);
    return template;
  });
}
export async function saveFiscalPenaltyRule(connection: DatabaseConnection, input: { code: string; name: string; obligationType: string; penaltyRate: number; discountRate: number; interestRate: number; correctionRate: number; discountDeadlineDays?: number; legalBasis: string }, actor?: Actor) {
  return withDatabaseTransaction(connection, async tx => {
    const [rule] = await tx.insert(fiscalPenaltyRules).values({ ...input, penaltyRate: new Decimal(input.penaltyRate), discountRate: new Decimal(input.discountRate), interestRate: new Decimal(input.interestRate), correctionRate: new Decimal(input.correctionRate), discountDeadlineDays: input.discountDeadlineDays ?? null, effectiveFrom: new Date() }).returning();
    await audit(tx, actor, "FISCAL_PENALTY_RULE_SAVED", "FiscalPenaltyRule", rule.id);
    return rule;
  });
}

async function configureProductivityInTransaction(tx: DatabaseTransaction, employeeId: string) {
  const effectiveFrom = new Date("2026-01-01T12:00:00.000Z");
  const [five] = await tx.insert(fiscalTaskRules).values({ code: "TAREFA_5", name: "Tarefa fiscal padrão", points: new Decimal(5), valueRanges: [{ min: 0, max: 100, points: 5 }, { min: 100.01, max: null, points: 8 }], effectiveFrom }).onConflictDoUpdate({ target: [fiscalTaskRules.code, fiscalTaskRules.effectiveFrom], set: { active: true } }).returning();
  const [eight] = await tx.insert(fiscalTaskRules).values({ code: "TAREFA_8", name: "Tarefa fiscal complexa", points: new Decimal(8), effectiveFrom }).onConflictDoUpdate({ target: [fiscalTaskRules.code, fiscalTaskRules.effectiveFrom], set: { active: true } }).returning();
  const [config] = await tx.insert(fiscalProductivityConfigs).values({ employeeId, pointValueDecimal: new Decimal(10), maxAmountDecimal: new Decimal(150), maxPoints: new Decimal(18), salaryBaseReferenceDecimal: new Decimal(0), fixedComponentDecimal: new Decimal(0), variablePolicy: { formula: "min(pontos x valor_ponto, teto) + ajuste", executesPayroll: false }, vacationPolicy: { mode: "EXPLICIT_CONFIGURATION_REQUIRED", demoFactor: 1 }, effectiveFrom }).onConflictDoUpdate({ target: [fiscalProductivityConfigs.employeeId, fiscalProductivityConfigs.effectiveFrom], set: { pointValueDecimal: new Decimal(10), maxAmountDecimal: new Decimal(150), active: true } }).returning();
  return { five, eight, config };
}
export async function configureProductivityDemo(connection: DatabaseConnection, employeeId: string) {
  return withDatabaseTransaction(connection, tx => configureProductivityInTransaction(tx, employeeId));
}
export async function createProductivityScenario(connection: DatabaseConnection, actor: Actor, input: { employeeId: string; competence: string; adjustment?: number }) {
  competenceDate(input.competence);
  return withDatabaseTransaction(connection, async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`FISCAL:PRODUCTIVITY:${input.employeeId}:${input.competence}`}))`);
    const { five, eight, config } = await configureProductivityInTransaction(tx, input.employeeId);
    const tasks = [{ rule: five, key: "A", label: "Análise fiscal A", points: 5 }, { rule: five, key: "B", label: "Análise fiscal B", points: 5 }, { rule: eight, key: "C", label: "Ação fiscal complexa", points: 8 }];
    for (const task of tasks) await tx.insert(fiscalProductivityEntries).values({ employeeId: input.employeeId, competence: input.competence, taskRuleId: task.rule.id, sourceKey: `DEMO-S7:${input.employeeId}:${input.competence}:${task.key}`, taskLabel: task.label, points: new Decimal(task.points), status: "EXECUTADA", executedAt: new Date() }).onConflictDoUpdate({ target: fiscalProductivityEntries.sourceKey, set: { status: "EXECUTADA", points: new Decimal(task.points) } });
    const entries = await tx.select().from(fiscalProductivityEntries).where(and(eq(fiscalProductivityEntries.employeeId, input.employeeId), eq(fiscalProductivityEntries.competence, input.competence), eq(fiscalProductivityEntries.status, "EXECUTADA")));
    const adjustment = input.adjustment ?? 0;
    const calculation = calculateFiscalProductivity({ taskPoints: entries.map(row => row.points), pointValue: config.pointValueDecimal, cap: config.maxAmountDecimal, adjustment });
    const vacation = await tx.execute<{ status: string }>(sql`SELECT status FROM "Vacation" WHERE "employeeId"=${input.employeeId} AND "enjoymentStart"<=${new Date(`${input.competence}-28T23:59:59.999Z`)} AND "enjoymentEnd">=${competenceDate(input.competence)} LIMIT 1`);
    const values = { pointsDecimal: calculation.points, pointValueDecimal: calculation.pointValue, grossAmountDecimal: calculation.gross, cappedAmountDecimal: calculation.capped, excessAmountDecimal: calculation.excess, adjustmentDecimal: calculation.adjustment, finalAmountDecimal: calculation.result, calculationSnapshot: asJson({ ...Object.fromEntries(Object.entries(calculation).map(([key, value]) => [key, value.toFixed(2)])), taskIds: entries.map(row => row.id), vacation: vacation.rows[0] ? { status: vacation.rows[0].status, policy: config.vacationPolicy } : { status: "SEM_FERIAS_NO_PERIODO" }, executesPayroll: false }) };
    const [period] = await tx.insert(fiscalProductivityPeriods).values({ employeeId: input.employeeId, competence: input.competence, ...values }).onConflictDoUpdate({ target: [fiscalProductivityPeriods.employeeId, fiscalProductivityPeriods.competence], set: { ...values, status: "APURADA" } }).returning();
    await tx.insert(fiscalProductivityLedger).values({ periodId: period.id, movementType: "APURACAO", amountDecimal: calculation.capped, description: "Produtividade apurada e limitada; não enviada à folha.", idempotencyKey: `PROD:${period.id}:APURACAO`, authorizedByUsuarioId: actor.usuarioId }).onConflictDoUpdate({ target: fiscalProductivityLedger.idempotencyKey, set: { amountDecimal: calculation.capped } });
    if (adjustment !== 0) await tx.insert(fiscalProductivityLedger).values({ periodId: period.id, movementType: "AJUSTE_AUTORIZADO", amountDecimal: calculation.adjustment, description: "Ajuste autorizado da conta-corrente de produtividade.", idempotencyKey: `PROD:${period.id}:AJUSTE`, authorizedByUsuarioId: actor.usuarioId }).onConflictDoUpdate({ target: fiscalProductivityLedger.idempotencyKey, set: { amountDecimal: calculation.adjustment } });
    await audit(tx, actor, "FISCAL_PRODUCTIVITY_CALCULATED", "FiscalProductivityPeriod", period.id);
    return period;
  });
}
export async function confirmProductivityPeriod(connection: DatabaseConnection, id: string, actor?: Actor) {
  return withDatabaseTransaction(connection, async tx => {
    const period = required((await tx.select().from(fiscalProductivityPeriods).where(eq(fiscalProductivityPeriods.id, id)).for("update"))[0], "Apuração não encontrada.");
    const [updated] = await tx.update(fiscalProductivityPeriods).set({ status: "CONFIRMADA_SEM_FOLHA", confirmedAt: period.confirmedAt ?? new Date() }).where(eq(fiscalProductivityPeriods.id, id)).returning();
    await audit(tx, actor, "FISCAL_PRODUCTIVITY_CONFIRMED", "FiscalProductivityPeriod", id);
    return updated;
  });
}

export { pointsForValue } from "./s7-engine";
