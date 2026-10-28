import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lte, ne, notInArray, or, sql } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import { JsonNull, type JsonValue } from "@/db/json";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseExecutor, type DatabaseTransaction } from "@/db/transaction";
import { taxpayers } from "@/db/schema/registry";
import { economicRegistrations, taxAssessments, taxGuides, taxes } from "@/db/schema/taxation-core";
import { taxActiveDebts, taxPayments } from "@/db/schema/tax-accounting";
import { taxRegistryEntries } from "@/db/schema/taxation-registry";
import { pageParameters } from "@/db/schema/taxation-pages";
import { nfseCorrectionLetters, nfseEvents, nfseInvoiceData, taxInvoices } from "@/db/schema/taxation-nfse";
import { inspectionActivities, inspectionCredentialEvents, inspectionCredentials, inspectionDeclarations, inspectionDeductionConsumptions, inspectionDeductionCredits, inspectionDmsDeclarations, inspectionOccasionalRequests, inspectionRpsBatches, inspectionRpsItems } from "@/db/schema/tax-inspection-operations";
import { inspectionProviderActivities, inspectionServiceTaxes, insertInspectionEvent, nextInspectionNumber as nextNumber, requiredInspectionRow as found } from "@/db/repositories/tax-inspection-operations/records";
import { inspectionSnapshot as asJson } from "@/db/repositories/tax-inspection-operations/snapshot";
import type { InspectionOperationsActor as TaxActor, NfseDmsInput, NfseEmissionInput, NfseOccasionalInput, NfseRpsInput } from "@/lib/contracts/tax-inspection-operations";
import { createHash, randomUUID } from "node:crypto";
import { calculateNfse, validateCorrectionChanges, TributarioS4Error } from "./s4-engine";
import { createTaxAssessmentInTransaction, generateTaxGuideInTransaction } from "./index";
import { resolveTaxAssessmentScope, resolveTaxFinancialYear, taxAssessmentCompensatedValue, taxScopeSnapshot } from "./scope";
import { postTaxAssessmentAdjustment } from "./accrual-accounting";
import { assertAccountingPeriodOpen } from "@/lib/financeiro";
import { readMunicipalServiceRelationships } from "@/lib/planejamento/activity-relations";

const required = (value: string, label: string) => { const result = value.trim(); if (!result) throw new TributarioS4Error(`${label} é obrigatório.`); return result; };
const money = (value: string | number | Decimal) => new Decimal(String(value)).toDecimalPlaces(2);

async function assertNfseProviderScope(db: DatabaseExecutor, actor: TaxActor | null, taxpayerId: string, economicRegistrationId?: string) {
  if (!actor?.allowedBudgetUnitIds) return;
  const activities = await inspectionProviderActivities(db, taxpayerId, actor.allowedBudgetUnitIds, economicRegistrationId);
  if (!activities.length) throw new TributarioS4Error("Prestador sem credenciamento em unidade gestora autorizada.");
}

export async function requestNfseCredential(connection: DatabaseConnection, actor: TaxActor, input: { taxpayerId: string; economicRegistrationId: string; serviceActivityId: string }) {
  return withDatabaseTransaction(connection, async db => {
  const [taxpayer, registration, activity] = await Promise.all([
    db.select().from(taxpayers).where(and(eq(taxpayers.id, input.taxpayerId), eq(taxpayers.status, "Ativo"))).limit(1).then(rows => rows[0]),
    db.select().from(economicRegistrations).where(eq(economicRegistrations.id, input.economicRegistrationId)).limit(1).then(rows => rows[0]),
    db.select().from(inspectionActivities).where(and(eq(inspectionActivities.id, input.serviceActivityId), eq(inspectionActivities.isActive, true))).limit(1).then(rows => rows[0]),
  ]);
  if (!taxpayer || !registration || registration.taxpayerId !== taxpayer.id || !activity) throw new TributarioS4Error("Prestador, inscrição municipal ou atividade inválidos.");
  await resolveTaxAssessmentScope(db, actor, activity.taxId);
  const [credential] = await db.insert(inspectionCredentials).values({ taxpayerId: taxpayer.id, economicRegistrationId: registration.id, serviceActivityId: activity.id, termsAcceptedAt: new Date(), createdByUsuarioId: actor.usuarioId }).returning();
  await db.insert(inspectionCredentialEvents).values({ credentialId: credential.id, eventType: "SOLICITADO", description: "Solicitação de credenciamento recebida.", actorUsuarioId: actor.usuarioId });
  return credential;
  }, { timeoutMs: 5000 });
}

export async function decideNfseCredential(connection: DatabaseConnection, actor: TaxActor, input: { id: string; approved: boolean; reason: string }) {
  return withDatabaseTransaction(connection, async db => {
  const [item] = await db.select().from(inspectionCredentials).where(eq(inspectionCredentials.id, input.id)).for("update");
  if (!item || item.status !== "SOLICITADO") throw new TributarioS4Error("O credenciamento não está disponível para análise.");
  const activity = found((await db.select().from(inspectionActivities).where(eq(inspectionActivities.id, item.serviceActivityId)).limit(1))[0]);
  await resolveTaxAssessmentScope(db, actor, activity.taxId);
  const status = input.approved ? "HABILITADO" : "REJEITADO";
  const [updated] = await db.update(inspectionCredentials).set({ status, analyzedAt: new Date(), enabledAt: input.approved ? new Date() : null, decisionReason: required(input.reason, "Fundamentação"), analyzedByUsuarioId: actor.usuarioId }).where(eq(inspectionCredentials.id, item.id)).returning();
  await db.insert(inspectionCredentialEvents).values({ credentialId: item.id, eventType: status, description: input.reason.trim(), actorUsuarioId: actor.usuarioId });
  return updated;
  }, { timeoutMs: 5000 });
}

