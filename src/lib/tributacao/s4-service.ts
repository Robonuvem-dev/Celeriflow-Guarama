import { Prisma, type PrismaClient } from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";
import { calculateNfse, validateCorrectionChanges, TributarioS4Error } from "./s4-engine";
import { createTaxAssessmentInTransaction, generateTaxGuideInTransaction, type TaxActor } from "./index";
import { resolveTaxAssessmentScope, resolveTaxFinancialYear, taxAssessmentCompensatedValue, taxScopeSnapshot } from "./scope";
import { postTaxAssessmentAdjustment } from "./accrual-accounting";
import { assertAccountingPeriodOpen } from "@/lib/financeiro";
import { readMunicipalServiceRelationships } from "@/lib/planejamento/activity-relations";

const asJson = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const required = (value: string, label: string) => { const result = value.trim(); if (!result) throw new TributarioS4Error(`${label} é obrigatório.`); return result; };
const money = (value: string | number | Prisma.Decimal) => new Prisma.Decimal(String(value)).toDecimalPlaces(2);

async function assertNfseProviderScope(db: PrismaClient | Prisma.TransactionClient, actor: TaxActor | null, taxpayerId: string, economicRegistrationId?: string) {
  if (!actor?.allowedBudgetUnitIds) return;
  const credentials = await db.nfseCredentialRequest.findMany({ where: { taxpayerId, ...(economicRegistrationId ? { economicRegistrationId } : {}), status: "HABILITADO" }, select: { serviceActivityId: true } });
  const activities = await db.taxServiceActivity.findMany({ where: { id: { in: credentials.map(item => item.serviceActivityId) }, tax: { financialMapping: { isActive: true, defaultBankAccount: { budgetUnitId: { in: actor.allowedBudgetUnitIds } } } } }, select: { taxId: true } });
  if (!activities.length) throw new TributarioS4Error("Prestador sem credenciamento em unidade gestora autorizada.");
}

async function nextNumber(tx: Prisma.TransactionClient, type: string, prefix: string) {
  const year = new Date().getUTCFullYear();
  const row = await tx.taxDocumentSequence.upsert({ where: { year_documentType: { year, documentType: type } }, create: { year, documentType: type, currentValue: 1 }, update: { currentValue: { increment: 1 } } });
  return `${prefix}-${year}-${String(row.currentValue).padStart(7, "0")}`;
}

export async function requestNfseCredential(db: PrismaClient, actor: TaxActor, input: { taxpayerId: string; economicRegistrationId: string; serviceActivityId: string }) {
  const [taxpayer, registration, activity] = await Promise.all([
    db.taxpayer.findFirst({ where: { id: input.taxpayerId, status: "Ativo" } }),
    db.economicRegistration.findUnique({ where: { id: input.economicRegistrationId } }),
    db.taxServiceActivity.findFirst({ where: { id: input.serviceActivityId, isActive: true } }),
  ]);
  if (!taxpayer || !registration || registration.taxpayerId !== taxpayer.id || !activity) throw new TributarioS4Error("Prestador, inscrição municipal ou atividade inválidos.");
  await resolveTaxAssessmentScope(db, actor, activity.taxId);
  return db.nfseCredentialRequest.create({ data: { taxpayerId: taxpayer.id, economicRegistrationId: registration.id, serviceActivityId: activity.id, termsAcceptedAt: new Date(), createdByUsuarioId: actor.usuarioId, events: { create: { eventType: "SOLICITADO", description: "Solicitação de credenciamento recebida.", actorUsuarioId: actor.usuarioId } } } });
}

export async function decideNfseCredential(db: PrismaClient, actor: TaxActor, input: { id: string; approved: boolean; reason: string }) {
  const item = await db.nfseCredentialRequest.findUnique({ where: { id: input.id } });
  if (!item || item.status !== "SOLICITADO") throw new TributarioS4Error("O credenciamento não está disponível para análise.");
  const activity = await db.taxServiceActivity.findUniqueOrThrow({ where: { id: item.serviceActivityId } });
  await resolveTaxAssessmentScope(db, actor, activity.taxId);
  const status = input.approved ? "HABILITADO" : "REJEITADO";
  return db.nfseCredentialRequest.update({ where: { id: item.id }, data: { status, analyzedAt: new Date(), enabledAt: input.approved ? new Date() : null, decisionReason: required(input.reason, "Fundamentação"), analyzedByUsuarioId: actor.usuarioId, events: { create: { eventType: status, description: input.reason.trim(), actorUsuarioId: actor.usuarioId } } } });
}

type NfseEmissionInput = {
  providerId: string; takerId?: string; economicRegistrationId: string; serviceActivityId: string; competence: string;
  serviceDescription: string; serviceLocation?: string; serviceValue: string | number; manualDeductions?: string | number;
  retained: boolean; creditUsages?: { creditId: string; amount: string | number }[]; source?: string; occasionalRequestId?: string; rpsItemId?: string;
};

export async function emitNfse(db: PrismaClient, actor: TaxActor, input: NfseEmissionInput) {
  if (input.occasionalRequestId || input.rpsItemId) throw new TributarioS4Error("Emita documentos vinculados pelo fluxo de liberação da origem.");
  return db.$transaction(tx => emitNfseInTransaction(tx, actor, input), { timeout: 60000 });
}

