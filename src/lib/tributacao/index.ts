import { and, eq, ne, notInArray, sql } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import { JsonNull, type JsonValue } from "@/db/json";
import { databaseTimestamp } from "@/db/temporal";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseExecutor, type DatabaseTransaction } from "@/db/transaction";
import { createId } from "@/db/ids";
import { taxAssessments, taxGuides, taxes, economicRegistrations } from "@/db/schema/taxation-core";
import { taxActiveDebts, taxDebtInstallments, taxFinancialMappings, taxPayments } from "@/db/schema/tax-accounting";
import { documents, taxpayers, realEstates } from "@/db/schema/registry";
import { reconciliationBankAccounts } from "@/db/schema/finance-reconciliation";
import { planningRevenueNatures, planningResourceSources } from "@/db/schema/planning-legal";
import { planningEntityUnits } from "@/db/schema/planning-catalog";
import { taxRevenueIntegrations } from "@/db/schema/finance-revenues";
import { taxRegistryEntries, taxLicenses } from "@/db/schema/taxation-registry";
import { catalogParameters, catalogServiceRequests } from "@/db/schema/tax-catalog-rules";
import { inspectionActivities, inspectionDeclarations } from "@/db/schema/tax-inspection-operations";
import { itbiDeclarations } from "@/db/schema/tax-itbi";
import { processes } from "@/db/schema/processes";
import { findTaxFinancialMapping, lockTaxAccountingRow, readConfirmedTaxAssessmentPayments, readTaxActiveDebt, readTaxAssessment, readTaxDefinition, readTaxGuide, requiredTaxRecord } from "@/db/repositories/tax-accounting/records";
import { catalogJson, nextCatalogNumber, writeCatalogAudit } from "@/db/repositories/tax-catalog-rules/records";
import { transferPaidItbiInTransaction } from "./itbi-ownership";
import { FinanceError, recordConfirmedRevenue, type FinanceActor } from "@/lib/financeiro";
import { resolveTaxAssessmentScope, resolveTaxFinancialYear, taxScopeSnapshot, taxAssessmentCompensatedValue } from "./scope";
import { recognizeTaxAssessmentInTransaction } from "./accrual-accounting";
import { readMunicipalServiceRelationships } from "@/lib/planejamento/activity-relations";
import { evaluateCertificateInTransaction } from "./certificate-subjects";
import { assertPropertyOutsideAssessedSimulation } from "./property-assessment-coverage";
import { applyConditionalGuideDiscount } from "./conditional-discounts";
import { fiscalPaymentOptionsSchema } from "./fiscal-payment-option-schema";
import { calculateTaxAssessment, TaxError } from "./assessment-engine";
export { calculateTaxAssessment, TaxError } from "./assessment-engine";

type Db = DatabaseExecutor;

export type TaxActor = FinanceActor;


function amount(value: Decimal | string | number, allowZero = false) {
  const decimal = new Decimal(String(value)).toDecimalPlaces(2);
  if (!decimal.isFinite() || (allowZero ? decimal.lessThan(0) : decimal.lessThanOrEqualTo(0))) {
    throw new TaxError(allowZero ? "Informe um valor monetário válido." : "Informe um valor monetário maior que zero.");
  }
  return decimal;
}

function legacyAmount(value: Decimal) {
  return Number(value.toString());
}

function requiredAmount(value: Decimal | null, field: string) {
  if (!value) throw new TaxError(`O campo Decimal ${field} ainda não foi conciliado. Execute o backfill financeiro antes de continuar.`);
  return value;
}

async function audit(tx: DatabaseTransaction, actor: TaxActor, action: string, entityType: string, entityId: string, payload: JsonValue) {
  await writeCatalogAudit(tx, actor, action, entityType, entityId, payload);
}

async function assertAssessmentYearOpen(tx: Db, year: number, budgetUnitId?: string | null) {
  try {
    const binding = budgetUnitId ? (await tx.select({ governmentEntityId: planningEntityUnits.governmentEntityId }).from(planningEntityUnits).where(eq(planningEntityUnits.budgetUnitId, budgetUnitId)).limit(1))[0] : null;
    if (budgetUnitId && !binding) throw new TaxError("Unidade gestora arrecadadora sem entidade vinculada.");
    return await resolveTaxFinancialYear(tx, year, { governmentEntityId: binding?.governmentEntityId ?? null });
  } catch (error) { throw new TaxError(error instanceof Error ? error.message : "Escopo tributário inválido."); }
}

async function assessmentYearScope(tx: Db, actor: TaxActor, year: number, taxId: string, snapshot?: JsonValue | null) {
  try {
    const scope = await resolveTaxAssessmentScope(tx, actor, taxId, snapshot);
    const financialYear = await resolveTaxFinancialYear(tx, year, scope);
    return { financialYear, ...scope };
  } catch (error) { throw new TaxError(error instanceof Error ? error.message : "Escopo tributário inválido."); }
}

async function nextNumber(tx: DatabaseTransaction, year: number, documentType: "ASSESSMENT" | "GUIDE") {
  const currentValue = await nextCatalogNumber(tx, year, documentType);
  return `${documentType === "GUIDE" ? "DAM" : "LAN"}-${year}-${String(currentValue).padStart(7, "0")}`;
}


