import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseTransaction } from "@/db/transaction";
import { itbiDeclarations, itbiEvents } from "@/db/schema/tax-itbi";
import { taxRegistryEntries } from "@/db/schema/taxation-registry";
import { realEstates } from "@/db/schema/registry";
import { taxPayments } from "@/db/schema/tax-accounting";
import { taxGuides } from "@/db/schema/taxation-core";
import { appendItbiEvent, firstItbiRegistryEntry, insertItbiRegistryEntry, itbiRegistryPosition, latestItbiRegistryEntry, lockItbiRecord, readConfirmedItbiPayments, readItbiAssessment, readItbiDeclaration, readItbiParties, readItbiProperty, readItbiRegistryEntries, readItbiTaxpayers, requireItbiRecord, updateItbiDeclaration } from "@/db/repositories/tax-itbi/records";
import { z } from "zod";
import type { TaxActor } from "./index";
import { resolveTaxAssessmentScope, taxScopeSnapshot } from "./scope";
import { attributePropertyHistory } from "./property-history";
import { attributeItbiHistory } from "./itbi-history";
import { transferItbiProfileInTransaction, reverseItbiProfileInTransaction } from "./itbi-correspondence";

const ownersSchema = z.array(z.object({ taxpayerId: z.string().min(1), sharePercent: z.string() })).min(1);

/** Fiscal ownership snapshots; a tax payment does not replace civil registration. */
export async function transferPaidItbiInTransaction(tx: DatabaseTransaction, actor: TaxActor, assessmentId: string, paymentId: string, date: Date) {
  const declarations = await tx.select({ id: itbiDeclarations.id }).from(itbiDeclarations).where(and(eq(itbiDeclarations.assessmentId, assessmentId), eq(itbiDeclarations.cadastralUpdateMode, "AUTO_ON_PAYMENT"), inArray(itbiDeclarations.status, ["APROVADA", "DAM_EMITIDO", "DOCUMENTO_EMITIDO"])));
  await transferDeclarations(tx, actor, assessmentId, paymentId, date, declarations);
}

