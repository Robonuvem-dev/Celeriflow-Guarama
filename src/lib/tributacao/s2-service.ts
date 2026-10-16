import { randomUUID } from "node:crypto";
import { assertPropertyOutsideAssessedSimulation } from "./property-assessment-coverage";
import { Prisma, type PrismaClient } from "@prisma/client";
import { calculateAccountBalance, evaluateFiscalRule, parseFiscalRuleConfiguration } from "./fiscal-engine";
import { confirmTaxPaymentInTransaction, TaxError, type TaxActor } from "./index";
import { resolveTaxAssessmentScope, resolveTaxFinancialYear, synchronizeAssessmentDebt, taxAssessmentCompensatedValue } from "./scope";
import { assertTaxCreditScope, recordTaxExcessInTransaction, resolveCreditDestinationScope } from "./credit-finance";
import { assertAccountingPeriodOpen, postAccountingEventInTransaction } from "@/lib/financeiro";
import { recognizeTaxAssessmentInTransaction, postTaxAssessmentAdjustment, recognizedTaxProfile } from "./accrual-accounting";

type Db = PrismaClient | Prisma.TransactionClient;

function money(value: Prisma.Decimal | string | number, label = "Valor") {
  const parsed = new Prisma.Decimal(String(value)).toDecimalPlaces(2);
  if (!parsed.isFinite() || parsed.lessThanOrEqualTo(0)) throw new TaxError(`${label} deve ser maior que zero.`);
  return parsed;
}

function jsonObject(value: Prisma.JsonValue | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, Prisma.JsonValue> : {};
}

async function audit(db: Db, actor: TaxActor, action: string, entityType: string, entityId: string, payload: Prisma.InputJsonValue) {
  await db.taxAuditLog.create({ data: { action, entityType, entityId, payload, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId } });
}

async function assessmentScope(db: Db, actor: TaxActor, assessment: { taxId: string; calculationSnapshot: Prisma.JsonValue | null }) {
  try { return await resolveTaxAssessmentScope(db, actor, assessment.taxId, assessment.calculationSnapshot); }
  catch (error) { throw new TaxError(error instanceof Error ? error.message : "Escopo tributário inválido."); }
}

async function nextNumber(tx: Prisma.TransactionClient, year: number, documentType: string) {
  const sequence = await tx.taxDocumentSequence.upsert({
    where: { year_documentType: { year, documentType } },
    create: { year, documentType, currentValue: 1 },
    update: { currentValue: { increment: 1 } },
  });
  const prefix = documentType === "GUIDE" ? "DAM" : "LAN";
  return `${prefix}-${year}-${String(sequence.currentValue).padStart(7, "0")}`;
}

export async function resolveFiscalRule(db: Db, input: { taxId: string; parameterId?: string; effectiveAt: Date }) {
  if (Number.isNaN(input.effectiveAt.getTime())) throw new TaxError("Informe uma competência fiscal válida.");
  const candidates = input.parameterId
    ? [await db.taxParameter.findUnique({ where: { id: input.parameterId }, include: { tax: true } })]
    : await db.taxParameter.findMany({
        where: { taxId: input.taxId, isActive: true, effectiveFrom: { lte: input.effectiveAt }, OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: input.effectiveAt } }] },
        include: { tax: true }, orderBy: { effectiveFrom: "desc" }, take: 2,
      });
  if (candidates.length > 1) throw new TaxError("Há regras fiscais sobrepostas na competência; selecione a versão aplicável ou concilie a vigência.");
  const parameter = candidates[0];
  if (!parameter || parameter.taxId !== input.taxId || !parameter.isActive || !parameter.tax.isActive) throw new TaxError("Não há regra fiscal ativa para o tributo e a vigência informados.");
  if (parameter.effectiveFrom > input.effectiveAt || (parameter.effectiveUntil && parameter.effectiveUntil < input.effectiveAt)) throw new TaxError("A regra fiscal não está vigente na competência informada.");
  return { parameter, configuration: parseFiscalRuleConfiguration(parameter.configuration) };
}

export async function simulateParametrizedAssessment(db: Db, input: { taxId: string; parameterId?: string; taxableBase: string | number; effectiveAt: Date }) {
  const { parameter, configuration } = await resolveFiscalRule(db, input);
  const calculation = evaluateFiscalRule({ taxableBase: input.taxableBase, configuration });
  return { parameter, calculation, effect: "SIMULACAO_SEM_EFEITO" as const };
}

export async function createParametrizedAssessment(
  db: PrismaClient,
  actor: TaxActor,
  input: {
    taxId: string; parameterId?: string; taxpayerId: string; taxableBase: string | number; competence: Date;
    realEstateId?: string; economicRegistrationId?: string; originKey: string;
  },
) {
  return db.$transaction(tx => createParametrizedAssessmentInTransaction(tx, actor, input));
}

/** Shared by individual operations and durable annual jobs: the native
 * assessment, accounting effects and job progress share one transaction. */