export async function configureTaxFinancialMapping(
  db: DatabaseConnection,
  actor: TaxActor,
  input: { taxId: string; revenueNatureId: string; resourceSourceId: string; defaultBankAccountId: string; isActive?: boolean },
) {
  return withDatabaseTransaction(db, async (tx) => {
    const [tax, nature, source, account] = await Promise.all([
      tx.select().from(taxes).where(eq(taxes.id, input.taxId)).limit(1).then(rows => rows[0]),
      tx.select().from(planningRevenueNatures).where(eq(planningRevenueNatures.id, input.revenueNatureId)).limit(1).then(rows => rows[0]),
      tx.select().from(planningResourceSources).where(eq(planningResourceSources.id, input.resourceSourceId)).limit(1).then(rows => rows[0]),
      tx.select().from(reconciliationBankAccounts).where(eq(reconciliationBankAccounts.id, input.defaultBankAccountId)).limit(1).then(rows => rows[0]),
    ]);
    if (!tax || !nature || !source || !account?.isActive) throw new TaxError("Tributo, natureza, fonte e conta bancária ativa são obrigatórios para o mapeamento.");
    if (actor.allowedBudgetUnitIds && (!account.budgetUnitId || !actor.allowedBudgetUnitIds.includes(account.budgetUnitId))) throw new TaxError("Conta do mapeamento fora das unidades gestoras autorizadas.");
    const previous = await findTaxFinancialMapping(tx, input.taxId);
    if (previous && actor.allowedBudgetUnitIds && (!previous.defaultBankAccount.budgetUnitId || !actor.allowedBudgetUnitIds.includes(previous.defaultBankAccount.budgetUnitId))) throw new TaxError("Mapeamento existente fora das unidades gestoras autorizadas.");
    const mapping = requiredTaxRecord((await tx.insert(taxFinancialMappings).values({ ...input, isActive: input.isActive ?? true }).onConflictDoUpdate({ target: taxFinancialMappings.taxId, set: { revenueNatureId: input.revenueNatureId, resourceSourceId: input.resourceSourceId, defaultBankAccountId: input.defaultBankAccountId, isActive: input.isActive ?? true, updatedAt: new Date() } }).returning())[0], "Mapeamento");
    await audit(tx, actor, "UPSERT", "TaxFinancialMapping", mapping.id, { taxId: input.taxId, revenueNatureId: input.revenueNatureId, resourceSourceId: input.resourceSourceId, defaultBankAccountId: input.defaultBankAccountId });
    return mapping;
  });
}

export async function createTaxAssessment(
  db: DatabaseConnection,
  actor: TaxActor,
  input: { year: number; taxId: string; taxpayerId: string; taxableBase: Decimal | string | number; rate: Decimal | string | number; discount?: Decimal | string | number; interest?: Decimal | string | number; penalty?: Decimal | string | number; correction?: Decimal | string | number; competence?: Date; realEstateId?: string; economicRegistrationId?: string },
) {
  return withDatabaseTransaction(db, tx => createTaxAssessmentInTransaction(tx, actor, input));
}

export async function createTaxAssessmentInTransaction(
  tx: DatabaseTransaction,
  actor: TaxActor,
  input: { year: number; taxId: string; taxpayerId: string; taxableBase: Decimal | string | number; rate: Decimal | string | number; discount?: Decimal | string | number; interest?: Decimal | string | number; penalty?: Decimal | string | number; correction?: Decimal | string | number; competence?: Date; realEstateId?: string; economicRegistrationId?: string },
  options?: { legacyDebtOriginId: string },
) {
  const calculation = calculateTaxAssessment(input);
    const legacyDebt = options ? await readTaxActiveDebt(tx, options.legacyDebtOriginId) : null;
    if (legacyDebt && (legacyDebt.assessmentId || !legacyDebt.budgetUnitId || !legacyDebt.governmentEntityId || legacyDebt.year !== input.year || legacyDebt.taxpayerId !== input.taxpayerId || !legacyDebt.updatedValueDecimal?.eq(calculation.finalValue) || input.realEstateId || input.economicRegistrationId)) throw new TaxError("Regularização da origem histórica diverge da dívida municipal preservada.");
    const scope = legacyDebt
      ? await (async () => {
        const origin = await resolveTaxAssessmentScope(tx, actor, input.taxId, { budgetUnitId: legacyDebt.budgetUnitId, governmentEntityId: legacyDebt.governmentEntityId });
        const financialYear = await resolveTaxFinancialYear(tx, new Date().getUTCFullYear(), origin);
        return { ...origin, financialYear };
      })()
      : await assessmentYearScope(tx, actor, input.year, input.taxId);
    const [tax, taxpayer] = await Promise.all([
      tx.select().from(taxes).where(eq(taxes.id, input.taxId)).limit(1).then(rows => rows[0]),
      tx.select().from(taxpayers).where(eq(taxpayers.id, input.taxpayerId)).limit(1).then(rows => rows[0]),
    ]);
    if (!tax?.isActive || taxpayer?.status !== "Ativo") throw new TaxError("Tributo ativo e contribuinte ativo são obrigatórios para o lançamento.");
    if (legacyDebt && (tax.name !== legacyDebt.originDebtType || !["INSCRITA", "Inscrita", "EM_COBRANCA", "EM_PROTESTO", "AJUIZADA"].includes(legacyDebt.status))) throw new TaxError("Origem histórica exige tributo conciliado e dívida disponível para cobrança.");
    if (input.realEstateId) {
      const property = (await tx.select().from(realEstates).where(eq(realEstates.id, input.realEstateId)).limit(1))[0];
      if (!property || property.taxpayerId !== input.taxpayerId) throw new TaxError("O imóvel deve pertencer ao contribuinte do lançamento.");
      await assertPropertyOutsideAssessedSimulation(tx,{realEstateId:input.realEstateId,taxId:input.taxId,year:input.year});
    }
    if (input.economicRegistrationId) {
      const registration = (await tx.select().from(economicRegistrations).where(eq(economicRegistrations.id, input.economicRegistrationId)).limit(1))[0];
      if (!registration || registration.taxpayerId !== input.taxpayerId || registration.status !== "Ativo") throw new TaxError("A inscrição econômica deve estar ativa e pertencer ao contribuinte.");
    }
    const assessmentNumber = await nextNumber(tx, input.year, "ASSESSMENT");
    const [assessment] = await tx.insert(taxAssessments).values({
         status: "Lançado",
        year: input.year,
        assessmentNumber,
        competence: input.competence,
        originalValue: legacyAmount(calculation.principal),
        originalValueDecimal: calculation.principal,
        taxableBaseDecimal: calculation.taxableBase,
        rate: calculation.rate,
        discountValueDecimal: calculation.discount,
        interestValueDecimal: calculation.interest,
        penaltyValueDecimal: calculation.penalty,
        correctionValueDecimal: calculation.correction,
        finalValueDecimal: calculation.finalValue,
        calculationSnapshot: { taxableBase: calculation.taxableBase.toFixed(2), rate: calculation.rate.toString(), discount: calculation.discount.toFixed(2), interest: calculation.interest.toFixed(2), penalty: calculation.penalty.toFixed(2), correction: calculation.correction.toFixed(2), finalValue: calculation.finalValue.toFixed(2), budgetUnitId: scope.budgetUnitId, governmentEntityId: scope.financialYear.governmentEntityId, financialYearId: scope.financialYear.id, ...(legacyDebt ? { legacyOriginDebtId: legacyDebt.id, originalFiscalYear: legacyDebt.year, recognitionPolicy: "PRESERVE_LEGACY_NO_RETROACTIVE_RECOGNITION" } : {}) },
        taxId: input.taxId,
        taxpayerId: input.taxpayerId,
        realEstateId: input.realEstateId,
        economicRegistrationId: input.economicRegistrationId,
    }).returning();
    if (!legacyDebt) await recognizeTaxAssessmentInTransaction(tx, actor, assessment.id);
    await audit(tx, actor, "CREATE", "TaxAssessment", assessment.id, { assessmentNumber, finalValue: calculation.finalValue.toFixed(2), legacyOriginDebtId: legacyDebt?.id ?? null });
    return assessment;
}