async function transferDeclarations(tx: DatabaseTransaction, actor: TaxActor, assessmentId: string, paymentId: string, date: Date, declarations: { id: string }[]) {
  await attributeItbiHistory(tx, actor);
  for (const { id } of declarations) {
    await lockItbiRecord(tx, "ItbiDeclaration", id);
    const declaration = { ...await readItbiDeclaration(tx, id), parties: await readItbiParties(tx, id) };
    if (declaration.cadastralUpdatedAt) continue;
    if (!["APROVADA", "DAM_EMITIDO", "DOCUMENTO_EMITIDO"].includes(declaration.status)) throw new Error("Declaração ITBI não está aprovada para transmissão cadastral.");
    const assessment = await readItbiAssessment(tx, assessmentId);
    const scope = await resolveTaxAssessmentScope(tx, actor, assessment.taxId, assessment.calculationSnapshot);
    const payments = await readConfirmedItbiPayments(tx, assessmentId);
    const total = assessment.finalValueDecimal;
    if (!total || payments.some(payment => !payment.amountPaidDecimal)) throw new Error("ITBI sem saldo Decimal conciliado para transmissão.");
    const paid = payments.reduce((sum, payment) => sum.plus(payment.amountPaidDecimal!), new Decimal(0));
    if (paid.lt(total)) continue;
    await lockItbiRecord(tx, "RealEstate", declaration.realEstateId);
    const property = await readItbiProperty(tx, declaration.realEstateId);
    const cadastralProfile = await latestItbiRegistryEntry(tx, "REAL_ESTATE", property.id, "PROPERTY_PROFILE");
    if (cadastralProfile) { const data = taxScopeSnapshot(cadastralProfile.data); if (data.governmentEntityId !== scope.governmentEntityId || data.budgetUnitId !== scope.budgetUnitId) throw new Error("ITBI e imóvel conciliado pertencem a origens diferentes."); }
    const positions = await readItbiRegistryEntries(tx, and(itbiRegistryPosition("REAL_ESTATE", property.id, "FISCAL_OWNERSHIP"), eq(taxRegistryEntries.status, "ATIVO"))!, [desc(taxRegistryEntries.version)]);
    if (positions.length > 1) throw new Error("Titularidade fiscal tem mais de uma posição vigente; concilie o cadastro.");
    const sellers = declaration.parties.filter(party => party.role === "TRANSMITENTE");
    const buyers = declaration.parties.filter(party => party.role === "ADQUIRENTE");
    if (!sellers.length || !buyers.length || new Set(sellers.map(seller=>seller.taxpayerId)).size!==sellers.length || new Set(buyers.map(buyer => buyer.taxpayerId)).size !== buyers.length) throw new Error("Partes da transmissão ITBI inválidas.");
    const previous = positions[0];
    if (previous && previous.effectiveFrom > date) throw new Error("Pagamento anterior à posição fiscal vigente do imóvel.");
    const owners = previous ? ownersSchema.parse(taxScopeSnapshot(previous.data).owners) : property.taxpayerId ? [{ taxpayerId: property.taxpayerId, sharePercent: "100" }] : [];
    if (!owners.length || !owners.reduce((sum, owner) => sum.plus(owner.sharePercent), new Decimal(0)).eq(100)) throw new Error("Posição fiscal anterior não conciliada.");
    const shares = new Map(owners.map(owner => [owner.taxpayerId, new Decimal(owner.sharePercent)]));
    if (!sellers.reduce((sum,seller)=>sum.plus(seller.participationPercent ?? 0),new Decimal(0)).eq(100)) throw new Error("Participações dos transmitentes devem totalizar 100% da fração transmitida.");
    for (const seller of sellers) {
      const sold=declaration.transmittedFraction.mul(seller.participationPercent ?? 0).div(100);
      const owned=shares.get(seller.taxpayerId);
      if (!owned || sold.lte(0) || owned.lt(sold)) throw new Error("Fração transmitida excede a titularidade fiscal do transmitente.");
      shares.set(seller.taxpayerId,owned.minus(sold));
    }
    const buyerShares = buyers.reduce((sum, buyer) => sum.plus(buyer.participationPercent ?? 0), new Decimal(0));
    if (!buyerShares.eq(100)) throw new Error("Participações dos adquirentes devem totalizar 100% da fração transmitida.");
    for (const buyer of buyers) shares.set(buyer.taxpayerId, (shares.get(buyer.taxpayerId) ?? new Decimal(0)).plus(declaration.transmittedFraction.mul(buyer.participationPercent!).div(100)));
    const next = [...shares].filter(([, share]) => share.gt(0)).map(([taxpayerId, share]) => ({ taxpayerId, sharePercent: share.toString() })).sort((a, b) => a.taxpayerId.localeCompare(b.taxpayerId));
    if (!next.reduce((sum, owner) => sum.plus(owner.sharePercent), new Decimal(0)).eq(100)) throw new Error("Transmissão não conserva a composição fiscal do imóvel.");
    if (previous) requireItbiRecord((await tx.update(taxRegistryEntries).set({ status: "HISTORICO", effectiveUntil: date }).where(eq(taxRegistryEntries.id, previous.id)).returning({ id: taxRegistryEntries.id }))[0]);
    const primary = next.some(owner => owner.taxpayerId === property.taxpayerId) ? property.taxpayerId : next[0].taxpayerId;
    const namedOwners = await readItbiTaxpayers(tx, next.map(owner => owner.taxpayerId));
    const ownerNames = Object.fromEntries(namedOwners.map(owner => [owner.id, owner.company?.corporateName ?? owner.person?.fullName ?? owner.id]));
    const profileTransfer = await transferItbiProfileInTransaction(tx, actor, { declarationId: id, propertyId: property.id, processId: declaration.processId, owners: next, ownerNames, primaryTaxpayerId: primary, ...scope });
     const position = await insertItbiRegistryEntry(tx, { entityType: "REAL_ESTATE", entityId: property.id, category: "FISCAL_OWNERSHIP", title: `Titularidade fiscal por ITBI ${declaration.declarationNumber}`, source: "ITBI_PAYMENT", effectiveFrom: date, version: (previous?.version ?? 0) + 1, actorUsuarioId: actor.usuarioId, processId: declaration.processId, data: { ...scope, ...profileTransfer, declarationId: id, paymentId, assessmentId, previousPositionId: previous?.id ?? null, previousTaxpayerId: property.taxpayerId, previousOwners: owners, previousOwnerNames: taxScopeSnapshot(taxScopeSnapshot(previous?.data).ownerNames), owners: next, ownerNames, primaryTaxpayerId: primary } });
    await attributePropertyHistory(tx, actor.usuarioId);
    await tx.execute(sql`SELECT set_config('celeriflow.cadastral_process', ${declaration.processId ?? ""}, true), set_config('celeriflow.cadastral_profile_change','true',true)`);
    requireItbiRecord((await tx.update(realEstates).set({ taxpayerId: primary }).where(eq(realEstates.id, property.id)).returning({ id: realEstates.id }))[0]);
    await updateItbiDeclaration(tx, id, { cadastralUpdatedAt: date }, { eventType: "CADASTRO_TRANSFERIDO_PAGAMENTO", description: "Titularidade fiscal transferida após pagamento integral, preservando frações e coproprietários.", actorUsuarioId: actor.usuarioId, payload: { positionId: position.id, paymentId, owners: next } });
  }
}