export async function createParametrizedAssessmentInTransaction(
  tx: Prisma.TransactionClient,
  actor: TaxActor,
  input: { taxId: string; parameterId?: string; taxpayerId: string; taxableBase: string | number; competence: Date; realEstateId?: string; economicRegistrationId?: string; originKey: string },
) {
  if (!input.originKey.trim()) throw new TaxError("Informe a chave de origem do lançamento.");
  const { parameter, configuration } = await resolveFiscalRule(tx, { taxId: input.taxId, parameterId: input.parameterId, effectiveAt: input.competence });
  const calculation = evaluateFiscalRule({ taxableBase: input.taxableBase, configuration });
    const originKey = input.originKey.trim();
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`TAX_PARAMETRIZED:${originKey}`}, 0))::text`;
    const existing = await tx.taxIntegrationEvent.findUnique({ where: { idempotencyKey: `ASSESSMENT:${input.originKey.trim()}` } });
    const existingId = jsonObject(existing?.result).assessmentId;
    if (typeof existingId === "string") {
      const assessment = await tx.taxAssessment.findUniqueOrThrow({ where: { id: existingId } });
      await assessmentScope(tx, actor, assessment);
      if (assessment.taxId !== input.taxId || assessment.taxpayerId !== input.taxpayerId || assessment.competence?.getTime() !== input.competence.getTime() || !assessment.taxableBaseDecimal?.equals(input.taxableBase) || assessment.realEstateId !== (input.realEstateId ?? null) || assessment.economicRegistrationId !== (input.economicRegistrationId ?? null) || jsonObject(assessment.calculationSnapshot).parameterId !== parameter.id) throw new TaxError("Lançamento já registrado com outros dados.");
      const frozen = jsonObject(assessment.calculationSnapshot);
      const schedule = calculation.schedule.map(item => ({ ...item, amount: item.amount.toFixed(2) }));
      const frozenSchedule = Array.isArray(frozen.schedule) ? frozen.schedule.map(item => jsonObject(item)) : [];
      if (Object.entries(calculation.memory).some(([key, value]) => JSON.stringify(frozen[key]) !== JSON.stringify(value)) || frozenSchedule.length !== schedule.length || schedule.some((item, index) => frozenSchedule[index].number !== item.number || frozenSchedule[index].amount !== item.amount || frozenSchedule[index].dueDate !== item.dueDate)) throw new TaxError("A regra fiscal atual diverge da memória do lançamento; preserve a origem e utilize uma revisão fundamentada.");
      return assessment;
    }
    await tx.$queryRaw`SELECT id FROM "TaxParameter" WHERE id=${parameter.id} FOR SHARE`;
    const currentRule = await resolveFiscalRule(tx, { taxId: input.taxId, parameterId: input.parameterId, effectiveAt: input.competence });
    if (currentRule.parameter.id !== parameter.id || JSON.stringify(currentRule.configuration) !== JSON.stringify(configuration)) throw new TaxError("A regra fiscal foi alterada durante a apuração; simule novamente antes de efetivar.");
    const year = input.competence.getUTCFullYear();
    const scope = await assessmentScope(tx, actor, { taxId: input.taxId, calculationSnapshot: null });
    const parameterOrigin = await tx.taxRegistryEntry.findFirst({ where: { entityType: "TAX_PARAMETER", entityId: parameter.id, category: "PARAMETER_SCOPE" } });
    const frozenOrigin = jsonObject(parameterOrigin?.data);
    if (parameterOrigin && (frozenOrigin.governmentEntityId !== scope.governmentEntityId || frozenOrigin.budgetUnitId !== scope.budgetUnitId)) throw new TaxError("Regra fiscal pertence a outra origem municipal em relação ao arrecadador atual.");
    if (!parameterOrigin && actor.allowedBudgetUnitIds) throw new TaxError("Regra fiscal legada sem origem conciliada para o acesso autorizado.");
    const [financialYear, taxpayer, property, registration] = await Promise.all([
      resolveTaxFinancialYear(tx, year, scope).catch((error: unknown) => { throw new TaxError(error instanceof Error ? error.message : "Exercício inválido."); }),
      tx.taxpayer.findUnique({ where: { id: input.taxpayerId } }),
      input.realEstateId ? tx.realEstate.findUnique({ where: { id: input.realEstateId } }) : null,
      input.economicRegistrationId ? tx.economicRegistration.findUnique({ where: { id: input.economicRegistrationId } }) : null,
    ]);
    if (!financialYear || financialYear.status !== "Aberto") throw new TaxError(`O exercício financeiro ${year} deve estar aberto.`);
    if (!taxpayer || taxpayer.status !== "Ativo") throw new TaxError("Selecione um contribuinte ativo.");
    if (input.realEstateId && (!property || property.taxpayerId !== taxpayer.id)) throw new TaxError("O imóvel não pertence ao contribuinte selecionado.");
    if(input.realEstateId) await assertPropertyOutsideAssessedSimulation(tx,{realEstateId:input.realEstateId,taxId:input.taxId,year});
    if (input.economicRegistrationId && (!registration || registration.taxpayerId !== taxpayer.id)) throw new TaxError("A inscrição econômica não pertence ao contribuinte selecionado.");
    const assessmentNumber = await nextNumber(tx, year, "ASSESSMENT");
    const base = new Prisma.Decimal(String(input.taxableBase));
    const rate = configuration.formula === "PERCENTUAL_BASE" ? new Prisma.Decimal(String(configuration.rate ?? 0)) : base.isZero() ? new Prisma.Decimal(0) : calculation.principal.div(base).mul(100);
    const assessment = await tx.taxAssessment.create({ data: {
      year, assessmentNumber, competence: input.competence, originalValue: Number(calculation.principal), originalValueDecimal: calculation.principal,
      taxableBaseDecimal: new Prisma.Decimal(String(input.taxableBase)), rate, discountValueDecimal: 0, interestValueDecimal: 0,
      penaltyValueDecimal: 0, correctionValueDecimal: 0, finalValueDecimal: calculation.principal, status: "Lançado",
      calculationSnapshot: { ...calculation.memory, ...scope, financialYearId: financialYear.id, parameterId: parameter.id, parameterCode: parameter.code, effectiveFrom: parameter.effectiveFrom.toISOString(), schedule: calculation.schedule.map((item) => ({ ...item, amount: item.amount.toFixed(2) })) },
      taxId: input.taxId, taxpayerId: input.taxpayerId, realEstateId: input.realEstateId, economicRegistrationId: input.economicRegistrationId,
    } });
    await tx.taxIntegrationEvent.create({ data: {
      integrationCode: "FISCAL_ENGINE", eventType: "ASSESSMENT_CREATED", idempotencyKey: `ASSESSMENT:${input.originKey.trim()}`,
      status: "PROCESSADO", evidenceLevel: "L1", taxpayerId: input.taxpayerId,
      payload: { originKey: input.originKey.trim(), parameterId: parameter.id, taxableBase: String(input.taxableBase) },
      result: { assessmentId: assessment.id, assessmentNumber, principal: calculation.principal.toFixed(2) }, processedAt: new Date(),
    } });
    await recognizeTaxAssessmentInTransaction(tx, actor, assessment.id);
    await audit(tx, actor, "CREATE_PARAMETRIZED", "TaxAssessment", assessment.id, { parameterId: parameter.id, originKey: input.originKey.trim(), principal: calculation.principal.toFixed(2) });
    return assessment;
}

export async function reviseTaxAssessment(db: PrismaClient, actor: TaxActor, input: {
  assessmentId: string; taxableBase?: string | number; imposedValue?: string | number; reason: string; processId?: string; documentId?: string; idempotencyKey: string;
}) {
  return db.$transaction(tx=>reviseTaxAssessmentInTransaction(tx,actor,input));
}

export async function reviseTaxAssessmentInTransaction(tx:Prisma.TransactionClient,actor:TaxActor,input:{assessmentId:string;taxableBase?:string|number;imposedValue?:string|number;reason:string;processId?:string;documentId?:string;idempotencyKey:string}) {
  if (!input.reason.trim() || !input.idempotencyKey.trim()) throw new TaxError("Motivo e chave da revisão são obrigatórios.");
  const request = { taxableBase: input.taxableBase === undefined ? null : money(input.taxableBase, "Base tributável").toFixed(2), imposedValue: input.imposedValue === undefined ? null : money(input.imposedValue, "Valor da decisão").toFixed(2), reason: input.reason.trim(), processId: input.processId?.trim() || null, documentId: input.documentId?.trim() || null };
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`REVISION:${input.idempotencyKey}`}, 0))::text`;
    const priorEvent = await tx.taxIntegrationEvent.findUnique({ where: { idempotencyKey: `REVISION:${input.idempotencyKey}` } });
    const priorId = jsonObject(priorEvent?.result).registryEntryId;
    if (typeof priorId === "string") {
      const entry = await tx.taxRegistryEntry.findUniqueOrThrow({ where: { id: priorId } });
      const original = await tx.taxAssessment.findUniqueOrThrow({ where: { id: entry.entityId } });
      await assessmentScope(tx, actor, original);
      const stored = jsonObject(jsonObject(priorEvent?.payload).request);
      if (entry.entityId !== input.assessmentId || Object.entries(request).some(([field, value]) => stored[field] !== value)) throw new TaxError("Revisão já registrada com outros dados; preserve a decisão original.");
      return entry;
    }
    const origin = await tx.taxAssessment.findUniqueOrThrow({ where: { id: input.assessmentId } });
    const scope = await assessmentScope(tx, actor, origin);
    const date = new Date();
    const year = await resolveTaxFinancialYear(tx, date.getUTCFullYear(), scope);
    await assertAccountingPeriodOpen(tx, year.id, date);
    await tx.$queryRaw`SELECT id FROM "TaxAssessment" WHERE id = ${input.assessmentId} FOR UPDATE`;
    const assessment = await tx.taxAssessment.findUnique({ where: { id: input.assessmentId } });
    if (!assessment || ["Cancelado", "Dívida Ativa"].includes(assessment.status)) throw new TaxError("O lançamento não está disponível para revisão.");
    await assessmentScope(tx, actor, assessment);
    const oldValue = assessment.finalValueDecimal ?? assessment.originalValueDecimal;
    if (!oldValue) throw new TaxError("O lançamento não possui valor decimal conciliado.");
    const position = await assessmentPosition(tx, assessment.id);
    if (position.availableForGuide.lt(position.balance)) throw new TaxError("Cancele as guias abertas antes de revisar o lançamento.");
    if (input.documentId) {
      const document = await tx.document.findUnique({ where: { id: input.documentId } });
      if (!document || document.status !== "Válido") throw new TaxError("Documento GED da revisão não está válido.");
    }
    let newValue: Prisma.Decimal;
    let memory: Prisma.InputJsonObject;
    if (input.imposedValue !== undefined) {
      newValue = money(input.imposedValue, "Valor da decisão");
      memory = { mode: "DECISAO", imposedValue: newValue.toFixed(2) };
    } else {
      const snapshot = jsonObject(assessment.calculationSnapshot);
      const parameterId = snapshot.parameterId;
      if (typeof parameterId !== "string" || input.taxableBase === undefined) throw new TaxError("A revisão calculada exige regra fiscal e nova base.");
      const { calculation } = await simulateParametrizedAssessment(tx, { taxId: assessment.taxId, parameterId, taxableBase: input.taxableBase, effectiveAt: assessment.competence ?? new Date(Date.UTC(assessment.year, 0, 1)) });
      newValue = calculation.principal;
      memory = { mode: "MOTOR", ...calculation.memory, parameterId };
    }
    const delta = newValue.minus(oldValue).toDecimalPlaces(2);
    await postTaxAssessmentAdjustment(tx, actor, { assessmentId: assessment.id, date, delta, kind: "REVISION", idempotencyKey: `REVISION:${input.idempotencyKey}:ACCOUNTING`, reason: input.reason.trim() });
    if (newValue.lt(position.paid)) throw new TaxError("A revisão não pode reduzir o débito abaixo dos pagamentos e compensações já efetivados.");
    const version = await tx.taxRegistryEntry.count({ where: { entityType: "TAX_ASSESSMENT", entityId: assessment.id, category: "CREDIT_EVENT" } }) + 1;
    const entry = await tx.taxRegistryEntry.create({ data: {
      entityType: "TAX_ASSESSMENT", entityId: assessment.id, category: "CREDIT_EVENT", title: `Revisão ${version}`,
      data: { ...scope, operationFinancialYearId: year.id, eventType: "REVISAO", oldValue: oldValue.toFixed(2), newValue: newValue.toFixed(2), amount: delta.toFixed(2), reason: input.reason.trim(), request, memory },
      status: "ATIVO", source: input.imposedValue === undefined ? "MOTOR_FISCAL" : "DECISAO", processId: input.processId, documentId: input.documentId,
      actorUsuarioId: actor.usuarioId, version,
    } });
    await tx.taxAssessment.update({ where: { id: assessment.id }, data: { finalValueDecimal: newValue, taxableBaseDecimal: input.taxableBase === undefined ? undefined : new Prisma.Decimal(String(input.taxableBase)), calculationSnapshot: { ...jsonObject(assessment.calculationSnapshot), currentVersion: version + 1, currentValue: newValue.toFixed(2), lastRevisionEntryId: entry.id }, status: newValue.eq(position.paid) ? "Pago" : "Revisado" } });
    await synchronizeAssessmentDebt(tx, actor, assessment.id);
    await tx.taxIntegrationEvent.create({ data: { integrationCode: "FISCAL_ENGINE", eventType: "ASSESSMENT_REVISED", idempotencyKey: `REVISION:${input.idempotencyKey}`, status: "PROCESSADO", evidenceLevel: "L1", taxpayerId: assessment.taxpayerId, payload: { assessmentId: assessment.id, request, ...scope }, result: { registryEntryId: entry.id, delta: delta.toFixed(2) }, processedAt: new Date() } });
    await audit(tx, actor, "REVISE", "TaxAssessment", assessment.id, { entryId: entry.id, oldValue: oldValue.toFixed(2), newValue: newValue.toFixed(2), delta: delta.toFixed(2) });
    return entry;
}