export async function generateTaxGuide(
  db: DatabaseConnection,
  actor: TaxActor,
  input: { assessmentId: string; dueDate: Date; documentId?: string },
) {
  return withDatabaseTransaction(db, tx => generateTaxGuideInTransaction(tx, actor, input));
}

export async function generateTaxGuideInTransaction(tx: DatabaseTransaction, actor: TaxActor, input: { assessmentId: string; dueDate: Date; documentId?: string }) {
    await lockTaxAccountingRow(tx, "TaxAssessment", input.assessmentId);
    const assessment = (await tx.select().from(taxAssessments).where(eq(taxAssessments.id, input.assessmentId)).limit(1))[0];
    if (!assessment || ["Cancelado", "Pago", "Extinto", "Suspenso"].includes(assessment.status)) throw new TaxError("O lançamento tributário não está disponível para geração de guia.");
    if ((await tx.select({ id: itbiDeclarations.id }).from(itbiDeclarations).where(and(eq(itbiDeclarations.assessmentId, assessment.id), eq(itbiDeclarations.status, "IMPUGNADA"))).limit(1)).length) throw new TaxError("ITBI com impugnação pendente não permite nova guia.");
    const snapshot = taxScopeSnapshot(assessment.calculationSnapshot);
    const enrolledDebt = (await tx.select().from(taxActiveDebts).where(eq(taxActiveDebts.assessmentId, assessment.id)).limit(1))[0];
    if (enrolledDebt || typeof snapshot.legacyOriginDebtId === "string") {
      const debt = enrolledDebt ?? await readTaxActiveDebt(tx, String(snapshot.legacyOriginDebtId));
      const origin = await resolveTaxAssessmentScope(tx, actor, assessment.taxId, assessment.calculationSnapshot);
      if (debt.assessmentId !== assessment.id || debt.year !== assessment.year || (debt.budgetUnitId && debt.budgetUnitId !== origin.budgetUnitId) || (debt.governmentEntityId && debt.governmentEntityId !== origin.governmentEntityId) || (typeof snapshot.legacyOriginDebtId === "string" && debt.id !== snapshot.legacyOriginDebtId)) throw new TaxError("Origem histórica da guia diverge da dívida municipal.");
      await resolveTaxFinancialYear(tx, new Date().getUTCFullYear(), origin);
      if (input.dueDate.getUTCFullYear() !== new Date().getUTCFullYear()) throw new TaxError("Nova DAM de dívida ativa exige vencimento no exercício corrente.");
    } else {
      await assessmentYearScope(tx, actor, assessment.year, assessment.taxId, assessment.calculationSnapshot);
      if (input.dueDate.getFullYear() !== assessment.year) throw new TaxError("O vencimento da guia deve pertencer ao exercício do lançamento.");
    }
    if ((await tx.select({ id: taxGuides.id }).from(taxGuides).where(and(eq(taxGuides.assessmentId, assessment.id), ne(taxGuides.status, "Cancelada"))).limit(1)).length) throw new TaxError("O lançamento já possui guia ativa. Cancele-a formalmente antes de emitir outra.");
    if (input.documentId) {
      const document = (await tx.select().from(documents).where(eq(documents.id, input.documentId)).limit(1))[0];
      if (document?.status !== "Válido") throw new TaxError("O documento GED da guia deve estar válido.");
    }
    const assessmentPayments = await readConfirmedTaxAssessmentPayments(tx, assessment.id);
    const paid = assessmentPayments.reduce((sum, payment) => sum.plus(requiredAmount(payment.amountPaidDecimal, "TaxPayment.amountPaidDecimal")), new Decimal(0));
    const total = (assessment.finalValueDecimal ?? requiredAmount(assessment.originalValueDecimal, "TaxAssessment.originalValueDecimal")).minus(await taxAssessmentCompensatedValue(tx, assessment.id)).minus(paid);
    if (total.lte(0)) throw new TaxError("Lançamento integralmente extinto por pagamento ou compensação.");
    const guideNumber = await nextNumber(tx, assessment.year, "GUIDE");
    const [guide] = await tx.insert(taxGuides).values({ assessmentId: assessment.id, guideNumber, totalValue: legacyAmount(total), totalValueDecimal: total, dueDate: input.dueDate, documentId: input.documentId, calculationSnapshot: assessment.calculationSnapshot ?? undefined, status: "Emitida" }).returning();
    await tx.update(taxAssessments).set({ status: "Emitido" }).where(eq(taxAssessments.id, assessment.id));
    await audit(tx, actor, "CREATE", "TaxGuide", guide.id, { guideNumber, assessmentId: assessment.id, totalValue: total.toFixed(2), documentId: input.documentId ?? null });
    return guide;
}