export async function emitNfse(connection: DatabaseConnection, actor: TaxActor, input: NfseEmissionInput) {
  if (input.occasionalRequestId || input.rpsItemId) throw new TributarioS4Error("Emita documentos vinculados pelo fluxo de liberação da origem.");
  return withDatabaseTransaction(connection, tx => emitNfseInTransaction(tx, actor, input), { timeoutMs: 60000 });
}

async function emitNfseInTransaction(tx: DatabaseTransaction, actor: TaxActor, input: NfseEmissionInput, originSnapshot?: JsonValue) {
    const competence = parseCompetence(input.competence);
    const [provider, registration, activity] = await Promise.all([
       tx.select().from(taxpayers).where(and(eq(taxpayers.id, input.providerId), eq(taxpayers.status, "Ativo"))).limit(1).then(rows => rows[0]),
       tx.select().from(economicRegistrations).where(eq(economicRegistrations.id, input.economicRegistrationId)).limit(1).then(rows => rows[0]),
       tx.select({ activity: inspectionActivities, tax: taxes }).from(inspectionActivities).innerJoin(taxes, eq(taxes.id, inspectionActivities.taxId)).where(and(eq(inspectionActivities.id, input.serviceActivityId), eq(inspectionActivities.isActive, true))).limit(1).then(rows => rows[0] ? { ...rows[0].activity, tax: rows[0].tax } : undefined),
    ]);
    if (!provider || !registration || registration.status !== "Ativo" || registration.taxpayerId !== provider.id || !activity || !activity.tax.isActive) throw new TributarioS4Error("Prestador, inscrição ou atividade não conferem.");
    if (!activity.issRate) throw new TributarioS4Error("A atividade não possui alíquota de ISS configurada.");
     const [parameter] = await tx.select().from(pageParameters).where(and(eq(pageParameters.taxId, activity.taxId), eq(pageParameters.isActive, true), lte(pageParameters.effectiveFrom, competence), or(isNull(pageParameters.effectiveUntil), gte(pageParameters.effectiveUntil, competence)))).orderBy(desc(pageParameters.effectiveFrom)).limit(1);
    if (!parameter) throw new TributarioS4Error("Não há parâmetro fiscal ativo para a atividade informada.");
    const scope = await resolveTaxAssessmentScope(tx, actor, activity.taxId, originSnapshot);
    if (originSnapshot && !input.occasionalRequestId) {
      const routed = await resolveTaxAssessmentScope(tx, actor, activity.taxId);
      if (routed.budgetUnitId !== scope.budgetUnitId || routed.governmentEntityId !== scope.governmentEntityId) throw new TributarioS4Error("Roteamento fiscal mudou desde a emissão; concilie a UG de origem antes de substituir.");
    }
    const configuration = taxScopeSnapshot(parameter.configuration);
    const cancellationDays = configuration.nfseCancellationDays ?? 7;
    if (typeof cancellationDays !== "number" || !Number.isSafeInteger(cancellationDays) || cancellationDays < 0 || cancellationDays > 3650) throw new TributarioS4Error("Prazo de cancelamento NFS-e inválido no parâmetro fiscal.");
    if (!input.occasionalRequestId) {
       const [credential] = await tx.select({ id: inspectionCredentials.id }).from(inspectionCredentials).where(and(eq(inspectionCredentials.taxpayerId, provider.id), eq(inspectionCredentials.economicRegistrationId, registration.id), eq(inspectionCredentials.serviceActivityId, activity.id), eq(inspectionCredentials.status, "HABILITADO"))).limit(1);
      if (!credential) throw new TributarioS4Error("O prestador precisa de credenciamento habilitado para emitir NFS-e.");
    }
    if (input.takerId) {
       const [taker] = await tx.select({ id: taxpayers.id }).from(taxpayers).where(and(eq(taxpayers.id, input.takerId), eq(taxpayers.status, "Ativo"))).limit(1);
      if (!taker) throw new TributarioS4Error("Tomador ativo não encontrado.");
    }
    const usages = input.creditUsages ?? [];
    if (new Set(usages.map(usage => usage.creditId)).size !== usages.length) throw new TributarioS4Error("Não repita um crédito de dedução na mesma nota.");
     let creditTotal = new Decimal(0);
     const credits: { id: string; amount: Decimal; available: Decimal }[] = [];
    for (const usage of [...usages].sort((a, b) => a.creditId.localeCompare(b.creditId))) {
       const [credit] = await tx.select().from(inspectionDeductionCredits).where(eq(inspectionDeductionCredits.id, usage.creditId)).for("update");
      const amount = money(usage.amount);
       if (!credit || credit.taxpayerId !== provider.id || credit.economicRegistrationId && credit.economicRegistrationId !== registration.id || credit.status !== "DISPONIVEL" || !amount.isFinite() || amount.lessThanOrEqualTo(0) || amount.greaterThan(credit.availableAmountDecimal)) throw new TributarioS4Error("Crédito de dedução indisponível ou saldo insuficiente.");
      creditTotal = creditTotal.plus(amount); credits.push({ id: credit.id, amount, available: credit.availableAmountDecimal });
    }
    const manualDeductions = money(input.manualDeductions ?? 0);
    if (!manualDeductions.isFinite() || manualDeductions.lt(0)) throw new TributarioS4Error("Dedução manual deve ser finita e não negativa.");
    const deductions = manualDeductions.plus(creditTotal);
    const historicalRate = taxScopeSnapshot(originSnapshot).rate;
     const rate = typeof historicalRate === "string" || typeof historicalRate === "number" ? new Decimal(historicalRate) : activity.issRate;
    const calc = calculateNfse({ serviceValue: input.serviceValue, deductions, ratePercent: rate, retained: input.retained });
    const verificationCode = randomUUID().replaceAll("-", "").slice(0, 16).toUpperCase();
     const [invoice] = await tx.insert(taxInvoices).values({ verificationCode, serviceValue: Number(calc.serviceValue), serviceValueDecimal: calc.serviceValue, deductions: Number(calc.deductions), deductionsDecimal: calc.deductions, issRetained: input.retained, issValue: Number(calc.iss), issValueDecimal: calc.iss, competence: required(input.competence, "Competência"), status: "Emitida", providerId: provider.id, takerId: input.takerId || null }).returning();
    const authenticityUrl = `/portal/nfse/${verificationCode}`;
    const activityRelationships = scope.governmentEntityId
      ? await readMunicipalServiceRelationships(tx, { governmentEntityId: scope.governmentEntityId, activityId: activity.id, date: competence })
      : { status: "NOT_RECONCILED", relationships: [] };
    const snapshot = { ...scope, formula: "(valorServico - deducoes) × aliquota", serviceValue: calc.serviceValue.toFixed(2), deductions: calc.deductions.toFixed(2), taxableBase: calc.taxableBase.toFixed(2), rate: calc.rate.toString(), iss: calc.iss.toFixed(2), ownIss: calc.ownIss.toFixed(2), retainedIss: calc.retainedIss.toFixed(2), parameterId: parameter.id, cancellationDays, cancellationDaysEstimated: configuration.nfseCancellationDays === undefined, activityRelationships };
     await tx.insert(nfseInvoiceData).values({ invoiceId: invoice.id, economicRegistrationId: registration.id, serviceActivityId: activity.id, parameterId: parameter.id, serviceDescription: required(input.serviceDescription, "Descrição do serviço"), serviceLocation: input.serviceLocation?.trim() || null, taxableBaseDecimal: calc.taxableBase, rate: calc.rate, ownIssDecimal: calc.ownIss, retainedIssDecimal: calc.retainedIss, retentionType: input.retained ? "RETIDO" : "PROPRIO", calculationSnapshot: asJson(snapshot), source: input.source ?? "WEB", authenticityUrl, qrPayload: authenticityUrl, occasionalRequestId: input.occasionalRequestId, rpsItemId: input.rpsItemId });
     await insertInspectionEvent(tx, { invoiceId: invoice.id, eventType: "EMITIDA", description: "NFS-e emitida com cálculo fiscal persistido.", actorUsuarioId: actor.usuarioId, payload: snapshot });
     const [declaration] = await tx.insert(inspectionDeclarations).values({ taxpayerId: provider.id, economicRegistrationId: registration.id, activityId: activity.id, competence, serviceValueDecimal: calc.serviceValue, deductionValueDecimal: calc.deductions, issValueDecimal: calc.iss, status: input.retained ? "ISS_RETIDO" : "ISS_PROPRIO", calculationSnapshot: asJson({ ...snapshot, invoiceId: invoice.id, automatic: true }) }).returning();
    if (input.retained && !input.takerId) throw new TributarioS4Error("ISS retido exige tomador identificado como responsável tributário.");
    if (calc.iss.gt(0) && !input.occasionalRequestId) {
      const assessment = await createTaxAssessmentInTransaction(tx, actor, { year: competence.getUTCFullYear(), taxId: activity.taxId, taxpayerId: input.retained ? input.takerId! : provider.id, economicRegistrationId: input.retained ? undefined : registration.id, competence, taxableBase: calc.taxableBase, rate: calc.rate });
       await tx.update(taxAssessments).set({ calculationSnapshot: asJson({ ...taxScopeSnapshot(assessment.calculationSnapshot), invoiceId: invoice.id, declarationId: declaration.id, automatic: true, retentionType: input.retained ? "RETIDO" : "PROPRIO" }) }).where(eq(taxAssessments.id, assessment.id));
       await insertInspectionEvent(tx, { invoiceId: invoice.id, eventType: "DEBITO_CONSTITUIDO", description: "Débito ISS constituído pela origem fiscal e matriz contábil canônicas.", actorUsuarioId: actor.usuarioId, payload: { assessmentId: assessment.id, declarationId: declaration.id } });
    }
    for (const direction of ["PRESTADOS", ...(input.takerId ? ["TOMADOS"] : [])]) {
       await tx.insert(inspectionDmsDeclarations).values({ protocol: `NFSE:${invoice.id}:${direction}`, taxpayerId: direction === "PRESTADOS" ? provider.id : input.takerId!, economicRegistrationId: direction === "PRESTADOS" ? registration.id : null, competence: input.competence, direction, channel: "NFSE_AUTOMATICA", detailMode: "DOCUMENTO", serviceValueDecimal: calc.serviceValue, deductionValueDecimal: calc.deductions, ownIssDecimal: direction === "PRESTADOS" ? calc.ownIss : new Decimal(0), retainedIssDecimal: direction === "TOMADOS" ? calc.retainedIss : new Decimal(0), payload: asJson({ ...snapshot, invoiceId: invoice.id, automatic: true }), createdByUsuarioId: actor.usuarioId });
    }
    for (const credit of credits) {
      const remaining = credit.available.minus(credit.amount);
       await tx.update(inspectionDeductionCredits).set({ availableAmountDecimal: remaining, status: remaining.equals(0) ? "ESGOTADO" : "DISPONIVEL" }).where(eq(inspectionDeductionCredits.id, credit.id));
       await tx.insert(inspectionDeductionConsumptions).values({ creditId: credit.id, invoiceId: invoice.id, amountDecimal: credit.amount });
    }
     if (input.rpsItemId) await tx.update(inspectionRpsItems).set({ status: "CONVERTIDO", invoiceId: invoice.id }).where(eq(inspectionRpsItems.id, input.rpsItemId));
     if (input.occasionalRequestId) await tx.update(inspectionOccasionalRequests).set({ status: "EMITIDA", invoiceId: invoice.id, releasedAt: new Date() }).where(eq(inspectionOccasionalRequests.id, input.occasionalRequestId));
    return invoice;
}