export async function registerCreditEvent(db: PrismaClient, actor: TaxActor, input: {
  assessmentId: string; eventType: "IMPUGNACAO" | "DECISAO" | "SUSPENSAO" | "EXTINCAO_NAO_FINANCEIRA" | "COMPENSACAO";
  amount?: string | number; reason: string; processId?: string; documentId?: string; idempotencyKey: string;
}) {
  return db.$transaction(tx => registerCreditEventInTransaction(tx, actor, input));
}

export async function registerCreditEventInTransaction(tx: Prisma.TransactionClient, actor: TaxActor, input: {
  assessmentId: string; eventType: "IMPUGNACAO" | "DECISAO" | "SUSPENSAO" | "EXTINCAO_NAO_FINANCEIRA" | "COMPENSACAO";
  amount?: string | number; reason: string; processId?: string; documentId?: string; idempotencyKey: string;
}) {
  if (!input.reason.trim() || !input.idempotencyKey.trim()) throw new TaxError("Informe fundamento e chave do evento tributário.");
  if (!["IMPUGNACAO", "DECISAO", "SUSPENSAO", "EXTINCAO_NAO_FINANCEIRA", "COMPENSACAO"].includes(input.eventType)) throw new TaxError("Tipo de evento tributário inválido.");
  const request = { amount: input.amount === undefined ? null : money(input.amount).toFixed(2), reason: input.reason.trim(), processId: input.processId?.trim() || null, documentId: input.documentId?.trim() || null };
    const key = `CREDIT_EVENT:${input.idempotencyKey}`;
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`;
    const existing = await tx.taxIntegrationEvent.findUnique({ where: { idempotencyKey: key } });
    const existingId = jsonObject(existing?.result).registryEntryId;
    if (typeof existingId === "string") {
      const entry = await tx.taxRegistryEntry.findUniqueOrThrow({ where: { id: existingId } });
      const original = await tx.taxAssessment.findUniqueOrThrow({ where: { id: entry.entityId } });
      await assessmentScope(tx, actor, original);
      const data = jsonObject(entry.data);
      const stored = jsonObject(data.request);
      if (entry.entityId !== input.assessmentId || data.eventType !== input.eventType || (data.request ? Object.entries(request).some(([field, value]) => stored[field] !== value) : data.amount !== request.amount || data.reason !== request.reason || (entry.processId ?? null) !== request.processId || (entry.documentId ?? null) !== request.documentId)) throw new TaxError("Evento já registrado com outros dados.");
      return entry;
    }
    if (input.eventType === "COMPENSACAO") throw new TaxError("Efetive a compensação pela movimentação de crédito disponível, com origem e contabilização próprias.");
    const assessment = await tx.taxAssessment.findUnique({ where: { id: input.assessmentId } });
    if (!assessment) throw new TaxError("Lançamento não encontrado.");
    const scope = await assessmentScope(tx, actor, assessment);
    if (input.documentId) {
      const document = await tx.document.findUnique({ where: { id: input.documentId } });
      if (!document || document.status !== "Válido") throw new TaxError("Documento GED do evento não está válido.");
    }
    const date = new Date();
    let extinction: Prisma.InputJsonObject = {};
    let amountValue = input.amount === undefined ? null : money(input.amount);
    if (input.eventType === "EXTINCAO_NAO_FINANCEIRA") {
      const year = await resolveTaxFinancialYear(tx, date.getUTCFullYear(), scope);
      await assertAccountingPeriodOpen(tx, year.id, date);
      await tx.$queryRaw`SELECT id FROM "TaxAssessment" WHERE id = ${assessment.id} FOR UPDATE`;
      const position = await assessmentPosition(tx, assessment.id);
      if (["Cancelado", "Pago", "Suspenso", "Dívida Ativa"].includes(position.assessment.status)) throw new TaxError("Débito não está disponível para extinção neste fluxo.");
      if (position.availableForGuide.lt(position.balance)) throw new TaxError("Cancele as guias abertas antes da extinção do débito.");
      amountValue ??= position.balance;
      if (amountValue.lte(0) || amountValue.gt(position.balance)) throw new TaxError("A extinção excede o saldo disponível do débito.");
      const finalValue = position.total.minus(amountValue);
      await postTaxAssessmentAdjustment(tx, actor, { assessmentId: assessment.id, date, delta: amountValue.negated(), kind: "EXTINCTION", idempotencyKey: `${key}:ACCOUNTING`, reason: input.reason.trim() });
      extinction = { oldValue: position.total.toFixed(2), newValue: finalValue.toFixed(2), reducesAssessmentValue: true, operationFinancialYearId: year.id };
      await tx.taxAssessment.update({ where: { id: assessment.id }, data: { finalValueDecimal: finalValue, status: finalValue.eq(position.paid) ? "Extinto" : "Revisado", calculationSnapshot: { ...jsonObject(position.assessment.calculationSnapshot), currentValue: finalValue.toFixed(2), lastExtinctionKey: key } } });
      await synchronizeAssessmentDebt(tx, actor, assessment.id);
    }
    const entry = await tx.taxRegistryEntry.create({ data: {
      entityType: "TAX_ASSESSMENT", entityId: assessment.id, category: "CREDIT_EVENT", title: input.eventType.replaceAll("_", " "),
      data: { ...scope, ...extinction, eventType: input.eventType, amount: amountValue?.toFixed(2) ?? null, reason: input.reason.trim(), request }, status: "ATIVO", source: "INTERNO",
      processId: input.processId, documentId: input.documentId, actorUsuarioId: actor.usuarioId,
    } });
    if (input.eventType === "SUSPENSAO") await tx.taxAssessment.update({ where: { id: assessment.id }, data: { status: "Suspenso" } });
    await tx.taxIntegrationEvent.create({ data: { integrationCode: "FISCAL_ENGINE", eventType: input.eventType, idempotencyKey: key, status: "PROCESSADO", evidenceLevel: "L1", taxpayerId: assessment.taxpayerId, payload: { assessmentId: assessment.id, ...scope, request }, result: { registryEntryId: entry.id }, processedAt: new Date() } });
    await audit(tx, actor, input.eventType, "TaxAssessment", assessment.id, { registryEntryId: entry.id, amount: amountValue?.toFixed(2) ?? null });
    return entry;
}

async function assessmentPosition(tx: Db, assessmentId: string) {
  const assessment = await tx.taxAssessment.findUnique({ where: { id: assessmentId }, include: { guides: { where: { status: { not: "Cancelada" } }, include: { payments: { where: { status: "Confirmado" } } } } } });
  if (!assessment) throw new TaxError("Lançamento não encontrado.");
  const total = assessment.finalValueDecimal ?? assessment.originalValueDecimal;
  if (!total) throw new TaxError("O lançamento não possui valor decimal conciliado.");
  const compensated = await taxAssessmentCompensatedValue(tx, assessment.id);
  // O cancelamento documental da guia não estorna recebimentos já confirmados.
  const payments = await tx.taxPayment.findMany({ where: { guide: { assessmentId }, status: "Confirmado" }, select: { amountPaidDecimal: true } });
  if (payments.some(payment => payment.amountPaidDecimal === null)) throw new TaxError("Os recebimentos do lançamento exigem conciliação Decimal.");
  const paid = payments.reduce((sum, payment) => sum.plus(payment.amountPaidDecimal!), compensated);
  const openGuides = assessment.guides.reduce<Prisma.Decimal>((sum, guide) => {
    const paidOnGuide = guide.payments.reduce((value, payment) => value.plus(payment.amountPaidDecimal ?? 0), new Prisma.Decimal(0));
    const guideTotal = guide.totalValueDecimal ?? new Prisma.Decimal(guide.totalValue);
    return sum.plus(Prisma.Decimal.max(guideTotal.minus(paidOnGuide), 0));
  }, new Prisma.Decimal(0));
  return { assessment, total, paid, balance: Prisma.Decimal.max(total.minus(paid), 0), availableForGuide: Prisma.Decimal.max(total.minus(paid).minus(openGuides), 0) };
}

export async function generatePartialTaxGuide(db: PrismaClient, actor: TaxActor, input: { assessmentId: string; amount: string | number; dueDate: Date; documentId?: string }) {
  const requested = money(input.amount, "Valor do DAM");
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "TaxAssessment" WHERE id = ${input.assessmentId} FOR UPDATE`;
    const position = await assessmentPosition(tx, input.assessmentId);
    const scope = await assessmentScope(tx, actor, position.assessment);
    if (["Cancelado", "Pago", "Extinto", "Suspenso"].includes(position.assessment.status)) throw new TaxError("O lançamento não está disponível para emissão.");
    if (requested.greaterThan(position.availableForGuide)) throw new TaxError(`O valor disponível para novos DAMs é ${position.availableForGuide.toFixed(2)}.`);
    const guideNumber = await nextNumber(tx, position.assessment.year, "GUIDE");
    const guide = await tx.taxGuide.create({ data: { assessmentId: position.assessment.id, guideNumber, totalValue: Number(requested), totalValueDecimal: requested, dueDate: input.dueDate, documentId: input.documentId, status: "Emitida", calculationSnapshot: { ...scope, assessmentId: position.assessment.id, amount: requested.toFixed(2), effect: "EMISSAO_SEM_BAIXA" } } });
    await tx.taxAssessment.update({ where: { id: position.assessment.id }, data: { status: "Emitido" } });
    await audit(tx, actor, "ISSUE_PARTIAL_DAM", "TaxGuide", guide.id, { assessmentId: position.assessment.id, amount: requested.toFixed(2), balanceBeforePayment: position.balance.toFixed(2) });
    return guide;
  });
}