async function emitNfseInTransaction(tx: Prisma.TransactionClient, actor: TaxActor, input: NfseEmissionInput, originSnapshot?: Prisma.JsonValue) {
    const competence = parseCompetence(input.competence);
    const [provider, registration, activity] = await Promise.all([
      tx.taxpayer.findFirst({ where: { id: input.providerId, status: "Ativo" } }),
      tx.economicRegistration.findUnique({ where: { id: input.economicRegistrationId } }),
      tx.taxServiceActivity.findFirst({ where: { id: input.serviceActivityId, isActive: true }, include: { tax: true } }),
    ]);
    if (!provider || !registration || registration.status !== "Ativo" || registration.taxpayerId !== provider.id || !activity || !activity.tax.isActive) throw new TributarioS4Error("Prestador, inscrição ou atividade não conferem.");
    if (!activity.issRate) throw new TributarioS4Error("A atividade não possui alíquota de ISS configurada.");
    const parameter = await tx.taxParameter.findFirst({
      where: { taxId: activity.taxId, isActive: true, effectiveFrom: { lte: competence }, OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: competence } }] },
      orderBy: { effectiveFrom: "desc" },
    });
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
      const credential = await tx.nfseCredentialRequest.findFirst({ where: { taxpayerId: provider.id, economicRegistrationId: registration.id, serviceActivityId: activity.id, status: "HABILITADO" } });
      if (!credential) throw new TributarioS4Error("O prestador precisa de credenciamento habilitado para emitir NFS-e.");
    }
    if (input.takerId) {
      const taker = await tx.taxpayer.findFirst({ where: { id: input.takerId, status: "Ativo" } });
      if (!taker) throw new TributarioS4Error("Tomador ativo não encontrado.");
    }
    const usages = input.creditUsages ?? [];
    if (new Set(usages.map(usage => usage.creditId)).size !== usages.length) throw new TributarioS4Error("Não repita um crédito de dedução na mesma nota.");
    let creditTotal = new Prisma.Decimal(0);
    const credits: { id: string; amount: Prisma.Decimal; available: Prisma.Decimal }[] = [];
    for (const usage of [...usages].sort((a, b) => a.creditId.localeCompare(b.creditId))) {
      await tx.$queryRaw`SELECT id FROM "NfseDeductionCredit" WHERE id = ${usage.creditId} FOR UPDATE`;
      const credit = await tx.nfseDeductionCredit.findUnique({ where: { id: usage.creditId } });
      const amount = money(usage.amount);
       if (!credit || credit.taxpayerId !== provider.id || credit.economicRegistrationId && credit.economicRegistrationId !== registration.id || credit.status !== "DISPONIVEL" || !amount.isFinite() || amount.lessThanOrEqualTo(0) || amount.greaterThan(credit.availableAmountDecimal)) throw new TributarioS4Error("Crédito de dedução indisponível ou saldo insuficiente.");
      creditTotal = creditTotal.plus(amount); credits.push({ id: credit.id, amount, available: credit.availableAmountDecimal });
    }
    const manualDeductions = money(input.manualDeductions ?? 0);
    if (!manualDeductions.isFinite() || manualDeductions.lt(0)) throw new TributarioS4Error("Dedução manual deve ser finita e não negativa.");
    const deductions = manualDeductions.plus(creditTotal);
    const historicalRate = taxScopeSnapshot(originSnapshot).rate;
    const rate = typeof historicalRate === "string" || typeof historicalRate === "number" ? new Prisma.Decimal(historicalRate) : activity.issRate;
    const calc = calculateNfse({ serviceValue: input.serviceValue, deductions, ratePercent: rate, retained: input.retained });
    const verificationCode = randomUUID().replaceAll("-", "").slice(0, 16).toUpperCase();
    const invoice = await tx.invoice.create({ data: { verificationCode, serviceValue: Number(calc.serviceValue), serviceValueDecimal: calc.serviceValue, deductions: Number(calc.deductions), deductionsDecimal: calc.deductions, issRetained: input.retained, issValue: Number(calc.iss), issValueDecimal: calc.iss, competence: required(input.competence, "Competência"), status: "Emitida", providerId: provider.id, takerId: input.takerId || null } });
    const authenticityUrl = `/portal/nfse/${verificationCode}`;
    const activityRelationships = scope.governmentEntityId
      ? await readMunicipalServiceRelationships(tx, { governmentEntityId: scope.governmentEntityId, activityId: activity.id, date: competence })
      : { status: "NOT_RECONCILED", relationships: [] };
    const snapshot = { ...scope, formula: "(valorServico - deducoes) × aliquota", serviceValue: calc.serviceValue.toFixed(2), deductions: calc.deductions.toFixed(2), taxableBase: calc.taxableBase.toFixed(2), rate: calc.rate.toString(), iss: calc.iss.toFixed(2), ownIss: calc.ownIss.toFixed(2), retainedIss: calc.retainedIss.toFixed(2), parameterId: parameter.id, cancellationDays, cancellationDaysEstimated: configuration.nfseCancellationDays === undefined, activityRelationships };
    await tx.nfseInvoiceData.create({ data: { invoiceId: invoice.id, economicRegistrationId: registration.id, serviceActivityId: activity.id, parameterId: parameter.id, serviceDescription: required(input.serviceDescription, "Descrição do serviço"), serviceLocation: input.serviceLocation?.trim() || null, taxableBaseDecimal: calc.taxableBase, rate: calc.rate, ownIssDecimal: calc.ownIss, retainedIssDecimal: calc.retainedIss, retentionType: input.retained ? "RETIDO" : "PROPRIO", calculationSnapshot: asJson(snapshot), source: input.source ?? "WEB", authenticityUrl, qrPayload: authenticityUrl, occasionalRequestId: input.occasionalRequestId, rpsItemId: input.rpsItemId } });
    await tx.nfseEvent.create({ data: { invoiceId: invoice.id, eventType: "EMITIDA", description: "NFS-e emitida com cálculo fiscal persistido.", actorUsuarioId: actor.usuarioId, payload: asJson(snapshot) } });
    const declaration = await tx.taxDeclaration.create({ data: { taxpayerId: provider.id, economicRegistrationId: registration.id, activityId: activity.id, competence, serviceValueDecimal: calc.serviceValue, deductionValueDecimal: calc.deductions, issValueDecimal: calc.iss, status: input.retained ? "ISS_RETIDO" : "ISS_PROPRIO", calculationSnapshot: asJson({ ...snapshot, invoiceId: invoice.id, automatic: true }) } });
    if (input.retained && !input.takerId) throw new TributarioS4Error("ISS retido exige tomador identificado como responsável tributário.");
    if (calc.iss.gt(0) && !input.occasionalRequestId) {
      const assessment = await createTaxAssessmentInTransaction(tx, actor, { year: competence.getUTCFullYear(), taxId: activity.taxId, taxpayerId: input.retained ? input.takerId! : provider.id, economicRegistrationId: input.retained ? undefined : registration.id, competence, taxableBase: calc.taxableBase, rate: calc.rate });
      await tx.taxAssessment.update({ where: { id: assessment.id }, data: { calculationSnapshot: asJson({ ...taxScopeSnapshot(assessment.calculationSnapshot), invoiceId: invoice.id, declarationId: declaration.id, automatic: true, retentionType: input.retained ? "RETIDO" : "PROPRIO" }) } });
      await tx.nfseEvent.create({ data: { invoiceId: invoice.id, eventType: "DEBITO_CONSTITUIDO", description: "Débito ISS constituído pela origem fiscal e matriz contábil canônicas.", actorUsuarioId: actor.usuarioId, payload: { assessmentId: assessment.id, declarationId: declaration.id } } });
    }
    for (const direction of ["PRESTADOS", ...(input.takerId ? ["TOMADOS"] : [])]) {
      await tx.nfseDmsDeclaration.create({ data: { protocol: `NFSE:${invoice.id}:${direction}`, taxpayerId: direction === "PRESTADOS" ? provider.id : input.takerId!, economicRegistrationId: direction === "PRESTADOS" ? registration.id : null, competence: input.competence, direction, channel: "NFSE_AUTOMATICA", detailMode: "DOCUMENTO", serviceValueDecimal: calc.serviceValue, deductionValueDecimal: calc.deductions, ownIssDecimal: direction === "PRESTADOS" ? calc.ownIss : 0, retainedIssDecimal: direction === "TOMADOS" ? calc.retainedIss : 0, payload: asJson({ ...snapshot, invoiceId: invoice.id, automatic: true }), createdByUsuarioId: actor.usuarioId } });
    }
    for (const credit of credits) {
      const remaining = credit.available.minus(credit.amount);
      await tx.nfseDeductionCredit.update({ where: { id: credit.id }, data: { availableAmountDecimal: remaining, status: remaining.equals(0) ? "ESGOTADO" : "DISPONIVEL", consumptions: { create: { invoiceId: invoice.id, amountDecimal: credit.amount } } } });
    }
    if (input.rpsItemId) await tx.nfseRpsItem.update({ where: { id: input.rpsItemId }, data: { status: "CONVERTIDO", invoiceId: invoice.id } });
    if (input.occasionalRequestId) await tx.nfseOccasionalRequest.update({ where: { id: input.occasionalRequestId }, data: { status: "EMITIDA", invoiceId: invoice.id, releasedAt: new Date() } });
    return invoice;
}