function parseCompetence(value: string) {
  const match = value.match(/^(0[1-9]|1[0-2])\/(\d{4})$/);
  if (!match) throw new TributarioS4Error("Competência deve estar no formato MM/AAAA.");
  return new Date(Date.UTC(Number(match[2]), Number(match[1]) - 1, 1, 12));
}

export async function substituteNfse(connection: DatabaseConnection, actor: TaxActor, input: { invoiceId: string; reason: string; serviceDescription: string; serviceValue: number; deductions: number; retained: boolean }) {
  const reason = required(input.reason, "Motivo");
  return withDatabaseTransaction(connection, async tx => {
    const old = found((await tx.select().from(taxInvoices).where(eq(taxInvoices.id, input.invoiceId)).for("update"))[0]);
    const data = found((await tx.select().from(nfseInvoiceData).where(eq(nfseInvoiceData.invoiceId, old.id)).limit(1))[0]);
    const activity = found((await tx.select().from(inspectionActivities).where(eq(inspectionActivities.id, data.serviceActivityId)).limit(1))[0]);
    await resolveTaxAssessmentScope(tx, actor, activity.taxId, data.calculationSnapshot);
    if (old.status === "Substituída" && data.replacementInvoiceId) {
      const event = found((await tx.select().from(nfseEvents).where(and(eq(nfseEvents.invoiceId, old.id), eq(nfseEvents.eventType, "SUBSTITUIDA"))).limit(1))[0]);
      const stored = taxScopeSnapshot(event.payload).input;
      if (JSON.stringify(stored) !== JSON.stringify(asJson(input))) {
        const normalized = taxScopeSnapshot(stored);
        if (event.description !== reason || Object.entries(input).some(([key, value]) => normalized[key] !== value)) throw new TributarioS4Error("NFS-e já substituída com outros dados.");
      }
      return found((await tx.select().from(taxInvoices).where(eq(taxInvoices.id, data.replacementInvoiceId)).limit(1))[0]);
    }
    if (old.status !== "Emitida") throw new TributarioS4Error("Somente NFS-e emitida pode ser substituída.");
    await reverseNfseWriting(tx, actor, old.id, "SUBSTITUIDA", reason);
    const created = await emitNfseInTransaction(tx, actor, { providerId: old.providerId, takerId: old.takerId ?? undefined, economicRegistrationId: data.economicRegistrationId, serviceActivityId: data.serviceActivityId, competence: old.competence, serviceDescription: input.serviceDescription, serviceLocation: data.serviceLocation ?? undefined, serviceValue: input.serviceValue, manualDeductions: input.deductions, retained: input.retained, source: "SUBSTITUICAO" }, data.calculationSnapshot);
    await tx.update(taxInvoices).set({ status: "Substituída" }).where(eq(taxInvoices.id, old.id));
    await tx.update(nfseInvoiceData).set({ replacementInvoiceId: created.id }).where(eq(nfseInvoiceData.invoiceId, old.id));
    await tx.update(nfseInvoiceData).set({ replacedInvoiceId: old.id }).where(eq(nfseInvoiceData.invoiceId, created.id));
    await insertInspectionEvent(tx, { invoiceId: old.id, eventType: "SUBSTITUIDA", description: reason, actorUsuarioId: actor.usuarioId, payload: { replacementInvoiceId: created.id, input } });
    await insertInspectionEvent(tx, { invoiceId: created.id, eventType: "SUBSTITUTA", description: `Substitui a NFS-e ${old.invoiceNumber}.`, actorUsuarioId: actor.usuarioId, payload: { replacedInvoiceId: old.id } });
    return created;
  }, { timeoutMs: 60000 });
}

