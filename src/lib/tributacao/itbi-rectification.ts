import { randomUUID } from "node:crypto";
import { attributeItbiHistory } from "./itbi-history";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { TaxActor } from "./index";
import { calculateItbi } from "./s3-engine";
import { assertInternalItbiProcessAccess } from "./itbi-process-channel";
import { reviseTaxAssessmentInTransaction } from "./s2-service";
import { generateItbiDocumentInTransaction } from "./s3-service";
import { linkItbiPropertyAttachments } from "./itbi-attachments";
import { taxAssessmentCompensatedValue, taxScopeSnapshot } from "./scope";

const positiveMoney = z.string().regex(/^\d{1,14}(?:\.\d{1,2})?$/).refine(value => new Prisma.Decimal(value).gt(0), "Informe valor positivo.");
export async function rectifyTransferredItbi(db: PrismaClient, actor: TaxActor, raw: {
  declarationId: string; expectedUpdatedAt: string; declaredValue: string; assessedPropertyValue: string;
  registryOffice: string; dueDate: string; reason: string; legalBasis: string; documentIds: string[];
}) {
  const input = z.object({ declarationId: z.string().min(1), expectedUpdatedAt: z.iso.datetime(), declaredValue: positiveMoney, assessedPropertyValue: positiveMoney, registryOffice: z.string().trim().min(1).max(240), dueDate: z.iso.date(), reason: z.string().trim().min(1).max(8000), legalBasis: z.string().trim().min(1).max(4000), documentIds: z.array(z.string().min(1)).min(1).max(50) }).parse(raw);
  return db.$transaction(async tx => {
    await attributeItbiHistory(tx, actor);
    const origin = await tx.itbiDeclaration.findUniqueOrThrow({ where: { id: input.declarationId } });
    if (!origin.assessmentId) throw new Error("Retificação exige o crédito original da transmissão.");
    await tx.$queryRaw`SELECT id FROM "TaxAssessment" WHERE id=${origin.assessmentId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "ItbiDeclaration" WHERE id=${origin.id} FOR UPDATE`;
    const { declaration, scope } = await assertInternalItbiProcessAccess(tx, actor, origin.id);
    if (declaration.assessmentId !== origin.assessmentId || declaration.updatedAt.toISOString() !== input.expectedUpdatedAt) throw new Error("ITBI alterado. Recarregue antes de retificar.");
    if (!declaration.cadastralUpdatedAt || !["APROVADA", "DAM_EMITIDO", "DOCUMENTO_EMITIDO"].includes(declaration.status)) throw new Error("A retificação exige ITBI aprovado com transferência fiscal realizada.");
    const assessment = await tx.taxAssessment.findUniqueOrThrow({ where: { id: origin.assessmentId } });
    if (["Cancelado", "Extinto", "Suspenso", "Dívida Ativa"].includes(assessment.status)) throw new Error("Crédito indisponível para retificação.");
    const links = declaration.processId ? await tx.processDocument.findMany({ where: { processId: declaration.processId, documentId: { in: input.documentIds } }, select: { documentId: true } }) : [];
    if (input.documentIds.some(id => !links.some(link => link.documentId === id))) throw new Error("Vincule os documentos da retificação ao processo de origem.");
    await linkItbiPropertyAttachments(tx, actor, declaration.id, input.documentIds);
    const parties = await tx.itbiParty.findMany({ where: { declarationId: declaration.id }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] });
    const buyers = parties.filter(row => row.role === "ADQUIRENTE");
    const calculation = calculateItbi({ propertyValue: input.assessedPropertyValue, transmittedFractionPercent: declaration.transmittedFraction, ratePercent: declaration.appliedRate, buyerSharesPercent: buyers.map(row => row.participationPercent ?? 0) });
    const payments = await tx.taxPayment.findMany({ where: { guide: { assessmentId: assessment.id }, status: "Confirmado" }, select: { amountPaidDecimal: true } });
    if (payments.some(row => !row.amountPaidDecimal) || !assessment.finalValueDecimal) throw new Error("Concilie os valores Decimal antes da retificação.");
    const paid = payments.reduce((sum, row) => sum.plus(row.amountPaidDecimal!), new Prisma.Decimal(0));
    const compensated = await taxAssessmentCompensatedValue(tx, assessment.id);
    if (calculation.taxAmount.lt(paid.plus(compensated))) throw new Error("O valor retificado é inferior aos pagamentos/compensações. Formalize a restituição ou revisão do crédito com a destinação do excesso antes de retificar.");
    const openGuides = await tx.taxGuide.findMany({ where: { assessmentId: assessment.id, status: { notIn: ["Cancelada", "Paga"] } }, include: { payments: { where: { status: "Confirmado" } } } });
    if (openGuides.some(row => row.payments.length)) throw new Error("Concilie as guias parcialmente pagas antes da retificação.");
    for (const guide of openGuides) await tx.taxGuide.update({ where: { id: guide.id }, data: { status: "Cancelada" } });
    const revision = await reviseTaxAssessmentInTransaction(tx, actor, { assessmentId: assessment.id, taxableBase: calculation.taxableBase.toFixed(2), imposedValue: calculation.taxAmount.toFixed(2), reason: `${input.reason}\nFundamento legal: ${input.legalBasis}`, processId: declaration.processId ?? undefined, documentId: input.documentIds[0], idempotencyKey: `ITBI_RECTIFICATION:${declaration.id}` });
    const id = randomUUID(); const year = new Date().getUTCFullYear();
    const sequence = await tx.taxDocumentSequence.upsert({ where: { year_documentType: { year, documentType: "ITBI_DECLARATION" } }, create: { year, documentType: "ITBI_DECLARATION", currentValue: 1 }, update: { currentValue: { increment: 1 } } });
    const snapshot = taxScopeSnapshot(declaration.calculationSnapshot);
    const memory = { ...snapshot, ...scope, declaredPropertyValue: new Prisma.Decimal(input.declaredValue).toFixed(2), propertyValue: calculation.propertyValue.toFixed(2), taxableBase: calculation.taxableBase.toFixed(2), taxAmount: calculation.taxAmount.toFixed(2), dueDate: input.dueDate, rectifiedDeclarationId: declaration.id, rectificationLegalBasis: input.legalBasis, revisionEntryId: revision.id, previousValuationMemory: snapshot.valuationMemory ?? null, valuationMemory: { source: "DECISAO_RETIFICADORA", propertyValue: calculation.propertyValue.toFixed(2), legalBasis: input.legalBasis, documentIds: input.documentIds }, allocations: calculation.allocations.map((row, index) => ({ taxpayerId: buyers[index].taxpayerId, sharePercent: row.sharePercent.toString(), transmittedValue: row.transmittedValue.toFixed(2), taxAmount: row.taxAmount.toFixed(2) })) };
    await tx.itbiDeclaration.create({ data: {
      id, declarationNumber: `ITBI-${year}-${String(sequence.currentValue).padStart(7, "0")}`, status: "APROVADA", transactionTypeId: declaration.transactionTypeId, realEstateId: declaration.realEstateId, processId: declaration.processId, protocolNumber: declaration.protocolNumber,
      registryOffice: input.registryOffice, transmissionScope: declaration.transmissionScope, transmittedFraction: declaration.transmittedFraction, declaredPropertyValue: input.declaredValue,
      taxableBase: calculation.taxableBase, appliedRate: declaration.appliedRate, taxAmount: calculation.taxAmount, calculationSnapshot: memory as Prisma.InputJsonObject,
      blockingTaxDebt: declaration.blockingTaxDebt, nonTaxDebtAmount: declaration.nonTaxDebtAmount, isLeasehold: declaration.isLeasehold, leaseholdDetails: declaration.leaseholdDetails,
      cadastralUpdateMode: declaration.cadastralUpdateMode, cadastralUpdatedAt: declaration.cadastralUpdatedAt, assessmentId: assessment.id, analyzedAt: new Date(), analysisNotes: input.reason, createdByUsuarioId: actor.usuarioId,
      parties: { create: parties.map(row => ({ taxpayerId: row.taxpayerId, role: row.role, participationPercent: row.participationPercent, liabilityType: row.liabilityType, sortOrder: row.sortOrder })) },
      events: { create: { eventType: "ITBI_RETIFICADOR_CRIADO", description: input.reason, actorUsuarioId: actor.usuarioId, payload: { originalDeclarationId: declaration.id, assessmentId: assessment.id, revisionEntryId: revision.id, paid: paid.toFixed(2), compensated: compensated.toFixed(2), documentIds: input.documentIds } } },
    } });
    const correspondence = await tx.taxRegistryEntry.findFirst({ where: { entityType: "ITBI_DECLARATION", entityId: declaration.id, category: "ITBI_CORRESPONDENCE" }, orderBy: { version: "desc" } });
    if (correspondence) await tx.taxRegistryEntry.create({ data: { entityType: "ITBI_DECLARATION", entityId: id, category: "ITBI_CORRESPONDENCE", version: 1, title: correspondence.title, processId: declaration.processId, actorUsuarioId: actor.usuarioId, data: { ...taxScopeSnapshot(correspondence.data), ...scope, declarationId: id, expectedVersion: 0, previousId: null, inheritedFromId: correspondence.id, reason: "Correspondência preservada na retificação do ITBI." } } });
    const formEntries = await tx.taxRegistryEntry.findMany({ where: { entityType: "ITBI_DECLARATION", entityId: declaration.id, category: "TYPED_FISCAL_RECORD" }, orderBy: { version: "desc" } });
    const latestForms = new Map<string, typeof formEntries[number]>();
    for (const form of formEntries) if (!latestForms.has(form.title)) latestForms.set(form.title, form);
    for (const form of latestForms.values()) {
      const frozen = taxScopeSnapshot(form.data);
      if (frozen.governmentEntityId !== scope.governmentEntityId || frozen.budgetUnitId !== scope.budgetUnitId || frozen.kind !== "FORMULARIO_ITBI") throw new Error("Formulário de origem não conciliado para a retificação.");
      await tx.taxRegistryEntry.create({ data: { entityType: "ITBI_DECLARATION", entityId: id, category: "TYPED_FISCAL_RECORD", version: 1, title: form.title, status: form.status, processId: declaration.processId, documentId: form.documentId, actorUsuarioId: actor.usuarioId, source: "RETIFICACAO_ITBI", data: { ...frozen, previousId: null, inheritedFromId: form.id, inheritedFromDeclarationId: declaration.id } as Prisma.InputJsonObject } });
    }
    const remaining = calculation.taxAmount.minus(paid).minus(compensated); let guideId: string | null = null;
    if (remaining.gt(0)) {
      const guideSequence = await tx.taxDocumentSequence.upsert({ where: { year_documentType: { year: assessment.year, documentType: "GUIDE" } }, create: { year: assessment.year, documentType: "GUIDE", currentValue: 1 }, update: { currentValue: { increment: 1 } } });
      const guide = await tx.taxGuide.create({ data: { assessmentId: assessment.id, guideNumber: `DAM-${assessment.year}-${String(guideSequence.currentValue).padStart(7, "0")}`, totalValue: Number(remaining), totalValueDecimal: remaining, dueDate: new Date(`${input.dueDate}T23:59:59.999Z`), status: "Emitida", calculationSnapshot: { ...scope, itbiDeclarationId: id, rectifiedDeclarationId: declaration.id, revisionEntryId: revision.id, paymentMode: "RECTIFICATION", amount: remaining.toFixed(2), paidBeforeRectification: paid.toFixed(2), effect: "EMISSAO_SEM_BAIXA" } } });
      guideId = guide.id;
      await tx.itbiDeclaration.update({ where: { id }, data: { guideId, status: "DAM_EMITIDO" } });
      await tx.taxAssessment.update({ where: { id: assessment.id }, data: { status: "Emitido" } });
    }
    const revisedAssessment = await tx.taxAssessment.findUniqueOrThrow({ where: { id: assessment.id } });
    await tx.taxAssessment.update({ where: { id: assessment.id }, data: { calculationSnapshot: { ...taxScopeSnapshot(revisedAssessment.calculationSnapshot), ...scope, itbiDeclarationId: id, rectifiedDeclarationId: declaration.id, currentValue: calculation.taxAmount.toFixed(2), lastRevisionEntryId: revision.id } } });
    const document = await generateItbiDocumentInTransaction(tx, actor, id);
    await linkItbiPropertyAttachments(tx, actor, id, input.documentIds);
    if (declaration.documentId) await tx.document.update({ where: { id: declaration.documentId }, data: { status: "Revogado" } });
    await tx.itbiDeclaration.update({ where: { id: declaration.id }, data: { status: "RETIFICADA", events: { create: { eventType: "ITBI_RETIFICADO", description: input.reason, actorUsuarioId: actor.usuarioId, payload: { rectifyingDeclarationId: id, revisionEntryId: revision.id, guideId, documentId: document.id } } } } });
    await tx.taxRegistryEntry.create({ data: { entityType: "ITBI_DECLARATION", entityId: declaration.id, category: "ITBI_RECTIFICATION", title: "Retificação de ITBI transferido", actorUsuarioId: actor.usuarioId, processId: declaration.processId, documentId: document.id, data: { ...scope, rectifyingDeclarationId: id, assessmentId: assessment.id, guideId, revisionEntryId: revision.id, reason: input.reason, legalBasis: input.legalBasis, before: declaration.calculationSnapshot, after: memory } as Prisma.InputJsonObject } });
    await tx.taxAuditLog.create({ data: { action: "RECTIFY_TRANSFERRED_ITBI", entityType: "ItbiDeclaration", entityId: declaration.id, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, payload: { ...scope, rectifyingDeclarationId: id, revisionEntryId: revision.id, guideId, documentId: document.id, reason: input.reason } } });
    return { declarationId: id, guideId, documentId: document.id };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 120000 });
}