export async function confirmTaxPayment(
  db: DatabaseConnection,
  actor: TaxActor,
  input: { guideId: string; amountPaid: Decimal | string | number; paymentDate: Date; paymentMethod: string; idempotencyKey: string; bankAccountId?: string; proofDocumentId?: string },
) {
  return withDatabaseTransaction(db, (tx) => confirmTaxPaymentInTransaction(tx, actor, input));
}

export async function confirmTaxPaymentInTransaction(
  tx: DatabaseTransaction,
  actor: TaxActor,
  input: { guideId: string; amountPaid: Decimal | string | number; paymentDate: Date; paymentMethod: string; idempotencyKey: string; bankAccountId?: string; proofDocumentId?: string },
) {
  const paidAmount = amount(input.amountPaid);
  if (!input.idempotencyKey.trim()) throw new TaxError("A confirmação de pagamento exige chave de idempotência.");
    const guideOrigin = await readTaxGuide(tx, input.guideId);
    await lockTaxAccountingRow(tx, "TaxAssessment", guideOrigin.assessmentId);
    await lockTaxAccountingRow(tx, "TaxGuide", input.guideId);
    const previousPayment = (await tx.select().from(taxPayments).where(eq(taxPayments.idempotencyKey, input.idempotencyKey)).limit(1))[0];
    const existing = previousPayment ? { ...previousPayment, guide: await readTaxGuide(tx, previousPayment.guideId) } : null;
    if (existing) {
      try { await resolveTaxAssessmentScope(tx, actor, existing.guide.assessment.taxId, existing.guide.assessment.calculationSnapshot); }
      catch (error) { throw new TaxError(error instanceof Error ? error.message : "Escopo tributário inválido."); }
      if (existing.guideId !== input.guideId || !existing.amountPaidDecimal?.equals(paidAmount) || existing.paymentDate.getTime() !== input.paymentDate.getTime() || existing.paymentMethod !== input.paymentMethod.trim() || (input.bankAccountId && existing.bankAccountId !== input.bankAccountId) || existing.proofDocumentId !== (input.proofDocumentId ?? null)) throw new TaxError("Pagamento já registrado com outros dados.");
      return existing.guide;
    }
    const guide = await readTaxGuide(tx, input.guideId);
    if (!guide || ["Cancelada", "Paga"].includes(guide.status)) throw new TaxError("A guia não está disponível para baixa.");
    const mapping = await findTaxFinancialMapping(tx, guide.assessment.taxId);
    if (!mapping?.isActive) throw new TaxError("O tributo não possui mapeamento financeiro ativo.");
    const bankAccountId = input.bankAccountId ?? mapping.defaultBankAccountId;
    const account = (await tx.select().from(reconciliationBankAccounts).where(eq(reconciliationBankAccounts.id, bankAccountId)).limit(1))[0];
    if (!account?.isActive) throw new TaxError("A baixa exige uma conta bancária ativa.");
    try { await resolveTaxAssessmentScope(tx, actor, guide.assessment.taxId, guide.assessment.calculationSnapshot); }
    catch (error) { throw new TaxError(error instanceof Error ? error.message : "Escopo tributário inválido."); }
    const assessmentScope = taxScopeSnapshot(guide.assessment.calculationSnapshot);
    if (typeof assessmentScope.budgetUnitId === "string" && assessmentScope.budgetUnitId !== account.budgetUnitId) throw new TaxError("A conta arrecadadora diverge da unidade gestora do lançamento tributário.");
    const year = await assertAssessmentYearOpen(tx, input.paymentDate.getUTCFullYear(), account.budgetUnitId);
    if (input.paymentDate < year.startDate || input.paymentDate > year.endDate) throw new TaxError("A data de pagamento está fora do exercício financeiro de arrecadação.");
    if (input.proofDocumentId) {
      const proof = (await tx.select().from(documents).where(eq(documents.id, input.proofDocumentId)).limit(1))[0];
      if (proof?.status !== "Válido") throw new TaxError("O comprovante GED deve estar válido.");
    }
    const guidePayments = await tx.select().from(taxPayments).where(and(eq(taxPayments.guideId, guide.id), eq(taxPayments.status, "Confirmado")));
    const paidBefore = guidePayments.reduce((total, payment) => total.plus(requiredAmount(payment.amountPaidDecimal, "TaxPayment.amountPaidDecimal")), new Decimal(0));
    const total = requiredAmount(guide.totalValueDecimal, "TaxGuide.totalValueDecimal");
    if (paidBefore.plus(paidAmount).greaterThan(total)) throw new TaxError("O pagamento acumulado excede o valor da guia.");
    await applyConditionalGuideDiscount(tx, actor, { guideId: guide.id, amountPaid: paidAmount, paymentDate: input.paymentDate, paymentKey: input.idempotencyKey.trim() });
    const currentAssessment = await readTaxAssessment(tx, guide.assessmentId);
    const assessmentTotal = currentAssessment.finalValueDecimal ?? requiredAmount(currentAssessment.originalValueDecimal, "TaxAssessment.originalValueDecimal");
    const priorAssessmentPayments = await readConfirmedTaxAssessmentPayments(tx, guide.assessmentId);
    const priorAssessmentPaid = priorAssessmentPayments.reduce((sum, payment) => sum.plus(requiredAmount(payment.amountPaidDecimal, "TaxPayment.amountPaidDecimal")), new Decimal(0));
    const compensated = await taxAssessmentCompensatedValue(tx, guide.assessmentId);
    if (paidAmount.gt(Decimal.max(0, assessmentTotal.minus(priorAssessmentPaid).minus(compensated)))) throw new TaxError("O pagamento excede o saldo do lançamento conciliado entre todas as guias e compensações.");
    const [payment] = await tx.insert(taxPayments).values({ guideId: guide.id, amountPaid: legacyAmount(paidAmount), amountPaidDecimal: paidAmount, paymentDate: input.paymentDate, paymentMethod: input.paymentMethod.trim(), bankAccountId, proofDocumentId: input.proofDocumentId, idempotencyKey: input.idempotencyKey.trim(), sourceId: guide.id, status: "Confirmado" }).returning();
    const integrationKey = `TRIBUTARIO:TAX_PAYMENT:${payment.id}:REVENUE`;
    let revenue;
    try {
      revenue = await recordConfirmedRevenue(tx, actor, {
        date: input.paymentDate,
        value: paidAmount,
        revenueNatureId: mapping.revenueNatureId,
        resourceSourceId: mapping.resourceSourceId,
        bankAccountId,
        history: `Arrecadação tributária ${guide.guideNumber ?? guide.id}`,
        sourceModule: "TRIBUTARIO",
        sourceType: "TAX_PAYMENT",
        sourceId: payment.id,
        eventType: "TAX_PAYMENT_CONFIRMED",
        idempotencyKey: integrationKey,
      });
    } catch (error) {
      if (error instanceof FinanceError) throw new TaxError(error.message);
      throw error;
    }
    await tx.insert(taxRevenueIntegrations).values({ taxPaymentId: payment.id, revenueId: revenue.id, idempotencyKey: integrationKey });
    const paidAfter = paidBefore.plus(paidAmount);
    const guideStatus = paidAfter.equals(total) ? "Paga" : "Parcial";
    await tx.update(taxGuides).set({ status: guideStatus }).where(eq(taxGuides.id, guide.id));
    const assessmentPayments = await readConfirmedTaxAssessmentPayments(tx, guide.assessmentId);
    const assessmentPaidValue = assessmentPayments.reduce((sum, current) => sum.plus(requiredAmount(current.amountPaidDecimal, "TaxPayment.amountPaidDecimal")), new Decimal(0));
    const assessmentPaid = assessmentPaidValue.plus(compensated).greaterThanOrEqualTo(assessmentTotal);
    await tx.update(taxAssessments).set({ status: assessmentPaid ? "Pago" : "Parcial" }).where(eq(taxAssessments.id, guide.assessmentId));
    const debt = (await tx.select().from(taxActiveDebts).where(eq(taxActiveDebts.assessmentId, guide.assessmentId)).limit(1))[0];
    if (debt) {
      const remaining = Decimal.max(0, assessmentTotal.minus(assessmentPaidValue).minus(compensated));
      const collecting = ["Paga", "PAGA", "Inscrita", "INSCRITA", "EM_COBRANCA", "Parcelada", "PARCELADA", "EM_PROTESTO", "AJUIZADA"].includes(debt.status);
      await tx.update(taxActiveDebts).set({ updatedValue: Number(remaining), updatedValueDecimal: remaining, ...(collecting ? { status: remaining.isZero() ? "PAGA" : ["EM_PROTESTO", "AJUIZADA"].includes(debt.status) ? debt.status : "EM_COBRANCA" } : {}) }).where(eq(taxActiveDebts.id, debt.id));
    }
    if (!revenue.treasuryMovement) throw new TaxError("A integração financeira não gerou movimento de tesouraria.");
    await transferPaidItbiInTransaction(tx, actor, guide.assessmentId, payment.id, input.paymentDate);
    await audit(tx, actor, "CONFIRM_PAYMENT", "TaxPayment", payment.id, { guideId: guide.id, amountPaid: paidAmount.toFixed(2), revenueId: revenue.id, treasuryMovementId: revenue.treasuryMovement.id, proofDocumentId: input.proofDocumentId ?? null, activeDebtId: debt?.id ?? null, debtStatusBefore: debt?.status ?? null });
    return requiredTaxRecord((await tx.select().from(taxGuides).where(eq(taxGuides.id, guide.id)).limit(1))[0], "Guia");
}

