import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import type { DatabaseExecutor, DatabaseTransaction } from "@/db/transaction";
import { constructionCases, constructionCaseProperties, constructionConfigVersions } from "@/db/schema/construction-core";
import { constructionFees } from "@/db/schema/construction-taxation";
import { constructionDocumentRequests, constructionIssuedDocuments } from "@/db/schema/construction-documents";
import { taxAssessments, taxGuides } from "@/db/schema/taxation-core";
import { taxPayments } from "@/db/schema/tax-accounting";
import { taxRegistryEntries } from "@/db/schema/taxation-registry";
import { confirmedConstructionBalance, type ConstructionFeeKind } from "./construction-tax-engine";

export async function getConstructionDocumentFeeCycle(db: DatabaseExecutor, caseId: string, documentRequestId: string) {
  if (!documentRequestId) throw new Error("Correção/renovação exige pedido documental para identificar o ciclo tributário.");
  const [request] = await db.select().from(constructionDocumentRequests).where(eq(constructionDocumentRequests.id, documentRequestId)).limit(1);
  if (!request || request.caseId !== caseId || request.status !== "PENDING" || !["CORRECTION", "RENEWAL"].includes(request.type)) throw new Error("Pedido documental pendente indisponível para este ciclo tributário.");
  const [source] = await db.select({ id: constructionIssuedDocuments.id, kind: constructionIssuedDocuments.kind }).from(constructionIssuedDocuments).where(and(eq(constructionIssuedDocuments.id, request.sourceIssuedDocumentId), eq(constructionIssuedDocuments.caseId, caseId), eq(constructionIssuedDocuments.status, "PUBLISHED"))).limit(1);
  if (!source || (request.type === "RENEWAL" && source.kind !== "PERMIT")) throw new Error("Ciclo exige documento original publicado; renovação exige alvará.");
  return { kind: request.type as "CORRECTION" | "RENEWAL", cycleKey: `DOCUMENT_REQUEST:${request.id}`, documentRequestId: request.id, sourceIssuedDocumentId: source.id, revision: 0 };
}

async function assessmentGuides(db: DatabaseExecutor, ids: string[], excludeCancelled: boolean) {
  const guides = ids.length ? await db.select().from(taxGuides).where(and(inArray(taxGuides.assessmentId, ids), excludeCancelled ? ne(taxGuides.status, "Cancelada") : undefined)) : [];
  const payments = guides.length ? await db.select().from(taxPayments).where(and(inArray(taxPayments.guideId, guides.map(guide => guide.id)), eq(taxPayments.status, "Confirmado"))) : [];
  return guides.map(guide => ({ ...guide, payments: payments.filter(payment => payment.guideId === guide.id) }));
}

export async function getConstructionPropertyDebts(db: DatabaseExecutor, caseId: string) {
  const properties = await db.select({ realEstateId: constructionCaseProperties.realEstateId }).from(constructionCaseProperties).where(eq(constructionCaseProperties.caseId, caseId));
  const propertyIds = properties.map(property => property.realEstateId);
  const assessments = propertyIds.length ? await db.select().from(taxAssessments).where(and(inArray(taxAssessments.realEstateId, propertyIds), ne(taxAssessments.status, "Cancelado"))) : [];
  const guides = await assessmentGuides(db, assessments.map(assessment => assessment.id), true);
  const debts = assessments.map(assessment => ({ assessmentId: assessment.id, realEstateId: assessment.realEstateId!, year: assessment.year, balance: confirmedConstructionBalance(assessment.finalValueDecimal ?? assessment.originalValueDecimal ?? assessment.originalValue, guides.filter(guide => guide.assessmentId === assessment.id).flatMap(guide => guide.payments)).toFixed(2) })).filter(debt => new Decimal(debt.balance).gt(0));
  const registry = propertyIds.length ? await db.select({ id: taxRegistryEntries.id, entityId: taxRegistryEntries.entityId, data: taxRegistryEntries.data }).from(taxRegistryEntries).where(and(eq(taxRegistryEntries.entityType, "REAL_ESTATE"), inArray(taxRegistryEntries.entityId, propertyIds), eq(taxRegistryEntries.category, "NON_TAX_PROPERTY_DEBT"), inArray(taxRegistryEntries.status, ["ATIVO", "PENDENTE"]))) : [];
  const nonTaxDebts = registry.map(entry => {
    const data = entry.data && typeof entry.data === "object" && !Array.isArray(entry.data) ? entry.data : {};
    const amount = new Decimal(String(data.amount ?? 0));
    if (!amount.isFinite() || amount.lt(0)) throw new Error("Cadastro de débito não tributário contém valor inválido. Regularize na Tributação.");
    return { registryEntryId: entry.id, realEstateId: entry.entityId, balance: amount.toFixed(2) };
  }).filter(debt => new Decimal(debt.balance).gt(0));
  const taxTotal = debts.reduce((sum, debt) => sum.plus(debt.balance), new Decimal(0));
  const nonTaxTotal = nonTaxDebts.reduce((sum, debt) => sum.plus(debt.balance), new Decimal(0));
  return { debts, nonTaxDebts, taxTotal: taxTotal.toFixed(2), nonTaxTotal: nonTaxTotal.toFixed(2), total: taxTotal.plus(nonTaxTotal).toFixed(2), checkedAt: new Date().toISOString() };
}