export async function generateGroupedTaxGuides(db: PrismaClient, actor: TaxActor, input: { assessmentIds: string[]; dueDate: Date }) {
  const ids = [...new Set(input.assessmentIds.filter(Boolean))].sort();
  if (ids.length < 2) throw new TaxError("Selecione pelo menos dois lançamentos para o DAM agrupado.");
  return db.$transaction(async (tx) => {
    const assessments = await tx.taxAssessment.findMany({ where: { id: { in: ids } }, orderBy: { id: "asc" } });
    if (assessments.length !== ids.length) throw new TaxError("Um dos lançamentos selecionados não foi encontrado.");
    if (new Set(assessments.map((item) => item.taxpayerId)).size !== 1) throw new TaxError("O DAM agrupado aceita apenas débitos do mesmo contribuinte.");
    const scopes = await Promise.all(assessments.map((assessment) => assessmentScope(tx, actor, assessment)));
    if (new Set(scopes.map((scope) => scope.budgetUnitId)).size !== 1) throw new TaxError("O DAM agrupado exige lançamentos da mesma unidade gestora.");
    const groupId = randomUUID();
    const guides = [];
    for (const assessment of assessments) {
      await tx.$queryRaw`SELECT id FROM "TaxAssessment" WHERE id = ${assessment.id} FOR UPDATE`;
      const position = await assessmentPosition(tx, assessment.id);
      if (["Cancelado", "Pago", "Extinto", "Suspenso"].includes(position.assessment.status)) throw new TaxError("O lançamento não está disponível para emissão agrupada.");
      if (position.availableForGuide.lessThanOrEqualTo(0)) throw new TaxError(`O lançamento ${assessment.assessmentNumber ?? assessment.id} não possui saldo livre para emissão.`);
      const guideNumber = await nextNumber(tx, assessment.year, "GUIDE");
      const guide = await tx.taxGuide.create({ data: { assessmentId: assessment.id, guideNumber, totalValue: Number(position.availableForGuide), totalValueDecimal: position.availableForGuide, dueDate: input.dueDate, status: "Emitida", calculationSnapshot: { ...scopes[0], groupId, assessmentId: assessment.id, amount: position.availableForGuide.toFixed(2), effect: "EMISSAO_SEM_BAIXA" } } });
      guides.push(guide);
      await tx.taxAssessment.update({ where: { id: assessment.id }, data: { status: "Emitido" } });
    }
    const total = guides.reduce((sum, guide) => sum.plus(guide.totalValueDecimal ?? 0), new Prisma.Decimal(0));
    const group = await tx.taxRegistryEntry.create({ data: { entityType: "DAM_GROUP", entityId: groupId, category: "DAM_AGRUPADO", title: `DAM agrupado ${groupId.slice(0, 8).toUpperCase()}`, data: { guideIds: guides.map((guide) => guide.id), guideNumbers: guides.map((guide) => guide.guideNumber), assessmentIds: ids, total: total.toFixed(2), dueDate: input.dueDate.toISOString() }, status: "EMITIDO", source: "INTERNO", actorUsuarioId: actor.usuarioId } });
    await audit(tx, actor, "ISSUE_GROUPED_DAM", "TaxRegistryEntry", group.id, { groupId, guideIds: guides.map((guide) => guide.id), total: total.toFixed(2) });
    return { group, guides, total };
  });
}

