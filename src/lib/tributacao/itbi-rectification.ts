import { randomUUID } from "node:crypto";
import { attributeItbiHistory } from "./itbi-history";
import { and, desc, eq, notInArray } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction } from "@/db/transaction";
import { documents } from "@/db/schema/registry";
import { taxPayments } from "@/db/schema/tax-accounting";
import { taxAssessments, taxGuides } from "@/db/schema/taxation-core";
import { taxRegistryEntries } from "@/db/schema/taxation-registry";
import { itbiDeclarations, itbiParties } from "@/db/schema/tax-itbi";
import { appendItbiEvent, auditItbi, insertItbiRegistryEntry, itbiJson, itbiRegistryPosition, latestItbiRegistryEntry, lockItbiRecord, nextItbiDocumentSequence, readConfirmedItbiPayments, readItbiAssessment, readItbiDeclaration, readItbiParties, readItbiProcessDocuments, readItbiRegistryEntries, requireItbiRecord, updateItbiDeclaration } from "@/db/repositories/tax-itbi/records";
import { z } from "zod";
import type { TaxActor } from "./index";
import { calculateItbi } from "./s3-engine";
import { assertInternalItbiProcessAccess } from "./itbi-process-channel";
import { reviseTaxAssessmentInTransaction } from "./s2-service";
import { generateItbiDocumentInTransaction } from "./s3-service";
import { linkItbiPropertyAttachments } from "./itbi-attachments";
import { taxAssessmentCompensatedValue, taxScopeSnapshot } from "./scope";