export async function cancelTaxGuide(db: DatabaseConnection, actor: TaxActor, guideId: string) {
  return withDatabaseTransaction(db, async (tx) => {
    await lockTaxAccountingRow(tx, "TaxGuide", guideId);
    const guideRow = (await tx.select().from(taxGuides).where(eq(taxGuides.id, guideId)).limit(1))[0];
    if (!guideRow) throw new TaxError("Guia não encontrada.");
    const guide = { ...guideRow, assessment: await readTaxAssessment(tx, guideRow.assessmentId) };
    await assessmentYearScope(tx, actor, guide.assessment.year, guide.assessment.taxId, guide.assessment.calculationSnapshot);
    if (guide.status === "Cancelada") throw new TaxError("A guia já está cancelada.");
    if ((await tx.select({ id: taxPayments.id }).from(taxPayments).where(and(eq(taxPayments.guideId, guide.id), eq(taxPayments.status, "Confirmado"))).limit(1)).length) throw new TaxError("Guia com pagamento confirmado exige estorno, não cancelamento.");
    const [cancelled] = await tx.update(taxGuides).set({ status: "Cancelada" }).where(eq(taxGuides.id, guide.id)).returning();
    await tx.update(taxAssessments).set({ status: "Lançado" }).where(eq(taxAssessments.id, guide.assessmentId));
    await audit(tx, actor, "CANCEL", "TaxGuide", guide.id, { assessmentId: guide.assessmentId });
    return cancelled;
  });
}