export async function createPixCharge(db: PrismaClient, actor: TaxActor, input: { guideId: string; idempotencyKey: string }) {
  const key = `PIX_CHARGE:${input.idempotencyKey.trim()}`;
  const existing = await db.taxIntegrationEvent.findUnique({ where: { idempotencyKey: key } });
  const guide = await db.taxGuide.findUnique({ where: { id: input.guideId }, include: { assessment: true } });
  if (!guide) throw new TaxError("O DAM não está disponível para cobrança.");
  await assessmentScope(db, actor, guide.assessment);
  if (existing) {
    if (jsonObject(existing.payload).guideId !== input.guideId) throw new TaxError("Cobrança já registrada para outra guia.");
    return existing;
  }
  if (["Cancelada", "Paga"].includes(guide.status)) throw new TaxError("O DAM não está disponível para cobrança.");
  const reference = `PIX-${guide.guideNumber ?? guide.id}`;
  const event = await db.taxIntegrationEvent.create({ data: { integrationCode: "PIX_ADAPTER", eventType: "CHARGE_CREATED", idempotencyKey: key, externalReference: reference, status: "AGUARDANDO_CONFIRMACAO", evidenceLevel: "L1", taxpayerId: guide.assessment.taxpayerId, payload: { guideId: guide.id, guideNumber: guide.guideNumber, amount: guide.totalValueDecimal?.toFixed(2) ?? String(guide.totalValue) }, result: { reference, copyAndPaste: reference, paid: false } } });
  await audit(db, actor, "CREATE_CHARGE", "TaxIntegrationEvent", event.id, { guideId: guide.id, reference, status: event.status });
  return event;
}