function parseCompetence(value: string) {
  const match = value.match(/^(0[1-9]|1[0-2])\/(\d{4})$/);
  if (!match) throw new TributarioS4Error("Competência deve estar no formato MM/AAAA.");
  return new Date(Date.UTC(Number(match[2]), Number(match[1]) - 1, 1, 12));
}

export async function substituteNfse(db: PrismaClient, actor: TaxActor, input: { invoiceId: string; reason: string; serviceDescription: string; serviceValue: number; deductions: number; retained: boolean }) {
  const reason = required(input.reason, "Motivo");
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id=${input.invoiceId} FOR UPDATE`;
    const old = await tx.invoice.findUniqueOrThrow({ where: { id: input.invoiceId } });
    const data = await tx.nfseInvoiceData.findUniqueOrThrow({ where: { invoiceId: old.id } });
    const activity = await tx.taxServiceActivity.findUniqueOrThrow({ where: { id: data.serviceActivityId } });
    await resolveTaxAssessmentScope(tx, actor, activity.taxId, data.calculationSnapshot);
    if (old.status === "Substituída" && data.replacementInvoiceId) {
      const event = await tx.nfseEvent.findFirstOrThrow({ where: { invoiceId: old.id, eventType: "SUBSTITUIDA" } });
      const stored = taxScopeSnapshot(event.payload).input;
      if (JSON.stringify(stored) !== JSON.stringify(asJson(input))) {
        const normalized = taxScopeSnapshot(stored);
        if (event.description !== reason || Object.entries(input).some(([key, value]) => normalized[key] !== value)) throw new TributarioS4Error("NFS-e já substituída com outros dados.");
      }
      return tx.invoice.findUniqueOrThrow({ where: { id: data.replacementInvoiceId } });
    }
    if (old.status !== "Emitida") throw new TributarioS4Error("Somente NFS-e emitida pode ser substituída.");
    await reverseNfseWriting(tx, actor, old.id, "SUBSTITUIDA", reason);
    const created = await emitNfseInTransaction(tx, actor, { providerId: old.providerId, takerId: old.takerId ?? undefined, economicRegistrationId: data.economicRegistrationId, serviceActivityId: data.serviceActivityId, competence: old.competence, serviceDescription: input.serviceDescription, serviceLocation: data.serviceLocation ?? undefined, serviceValue: input.serviceValue, manualDeductions: input.deductions, retained: input.retained, source: "SUBSTITUICAO" }, data.calculationSnapshot);
    await tx.invoice.update({ where: { id: old.id }, data: { status: "Substituída" } });
    await tx.nfseInvoiceData.update({ where: { invoiceId: old.id }, data: { replacementInvoiceId: created.id } });
    await tx.nfseInvoiceData.update({ where: { invoiceId: created.id }, data: { replacedInvoiceId: old.id } });
    await tx.nfseEvent.create({ data: { invoiceId: old.id, eventType: "SUBSTITUIDA", description: reason, actorUsuarioId: actor.usuarioId, payload: asJson({ replacementInvoiceId: created.id, input }) } });
    await tx.nfseEvent.create({ data: { invoiceId: created.id, eventType: "SUBSTITUTA", description: `Substitui a NFS-e ${old.invoiceNumber}.`, actorUsuarioId: actor.usuarioId, payload: { replacedInvoiceId: old.id } } });
    return created;
  }, { timeout: 60000 });
}

async function reverseNfseWriting(tx: Prisma.TransactionClient, actor: TaxActor, invoiceId: string, status: "CANCELADA" | "SUBSTITUIDA", reason: string) {
  const declarations = await tx.taxDeclaration.findMany({ where: { calculationSnapshot: { path: ["invoiceId"], equals: invoiceId } } });
  const assessments = await tx.taxAssessment.findMany({ where: { OR: [{ calculationSnapshot: { path: ["invoiceId"], equals: invoiceId } }, ...declarations.map(declaration => ({ calculationSnapshot: { path: ["declarationId"], equals: declaration.id } }))], status: { notIn: ["Cancelado", "Extinto"] } }, orderBy: { id: "asc" } });
  const occasional = await tx.nfseOccasionalRequest.findFirst({ where: { invoiceId, assessmentId: { not: null } } });
  if (occasional) throw new TributarioS4Error("Regularize o débito/guia da nota avulsa pela origem antes de cancelar ou substituir a escrita.");
  for (const origin of assessments) {
    await tx.$queryRaw`SELECT id FROM "TaxAssessment" WHERE id=${origin.id} FOR UPDATE`;
    const assessment = await tx.taxAssessment.findUniqueOrThrow({ where: { id: origin.id } });
    const scope = await resolveTaxAssessmentScope(tx, actor, assessment.taxId, assessment.calculationSnapshot);
    const date = new Date();
    const year = await resolveTaxFinancialYear(tx, date.getUTCFullYear(), scope);
    await assertAccountingPeriodOpen(tx, year.id, date);
    const received = await tx.taxPayment.count({ where: { guide: { assessmentId: assessment.id }, status: "Confirmado" } });
    const debt = await tx.activeDebt.findUnique({ where: { assessmentId: assessment.id } });
    if (received || debt || (await taxAssessmentCompensatedValue(tx, assessment.id)).gt(0)) throw new TributarioS4Error("Débito com arrecadação, compensação ou dívida ativa exige regularização pela origem antes da alteração fiscal.");
    if (!assessment.finalValueDecimal) throw new TributarioS4Error("Débito da nota sem Decimal conciliado.");
    await tx.taxGuide.updateMany({ where: { assessmentId: assessment.id, status: { not: "Cancelada" } }, data: { status: "Cancelada" } });
    await postTaxAssessmentAdjustment(tx, actor, { assessmentId: assessment.id, date, delta: assessment.finalValueDecimal.negated(), kind: "EXTINCTION", reason, idempotencyKey: `NFSE:${invoiceId}:${status}:${assessment.id}` });
    await tx.taxRegistryEntry.create({ data: { entityType: "TAX_ASSESSMENT", entityId: assessment.id, category: "CREDIT_EVENT", title: `NFS-e ${status}`, source: "NFSE", actorUsuarioId: actor.usuarioId, data: { ...scope, invoiceId, eventType: "EXTINCAO_NAO_FINANCEIRA", oldValue: assessment.finalValueDecimal.toFixed(2), newValue: "0.00", amount: assessment.finalValueDecimal.toFixed(2), reason, operationFinancialYearId: year.id } } });
    await tx.taxAssessment.update({ where: { id: assessment.id }, data: { status: "Cancelado", finalValueDecimal: 0 } });
  }
  await tx.taxDeclaration.updateMany({ where: { id: { in: declarations.map(declaration => declaration.id) } }, data: { status } });
  await tx.nfseDmsDeclaration.updateMany({ where: { channel: "NFSE_AUTOMATICA", payload: { path: ["invoiceId"], equals: invoiceId } }, data: { status } });
  const consumptions = await tx.nfseDeductionConsumption.findMany({ where: { invoiceId }, orderBy: { creditId: "asc" } });
  for (const consumption of consumptions) {
    await tx.$queryRaw`SELECT id FROM "NfseDeductionCredit" WHERE id=${consumption.creditId} FOR UPDATE`;
    const credit = await tx.nfseDeductionCredit.findUniqueOrThrow({ where: { id: consumption.creditId } });
    const restored = credit.availableAmountDecimal.plus(consumption.amountDecimal);
    if (restored.gt(credit.originalAmountDecimal)) throw new TributarioS4Error("Saldo do crédito de dedução diverge dos consumos históricos.");
    await tx.nfseDeductionCredit.update({ where: { id: credit.id }, data: { availableAmountDecimal: restored, status: "DISPONIVEL" } });
  }
}

export async function cancelNfse(db: PrismaClient, actor: TaxActor, input: { invoiceId: string; reason: string; approve?: boolean }) {
  const reason = required(input.reason, "Motivo");
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id=${input.invoiceId} FOR UPDATE`;
    const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: input.invoiceId } });
    const data = await tx.nfseInvoiceData.findUniqueOrThrow({ where: { invoiceId: invoice.id } });
    const activity = await tx.taxServiceActivity.findUniqueOrThrow({ where: { id: data.serviceActivityId } });
    await resolveTaxAssessmentScope(tx, actor, activity.taxId, data.calculationSnapshot);
    if (invoice.status === "Cancelada") {
      const event = await tx.nfseEvent.findFirstOrThrow({ where: { invoiceId: invoice.id, eventType: "CANCELADA" } });
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
    await tx.invoice.update({ where: { id: invoice.id }, data: { status } });
    await tx.nfseEvent.create({ data: { invoiceId: invoice.id, eventType: approved ? "CANCELADA" : "CANCELAMENTO_SOLICITADO", description: reason, actorUsuarioId: actor.usuarioId, payload: { automatic, approved, cancellationDays: days } } });
    return { status, automatic };
  }, { timeout: 60000 });
}