export async function assertConstructionFeesSatisfied(tx: DatabaseTransaction, caseId: string, kind: ConstructionFeeKind | string, documentRequestId = "") {
  await tx.execute(sql`SELECT "id" FROM "ConstructionCase" WHERE "id"=${caseId} FOR UPDATE`);
  const cycle = ["CORRECTION", "RENEWAL"].includes(kind) ? await getConstructionDocumentFeeCycle(tx, caseId, documentRequestId) : null;
  if (cycle && cycle.kind !== kind) throw new Error("Finalidade da taxa não corresponde ao pedido documental.");
  if (!cycle && documentRequestId) throw new Error("Utilize o gate de correção/renovação para o pedido documental.");
  // Same lock order as tax payment/cancellation; the evidence remains valid
  // until the document/review/lifecycle operation commits this transaction.
  await tx.execute(sql`SELECT g."id" FROM "TaxGuide" g JOIN "TaxAssessment" a ON a."id"=g."assessmentId" JOIN "ConstructionFee" f ON f."assessmentId"=a."id" WHERE f."caseId"=${caseId} ORDER BY g."id" FOR UPDATE OF g, a`);
  const [record] = await tx.select({ revisionCount: constructionCases.revisionCount, configuration: { freeRevisions: constructionConfigVersions.freeRevisions, checkPropertyDebts: constructionConfigVersions.checkPropertyDebts } }).from(constructionCases).innerJoin(constructionConfigVersions, eq(constructionConfigVersions.id, constructionCases.configurationId)).where(eq(constructionCases.id, caseId)).limit(1);
  if (!record) throw new Error("Solicitação indisponível.");
  const fees = await tx.select().from(constructionFees).where(eq(constructionFees.caseId, caseId));
  const assessmentIds = fees.flatMap(fee => fee.assessmentId ? [fee.assessmentId] : []);
  const assessments = assessmentIds.length ? await tx.select().from(taxAssessments).where(inArray(taxAssessments.id, assessmentIds)) : [];
  const allGuides = await assessmentGuides(tx, assessmentIds, false);
  const required = kind === "REANALYSIS" ? [] : [{ kind, revision: 0, cycleKey: cycle?.cycleKey || "INITIAL" }];
  for (let revision = record.configuration.freeRevisions + 1; revision <= record.revisionCount; revision++) required.push({ kind: "REANALYSIS", revision, cycleKey: "INITIAL" });
  for (const item of required) {
    const fee = fees.find(fee => fee.kind === item.kind && fee.revision === item.revision && fee.cycleKey === item.cycleKey);
    if (!fee) throw new Error(`Taxa ${item.kind} (revisão ${item.revision}) precisa ser lançada ou formalmente isenta.`);
    if (fee.exemptionReason) continue;
    const assessment = assessments.find(assessment => assessment.id === fee.assessmentId);
    const guides = allGuides.filter(guide => guide.assessmentId === assessment?.id && guide.status !== "Cancelada");
    const constituted = assessment?.finalValueDecimal ?? assessment?.originalValueDecimal ?? assessment?.originalValue ?? fee.amount;
    const requiredTotal = Decimal.max(fee.amount, constituted, ...guides.map(guide => guide.totalValueDecimal ?? guide.totalValue ?? fee.amount));
    if (!assessment || assessment.status === "Cancelado" || !guides.length || !confirmedConstructionBalance(requiredTotal, guides.flatMap(guide => guide.payments)).isZero()) throw new Error(`Taxa ${item.kind} (revisão ${item.revision}) exige guia válida integralmente paga ou isenção fundamentada.`);
  }
  const propertyDebts = kind === "HABITE_SE" && record.configuration.checkPropertyDebts ? await getConstructionPropertyDebts(tx, caseId) : null;
  if (propertyDebts && new Decimal(propertyDebts.total).gt(0)) throw new Error(`Imóveis possuem R$ ${propertyDebts.total} em débitos. Regularize na Tributação antes da emissão.`);
  return { checkedAt: new Date().toISOString(), required, propertyDebts, cycle };
}

export async function assertConstructionDocumentChangeFeesSatisfied(tx: DatabaseTransaction, caseId: string, documentRequestId: string) {
  const cycle = await getConstructionDocumentFeeCycle(tx, caseId, documentRequestId);
  return assertConstructionFeesSatisfied(tx, caseId, cycle.kind, documentRequestId);
}