const positiveMoney = z.string().regex(/^\d{1,14}(?:\.\d{1,2})?$/).refine(value => new Decimal(value).gt(0), "Informe valor positivo.");
export async function rectifyTransferredItbi(connection: DatabaseConnection, actor: TaxActor, raw: {
  declarationId: string; expectedUpdatedAt: string; declaredValue: string; assessedPropertyValue: string;
  registryOffice: string; dueDate: string; reason: string; legalBasis: string; documentIds: string[];
}) {
  const input = z.object({ declarationId: z.string().min(1), expectedUpdatedAt: z.iso.datetime(), declaredValue: positiveMoney, assessedPropertyValue: positiveMoney, registryOffice: z.string().trim().min(1).max(240), dueDate: z.iso.date(), reason: z.string().trim().min(1).max(8000), legalBasis: z.string().trim().min(1).max(4000), documentIds: z.array(z.string().min(1)).min(1).max(50) }).parse(raw);
  return withDatabaseTransaction(connection, async tx => {
    await attributeItbiHistory(tx, actor);
    const origin = await readItbiDeclaration(tx, input.declarationId);
    if (!origin.assessmentId) throw new Error("Retificação exige o crédito original da transmissão.");
    await lockItbiRecord(tx, "TaxAssessment", origin.assessmentId);
    await lockItbiRecord(tx, "ItbiDeclaration", origin.id);
    const { declaration, scope } = await assertInternalItbiProcessAccess(tx, actor, origin.id);
    if (declaration.assessmentId !== origin.assessmentId || declaration.updatedAt.toISOString() !== input.expectedUpdatedAt) throw new Error("ITBI alterado. Recarregue antes de retificar.");
    if (!declaration.cadastralUpdatedAt || !["APROVADA", "DAM_EMITIDO", "DOCUMENTO_EMITIDO"].includes(declaration.status)) throw new Error("A retificação exige ITBI aprovado com transferência fiscal realizada.");
    const assessment = await readItbiAssessment(tx, origin.assessmentId);
    if (["Cancelado", "Extinto", "Suspenso", "Dívida Ativa"].includes(assessment.status)) throw new Error("Crédito indisponível para retificação.");
    const links = declaration.processId ? await readItbiProcessDocuments(tx, declaration.processId, input.documentIds) : [];
    if (input.documentIds.some(id => !links.some(link => link.documentId === id))) throw new Error("Vincule os documentos da retificação ao processo de origem.");
    await linkItbiPropertyAttachments(tx, actor, declaration.id, input.documentIds);
    const parties = await readItbiParties(tx, declaration.id, true);
    const buyers = parties.filter(row => row.role === "ADQUIRENTE");
    const calculation = calculateItbi({ propertyValue: input.assessedPropertyValue, transmittedFractionPercent: declaration.transmittedFraction, ratePercent: declaration.appliedRate, buyerSharesPercent: buyers.map(row => row.participationPercent ?? 0) });
    const payments = await readConfirmedItbiPayments(tx, assessment.id);
    if (payments.some(row => !row.amountPaidDecimal) || !assessment.finalValueDecimal) throw new Error("Concilie os valores Decimal antes da retificação.");
    const paid = payments.reduce((sum, row) => sum.plus(row.amountPaidDecimal!), new Decimal(0));
    const compensated = await taxAssessmentCompensatedValue(tx, assessment.id);
    if (calculation.taxAmount.lt(paid.plus(compensated))) throw new Error("O valor retificado é inferior aos pagamentos/compensações. Formalize a restituição ou revisão do crédito com a destinação do excesso antes de retificar.");
    const guideRows = await tx.select().from(taxGuides).where(and(eq(taxGuides.assessmentId, assessment.id), notInArray(taxGuides.status, ["Cancelada", "Paga"])));
    const openGuides = [];
    for (const row of guideRows) openGuides.push({ ...row, payments: await tx.select({ id: taxPayments.id }).from(taxPayments).where(and(eq(taxPayments.guideId, row.id), eq(taxPayments.status, "Confirmado"))) });
    if (openGuides.some(row => row.payments.length)) throw new Error("Concilie as guias parcialmente pagas antes da retificação.");
    for (const guide of openGuides) requireItbiRecord((await tx.update(taxGuides).set({ status: "Cancelada" }).where(eq(taxGuides.id, guide.id)).returning({ id: taxGuides.id }))[0]);
    const revision = await reviseTaxAssessmentInTransaction(tx, actor, { assessmentId: assessment.id, taxableBase: calculation.taxableBase.toFixed(2), imposedValue: calculation.taxAmount.toFixed(2), reason: `${input.reason}\nFundamento legal: ${input.legalBasis}`, processId: declaration.processId ?? undefined, documentId: input.documentIds[0], idempotencyKey: `ITBI_RECTIFICATION:${declaration.id}` });
    const id = randomUUID(); const year = new Date().getUTCFullYear();
    const sequence = await nextItbiDocumentSequence(tx, year, "ITBI_DECLARATION");
    const snapshot = taxScopeSnapshot(declaration.calculationSnapshot);
    const memory = { ...snapshot, ...scope, declaredPropertyValue: new Decimal(input.declaredValue).toFixed(2), propertyValue: calculation.propertyValue.toFixed(2), taxableBase: calculation.taxableBase.toFixed(2), taxAmount: calculation.taxAmount.toFixed(2), dueDate: input.dueDate, rectifiedDeclarationId: declaration.id, rectificationLegalBasis: input.legalBasis, revisionEntryId: revision.id, previousValuationMemory: snapshot.valuationMemory ?? null, valuationMemory: { source: "DECISAO_RETIFICADORA", propertyValue: calculation.propertyValue.toFixed(2), legalBasis: input.legalBasis, documentIds: input.documentIds }, allocations: calculation.allocations.map((row, index) => ({ taxpayerId: buyers[index].taxpayerId, sharePercent: row.sharePercent.toString(), transmittedValue: row.transmittedValue.toFixed(2), taxAmount: row.taxAmount.toFixed(2) })) };
    await tx.insert(itbiDeclarations).values({
      id, declarationNumber: `ITBI-${year}-${String(sequence.currentValue).padStart(7, "0")}`, status: "APROVADA", transactionTypeId: declaration.transactionTypeId, realEstateId: declaration.realEstateId, processId: declaration.processId, protocolNumber: declaration.protocolNumber,
      registryOffice: input.registryOffice, transmissionScope: declaration.transmissionScope, transmittedFraction: declaration.transmittedFraction, declaredPropertyValue: new Decimal(input.declaredValue),
      taxableBase: calculation.taxableBase, appliedRate: declaration.appliedRate, taxAmount: calculation.taxAmount, calculationSnapshot: itbiJson(memory),
      blockingTaxDebt: declaration.blockingTaxDebt, nonTaxDebtAmount: declaration.nonTaxDebtAmount, isLeasehold: declaration.isLeasehold, leaseholdDetails: declaration.leaseholdDetails,
      cadastralUpdateMode: declaration.cadastralUpdateMode, cadastralUpdatedAt: declaration.cadastralUpdatedAt, assessmentId: assessment.id, analyzedAt: new Date(), analysisNotes: input.reason, createdByUsuarioId: actor.usuarioId,
    });
    if (parties.length) await tx.insert(itbiParties).values(parties.map(row => ({ declarationId: id, taxpayerId: row.taxpayerId, role: row.role, participationPercent: row.participationPercent, liabilityType: row.liabilityType, sortOrder: row.sortOrder })));
    await appendItbiEvent(tx, id, { eventType: "ITBI_RETIFICADOR_CRIADO", description: input.reason, actorUsuarioId: actor.usuarioId, payload: { originalDeclarationId: declaration.id, assessmentId: assessment.id, revisionEntryId: revision.id, paid: paid.toFixed(2), compensated: compensated.toFixed(2), documentIds: input.documentIds } });
    const correspondence = await latestItbiRegistryEntry(tx, "ITBI_DECLARATION", declaration.id, "ITBI_CORRESPONDENCE");
    if (correspondence) await insertItbiRegistryEntry(tx, { entityType: "ITBI_DECLARATION", entityId: id, category: "ITBI_CORRESPONDENCE", version: 1, title: correspondence.title, processId: declaration.processId, actorUsuarioId: actor.usuarioId, data: { ...taxScopeSnapshot(correspondence.data), ...scope, declarationId: id, expectedVersion: 0, previousId: null, inheritedFromId: correspondence.id, reason: "Correspondência preservada na retificação do ITBI." } });
    const formEntries = await readItbiRegistryEntries(tx, itbiRegistryPosition("ITBI_DECLARATION", declaration.id, "TYPED_FISCAL_RECORD"), [desc(taxRegistryEntries.version)]);
    const latestForms = new Map<string, typeof formEntries[number]>();
    for (const form of formEntries) if (!latestForms.has(form.title)) latestForms.set(form.title, form);
    for (const form of latestForms.values()) {
      const frozen = taxScopeSnapshot(form.data);
      if (frozen.governmentEntityId !== scope.governmentEntityId || frozen.budgetUnitId !== scope.budgetUnitId || frozen.kind !== "FORMULARIO_ITBI") throw new Error("Formulário de origem não conciliado para a retificação.");
      await insertItbiRegistryEntry(tx, { entityType: "ITBI_DECLARATION", entityId: id, category: "TYPED_FISCAL_RECORD", version: 1, title: form.title, status: form.status, processId: declaration.processId, documentId: form.documentId, actorUsuarioId: actor.usuarioId, source: "RETIFICACAO_ITBI", data: { ...frozen, previousId: null, inheritedFromId: form.id, inheritedFromDeclarationId: declaration.id } });
    }
    const remaining = calculation.taxAmount.minus(paid).minus(compensated); let guideId: string | null = null;
    if (remaining.gt(0)) {
      const guideSequence = await nextItbiDocumentSequence(tx, assessment.year, "GUIDE");
      const guide = requireItbiRecord((await tx.insert(taxGuides).values({ assessmentId: assessment.id, guideNumber: `DAM-${assessment.year}-${String(guideSequence.currentValue).padStart(7, "0")}`, totalValue: Number(remaining), totalValueDecimal: remaining, dueDate: new Date(`${input.dueDate}T23:59:59.999Z`), status: "Emitida", calculationSnapshot: { ...scope, itbiDeclarationId: id, rectifiedDeclarationId: declaration.id, revisionEntryId: revision.id, paymentMode: "RECTIFICATION", amount: remaining.toFixed(2), paidBeforeRectification: paid.toFixed(2), effect: "EMISSAO_SEM_BAIXA" } }).returning())[0]);
      guideId = guide.id;
      await updateItbiDeclaration(tx, id, { guideId, status: "DAM_EMITIDO" });
      requireItbiRecord((await tx.update(taxAssessments).set({ status: "Emitido" }).where(eq(taxAssessments.id, assessment.id)).returning({ id: taxAssessments.id }))[0]);
    }
    const revisedAssessment = await readItbiAssessment(tx, assessment.id);
    requireItbiRecord((await tx.update(taxAssessments).set({ calculationSnapshot: itbiJson({ ...taxScopeSnapshot(revisedAssessment.calculationSnapshot), ...scope, itbiDeclarationId: id, rectifiedDeclarationId: declaration.id, currentValue: calculation.taxAmount.toFixed(2), lastRevisionEntryId: revision.id }) }).where(eq(taxAssessments.id, assessment.id)).returning({ id: taxAssessments.id }))[0]);
    const document = await generateItbiDocumentInTransaction(tx, actor, id);
    await linkItbiPropertyAttachments(tx, actor, id, input.documentIds);
    if (declaration.documentId) requireItbiRecord((await tx.update(documents).set({ status: "Revogado" }).where(eq(documents.id, declaration.documentId)).returning({ id: documents.id }))[0]);
    await updateItbiDeclaration(tx, declaration.id, { status: "RETIFICADA" }, { eventType: "ITBI_RETIFICADO", description: input.reason, actorUsuarioId: actor.usuarioId, payload: { rectifyingDeclarationId: id, revisionEntryId: revision.id, guideId, documentId: document.id } });
    await insertItbiRegistryEntry(tx, { entityType: "ITBI_DECLARATION", entityId: declaration.id, category: "ITBI_RECTIFICATION", title: "Retificação de ITBI transferido", actorUsuarioId: actor.usuarioId, processId: declaration.processId, documentId: document.id, data: { ...scope, rectifyingDeclarationId: id, assessmentId: assessment.id, guideId, revisionEntryId: revision.id, reason: input.reason, legalBasis: input.legalBasis, before: declaration.calculationSnapshot, after: memory } });
    await auditItbi(tx, { action: "RECTIFY_TRANSFERRED_ITBI", entityType: "ItbiDeclaration", entityId: declaration.id, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, payload: { ...scope, rectifyingDeclarationId: id, revisionEntryId: revision.id, guideId, documentId: document.id, reason: input.reason } });
    return { declarationId: id, guideId, documentId: document.id };
  }, { isolationLevel: "serializable", timeoutMs: 120000 });
}