async function reverseNfseWriting(tx: DatabaseTransaction, actor: TaxActor, invoiceId: string, status: "CANCELADA" | "SUBSTITUIDA", reason: string) {
  const declarations = await tx.select().from(inspectionDeclarations).where(sql`${inspectionDeclarations.calculationSnapshot}->'invoiceId'=${JSON.stringify(invoiceId)}::jsonb`);
  const assessments = await tx.select().from(taxAssessments).where(and(or(sql`${taxAssessments.calculationSnapshot}->'invoiceId'=${JSON.stringify(invoiceId)}::jsonb`, ...declarations.map(declaration => sql`${taxAssessments.calculationSnapshot}->'declarationId'=${JSON.stringify(declaration.id)}::jsonb`)), notInArray(taxAssessments.status, ["Cancelado", "Extinto"])) ).orderBy(asc(taxAssessments.id));
  const [occasional] = await tx.select({ id: inspectionOccasionalRequests.id }).from(inspectionOccasionalRequests).where(and(eq(inspectionOccasionalRequests.invoiceId, invoiceId), isNotNull(inspectionOccasionalRequests.assessmentId))).limit(1);
  if (occasional) throw new TributarioS4Error("Regularize o débito/guia da nota avulsa pela origem antes de cancelar ou substituir a escrita.");
  for (const origin of assessments) {
    const assessment = found((await tx.select().from(taxAssessments).where(eq(taxAssessments.id, origin.id)).for("update"))[0]);
    const scope = await resolveTaxAssessmentScope(tx, actor, assessment.taxId, assessment.calculationSnapshot);
    const date = new Date();
    const year = await resolveTaxFinancialYear(tx, date.getUTCFullYear(), scope);
    await assertAccountingPeriodOpen(tx, year.id, date);
    const [received] = await tx.select({ id: taxPayments.id }).from(taxPayments).innerJoin(taxGuides, eq(taxGuides.id, taxPayments.guideId)).where(and(eq(taxGuides.assessmentId, assessment.id), eq(taxPayments.status, "Confirmado"))).limit(1);
    const [debt] = await tx.select({ id: taxActiveDebts.id }).from(taxActiveDebts).where(eq(taxActiveDebts.assessmentId, assessment.id)).limit(1);
    if (received || debt || (await taxAssessmentCompensatedValue(tx, assessment.id)).gt(0)) throw new TributarioS4Error("Débito com arrecadação, compensação ou dívida ativa exige regularização pela origem antes da alteração fiscal.");
    if (!assessment.finalValueDecimal) throw new TributarioS4Error("Débito da nota sem Decimal conciliado.");
    await tx.update(taxGuides).set({ status: "Cancelada" }).where(and(eq(taxGuides.assessmentId, assessment.id), ne(taxGuides.status, "Cancelada")));
    await postTaxAssessmentAdjustment(tx, actor, { assessmentId: assessment.id, date, delta: assessment.finalValueDecimal.negated(), kind: "EXTINCTION", reason, idempotencyKey: `NFSE:${invoiceId}:${status}:${assessment.id}` });
    await tx.insert(taxRegistryEntries).values({ entityType: "TAX_ASSESSMENT", entityId: assessment.id, category: "CREDIT_EVENT", title: `NFS-e ${status}`, source: "NFSE", actorUsuarioId: actor.usuarioId, data: { ...scope, invoiceId, eventType: "EXTINCAO_NAO_FINANCEIRA", oldValue: assessment.finalValueDecimal.toFixed(2), newValue: "0.00", amount: assessment.finalValueDecimal.toFixed(2), reason, operationFinancialYearId: year.id } });
    await tx.update(taxAssessments).set({ status: "Cancelado", finalValueDecimal: new Decimal(0) }).where(eq(taxAssessments.id, assessment.id));
  }
  await tx.update(inspectionDeclarations).set({ status }).where(inArray(inspectionDeclarations.id, declarations.map(declaration => declaration.id)));
  await tx.update(inspectionDmsDeclarations).set({ status }).where(and(eq(inspectionDmsDeclarations.channel, "NFSE_AUTOMATICA"), sql`${inspectionDmsDeclarations.payload}->'invoiceId'=${JSON.stringify(invoiceId)}::jsonb`));
  const consumptions = await tx.select().from(inspectionDeductionConsumptions).where(eq(inspectionDeductionConsumptions.invoiceId, invoiceId)).orderBy(asc(inspectionDeductionConsumptions.creditId));
  for (const consumption of consumptions) {
    const credit = found((await tx.select().from(inspectionDeductionCredits).where(eq(inspectionDeductionCredits.id, consumption.creditId)).for("update"))[0]);
    const restored = credit.availableAmountDecimal.plus(consumption.amountDecimal);
    if (restored.gt(credit.originalAmountDecimal)) throw new TributarioS4Error("Saldo do crédito de dedução diverge dos consumos históricos.");
    await tx.update(inspectionDeductionCredits).set({ availableAmountDecimal: restored, status: "DISPONIVEL" }).where(eq(inspectionDeductionCredits.id, credit.id));
  }
}