export async function configureTaxParameter(
  db: DatabaseConnection,
  actor: TaxActor,
  input: { taxId: string; code: string; name: string; calculationType: string; configuration: object | JsonValue; effectiveFrom: Date; effectiveUntil?: Date; isActive?: boolean },
) {
  if (!input.code.trim() || !input.name.trim() || !input.calculationType.trim()) throw new TaxError("Codigo, nome e tipo de calculo sao obrigatorios.");
  if (input.effectiveUntil && input.effectiveUntil < input.effectiveFrom) throw new TaxError("A vigencia final nao pode ser anterior a inicial.");
  return withDatabaseTransaction(db, async (tx) => {
    const tax = (await tx.select().from(taxes).where(eq(taxes.id, input.taxId)).limit(1))[0];
    if (!tax?.isActive) throw new TaxError("Selecione um tributo ativo para parametrizacao.");
    const scope = await resolveTaxAssessmentScope(tx, actor, input.taxId);
    const configuration = catalogJson(input.configuration);
    const options = fiscalPaymentOptionsSchema.parse(taxScopeSnapshot(configuration).paymentOptions ?? []);
    if (options.length && (!scope.governmentEntityId || !scope.budgetUnitId)) throw new TaxError("Opções de pagamento exigem origem municipal conciliada.");
    for (const taxId of new Set(options.flatMap(option => option.debtTaxIds))) {
      if (!(await tx.select({ id: taxes.id }).from(taxes).where(and(eq(taxes.id, taxId), eq(taxes.isActive, true))).limit(1)).length) throw new TaxError("Selecione tributos ativos na conferência de débitos do desconto.");
      const origin = await resolveTaxAssessmentScope(tx, actor, taxId);
      if (origin.governmentEntityId !== scope.governmentEntityId) throw new TaxError("Tributo da conferência de desconto pertence a outro ente municipal.");
    }
    const [parameter] = await tx.insert(catalogParameters).values({ taxId: input.taxId, code: input.code.trim(), name: input.name.trim(), calculationType: input.calculationType.trim(), configuration: configuration === null ? JsonNull : configuration, effectiveFrom: input.effectiveFrom, effectiveUntil: input.effectiveUntil, isActive: input.isActive ?? true }).returning();
    if (scope.governmentEntityId && scope.budgetUnitId) await tx.insert(taxRegistryEntries).values({ entityType: "TAX_PARAMETER", entityId: parameter.id, category: "PARAMETER_SCOPE", title: parameter.name, actorUsuarioId: actor.usuarioId, data: scope });
    await audit(tx, actor, "CREATE", "TaxParameter", parameter.id, { taxId: input.taxId, code: parameter.code, calculationType: parameter.calculationType, effectiveFrom: parameter.effectiveFrom.toISOString() });
    return parameter;
  });
}

export async function configureTaxServiceActivity(
  db: DatabaseConnection,
  actor: TaxActor,
  input: { taxId: string; code: string; name: string; issRate: Decimal | string | number },
) {
  const issRate = new Decimal(String(input.issRate));
  if (!issRate.isFinite() || issRate.lessThan(0)) throw new TaxError("Informe uma aliquota ISS valida.");
  return withDatabaseTransaction(db, async (tx) => {
    const tax = (await tx.select().from(taxes).where(eq(taxes.id, input.taxId)).limit(1))[0];
    if (!tax?.isActive) throw new TaxError("Selecione um tributo ativo para a atividade de servico.");
    const [activity] = await tx.insert(inspectionActivities).values({ taxId: input.taxId, code: input.code.trim(), name: input.name.trim(), issRate }).onConflictDoUpdate({ target: [inspectionActivities.taxId, inspectionActivities.code], set: { name: input.name.trim(), issRate, isActive: true, updatedAt: new Date() } }).returning();
    await audit(tx, actor, "UPSERT", "TaxServiceActivity", activity.id, { taxId: input.taxId, code: activity.code, issRate: activity.issRate?.toString() ?? null });
    return activity;
  });
}

export async function createTaxServiceRequest(
  db: DatabaseConnection,
  actor: TaxActor,
  input: { serviceType: "ITBI" | "ALVARA" | string; taxpayerId: string; processId: string; documentId?: string; assessmentId?: string; licenseId?: string; notes?: string },
) {
  if (!input.serviceType.trim()) throw new TaxError("Informe o tipo de solicitacao tributaria.");
  return withDatabaseTransaction(db, async (tx) => {
    const [taxpayer, process, document, assessment, license] = await Promise.all([
      tx.select().from(taxpayers).where(eq(taxpayers.id, input.taxpayerId)).limit(1).then(rows => rows[0]),
      tx.select({ id: processes.id }).from(processes).where(eq(processes.id, input.processId)).limit(1).then(rows => rows[0]),
      input.documentId ? tx.select().from(documents).where(eq(documents.id, input.documentId)).limit(1).then(rows => rows[0]) : null,
      input.assessmentId ? tx.select().from(taxAssessments).where(eq(taxAssessments.id, input.assessmentId)).limit(1).then(rows => rows[0]) : null,
      input.licenseId ? tx.select().from(taxLicenses).where(eq(taxLicenses.id, input.licenseId)).limit(1).then(rows => rows[0]) : null,
    ]);
    if (taxpayer?.status !== "Ativo" || !process) throw new TaxError("Contribuinte ativo e processo do Modulo 3 sao obrigatorios.");
    if (input.documentId && document?.status !== "Válido") throw new TaxError("O documento GED vinculado deve estar valido.");
    if (assessment && assessment.taxpayerId !== input.taxpayerId) throw new TaxError("O lancamento tributario deve pertencer ao contribuinte.");
    if (license && license.taxpayerId !== input.taxpayerId) throw new TaxError("A licenca deve pertencer ao contribuinte.");
    if (input.assessmentId) {
      const origin = await readTaxAssessment(tx, input.assessmentId);
      await resolveTaxAssessmentScope(tx, actor, origin.taxId, origin.calculationSnapshot);
    } else if (actor.allowedBudgetUnitIds) throw new TaxError("Selecione lançamento tributário com UG autorizada para a solicitação.");
    const [request] = await tx.insert(catalogServiceRequests).values({ serviceType: input.serviceType.trim().toUpperCase(), taxpayerId: input.taxpayerId, processId: process.id, documentId: document?.id, assessmentId: assessment?.id, licenseId: license?.id, notes: input.notes?.trim() || undefined }).returning();
    await audit(tx, actor, "CREATE", "TaxServiceRequest", request.id, { serviceType: request.serviceType, processId: request.processId, documentId: request.documentId, assessmentId: request.assessmentId, licenseId: request.licenseId });
    return request;
  });
}

