"use server";

import { TaxError, configureTaxFinancialMapping, configureTaxParameter, configureTaxServiceActivity, createTaxAssessment, createTaxServiceRequest, enrollAssessmentInActiveDebt, evaluateTaxCertificateSituation, generateTaxGuide, recordIssDeclaration } from "@/lib/tributacao";
import { executeTaxRefund } from "@/lib/tributacao/credit-finance";
import { reverseTaxCreditMovement } from "@/lib/tributacao/credit-reversal";
import { grantBenefit } from "@/lib/tributacao/s8-service";
import { configureTaxAccountingProfile, configureTaxDebtAccountingProfile } from "@/lib/tributacao/accounting-profile";
import { FinanceError } from "@/lib/financeiro";
import { evaluateFiscalRule } from "@/lib/tributacao/fiscal-engine";
import {
  approveRefundRequest,
  closeReconciliation,
  configureCollectionAgreement,
  createParametrizedAssessment,
  createPixCharge,
  createReconciliation,
  generateGroupedTaxGuides,
  generatePartialTaxGuide,
  processCollectionReturn,
  registerCreditEvent,
  resolveReconciliation,
  reviseTaxAssessment,
  sendAccountingReference,
  simulateParametrizedAssessment,
  applyTaxCredit,
} from "@/lib/tributacao/s2-service";
import { getTenantContextForModule, getTenantContextForModuleOperation, isSystemAdministrator, type AppContext } from "@/lib/platform/tenant-context";
import { revalidatePath } from "next/cache";