export async function createCorrectionLetter(db: PrismaClient, actor: TaxActor, input: { invoiceId: string; reason: string; changes: Record<string, string> }) {
  const invoice = await db.invoice.findUnique({ where: { id: input.invoiceId } });
  if (!invoice || invoice.status !== "Emitida") throw new TributarioS4Error("Carta de correção exige NFS-e emitida.");
  const data = await db.nfseInvoiceData.findUniqueOrThrow({ where: { invoiceId: invoice.id } });
  const activity = await db.taxServiceActivity.findUniqueOrThrow({ where: { id: data.serviceActivityId } });
  await resolveTaxAssessmentScope(db, actor, activity.taxId, data.calculationSnapshot);
  const changes = validateCorrectionChanges(input.changes);
  const letter = await db.nfseCorrectionLetter.create({ data: { invoiceId: invoice.id, reason: required(input.reason, "Motivo"), changes, createdByUsuarioId: actor.usuarioId } });
  await db.nfseEvent.create({ data: { invoiceId: invoice.id, eventType: "CARTA_CORRECAO", description: input.reason.trim(), actorUsuarioId: actor.usuarioId, payload: asJson({ letterId: letter.id, changes }) } });
  return letter;
}

export async function receiveRpsBatch(db: PrismaClient, actor: TaxActor | null, input: { batchNumber: string; providerTaxpayerId: string; source: "UPLOAD" | "WEBSERVICE"; items: { rpsNumber: string; payload: unknown }[] }) {
  if (!input.items.length) throw new TributarioS4Error("O lote deve conter ao menos um RPS.");
  await assertNfseProviderScope(db, actor, input.providerTaxpayerId);
  const payloadHash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  const existing = await db.nfseRpsBatch.findUnique({ where: { batchNumber: input.batchNumber } });
  if (existing) { if (existing.payloadHash !== payloadHash) throw new TributarioS4Error("Número de lote já recebido com conteúdo diferente."); return existing; }
  const provider = await db.taxpayer.findFirst({ where: { id: input.providerTaxpayerId, status: "Ativo" } });
  if (!provider) throw new TributarioS4Error("Prestador ativo não encontrado.");
  return db.nfseRpsBatch.create({ data: { batchNumber: required(input.batchNumber, "Número do lote"), providerTaxpayerId: provider.id, source: input.source, payloadHash, protocol: `RPS-${randomUUID().slice(0, 8).toUpperCase()}`, createdByUsuarioId: actor?.usuarioId, items: { create: input.items.map((item) => ({ rpsNumber: required(item.rpsNumber, "Número do RPS"), payload: asJson(item.payload) })) } }, include: { items: true } });
}