export async function transferItbiManually(connection: DatabaseConnection, actor: TaxActor, input: { declarationId: string; reason: string }) {
  if (!input.reason.trim()) throw new Error("Informe o fundamento da transferência manual.");
  return withDatabaseTransaction(connection, async tx => {
    const origin = await readItbiDeclaration(tx, input.declarationId);
    if (!origin.assessmentId) throw new Error("A transferência exige lançamento aprovado e integralmente pago.");
    await lockItbiRecord(tx, "TaxAssessment", origin.assessmentId);
    const assessment = await readItbiAssessment(tx, origin.assessmentId);
    await resolveTaxAssessmentScope(tx, actor, assessment.taxId, assessment.calculationSnapshot);
    await lockItbiRecord(tx, "ItbiDeclaration", input.declarationId);
    const current = await readItbiDeclaration(tx, input.declarationId);
    if (current.cadastralUpdatedAt) {
      const previous = (await tx.select().from(itbiEvents).where(and(eq(itbiEvents.declarationId, current.id), eq(itbiEvents.eventType, "TRANSFERENCIA_MANUAL"))).orderBy(desc(itbiEvents.createdAt)).limit(1))[0];
      if (!previous || previous.description !== input.reason.trim()) throw new Error("Transferência anterior possui outro fundamento ou foi realizada automaticamente.");
      return current;
    }
    if (current.cadastralUpdateMode !== "MANUAL") throw new Error("A declaração usa transferência automática no pagamento.");
    const payments = await readConfirmedItbiPayments(tx, assessment.id, "desc");
    if (!assessment.finalValueDecimal || payments.some(payment => !payment.amountPaidDecimal) || !payments.length || payments.reduce((sum, payment) => sum.plus(payment.amountPaidDecimal!), new Decimal(0)).lt(assessment.finalValueDecimal)) throw new Error("A transferência exige pagamento integral conciliado.");
    const date = new Date();
    if (payments[0].paymentDate > date) throw new Error("A transferência não pode anteceder o pagamento.");
    await transferDeclarations(tx, actor, assessment.id, payments[0].id, date, [{ id: current.id }]);
    await appendItbiEvent(tx, current.id, { eventType: "TRANSFERENCIA_MANUAL", description: input.reason.trim(), actorUsuarioId: actor.usuarioId });
    return readItbiDeclaration(tx, current.id);
  }, { timeoutMs: 60000 });
}