export async function cancelNfse(connection: DatabaseConnection, actor: TaxActor, input: { invoiceId: string; reason: string; approve?: boolean }) {
  const reason = required(input.reason, "Motivo");
  return withDatabaseTransaction(connection, async tx => {
    const invoice = found((await tx.select().from(taxInvoices).where(eq(taxInvoices.id, input.invoiceId)).for("update"))[0]);
    const data = found((await tx.select().from(nfseInvoiceData).where(eq(nfseInvoiceData.invoiceId, invoice.id)).limit(1))[0]);
    const activity = found((await tx.select().from(inspectionActivities).where(eq(inspectionActivities.id, data.serviceActivityId)).limit(1))[0]);
    await resolveTaxAssessmentScope(tx, actor, activity.taxId, data.calculationSnapshot);
    if (invoice.status === "Cancelada") {
      const event = found((await tx.select().from(nfseEvents).where(and(eq(nfseEvents.invoiceId, invoice.id), eq(nfseEvents.eventType, "CANCELADA"))).limit(1))[0]);
      if (event.description !== reason) throw new TributarioS4Error("NFS-e já cancelada com outro fundamento.");
      return { status: invoice.status, automatic: taxScopeSnapshot(event.payload).automatic === true };
    }
    if (!["Emitida", "Cancelamento pendente"].includes(invoice.status)) throw new TributarioS4Error("NFS-e indisponível para cancelamento.");
    const days = taxScopeSnapshot(data.calculationSnapshot).cancellationDays ?? 7;
    if (typeof days !== "number" || !Number.isSafeInteger(days) || days < 0) throw new TributarioS4Error("Prazo histórico de cancelamento inválido.");
    const automatic = Date.now() - invoice.createdAt.getTime() <= days * 86400000;
    const approved = automatic || input.approve === true;
    const status = approved ? "Cancelada" : "Cancelamento pendente";
    if (approved) await reverseNfseWriting(tx, actor, invoice.id, "CANCELADA", reason);
    await tx.update(taxInvoices).set({ status }).where(eq(taxInvoices.id, invoice.id));
    await insertInspectionEvent(tx, { invoiceId: invoice.id, eventType: approved ? "CANCELADA" : "CANCELAMENTO_SOLICITADO", description: reason, actorUsuarioId: actor.usuarioId, payload: { automatic, approved, cancellationDays: days } });
    return { status, automatic };
  }, { timeoutMs: 60000 });
}