export async function recordIssDeclaration(
  db: DatabaseConnection,
  actor: TaxActor,
  input: { taxpayerId: string; economicRegistrationId?: string; activityId: string; competence: Date; serviceValue: Decimal | string | number; deductionValue?: Decimal | string | number },
) {
  const serviceValue = amount(input.serviceValue);
  const deductions = amount(input.deductionValue ?? 0, true);
  if (deductions.greaterThan(serviceValue)) throw new TaxError("Deducoes nao podem exceder o valor dos servicos.");
  return withDatabaseTransaction(db, async (tx) => {
    const [taxpayer, activity, registration] = await Promise.all([
      tx.select().from(taxpayers).where(eq(taxpayers.id, input.taxpayerId)).limit(1).then(rows => rows[0]),
      tx.select().from(inspectionActivities).where(eq(inspectionActivities.id, input.activityId)).limit(1).then(async rows => rows[0] ? { ...rows[0], tax: await readTaxDefinition(tx, rows[0].taxId) } : null),
      input.economicRegistrationId ? tx.select().from(economicRegistrations).where(eq(economicRegistrations.id, input.economicRegistrationId)).limit(1).then(rows => rows[0]) : null,
    ]);
    if (taxpayer?.status !== "Ativo" || !activity?.isActive || !activity.tax.isActive || !activity.issRate) throw new TaxError("Contribuinte, atividade e aliquota ISS ativos sao obrigatorios.");
    if (registration && (registration.taxpayerId !== input.taxpayerId || registration.status !== "Ativo")) throw new TaxError("A inscricao economica deve estar ativa e pertencer ao contribuinte.");
    const scope = await assessmentYearScope(tx, actor, input.competence.getUTCFullYear(), activity.taxId);
    const taxable = serviceValue.minus(deductions);
    const issValue = taxable.mul(activity.issRate).div(100).toDecimalPlaces(2);
    const activityRelationships = scope.governmentEntityId
      ? await readMunicipalServiceRelationships(tx, { governmentEntityId: scope.governmentEntityId, activityId: activity.id, date: input.competence })
      : { status: "NOT_RECONCILED", relationships: [] };
    const [declaration] = await tx.insert(inspectionDeclarations).values({ taxpayerId: input.taxpayerId, economicRegistrationId: input.economicRegistrationId, activityId: input.activityId, competence: input.competence, serviceValueDecimal: serviceValue, deductionValueDecimal: deductions, issValueDecimal: issValue, calculationSnapshot: catalogJson({ tax: activity.tax.name, rate: activity.issRate.toString(), taxableBase: taxable.toFixed(2), issValue: issValue.toFixed(2), scope: "APURACAO_INTERNA", budgetUnitId: scope.budgetUnitId, governmentEntityId: scope.governmentEntityId, financialYearId: scope.financialYear.id, activityRelationships }) }).returning();
    await audit(tx, actor, "CREATE", "TaxDeclaration", declaration.id, { activityId: activity.id, competence: input.competence.toISOString(), serviceValue: serviceValue.toFixed(2), issValue: issValue.toFixed(2) });
    return declaration;
  });
}

export async function enrollAssessmentInActiveDebt(db: DatabaseConnection, actor: TaxActor, assessmentId: string) {
  return withDatabaseTransaction(db, async (tx) => {
    await lockTaxAccountingRow(tx, "TaxAssessment", assessmentId);
    const assessment = (await tx.select().from(taxAssessments).where(eq(taxAssessments.id, assessmentId)).limit(1))[0];
    if (!assessment) throw new TaxError("Lancamento tributario nao encontrado.");
    const debtScope = await resolveTaxAssessmentScope(tx, actor, assessment.taxId, assessment.calculationSnapshot);
    const activeDebt = (await tx.select().from(taxActiveDebts).where(eq(taxActiveDebts.assessmentId, assessmentId)).limit(1))[0];
    if (activeDebt) return activeDebt;
    if (["Pago", "Cancelado", "Suspenso"].includes(assessment.status)) throw new TaxError("Somente lancamento tributario pendente pode seguir para base de divida ativa.");
    const payments = await readConfirmedTaxAssessmentPayments(tx, assessmentId);
    const collected = payments.reduce((sum, payment) => sum.plus(requiredAmount(payment.amountPaidDecimal, "TaxPayment.amountPaidDecimal")), new Decimal(0));
    const value = (assessment.finalValueDecimal ?? requiredAmount(assessment.originalValueDecimal, "TaxAssessment.originalValueDecimal")).minus(collected).minus(await taxAssessmentCompensatedValue(tx, assessment.id));
    if (value.lte(0)) throw new TaxError("Lancamento sem saldo pendente para inscricao em divida ativa.");
    const tax = await readTaxDefinition(tx, assessment.taxId);
    const [debt] = await tx.insert(taxActiveDebts).values({ taxpayerId: assessment.taxpayerId, assessmentId: assessment.id, year: assessment.year, originDebtType: tax.name, budgetUnitId: debtScope.budgetUnitId, governmentEntityId: debtScope.governmentEntityId, originalValue: legacyAmount(value), originalValueDecimal: value, updatedValue: legacyAmount(value), updatedValueDecimal: value, status: "PENDENTE_DE_VALIDACAO" }).returning();
    await tx.update(taxAssessments).set({ status: "Dívida Ativa" }).where(eq(taxAssessments.id, assessment.id));
    await audit(tx, actor, "CREATE", "ActiveDebt", debt.id, { assessmentId: assessment.id, value: value.toFixed(2), status: debt.status });
    return debt;
  });
}

