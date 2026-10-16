import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { TaxActor } from "./index";
import { resolveTaxAssessmentScope, taxScopeSnapshot } from "./scope";
import { attributePropertyHistory } from "./property-history";
import { attributeItbiHistory } from "./itbi-history";
import { transferItbiProfileInTransaction, reverseItbiProfileInTransaction } from "./itbi-correspondence";

const ownersSchema = z.array(z.object({ taxpayerId: z.string().min(1), sharePercent: z.string() })).min(1);

/** Fiscal ownership snapshots; a tax payment does not replace civil registration. */
export async function transferPaidItbiInTransaction(tx: Prisma.TransactionClient, actor: TaxActor, assessmentId: string, paymentId: string, date: Date) {
  const declarations = await tx.itbiDeclaration.findMany({ where: { assessmentId, cadastralUpdateMode: "AUTO_ON_PAYMENT", status: { in: ["APROVADA", "DAM_EMITIDO", "DOCUMENTO_EMITIDO"] } }, select: { id: true } });
  await transferDeclarations(tx, actor, assessmentId, paymentId, date, declarations);
}

async function transferDeclarations(tx: Prisma.TransactionClient, actor: TaxActor, assessmentId: string, paymentId: string, date: Date, declarations: { id: string }[]) {
  await attributeItbiHistory(tx, actor);
  for (const { id } of declarations) {
    await tx.$queryRaw`SELECT id FROM "ItbiDeclaration" WHERE id=${id} FOR UPDATE`;
    const declaration = await tx.itbiDeclaration.findUniqueOrThrow({ where: { id }, include: { parties: true } });
    if (declaration.cadastralUpdatedAt) continue;
    if (!["APROVADA", "DAM_EMITIDO", "DOCUMENTO_EMITIDO"].includes(declaration.status)) throw new Error("Declaração ITBI não está aprovada para transmissão cadastral.");
    const assessment = await tx.taxAssessment.findUniqueOrThrow({ where: { id: assessmentId } });
    const scope = await resolveTaxAssessmentScope(tx, actor, assessment.taxId, assessment.calculationSnapshot);
    const payments = await tx.taxPayment.findMany({ where: { guide: { assessmentId }, status: "Confirmado" }, select: { amountPaidDecimal: true } });
    const total = assessment.finalValueDecimal;
    if (!total || payments.some(payment => !payment.amountPaidDecimal)) throw new Error("ITBI sem saldo Decimal conciliado para transmissão.");
    const paid = payments.reduce((sum, payment) => sum.plus(payment.amountPaidDecimal!), new Prisma.Decimal(0));
    if (paid.lt(total)) continue;
    await tx.$queryRaw`SELECT id FROM "RealEstate" WHERE id=${declaration.realEstateId} FOR UPDATE`;
    const property = await tx.realEstate.findUniqueOrThrow({ where: { id: declaration.realEstateId } });
    const cadastralProfile = await tx.taxRegistryEntry.findFirst({ where: { entityType: "REAL_ESTATE", entityId: property.id, category: "PROPERTY_PROFILE" }, orderBy: { version: "desc" } });
    if (cadastralProfile) { const data = taxScopeSnapshot(cadastralProfile.data); if (data.governmentEntityId !== scope.governmentEntityId || data.budgetUnitId !== scope.budgetUnitId) throw new Error("ITBI e imóvel conciliado pertencem a origens diferentes."); }
    const positions = await tx.taxRegistryEntry.findMany({ where: { entityType: "REAL_ESTATE", entityId: property.id, category: "FISCAL_OWNERSHIP", status: "ATIVO" }, orderBy: { version: "desc" } });
    if (positions.length > 1) throw new Error("Titularidade fiscal tem mais de uma posição vigente; concilie o cadastro.");
    const sellers = declaration.parties.filter(party => party.role === "TRANSMITENTE");
    const buyers = declaration.parties.filter(party => party.role === "ADQUIRENTE");
    if (!sellers.length || !buyers.length || new Set(sellers.map(seller=>seller.taxpayerId)).size!==sellers.length || new Set(buyers.map(buyer => buyer.taxpayerId)).size !== buyers.length) throw new Error("Partes da transmissão ITBI inválidas.");
    const previous = positions[0];
    if (previous && previous.effectiveFrom > date) throw new Error("Pagamento anterior à posição fiscal vigente do imóvel.");
    const owners = previous ? ownersSchema.parse(taxScopeSnapshot(previous.data).owners) : property.taxpayerId ? [{ taxpayerId: property.taxpayerId, sharePercent: "100" }] : [];
    if (!owners.length || !owners.reduce((sum, owner) => sum.plus(owner.sharePercent), new Prisma.Decimal(0)).eq(100)) throw new Error("Posição fiscal anterior não conciliada.");
    const shares = new Map(owners.map(owner => [owner.taxpayerId, new Prisma.Decimal(owner.sharePercent)]));
    if (!sellers.reduce((sum,seller)=>sum.plus(seller.participationPercent ?? 0),new Prisma.Decimal(0)).eq(100)) throw new Error("Participações dos transmitentes devem totalizar 100% da fração transmitida.");
    for (const seller of sellers) {
      const sold=declaration.transmittedFraction.mul(seller.participationPercent ?? 0).div(100);
      const owned=shares.get(seller.taxpayerId);
      if (!owned || sold.lte(0) || owned.lt(sold)) throw new Error("Fração transmitida excede a titularidade fiscal do transmitente.");
      shares.set(seller.taxpayerId,owned.minus(sold));
    }
    const buyerShares = buyers.reduce((sum, buyer) => sum.plus(buyer.participationPercent ?? 0), new Prisma.Decimal(0));
    if (!buyerShares.eq(100)) throw new Error("Participações dos adquirentes devem totalizar 100% da fração transmitida.");
    for (const buyer of buyers) shares.set(buyer.taxpayerId, (shares.get(buyer.taxpayerId) ?? new Prisma.Decimal(0)).plus(declaration.transmittedFraction.mul(buyer.participationPercent!).div(100)));
    const next = [...shares].filter(([, share]) => share.gt(0)).map(([taxpayerId, share]) => ({ taxpayerId, sharePercent: share.toString() })).sort((a, b) => a.taxpayerId.localeCompare(b.taxpayerId));
    if (!next.reduce((sum, owner) => sum.plus(owner.sharePercent), new Prisma.Decimal(0)).eq(100)) throw new Error("Transmissão não conserva a composição fiscal do imóvel.");
    if (previous) await tx.taxRegistryEntry.update({ where: { id: previous.id }, data: { status: "HISTORICO", effectiveUntil: date } });
    const primary = next.some(owner => owner.taxpayerId === property.taxpayerId) ? property.taxpayerId : next[0].taxpayerId;
    const namedOwners = await tx.taxpayer.findMany({ where: { id: { in: next.map(owner => owner.taxpayerId) } }, select: { id: true, person: { select: { fullName: true } }, company: { select: { corporateName: true } } } });
    const ownerNames = Object.fromEntries(namedOwners.map(owner => [owner.id, owner.company?.corporateName ?? owner.person?.fullName ?? owner.id]));
    const profileTransfer = await transferItbiProfileInTransaction(tx, actor, { declarationId: id, propertyId: property.id, processId: declaration.processId, owners: next, ownerNames, primaryTaxpayerId: primary, ...scope });
     const position = await tx.taxRegistryEntry.create({ data: { entityType: "REAL_ESTATE", entityId: property.id, category: "FISCAL_OWNERSHIP", title: `Titularidade fiscal por ITBI ${declaration.declarationNumber}`, source: "ITBI_PAYMENT", effectiveFrom: date, version: (previous?.version ?? 0) + 1, actorUsuarioId: actor.usuarioId, processId: declaration.processId, data: { ...scope, ...profileTransfer, declarationId: id, paymentId, assessmentId, previousPositionId: previous?.id ?? null, previousTaxpayerId: property.taxpayerId, previousOwners: owners, previousOwnerNames: taxScopeSnapshot(taxScopeSnapshot(previous?.data).ownerNames) as Prisma.InputJsonObject, owners: next, ownerNames, primaryTaxpayerId: primary } } });
    await attributePropertyHistory(tx, actor.usuarioId);
    await tx.$queryRaw`SELECT set_config('celeriflow.cadastral_process', ${declaration.processId ?? ""}, true), set_config('celeriflow.cadastral_profile_change','true',true)`;
    await tx.realEstate.update({ where: { id: property.id }, data: { taxpayerId: primary } });
    await tx.itbiDeclaration.update({ where: { id }, data: { cadastralUpdatedAt: date, events: { create: { eventType: "CADASTRO_TRANSFERIDO_PAGAMENTO", description: "Titularidade fiscal transferida após pagamento integral, preservando frações e coproprietários.", actorUsuarioId: actor.usuarioId, payload: { positionId: position.id, paymentId, owners: next } } } } });
  }
}