export async function createCorrectionLetter(connection: DatabaseConnection, actor: TaxActor, input: { invoiceId: string; reason: string; changes: Record<string, string> }) {
  return withDatabaseTransaction(connection, async db => {
  const [invoice] = await db.select().from(taxInvoices).where(eq(taxInvoices.id, input.invoiceId)).for("update");
  if (!invoice || invoice.status !== "Emitida") throw new TributarioS4Error("Carta de correção exige NFS-e emitida.");
  const data = found((await db.select().from(nfseInvoiceData).where(eq(nfseInvoiceData.invoiceId, invoice.id)).limit(1))[0]);
  const activity = found((await db.select().from(inspectionActivities).where(eq(inspectionActivities.id, data.serviceActivityId)).limit(1))[0]);
  await resolveTaxAssessmentScope(db, actor, activity.taxId, data.calculationSnapshot);
  const changes = validateCorrectionChanges(input.changes);
  const [letter] = await db.insert(nfseCorrectionLetters).values({ invoiceId: invoice.id, reason: required(input.reason, "Motivo"), changes, createdByUsuarioId: actor.usuarioId }).returning();
  await insertInspectionEvent(db, { invoiceId: invoice.id, eventType: "CARTA_CORRECAO", description: input.reason.trim(), actorUsuarioId: actor.usuarioId, payload: { letterId: letter.id, changes } });
  return letter;
  }, { timeoutMs: 5000 });
}