export async function createDebtInstallmentPlan(
  db: DatabaseConnection,
  actor: TaxActor,
  input: { activeDebtId: string; installmentsCount: number; firstDueDate: Date; downPayment?: Decimal | string | number },
) {
  if (!Number.isInteger(input.installmentsCount) || input.installmentsCount < 1) throw new TaxError("Informe ao menos uma parcela.");
  const downPayment = amount(input.downPayment ?? 0, true);
  return withDatabaseTransaction(db, async (tx) => {
    await lockTaxAccountingRow(tx, "ActiveDebt", input.activeDebtId);
    const debt = (await tx.select().from(taxActiveDebts).where(eq(taxActiveDebts.id, input.activeDebtId)).limit(1))[0];
    if (!debt || !["Inscrita", "PENDENTE_DE_VALIDACAO", "Parcelada"].includes(debt.status)) throw new TaxError("A divida ativa nao esta disponivel para avaliacao de parcelamento.");
    const assessment = debt.assessmentId ? await readTaxAssessment(tx, debt.assessmentId) : null;
    if (assessment) await resolveTaxAssessmentScope(tx, actor, assessment.taxId, assessment.calculationSnapshot);
    else if (actor.allowedBudgetUnitIds) throw new TaxError("Divida legada sem origem/UG conciliada.");
    if ((await tx.select({ id: taxDebtInstallments.id }).from(taxDebtInstallments).where(and(eq(taxDebtInstallments.activeDebtId, debt.id), notInArray(taxDebtInstallments.status, ["Cancelado", "Cancelada", "Pago", "Paga"]))).limit(1)).length) throw new TaxError("Divida ja possui parcelamento ativo; regularize-o antes de emitir outro.");
    const total = requiredAmount(debt.updatedValueDecimal, "ActiveDebt.updatedValueDecimal");
    if (downPayment.greaterThanOrEqualTo(total)) throw new TaxError("A entrada deve ser menor que o valor atualizado da divida.");
    const balance = total.minus(downPayment);
    const installmentValue = balance.div(input.installmentsCount).toDecimalPlaces(2);
    const adjustment = balance.minus(installmentValue.mul(input.installmentsCount));
    const [plan] = await tx.insert(taxDebtInstallments).values({ taxpayerId: debt.taxpayerId, activeDebtId: debt.id, totalValue: legacyAmount(total), totalValueDecimal: total, downPayment: legacyAmount(downPayment), downPaymentDecimal: downPayment, installmentsCount: input.installmentsCount, status: "PENDENTE_DE_VALIDACAO" }).returning();
    for (let index = 0; index < input.installmentsCount; index++) {
      const dueDate = new Date(input.firstDueDate);
      dueDate.setUTCMonth(dueDate.getUTCMonth() + index);
      const value = index === input.installmentsCount - 1 ? installmentValue.plus(adjustment) : installmentValue;
      await tx.execute(sql`INSERT INTO "DebtInstallmentSchedule" (id,"debtInstallmentId","installmentNumber","dueDate","valueDecimal","updatedAt") VALUES (${createId()},${plan.id},${index + 1},${dueDate},${value.toFixed(2)},CURRENT_TIMESTAMP)`);
    }
    await tx.update(taxActiveDebts).set({ status: "Parcelada" }).where(eq(taxActiveDebts.id, debt.id));
    await audit(tx, actor, "CREATE", "DebtInstallment", plan.id, { activeDebtId: debt.id, totalValue: total.toFixed(2), installmentsCount: input.installmentsCount, scope: "AVALIACAO_INTERNA" });
    return plan;
  });
}

export async function evaluateTaxCertificateSituation(db: DatabaseConnection, actor: TaxActor, taxpayerId: string) {
  return withDatabaseTransaction(db, tx => evaluateCertificateInTransaction(tx, actor, taxpayerId), { isolationLevel: "serializable" });
}

export async function linkTaxCaseRecord(db: DatabaseConnection, actor: TaxActor, input: { taxpayerId: string; entityType: string; entityId: string; processId?: string; documentId?: string; purpose?: string }) {
  return withDatabaseTransaction(db, async (tx) => {
    if (!input.processId && !input.documentId) throw new TaxError("Vincule ao menos um Processo ou documento GED.");
    const [taxpayer, process, document] = await Promise.all([
      tx.select({ id: taxpayers.id }).from(taxpayers).where(eq(taxpayers.id, input.taxpayerId)).limit(1).then(rows => rows[0]),
      input.processId ? tx.select({ id: processes.id }).from(processes).where(eq(processes.id, input.processId)).limit(1).then(rows => rows[0]) : null,
      input.documentId ? tx.select().from(documents).where(eq(documents.id, input.documentId)).limit(1).then(rows => rows[0]) : null,
    ]);
    if (!taxpayer || (input.processId && !process) || (input.documentId && document?.status !== "Válido")) throw new TaxError("Contribuinte, Processo e documento GED devem ser validos.");
    const result = await tx.execute<{ id: string; taxpayerId: string; entityType: string; entityId: string; processId: string | null; documentId: string | null; purpose: string | null; createdAt: string }>(sql`INSERT INTO "TaxCaseLink" (id,"taxpayerId","entityType","entityId","processId","documentId",purpose) VALUES (${createId()},${input.taxpayerId},${input.entityType.trim()},${input.entityId.trim()},${process?.id ?? null},${document?.id ?? null},${input.purpose?.trim() || null}) RETURNING *`);
    const row = requiredTaxRecord(result.rows[0], "Vínculo tributário");
    const link = { ...row, createdAt: databaseTimestamp(row.createdAt) };
    await audit(tx, actor, "LINK", "TaxCaseLink", link.id, { entityType: link.entityType, entityId: link.entityId, processId: link.processId, documentId: link.documentId });
    return link;
  });
}