export async function transferItbiManually(db: PrismaClient, actor: TaxActor, input: { declarationId: string; reason: string }) {
  if (!input.reason.trim()) throw new Error("Informe o fundamento da transferência manual.");
  return db.$transaction(async tx => {
    const origin = await tx.itbiDeclaration.findUniqueOrThrow({ where: { id: input.declarationId } });
    if (!origin.assessmentId) throw new Error("A transferência exige lançamento aprovado e integralmente pago.");
    await tx.$queryRaw`SELECT id FROM "TaxAssessment" WHERE id=${origin.assessmentId} FOR UPDATE`;
    const assessment = await tx.taxAssessment.findUniqueOrThrow({ where: { id: origin.assessmentId } });
    await resolveTaxAssessmentScope(tx, actor, assessment.taxId, assessment.calculationSnapshot);
    await tx.$queryRaw`SELECT id FROM "ItbiDeclaration" WHERE id=${input.declarationId} FOR UPDATE`;
    const current = await tx.itbiDeclaration.findUniqueOrThrow({ where: { id: input.declarationId } });
    if (current.cadastralUpdatedAt) {
      const previous = await tx.itbiEvent.findFirst({ where: { declarationId: current.id, eventType: "TRANSFERENCIA_MANUAL" }, orderBy: { createdAt: "desc" } });
      if (!previous || previous.description !== input.reason.trim()) throw new Error("Transferência anterior possui outro fundamento ou foi realizada automaticamente.");
      return current;
    }
    if (current.cadastralUpdateMode !== "MANUAL") throw new Error("A declaração usa transferência automática no pagamento.");
    const payments = await tx.taxPayment.findMany({ where: { guide: { assessmentId: assessment.id }, status: "Confirmado" }, orderBy: [{ paymentDate: "desc" }, { id: "desc" }] });
    if (!assessment.finalValueDecimal || payments.some(payment => !payment.amountPaidDecimal) || !payments.length || payments.reduce((sum, payment) => sum.plus(payment.amountPaidDecimal!), new Prisma.Decimal(0)).lt(assessment.finalValueDecimal)) throw new Error("A transferência exige pagamento integral conciliado.");
    const date = new Date();
    if (payments[0].paymentDate > date) throw new Error("A transferência não pode anteceder o pagamento.");
    await transferDeclarations(tx, actor, assessment.id, payments[0].id, date, [{ id: current.id }]);
    await tx.itbiEvent.create({ data: { declarationId: current.id, eventType: "TRANSFERENCIA_MANUAL", description: input.reason.trim(), actorUsuarioId: actor.usuarioId } });
    return tx.itbiDeclaration.findUniqueOrThrow({ where: { id: current.id } });
  }, { timeout: 60000 });
}