export async function updateRpsItem(db: PrismaClient, input: { id: string; action: "CANCELAR" | "SUBSTITUIR"; replacedRpsNumber?: string }, actor: TaxActor) {
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "NfseRpsItem" WHERE id=${input.id} FOR UPDATE`;
    const item = await tx.nfseRpsItem.findUnique({ where: { id: input.id } });
    if (!item || item.status !== "RECEBIDO" || item.invoiceId) throw new TributarioS4Error("RPS convertido deve ser regularizado pela NFS-e de origem.");
    const batch = await tx.nfseRpsBatch.findUniqueOrThrow({ where: { id: item.batchId } });
    await assertNfseProviderScope(tx, actor, batch.providerTaxpayerId);
    if (!["CANCELAR", "SUBSTITUIR"].includes(input.action)) throw new TributarioS4Error("Operação RPS inválida.");
    const replacedRpsNumber = input.action === "SUBSTITUIR" ? required(input.replacedRpsNumber ?? "", "RPS substituto") : null;
    if (replacedRpsNumber === item.rpsNumber) throw new TributarioS4Error("RPS não pode substituir a si próprio.");
    return tx.nfseRpsItem.update({ where: { id: item.id }, data: input.action === "CANCELAR" ? { status: "CANCELADO", cancelledAt: new Date() } : { status: "SUBSTITUIDO", replacedRpsNumber } });
  });
}

export async function createDmsDeclaration(db: PrismaClient, actor: TaxActor | null, input: { taxpayerId: string; economicRegistrationId?: string; competence: string; direction: string; channel: string; detailMode: string; noMovement: boolean; rectifiesDeclarationId?: string; serviceValue: number; deductions: number; ownIss: number; retainedIss: number; payload?: unknown }) {
  parseCompetence(input.competence);
  const direction = input.direction === "PRESTADO" ? "PRESTADOS" : input.direction === "TOMADO" ? "TOMADOS" : input.direction;
  if (!["PRESTADOS", "TOMADOS"].includes(direction) || input.channel === "NFSE_AUTOMATICA") throw new TributarioS4Error("Escrita NFS-e é protegida; altere-a exclusivamente pelo documento de origem.");
  const submitted = [input.serviceValue, input.deductions, input.ownIss, input.retainedIss];
  if (submitted.some(value => !Number.isFinite(value) || value < 0)) throw new TributarioS4Error("Os valores da DMS devem ser finitos e não negativos.");
  if (input.deductions > input.serviceValue || input.noMovement && submitted.some(value => value !== 0)) throw new TributarioS4Error("Valores incompatíveis com as deduções ou declaração sem movimento.");
  return db.$transaction(async tx => {
    const taxpayer = await tx.taxpayer.findFirst({ where: { id: input.taxpayerId, status: "Ativo" } });
    if (!taxpayer) throw new TributarioS4Error("Contribuinte ativo não encontrado.");
    if (input.economicRegistrationId) {
      const registration = await tx.economicRegistration.findUniqueOrThrow({ where: { id: input.economicRegistrationId } });
      if (registration.taxpayerId !== taxpayer.id || registration.status !== "Ativo") throw new TributarioS4Error("Inscrição econômica fora do contribuinte ou inativa.");
    }
    const taxes = await tx.tax.findMany({ where: { isActive: true, serviceActivities: { some: { isActive: true } }, ...(actor?.allowedBudgetUnitIds ? { financialMapping: { isActive: true, defaultBankAccount: { budgetUnitId: { in: actor.allowedBudgetUnitIds } } } } : {}) }, select: { id: true } });
    if (taxes.length !== 1) throw new TributarioS4Error("DMS exige tributo de serviço único e roteamento municipal conciliado.");
    const scope = await resolveTaxAssessmentScope(tx, actor ?? { usuarioId: "NFSE_WEBSERVICE", employeeId: null }, taxes[0].id);
    let rectified: string | null = null;
    if (input.rectifiesDeclarationId) {
      await tx.$queryRaw`SELECT id FROM "NfseDmsDeclaration" WHERE id=${input.rectifiesDeclarationId} FOR UPDATE`;
      const old = await tx.nfseDmsDeclaration.findUniqueOrThrow({ where: { id: input.rectifiesDeclarationId } });
      const memory = taxScopeSnapshot(old.payload);
      if (old.channel === "NFSE_AUTOMATICA" || memory.automatic === true || typeof memory.invoiceId === "string") throw new TributarioS4Error("Declaração automática só admite correção pela NFS-e de origem.");
      const oldDirection = old.direction === "PRESTADO" ? "PRESTADOS" : old.direction === "TOMADO" ? "TOMADOS" : old.direction;
      if (old.status !== "PROTOCOLADA" || old.taxpayerId !== taxpayer.id || old.competence !== input.competence || oldDirection !== direction || old.economicRegistrationId !== (input.economicRegistrationId || null) || memory.budgetUnitId !== scope.budgetUnitId || memory.governmentEntityId !== scope.governmentEntityId) throw new TributarioS4Error("Retificação fora da identidade, competência, UG ou edição vigente.");
      await tx.nfseDmsDeclaration.update({ where: { id: old.id }, data: { status: "RETIFICADA" } });
      rectified = old.id;
    }
    const rawPayload = asJson(input.payload ?? {});
    const payload = taxScopeSnapshot(rawPayload as Prisma.JsonValue);
    if (payload.automatic === true || typeof payload.invoiceId === "string") throw new TributarioS4Error("Origem automática não pode ser informada na declaração manual.");
    return tx.nfseDmsDeclaration.create({ data: { protocol: `DMS-${randomUUID().slice(0, 8).toUpperCase()}`, taxpayerId: taxpayer.id, economicRegistrationId: input.economicRegistrationId || null, competence: input.competence, direction, channel: required(input.channel, "Canal"), detailMode: required(input.detailMode, "Detalhamento"), noMovement: input.noMovement, rectifiesDeclarationId: rectified, serviceValueDecimal: submitted[0], deductionValueDecimal: submitted[1], ownIssDecimal: submitted[2], retainedIssDecimal: submitted[3], payload: asJson({ ...payload, ...scope, taxId: taxes[0].id, automatic: false }), createdByUsuarioId: actor?.usuarioId } });
  }, { timeout: 60000 });
}

export async function createDeductionCredit(db: PrismaClient, actor: TaxActor, input: { taxpayerId: string; economicRegistrationId?: string; creditType: string; originDocument: string; constructionReference?: string; amount: number }) {
  await assertNfseProviderScope(db, actor, input.taxpayerId, input.economicRegistrationId);
  const amount = money(input.amount);
  if (!amount.isFinite() || amount.lessThanOrEqualTo(0)) throw new TributarioS4Error("O crédito deve ser finito e maior que zero.");
  return db.nfseDeductionCredit.create({ data: { taxpayerId: input.taxpayerId, economicRegistrationId: input.economicRegistrationId || null, creditType: required(input.creditType, "Tipo"), originDocument: required(input.originDocument, "Documento de origem"), constructionReference: input.constructionReference?.trim() || null, originalAmountDecimal: amount, availableAmountDecimal: amount, createdByUsuarioId: actor.usuarioId } });
}

export async function createOccasionalRequest(db: PrismaClient, actor: TaxActor, input: { providerTaxpayerId: string; takerTaxpayerId?: string; serviceActivityId: string; serviceDescription: string; serviceValue: number; deductions: number; paymentRequired: boolean }) {
  return db.$transaction((tx) => createOccasionalRequestInTransaction(tx, actor, input));
}

export async function createOccasionalRequestInTransaction(tx: Prisma.TransactionClient, actor: TaxActor, input: { providerTaxpayerId: string; takerTaxpayerId?: string; serviceActivityId: string; serviceDescription: string; serviceValue: number; deductions: number; paymentRequired: boolean }) {
  const activity = await tx.taxServiceActivity.findFirst({ where: { id: input.serviceActivityId, isActive: true } });
  if (!activity?.issRate) throw new TributarioS4Error("Atividade sem alíquota configurada.");
  await resolveTaxAssessmentScope(tx, actor, activity.taxId);
  const calc = calculateNfse({ serviceValue: input.serviceValue, deductions: input.deductions, ratePercent: activity.issRate, retained: false });
  return tx.nfseOccasionalRequest.create({ data: { requestNumber: await nextNumber(tx, "NFSE_AVULSA", "NSA"), providerTaxpayerId: input.providerTaxpayerId, takerTaxpayerId: input.takerTaxpayerId || null, serviceActivityId: activity.id, serviceDescription: required(input.serviceDescription, "Descrição"), serviceValueDecimal: calc.serviceValue, deductionValueDecimal: calc.deductions, taxAmountDecimal: calc.iss, paymentRequired: input.paymentRequired, createdByUsuarioId: actor.usuarioId } });
}

export async function approveOccasionalRequest(db: PrismaClient, actor: TaxActor, id: string) {
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "NfseOccasionalRequest" WHERE id=${id} FOR UPDATE`;
    const request = await tx.nfseOccasionalRequest.findUniqueOrThrow({ where: { id } });
    const activity = await tx.taxServiceActivity.findFirst({ where: { id: request.serviceActivityId, isActive: true } });
    if (!activity?.issRate) throw new TributarioS4Error("Atividade sem alíquota de ISS configurada.");
    const old = request.assessmentId ? await tx.taxAssessment.findUniqueOrThrow({ where: { id: request.assessmentId } }) : null;
    await resolveTaxAssessmentScope(tx, actor, activity.taxId, old?.calculationSnapshot);
    if (["AGUARDANDO_PAGAMENTO", "APROVADA", "EMITIDA"].includes(request.status) && old) return request;
    if (request.status !== "SOLICITADA" || old) throw new TributarioS4Error("Solicitação avulsa indisponível.");
    const competence = new Date();
    const base = request.serviceValueDecimal.minus(request.deductionValueDecimal);
    const calculation = calculateNfse({ serviceValue: request.serviceValueDecimal, deductions: request.deductionValueDecimal, ratePercent: activity.issRate, retained: false });
    if (!calculation.iss.eq(request.taxAmountDecimal)) throw new TributarioS4Error("Alíquota mudou após a solicitação; revise os valores antes de aprovar.");
    const assessment = await createTaxAssessmentInTransaction(tx, actor, { year: competence.getUTCFullYear(), competence, taxId: activity.taxId, taxpayerId: request.providerTaxpayerId, taxableBase: base, rate: activity.issRate });
    await tx.taxAssessment.update({ where: { id: assessment.id }, data: { calculationSnapshot: asJson({ ...taxScopeSnapshot(assessment.calculationSnapshot), origin: "NFSE_AVULSA", requestId: request.id }) } });
    const guide = request.paymentRequired ? await generateTaxGuideInTransaction(tx, actor, { assessmentId: assessment.id, dueDate: new Date(Date.UTC(assessment.year, 11, 31, 12)) }) : null;
    return tx.nfseOccasionalRequest.update({ where: { id }, data: { status: request.paymentRequired ? "AGUARDANDO_PAGAMENTO" : "APROVADA", assessmentId: assessment.id, guideId: guide?.id ?? null, approvedAt: competence } });
  }, { timeout: 60000 });
}