export async function processCollectionReturn(db: PrismaClient, actor: TaxActor, input: {
  idempotencyKey: string; guideNumber?: string; amount: string | number; occurredAt: Date; status: "CONFIRMADO" | "INVALIDO" | "REJEITADO"; bankAccountId?: string; externalReference?: string;
}) {
  if (!input.idempotencyKey.trim() || Number.isNaN(input.occurredAt.getTime())) throw new TaxError("Chave e data válidas são obrigatórias para o retorno.");
  const key = `BANK_RETURN:${input.idempotencyKey.trim()}`;
  const receivedAmount = money(input.amount, "Valor recebido");
  return db.$transaction(async (tx) => {
  // Serialize the return key even before an integration event exists.
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`;
  const existing = await tx.taxIntegrationEvent.findUnique({ where: { idempotencyKey: key } });
  if (existing) {
    const payload = jsonObject(existing.payload);
    const guideId = typeof payload.guideId === "string" ? payload.guideId : null;
    if (guideId) {
      const priorGuide = await tx.taxGuide.findUniqueOrThrow({ where: { id: guideId }, include: { assessment: true } });
      await assessmentScope(tx, actor, priorGuide.assessment);
    } else if (actor.allowedBudgetUnitIds && jsonObject(existing.result).actorUsuarioId !== actor.usuarioId) throw new TaxError("Retorno rejeitado fora do usuário autorizado.");
    if (payload.amount !== receivedAmount.toFixed(2) || payload.occurredAt !== input.occurredAt.toISOString() || (input.guideNumber ?? null) !== (payload.guideNumber ?? null) || (payload.bankAccountId ?? null) !== (input.bankAccountId ?? null) || (existing.externalReference ?? null) !== (input.externalReference ?? null) || (payload.returnStatus ?? "CONFIRMADO") !== input.status) throw new TaxError("Retorno já registrado com outros dados.");
    return existing;
  }
   const matched = input.guideNumber ? await tx.taxGuide.findFirst({ where: { OR: [{ guideNumber: input.guideNumber }, { id: input.guideNumber }] }, select: { id: true, assessmentId: true } }) : null;
   if (matched) {
     await tx.$queryRaw`SELECT id FROM "TaxAssessment" WHERE id = ${matched.assessmentId} FOR UPDATE`;
     await tx.$queryRaw`SELECT id FROM "TaxGuide" WHERE id = ${matched.id} FOR UPDATE`;
   }
  const guide = matched ? await tx.taxGuide.findUnique({ where: { id: matched.id }, include: { assessment: true, payments: { where: { status: "Confirmado" } } } }) : null;
  if (guide) await assessmentScope(tx, actor, guide.assessment);
  if (input.status !== "CONFIRMADO" || !guide) {
    const reason = input.status === "REJEITADO" ? "Arquivo rejeitado" : !guide ? "Referência não localizada" : "Registro inválido";
    const rejected = await tx.taxIntegrationEvent.create({ data: { integrationCode: "BANK_RETURN", eventType: "COLLECTION_RETURN", idempotencyKey: key, externalReference: input.externalReference, status: "REJEITADO", evidenceLevel: "L1", payload: { guideId: guide?.id ?? null, guideNumber: input.guideNumber ?? null, bankAccountId: input.bankAccountId ?? null, returnStatus: input.status, amount: receivedAmount.toFixed(2), occurredAt: input.occurredAt.toISOString() }, result: { reason, applied: "0.00", actorUsuarioId: actor.usuarioId }, processedAt: new Date() } });
    await audit(tx, actor, "REJECT_BANK_RETURN", "TaxIntegrationEvent", rejected.id, { reason });
    return rejected;
  }
  const guideTotal = guide.totalValueDecimal ?? new Prisma.Decimal(String(guide.totalValue));
   const paidBefore = guide.payments.reduce((sum, payment) => { if (!payment.amountPaidDecimal) throw new TaxError("Pagamento histórico sem Decimal conciliado."); return sum.plus(payment.amountPaidDecimal); }, new Prisma.Decimal(0));
   const assessmentPayments = await tx.taxPayment.findMany({ where: { guide: { assessmentId: guide.assessmentId }, status: "Confirmado" }, select: { amountPaidDecimal: true } });
   const assessmentPaid = assessmentPayments.reduce((sum, payment) => { if (!payment.amountPaidDecimal) throw new TaxError("Pagamento histórico sem Decimal conciliado."); return sum.plus(payment.amountPaidDecimal); }, new Prisma.Decimal(0));
   const assessmentTotal = guide.assessment.finalValueDecimal ?? guide.assessment.originalValueDecimal;
   if (!assessmentTotal) throw new TaxError("Lançamento sem Decimal conciliado.");
   const outstanding = Prisma.Decimal.max(0, Prisma.Decimal.min(guideTotal.minus(paidBefore), assessmentTotal.minus(assessmentPaid).minus(await taxAssessmentCompensatedValue(tx, guide.assessmentId))));
  if (outstanding.lessThanOrEqualTo(0)) throw new TaxError("O DAM já está integralmente pago.");
  const applied = Prisma.Decimal.min(receivedAmount, outstanding);
  await confirmTaxPaymentInTransaction(tx, actor, { guideId: guide.id, amountPaid: applied, paymentDate: input.occurredAt, paymentMethod: "Retorno bancário", idempotencyKey: key, bankAccountId: input.bankAccountId });
  const excess = receivedAmount.minus(applied).toDecimalPlaces(2);
  let creditEntryId: string | null = null;
  if (excess.greaterThan(0)) {
    const scope = await assessmentScope(tx, actor, guide.assessment);
    const credit = await tx.taxRegistryEntry.create({ data: { entityType: "TAXPAYER", entityId: guide.assessment.taxpayerId, category: "TAX_CREDIT", title: `Crédito de arrecadação ${input.externalReference ?? input.idempotencyKey}`, data: { ...scope, amount: excess.toFixed(2), available: excess.toFixed(2), originGuideId: guide.id, originEventKey: key }, status: "DISPONIVEL", source: "RETORNO_BANCARIO", actorUsuarioId: actor.usuarioId } });
    creditEntryId = credit.id;
    const payment = await tx.taxPayment.findUniqueOrThrow({ where: { idempotencyKey: key } });
    if (!payment.bankAccountId) throw new TaxError("Pagamento sem conta para ingresso do excedente.");
    await recordTaxExcessInTransaction(tx, actor, { creditId: credit.id, bankAccountId: payment.bankAccountId, date: input.occurredAt, amount: excess });
  }
  const event = await tx.taxIntegrationEvent.create({ data: { integrationCode: "BANK_RETURN", eventType: "COLLECTION_RETURN", idempotencyKey: key, externalReference: input.externalReference, status: "PROCESSADO", evidenceLevel: "L1", taxpayerId: guide.assessment.taxpayerId, payload: { guideId: guide.id, guideNumber: input.guideNumber ?? null, bankAccountId: input.bankAccountId ?? null, returnStatus: input.status, amount: receivedAmount.toFixed(2), occurredAt: input.occurredAt.toISOString() }, result: { applied: applied.toFixed(2), excess: excess.toFixed(2), creditEntryId }, processedAt: new Date() } });
  await audit(tx, actor, "PROCESS_BANK_RETURN", "TaxIntegrationEvent", event.id, { guideId: guide.id, applied: applied.toFixed(2), excess: excess.toFixed(2) });
  return event;
  });
}

export async function applyTaxCredit(db: PrismaClient, actor: TaxActor, input: {
  creditId: string; operation: "COMPENSAR" | "TRANSFERIR" | "RESTITUIR"; amount: string | number; assessmentId?: string; destinationTaxpayerId?: string; reason: string; idempotencyKey: string; authorizationDocumentId?: string;
}) {
  const requested = money(input.amount);
  if (!input.reason.trim() || !input.idempotencyKey.trim()) throw new TaxError("Informe motivo e chave da movimentação do crédito.");
  return db.$transaction(async (tx) => {
    const key = `TAX_CREDIT:${input.idempotencyKey.trim()}`;
    const date = new Date();
    if (input.operation === "COMPENSAR") {
      const origin = await tx.taxRegistryEntry.findUniqueOrThrow({ where: { id: input.creditId } });
      const originScope = await assertTaxCreditScope(tx, actor, origin.data);
      if (!await tx.taxIntegrationEvent.findUnique({ where: { idempotencyKey: key } })) {
        const year = await resolveTaxFinancialYear(tx, date.getUTCFullYear(), originScope);
        await assertAccountingPeriodOpen(tx, year.id, date);
      }
    }
    await tx.$queryRaw`SELECT id FROM "TaxRegistryEntry" WHERE id = ${input.creditId} FOR UPDATE`;
    const credit = await tx.taxRegistryEntry.findUnique({ where: { id: input.creditId } });
    if (!credit || credit.category !== "TAX_CREDIT") throw new TaxError("Crédito tributário disponível não encontrado.");
    const data = jsonObject(credit.data);
    const scope = await assertTaxCreditScope(tx, actor, credit.data);
    const prior = await tx.taxIntegrationEvent.findUnique({ where: { idempotencyKey: key } });
    if (prior) {
      const payload = jsonObject(prior.payload);
      const targetId = input.operation === "COMPENSAR" ? input.assessmentId : input.operation === "TRANSFERIR" ? input.destinationTaxpayerId : credit.entityId;
      if (prior.eventType !== input.operation || payload.creditId !== credit.id || payload.amount !== requested.toFixed(2) || payload.targetId !== targetId || payload.reason !== input.reason.trim() || (payload.authorizationDocumentId ?? null) !== (input.authorizationDocumentId?.trim() || null)) throw new TaxError("Movimento do crédito já registrado com outros dados.");
      return prior;
    }
    if (!data.ingressTransactionId || !data.ingressMovementId) throw new TaxError("Crédito sem ingresso financeiro conciliado.");
    const available = new Prisma.Decimal(String(data.available ?? 0));
    if (requested.greaterThan(available)) throw new TaxError(`O crédito disponível é ${available.toFixed(2)}.`);
    if (input.operation === "COMPENSAR" && !input.assessmentId) throw new TaxError("Selecione o débito de destino da compensação.");
    if (input.operation === "TRANSFERIR" && !input.destinationTaxpayerId) throw new TaxError("Selecione o contribuinte de destino.");
    if (!["COMPENSAR", "TRANSFERIR", "RESTITUIR"].includes(input.operation)) throw new TaxError("Operação do crédito inválida.");
    if (input.operation === "TRANSFERIR") {
      const destination = await tx.taxpayer.findUnique({ where: { id: input.destinationTaxpayerId! } });
      if (!destination || destination.status !== "Ativo") throw new TaxError("Contribuinte de destino deve estar ativo.");
    }
    let accountingTransactionId: string | null = null;
    if (input.operation === "COMPENSAR") {
      await tx.$queryRaw`SELECT id FROM "TaxAssessment" WHERE id = ${input.assessmentId!} FOR UPDATE`;
      const { assessment, scope: destination } = await resolveCreditDestinationScope(tx, actor, input.assessmentId!);
      if (destination.budgetUnitId !== scope.budgetUnitId || destination.governmentEntityId !== scope.governmentEntityId) throw new TaxError("Compensação exige débito da mesma entidade e UG.");
      if (assessment.taxpayerId !== credit.entityId) {
        const authorization = input.authorizationDocumentId?.trim() ? await tx.document.findUnique({ where: { id: input.authorizationDocumentId.trim() } }) : null;
        if (!authorization || authorization.status !== "Válido") throw new TaxError("Compensação entre contribuintes exige autorização GED válida.");
        const taxpayer = await tx.taxpayer.findUniqueOrThrow({ where: { id: assessment.taxpayerId } });
        if (taxpayer.status !== "Ativo") throw new TaxError("Contribuinte de destino deve estar ativo.");
      }
      if (["Cancelado", "Pago", "Suspenso", "Dívida Ativa"].includes(assessment.status)) throw new TaxError("Débito não está disponível para compensação.");
      const position = await assessmentPosition(tx, assessment.id);
      if (requested.gt(position.availableForGuide)) throw new TaxError("Compensação excede o saldo livre; cancele as guias abertas antes de compensar.");
      const year = await resolveTaxFinancialYear(tx, date.getUTCFullYear(), scope);
      const recognized = await recognizedTaxProfile(tx, actor, assessment.id, date);
      const transaction = await postAccountingEventInTransaction(tx, actor, { financialYearId: year.id, ...scope, date, value: requested, eventCode: "TAX_CREDIT_COMPENSATED", history: `Compensação tributária ${credit.id} → ${assessment.id}`, sourceModule: "TRIBUTACAO", sourceType: "TAX_CREDIT_COMPENSATION", sourceId: credit.id, idempotencyKey: `${key}:ACCOUNTING`, creditAccountId: recognized?.receivableAccountId });
      accountingTransactionId = transaction.id;
      await tx.taxAssessment.update({ where: { id: assessment.id }, data: { status: requested.equals(position.balance) ? "Pago" : "Parcial" } });
      await synchronizeAssessmentDebt(tx, actor, assessment.id);
    }
    const remaining = available.minus(requested).toDecimalPlaces(2);
    await tx.taxRegistryEntry.update({ where: { id: credit.id }, data: { data: { ...data, available: remaining.toFixed(2) }, status: remaining.equals(0) ? "UTILIZADO" : "DISPONIVEL" } });
    const targetType = input.operation === "COMPENSAR" ? "TAX_ASSESSMENT" : "TAXPAYER";
    const targetId = (input.operation === "COMPENSAR" ? input.assessmentId : input.operation === "TRANSFERIR" ? input.destinationTaxpayerId : credit.entityId)!;
    const movement = await tx.taxRegistryEntry.create({ data: { entityType: targetType, entityId: targetId, category: input.operation === "RESTITUIR" ? "REFUND_REQUEST" : "CREDIT_MOVEMENT", title: input.operation, data: { ...scope, operation: input.operation, sourceCreditId: credit.id, sourceTaxpayerId: credit.entityId, destinationId: targetId, amount: requested.toFixed(2), accountingTransactionId, authorizationDocumentId: input.authorizationDocumentId?.trim() || null, reason: input.reason.trim(), status: input.operation === "RESTITUIR" ? "PENDENTE_APROVACAO" : "EFETIVADO" }, status: input.operation === "RESTITUIR" ? "PENDENTE_APROVACAO" : "EFETIVADO", source: "INTERNO", actorUsuarioId: actor.usuarioId } });
    if (input.operation === "TRANSFERIR") await tx.taxRegistryEntry.create({ data: { entityType: "TAXPAYER", entityId: targetId, category: "TAX_CREDIT", title: `Crédito transferido de ${credit.entityId}`, data: { ...data, ...scope, amount: requested.toFixed(2), available: requested.toFixed(2), sourceCreditId: credit.id, movementId: movement.id }, status: "DISPONIVEL", source: "TRANSFERENCIA", actorUsuarioId: actor.usuarioId } });
    const event = await tx.taxIntegrationEvent.create({ data: { integrationCode: "TAX_CREDIT", eventType: input.operation, idempotencyKey: key, status: input.operation === "RESTITUIR" ? "PENDENTE" : "PROCESSADO", evidenceLevel: "L1", taxpayerId: credit.entityId, payload: { creditId: credit.id, amount: requested.toFixed(2), targetId, reason: input.reason.trim(), authorizationDocumentId: input.authorizationDocumentId?.trim() || null }, result: { movementId: movement.id, remaining: remaining.toFixed(2), accountingTransactionId }, processedAt: input.operation === "RESTITUIR" ? null : new Date() } });
    await audit(tx, actor, input.operation, "TaxRegistryEntry", movement.id, { creditId: credit.id, amount: requested.toFixed(2), remaining: remaining.toFixed(2), targetId });
    return event;
  });
}

export async function createReconciliation(db: PrismaClient, actor: TaxActor, input: { agreementId: string; date: Date; paymentTotal: string | number; remittanceTotal: string | number; reason?: string }) {
  const payments = money(input.paymentTotal, "Total de pagamentos");
  const remittance = new Prisma.Decimal(String(input.remittanceTotal)).toDecimalPlaces(2);
  if (!remittance.isFinite() || remittance.lessThan(0)) throw new TaxError("O total repassado não pode ser negativo.");
  const difference = remittance.minus(payments).toDecimalPlaces(2);
  const entry = await db.taxRegistryEntry.create({ data: { entityType: "COLLECTION_AGREEMENT", entityId: input.agreementId, category: "RECONCILIATION", title: `Conciliação ${input.date.toISOString().slice(0, 10)}`, data: { date: input.date.toISOString(), paymentTotal: payments.toFixed(2), remittanceTotal: remittance.toFixed(2), difference: difference.toFixed(2), surplus: Prisma.Decimal.max(difference, 0).toFixed(2), reason: input.reason?.trim() || null, status: difference.equals(0) ? "PRONTA_PARA_LIBERAR" : "DIVERGENTE" }, status: difference.equals(0) ? "PRONTA_PARA_LIBERAR" : "DIVERGENTE", source: "INTERNO", actorUsuarioId: actor.usuarioId } });
  await audit(db, actor, "RECONCILE", "TaxRegistryEntry", entry.id, { agreementId: input.agreementId, difference: difference.toFixed(2) });
  return entry;
}

export async function configureCollectionAgreement(db: PrismaClient, actor: TaxActor, input: { code: string; name: string; bankAccountId?: string; automaticRelease?: boolean; paymentUrl?: string }) {
  if (!input.code.trim() || !input.name.trim()) throw new TaxError("Código e nome do agente arrecadador são obrigatórios.");
  const entityId = input.code.trim().toUpperCase();
  const previous = await db.taxRegistryEntry.findFirst({ where: { entityType: "COLLECTION_AGREEMENT", entityId, category: "AGREEMENT", status: "ATIVO" }, orderBy: { version: "desc" } });
  const version = (previous?.version ?? 0) + 1;
  if (previous) await db.taxRegistryEntry.update({ where: { id: previous.id }, data: { status: "SUBSTITUIDO", effectiveUntil: new Date() } });
  const entry = await db.taxRegistryEntry.create({ data: { entityType: "COLLECTION_AGREEMENT", entityId, category: "AGREEMENT", title: input.name.trim(), data: { code: entityId, name: input.name.trim(), bankAccountId: input.bankAccountId || null, automaticRelease: Boolean(input.automaticRelease), paymentUrl: input.paymentUrl?.trim() || null }, status: "ATIVO", source: "INTERNO", actorUsuarioId: actor.usuarioId, version } });
  await audit(db, actor, "CONFIGURE_AGREEMENT", "TaxRegistryEntry", entry.id, { entityId, version });
  return entry;
}

export async function resolveReconciliation(db: PrismaClient, actor: TaxActor, input: { id: string; adjustment: string | number; reason: string }) {
  const adjustment = new Prisma.Decimal(String(input.adjustment)).toDecimalPlaces(2);
  if (!adjustment.isFinite() || adjustment.equals(0) || !input.reason.trim()) throw new TaxError("Informe ajuste diferente de zero e motivo.");
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "TaxRegistryEntry" WHERE id = ${input.id} FOR UPDATE`;
    const entry = await tx.taxRegistryEntry.findUnique({ where: { id: input.id } });
    if (!entry || entry.category !== "RECONCILIATION" || entry.status === "FECHADA") throw new TaxError("Conciliação não está disponível para saneamento.");
    const data = jsonObject(entry.data);
    const previousDifference = new Prisma.Decimal(String(data.difference ?? 0));
    const difference = previousDifference.plus(adjustment).toDecimalPlaces(2);
    const history = Array.isArray(data.adjustments) ? data.adjustments : [];
    const updated = await tx.taxRegistryEntry.update({ where: { id: entry.id }, data: { status: difference.equals(0) ? "PRONTA_PARA_LIBERAR" : "DIVERGENTE", data: { ...data, difference: difference.toFixed(2), status: difference.equals(0) ? "PRONTA_PARA_LIBERAR" : "DIVERGENTE", adjustments: [...history, { amount: adjustment.toFixed(2), reason: input.reason.trim(), at: new Date().toISOString(), actorUsuarioId: actor.usuarioId }] } } });
    await audit(tx, actor, "RESOLVE_RECONCILIATION", "TaxRegistryEntry", entry.id, { previousDifference: previousDifference.toFixed(2), adjustment: adjustment.toFixed(2), difference: difference.toFixed(2), reason: input.reason.trim() });
    return updated;
  });
}