export async function reversePaidItbiInTransaction(tx: Prisma.TransactionClient, actor: TaxActor, paymentId: string, date: Date) {
  await attributeItbiHistory(tx, actor);
  const payment = await tx.taxPayment.findUniqueOrThrow({ where: { id: paymentId }, include: { guide: { include: { assessment: true } } } });
  const declaration = await tx.itbiDeclaration.findFirst({ where: { assessmentId: payment.guide.assessmentId }, select: { id: true } });
  if (!declaration) return;
  const remaining = await tx.taxPayment.findMany({ where: { guide: { assessmentId: payment.guide.assessmentId }, status: "Confirmado" }, select: { amountPaidDecimal: true } });
  if (remaining.some(row => !row.amountPaidDecimal) || !payment.guide.assessment.finalValueDecimal) throw new Error("ITBI sem saldo Decimal conciliado no estorno.");
  if (remaining.reduce((sum, row) => sum.plus(row.amountPaidDecimal!), new Prisma.Decimal(0)).gte(payment.guide.assessment.finalValueDecimal)) return;
  const origins = await tx.taxRegistryEntry.findMany({ where: { category: "FISCAL_OWNERSHIP", source: "ITBI_PAYMENT", status: "ATIVO", data: { path: ["assessmentId"], equals: payment.guide.assessmentId } } });
  const later = await tx.taxRegistryEntry.count({ where: { category: "FISCAL_OWNERSHIP", source: "ITBI_PAYMENT", status: "HISTORICO", data: { path: ["assessmentId"], equals: payment.guide.assessmentId } } });
  if (later) throw new Error("Há transmissão posterior do imóvel; regularize a titularidade antes de estornar o ITBI.");
  for (const origin of origins) {
    const memory = taxScopeSnapshot(origin.data);
    if (typeof memory.declarationId !== "string") throw new Error("Posição ITBI sem origem conciliada.");
    await tx.$queryRaw`SELECT id FROM "ItbiDeclaration" WHERE id=${memory.declarationId} FOR UPDATE`;
    const transferredDeclaration = await tx.itbiDeclaration.findUniqueOrThrow({ where: { id: memory.declarationId } });
    let currentDeclaration = transferredDeclaration;
    const rectificationChain = [transferredDeclaration.id];
    while (currentDeclaration.status === "RETIFICADA") {
      if (rectificationChain.length >= 100) throw new Error("Cadeia de retificação excede o limite de conferência do estorno.");
      const link = await tx.taxRegistryEntry.findFirstOrThrow({ where: { entityType: "ITBI_DECLARATION", entityId: currentDeclaration.id, category: "ITBI_RECTIFICATION" } });
      const linkData = taxScopeSnapshot(link.data);
      if (typeof linkData.rectifyingDeclarationId !== "string" || rectificationChain.includes(linkData.rectifyingDeclarationId)) throw new Error("Cadeia de retificação sem identificador válido ou com referência circular.");
      await tx.$queryRaw`SELECT id FROM "ItbiDeclaration" WHERE id=${linkData.rectifyingDeclarationId} FOR UPDATE`;
      const next = await tx.itbiDeclaration.findUniqueOrThrow({ where: { id: linkData.rectifyingDeclarationId } });
      const nextScope = taxScopeSnapshot(next.calculationSnapshot);
      if (next.assessmentId !== payment.guide.assessmentId || next.realEstateId !== origin.entityId || next.processId !== transferredDeclaration.processId || nextScope.rectifiedDeclarationId !== currentDeclaration.id || nextScope.budgetUnitId !== memory.budgetUnitId || nextScope.governmentEntityId !== memory.governmentEntityId) throw new Error("Retificação diverge da origem da transmissão que será recomposta.");
      currentDeclaration = next; rectificationChain.push(next.id);
    }
    if (!["APROVADA", "DAM_EMITIDO", "DOCUMENTO_EMITIDO"].includes(currentDeclaration.status) || !currentDeclaration.cadastralUpdatedAt) throw new Error("A cadeia retificadora não possui transmissão vigente conciliada.");
    await tx.$queryRaw`SELECT id FROM "RealEstate" WHERE id=${origin.entityId} FOR UPDATE`;
    const current = await tx.taxRegistryEntry.findUniqueOrThrow({ where: { id: origin.id } });
    if (current.status !== "ATIVO") throw new Error("Titularidade alterada após o pagamento ITBI.");
    if (date < current.effectiveFrom) throw new Error("Estorno anterior à transmissão fiscal do imóvel.");
    const property = await tx.realEstate.findUniqueOrThrow({ where: { id: origin.entityId } });
    if (property.taxpayerId !== memory.primaryTaxpayerId) throw new Error("Titular principal alterado após o pagamento; concilie o cadastro antes do estorno ITBI.");
    const owners = ownersSchema.parse(memory.previousOwners);
    await tx.taxRegistryEntry.update({ where: { id: origin.id }, data: { status: "ESTORNADO", effectiveUntil: date } });
    await tx.taxRegistryEntry.create({ data: { entityType: "REAL_ESTATE", entityId: origin.entityId, category: "FISCAL_OWNERSHIP", title: "Recomposição fiscal após estorno do ITBI", source: "ITBI_PAYMENT_REVERSAL", effectiveFrom: date, version: origin.version + 1, actorUsuarioId: actor.usuarioId, data: { budgetUnitId: memory.budgetUnitId ?? null, governmentEntityId: memory.governmentEntityId ?? null, owners, ownerNames: taxScopeSnapshot(memory.previousOwnerNames) as Prisma.InputJsonObject, primaryTaxpayerId: memory.previousTaxpayerId ?? null, reversedPositionId: origin.id, paymentId } } });
    await attributePropertyHistory(tx, actor.usuarioId);
    const declarationOrigin = await tx.itbiDeclaration.findUniqueOrThrow({ where: { id: memory.declarationId } });
    await reverseItbiProfileInTransaction(tx, actor, origin.entityId, memory, declarationOrigin.processId);
    await tx.$queryRaw`SELECT set_config('celeriflow.cadastral_process', ${declarationOrigin.processId ?? ""}, true), set_config('celeriflow.cadastral_profile_change','true',true)`;
    await tx.realEstate.update({ where: { id: origin.entityId }, data: { taxpayerId: typeof memory.previousTaxpayerId === "string" ? memory.previousTaxpayerId : null } });
    await tx.itbiDeclaration.update({ where: { id: currentDeclaration.id }, data: { cadastralUpdatedAt: null, events: { create: { eventType: "CADASTRO_TRANSFERENCIA_ESTORNADA", description: "Titularidade fiscal anterior recomposta pelo estorno da arrecadação ITBI.", actorUsuarioId: actor.usuarioId, payload: { paymentId, reversedPositionId: origin.id, originalDeclarationId: transferredDeclaration.id, rectificationChain } } } } });
    if (currentDeclaration.id !== transferredDeclaration.id) await tx.itbiDeclaration.update({ where: { id: transferredDeclaration.id }, data: { events: { create: { eventType: "CADEIA_RETIFICADORA_TRANSFERENCIA_ESTORNADA", description: "Estorno da titularidade original coordenado com o ITBI retificador vigente.", actorUsuarioId: actor.usuarioId, payload: { paymentId, currentDeclarationId: currentDeclaration.id, rectificationChain } } } } });
  }
}