type ActionResult = { error?: string };
export async function saveTaxDebtAccountingProfileAction(data: { taxId: string; budgetUnitId: string; catalogVersionId: string; originalReceivableAccountId: string; debtReceivableAccountId: string; lossAccountId: string; effectiveFrom: string; effectiveUntil: string; reason: string; idempotencyKey: string; supersedesEntryId?: string }): Promise<ActionResult> {
  try {
    const context = await getTenantContextForModuleOperation("TRIBUTACAO", "update");
    const effectiveFrom = new Date(`${data.effectiveFrom}T00:00:00.000Z`);
    const effectiveUntil = new Date(`${data.effectiveUntil}T23:59:59.999Z`);
    if (![data.effectiveFrom, data.effectiveUntil].every(value => /^\d{4}-\d{2}-\d{2}$/.test(value)) || !Number.isFinite(effectiveFrom.getTime()) || !Number.isFinite(effectiveUntil.getTime()) || effectiveFrom.toISOString().slice(0, 10) !== data.effectiveFrom || effectiveUntil.toISOString().slice(0, 10) !== data.effectiveUntil) return { error: "Informe datas de vigência válidas." };
    await configureTaxDebtAccountingProfile(context.prisma, taxActor(context), { ...data, effectiveFrom, effectiveUntil });
    revalidatePath("/tributacao/motor-fiscal"); revalidatePath("/tributacao/divida-ativa");
    return {};
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível registrar o perfil DA." }; }
}
export async function saveTaxAccountingProfileAction(data: { taxId: string; budgetUnitId: string; catalogVersionId: string; receivableAccountId: string; revenueAccountId: string; deductionAccountId: string; lossAccountId: string; effectiveFrom: string; effectiveUntil: string; reason: string; idempotencyKey: string; supersedesEntryId?: string }): Promise<ActionResult> {
  try {
    const context = await getTenantContextForModuleOperation("TRIBUTACAO", "update");
    const effectiveFrom = new Date(`${data.effectiveFrom}T00:00:00.000Z`);
    const effectiveUntil = new Date(`${data.effectiveUntil}T23:59:59.999Z`);
    if (![data.effectiveFrom, data.effectiveUntil].every(value => /^\d{4}-\d{2}-\d{2}$/.test(value)) || !Number.isFinite(effectiveFrom.getTime()) || !Number.isFinite(effectiveUntil.getTime()) || effectiveFrom.toISOString().slice(0, 10) !== data.effectiveFrom || effectiveUntil.toISOString().slice(0, 10) !== data.effectiveUntil) return { error: "Informe datas de vigência válidas." };
    await configureTaxAccountingProfile(context.prisma, taxActor(context), { ...data, effectiveFrom, effectiveUntil });
    revalidatePath("/tributacao/motor-fiscal");
    return {};
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível registrar o perfil contábil." }; }
}
const taxActor = (context: AppContext) => ({ usuarioId: context.user.id, employeeId: context.user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds });
const message = (error: unknown) => error instanceof TaxError || error instanceof FinanceError ? error.message : "Nao foi possivel concluir a operacao tributaria interna.";

export async function grantAssessmentBenefitAction(data: { assessmentId: string; ruleId: string; originalAmount: number; reason: string; documentId?: string }): Promise<ActionResult> {
  try {
    const context = await getTenantContextForModuleOperation("TRIBUTACAO", "update");
    const assessment = await context.prisma.taxAssessment.findUniqueOrThrow({ where: { id: data.assessmentId }, select: { taxpayerId: true } });
    await grantBenefit(context.prisma, taxActor(context), { ...data, sourceType: "TAX_ASSESSMENT", sourceId: data.assessmentId, taxpayerId: assessment.taxpayerId });
    revalidatePath("/tributacao/motor-fiscal");
    revalidatePath("/tributacao/cobranca");
    revalidatePath("/planejamento");
    return {};
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível conceder o benefício." }; }
}

export async function reverseCreditMovementAction(data: { movementId: string; date: string; reason: string; idempotencyKey: string; proofDocumentId?: string }): Promise<ActionResult> {
  try {
    const context = await getTenantContextForModuleOperation("TRIBUTACAO", "update");
    const date = new Date(`${data.date}T12:00:00.000Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== data.date || data.reason.trim().length < 10) return { error: "Informe data válida e fundamento com ao menos dez caracteres." };
    await reverseTaxCreditMovement(context.prisma, taxActor(context), { ...data, date });
    revalidatePath("/tributacao/motor-fiscal");
    revalidatePath("/tributacao/guias");
    revalidatePath("/financeiro/contabilidade");
    revalidatePath("/financeiro/contas-bancarias");
    return {};
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível reverter o movimento de crédito." }; }
}

export async function saveTaxParameter(data: { taxId: string; code: string; name: string; calculationType: string; configuration: string; effectiveFrom: string }): Promise<ActionResult> {
  try {
    const context = await getTenantContextForModuleOperation("TRIBUTACAO", "create");
    let configuration: object;
    try { configuration = JSON.parse(data.configuration); } catch { return { error: "A configuracao deve ser um JSON valido." }; }
    await configureTaxParameter(context.prisma, { usuarioId: context.user.id, employeeId: context.user.employeeId }, { ...data, configuration, effectiveFrom: new Date(data.effectiveFrom) });
    revalidatePath("/tributacao/operacoes");
    return {};
  } catch (error) { return { error: message(error) }; }
}

export async function saveTaxServiceRequest(data: { serviceType: string; taxpayerId: string; processId: string; documentId?: string; assessmentId?: string; notes?: string }): Promise<ActionResult> {
  try {
    const context = await getTenantContextForModuleOperation("TRIBUTACAO", "create");
    await createTaxServiceRequest(context.prisma, taxActor(context), data);
    revalidatePath("/tributacao/operacoes");
    return {};
  } catch (error) { return { error: message(error) }; }
}

export async function saveServiceActivity(data: { taxId: string; code: string; name: string; issRate: number }): Promise<ActionResult> {
  try {
    const readContext = await getTenantContextForModule("TRIBUTACAO");
    const existingActivity = await readContext.prisma.taxServiceActivity.findUnique({
      where: { taxId_code: { taxId: data.taxId, code: data.code.trim() } },
      select: { id: true },
    });
    const context = await getTenantContextForModuleOperation("TRIBUTACAO", existingActivity ? "update" : "create");
    await configureTaxServiceActivity(context.prisma, { usuarioId: context.user.id, employeeId: context.user.employeeId }, data);
    revalidatePath("/tributacao/operacoes");
    return {};
  } catch (error) { return { error: message(error) }; }
}

export async function saveIssDeclaration(data: { taxpayerId: string; activityId: string; competence: string; serviceValue: number; deductionValue: number }): Promise<ActionResult> {
  try {
    const context = await getTenantContextForModuleOperation("TRIBUTACAO", "create");
    await recordIssDeclaration(context.prisma, taxActor(context), { ...data, competence: new Date(data.competence) });
    revalidatePath("/tributacao/operacoes");
    return {};
  } catch (error) { return { error: message(error) }; }
}

export async function createAssessmentGuideAction(data: { year: number; taxId: string; taxpayerId: string; taxableBase: number; rate: number; dueDate: string }): Promise<ActionResult> {
  try {
    const context = await getTenantContextForModuleOperation("TRIBUTACAO", "create");
    const assessment = await createTaxAssessment(context.prisma, taxActor(context), data);
    await generateTaxGuide(context.prisma, taxActor(context), { assessmentId: assessment.id, dueDate: new Date(`${data.dueDate}T12:00:00.000Z`) });
    revalidatePath("/tributacao/operacoes");
    revalidatePath("/tributacao/guias");
    revalidatePath("/tributacao");
    return {};
  } catch (error) { return { error: message(error) }; }
}

export async function enrollAssessment(assessmentId: string): Promise<ActionResult> {
  try {
    const context = await getTenantContextForModuleOperation("TRIBUTACAO", "create");
    await enrollAssessmentInActiveDebt(context.prisma, taxActor(context), assessmentId);
    revalidatePath("/tributacao/operacoes");
    return {};
  } catch (error) { return { error: message(error) }; }
}

export async function evaluateCertificate(taxpayerId: string): Promise<ActionResult> {
  try {
    const context = await getTenantContextForModuleOperation("TRIBUTACAO", "create");
    await evaluateTaxCertificateSituation(context.prisma, { usuarioId: context.user.id, employeeId: context.user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds }, taxpayerId);
    revalidatePath("/tributacao/operacoes");
    return {};
  } catch (error) { return { error: message(error) }; }
}

function refreshS2() {
  revalidatePath("/tributacao/operacoes");
  revalidatePath("/tributacao/guias");
  revalidatePath("/tributacao");
}

export async function saveFiscalRuleAction(data: {
  taxId: string; code: string; name: string; formula: "PERCENTUAL_BASE" | "VALOR_FIXO" | "UNIDADE_FISCAL";
  effectiveFrom: string; effectiveUntil?: string; rate?: number; fixedValue?: number; fiscalUnitValue?: number; fiscalUnits?: number;
  indexFactor?: number; minimumValue?: number; minimumInstallmentValue?: number; calendar?: string[]; installments?: number; dueDay?: number; reference?: string; legalBasis?: string;
  paymentOptions?: import("@/lib/tributacao/fiscal-payment-option-schema").FiscalPaymentOption[];
}): Promise<ActionResult> {
  try {
    const context = await getTenantContextForModuleOperation("TRIBUTACAO", "create");
    const configuration = { formula: data.formula, rate: data.rate, fixedValue: data.fixedValue, fiscalUnitValue: data.fiscalUnitValue, fiscalUnits: data.fiscalUnits, indexFactor: data.indexFactor ?? 1, minimumValue: data.minimumValue ?? 0, minimumInstallmentValue: data.minimumInstallmentValue ?? 0, calendar: data.calendar ?? [], installments: data.installments ?? 1, dueDay: data.dueDay, reference: data.reference || "", legalBasis: data.legalBasis || "", version: 1, status: "ATIVA" };
    const options = data.paymentOptions ?? [];
    if (options.some(option => option.dueDate < data.effectiveFrom || data.effectiveUntil && option.dueDate > data.effectiveUntil)) throw new Error("As opções de pagamento devem pertencer à vigência da regra anual.");
    evaluateFiscalRule({ taxableBase: "0", configuration: { ...configuration, paymentOptions: options } });
    await configureTaxParameter(context.prisma, taxActor(context), {
      taxId: data.taxId, code: data.code, name: data.name, calculationType: data.formula,
      effectiveFrom: new Date(`${data.effectiveFrom}T12:00:00.000Z`), effectiveUntil: data.effectiveUntil ? new Date(`${data.effectiveUntil}T12:00:00.000Z`) : undefined,
      configuration: { ...configuration, paymentOptions: options },
    });
    refreshS2(); return {};
  } catch (error) { return { error: message(error) }; }
}

export async function simulateFiscalAction(data: { taxId: string; parameterId?: string; taxableBase: number; effectiveAt: string }) {
  try {
    const context = await getTenantContextForModule("TRIBUTACAO");
    const result = await simulateParametrizedAssessment(context.prisma, { ...data, effectiveAt: new Date(`${data.effectiveAt}T12:00:00.000Z`) });
    return { data: { principal: result.calculation.principal.toFixed(2), memory: result.calculation.memory, schedule: result.calculation.schedule.map((item) => ({ number: item.number, amount: item.amount.toFixed(2), dueDate: item.dueDate })), parameterId: result.parameter.id } };
  } catch (error) { return { error: message(error) }; }
}

export async function launchFiscalAction(data: { taxId: string; parameterId?: string; taxpayerId: string; taxableBase: number; competence: string; realEstateId?: string; economicRegistrationId?: string; originKey: string }) {
  try {
    const context = await getTenantContextForModuleOperation("TRIBUTACAO", "create");
    const assessment = await createParametrizedAssessment(context.prisma, taxActor(context), { ...data, competence: new Date(`${data.competence}T12:00:00.000Z`) });
    refreshS2(); return { data: { id: assessment.id, number: assessment.assessmentNumber } };
  } catch (error) { return { error: message(error) }; }
}

export async function reviseAssessmentAction(data: { assessmentId: string; taxableBase?: number; imposedValue?: number; reason: string; processId?: string; documentId?: string; idempotencyKey: string }): Promise<ActionResult> {
  try { const context = await getTenantContextForModuleOperation("TRIBUTACAO", "update"); await reviseTaxAssessment(context.prisma, taxActor(context), data); refreshS2(); return {}; } catch (error) { return { error: message(error) }; }
}

export async function registerCreditEventAction(data: { assessmentId: string; eventType: "IMPUGNACAO" | "DECISAO" | "SUSPENSAO" | "EXTINCAO_NAO_FINANCEIRA" | "COMPENSACAO"; amount?: number; reason: string; processId?: string; documentId?: string; idempotencyKey: string }): Promise<ActionResult> {
  try { const context = await getTenantContextForModuleOperation("TRIBUTACAO", "update"); await registerCreditEvent(context.prisma, taxActor(context), data); refreshS2(); return {}; } catch (error) { return { error: message(error) }; }
}

export async function issuePartialDamAction(data: { assessmentId: string; amount: number; dueDate: string }): Promise<ActionResult> {
  try { const context = await getTenantContextForModuleOperation("TRIBUTACAO", "create"); await generatePartialTaxGuide(context.prisma, taxActor(context), { ...data, dueDate: new Date(`${data.dueDate}T12:00:00.000Z`) }); refreshS2(); return {}; } catch (error) { return { error: message(error) }; }
}

export async function issueGroupedDamAction(data: { assessmentIds: string[]; dueDate: string }): Promise<ActionResult> {
  try { const context = await getTenantContextForModuleOperation("TRIBUTACAO", "create"); await generateGroupedTaxGuides(context.prisma, taxActor(context), { ...data, dueDate: new Date(`${data.dueDate}T12:00:00.000Z`) }); refreshS2(); return {}; } catch (error) { return { error: message(error) }; }
}

export async function createPixChargeAction(guideId: string): Promise<ActionResult> {
  try { const context = await getTenantContextForModuleOperation("TRIBUTACAO", "create"); await createPixCharge(context.prisma, taxActor(context), { guideId, idempotencyKey: guideId }); refreshS2(); return {}; } catch (error) { return { error: message(error) }; }
}

export async function processBankReturnAction(data: { idempotencyKey: string; guideNumber?: string; amount: number; occurredAt: string; status: "CONFIRMADO" | "INVALIDO" | "REJEITADO"; bankAccountId?: string; externalReference?: string }): Promise<ActionResult> {
  try {
    const context = await getTenantContextForModuleOperation("TRIBUTACAO", "create"); const actor = taxActor(context);
    const event = await processCollectionReturn(context.prisma, actor, { ...data, occurredAt: new Date(`${data.occurredAt}T12:00:00.000Z`) });
    if (event.status === "PROCESSADO") await sendAccountingReference(context.prisma, actor, { sourceType: "ARRECADACAO", sourceId: event.id, amount: data.amount, competence: new Date(`${data.occurredAt}T12:00:00.000Z`) });
    refreshS2(); return {};
  } catch (error) { return { error: message(error) }; }
}

export async function saveCollectionAgreementAction(data: { code: string; name: string; bankAccountId?: string; automaticRelease?: boolean; paymentUrl?: string }): Promise<ActionResult> {
  try { const context = await getTenantContextForModuleOperation("TRIBUTACAO", "create"); await configureCollectionAgreement(context.prisma, { usuarioId: context.user.id, employeeId: context.user.employeeId }, data); refreshS2(); return {}; } catch (error) { return { error: message(error) }; }
}

export async function saveTaxFinancialMappingAction(data: { taxId: string; revenueNatureId: string; resourceSourceId: string; defaultBankAccountId: string }): Promise<ActionResult> {
  try { const context = await getTenantContextForModuleOperation("TRIBUTACAO", "update"); await configureTaxFinancialMapping(context.prisma, taxActor(context), data); refreshS2(); return {}; } catch (error) { return { error: message(error) }; }
}

export async function applyTaxCreditAction(data: { creditId: string; operation: "COMPENSAR" | "TRANSFERIR" | "RESTITUIR"; amount: number; assessmentId?: string; destinationTaxpayerId?: string; reason: string; idempotencyKey: string; authorizationDocumentId?: string }): Promise<ActionResult> {
  try { const context = await getTenantContextForModuleOperation("TRIBUTACAO", "update"); await applyTaxCredit(context.prisma, taxActor(context), data); refreshS2(); return {}; } catch (error) { return { error: message(error) }; }
}

export async function decideRefundAction(data: { requestId: string; approved: boolean; reason: string }): Promise<ActionResult> {
  try { const context = await getTenantContextForModuleOperation("TRIBUTACAO", "update"); await approveRefundRequest(context.prisma, taxActor(context), data); refreshS2(); return {}; } catch (error) { return { error: message(error) }; }
}

export async function executeRefundAction(data: { requestId: string; date: string; bankAccountId: string; proofDocumentId: string; idempotencyKey: string }): Promise<ActionResult> {
  try {
    const context = await getTenantContextForModuleOperation("TRIBUTACAO", "update");
    await getTenantContextForModuleOperation("FINANCEIRO", "create");
    await executeTaxRefund(context.prisma, taxActor(context), { ...data, date: new Date(`${data.date}T12:00:00.000Z`) });
    refreshS2(); revalidatePath("/financeiro/contas-bancarias"); return {};
  } catch (error) { return { error: message(error) }; }
}

export async function createReconciliationAction(data: { agreementId: string; date: string; paymentTotal: number; remittanceTotal: number; reason?: string }): Promise<ActionResult> {
  try { const context = await getTenantContextForModuleOperation("TRIBUTACAO", "create"); await createReconciliation(context.prisma, { usuarioId: context.user.id, employeeId: context.user.employeeId }, { ...data, date: new Date(`${data.date}T12:00:00.000Z`) }); refreshS2(); return {}; } catch (error) { return { error: message(error) }; }
}

export async function resolveReconciliationAction(data: { id: string; adjustment: number; reason: string }): Promise<ActionResult> {
  try { const context = await getTenantContextForModuleOperation("TRIBUTACAO", "update"); await resolveReconciliation(context.prisma, { usuarioId: context.user.id, employeeId: context.user.employeeId }, data); refreshS2(); return {}; } catch (error) { return { error: message(error) }; }
}

export async function closeReconciliationAction(id: string): Promise<ActionResult> {
  try { const context = await getTenantContextForModuleOperation("TRIBUTACAO", "update"); await closeReconciliation(context.prisma, { usuarioId: context.user.id, employeeId: context.user.employeeId }, id); refreshS2(); return {}; } catch (error) { return { error: message(error) }; }
}