export async function approveRefundRequest(db: PrismaClient, actor: TaxActor, input: { requestId: string; approved: boolean; reason: string }) {
  return db.$transaction(async (tx) => {
    const request = await tx.taxRegistryEntry.findUnique({ where: { id: input.requestId } });
    if (!request || request.category !== "REFUND_REQUEST" || request.status !== "PENDENTE_APROVACAO") throw new TaxError("Pedido de restituição não está pendente de aprovação.");
    const data = jsonObject(request.data);
    await assertTaxCreditScope(tx, actor, request.data);
    if (typeof data.sourceCreditId !== "string") throw new TaxError("Restituição sem crédito de origem conciliado.");
    await tx.$queryRaw`SELECT id FROM "TaxRegistryEntry" WHERE id = ${data.sourceCreditId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "TaxRegistryEntry" WHERE id = ${request.id} FOR UPDATE`;
    const current = await tx.taxRegistryEntry.findUniqueOrThrow({ where: { id: request.id } });
    if (current.status !== request.status || JSON.stringify(current.data) !== JSON.stringify(request.data)) throw new TaxError("Pedido alterado; atualize antes de decidir.");
    if (!input.reason.trim()) throw new TaxError("Informe o motivo da decisão sobre a restituição.");
    const status = input.approved ? "APROVADA_AGUARDANDO_TESOURARIA" : "REJEITADA";
    if (!input.approved && typeof data.sourceCreditId === "string") {
      await tx.$queryRaw`SELECT id FROM "TaxRegistryEntry" WHERE id = ${data.sourceCreditId} FOR UPDATE`;
      const sourceCredit = await tx.taxRegistryEntry.findUnique({ where: { id: data.sourceCreditId } });
      if (sourceCredit) {
        const sourceData = jsonObject(sourceCredit.data);
        const restored = new Prisma.Decimal(String(sourceData.available ?? 0)).plus(new Prisma.Decimal(String(data.amount ?? 0))).toDecimalPlaces(2);
        await tx.taxRegistryEntry.update({ where: { id: sourceCredit.id }, data: { status: "DISPONIVEL", data: { ...sourceData, available: restored.toFixed(2) } } });
      }
    }
    const updated = await tx.taxRegistryEntry.update({ where: { id: request.id }, data: { status, data: { ...data, status, decisionReason: input.reason.trim(), decidedAt: new Date().toISOString() }, reviewedByUsuarioId: actor.usuarioId, reviewedAt: new Date() } });
    await audit(tx, actor, input.approved ? "APPROVE_REFUND" : "REJECT_REFUND", "TaxRegistryEntry", request.id, { reason: input.reason.trim(), status });
    return updated;
  });
}