export async function releaseOccasionalRequest(db: PrismaClient, actor: TaxActor, id: string, economicRegistrationId: string) {
  return db.$transaction(async tx => {
    const origin = await tx.nfseOccasionalRequest.findUniqueOrThrow({ where: { id } });
    if (!origin.assessmentId) throw new TributarioS4Error("A solicitação avulsa exige aprovação com débito de origem.");
    await tx.$queryRaw`SELECT id FROM "TaxAssessment" WHERE id=${origin.assessmentId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "NfseOccasionalRequest" WHERE id=${id} FOR UPDATE`;
    const request = await tx.nfseOccasionalRequest.findUniqueOrThrow({ where: { id } });
    const assessment = await tx.taxAssessment.findUniqueOrThrow({ where: { id: origin.assessmentId } });
    await resolveTaxAssessmentScope(tx, actor, assessment.taxId, assessment.calculationSnapshot);
    if (request.status === "EMITIDA" && request.invoiceId) {
      const data = await tx.nfseInvoiceData.findUniqueOrThrow({ where: { invoiceId: request.invoiceId } });
      if (data.economicRegistrationId !== economicRegistrationId) throw new TributarioS4Error("Nota avulsa já emitida para outra inscrição.");
      return tx.invoice.findUniqueOrThrow({ where: { id: request.invoiceId } });
    }
    if (!["APROVADA", "AGUARDANDO_PAGAMENTO"].includes(request.status) || ["Cancelado", "Extinto", "Suspenso"].includes(assessment.status)) throw new TributarioS4Error("Solicitação avulsa indisponível para liberação.");
    if (request.paymentRequired) {
      const guide = request.guideId ? await tx.taxGuide.findUnique({ where: { id: request.guideId } }) : null;
      const payments = await tx.taxPayment.findMany({ where: { guide: { assessmentId: assessment.id }, status: "Confirmado" }, select: { amountPaidDecimal: true } });
      if (!guide || guide.assessmentId !== assessment.id || guide.status === "Cancelada" || !assessment.finalValueDecimal || payments.some(payment => !payment.amountPaidDecimal) || payments.reduce((sum, payment) => sum.plus(payment.amountPaidDecimal!), new Prisma.Decimal(0)).lt(assessment.finalValueDecimal)) throw new TributarioS4Error("A NFS-e avulsa só pode ser liberada após pagamento Decimal integral confirmado.");
    }
    const competence = assessment.competence ?? request.approvedAt;
    const rate = assessment.rate;
    if (!competence || !rate || !calculateNfse({ serviceValue: request.serviceValueDecimal, deductions: request.deductionValueDecimal, ratePercent: rate, retained: false }).iss.eq(request.taxAmountDecimal)) throw new TributarioS4Error("Valores da emissão divergem do débito aprovado; regularize a origem.");
    return emitNfseInTransaction(tx, actor, { providerId: request.providerTaxpayerId, takerId: request.takerTaxpayerId ?? undefined, economicRegistrationId, serviceActivityId: request.serviceActivityId, competence: `${String(competence.getUTCMonth() + 1).padStart(2, "0")}/${competence.getUTCFullYear()}`, serviceDescription: request.serviceDescription, serviceValue: request.serviceValueDecimal.toFixed(2), manualDeductions: request.deductionValueDecimal.toFixed(2), retained: false, source: "AVULSA", occasionalRequestId: request.id }, assessment.calculationSnapshot ?? undefined);
  }, { timeout: 60000 });
}