export async function receiveRpsBatch(connection: DatabaseConnection, actor: TaxActor | null, input: NfseRpsInput) {
  if (!input.items.length) throw new TributarioS4Error("O lote deve conter ao menos um RPS.");
  return withDatabaseTransaction(connection, async db => {
  await assertNfseProviderScope(db, actor, input.providerTaxpayerId);
  const payloadHash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  await db.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`NFSE:RPS:${input.batchNumber}`},0))::text`);
  const [existing] = await db.select().from(inspectionRpsBatches).where(eq(inspectionRpsBatches.batchNumber, input.batchNumber)).limit(1);
  if (existing) { if (existing.payloadHash !== payloadHash) throw new TributarioS4Error("Número de lote já recebido com conteúdo diferente."); return existing; }
  const [provider] = await db.select({ id: taxpayers.id }).from(taxpayers).where(and(eq(taxpayers.id, input.providerTaxpayerId), eq(taxpayers.status, "Ativo"))).limit(1);
  if (!provider) throw new TributarioS4Error("Prestador ativo não encontrado.");
  const [batch] = await db.insert(inspectionRpsBatches).values({ batchNumber: required(input.batchNumber, "Número do lote"), providerTaxpayerId: provider.id, source: input.source, payloadHash, protocol: `RPS-${randomUUID().slice(0, 8).toUpperCase()}`, createdByUsuarioId: actor?.usuarioId }).returning();
  const items = await db.insert(inspectionRpsItems).values(input.items.map(item => { const payload = asJson(item.payload); return { batchId: batch.id, rpsNumber: required(item.rpsNumber, "Número do RPS"), payload: payload === null ? JsonNull : payload }; })).returning();
  return { ...batch, items };
  }, { timeoutMs: 5000 });
}

export async function updateRpsItem(connection: DatabaseConnection, input: { id: string; action: "CANCELAR" | "SUBSTITUIR"; replacedRpsNumber?: string }, actor: TaxActor) {
  return withDatabaseTransaction(connection, async tx => {
    const [item] = await tx.select().from(inspectionRpsItems).where(eq(inspectionRpsItems.id, input.id)).for("update");
    if (!item || item.status !== "RECEBIDO" || item.invoiceId) throw new TributarioS4Error("RPS convertido deve ser regularizado pela NFS-e de origem.");
    const batch = found((await tx.select().from(inspectionRpsBatches).where(eq(inspectionRpsBatches.id, item.batchId)).limit(1))[0]);
    await assertNfseProviderScope(tx, actor, batch.providerTaxpayerId);
    if (!["CANCELAR", "SUBSTITUIR"].includes(input.action)) throw new TributarioS4Error("Operação RPS inválida.");
    const replacedRpsNumber = input.action === "SUBSTITUIR" ? required(input.replacedRpsNumber ?? "", "RPS substituto") : null;
    if (replacedRpsNumber === item.rpsNumber) throw new TributarioS4Error("RPS não pode substituir a si próprio.");
    return (await tx.update(inspectionRpsItems).set(input.action === "CANCELAR" ? { status: "CANCELADO", cancelledAt: new Date() } : { status: "SUBSTITUIDO", replacedRpsNumber }).where(eq(inspectionRpsItems.id, item.id)).returning())[0];
  }, { timeoutMs: 5000 });
}

export async function createDmsDeclaration(connection: DatabaseConnection, actor: TaxActor | null, input: NfseDmsInput) {
  parseCompetence(input.competence);
  const direction = input.direction === "PRESTADO" ? "PRESTADOS" : input.direction === "TOMADO" ? "TOMADOS" : input.direction;
  if (!["PRESTADOS", "TOMADOS"].includes(direction) || input.channel === "NFSE_AUTOMATICA") throw new TributarioS4Error("Escrita NFS-e é protegida; altere-a exclusivamente pelo documento de origem.");
  const submitted = [input.serviceValue, input.deductions, input.ownIss, input.retainedIss];
  if (submitted.some(value => !Number.isFinite(value) || value < 0)) throw new TributarioS4Error("Os valores da DMS devem ser finitos e não negativos.");
  if (input.deductions > input.serviceValue || input.noMovement && submitted.some(value => value !== 0)) throw new TributarioS4Error("Valores incompatíveis com as deduções ou declaração sem movimento.");
  return withDatabaseTransaction(connection, async tx => {
    const [taxpayer] = await tx.select({ id: taxpayers.id }).from(taxpayers).where(and(eq(taxpayers.id, input.taxpayerId), eq(taxpayers.status, "Ativo"))).limit(1);
    if (!taxpayer) throw new TributarioS4Error("Contribuinte ativo não encontrado.");
    if (input.economicRegistrationId) {
      const registration = found((await tx.select().from(economicRegistrations).where(eq(economicRegistrations.id, input.economicRegistrationId)).limit(1))[0]);
      if (registration.taxpayerId !== taxpayer.id || registration.status !== "Ativo") throw new TributarioS4Error("Inscrição econômica fora do contribuinte ou inativa.");
    }
    const serviceTaxes = await inspectionServiceTaxes(tx, actor?.allowedBudgetUnitIds);
    if (serviceTaxes.length !== 1) throw new TributarioS4Error("DMS exige tributo de serviço único e roteamento municipal conciliado.");
    const scope = await resolveTaxAssessmentScope(tx, actor ?? { usuarioId: "NFSE_WEBSERVICE", employeeId: null }, serviceTaxes[0].id);
    let rectified: string | null = null;
    if (input.rectifiesDeclarationId) {
      const old = found((await tx.select().from(inspectionDmsDeclarations).where(eq(inspectionDmsDeclarations.id, input.rectifiesDeclarationId)).for("update"))[0]);
      const memory = taxScopeSnapshot(old.payload);
      if (old.channel === "NFSE_AUTOMATICA" || memory.automatic === true || typeof memory.invoiceId === "string") throw new TributarioS4Error("Declaração automática só admite correção pela NFS-e de origem.");
      const oldDirection = old.direction === "PRESTADO" ? "PRESTADOS" : old.direction === "TOMADO" ? "TOMADOS" : old.direction;
      if (old.status !== "PROTOCOLADA" || old.taxpayerId !== taxpayer.id || old.competence !== input.competence || oldDirection !== direction || old.economicRegistrationId !== (input.economicRegistrationId || null) || memory.budgetUnitId !== scope.budgetUnitId || memory.governmentEntityId !== scope.governmentEntityId) throw new TributarioS4Error("Retificação fora da identidade, competência, UG ou edição vigente.");
      await tx.update(inspectionDmsDeclarations).set({ status: "RETIFICADA" }).where(eq(inspectionDmsDeclarations.id, old.id));
      rectified = old.id;
    }
    const rawPayload = asJson(input.payload ?? {});
    const payload = taxScopeSnapshot(rawPayload);
    if (payload.automatic === true || typeof payload.invoiceId === "string") throw new TributarioS4Error("Origem automática não pode ser informada na declaração manual.");
    return (await tx.insert(inspectionDmsDeclarations).values({ protocol: `DMS-${randomUUID().slice(0, 8).toUpperCase()}`, taxpayerId: taxpayer.id, economicRegistrationId: input.economicRegistrationId || null, competence: input.competence, direction, channel: required(input.channel, "Canal"), detailMode: required(input.detailMode, "Detalhamento"), noMovement: input.noMovement, rectifiesDeclarationId: rectified, serviceValueDecimal: new Decimal(String(submitted[0])), deductionValueDecimal: new Decimal(String(submitted[1])), ownIssDecimal: new Decimal(String(submitted[2])), retainedIssDecimal: new Decimal(String(submitted[3])), payload: asJson({ ...payload, ...scope, taxId: serviceTaxes[0].id, automatic: false }), createdByUsuarioId: actor?.usuarioId }).returning())[0];
  }, { timeoutMs: 60000 });
}

export async function createDeductionCredit(db: DatabaseExecutor, actor: TaxActor, input: { taxpayerId: string; economicRegistrationId?: string; creditType: string; originDocument: string; constructionReference?: string; amount: number }) {
  await assertNfseProviderScope(db, actor, input.taxpayerId, input.economicRegistrationId);
  const amount = money(input.amount);
  if (!amount.isFinite() || amount.lessThanOrEqualTo(0)) throw new TributarioS4Error("O crédito deve ser finito e maior que zero.");
  return (await db.insert(inspectionDeductionCredits).values({ taxpayerId: input.taxpayerId, economicRegistrationId: input.economicRegistrationId || null, creditType: required(input.creditType, "Tipo"), originDocument: required(input.originDocument, "Documento de origem"), constructionReference: input.constructionReference?.trim() || null, originalAmountDecimal: amount, availableAmountDecimal: amount, createdByUsuarioId: actor.usuarioId }).returning())[0];
}

export async function createOccasionalRequest(connection: DatabaseConnection, actor: TaxActor, input: NfseOccasionalInput) {
  return withDatabaseTransaction(connection, tx => createOccasionalRequestInTransaction(tx, actor, input), { timeoutMs: 5000 });
}

export async function createOccasionalRequestInTransaction(tx: DatabaseTransaction, actor: TaxActor, input: NfseOccasionalInput) {
  const [activity] = await tx.select().from(inspectionActivities).where(and(eq(inspectionActivities.id, input.serviceActivityId), eq(inspectionActivities.isActive, true))).limit(1);
  if (!activity?.issRate) throw new TributarioS4Error("Atividade sem alíquota configurada.");
  await resolveTaxAssessmentScope(tx, actor, activity.taxId);
  const calc = calculateNfse({ serviceValue: input.serviceValue, deductions: input.deductions, ratePercent: activity.issRate, retained: false });
  return (await tx.insert(inspectionOccasionalRequests).values({ requestNumber: await nextNumber(tx, "NFSE_AVULSA", "NSA"), providerTaxpayerId: input.providerTaxpayerId, takerTaxpayerId: input.takerTaxpayerId || null, serviceActivityId: activity.id, serviceDescription: required(input.serviceDescription, "Descrição"), serviceValueDecimal: calc.serviceValue, deductionValueDecimal: calc.deductions, taxAmountDecimal: calc.iss, paymentRequired: input.paymentRequired, createdByUsuarioId: actor.usuarioId }).returning())[0];
}

export async function approveOccasionalRequest(connection: DatabaseConnection, actor: TaxActor, id: string) {
  return withDatabaseTransaction(connection, async tx => {
    const request = found((await tx.select().from(inspectionOccasionalRequests).where(eq(inspectionOccasionalRequests.id, id)).for("update"))[0]);
    const [activity] = await tx.select().from(inspectionActivities).where(and(eq(inspectionActivities.id, request.serviceActivityId), eq(inspectionActivities.isActive, true))).limit(1);
    if (!activity?.issRate) throw new TributarioS4Error("Atividade sem alíquota de ISS configurada.");
    const old = request.assessmentId ? found((await tx.select().from(taxAssessments).where(eq(taxAssessments.id, request.assessmentId)).limit(1))[0]) : null;
    await resolveTaxAssessmentScope(tx, actor, activity.taxId, old?.calculationSnapshot);
    if (["AGUARDANDO_PAGAMENTO", "APROVADA", "EMITIDA"].includes(request.status) && old) return request;
    if (request.status !== "SOLICITADA" || old) throw new TributarioS4Error("Solicitação avulsa indisponível.");
    const competence = new Date();
    const base = request.serviceValueDecimal.minus(request.deductionValueDecimal);
    const calculation = calculateNfse({ serviceValue: request.serviceValueDecimal, deductions: request.deductionValueDecimal, ratePercent: activity.issRate, retained: false });
    if (!calculation.iss.eq(request.taxAmountDecimal)) throw new TributarioS4Error("Alíquota mudou após a solicitação; revise os valores antes de aprovar.");
    const assessment = await createTaxAssessmentInTransaction(tx, actor, { year: competence.getUTCFullYear(), competence, taxId: activity.taxId, taxpayerId: request.providerTaxpayerId, taxableBase: base, rate: activity.issRate });
    await tx.update(taxAssessments).set({ calculationSnapshot: asJson({ ...taxScopeSnapshot(assessment.calculationSnapshot), origin: "NFSE_AVULSA", requestId: request.id }) }).where(eq(taxAssessments.id, assessment.id));
    const guide = request.paymentRequired ? await generateTaxGuideInTransaction(tx, actor, { assessmentId: assessment.id, dueDate: new Date(Date.UTC(assessment.year, 11, 31, 12)) }) : null;
    return (await tx.update(inspectionOccasionalRequests).set({ status: request.paymentRequired ? "AGUARDANDO_PAGAMENTO" : "APROVADA", assessmentId: assessment.id, guideId: guide?.id ?? null, approvedAt: competence }).where(eq(inspectionOccasionalRequests.id, id)).returning())[0];
  }, { timeoutMs: 60000 });
}

export async function releaseOccasionalRequest(connection: DatabaseConnection, actor: TaxActor, id: string, economicRegistrationId: string) {
  return withDatabaseTransaction(connection, async tx => {
    const origin = found((await tx.select().from(inspectionOccasionalRequests).where(eq(inspectionOccasionalRequests.id, id)).limit(1))[0]);
    if (!origin.assessmentId) throw new TributarioS4Error("A solicitação avulsa exige aprovação com débito de origem.");
    const assessment = found((await tx.select().from(taxAssessments).where(eq(taxAssessments.id, origin.assessmentId)).for("update"))[0]);
    const request = found((await tx.select().from(inspectionOccasionalRequests).where(eq(inspectionOccasionalRequests.id, id)).for("update"))[0]);
    await resolveTaxAssessmentScope(tx, actor, assessment.taxId, assessment.calculationSnapshot);
    if (request.status === "EMITIDA" && request.invoiceId) {
      const data = found((await tx.select().from(nfseInvoiceData).where(eq(nfseInvoiceData.invoiceId, request.invoiceId)).limit(1))[0]);
      if (data.economicRegistrationId !== economicRegistrationId) throw new TributarioS4Error("Nota avulsa já emitida para outra inscrição.");
      return found((await tx.select().from(taxInvoices).where(eq(taxInvoices.id, request.invoiceId)).limit(1))[0]);
    }
    if (!["APROVADA", "AGUARDANDO_PAGAMENTO"].includes(request.status) || ["Cancelado", "Extinto", "Suspenso"].includes(assessment.status)) throw new TributarioS4Error("Solicitação avulsa indisponível para liberação.");
    if (request.paymentRequired) {
      const guide = request.guideId ? (await tx.select().from(taxGuides).where(eq(taxGuides.id, request.guideId)).limit(1))[0] : null;
      const payments = await tx.select({ amountPaidDecimal: taxPayments.amountPaidDecimal }).from(taxPayments).innerJoin(taxGuides, eq(taxGuides.id, taxPayments.guideId)).where(and(eq(taxGuides.assessmentId, assessment.id), eq(taxPayments.status, "Confirmado")));
      if (!guide || guide.assessmentId !== assessment.id || guide.status === "Cancelada" || !assessment.finalValueDecimal || payments.some(payment => !payment.amountPaidDecimal) || payments.reduce((sum, payment) => sum.plus(payment.amountPaidDecimal!), new Decimal(0)).lt(assessment.finalValueDecimal)) throw new TributarioS4Error("A NFS-e avulsa só pode ser liberada após pagamento Decimal integral confirmado.");
    }
    const competence = assessment.competence ?? request.approvedAt;
    const rate = assessment.rate;
    if (!competence || !rate || !calculateNfse({ serviceValue: request.serviceValueDecimal, deductions: request.deductionValueDecimal, ratePercent: rate, retained: false }).iss.eq(request.taxAmountDecimal)) throw new TributarioS4Error("Valores da emissão divergem do débito aprovado; regularize a origem.");
    return emitNfseInTransaction(tx, actor, { providerId: request.providerTaxpayerId, takerId: request.takerTaxpayerId ?? undefined, economicRegistrationId, serviceActivityId: request.serviceActivityId, competence: `${String(competence.getUTCMonth() + 1).padStart(2, "0")}/${competence.getUTCFullYear()}`, serviceDescription: request.serviceDescription, serviceValue: request.serviceValueDecimal.toFixed(2), manualDeductions: request.deductionValueDecimal.toFixed(2), retained: false, source: "AVULSA", occasionalRequestId: request.id }, assessment.calculationSnapshot ?? undefined);
  }, { timeoutMs: 60000 });
}