export async function closeReconciliation(db: PrismaClient, actor: TaxActor, id: string) {
  return db.$transaction(async (tx) => {
    const entry = await tx.taxRegistryEntry.findUnique({ where: { id } });
    if (!entry || entry.category !== "RECONCILIATION") throw new TaxError("Conciliação não encontrada.");
    const data = jsonObject(entry.data);
    if (new Prisma.Decimal(String(data.difference ?? 0)).greaterThan(0) || new Prisma.Decimal(String(data.difference ?? 0)).lessThan(0)) throw new TaxError("Resolva a diferença antes do fechamento.");
    const closed = await tx.taxRegistryEntry.update({ where: { id }, data: { status: "FECHADA", data: { ...data, status: "FECHADA", closedAt: new Date().toISOString() }, reviewedByUsuarioId: actor.usuarioId, reviewedAt: new Date() } });
    await audit(tx, actor, "CLOSE_RECONCILIATION", "TaxRegistryEntry", id, { closedAt: closed.reviewedAt?.toISOString() ?? null });
    return closed;
  });
}

export async function sendAccountingReference(db: PrismaClient, actor: TaxActor, input: { sourceType: string; sourceId: string; amount: string | number; competence: Date }) {
  const idempotencyKey = `ACCOUNTING:${input.sourceType}:${input.sourceId}`;
  const amountValue = money(input.amount);
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "TaxIntegrationEvent" WHERE id = ${input.sourceId} FOR UPDATE`;
    const origin = await tx.taxIntegrationEvent.findUnique({ where: { id: input.sourceId } });
    const existing = await tx.taxIntegrationEvent.findUnique({ where: { idempotencyKey } });
    const payload = { sourceId: input.sourceId, amount: amountValue.toFixed(2), competence: input.competence.toISOString() };
    const previousPayload = jsonObject(existing?.payload);
    if (existing && (previousPayload.amount !== payload.amount || (previousPayload.competence && previousPayload.competence !== payload.competence))) throw new TaxError("Referência contábil já registrada com outros dados.");
    const originPayload = jsonObject(origin?.payload);
    if (origin && (originPayload.amount !== payload.amount || originPayload.occurredAt !== payload.competence)) throw new TaxError("Valor ou competência divergem do retorno arrecadador.");
    const payment = input.sourceType === "ARRECADACAO" && origin?.integrationCode === "BANK_RETURN" && origin.status === "PROCESSADO"
      ? await tx.taxPayment.findUnique({ where: { idempotencyKey: origin.idempotencyKey } }) : null;
    const link = payment ? await tx.taxRevenueIntegrationEvent.findUnique({ where: { taxPaymentId: payment.id }, include: { revenue: true } }) : null;
    if (link?.revenue.budgetUnitId && actor.allowedBudgetUnitIds && !actor.allowedBudgetUnitIds.includes(link.revenue.budgetUnitId)) throw new TaxError("Referência fora das unidades gestoras autorizadas.");
    const transaction = link?.revenue.idempotencyKey ? await tx.accountingTransaction.findUnique({ where: { idempotencyKey: `${link.revenue.idempotencyKey}:RECEITA_ARRECADADA` } }) : null;
    if (!transaction || transaction.status !== "POSTADO") {
      const result = { reason: "Arrecadação sem partida canônica confirmada; regularize a baixa no Financeiro." };
      return tx.taxIntegrationEvent.upsert({ where: { idempotencyKey }, create: { integrationCode: "ACCOUNTING", eventType: input.sourceType, idempotencyKey, status: "PENDENTE", evidenceLevel: "L1", payload, result }, update: { status: "PENDENTE", payload, result } });
    }
    if (existing?.status === "PROCESSADO" && jsonObject(existing.result).accountingTransactionId === transaction.id) return existing;
    const previousAccountingTransactionId = jsonObject(existing?.result).accountingTransactionId;
    const result = { accountingTransactionId: transaction.id, revenueId: link!.revenueId, mode: "CANONICAL_REFERENCE", ...(typeof previousAccountingTransactionId === "string" && previousAccountingTransactionId !== transaction.id ? { previousAccountingTransactionId } : {}) };
    const integration = await tx.taxIntegrationEvent.upsert({ where: { idempotencyKey }, create: { integrationCode: "ACCOUNTING", eventType: input.sourceType, idempotencyKey, status: "PROCESSADO", evidenceLevel: "L1", payload, result, processedAt: new Date() }, update: { status: "PROCESSADO", payload, result, processedAt: new Date() } });
    await audit(tx, actor, "REFERENCE_ACCOUNTING", "AccountingTransaction", transaction.id, { sourceType: input.sourceType, sourceId: input.sourceId, amount: amountValue.toFixed(2), mode: "CANONICAL_REFERENCE" });
    return integration;
  });
}

export async function getAssessmentAccount(db: Db, assessmentId: string) {
  const assessment = await db.taxAssessment.findUnique({ where: { id: assessmentId }, include: { tax: true, taxpayer: { include: { person: true, company: true } }, guides: { include: { payments: { where: { status: "Confirmado" } } } } } });
  if (!assessment) throw new TaxError("Lançamento não encontrado.");
  const events = await db.taxRegistryEntry.findMany({ where: { entityType: "TAX_ASSESSMENT", entityId: assessment.id, OR: [{ category: "CREDIT_EVENT" }, { category: "CREDIT_MOVEMENT", status: "EFETIVADO" }] }, orderBy: { createdAt: "asc" } });
  const extinct = events.filter((event) => event.status === "ATIVO" && jsonObject(event.data).reducesAssessmentValue !== true && ["EXTINCAO_NAO_FINANCEIRA", "COMPENSACAO"].includes(String(jsonObject(event.data).eventType))).map((event) => String(jsonObject(event.data).amount ?? 0));
  extinct.push((await taxAssessmentCompensatedValue(db, assessment.id)).toFixed(2));
  const payments = assessment.guides.flatMap((guide) => guide.payments).map((payment) => ({ idempotencyKey: payment.idempotencyKey ?? payment.id, amount: payment.amountPaidDecimal ?? 0 }));
  const total = assessment.finalValueDecimal ?? assessment.originalValueDecimal ?? new Prisma.Decimal(assessment.originalValue);
  const position = calculateAccountBalance({ constituted: total, payments, nonFinancialExtinctions: extinct });
  return { assessment, events, position };
}