export async function reversePaidItbiInTransaction(tx: DatabaseTransaction, actor: TaxActor, paymentId: string, date: Date) {
  await attributeItbiHistory(tx, actor);
  const paymentRow = requireItbiRecord((await tx.select().from(taxPayments).where(eq(taxPayments.id, paymentId)).limit(1))[0]);
  const guide = requireItbiRecord((await tx.select().from(taxGuides).where(eq(taxGuides.id, paymentRow.guideId)).limit(1))[0]);
  const payment = { ...paymentRow, guide: { ...guide, assessment: await readItbiAssessment(tx, guide.assessmentId) } };
  const declaration = (await tx.select({ id: itbiDeclarations.id }).from(itbiDeclarations).where(eq(itbiDeclarations.assessmentId, payment.guide.assessmentId)).limit(1))[0];
  if (!declaration) return;
  const remaining = await readConfirmedItbiPayments(tx, payment.guide.assessmentId);
  if (remaining.some(row => !row.amountPaidDecimal) || !payment.guide.assessment.finalValueDecimal) throw new Error("ITBI sem saldo Decimal conciliado no estorno.");
  if (remaining.reduce((sum, row) => sum.plus(row.amountPaidDecimal!), new Decimal(0)).gte(payment.guide.assessment.finalValueDecimal)) return;
  const origins = await readItbiRegistryEntries(tx, and(eq(taxRegistryEntries.category, "FISCAL_OWNERSHIP"), eq(taxRegistryEntries.source, "ITBI_PAYMENT"), eq(taxRegistryEntries.status, "ATIVO"), sql`${taxRegistryEntries.data}->'assessmentId' = ${JSON.stringify(payment.guide.assessmentId)}::jsonb`)!);
  const later = await firstItbiRegistryEntry(tx, and(eq(taxRegistryEntries.category, "FISCAL_OWNERSHIP"), eq(taxRegistryEntries.source, "ITBI_PAYMENT"), eq(taxRegistryEntries.status, "HISTORICO"), sql`${taxRegistryEntries.data}->'assessmentId' = ${JSON.stringify(payment.guide.assessmentId)}::jsonb`)!);
  if (later) throw new Error("Há transmissão posterior do imóvel; regularize a titularidade antes de estornar o ITBI.");
  for (const origin of origins) {
    const memory = taxScopeSnapshot(origin.data);
    if (typeof memory.declarationId !== "string") throw new Error("Posição ITBI sem origem conciliada.");
    await lockItbiRecord(tx, "ItbiDeclaration", memory.declarationId);
    const transferredDeclaration = await readItbiDeclaration(tx, memory.declarationId);
    let currentDeclaration = transferredDeclaration;
    const rectificationChain = [transferredDeclaration.id];
    while (currentDeclaration.status === "RETIFICADA") {
      if (rectificationChain.length >= 100) throw new Error("Cadeia de retificação excede o limite de conferência do estorno.");
      const link = requireItbiRecord(await firstItbiRegistryEntry(tx, itbiRegistryPosition("ITBI_DECLARATION", currentDeclaration.id, "ITBI_RECTIFICATION")));
      const linkData = taxScopeSnapshot(link.data);
      if (typeof linkData.rectifyingDeclarationId !== "string" || rectificationChain.includes(linkData.rectifyingDeclarationId)) throw new Error("Cadeia de retificação sem identificador válido ou com referência circular.");
      await lockItbiRecord(tx, "ItbiDeclaration", linkData.rectifyingDeclarationId);
      const next = await readItbiDeclaration(tx, linkData.rectifyingDeclarationId);
      const nextScope = taxScopeSnapshot(next.calculationSnapshot);
      if (next.assessmentId !== payment.guide.assessmentId || next.realEstateId !== origin.entityId || next.processId !== transferredDeclaration.processId || nextScope.rectifiedDeclarationId !== currentDeclaration.id || nextScope.budgetUnitId !== memory.budgetUnitId || nextScope.governmentEntityId !== memory.governmentEntityId) throw new Error("Retificação diverge da origem da transmissão que será recomposta.");
      currentDeclaration = next; rectificationChain.push(next.id);
    }
    if (!["APROVADA", "DAM_EMITIDO", "DOCUMENTO_EMITIDO"].includes(currentDeclaration.status) || !currentDeclaration.cadastralUpdatedAt) throw new Error("A cadeia retificadora não possui transmissão vigente conciliada.");
    await lockItbiRecord(tx, "RealEstate", origin.entityId);
    const current = requireItbiRecord(await firstItbiRegistryEntry(tx, eq(taxRegistryEntries.id, origin.id)));
    if (current.status !== "ATIVO") throw new Error("Titularidade alterada após o pagamento ITBI.");
    if (date < current.effectiveFrom) throw new Error("Estorno anterior à transmissão fiscal do imóvel.");
    const property = await readItbiProperty(tx, origin.entityId);
    if (property.taxpayerId !== memory.primaryTaxpayerId) throw new Error("Titular principal alterado após o pagamento; concilie o cadastro antes do estorno ITBI.");
    const owners = ownersSchema.parse(memory.previousOwners);
    requireItbiRecord((await tx.update(taxRegistryEntries).set({ status: "ESTORNADO", effectiveUntil: date }).where(eq(taxRegistryEntries.id, origin.id)).returning({ id: taxRegistryEntries.id }))[0]);
    await insertItbiRegistryEntry(tx, { entityType: "REAL_ESTATE", entityId: origin.entityId, category: "FISCAL_OWNERSHIP", title: "Recomposição fiscal após estorno do ITBI", source: "ITBI_PAYMENT_REVERSAL", effectiveFrom: date, version: origin.version + 1, actorUsuarioId: actor.usuarioId, data: { budgetUnitId: memory.budgetUnitId ?? null, governmentEntityId: memory.governmentEntityId ?? null, owners, ownerNames: taxScopeSnapshot(memory.previousOwnerNames), primaryTaxpayerId: memory.previousTaxpayerId ?? null, reversedPositionId: origin.id, paymentId } });
    await attributePropertyHistory(tx, actor.usuarioId);
    const declarationOrigin = await readItbiDeclaration(tx, memory.declarationId);
    await reverseItbiProfileInTransaction(tx, actor, origin.entityId, memory, declarationOrigin.processId);
    await tx.execute(sql`SELECT set_config('celeriflow.cadastral_process', ${declarationOrigin.processId ?? ""}, true), set_config('celeriflow.cadastral_profile_change','true',true)`);
    requireItbiRecord((await tx.update(realEstates).set({ taxpayerId: typeof memory.previousTaxpayerId === "string" ? memory.previousTaxpayerId : null }).where(eq(realEstates.id, origin.entityId)).returning({ id: realEstates.id }))[0]);
    await updateItbiDeclaration(tx, currentDeclaration.id, { cadastralUpdatedAt: null }, { eventType: "CADASTRO_TRANSFERENCIA_ESTORNADA", description: "Titularidade fiscal anterior recomposta pelo estorno da arrecadação ITBI.", actorUsuarioId: actor.usuarioId, payload: { paymentId, reversedPositionId: origin.id, originalDeclarationId: transferredDeclaration.id, rectificationChain } });
    if (currentDeclaration.id !== transferredDeclaration.id) await updateItbiDeclaration(tx, transferredDeclaration.id, {}, { eventType: "CADEIA_RETIFICADORA_TRANSFERENCIA_ESTORNADA", description: "Estorno da titularidade original coordenado com o ITBI retificador vigente.", actorUsuarioId: actor.usuarioId, payload: { paymentId, currentDeclarationId: currentDeclaration.id, rectificationChain } });
  }
}
