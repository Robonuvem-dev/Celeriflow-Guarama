import { randomUUID } from "node:crypto";
import { and, asc, count, desc, eq, gt, gte, inArray, isNotNull, isNull, lt, ne, notInArray, or, sql } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import { JsonNull } from "@/db/json";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseExecutor, type DatabaseTransaction } from "@/db/transaction";
import { taxActiveDebts, taxDebtInstallments, taxIntegrationEvents, taxPayments } from "@/db/schema/tax-accounting";
import { taxAssessments, taxGuides, taxes } from "@/db/schema/taxation-core";
import { documents, realEstates, taxpayers } from "@/db/schema/registry";
import { people } from "@/db/schema/people";
import { cemeteries, cemeteryAttachments, cemeteryChangeHistory, cemeteryChapels, cemeteryConcessions, cemeteryDeathCauses, cemeteryDeceased, cemeteryEmployees, cemeteryFeeEvents, cemeteryFeeRules, cemeteryFuneralHomes, cemeteryGraves, cemeteryIdentificationFields, cemeteryLots, cemeteryMovements, cemeteryOssuaries, cemeteryProcesses, cemeterySectors } from "@/db/schema/cemeteries";
import { activeDebtAgreementTotals, activeDebtDeclarationTotals, cdaVersions, debtEvents, debtPortfolioItems, debtPortfolios, debtSuspensions, executionBatches, executionCases, executionEvents, protestBatches, protestItems } from "@/db/schema/tax-active-debt";
import { pageActivities } from "@/db/schema/taxation-pages";
import { assessmentVisibility, debtVisibility, lockDebtOrigin, lockDebtRows, nextDebtSequence as nextSequence, readDebt, readDebtBinding, readDebtPayments, readDebtTaxpayer, requiredDebtRow } from "@/db/repositories/tax-active-debt/records";
import { insertDebtAudit, insertDebtRegistry } from "@/db/repositories/tax-active-debt/notices";
import { activeDebtSnapshot as json } from "@/db/repositories/tax-active-debt/snapshot";
import type { ActiveDebtActor as Actor, DeclarantDebtPosition } from "@/lib/contracts/tax-active-debt";
import { assertCemeteryTransferAllowed, assertLotCanReceiveGrave, cemeteryFeeAmount, concessionSituation, executionNext, formatCdaNumber, graveHasVacancy, internalProtocol, nextCdaVersion, occupancyStats, protestNext, sumBy, trendByMonth, validateEnrollmentEligibility, TributarioS9Error } from "./s9-engine";
import { confirmTaxPaymentInTransaction, createTaxAssessmentInTransaction, generateTaxGuideInTransaction } from "./index";
import { resolveTaxAssessmentScope, resolveTaxFinancialYear, taxAssessmentCompensatedValue, taxScopeSnapshot } from "./scope";
import { assertAccountingPeriodOpen } from "@/lib/financeiro";
import { postTaxAssessmentAdjustment, reclassifyActiveDebtInTransaction, returnActiveDebtReceivableInTransaction } from "./accrual-accounting";
import { MUNICIPALITY_LABEL, MUNICIPALITY_NAME } from "@/lib/municipality-identity";
import { lockWorkflowRows, validateBurialIdentity, validateTransferPair, validateWorkflowDate, workflowRequest } from "../cemeteries/workflow";
import { recordCemeteryFeeEvent, chargeCemeteryFeeEvent } from "../cemeteries/fees-service";

const fullActor = (actor: Actor) => ({ usuarioId: actor.usuarioId, employeeId: actor.employeeId ?? null, allowedBudgetUnitIds: actor.allowedBudgetUnitIds });
const money = (value: number | string | Decimal) => new Decimal(String(value)).toDecimalPlaces(2);
const transactionDefaults = { timeoutMs: 5000 };
const code = (prefix: string) => `${prefix}-${new Date().getUTCFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`;

async function chargeRecordedCemeteryFees(connection: DatabaseConnection, actor: Actor, sourceType: string, sourceId: string) {
  const events = await connection.db.select({ eventKey: cemeteryFeeEvents.eventKey }).from(cemeteryFeeEvents).where(and(eq(cemeteryFeeEvents.sourceType, sourceType), eq(cemeteryFeeEvents.sourceId, sourceId)));
  for (const event of events) await chargeCemeteryFeeEvent(connection, fullActor(actor), event.eventKey);
}

async function validateTaxpayer(db: DatabaseExecutor, taxpayerId: string, label: string) {
  const [taxpayer] = await db.select({ id: taxpayers.id, status: taxpayers.status }).from(taxpayers).where(eq(taxpayers.id, taxpayerId)).limit(1);
  if (!taxpayer || taxpayer.status !== "Ativo") throw new TributarioS9Error(`${label} deve estar vinculado a um contribuinte ativo do Cadastro Único.`);
  return taxpayer;
}

async function validateCemeteryAdditionalData(db: DatabaseExecutor, cemeteryId: string, targetType: "LOTE" | "SEPULTURA", value?: Record<string, unknown>) {
  const fields = await db.select().from(cemeteryIdentificationFields).where(and(eq(cemeteryIdentificationFields.cemeteryId, cemeteryId), eq(cemeteryIdentificationFields.targetType, targetType), eq(cemeteryIdentificationFields.active, true)));
  const data = value ?? {};
  for (const field of fields) {
    const fieldValue = data[field.fieldKey];
    if (field.required && (fieldValue === undefined || fieldValue === null || String(fieldValue).trim() === "")) throw new TributarioS9Error(`O campo ${field.label} é obrigatório.`);
    if (fieldValue !== undefined && fieldValue !== null && field.valueType === "NUMERICO" && !Number.isFinite(Number(fieldValue))) throw new TributarioS9Error(`O campo ${field.label} deve ser numérico.`);
  }
  return json(data);
}

async function cemeteryHistory(tx: DatabaseTransaction, actor: Actor, targetType: "LOTE" | "SEPULTURA", targetId: string, fieldName: string, previousValue: unknown, newValue: unknown) {
  await tx.insert(cemeteryChangeHistory).values({ targetType, targetId, fieldName, previousValue: previousValue === undefined ? undefined : previousValue === null ? JsonNull : json(previousValue), newValue: newValue === undefined ? undefined : newValue === null ? JsonNull : json(newValue), actorUsuarioId: actor.usuarioId });
}

async function refreshCemeteryLotStatus(tx: DatabaseTransaction, actor: Actor, lotId?: string | null) {
  if (!lotId) return;
  await lockWorkflowRows(tx, "CemeteryLot", [lotId]);
  const [lot] = await tx.select({ status: cemeteryLots.status }).from(cemeteryLots).where(eq(cemeteryLots.id, lotId)).limit(1);
  if (!lot) return;
  const occupied = (await tx.select({ value: count() }).from(cemeteryGraves).where(and(eq(cemeteryGraves.lotId, lotId), gt(cemeteryGraves.occupantCount, 0))))[0].value;
  const status = occupied ? "OCUPADO" : "LIVRE";
  if (lot.status !== status) {
    await tx.update(cemeteryLots).set({ status }).where(eq(cemeteryLots.id, lotId));
    await cemeteryHistory(tx, actor, "LOTE", lotId, "status", lot.status, status);
  }
}

async function assertDebtAccess(db: DatabaseExecutor, actor: Actor, debtId: string) {
  if (!actor.allowedBudgetUnitIds) return;
  const [debt] = await db.select({ id: taxActiveDebts.id, budgetUnitId: taxActiveDebts.budgetUnitId, governmentEntityId: taxActiveDebts.governmentEntityId }).from(taxActiveDebts).where(and(eq(taxActiveDebts.id, debtId), debtVisibility(actor.allowedBudgetUnitIds))).limit(1);
  if (!debt) throw new TributarioS9Error("Dívida sem origem municipal conciliada ou fora das unidades gestoras autorizadas.");
  if (debt.budgetUnitId) {
    const binding = await readDebtBinding(db, debt.budgetUnitId);
    if (!binding || binding.governmentEntityId !== debt.governmentEntityId) throw new TributarioS9Error("O vínculo municipal da UG diverge da dívida original; concilie o histórico antes da operação.");
  }
}

async function debtEvent(tx: DatabaseTransaction, actor: Actor, activeDebtId: string, eventType: string, description: string, payload?: unknown) {
  await assertDebtAccess(tx, actor, activeDebtId);
  return (await tx.insert(debtEvents).values({ activeDebtId, eventType, description, payload: payload === undefined ? undefined : payload === null ? JsonNull : json(payload), actorUsuarioId: actor.usuarioId }).returning())[0];
}

function taxpayerName(taxpayer: { person?: { fullName?: string | null; cpf?: string | null } | null; company?: { corporateName?: string | null; cnpj?: string | null } | null } | null) {
  return taxpayer?.company?.corporateName ?? taxpayer?.person?.fullName ?? "Contribuinte";
}

function taxpayerDocument(taxpayer: { person?: { cpf?: string | null } | null; company?: { cnpj?: string | null } | null } | null) {
  return taxpayer?.company?.cnpj ?? taxpayer?.person?.cpf ?? "-";
}

// Defaults demonstrativos controlados: tributo de sepultamento, estrutura mínima de cemitério, causas e funerária.
export async function ensureS9Defaults(db: DatabaseExecutor, actor: Actor) {
  void actor;
  await db.insert(taxes).values({ id: "tax-sepultamento-s9", name: "Taxa de Sepultamento", taxType: "Taxa", isActive: true }).onConflictDoNothing({ target: taxes.id });
  const tax = requiredDebtRow((await db.select().from(taxes).where(eq(taxes.id, "tax-sepultamento-s9")).limit(1))[0]);
  await db.insert(cemeteries).values({ code: "CEM-MUNICIPAL", name: `Cemitério Municipal de ${MUNICIPALITY_NAME}`, address: MUNICIPALITY_LABEL, wakePlace: "Capela municipal" }).onConflictDoNothing({ target: cemeteries.code });
  const cemetery = requiredDebtRow((await db.select().from(cemeteries).where(eq(cemeteries.code, "CEM-MUNICIPAL")).limit(1))[0]);
  await db.insert(cemeterySectors).values({ cemeteryId: cemetery.id, code: "QUADRA-A", name: "Quadra A" }).onConflictDoNothing({ target: [cemeterySectors.cemeteryId, cemeterySectors.code] });
  const sector = requiredDebtRow((await db.select().from(cemeterySectors).where(and(eq(cemeterySectors.cemeteryId, cemetery.id), eq(cemeterySectors.code, "QUADRA-A"))).limit(1))[0]);
  for (const [code, description] of [["NATURAL", "Causa natural"], ["ACIDENTE", "Acidente"], ["VIOLENTA", "Causa violenta"], ["INFANTIL", "Óbito infantil"], ["FETAL", "Óbito fetal"], ["IGNORADA", "Causa ignorada"]] as [string, string][]) {
    await db.insert(cemeteryDeathCauses).values({ code, description }).onConflictDoNothing({ target: cemeteryDeathCauses.code });
  }
  await db.insert(cemeteryFuneralHomes).values({ id: "funeraria-s9", name: "Funerária Paz Eterna", phone: "Não informado" }).onConflictDoNothing({ target: cemeteryFuneralHomes.id });
  await db.insert(cemeteryEmployees).values({ id: "coveiro-s9", cemeteryId: cemetery.id, name: "Zelador do cemitério", role: "Coveiro" }).onConflictDoNothing({ target: cemeteryEmployees.id });
  const [feeRule] = await db.select({ id: cemeteryFeeRules.id }).from(cemeteryFeeRules).where(and(eq(cemeteryFeeRules.cemeteryId, cemetery.id), eq(cemeteryFeeRules.eventType, "SEPULTAMENTO"), eq(cemeteryFeeRules.active, true))).limit(1);
  if (!feeRule) await db.insert(cemeteryFeeRules).values({ cemeteryId: cemetery.id, eventType: "SEPULTAMENTO", label: "Taxa de sepultamento", formula: "VALOR_FIXO", baseAmount: new Decimal(100) });
  return { tax, cemetery, sector };
}

// S9-A — Débitos elegíveis com validação prévia (TRI-340/341). Reutiliza lançamentos e dívida existentes.
export async function listEnrollmentCandidates(db: DatabaseExecutor, allowedBudgetUnitIds?: string[]) {
  const records = await db.select({ assessment: taxAssessments, tax: { name: taxes.name }, activeDebt: { id: taxActiveDebts.id } }).from(taxAssessments).innerJoin(taxes, eq(taxes.id, taxAssessments.taxId)).leftJoin(taxActiveDebts, eq(taxActiveDebts.assessmentId, taxAssessments.id)).where(and(inArray(taxAssessments.status, ["Lançado", "Emitido", "Parcial"]), assessmentVisibility(allowedBudgetUnitIds))).orderBy(desc(taxAssessments.createdAt)).limit(200);
  const assessments = await Promise.all(records.map(async row => ({ ...row.assessment, tax: row.tax, activeDebt: row.activeDebt, taxpayer: requiredDebtRow((await readDebtTaxpayer(db, row.assessment.taxpayerId)) ?? undefined) })));
  return assessments.map((row) => {
    const taxpayer = row.taxpayer;
    const addresses = [...(taxpayer.person?.addresses ?? []), ...(taxpayer.company?.addresses ?? [])];
    const check = validateEnrollmentEligibility({
      taxpayerActive: taxpayer.status === "Ativo",
      hasIdentification: Boolean(taxpayer.person || taxpayer.company),
      hasAddress: addresses.length > 0,
      debtStatus: row.status,
      debtValue: row.finalValueDecimal ?? row.originalValueDecimal ?? row.originalValue,
      alreadyEnrolled: Boolean(row.activeDebt),
      suspended: false,
    });
    return { id: row.id, number: row.assessmentNumber ?? row.id, taxpayerId: row.taxpayerId, taxpayer: taxpayerName(taxpayer), origin: row.tax.name, year: row.year, value: Number(row.finalValueDecimal ?? row.originalValueDecimal ?? row.originalValue), status: row.status, eligible: check.eligible, reasons: check.reasons, enrolledDebtId: row.activeDebt?.id ?? null };
  });
}

// Inscrição a partir de lançamento: reaproveita o motor existente, que devolve a dívida atual sem duplicar.
export async function enrollAssessmentDebt(connection: DatabaseConnection, actor: Actor, assessmentId: string) {
  return withDatabaseTransaction(connection, async (tx) => {
    const debt = await enrollOriginAssessment(tx, actor, assessmentId);
    await tx.select({ id: taxActiveDebts.id }).from(taxActiveDebts).where(eq(taxActiveDebts.id, debt.id)).for("update");
    await assertDebtAccess(tx, actor, debt.id);
    const [previous] = await tx.select({ id: debtEvents.id }).from(debtEvents).where(and(eq(debtEvents.activeDebtId, debt.id), eq(debtEvents.eventType, "INSCRICAO"))).limit(1);
    if (!previous) await debtEvent(tx, actor, debt.id, "INSCRICAO", `Débito inscrito em dívida ativa a partir do lançamento ${assessmentId}.`, { assessmentId });
    return debt;
  }, transactionDefaults);
}

// The assessment lock, canonical payment/compensation balance, source audit and
// S9 event share the owner's transaction, including on historical replay.
async function enrollOriginAssessment(tx: DatabaseTransaction, actor: Actor, assessmentId: string) {
  await tx.select({ id: taxAssessments.id }).from(taxAssessments).where(eq(taxAssessments.id, assessmentId)).for("update");
  const [row] = await tx.select({ assessment: taxAssessments, tax: { name: taxes.name } }).from(taxAssessments).innerJoin(taxes, eq(taxes.id, taxAssessments.taxId)).where(eq(taxAssessments.id, assessmentId)).limit(1);
  if (!row) throw new TributarioS9Error("Lancamento tributario nao encontrado.");
  const assessment = row.assessment;
  const scope = await resolveTaxAssessmentScope(tx, fullActor(actor), assessment.taxId, assessment.calculationSnapshot);
  const [existing] = await tx.select().from(taxActiveDebts).where(eq(taxActiveDebts.assessmentId, assessmentId)).limit(1);
  if (existing) return existing;
  if (["Pago", "Cancelado", "Suspenso"].includes(assessment.status)) throw new TributarioS9Error("Somente lancamento tributario pendente pode seguir para base de divida ativa.");
  const payments = await readDebtPayments(tx, [assessmentId]);
  const collected = payments.reduce((sum, row) => sum.plus(requiredDebtRow(row.payment.amountPaidDecimal ?? undefined, "TaxPayment.amountPaidDecimal sem Decimal conciliado.")), new Decimal(0));
  const total = requiredDebtRow(assessment.finalValueDecimal ?? assessment.originalValueDecimal ?? undefined, "TaxAssessment.originalValueDecimal sem Decimal conciliado.");
  const value = total.minus(collected).minus(await taxAssessmentCompensatedValue(tx, assessmentId));
  if (value.lte(0)) throw new TributarioS9Error("Lancamento sem saldo pendente para inscricao em divida ativa.");
  const [debt] = await tx.insert(taxActiveDebts).values({ taxpayerId: assessment.taxpayerId, assessmentId, year: assessment.year, originDebtType: row.tax.name, ...scope, originalValue: Number(value), originalValueDecimal: value, updatedValue: Number(value), updatedValueDecimal: value, status: "PENDENTE_DE_VALIDACAO" }).returning();
  await tx.update(taxAssessments).set({ status: "Dívida Ativa" }).where(eq(taxAssessments.id, assessmentId));
  await insertDebtAudit(tx, { action: "CREATE", entityType: "ActiveDebt", entityId: debt.id, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, payload: { assessmentId, value: value.toFixed(2), status: debt.status } });
  return debt;
}

// Inscrição manual/arquivo com chave de origem idempotente: mesma origem nunca cria segunda dívida.
export async function enrollManualDebt(connection: DatabaseConnection, actor: Actor, input: { taxpayerId: string; originDebtType: string; year: number; value: number; sourceKey: string; competence?: Date; budgetUnitId?: string }) {
  if (!input.sourceKey.trim()) throw new TributarioS9Error("A chave de origem é obrigatória para inscrição manual/arquivo.");
  const key = input.sourceKey.trim();
  const budgetUnitId = input.budgetUnitId?.trim();
  if (!budgetUnitId || (actor.allowedBudgetUnitIds && !actor.allowedBudgetUnitIds.includes(budgetUnitId))) throw new TributarioS9Error("Selecione a UG municipal autorizada de origem da dívida.");
  if (!Number.isInteger(input.year) || input.year < 1900 || input.year > new Date().getUTCFullYear()) throw new TributarioS9Error("Exercício de origem da dívida inválido.");
  if (input.competence && (!Number.isFinite(input.competence.valueOf()) || input.competence.getUTCFullYear() !== input.year)) throw new TributarioS9Error("Competência da dívida deve pertencer ao exercício de origem.");
  const [taxpayer] = await connection.db.select().from(taxpayers).where(eq(taxpayers.id, input.taxpayerId)).limit(1);
  if (!taxpayer || taxpayer.status !== "Ativo") throw new TributarioS9Error("Contribuinte ativo é obrigatório.");
  const value = money(input.value);
  if (value.lessThanOrEqualTo(0)) throw new TributarioS9Error("Valor do débito inválido.");
  const debt = await withDatabaseTransaction(connection, async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`DA:MANUAL:${key}`}, 0))::text`);
    const binding = requiredDebtRow((await readDebtBinding(tx, budgetUnitId)) ?? undefined);
    const [existing] = await tx.select().from(taxActiveDebts).where(eq(taxActiveDebts.sourceKey, key)).limit(1);
    if (existing) {
      await assertDebtAccess(tx, actor, existing.id);
      if (existing.budgetUnitId !== budgetUnitId || existing.governmentEntityId !== binding.governmentEntityId || existing.taxpayerId !== input.taxpayerId || existing.originDebtType !== (input.originDebtType.trim() || "Débito manual") || existing.year !== input.year || !existing.originalValueDecimal?.eq(value)) throw new TributarioS9Error("Origem da dívida já inscrita com outros dados; preserve e concilie o registro anterior.");
      const [enrollment] = await tx.select({ payload: debtEvents.payload }).from(debtEvents).where(and(eq(debtEvents.activeDebtId, existing.id), eq(debtEvents.eventType, "INSCRICAO"))).orderBy(asc(debtEvents.createdAt)).limit(1);
      if (!enrollment || (taxScopeSnapshot(enrollment.payload).competence ?? null) !== (input.competence?.toISOString() ?? null)) throw new TributarioS9Error("Competência da inscrição anterior diverge da repetição da origem.");
      return { debt: existing, created: false as const };
    }
    const [created] = await tx.insert(taxActiveDebts).values({ taxpayerId: taxpayer.id, originDebtType: input.originDebtType.trim() || "Débito manual", year: input.year, budgetUnitId, governmentEntityId: binding.governmentEntityId, originalValue: Number(value), originalValueDecimal: value, updatedValue: Number(value), updatedValueDecimal: value, sourceKey: key, status: "PENDENTE_DE_VALIDACAO" }).returning();
    await debtEvent(tx, actor, created.id, "INSCRICAO", `Inscrição manual/arquivo registrada com chave ${key}.`, { sourceKey: key, competence: input.competence ?? null });
    return { debt: created, created: true as const };
  }, transactionDefaults);
  return debt;
}

export async function validateDebt(connection: DatabaseConnection, actor: Actor, debtId: string) {
  return withDatabaseTransaction(connection, async (tx) => {
    await lockDebtOrigin(tx, debtId);
    await assertDebtAccess(tx, actor, debtId);
    const record = await readDebt(tx, debtId);
    const debt = { ...record, taxpayer: requiredDebtRow((await readDebtTaxpayer(tx, record.taxpayerId)) ?? undefined) };
    const addresses = [...(debt.taxpayer.person?.addresses ?? []), ...(debt.taxpayer.company?.addresses ?? [])];
    const suspensions = await tx.select({ id: debtSuspensions.id }).from(debtSuspensions).where(and(eq(debtSuspensions.activeDebtId, debt.id), eq(debtSuspensions.status, "VIGENTE")));
    const check = validateEnrollmentEligibility({
      taxpayerActive: debt.taxpayer.status === "Ativo",
      hasIdentification: Boolean(debt.taxpayer.person || debt.taxpayer.company),
      hasAddress: addresses.length > 0,
      debtStatus: debt.status === "PENDENTE_DE_VALIDACAO" ? "Lançado" : debt.status,
      debtValue: debt.updatedValueDecimal ?? debt.updatedValue,
      alreadyEnrolled: false,
      suspended: suspensions.length > 0,
    });
    if (!check.eligible) throw new TributarioS9Error(`Validação reprovada: ${check.reasons.join(" ")}`);
    const [updated] = await tx.update(taxActiveDebts).set({ status: "VALIDADA" }).where(eq(taxActiveDebts.id, debt.id)).returning();
    await debtEvent(tx, actor, debt.id, "VALIDACAO", "Débito validado para inscrição com cadastro suficiente.", { reasons: [] });
    return updated;
  }, transactionDefaults);
}

function cdaSnapshot(debt: { id: string; originDebtType: string; year: number; originalValueDecimal: unknown; updatedValueDecimal: unknown; taxpayerId: string }, taxpayer: { name: string; document: string }, cdaNumber: string, version: number) {
  return json({ cdaNumber, version, debtId: debt.id, origin: debt.originDebtType, year: debt.year, originalValue: String(debt.originalValueDecimal), updatedValue: String(debt.updatedValueDecimal), taxpayerId: debt.taxpayerId, taxpayer, scope: "CERTIDAO_DIVIDA_ATIVA" });
}

// Emissão da CDA com numeração sequencial e primeira versão (TRI-347/349).
export async function issueCda(connection: DatabaseConnection, actor: Actor, debtId: string) {
  return withDatabaseTransaction(connection, async (tx) => {
    await lockDebtOrigin(tx, debtId);
    await assertDebtAccess(tx, actor, debtId);
    const record = await readDebt(tx, debtId);
    const debt = { ...record, taxpayer: await readDebtTaxpayer(tx, record.taxpayerId) };
    if (!["VALIDADA", "PENDENTE_DE_VALIDACAO", "INSCRITA"].includes(debt.status)) throw new TributarioS9Error("Dívida fora do estágio de emissão de CDA.");
    if (debt.cdaNumber) {
      await reclassifyActiveDebtInTransaction(tx, fullActor(actor), debt.id, new Date());
      return readDebt(tx, debt.id);
    }
    const sequence = await nextSequence(tx, debt.year, "CDA");
    const cdaNumber = formatCdaNumber(debt.year, sequence);
    const taxpayer = { name: taxpayerName(debt.taxpayer), document: taxpayerDocument(debt.taxpayer) };
    const [updated] = await tx.update(taxActiveDebts).set({ cdaNumber, status: "INSCRITA" }).where(eq(taxActiveDebts.id, debt.id)).returning();
    await tx.insert(cdaVersions).values({ activeDebtId: debt.id, versionNumber: 1, cdaNumber, contentSnapshot: cdaSnapshot(debt, taxpayer, cdaNumber, 1) });
    await reclassifyActiveDebtInTransaction(tx, fullActor(actor), debt.id, new Date());
    await debtEvent(tx, actor, debt.id, "CDA_EMITIDA", `CDA ${cdaNumber} emitida (versão 1).`, { cdaNumber });
    return updated;
  }, { timeoutMs: 60000 });
}

export async function annotateCda(connection: DatabaseConnection, actor: Actor, input: { debtId: string; annotation: string }) {
  if (!input.annotation.trim()) throw new TributarioS9Error("Informe a anotação da CDA.");
  return withDatabaseTransaction(connection, async (tx) => {
    await lockDebtOrigin(tx, input.debtId);
    await assertDebtAccess(tx, actor, input.debtId);
    const [latest] = await tx.select().from(cdaVersions).where(eq(cdaVersions.activeDebtId, input.debtId)).orderBy(desc(cdaVersions.versionNumber)).limit(1);
    if (!latest) throw new TributarioS9Error("Emita a CDA antes de anotar.");
    const [updated] = await tx.update(cdaVersions).set({ annotation: input.annotation.trim() }).where(eq(cdaVersions.id, latest.id)).returning();
    await debtEvent(tx, actor, input.debtId, "CDA_ANOTADA", input.annotation.trim(), { version: latest.versionNumber });
    return updated;
  }, transactionDefaults);
}

// Versionamento: nova versão preserva o conteúdo anterior (TRI-348/383).
export async function createCdaVersion(connection: DatabaseConnection, actor: Actor, debtId: string) {
  return withDatabaseTransaction(connection, async (tx) => {
    await lockDebtOrigin(tx, debtId);
    await assertDebtAccess(tx, actor, debtId);
    const record = await readDebt(tx, debtId);
    const debt = { ...record, taxpayer: await readDebtTaxpayer(tx, record.taxpayerId) };
    if (!debt?.cdaNumber) throw new TributarioS9Error("Emita a CDA antes de versionar.");
    const versionCount = (await tx.select({ value: count() }).from(cdaVersions).where(eq(cdaVersions.activeDebtId, debt.id)))[0].value;
    const version = nextCdaVersion(versionCount);
    const taxpayer = { name: taxpayerName(debt.taxpayer), document: taxpayerDocument(debt.taxpayer) };
    const [created] = await tx.insert(cdaVersions).values({ activeDebtId: debt.id, versionNumber: version, cdaNumber: debt.cdaNumber, contentSnapshot: cdaSnapshot(debt, taxpayer, debt.cdaNumber, version) }).returning();
    await debtEvent(tx, actor, debt.id, "CDA_VERSIONADA", `CDA versionada para a versão ${version} sem reutilizar numeração.`, { version });
    return created;
  }, transactionDefaults);
}

// Assinatura registrada como interna: sem ICP-Brasil configurado, sem presunção oficial (TRI-384/385).
export async function signCdaInternal(connection: DatabaseConnection, actor: Actor, versionId: string) {
  return withDatabaseTransaction(connection, async (tx) => {
    const origin = requiredDebtRow((await tx.select({ activeDebtId: cdaVersions.activeDebtId }).from(cdaVersions).where(eq(cdaVersions.id, versionId)).limit(1))[0], "Versão de CDA não encontrada.");
    await lockDebtOrigin(tx, origin.activeDebtId);
    await assertDebtAccess(tx, actor, origin.activeDebtId);
    const version = requiredDebtRow((await tx.select().from(cdaVersions).where(eq(cdaVersions.id, versionId)).for("update"))[0]);
    if (version.signatureStatus !== "NAO_ASSINADA") return version;
    const [updated] = await tx.update(cdaVersions).set({ signatureStatus: "ASSINATURA_INTERNA", signedByUsuarioId: actor.usuarioId, signedAt: new Date() }).where(eq(cdaVersions.id, version.id)).returning();
    await debtEvent(tx, actor, version.activeDebtId, "OBSERVACAO", "CDA assinada internamente; certificação ICP-Brasil não configurada.", { version: version.versionNumber });
    return updated;
  }, transactionDefaults);
}

// Carteiras de dívida ativa com atualização (TRI-342/343).
export async function createDaPortfolio(connection: DatabaseConnection, actor: Actor, input: { name: string; minValue?: number; statuses?: string[] }) {
  return withDatabaseTransaction(connection, async tx => {
    const debts = await tx.select().from(taxActiveDebts).where(and(inArray(taxActiveDebts.status, input.statuses?.length ? input.statuses : ["INSCRITA", "VALIDADA", "EM_COBRANCA"]), debtVisibility(actor.allowedBudgetUnitIds))).orderBy(asc(taxActiveDebts.createdAt)).limit(300);
    const eligible = debts.filter(row => new Decimal(row.updatedValueDecimal ?? row.updatedValue).gte(input.minValue ?? 0));
    if (!eligible.length) throw new TributarioS9Error("Nenhuma dívida elegível para a carteira.");
    const [portfolio] = await tx.insert(debtPortfolios).values({ name: input.name.trim() || "Carteira de dívida ativa", criteria: json({ minValue: input.minValue ?? 0, statuses: input.statuses ?? [], createdAt: new Date() }), createdByUsuarioId: actor.usuarioId }).returning();
    const items = await tx.insert(debtPortfolioItems).values(eligible.map(row => ({ portfolioId: portfolio.id, activeDebtId: row.id, outstandingDecimal: row.updatedValueDecimal ?? new Decimal(row.updatedValue) }))).returning();
    return { ...portfolio, items };
  }, transactionDefaults);
}

export async function refreshDaPortfolio(connection: DatabaseConnection, portfolioId: string, actor?: Actor) {
  return withDatabaseTransaction(connection, async (tx) => {
    const items = await tx.select().from(debtPortfolioItems).where(eq(debtPortfolioItems.portfolioId, portfolioId));
    if (actor?.allowedBudgetUnitIds && !items.length) throw new TributarioS9Error("Carteira sem itens municipais conciliados para o escopo autorizado.");
    if (actor) for (const item of items) await assertDebtAccess(tx, actor, item.activeDebtId);
    for (const item of items) {
      const [debt] = await tx.select().from(taxActiveDebts).where(eq(taxActiveDebts.id, item.activeDebtId)).limit(1);
      if (!debt || ["PAGA", "CANCELADA", "BAIXADA", "BAIXADA_PRESCRICAO", "DEVOLVIDA"].includes(debt.status)) { await tx.delete(debtPortfolioItems).where(eq(debtPortfolioItems.id, item.id)); continue; }
      await tx.update(debtPortfolioItems).set({ outstandingDecimal: debt.updatedValueDecimal ?? new Decimal(debt.updatedValue) }).where(eq(debtPortfolioItems.id, item.id));
    }
    return (await tx.select({ value: count() }).from(debtPortfolioItems).where(eq(debtPortfolioItems.portfolioId, portfolioId)))[0].value;
  }, transactionDefaults);
}

// DAM da dívida inscrita pelo motor de guias (TRI-353/354).
export async function issueDaGuide(connection: DatabaseConnection, actor: Actor, input: { debtId: string; dueDate: Date }) {
  if (!Number.isFinite(input.dueDate.valueOf())) throw new TributarioS9Error("Vencimento da guia inválido.");
  return withDatabaseTransaction(connection, async tx => {
    await lockDebtOrigin(tx, input.debtId);
    await assertDebtAccess(tx, actor, input.debtId);
    const debt = await readDebt(tx, input.debtId);
    if (!debt.cdaNumber || !["INSCRITA", "Inscrita", "EM_COBRANCA", "EM_PROTESTO", "AJUIZADA"].includes(debt.status)) throw new TributarioS9Error("A guia exige CDA emitida e dívida disponível para cobrança.");
    let assessmentId = debt.assessmentId;
    if (!assessmentId) {
      const originTaxes = await tx.select({ id: taxes.id }).from(taxes).where(and(eq(taxes.name, debt.originDebtType), eq(taxes.isActive, true)));
      if (originTaxes.length !== 1) throw new TributarioS9Error(`Concilie um único tributo ativo para a origem "${debt.originDebtType}".`);
      if (!debt.updatedValueDecimal || debt.updatedValueDecimal.lte(0)) throw new TributarioS9Error("Dívida manual sem saldo Decimal conciliado.");
      const assessment = await createTaxAssessmentInTransaction(tx, fullActor(actor), { year: debt.year, taxId: originTaxes[0].id, taxpayerId: debt.taxpayerId, taxableBase: debt.updatedValueDecimal, rate: 100, competence: new Date(Date.UTC(debt.year, 0, 1, 12)) }, { legacyDebtOriginId: debt.id });
      assessmentId = assessment.id;
      await tx.update(taxActiveDebts).set({ assessmentId }).where(eq(taxActiveDebts.id, debt.id));
    }
    const [existing] = await tx.select().from(taxGuides).where(and(eq(taxGuides.assessmentId, assessmentId), ne(taxGuides.status, "Cancelada"))).limit(1);
    if (existing) {
      if (existing.dueDate.getTime() !== input.dueDate.getTime()) throw new TributarioS9Error("A dívida já possui guia com outro vencimento; cancele-a formalmente antes de reemitir.");
      return existing;
    }
    const guide = await generateTaxGuideInTransaction(tx, fullActor(actor), { assessmentId, dueDate: input.dueDate });
    await debtEvent(tx, actor, debt.id, "GUIA_EMITIDA", "DAM emitida pela origem nativa da dívida, sem duplicar constituição histórica.", { assessmentId, guideId: guide.id });
    return guide;
  }, { timeoutMs: 60000 });
}

export async function suspendDebt(connection: DatabaseConnection, actor: Actor, input: { debtId: string; reason: string; legalGround?: string; endsAt?: Date }) {
  if (!input.reason.trim()) throw new TributarioS9Error("Informe o motivo da suspensão.");
  return withDatabaseTransaction(connection, async (tx) => {
    await lockDebtOrigin(tx, input.debtId);
    await assertDebtAccess(tx, actor, input.debtId);
    const [suspension] = await tx.insert(debtSuspensions).values({ activeDebtId: input.debtId, reason: input.reason.trim(), legalGround: input.legalGround?.trim() || null, endsAt: input.endsAt || null, createdByUsuarioId: actor.usuarioId }).returning();
    await tx.update(taxActiveDebts).set({ status: "SUSPENSA" }).where(eq(taxActiveDebts.id, input.debtId));
    await debtEvent(tx, actor, input.debtId, "SUSPENSAO", input.reason.trim(), { suspensionId: suspension.id });
    return suspension;
  }, transactionDefaults);
}

export async function resumeDebt(connection: DatabaseConnection, actor: Actor, debtId: string) {
  return withDatabaseTransaction(connection, async (tx) => {
    await lockDebtOrigin(tx, debtId);
    await assertDebtAccess(tx, actor, debtId);
    await tx.update(debtSuspensions).set({ status: "ENCERRADA" }).where(and(eq(debtSuspensions.activeDebtId, debtId), eq(debtSuspensions.status, "VIGENTE")));
    const [updated] = await tx.update(taxActiveDebts).set({ status: "INSCRITA" }).where(eq(taxActiveDebts.id, debtId)).returning();
    await debtEvent(tx, actor, debtId, "SUSPENSAO_ENCERRADA", "Suspensão encerrada; cobrança retomada.");
    return updated;
  }, transactionDefaults);
}

// Devolução ao órgão de origem sem apagar o histórico (TRI-359).
export async function returnDebtToOrigin(connection: DatabaseConnection, actor: Actor, input: { debtId: string; reason: string }) {
  if (!input.reason.trim()) throw new TributarioS9Error("Informe o motivo da devolução.");
  return withDatabaseTransaction(connection, async (tx) => {
    await lockDebtOrigin(tx, input.debtId);
    await assertDebtAccess(tx, actor, input.debtId);
    const debt = await readDebt(tx, input.debtId);
    if (debt.status === "DEVOLVIDA") {
      const [event] = await tx.select().from(debtEvents).where(and(eq(debtEvents.activeDebtId, debt.id), eq(debtEvents.eventType, "DEVOLUCAO_ORIGEM"))).orderBy(desc(debtEvents.createdAt), desc(debtEvents.id)).limit(1);
      if (!event || event.description !== input.reason.trim()) throw new TributarioS9Error("Dívida já devolvida com outro motivo ou sem histórico conciliado.");
      return debt;
    }
    if (!["VALIDADA", "INSCRITA", "Inscrita", "EM_COBRANCA", "PENDENTE_DE_VALIDACAO"].includes(debt.status)) throw new TributarioS9Error("Devolução exige dívida disponível na cobrança administrativa; concilie os estágios posteriores antes da devolução.");
    if (debt.assessmentId && (await tx.select({ id: taxGuides.id }).from(taxGuides).where(and(eq(taxGuides.assessmentId, debt.assessmentId), notInArray(taxGuides.status, ["Cancelada", "Paga"]))).limit(1)).length) throw new TributarioS9Error("Cancele as guias abertas antes de devolver a dívida à origem.");
    const position = await returnActiveDebtReceivableInTransaction(tx, fullActor(actor), debt.id, new Date(), input.reason);
    const [updated] = await tx.update(taxActiveDebts).set({ status: "DEVOLVIDA" }).where(eq(taxActiveDebts.id, input.debtId)).returning();
    if (debt.assessmentId) await tx.update(taxAssessments).set({ status: "Revisado" }).where(eq(taxAssessments.id, debt.assessmentId));
    await debtEvent(tx, actor, input.debtId, "DEVOLUCAO_ORIGEM", input.reason.trim(), { registryEntryId: position?.id ?? null });
    return updated;
  }, { timeoutMs: 60000 });
}

// Pagamento da dívida inscrita pela guia confirmada no motor (TRI-360).
export async function settleDebtByGuide(connection: DatabaseConnection, actor: Actor, input: { debtId: string; guideId: string; amount: number; paymentMethod: string; idempotencyKey: string }) {
  return withDatabaseTransaction(connection, async (tx) => {
    const originGuide = requiredDebtRow((await tx.select().from(taxGuides).where(eq(taxGuides.id, input.guideId)).limit(1))[0]);
    await tx.select({ id: taxAssessments.id }).from(taxAssessments).where(eq(taxAssessments.id, originGuide.assessmentId)).for("update");
    await tx.select({ id: taxGuides.id }).from(taxGuides).where(eq(taxGuides.id, input.guideId)).for("update");
    await tx.select({ id: taxActiveDebts.id }).from(taxActiveDebts).where(eq(taxActiveDebts.id, input.debtId)).for("update");
    await assertDebtAccess(tx, actor, input.debtId);
    const debt = await readDebt(tx, input.debtId);
    if (!debt.assessmentId || originGuide.assessmentId !== debt.assessmentId) throw new TributarioS9Error("A guia não pertence ao lançamento da dívida selecionada.");
    const [previous] = await tx.select().from(taxPayments).where(eq(taxPayments.idempotencyKey, input.idempotencyKey.trim())).limit(1);
    if (!previous && !["INSCRITA", "Inscrita", "EM_COBRANCA", "Parcelada", "PARCELADA", "EM_PROTESTO", "AJUIZADA"].includes(debt.status)) throw new TributarioS9Error("Dívida suspensa, devolvida ou baixada não admite novo pagamento por este fluxo.");
    if (previous?.status !== undefined && previous.status !== "Confirmado") throw new TributarioS9Error("Pagamento anterior estornado; utilize uma nova operação fundamentada.");
    const guide = await confirmTaxPaymentInTransaction(tx, fullActor(actor), { guideId: input.guideId, amountPaid: input.amount, paymentDate: previous?.paymentDate ?? new Date(), paymentMethod: input.paymentMethod, idempotencyKey: input.idempotencyKey });
    const assessment = requiredDebtRow((await tx.select().from(taxAssessments).where(eq(taxAssessments.id, debt.assessmentId)).limit(1))[0]);
    const payments = (await readDebtPayments(tx, [debt.assessmentId])).map(row => row.payment);
    if (payments.some(payment => !payment.amountPaidDecimal)) throw new TributarioS9Error("Pagamento legado sem valor Decimal conciliado.");
    const total = assessment.finalValueDecimal ?? assessment.originalValueDecimal;
    if (!total) throw new TributarioS9Error("Dívida sem posição Decimal do lançamento original.");
    const paid = payments.reduce((sum, payment) => sum.plus(payment.amountPaidDecimal!), new Decimal(0)).plus(await taxAssessmentCompensatedValue(tx, assessment.id));
    const remaining = Decimal.max(0, total.minus(paid));
    const [updated] = await tx.update(taxActiveDebts).set({ status: remaining.isZero() ? "PAGA" : ["EM_PROTESTO", "AJUIZADA"].includes(debt.status) ? debt.status : "EM_COBRANCA", updatedValue: Number(remaining), updatedValueDecimal: remaining }).where(eq(taxActiveDebts.id, debt.id)).returning();
    if (!previous) await debtEvent(tx, actor, debt.id, "PAGAMENTO", `Baixa de R$ ${money(input.amount).toFixed(2)} pela guia ${guide.guideNumber ?? guide.id}.`, { guideId: guide.id, paymentKey: input.idempotencyKey, remaining: remaining.toFixed(2) });
    return updated;
  }, { timeoutMs: 60000 });
}

// Baixa manual justificada (TRI-361) e automática por prescrição (TRI-362).
async function extinguishDebt(tx: DatabaseTransaction, actor: Actor, debtId: string, reason: string, cause: "MANUAL" | "PRESCRIPTION") {
  const origin = await readDebt(tx, debtId);
  if (!origin.assessmentId) throw new TributarioS9Error("Extinção exige lançamento de origem conciliado; regularize a dívida manual antes da baixa.");
  await lockDebtOrigin(tx, debtId);
  await assertDebtAccess(tx, actor, debtId);
  const debt = await readDebt(tx, debtId);
  const assessment = requiredDebtRow((await tx.select().from(taxAssessments).where(eq(taxAssessments.id, origin.assessmentId)).limit(1))[0]);
  const key = `DA:${debtId}:EXTINCTION:${cause}`;
  const [previous] = await tx.select().from(taxIntegrationEvents).where(eq(taxIntegrationEvents.idempotencyKey, key)).limit(1);
  if (previous) {
    const payload = taxScopeSnapshot(previous.payload);
    if (payload.reason !== reason.trim() || payload.assessmentId !== assessment.id) throw new TributarioS9Error("Baixa da dívida já registrada com outros dados.");
    return debt;
  }
  if (!["INSCRITA", "Inscrita", "VALIDADA", "EM_COBRANCA", "EM_PROTESTO", "AJUIZADA"].includes(debt.status)) throw new TributarioS9Error("Dívida fora do estágio de extinção; concilie suspensão, parcelamento ou baixa anterior.");
  if ((await tx.select({ id: taxGuides.id }).from(taxGuides).where(and(eq(taxGuides.assessmentId, assessment.id), notInArray(taxGuides.status, ["Cancelada", "Paga"]))).limit(1)).length) throw new TributarioS9Error("Cancele as guias abertas antes da extinção da dívida.");
  const scope = await resolveTaxAssessmentScope(tx, fullActor(actor), assessment.taxId, assessment.calculationSnapshot);
  const date = new Date();
  const year = await resolveTaxFinancialYear(tx, date.getUTCFullYear(), scope);
  await assertAccountingPeriodOpen(tx, year.id, date);
  const payments = (await readDebtPayments(tx, [assessment.id])).map(row => row.payment);
  if (payments.some(payment => !payment.amountPaidDecimal)) throw new TributarioS9Error("Arrecadação histórica sem Decimal conciliado.");
  const extinguished = payments.reduce((sum, payment) => sum.plus(payment.amountPaidDecimal!), new Decimal(0)).plus(await taxAssessmentCompensatedValue(tx, assessment.id));
  const total = assessment.finalValueDecimal ?? assessment.originalValueDecimal;
  if (!total) throw new TributarioS9Error("Dívida sem valor Decimal do lançamento de origem.");
  const balance = total.minus(extinguished);
  if (balance.lte(0)) throw new TributarioS9Error("Dívida já extinta por pagamento ou compensação; não crie segunda extinção.");
  const transaction = await postTaxAssessmentAdjustment(tx, fullActor(actor), { assessmentId: assessment.id, date, delta: balance.negated(), kind: "EXTINCTION", idempotencyKey: `${key}:ACCOUNTING`, reason: reason.trim() });
  const entry = await insertDebtRegistry(tx, { entityType: "TAX_ASSESSMENT", entityId: assessment.id, category: "CREDIT_EVENT", title: cause === "MANUAL" ? "Extinção por baixa fundamentada da dívida" : "Extinção por prescrição da dívida", status: "ATIVO", source: "DIVIDA_ATIVA", actorUsuarioId: actor.usuarioId, data: { ...scope, eventType: "EXTINCAO_NAO_FINANCEIRA", cause, debtId, amount: balance.toFixed(2), oldValue: total.toFixed(2), newValue: extinguished.toFixed(2), reducesAssessmentValue: true, reason: reason.trim(), operationFinancialYearId: year.id, accountingTransactionId: transaction?.id ?? null } });
  await tx.update(taxAssessments).set({ finalValueDecimal: extinguished, status: "Extinto", calculationSnapshot: json({ ...taxScopeSnapshot(assessment.calculationSnapshot), currentValue: extinguished.toFixed(2), lastExtinctionKey: key }) }).where(eq(taxAssessments.id, assessment.id));
  const [updated] = await tx.update(taxActiveDebts).set({ status: cause === "MANUAL" ? "BAIXADA" : "BAIXADA_PRESCRICAO", updatedValue: 0, updatedValueDecimal: new Decimal(0) }).where(eq(taxActiveDebts.id, debtId)).returning();
  await tx.insert(taxIntegrationEvents).values({ integrationCode: "ACTIVE_DEBT", eventType: "EXTINCAO_NAO_FINANCEIRA", idempotencyKey: key, status: "PROCESSADO", evidenceLevel: "L1", taxpayerId: assessment.taxpayerId, payload: json({ debtId, assessmentId: assessment.id, cause, reason: reason.trim(), ...scope }), result: json({ registryEntryId: entry.id, accountingTransactionId: transaction?.id ?? null, extinguishedAmount: balance.toFixed(2) }), processedAt: date });
  await debtEvent(tx, actor, debtId, cause === "MANUAL" ? "BAIXA_MANUAL" : "BAIXA_PRESCRICAO", reason.trim(), { registryEntryId: entry.id, accountingTransactionId: transaction?.id ?? null, amount: balance.toFixed(2) });
  return updated;
}

export async function writeOffDebt(connection: DatabaseConnection, actor: Actor, input: { debtId: string; reason: string }) {
  if (!input.reason.trim()) throw new TributarioS9Error("A baixa manual exige justificativa.");
  return withDatabaseTransaction(connection, tx => extinguishDebt(tx, actor, input.debtId, input.reason, "MANUAL"), { timeoutMs: 60000 });
}

export async function runPrescription(connection: DatabaseConnection, actor: Actor, years = 5) {
  if (!Number.isInteger(years) || years < 1) throw new TributarioS9Error("Prazo prescricional inválido.");
  const limit = new Date();
  limit.setUTCFullYear(limit.getUTCFullYear() - years);
  const debts = await connection.db.select({ id: taxActiveDebts.id }).from(taxActiveDebts).where(and(inArray(taxActiveDebts.status, ["INSCRITA", "VALIDADA", "EM_COBRANCA"]), lt(taxActiveDebts.createdAt, limit), debtVisibility(actor.allowedBudgetUnitIds)));
  for (const row of debts) {
    await withDatabaseTransaction(connection, async (tx) => {
      await extinguishDebt(tx, actor, row.id, `Baixa por prazo prescricional parametrizado (${years} anos), sujeita à conferência municipal da exigibilidade.`, "PRESCRIPTION");
    }, { timeoutMs: 60000 });
  }
  return { count: debts.length, years };
}

// Livro de dívida ativa por exercício e origem (TRI-351) e relatórios gerenciais (TRI-365/403..407).
export async function daBook(db: DatabaseExecutor, year?: number, allowedBudgetUnitIds?: string[]) {
  const records = await db.select().from(taxActiveDebts).where(and(year ? eq(taxActiveDebts.year, year) : undefined, debtVisibility(allowedBudgetUnitIds))).orderBy(asc(taxActiveDebts.year), asc(taxActiveDebts.createdAt)).limit(500);
  const debts = await Promise.all(records.map(async row => ({ ...row, taxpayer: await readDebtTaxpayer(db, row.taxpayerId) })));
  return debts.map((row) => ({ id: row.id, year: row.year, cda: row.cdaNumber ?? "SEM CDA", origin: row.originDebtType, taxpayer: taxpayerName(row.taxpayer), original: Number(row.originalValueDecimal ?? row.originalValue), updated: Number(row.updatedValueDecimal ?? row.updatedValue), status: row.status }));
}

// S9-B — Protesto com status internos e retorno controlado (TRI-373..380/386).
export async function selectProtestCandidates(db: DatabaseExecutor, allowedBudgetUnitIds?: string[]) {
  const open = await db.select({ activeDebtId: protestItems.activeDebtId }).from(protestItems).where(inArray(protestItems.status, ["SELECIONADA", "REMESSA_PREPARADA", "EM_ACOMPANHAMENTO"]));
  const busy = new Set(open.map((row) => row.activeDebtId));
  const records = await db.select().from(taxActiveDebts).where(and(inArray(taxActiveDebts.status, ["INSCRITA", "EM_COBRANCA"]), isNotNull(taxActiveDebts.cdaNumber), debtVisibility(allowedBudgetUnitIds))).orderBy(desc(taxActiveDebts.createdAt)).limit(200);
  const debts = await Promise.all(records.map(async row => ({ ...row, taxpayer: await readDebtTaxpayer(db, row.taxpayerId) })));
  return debts.filter((row) => !busy.has(row.id)).map((row) => ({ id: row.id, cda: row.cdaNumber!, taxpayer: taxpayerName(row.taxpayer), value: Number(row.updatedValueDecimal ?? row.updatedValue), status: row.status }));
}

export async function createProtestBatch(connection: DatabaseConnection, actor: Actor, debtIds: string[]) {
  if (!debtIds.length) throw new TributarioS9Error("Selecione ao menos uma CDA.");
  return withDatabaseTransaction(connection, async (tx) => {
    await lockDebtRows(tx, debtIds);
    const records = await tx.select().from(taxActiveDebts).where(and(inArray(taxActiveDebts.id, debtIds), inArray(taxActiveDebts.status, ["INSCRITA", "EM_COBRANCA"]), isNotNull(taxActiveDebts.cdaNumber)));
    const debts = await Promise.all(records.map(async row => ({ ...row, taxpayer: await readDebtTaxpayer(tx, row.taxpayerId) })));
    if (debts.length !== debtIds.length) throw new TributarioS9Error("Somente CDAs inscritas participam da seleção.");
    const sequence = await nextSequence(tx, new Date().getUTCFullYear(), "PROTESTO");
    const batchNumber = `PROT-${new Date().getUTCFullYear()}-${String(sequence).padStart(5, "0")}`;
    for (const debt of debts) await assertDebtAccess(tx, actor, debt.id);
    const [batch] = await tx.insert(protestBatches).values({
        batchNumber, status: "PREPARADA", createdByUsuarioId: actor.usuarioId,
        fileContent: json({ batchNumber, generatedAt: new Date(), layout: "REMESSA_INTERNA_CONTROLADA", scope: "SEM_CONVENIO — retorno controlado, sem protesto efetivado presumido", items: debts.map((row) => ({ debtId: row.id, cda: row.cdaNumber, taxpayer: taxpayerName(row.taxpayer), document: taxpayerDocument(row.taxpayer), value: String(row.updatedValueDecimal ?? row.updatedValue) })) }),
    }).returning();
    const items = await tx.insert(protestItems).values(debts.map(row => ({ batchId: batch.id, activeDebtId: row.id, status: protestNext("SELECIONADA", "PREPARAR_REMESSA") }))).returning();
    for (const row of debts) {
      await tx.update(taxActiveDebts).set({ status: "EM_PROTESTO" }).where(eq(taxActiveDebts.id, row.id));
      await debtEvent(tx, actor, row.id, "PROTESTO", `CDA incluída na remessa interna ${batchNumber}.`, { batchId: batch.id });
    }
    return { ...batch, items };
  }, transactionDefaults);
}

export async function registerProtestReturn(connection: DatabaseConnection, actor: Actor, input: { batchId: string; returns: { itemId: string; code: string; message: string }[] }) {
  if (!input.returns.length) throw new TributarioS9Error("Informe ao menos um item para o retorno do protesto.");
  return withDatabaseTransaction(connection, async (tx) => {
    const batchItems = await tx.select().from(protestItems).where(eq(protestItems.batchId, input.batchId));
    await lockDebtRows(tx, batchItems.map(item => item.activeDebtId));
    await tx.select({ id: protestBatches.id }).from(protestBatches).where(eq(protestBatches.id, input.batchId)).for("update");
    if (actor.allowedBudgetUnitIds) {
      const items = batchItems;
      if (!items.length) throw new TributarioS9Error("Lote de protesto sem itens municipais conciliados.");
      for (const item of items) await assertDebtAccess(tx, actor, item.activeDebtId);
    }
    for (const row of input.returns) {
      const [item] = await tx.select().from(protestItems).where(and(eq(protestItems.id, row.itemId), eq(protestItems.batchId, input.batchId))).for("update");
      if (!item) throw new TributarioS9Error("Item de protesto não encontrado no lote.");
      const status = protestNext(item.status, "REGISTRAR_RETORNO");
      await tx.update(protestItems).set({ status, returnCode: row.code, returnMessage: row.message }).where(eq(protestItems.id, item.id));
      await debtEvent(tx, actor, item.activeDebtId, "PROTESTO", `Retorno controlado do cartório: ${row.code} — ${row.message}.`, { batchId: input.batchId, code: row.code });
    }
    const open = (await tx.select({ value: count() }).from(protestItems).where(and(eq(protestItems.batchId, input.batchId), eq(protestItems.status, "REMESSA_PREPARADA"))))[0].value;
    const batch = requiredDebtRow((await tx.update(protestBatches).set({ status: open ? "RETORNO_PARCIAL" : "RETORNO_TOTAL" }).where(eq(protestBatches.id, input.batchId)).returning())[0]);
    return { ...batch, items: await tx.select().from(protestItems).where(eq(protestItems.batchId, input.batchId)) };
  }, transactionDefaults);
}

export async function resolveProtestItem(connection: DatabaseConnection, actor: Actor, input: { itemId: string; action: "BAIXAR_PAGAMENTO" | "CANCELAR" | "ANUIR"; reason: string }) {
  if (!input.reason.trim()) throw new TributarioS9Error("Informe a justificativa.");
  return withDatabaseTransaction(connection, async (tx) => {
    const reference = requiredDebtRow((await tx.select({ activeDebtId: protestItems.activeDebtId }).from(protestItems).where(eq(protestItems.id, input.itemId)).limit(1))[0], "Item de protesto não encontrado.");
    await lockDebtOrigin(tx, reference.activeDebtId);
    await assertDebtAccess(tx, actor, reference.activeDebtId);
    const item = requiredDebtRow((await tx.select().from(protestItems).where(eq(protestItems.id, input.itemId)).for("update"))[0]);
    const status = protestNext(item.status, input.action === "BAIXAR_PAGAMENTO" ? "BAIXAR_PAGAMENTO" : input.action === "CANCELAR" ? "CANCELAR" : "ANUIR");
    const [updated] = await tx.update(protestItems).set({ status, resolvedAt: new Date(), consentIssuedAt: input.action === "ANUIR" ? new Date() : undefined }).where(eq(protestItems.id, item.id)).returning();
    if (input.action === "BAIXAR_PAGAMENTO") {
      const debt = await readDebt(tx, item.activeDebtId);
      if (!debt?.assessmentId) throw new TributarioS9Error("Baixa de protesto por pagamento exige lançamento e arrecadação nativa conciliados.");
      const assessment = requiredDebtRow((await tx.select().from(taxAssessments).where(eq(taxAssessments.id, debt.assessmentId)).limit(1))[0]);
      const payments = (await readDebtPayments(tx, [debt.assessmentId])).map(row => row.payment);
      if (payments.some(payment => !payment.amountPaidDecimal)) throw new TributarioS9Error("Arrecadação histórica sem Decimal conciliado.");
      const paid = payments.reduce((sum, payment) => sum.plus(payment.amountPaidDecimal!), new Decimal(0)).plus(await taxAssessmentCompensatedValue(tx, debt.assessmentId));
      const total = assessment.finalValueDecimal ?? assessment.originalValueDecimal;
      if (!total || total.lte(0) || paid.lt(total)) throw new TributarioS9Error("Receba ou compense integralmente a dívida pela origem financeira antes de baixar o protesto por pagamento.");
      await tx.update(taxActiveDebts).set({ status: "PAGA", updatedValue: 0, updatedValueDecimal: new Decimal(0) }).where(eq(taxActiveDebts.id, item.activeDebtId));
      if (debt.assessmentId) await tx.update(taxAssessments).set({ status: "Pago" }).where(eq(taxAssessments.id, debt.assessmentId));
      await debtEvent(tx, actor, item.activeDebtId, "PAGAMENTO", `Protesto baixado por pagamento: ${input.reason.trim()}.`, { itemId: item.id });
    } else if (input.action === "CANCELAR") {
      await tx.update(taxActiveDebts).set({ status: "INSCRITA" }).where(eq(taxActiveDebts.id, item.activeDebtId));
      await debtEvent(tx, actor, item.activeDebtId, "PROTESTO", `Protesto cancelado/desistido: ${input.reason.trim()}.`, { itemId: item.id });
    } else {
      await debtEvent(tx, actor, item.activeDebtId, "PROTESTO", `Carta de anuência emitida: ${input.reason.trim()}.`, { itemId: item.id, consent: true });
    }
    return updated;
  }, transactionDefaults);
}

// S9-C — Execução fiscal com protocolo interno (TRI-346/388..398). Sem TJES: sem processo oficial presumido.
export async function createExecutionBatch(connection: DatabaseConnection, actor: Actor, input: { debtIds: string[]; prosecutor: string }) {
  if (!input.prosecutor.trim()) throw new TributarioS9Error("Informe o procurador responsável.");
  if (!input.debtIds.length) throw new TributarioS9Error("Selecione ao menos uma CDA para o lote.");
  return withDatabaseTransaction(connection, async (tx) => {
    await lockDebtRows(tx, input.debtIds);
    const year = new Date().getUTCFullYear();
    const sequence = await nextSequence(tx, year, "EXECUCAO");
    const batchNumber = `EXEC-${year}-${String(sequence).padStart(5, "0")}`;
    const protocolSequence = await nextSequence(tx, year, "PROTOCOLO_EXECUCAO");
    const [batch] = await tx.insert(executionBatches).values({ batchNumber, internalProtocol: internalProtocol("EXEC", year, protocolSequence), prosecutor: input.prosecutor.trim(), createdByUsuarioId: actor.usuarioId }).returning();
    for (const debtId of input.debtIds) {
      await openExecutionCaseTx(tx, actor, { debtId, batchId: batch.id, prosecutor: input.prosecutor.trim(), attorneyReference: "", attachments: [] });
    }
    return { ...batch, cases: await tx.select().from(executionCases).where(eq(executionCases.batchId, batch.id)) };
  }, transactionDefaults);
}

async function openExecutionCaseTx(tx: DatabaseTransaction, actor: Actor, input: { debtId: string; batchId?: string; prosecutor: string; attorneyReference: string; attachments: unknown[] }) {
  // Batch caller has already acquired all origin locks in sorted order.
  if (!input.batchId) await lockDebtOrigin(tx, input.debtId);
  await assertDebtAccess(tx, actor, input.debtId);
  const record = await readDebt(tx, input.debtId);
  const debt = { ...record, taxpayer: await readDebtTaxpayer(tx, record.taxpayerId) };
  if (!debt?.cdaNumber) throw new TributarioS9Error("Somente CDA emitida segue para execução.");
  if (!["INSCRITA", "EM_COBRANCA", "EM_PROTESTO"].includes(debt.status)) throw new TributarioS9Error("Dívida fora do estágio de execução.");
  const year = new Date().getUTCFullYear();
  const sequence = await nextSequence(tx, year, "PROCESSO_EXECUCAO");
  const internalProtocolNumber = internalProtocol("EXEC", year, sequence);
  const snapshot = json({ debtId: debt.id, cda: debt.cdaNumber, taxpayer: taxpayerName(debt.taxpayer), value: String(debt.updatedValueDecimal ?? debt.updatedValue), prosecutor: input.prosecutor, attorneyReference: input.attorneyReference, attachments: input.attachments, scope: "PROTOCOLO_INTERNO" });
  const [executionCase] = await tx.insert(executionCases).values({ batchId: input.batchId || null, activeDebtId: debt.id, internalProtocol: internalProtocolNumber, prosecutor: input.prosecutor, attorneyReference: input.attorneyReference || null, attachments: json(input.attachments), caseSnapshot: snapshot, createdByUsuarioId: actor.usuarioId }).returning();
  await tx.insert(executionEvents).values({ caseId: executionCase.id, eventType: "ABERTURA", description: `Peças reunidas para ${input.prosecutor}. Protocolo interno ${internalProtocolNumber}.`, actorUsuarioId: actor.usuarioId });
  await tx.update(taxActiveDebts).set({ status: "AJUIZADA" }).where(eq(taxActiveDebts.id, debt.id));
  await debtEvent(tx, actor, debt.id, "EXECUCAO", `Execução aberta sob protocolo interno ${internalProtocolNumber}.`, { caseId: executionCase.id });
  return executionCase;
}

export async function openExecutionCase(connection: DatabaseConnection, actor: Actor, input: { debtId: string; prosecutor: string; attorneyReference?: string; attachments?: unknown[] }) {
  if (!input.prosecutor.trim()) throw new TributarioS9Error("Informe o procurador responsável.");
  return withDatabaseTransaction(connection, async (tx) => openExecutionCaseTx(tx, actor, { debtId: input.debtId, prosecutor: input.prosecutor.trim(), attorneyReference: input.attorneyReference?.trim() ?? "", attachments: input.attachments ?? [] }), transactionDefaults);
}

async function lockExecutionCase(tx: DatabaseTransaction, actor: Actor, id: string) {
  const origin = requiredDebtRow((await tx.select({ activeDebtId: executionCases.activeDebtId }).from(executionCases).where(eq(executionCases.id, id)).limit(1))[0], "Caso de execução não encontrado.");
  await lockDebtOrigin(tx, origin.activeDebtId);
  await assertDebtAccess(tx, actor, origin.activeDebtId);
  return requiredDebtRow((await tx.select().from(executionCases).where(eq(executionCases.id, id)).for("update"))[0]);
}

export async function advanceExecutionCase(connection: DatabaseConnection, actor: Actor, input: { caseId: string; action: "ENVIAR_PROCURADORIA" | "DEVOLVER" | "REGISTRAR_PROTOCOLO" | "ACOMPANHAR" | "REGISTRAR_RETORNO" | "REABRIR" | "ENCERRAR"; description: string }) {
  if (!input.description.trim()) throw new TributarioS9Error("Descreva o andamento.");
  return withDatabaseTransaction(connection, async (tx) => {
    const executionCase = await lockExecutionCase(tx, actor, input.caseId);
    const status = executionNext(executionCase.status, input.action);
    const [updated] = await tx.update(executionCases).set({ status }).where(eq(executionCases.id, executionCase.id)).returning();
    await tx.insert(executionEvents).values({ caseId: executionCase.id, eventType: input.action === "ENVIAR_PROCURADORIA" ? "ENVIO_PROCURADORIA" : input.action === "REGISTRAR_PROTOCOLO" ? "PROTOCOLO" : input.action === "REGISTRAR_RETORNO" ? "RETORNO" : input.action === "ENCERRAR" ? "ENCERRAMENTO" : "ANDAMENTO", description: input.description.trim(), actorUsuarioId: actor.usuarioId });
    await debtEvent(tx, actor, executionCase.activeDebtId, "EXECUCAO", input.description.trim(), { caseId: executionCase.id, status });
    return updated;
  }, transactionDefaults);
}

// MNI como registro interno controlado: sem credencial TJES, sem envio oficial presumido (TRI-389).
export async function registerMni(connection: DatabaseConnection, actor: Actor, caseId: string) {
  return withDatabaseTransaction(connection, async (tx) => {
    const executionCase = await lockExecutionCase(tx, actor, caseId);
    const status = executionNext(executionCase.status, "REGISTRAR_MNI");
    const year = new Date().getUTCFullYear();
    const sequence = await nextSequence(tx, year, "MNI");
    const [updated] = await tx.update(executionCases).set({ status, mniStatus: "MNI_REGISTRO_INTERNO" }).where(eq(executionCases.id, executionCase.id)).returning();
    await tx.insert(executionEvents).values({ caseId: executionCase.id, eventType: "MNI", description: `Registro MNI interno ${internalProtocol("MNI", year, sequence)}; adaptador interno, sem credencial TJES.`, payload: json({ adapter: "INTERNAL_ADAPTER", reference: internalProtocol("MNI", year, sequence) }), actorUsuarioId: actor.usuarioId });
    await debtEvent(tx, actor, executionCase.activeDebtId, "EXECUCAO", "Intercâmbio MNI registrado internamente.", { caseId });
    return updated;
  }, transactionDefaults);
}

export async function scheduleHearing(connection: DatabaseConnection, actor: Actor, input: { caseId: string; date: Date; notes?: string }) {
  return withDatabaseTransaction(connection, async (tx) => {
    await lockExecutionCase(tx, actor, input.caseId);
    const [updated] = await tx.update(executionCases).set({ nextHearingAt: input.date, hearingNotes: input.notes?.trim() || null }).where(eq(executionCases.id, input.caseId)).returning();
    await tx.insert(executionEvents).values({ caseId: input.caseId, eventType: "AUDIENCIA", description: `Agenda do procurador: ${input.date.toLocaleString("pt-BR")}${input.notes?.trim() ? ` — ${input.notes.trim()}` : ""}.`, actorUsuarioId: actor.usuarioId });
    return updated;
  }, transactionDefaults);
}

// S9-D — Cemitérios com taxas pelo motor tributário (TRI-408..436).
export async function createCemetery(connection: DatabaseConnection, input: { code: string; name: string; address?: string; phone?: string; wakePlace?: string; observations?: string }) {
  if (!input.code.trim() || !input.name.trim()) throw new TributarioS9Error("Código e nome do cemitério são obrigatórios.");
  return (await connection.db.insert(cemeteries).values({ code: input.code.trim().toUpperCase(), name: input.name.trim(), address: input.address?.trim() || null, phone: input.phone?.trim() || null, wakePlace: input.wakePlace?.trim() || null, observations: input.observations?.trim() || null }).returning())[0];
}

export async function createSector(connection: DatabaseConnection, input: { cemeteryId: string; parentId?: string; code: string; name: string }) {
  if (!input.code.trim() || !input.name.trim()) throw new TributarioS9Error("Código e nome do setor são obrigatórios.");
  return (await connection.db.insert(cemeterySectors).values({ cemeteryId: input.cemeteryId, parentId: input.parentId || null, code: input.code.trim().toUpperCase(), name: input.name.trim() }).returning())[0];
}

export async function createGrave(connection: DatabaseConnection, actor: Actor, input: { cemeteryId: string; sectorId?: string; lotId?: string; code: string; graveType: string; capacity?: number; ownerTaxpayerId?: string; additionalData?: Record<string, unknown>; notes?: string }) {
  if (!input.code.trim()) throw new TributarioS9Error("Identificação da sepultura é obrigatória.");
  if (!input.lotId) throw new TributarioS9Error("Vincule a sepultura a um lote.");
  if (!["COVA", "CARNEIRA", "GAVETA", "JAZIGO", "OSSARIO"].includes(input.graveType)) throw new TributarioS9Error("Tipo de sepultura inválido.");
  if (input.graveType === "GAVETA" && !input.ownerTaxpayerId) throw new TributarioS9Error("Lóculo exige proprietário do Cadastro Único.");
  const capacity = input.capacity ?? 1;
  if (!Number.isInteger(capacity) || capacity < 1) throw new TributarioS9Error("Capacidade inválida.");
  return withDatabaseTransaction(connection, async (tx) => {
    if (input.ownerTaxpayerId) await validateTaxpayer(tx, input.ownerTaxpayerId, "O proprietário do lóculo");
    if (input.lotId) {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${input.lotId}))`);
      await lockWorkflowRows(tx, "CemeteryLot", [input.lotId]);
      const [lot] = await tx.select().from(cemeteryLots).where(eq(cemeteryLots.id, input.lotId)).limit(1);
      if (!lot || lot.cemeteryId !== input.cemeteryId || !lot.active) throw new TributarioS9Error("Lote ativo não encontrado no cemitério informado.");
      const graveCount = (await tx.select({ value: count() }).from(cemeteryGraves).where(eq(cemeteryGraves.lotId, lot.id)))[0].value;
      assertLotCanReceiveGrave(graveCount, lot.graveLimit);
    }
    if (input.sectorId && !(await tx.select({ id: cemeterySectors.id }).from(cemeterySectors).where(and(eq(cemeterySectors.id, input.sectorId), eq(cemeterySectors.cemeteryId, input.cemeteryId))).limit(1)).length) throw new TributarioS9Error("Quadra fora do cemitério informado.");
    const additionalData = await validateCemeteryAdditionalData(tx, input.cemeteryId, "SEPULTURA", input.additionalData);
    const [grave] = await tx.insert(cemeteryGraves).values({ cemeteryId: input.cemeteryId, sectorId: input.sectorId || null, lotId: input.lotId || null, code: input.code.trim().toUpperCase(), graveType: input.graveType, capacity, ownerTaxpayerId: input.ownerTaxpayerId || null, additionalData, notes: input.notes?.trim() || null }).returning();
    await cemeteryHistory(tx, actor, "SEPULTURA", grave.id, "*", null, { code: grave.code, graveType: grave.graveType, capacity: grave.capacity, lotId: grave.lotId });
    return grave;
  }, transactionDefaults);
}

export async function registerEmployee(connection: DatabaseConnection, input: { cemeteryId: string; name: string; role: string; phone?: string }) {
  if (!input.name.trim() || !input.role.trim()) throw new TributarioS9Error("Nome e função são obrigatórios.");
  return (await connection.db.insert(cemeteryEmployees).values({ cemeteryId: input.cemeteryId, name: input.name.trim(), role: input.role.trim(), phone: input.phone?.trim() || null }).returning())[0];
}

export async function registerFuneralHome(connection: DatabaseConnection, input: { name: string; cnpj?: string; phone?: string; ownershipType?: "PUBLICA" | "PRIVADA" }) {
  if (!input.name.trim()) throw new TributarioS9Error("Nome da funerária é obrigatório.");
  return (await connection.db.insert(cemeteryFuneralHomes).values({ name: input.name.trim(), cnpj: input.cnpj?.trim() || null, phone: input.phone?.trim() || null, ownershipType: input.ownershipType ?? "PRIVADA" }).returning())[0];
}

export async function createDeathCause(connection: DatabaseConnection, input: { code: string; description: string }) {
  if (!input.code.trim() || !input.description.trim()) throw new TributarioS9Error("Código e descrição da causa são obrigatórios.");
  return (await connection.db.insert(cemeteryDeathCauses).values({ code: input.code.trim().toUpperCase(), description: input.description.trim() }).returning())[0];
}

export async function createCemeteryChapel(connection: DatabaseConnection, input: { cemeteryId: string; name: string; address?: string; personTaxpayerId?: string; responsibleTaxpayerId: string }) {
  const db = connection.db;
  if (!input.name.trim()) throw new TributarioS9Error("Nome da capela é obrigatório.");
  if (!input.personTaxpayerId) throw new TributarioS9Error("Pessoa vinculada à capela é obrigatória.");
  await validateTaxpayer(db, input.responsibleTaxpayerId, "O responsável pela capela");
  if (input.personTaxpayerId) await validateTaxpayer(db, input.personTaxpayerId, "A pessoa vinculada à capela");
  return (await db.insert(cemeteryChapels).values({ cemeteryId: input.cemeteryId, name: input.name.trim(), address: input.address?.trim() || null, personTaxpayerId: input.personTaxpayerId || null, responsibleTaxpayerId: input.responsibleTaxpayerId }).returning())[0];
}

export async function createCemeteryOssuary(connection: DatabaseConnection, input: { cemeteryId: string; code: string; address: string; ownerTaxpayerId?: string; capacity?: number }) {
  const db = connection.db;
  const capacity = input.capacity ?? 1;
  if (!input.code.trim() || !input.address.trim() || !Number.isInteger(capacity) || capacity < 1) throw new TributarioS9Error("Código, endereço e capacidade válida são obrigatórios para o ossuário.");
  if (input.ownerTaxpayerId) await validateTaxpayer(db, input.ownerTaxpayerId, "O proprietário do ossuário");
  return (await db.insert(cemeteryOssuaries).values({ cemeteryId: input.cemeteryId, code: input.code.trim().toUpperCase(), address: input.address.trim(), ownerTaxpayerId: input.ownerTaxpayerId || null, capacity }).returning())[0];
}

export async function createCemeteryIdentificationField(connection: DatabaseConnection, input: { cemeteryId: string; targetType: "LOTE" | "SEPULTURA"; fieldKey: string; label: string; valueType: "DESCRITIVO" | "NUMERICO"; required?: boolean }) {
  const fieldKey = input.fieldKey.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
  if (!fieldKey || !input.label.trim()) throw new TributarioS9Error("Chave e rótulo do campo são obrigatórios.");
  return (await connection.db.insert(cemeteryIdentificationFields).values({ cemeteryId: input.cemeteryId, targetType: input.targetType, fieldKey, label: input.label.trim(), valueType: input.valueType, required: input.required ?? false }).returning())[0];
}

export async function createCemeteryLot(connection: DatabaseConnection, actor: Actor, input: { cemeteryId: string; identifier: string; ownerTaxpayerId: string; graveLimit: number; additionalData?: Record<string, unknown> }) {
  if (!input.identifier.trim() || !Number.isInteger(input.graveLimit) || input.graveLimit < 1) throw new TributarioS9Error("Identificador e limite de sepulturas válido são obrigatórios.");
  const result = await withDatabaseTransaction(connection, async (tx) => {
    await validateTaxpayer(tx, input.ownerTaxpayerId, "O proprietário do lote");
    const additionalData = await validateCemeteryAdditionalData(tx, input.cemeteryId, "LOTE", input.additionalData);
    const [lot] = await tx.insert(cemeteryLots).values({ cemeteryId: input.cemeteryId, identifier: input.identifier.trim().toUpperCase(), ownerTaxpayerId: input.ownerTaxpayerId, graveLimit: input.graveLimit, additionalData }).returning();
    await cemeteryHistory(tx, actor, "LOTE", lot.id, "*", null, { identifier: lot.identifier, ownerTaxpayerId: lot.ownerTaxpayerId, graveLimit: lot.graveLimit });
    await recordCemeteryFeeEvent(tx, { eventType: "ACQUISICAO_LOTE", sourceType: "LOTE", sourceId: lot.id });
    return lot;
  }, transactionDefaults);
  await chargeRecordedCemeteryFees(connection, actor, "LOTE", result.id);
  return result;
}

export async function setCemeteryEntityActive(connection: DatabaseConnection, actor: Actor, input: { targetType: "LOTE" | "SEPULTURA"; targetId: string; active: boolean }) {
  return withDatabaseTransaction(connection, async (tx) => {
    if (input.targetType === "LOTE") {
      await lockWorkflowRows(tx, "CemeteryLot", [input.targetId]);
      const [current] = await tx.select().from(cemeteryLots).where(eq(cemeteryLots.id, input.targetId)).limit(1);
      if (!current) throw new TributarioS9Error("Lote não encontrado.");
      if (!input.active && (await tx.select({ id: cemeteryProcesses.id }).from(cemeteryProcesses).innerJoin(cemeteryGraves, eq(cemeteryGraves.id, cemeteryProcesses.graveId)).where(and(eq(cemeteryGraves.lotId, current.id), inArray(cemeteryProcesses.status, ["AGENDADO", "EM_REALIZACAO"]))).limit(1)).length) throw new TributarioS9Error("Lote possui atendimento pendente.");
      const [updated] = await tx.update(cemeteryLots).set({ active: input.active }).where(eq(cemeteryLots.id, current.id)).returning();
      await cemeteryHistory(tx, actor, "LOTE", current.id, "active", current.active, updated.active);
      return updated;
    }
    await lockWorkflowRows(tx, "TaxGrave", [input.targetId]);
    const [current] = await tx.select().from(cemeteryGraves).where(eq(cemeteryGraves.id, input.targetId)).limit(1);
    if (!current) throw new TributarioS9Error("Sepultura não encontrada.");
    if (!input.active && current.occupantCount > 0) throw new TributarioS9Error("Não é possível desativar uma sepultura ocupada.");
    if (!input.active && (await tx.select({ id: cemeteryProcesses.id }).from(cemeteryProcesses).where(and(eq(cemeteryProcesses.graveId, current.id), inArray(cemeteryProcesses.status, ["AGENDADO", "EM_REALIZACAO"]))).limit(1)).length) throw new TributarioS9Error("Sepultura possui atendimento pendente.");
    const [updated] = await tx.update(cemeteryGraves).set({ active: input.active }).where(eq(cemeteryGraves.id, current.id)).returning();
    await cemeteryHistory(tx, actor, "SEPULTURA", current.id, "active", current.active, updated.active);
    return updated;
  }, transactionDefaults);
}

const DEATH_GROUPS = ["falecido", "nascimento", "documentos", "endereco", "obito", "local", "medico", "causas", "funeraria", "sepultamento", "observacoes"];

export async function declarantDebtSnapshot(tx: DatabaseExecutor, taxpayerId: string): Promise<DeclarantDebtPosition> {
  const [assessments, activeDebts] = await Promise.all([
    tx.select({ assessment: taxAssessments }).from(taxAssessments).leftJoin(taxActiveDebts, eq(taxActiveDebts.assessmentId, taxAssessments.id)).where(and(eq(taxAssessments.taxpayerId, taxpayerId), inArray(taxAssessments.status, ["Lançado", "Emitido", "Parcial", "Dívida Ativa"]), isNull(taxActiveDebts.id))),
    tx.select().from(taxActiveDebts).where(and(eq(taxActiveDebts.taxpayerId, taxpayerId), notInArray(taxActiveDebts.status, ["PAGA", "Paga", "CANCELADA", "Cancelada", "BAIXADA", "BAIXADA_PRESCRICAO", "DEVOLVIDA"]))),
  ]);
  const ids = assessments.map(row => row.assessment.id);
  const [guides, payments] = await Promise.all([tx.select().from(taxGuides).where(inArray(taxGuides.assessmentId, ids)), readDebtPayments(tx, ids)]);
  const openAssessments = assessments.map(({ assessment: row }) => {
    const paid = payments.filter(payment => payment.assessmentId === row.id).reduce((total, row) => total.plus(row.payment.amountPaidDecimal ?? row.payment.amountPaid), new Decimal(0));
    const balance = guides.some(guide => guide.assessmentId === row.id && (guide.status === "Paga" || guide.status === "PAGA")) ? new Decimal(0) : money(row.finalValueDecimal ?? row.originalValueDecimal ?? row.originalValue).minus(paid);
    return { id: row.id, assessmentNumber: row.assessmentNumber, status: row.status, balance: balance.toFixed(2) };
  }).filter((row) => new Decimal(row.balance).greaterThan(0));
  const openDebts = activeDebts.map((row) => ({ id: row.id, cdaNumber: row.cdaNumber, status: row.status, balance: money(row.updatedValueDecimal ?? row.updatedValue).toFixed(2) })).filter((row) => new Decimal(row.balance).greaterThan(0));
  const total = [...openAssessments, ...openDebts].reduce((sum, row) => sum.plus(row.balance), new Decimal(0));
  return { checkedAt: new Date().toISOString(), hasDebt: total.greaterThan(0), total: total.toFixed(2), assessmentCount: openAssessments.length, activeDebtCount: openDebts.length, assessments: openAssessments, activeDebts: openDebts };
}

export { declarantDebtSnapshot as declarantDebtSnapshotExecutor };

async function applyDeceasedRegistryUpdate(tx: DatabaseTransaction, deceased: { deceasedTaxpayerId: string | null; deathDate: Date }) {
  if (!deceased.deceasedTaxpayerId) return;
  const taxpayer = await readDebtTaxpayer(tx, deceased.deceasedTaxpayerId);
  if (!taxpayer?.person) throw new TributarioS9Error("O cadastro único do falecido deve corresponder a uma pessoa física.");
  const fullName = /esp[oó]lio/i.test(taxpayer.person.fullName) ? taxpayer.person.fullName : `${taxpayer.person.fullName} - ESPÓLIO`;
  await tx.update(people).set({ fullName, deathDate: deceased.deathDate, estateApplied: true }).where(eq(people.id, taxpayer.person.id));
}

export async function registerDeceased(connection: DatabaseConnection, actor: Actor, input: {
  fullName: string; birthDate?: Date; deathDate: Date; deathTime?: string; gender?: string; document?: string; maritalStatus?: string; fatherName?: string; motherName?: string; address?: string;
  cemeteryId: string; graveId: string; funeralHomeId?: string; funeralHomeName?: string; causeId?: string; causeText?: string;
  doctorName: string; doctorCrm: string; groups?: Record<string, unknown>; taxpayerId?: string; deceasedTaxpayerId?: string; declarantTaxpayerId?: string; unidentified?: boolean;
  scheduledAt?: Date; burialType?: "MEMBRO" | "NORMAL" | "NAO_RECLAMADO" | "NATIMORTO"; chapelId?: string; finalizeNow?: boolean;
  exceptionReason?: string; memberOwnerDeceased?: boolean; requestKey?: string;
}) {
  if (!input.fullName.trim()) throw new TributarioS9Error("Nome do falecido é obrigatório.");
  if (!input.doctorName.trim() || !input.doctorCrm.trim()) throw new TributarioS9Error("Médico declarante com CRM é obrigatório.");
  validateWorkflowDate(input.deathDate, "Data do óbito");
  if (input.scheduledAt) validateWorkflowDate(input.scheduledAt, "Data do agendamento");
  if (input.birthDate && input.birthDate > input.deathDate) throw new TributarioS9Error("Nascimento posterior ao óbito.");
  const burialType = validateBurialIdentity(input);
  if (burialType === "NATIMORTO" && !input.motherName?.trim()) throw new TributarioS9Error("Informe o nome da mãe para o registro de natimorto.");
  if ((!input.funeralHomeId || !input.causeId || !input.chapelId) && !(input.unidentified && input.exceptionReason?.trim())) throw new TributarioS9Error("Funerária, causa do óbito e capela são obrigatórias; a exceção para não identificado exige motivo.");
  const result = await withDatabaseTransaction(connection, async (tx) => {
    const request = await workflowRequest(tx, "registerDeceased", input.requestKey, input);
    if (request.replayId) return requiredDebtRow((await tx.select().from(cemeteryDeceased).where(eq(cemeteryDeceased.id, request.replayId)).limit(1))[0]);
    await lockWorkflowRows(tx, "TaxGrave", [input.graveId]);
    const [grave] = await tx.select().from(cemeteryGraves).where(eq(cemeteryGraves.id, input.graveId)).limit(1);
    if (!grave || grave.cemeteryId !== input.cemeteryId) throw new TributarioS9Error("Sepultura fora do cemitério informado.");
    if (!grave.active || !graveHasVacancy(grave)) throw new TributarioS9Error("Sepultura sem vaga: inativa, ocupada, cheia ou interditada.");
    await lockWorkflowRows(tx, "CemeteryLot", [grave.lotId]);
    if (grave.lotId && !(await tx.select({ id: cemeteryLots.id }).from(cemeteryLots).where(and(eq(cemeteryLots.id, grave.lotId), eq(cemeteryLots.active, true))).limit(1)).length) throw new TributarioS9Error("O lote da sepultura está inativo.");
    const declarantTaxpayerId = input.declarantTaxpayerId || input.taxpayerId;
    let fullName = input.fullName.trim();
    if (!declarantTaxpayerId) throw new TributarioS9Error("O declarante responsável do Cadastro Único é obrigatório.");
    await validateTaxpayer(tx, declarantTaxpayerId, "O declarante responsável");
    if (input.deceasedTaxpayerId) await validateTaxpayer(tx, input.deceasedTaxpayerId, "O falecido");
    if (input.deceasedTaxpayerId) {
      await lockWorkflowRows(tx, "Taxpayer", [input.deceasedTaxpayerId]);
      const person = await readDebtTaxpayer(tx, input.deceasedTaxpayerId);
      if (!person?.personId) throw new TributarioS9Error("O cadastro vinculado deve ser pessoa física.");
      if (burialType !== "MEMBRO" && person.person) fullName = person.person.fullName;
      if (burialType !== "MEMBRO" && (await tx.select({ id: cemeteryDeceased.id }).from(cemeteryDeceased).where(and(eq(cemeteryDeceased.deceasedTaxpayerId, input.deceasedTaxpayerId), ne(cemeteryDeceased.status, "CANCELADO"), sql`EXISTS (SELECT 1 FROM "CemeteryProcess" p WHERE p."deceasedId"=${cemeteryDeceased.id} AND p."processType"='SEPULTAMENTO' AND (p."burialType"<>'MEMBRO' OR p."burialType" IS NULL))`)).limit(1)).length) throw new TributarioS9Error("Já existe registro funerário desta pessoa física. Utilize o processo existente.");
    }
    if (input.funeralHomeId && !(await tx.select({ id: cemeteryFuneralHomes.id }).from(cemeteryFuneralHomes).where(and(eq(cemeteryFuneralHomes.id, input.funeralHomeId), eq(cemeteryFuneralHomes.active, true))).limit(1)).length) throw new TributarioS9Error("Funerária ativa não encontrada.");
    if (input.causeId && !(await tx.select({ id: cemeteryDeathCauses.id }).from(cemeteryDeathCauses).where(eq(cemeteryDeathCauses.id, input.causeId)).limit(1)).length) throw new TributarioS9Error("Causa do óbito não encontrada.");
    if (input.chapelId && !(await tx.select({ id: cemeteryChapels.id }).from(cemeteryChapels).where(and(eq(cemeteryChapels.id, input.chapelId), eq(cemeteryChapels.cemeteryId, input.cemeteryId), eq(cemeteryChapels.active, true))).limit(1)).length) throw new TributarioS9Error("Capela ativa fora do cemitério informado.");
    const debtSnapshot = await declarantDebtSnapshot(tx, declarantTaxpayerId);
    const finalizeNow = input.finalizeNow ?? true;
    const groups = { ...(input.groups ?? {}) };
    for (const group of DEATH_GROUPS) if (groups[group] === undefined) groups[group] = null;
    const reusable = burialType !== "MEMBRO" && input.deceasedTaxpayerId ? (await tx.select().from(cemeteryDeceased).where(and(eq(cemeteryDeceased.deceasedTaxpayerId, input.deceasedTaxpayerId), eq(cemeteryDeceased.status, "REGISTRADO"), sql`NOT EXISTS (SELECT 1 FROM "CemeteryProcess" p WHERE p."deceasedId"=${cemeteryDeceased.id} AND p."processType"='SEPULTAMENTO')`)).limit(1))[0] : null;
    if (reusable && reusable.deathDate.toISOString().slice(0,10) !== input.deathDate.toISOString().slice(0,10)) throw new TributarioS9Error("Data do óbito diverge do registro funerário existente.");
    const deceasedData: typeof cemeteryDeceased.$inferInsert = {
        fullName, birthDate: input.birthDate || null, deathDate: input.deathDate, deathTime: input.deathTime || null, gender: input.gender || null, document: input.document || null,
        maritalStatus: input.maritalStatus || null, fatherName: input.fatherName || null, motherName: input.motherName || null, address: input.address || null,
        cemeteryId: input.cemeteryId, graveId: grave.id, funeralHomeId: input.funeralHomeId || null, funeralHomeName: input.funeralHomeName || null,
        causeId: input.causeId || null, causeText: input.causeText || null, doctorName: input.doctorName.trim(), doctorCrm: input.doctorCrm.trim(),
        groups: json({ ...groups, _version: "OBITO_11_GRUPOS_V1", _workflow: { burialType, exceptionReason: input.exceptionReason?.trim() || null, memberOwnerDeceased: input.memberOwnerDeceased === true } }), taxpayerId: input.taxpayerId || declarantTaxpayerId, deceasedTaxpayerId: input.deceasedTaxpayerId || null, declarantTaxpayerId, unidentified: input.unidentified ?? false, status: finalizeNow ? "SEPULTADO" : "AGENDADO", createdByUsuarioId: actor.usuarioId,
    };
    const deceased = requiredDebtRow((reusable ? await tx.update(cemeteryDeceased).set(deceasedData).where(eq(cemeteryDeceased.id, reusable.id)).returning() : await tx.insert(cemeteryDeceased).values(deceasedData).returning())[0]);
    const scheduledAt = input.scheduledAt ?? new Date();
    const [process] = await tx.insert(cemeteryProcesses).values({ receiptCode: code("AG-CEM"), processType: "SEPULTAMENTO", status: finalizeNow ? "SEPULTADO" : "AGENDADO", burialType: input.burialType ?? (input.unidentified ? "NAO_RECLAMADO" : "NORMAL"), deceasedId: deceased.id, cemeteryId: input.cemeteryId, graveId: grave.id, chapelId: input.chapelId || null, funeralHomeId: input.funeralHomeId || null, declarantTaxpayerId, declarantDebtSnapshot: json(debtSnapshot), scheduledAt, performedAt: finalizeNow ? scheduledAt : null, createdByUsuarioId: actor.usuarioId }).returning();
    if (finalizeNow) {
      const occupantCount = grave.occupantCount + 1;
      await tx.update(cemeteryGraves).set({ occupantCount, status: occupantCount >= grave.capacity ? "OCUPADA" : grave.status }).where(eq(cemeteryGraves.id, grave.id));
      await cemeteryHistory(tx, actor, "SEPULTURA", grave.id, "occupantCount", grave.occupantCount, occupantCount);
      if (occupantCount >= grave.capacity && grave.status !== "OCUPADA") await cemeteryHistory(tx, actor, "SEPULTURA", grave.id, "status", grave.status, "OCUPADA");
      await refreshCemeteryLotStatus(tx, actor, grave.lotId);
      await tx.insert(cemeteryMovements).values({ deceasedId: deceased.id, graveId: grave.id, toGraveId: grave.id, movementType: "SEPULTAMENTO", movementDate: scheduledAt, notes: "Sepultamento finalizado com vaga controlada.", createdByUsuarioId: actor.usuarioId });
      if (burialType !== "MEMBRO" || input.memberOwnerDeceased === true) await applyDeceasedRegistryUpdate(tx, deceased);
      await recordCemeteryFeeEvent(tx, { eventType: "SEPULTAMENTO", sourceType: "PROCESSO", sourceId: process.id });
    }
    await request.record(deceased.id, actor.usuarioId);
    return deceased;
  }, transactionDefaults);
  const processes = await connection.db.select({ id: cemeteryProcesses.id }).from(cemeteryProcesses).where(and(eq(cemeteryProcesses.deceasedId, result.id), eq(cemeteryProcesses.processType, "SEPULTAMENTO"), isNotNull(cemeteryProcesses.performedAt)));
  for (const process of processes) await chargeRecordedCemeteryFees(connection, actor, "PROCESSO", process.id);
  return result;
}

export async function registerMovement(connection: DatabaseConnection, actor: Actor, input: { deceasedId: string; graveId: string; toGraveId?: string; ossuaryId?: string; movementType: "OUTRO_LOTE" | "OSSUARIO" | "EXUMACAO" | "MUDANCA_CIDADE" | "MUDANCA_CEMITERIO" | "DESAPROPRIACAO" | "CREMACAO" | "OUTRO"; destinationDescription?: string; notes?: string; requestKey?: string }) {
  const result = await withDatabaseTransaction(connection, async (tx) => {
    const request = await workflowRequest(tx, "registerMovement", input.requestKey, input);
    if (request.replayId) return requiredDebtRow((await tx.select().from(cemeteryMovements).where(eq(cemeteryMovements.id, request.replayId)).limit(1))[0]);
    await lockWorkflowRows(tx, "TaxDeceased", [input.deceasedId]);
    const processes = await tx.select({ id: cemeteryProcesses.id }).from(cemeteryProcesses).where(and(eq(cemeteryProcesses.deceasedId, input.deceasedId), eq(cemeteryProcesses.processType, "SEPULTAMENTO")));
    await lockWorkflowRows(tx, "CemeteryProcess", processes.map(process => process.id));
    await lockWorkflowRows(tx, "TaxGrave", [input.graveId, input.toGraveId]);
    await lockWorkflowRows(tx, "CemeteryOssuary", [input.ossuaryId]);
    const [grave] = await tx.select().from(cemeteryGraves).where(eq(cemeteryGraves.id, input.graveId)).limit(1);
    if (!grave) throw new TributarioS9Error("Sepultura de origem não encontrada.");
    const [deceased] = await tx.select().from(cemeteryDeceased).where(eq(cemeteryDeceased.id, input.deceasedId)).limit(1);
    if (!deceased) throw new TributarioS9Error("Falecido não encontrado.");
    assertCemeteryTransferAllowed({ deceasedStatus: deceased.status, currentGraveId: deceased.graveId, originGraveId: grave.id });
    const destination = input.toGraveId ? (await tx.select().from(cemeteryGraves).where(eq(cemeteryGraves.id, input.toGraveId)).limit(1))[0] ?? null : null;
    validateTransferPair(input, grave, destination);
    if (input.toGraveId && !destination) throw new TributarioS9Error("Sepultura de destino não encontrada.");
    await lockWorkflowRows(tx, "CemeteryLot", [grave.lotId, destination?.lotId]);
    if (grave.occupantCount < 1) throw new TributarioS9Error("A sepultura de origem não possui ocupação a liberar.");
    if (input.movementType === "EXUMACAO") {
      const occupantCount = Math.max(0, grave.occupantCount - 1);
      await tx.update(cemeteryGraves).set({ occupantCount, status: occupantCount === 0 && grave.status === "OCUPADA" ? "LIVRE" : grave.status }).where(eq(cemeteryGraves.id, grave.id));
      await cemeteryHistory(tx, actor, "SEPULTURA", grave.id, "occupantCount", grave.occupantCount, occupantCount);
      await refreshCemeteryLotStatus(tx, actor, grave.lotId);
      await tx.update(cemeteryDeceased).set({ status: "EXUMADO", graveId: null }).where(eq(cemeteryDeceased.id, input.deceasedId));
      await tx.update(cemeteryProcesses).set({ status: "EXUMADO" }).where(and(eq(cemeteryProcesses.deceasedId, input.deceasedId), eq(cemeteryProcesses.processType, "SEPULTAMENTO"), eq(cemeteryProcesses.status, "SEPULTADO")));
      const [movement] = await tx.insert(cemeteryMovements).values({ deceasedId: input.deceasedId, graveId: grave.id, fromGraveId: grave.id, movementType: "EXUMACAO", destinationType: "EXUMACAO", destinationDescription: input.destinationDescription?.trim() || null, notes: input.notes?.trim() || null, createdByUsuarioId: actor.usuarioId }).returning();
      await recordCemeteryFeeEvent(tx, { eventType: movement.movementType, sourceType: "MOVIMENTO", sourceId: movement.id });
      await request.record(movement.id, actor.usuarioId);
      return movement;
    }
    const requiresInternalGrave = input.movementType === "OUTRO_LOTE";
    if (requiresInternalGrave && !input.toGraveId) throw new TributarioS9Error("A transferência para outro lote exige uma sepultura de destino.");
    const ossuary = input.ossuaryId ? (await tx.select().from(cemeteryOssuaries).where(eq(cemeteryOssuaries.id, input.ossuaryId)).limit(1))[0] : null;
    if (input.toGraveId && (!destination || !destination.active || !graveHasVacancy(destination))) throw new TributarioS9Error("Sepultura de destino inexistente, inativa ou sem vaga.");
    if (destination?.lotId && !(await tx.select({ id: cemeteryLots.id }).from(cemeteryLots).where(and(eq(cemeteryLots.id, destination.lotId), eq(cemeteryLots.active, true))).limit(1)).length) throw new TributarioS9Error("O lote de destino está inativo.");
    if (input.movementType === "OSSUARIO" && (!ossuary || !ossuary.active || ossuary.occupantCount >= ossuary.capacity)) throw new TributarioS9Error("Selecione um ossuário ativo com vaga.");
    if (ossuary && ossuary.cemeteryId !== grave.cemeteryId) throw new TributarioS9Error("O ossuário deve pertencer ao cemitério de origem.");
    if (!destination && !ossuary && !input.destinationDescription?.trim()) throw new TributarioS9Error("Descreva o destino da transferência.");
    const originCount = Math.max(0, grave.occupantCount - 1);
    await tx.update(cemeteryGraves).set({ occupantCount: originCount, status: originCount === 0 && grave.status === "OCUPADA" ? "LIVRE" : grave.status }).where(eq(cemeteryGraves.id, grave.id));
    await cemeteryHistory(tx, actor, "SEPULTURA", grave.id, "occupantCount", grave.occupantCount, originCount);
    if (destination) {
      const occupantCount = destination.occupantCount + 1;
      await tx.update(cemeteryGraves).set({ occupantCount, status: occupantCount >= destination.capacity ? "OCUPADA" : destination.status }).where(eq(cemeteryGraves.id, destination.id));
      await cemeteryHistory(tx, actor, "SEPULTURA", destination.id, "occupantCount", destination.occupantCount, occupantCount);
    }
    if (ossuary) await tx.update(cemeteryOssuaries).set({ occupantCount: sql`${cemeteryOssuaries.occupantCount}+1` }).where(eq(cemeteryOssuaries.id, ossuary.id));
    await refreshCemeteryLotStatus(tx, actor, grave.lotId);
    await refreshCemeteryLotStatus(tx, actor, destination?.lotId);
    const nextStatus = input.movementType === "CREMACAO" ? "CREMADO" : input.movementType === "DESAPROPRIACAO" ? "DESAPROPRIADO" : "TRANSFERIDO";
    await tx.update(cemeteryDeceased).set({ status: destination ? "SEPULTADO" : nextStatus, cemeteryId: destination?.cemeteryId ?? deceased.cemeteryId, graveId: destination?.id ?? null }).where(eq(cemeteryDeceased.id, input.deceasedId));
    await tx.update(cemeteryProcesses).set({ status: nextStatus }).where(and(eq(cemeteryProcesses.deceasedId, input.deceasedId), eq(cemeteryProcesses.processType, "SEPULTAMENTO"), eq(cemeteryProcesses.status, "SEPULTADO")));
    const [movement] = await tx.insert(cemeteryMovements).values({ deceasedId: input.deceasedId, graveId: destination?.id ?? grave.id, fromGraveId: grave.id, toGraveId: destination?.id ?? null, toOssuaryId: ossuary?.id ?? null, movementType: input.movementType, destinationType: input.movementType, destinationDescription: input.destinationDescription?.trim() || (ossuary ? `Ossuário ${ossuary.code}` : null), notes: input.notes?.trim() || null, createdByUsuarioId: actor.usuarioId }).returning();
    await recordCemeteryFeeEvent(tx, { eventType: movement.movementType, sourceType: "MOVIMENTO", sourceId: movement.id });
    await request.record(movement.id, actor.usuarioId);
    return movement;
  }, transactionDefaults);
  await chargeRecordedCemeteryFees(connection, actor, "MOVIMENTO", result.id);
  return result;
}

export async function createCemeteryProcess(connection: DatabaseConnection, actor: Actor, input: { processType: "VELORIO" | "CREMACAO"; deceasedId: string; cemeteryId?: string; chapelId?: string; funeralHomeId?: string; declarantTaxpayerId: string; scheduledAt: Date; notes?: string; requestKey?: string; deceasedTaxpayerId?: string; deathDate?: Date; causeId?: string; doctorName?: string; doctorCrm?: string }) {
  validateWorkflowDate(input.scheduledAt, "Data do agendamento");
  if (!["VELORIO", "CREMACAO"].includes(input.processType)) throw new TributarioS9Error("Tipo de processo inválido.");
  return withDatabaseTransaction(connection, async (tx) => {
    const request = await workflowRequest(tx, "createCemeteryProcess", input.requestKey, input);
    if (request.replayId) return requiredDebtRow((await tx.select().from(cemeteryProcesses).where(eq(cemeteryProcesses.id, request.replayId)).limit(1))[0]);
    await lockWorkflowRows(tx, "TaxDeceased", [input.deceasedId]);
    let deceased = input.deceasedId ? (await tx.select().from(cemeteryDeceased).where(eq(cemeteryDeceased.id, input.deceasedId)).limit(1))[0] : null;
    if (!input.deceasedId) {
      if (!input.deceasedTaxpayerId || !input.deathDate || !input.causeId || !input.cemeteryId || !input.doctorName?.trim() || !input.doctorCrm?.trim()) throw new TributarioS9Error("Informe pessoa física, data do óbito, causa, cemitério e médico/CRM para o novo registro funerário.");
      validateWorkflowDate(input.deathDate, "Data do óbito");
      await lockWorkflowRows(tx, "Taxpayer", [input.deceasedTaxpayerId]);
      const taxpayer = await readDebtTaxpayer(tx, input.deceasedTaxpayerId);
      if (!taxpayer?.person || taxpayer.status !== "Ativo") throw new TributarioS9Error("Pessoa física ativa do Cadastro Único é obrigatória.");
      deceased = (await tx.select().from(cemeteryDeceased).where(and(eq(cemeteryDeceased.deceasedTaxpayerId, taxpayer.id), ne(cemeteryDeceased.status, "CANCELADO"), or(sql`${cemeteryDeceased.groups}#>'{_workflow,burialType}'='"NORMAL"'::jsonb`, sql`EXISTS (SELECT 1 FROM "CemeteryProcess" p WHERE p."deceasedId"=${cemeteryDeceased.id} AND p."burialType"='NORMAL')`))).limit(1))[0];
      if (deceased && deceased.deathDate.toISOString().slice(0,10) !== input.deathDate.toISOString().slice(0,10)) throw new TributarioS9Error("Data do óbito diverge do registro existente.");
      if (!deceased) [deceased] = await tx.insert(cemeteryDeceased).values({ fullName: taxpayer.person.fullName, birthDate: taxpayer.person.birthDate, deathDate: input.deathDate, cemeteryId: input.cemeteryId, deceasedTaxpayerId: taxpayer.id, declarantTaxpayerId: input.declarantTaxpayerId, taxpayerId: input.declarantTaxpayerId, causeId: input.causeId, funeralHomeId: input.funeralHomeId || null, doctorName: input.doctorName.trim(), doctorCrm: input.doctorCrm.trim(), status: "REGISTRADO", groups: json({ ...Object.fromEntries(DEATH_GROUPS.map(g => [g, null])), _version: "OBITO_11_GRUPOS_V1", _workflow: { burialType: "NORMAL" } }), createdByUsuarioId: actor.usuarioId }).returning();
    }
    if (!deceased) throw new TributarioS9Error("Falecido não encontrado.");
    if (["CREMADO", "EXUMADO", "DESAPROPRIADO", "TRANSFERIDO"].includes(deceased.status)) throw new TributarioS9Error("Falecido não disponível para novo processo.");
    const metadata = (deceased.groups as { _workflow?: { burialType?: string; exceptionReason?: string } })._workflow;
    if (metadata?.burialType === "MEMBRO") throw new TributarioS9Error("Velório e cremação de pessoa exigem registro de falecido, não de membro.");
    if (!deceased.causeId && !(deceased.unidentified && metadata?.exceptionReason?.trim())) throw new TributarioS9Error("Causa do óbito obrigatória para o processo funerário.");
    if ((await tx.select({ id: cemeteryProcesses.id }).from(cemeteryProcesses).where(and(eq(cemeteryProcesses.deceasedId, deceased.id), eq(cemeteryProcesses.processType, input.processType), inArray(cemeteryProcesses.status, ["AGENDADO", "EM_REALIZACAO"]))).limit(1)).length) throw new TributarioS9Error("Já existe processo deste tipo em aberto.");
    const cemeteryId = input.cemeteryId || deceased.cemeteryId;
    if (input.chapelId && !(await tx.select({ id: cemeteryChapels.id }).from(cemeteryChapels).where(and(eq(cemeteryChapels.id, input.chapelId), eq(cemeteryChapels.cemeteryId, cemeteryId), eq(cemeteryChapels.active, true))).limit(1)).length) throw new TributarioS9Error("Capela ativa fora do cemitério informado.");
    if (input.processType === "VELORIO" && !input.chapelId) throw new TributarioS9Error("Velório exige capela.");
    const funeralHomeId = input.funeralHomeId || deceased.funeralHomeId;
    if (!funeralHomeId || !(await tx.select({ id: cemeteryFuneralHomes.id }).from(cemeteryFuneralHomes).where(and(eq(cemeteryFuneralHomes.id, funeralHomeId), eq(cemeteryFuneralHomes.active, true))).limit(1)).length) throw new TributarioS9Error("Funerária ativa é obrigatória.");
    await validateTaxpayer(tx, input.declarantTaxpayerId, "O declarante responsável");
    const debtSnapshot = await declarantDebtSnapshot(tx, input.declarantTaxpayerId);
    const [process] = await tx.insert(cemeteryProcesses).values({ receiptCode: code(input.processType === "VELORIO" ? "VEL" : "CRE"), processType: input.processType, status: "AGENDADO", deceasedId: deceased.id, cemeteryId, chapelId: input.chapelId || null, funeralHomeId, declarantTaxpayerId: input.declarantTaxpayerId, declarantDebtSnapshot: json(debtSnapshot), scheduledAt: input.scheduledAt, notes: input.notes?.trim() || null, createdByUsuarioId: actor.usuarioId }).returning();
    await request.record(process.id, actor.usuarioId);
    return process;
  }, transactionDefaults);
}

export async function advanceCemeteryProcess(connection: DatabaseConnection, actor: Actor, input: { processId: string; status: "EM_REALIZACAO" | "SEPULTADO" | "CREMADO" | "ENCERRADO" | "CANCELADO"; requestKey?: string }) {
  const result = await withDatabaseTransaction(connection, async (tx) => {
    const request = await workflowRequest(tx, "advanceCemeteryProcess", input.requestKey, input);
    if (request.replayId) return requiredDebtRow((await tx.select().from(cemeteryProcesses).where(eq(cemeteryProcesses.id, request.replayId)).limit(1))[0]);
    const [reference] = await tx.select({ deceasedId: cemeteryProcesses.deceasedId }).from(cemeteryProcesses).where(eq(cemeteryProcesses.id, input.processId)).limit(1);
    if (!reference) throw new TributarioS9Error("Processo funerário não encontrado.");
    await lockWorkflowRows(tx, "TaxDeceased", [reference.deceasedId]);
    await lockWorkflowRows(tx, "CemeteryProcess", [input.processId]);
    const location = requiredDebtRow((await tx.select().from(cemeteryDeceased).where(eq(cemeteryDeceased.id, reference.deceasedId)).limit(1))[0]);
    const scheduled = requiredDebtRow((await tx.select().from(cemeteryProcesses).where(eq(cemeteryProcesses.id, input.processId)).limit(1))[0]);
    await lockWorkflowRows(tx, "TaxGrave", [scheduled.graveId, location.status === "SEPULTADO" ? location.graveId : null]);
    const [row] = await tx.select({ process: cemeteryProcesses, deceased: cemeteryDeceased, grave: cemeteryGraves }).from(cemeteryProcesses).innerJoin(cemeteryDeceased, eq(cemeteryDeceased.id, cemeteryProcesses.deceasedId)).leftJoin(cemeteryGraves, eq(cemeteryGraves.id, cemeteryProcesses.graveId)).where(eq(cemeteryProcesses.id, input.processId)).limit(1);
    if (!row) throw new TributarioS9Error("Processo funerário não encontrado.");
    const process = { ...row.process, deceased: row.deceased, grave: row.grave };
    if (!["AGENDADO", "EM_REALIZACAO"].includes(process.status)) throw new TributarioS9Error("O processo não está disponível para esta transição.");
    if (!["EM_REALIZACAO", "SEPULTADO", "CREMADO", "ENCERRADO", "CANCELADO"].includes(input.status) || (input.status === "EM_REALIZACAO" && process.status !== "AGENDADO")) throw new TributarioS9Error("Transição inválida.");
    if (input.status === "ENCERRADO" && process.processType !== "VELORIO") throw new TributarioS9Error("Somente velório pode ser encerrado.");
    if (input.status === "SEPULTADO") {
      if (process.processType !== "SEPULTAMENTO" || !process.grave || !process.grave.active || !graveHasVacancy(process.grave)) throw new TributarioS9Error("O sepultamento não possui uma sepultura ativa com vaga.");
      if (!["AGENDADO", "EM_REALIZACAO"].includes(process.deceased.status)) throw new TributarioS9Error("A pessoa não está disponível para sepultamento.");
      const metadata = (process.deceased.groups as { _workflow?: { exceptionReason?: string; memberOwnerDeceased?: boolean } })._workflow;
      validateBurialIdentity({ burialType: process.burialType, unidentified: process.deceased.unidentified, deceasedTaxpayerId: process.deceased.deceasedTaxpayerId, exceptionReason: metadata?.exceptionReason });
      const exception = process.deceased.unidentified && metadata?.exceptionReason?.trim();
      if ((!process.funeralHomeId || !process.deceased.causeId || !process.chapelId) && !exception) throw new TributarioS9Error("Funerária, causa do óbito e capela são obrigatórias para finalizar.");
      if (process.funeralHomeId && !(await tx.select({ id: cemeteryFuneralHomes.id }).from(cemeteryFuneralHomes).where(and(eq(cemeteryFuneralHomes.id, process.funeralHomeId), eq(cemeteryFuneralHomes.active, true))).limit(1)).length) throw new TributarioS9Error("Funerária inativa.");
      if (process.chapelId && !(await tx.select({ id: cemeteryChapels.id }).from(cemeteryChapels).where(and(eq(cemeteryChapels.id, process.chapelId), eq(cemeteryChapels.cemeteryId, process.cemeteryId ?? process.deceased.cemeteryId), eq(cemeteryChapels.active, true))).limit(1)).length) throw new TributarioS9Error("Capela inativa ou fora do cemitério.");
      if (process.grave.lotId && !(await tx.select({ id: cemeteryLots.id }).from(cemeteryLots).where(and(eq(cemeteryLots.id, process.grave.lotId), eq(cemeteryLots.active, true))).limit(1)).length) throw new TributarioS9Error("O lote da sepultura está inativo.");
      const occupantCount = process.grave.occupantCount + 1;
      await tx.update(cemeteryGraves).set({ occupantCount, status: occupantCount >= process.grave.capacity ? "OCUPADA" : process.grave.status }).where(eq(cemeteryGraves.id, process.grave.id));
      await cemeteryHistory(tx, actor, "SEPULTURA", process.grave.id, "occupantCount", process.grave.occupantCount, occupantCount);
      await refreshCemeteryLotStatus(tx, actor, process.grave.lotId);
      await tx.update(cemeteryDeceased).set({ status: "SEPULTADO", graveId: process.grave.id }).where(eq(cemeteryDeceased.id, process.deceasedId));
      await tx.insert(cemeteryMovements).values({ deceasedId: process.deceasedId, graveId: process.grave.id, toGraveId: process.grave.id, movementType: "SEPULTAMENTO", movementDate: new Date(), notes: `Finalização do agendamento ${process.receiptCode}.`, createdByUsuarioId: actor.usuarioId });
      if (process.burialType !== "MEMBRO" || metadata?.memberOwnerDeceased === true) await applyDeceasedRegistryUpdate(tx, process.deceased);
    }
    if (input.status === "CREMADO") {
      if (process.processType !== "CREMACAO") throw new TributarioS9Error("Somente processos de cremação podem ser finalizados como cremados.");
      if (["CREMADO", "EXUMADO", "TRANSFERIDO", "DESAPROPRIADO"].includes(process.deceased.status)) throw new TributarioS9Error("A pessoa não está disponível para cremação.");
      const metadata = (process.deceased.groups as { _workflow?: { burialType?: string; exceptionReason?: string; memberOwnerDeceased?: boolean } })._workflow;
      validateBurialIdentity({ burialType: metadata?.burialType, unidentified: process.deceased.unidentified, deceasedTaxpayerId: process.deceased.deceasedTaxpayerId, exceptionReason: metadata?.exceptionReason });
      if (!process.funeralHomeId || !(await tx.select({ id: cemeteryFuneralHomes.id }).from(cemeteryFuneralHomes).where(and(eq(cemeteryFuneralHomes.id, process.funeralHomeId), eq(cemeteryFuneralHomes.active, true))).limit(1)).length) throw new TributarioS9Error("Funerária ativa obrigatória para finalizar cremação.");
      if (!process.deceased.causeId && !(process.deceased.unidentified && metadata?.exceptionReason?.trim())) throw new TributarioS9Error("Causa do óbito obrigatória para finalizar cremação.");
      if (process.deceased.status === "SEPULTADO" && process.deceased.graveId) {
        const [origin] = await tx.select().from(cemeteryGraves).where(eq(cemeteryGraves.id, process.deceased.graveId)).limit(1);
        if (origin) {
          if (origin.occupantCount < 1) throw new TributarioS9Error("A sepultura de origem não possui ocupação a liberar.");
          const occupantCount = Math.max(0, origin.occupantCount - 1);
          await tx.update(cemeteryGraves).set({ occupantCount, status: occupantCount === 0 && origin.status === "OCUPADA" ? "LIVRE" : origin.status }).where(eq(cemeteryGraves.id, origin.id));
          await cemeteryHistory(tx, actor, "SEPULTURA", origin.id, "occupantCount", origin.occupantCount, occupantCount);
          await refreshCemeteryLotStatus(tx, actor, origin.lotId);
          await tx.insert(cemeteryMovements).values({ deceasedId: process.deceasedId, graveId: origin.id, fromGraveId: origin.id, movementType: "CREMACAO", destinationType: "CREMACAO", notes: `Cremação finalizada no processo ${process.receiptCode}.`, createdByUsuarioId: actor.usuarioId });
        }
      }
      await tx.update(cemeteryDeceased).set({ status: "CREMADO", graveId: null }).where(eq(cemeteryDeceased.id, process.deceasedId));
      await tx.update(cemeteryProcesses).set({ status: "CANCELADO" }).where(and(eq(cemeteryProcesses.deceasedId, process.deceasedId), eq(cemeteryProcesses.processType, "SEPULTAMENTO"), inArray(cemeteryProcesses.status, ["AGENDADO", "EM_REALIZACAO"])));
      await tx.update(cemeteryProcesses).set({ status: "CREMADO" }).where(and(eq(cemeteryProcesses.deceasedId, process.deceasedId), eq(cemeteryProcesses.processType, "SEPULTAMENTO"), eq(cemeteryProcesses.status, "SEPULTADO")));
      if (metadata?.burialType !== "MEMBRO" || metadata?.memberOwnerDeceased === true) await applyDeceasedRegistryUpdate(tx, process.deceased);
    }
    if (input.status === "CANCELADO" && process.processType === "SEPULTAMENTO" && process.deceased.status === "AGENDADO") await tx.update(cemeteryDeceased).set({ status: "CANCELADO", graveId: null }).where(eq(cemeteryDeceased.id, process.deceasedId));
    const [updated] = await tx.update(cemeteryProcesses).set({ status: input.status, performedAt: ["SEPULTADO", "CREMADO", "ENCERRADO"].includes(input.status) ? new Date() : undefined }).where(eq(cemeteryProcesses.id, process.id)).returning();
    if (["SEPULTADO", "CREMADO", "ENCERRADO"].includes(input.status)) await recordCemeteryFeeEvent(tx, { eventType: updated.processType, sourceType: "PROCESSO", sourceId: updated.id });
    await request.record(updated.id, actor.usuarioId);
    return updated;
  }, transactionDefaults);
  await chargeRecordedCemeteryFees(connection, actor, "PROCESSO", result.id);
  return result;
}

export async function attachCemeteryDocument(connection: DatabaseConnection, actor: Actor, input: { targetType: "LOTE" | "SEPULTURA" | "SEPULTAMENTO" | "VELORIO" | "CREMACAO"; targetId: string; documentId: string }) {
  const db = connection.db;
  const [document] = await db.select({ id: documents.id }).from(documents).where(eq(documents.id, input.documentId)).limit(1);
  if (!document) throw new TributarioS9Error("Documento GED não encontrado.");
  const exists = (input.targetType === "LOTE" ? await db.select({ id: cemeteryLots.id }).from(cemeteryLots).where(eq(cemeteryLots.id, input.targetId)).limit(1) : input.targetType === "SEPULTURA" ? await db.select({ id: cemeteryGraves.id }).from(cemeteryGraves).where(eq(cemeteryGraves.id, input.targetId)).limit(1) : await db.select({ id: cemeteryProcesses.id }).from(cemeteryProcesses).where(and(eq(cemeteryProcesses.id, input.targetId), eq(cemeteryProcesses.processType, input.targetType))).limit(1)).length;
  if (!exists) throw new TributarioS9Error("Registro de destino do anexo não encontrado.");
  return (await db.insert(cemeteryAttachments).values({ targetType: input.targetType, targetId: input.targetId, documentId: input.documentId, createdByUsuarioId: actor.usuarioId }).returning())[0];
}

export async function createCemeteryFeeRule(connection: DatabaseConnection, input: { cemeteryId?: string; eventType: string; label: string; formula: "VALOR_FIXO" | "BASE_X_QUANTIDADE"; baseAmount: number; validFrom?: Date }) {
  const baseAmount = money(input.baseAmount);
  if (!input.eventType.trim() || !input.label.trim() || baseAmount.lessThanOrEqualTo(0)) throw new TributarioS9Error("Evento, descrição e valor-base positivo são obrigatórios.");
  return (await connection.db.insert(cemeteryFeeRules).values({ cemeteryId: input.cemeteryId || null, eventType: input.eventType.trim().toUpperCase(), label: input.label.trim(), formula: input.formula, baseAmount, validFrom: input.validFrom ?? new Date() }).returning())[0];
}

export async function grantConcession(connection: DatabaseConnection, actor: Actor, input: { graveId: string; holderName: string; taxpayerId?: string; concessionType: "TEMPORARIA" | "INDETERMINADA"; endsAt?: Date }) {
  if (!input.holderName.trim()) throw new TributarioS9Error("Titular da concessão é obrigatório.");
  if (input.concessionType === "TEMPORARIA" && !input.endsAt) throw new TributarioS9Error("Concessão temporária exige término.");
  return (await connection.db.insert(cemeteryConcessions).values({ graveId: input.graveId, holderName: input.holderName.trim(), taxpayerId: input.taxpayerId || null, concessionType: input.concessionType, endsAt: input.endsAt || null, createdByUsuarioId: actor.usuarioId }).returning())[0];
}

// Guia da taxa de sepultamento/exumação/movimentação pelo motor tributário (TRI-426/427/430).
export async function issueCemeteryFee(connection: DatabaseConnection, actor: Actor, input: { taxpayerId: string; amount?: number; dueDate: Date; movementId?: string; concessionId?: string; feeRuleId?: string; quantity?: number; label?: string }) {
  validateWorkflowDate(input.dueDate, "Vencimento");
  if (input.movementId && input.concessionId) throw new TributarioS9Error("Vincule apenas um fato gerador à taxa.");
  const rule = input.feeRuleId ? (await connection.db.select().from(cemeteryFeeRules).where(eq(cemeteryFeeRules.id, input.feeRuleId)).limit(1))[0] : null;
  if (input.feeRuleId && (!rule || !rule.active || rule.validFrom > new Date() || (rule.validUntil && rule.validUntil < new Date()))) throw new TributarioS9Error("A fórmula de taxa selecionada não está vigente.");
  if (!rule && input.amount === undefined) throw new TributarioS9Error("Informe o valor ou selecione uma fórmula de taxa.");
  const fee = rule ? cemeteryFeeAmount({ formula: rule.formula === "BASE_X_QUANTIDADE" ? "BASE_X_QUANTIDADE" : "VALOR_FIXO", baseAmount: rule.baseAmount, quantity: input.quantity }) : money(input.amount!);
  if (fee.lessThanOrEqualTo(0)) throw new TributarioS9Error("Valor da taxa inválido.");
  return withDatabaseTransaction(connection, async tx => {
    let previousAssessmentId: string | null = null;
    if (input.movementId || input.concessionId) {
      const sourceType = input.movementId ? "MOVIMENTO" : "CONCESSAO";
      const sourceId = (input.movementId || input.concessionId)!;
      await lockWorkflowRows(tx, input.movementId ? "TaxBurialMovement" : "TaxGraveConcession", [sourceId]);
      const movement = input.movementId ? (await tx.select({ movement: cemeteryMovements, deceased: cemeteryDeceased }).from(cemeteryMovements).leftJoin(cemeteryDeceased, eq(cemeteryDeceased.id, cemeteryMovements.deceasedId)).where(eq(cemeteryMovements.id, sourceId)).limit(1))[0] : null;
      const source = input.movementId ? movement ? { ...movement.movement, deceased: movement.deceased } : null : (await tx.select().from(cemeteryConcessions).where(eq(cemeteryConcessions.id, sourceId)).limit(1))[0];
      if (!source) throw new TributarioS9Error("Fato gerador da taxa não encontrado.");
      if ("movementType" in source && source.movementType === "SEPULTAMENTO") throw new TributarioS9Error("Emita a taxa pelo evento único do processo de sepultamento.");
      const taxpayerId = "deceased" in source ? source.deceased?.declarantTaxpayerId ?? source.deceased?.taxpayerId : source.taxpayerId;
      if (taxpayerId && taxpayerId !== input.taxpayerId) throw new TributarioS9Error("O contribuinte não corresponde ao fato gerador.");
      const [automatic] = await tx.select().from(cemeteryFeeEvents).where(and(eq(cemeteryFeeEvents.sourceType, sourceType), eq(cemeteryFeeEvents.sourceId, sourceId))).limit(1);
      if (automatic && !automatic.assessmentId) throw new TributarioS9Error("Reprocesse o evento automático na área de taxas; não crie cobrança paralela.");
      previousAssessmentId = automatic?.assessmentId ?? source.feeAssessmentId;
    }
    if (previousAssessmentId) {
      const assessment = requiredDebtRow((await tx.select().from(taxAssessments).where(eq(taxAssessments.id, previousAssessmentId)).limit(1))[0]);
      const guide = requiredDebtRow((await tx.select().from(taxGuides).where(and(eq(taxGuides.assessmentId, assessment.id), ne(taxGuides.status, "Cancelada"))).limit(1))[0]);
      if (assessment.taxpayerId !== input.taxpayerId || !money(assessment.finalValueDecimal ?? assessment.originalValue).eq(fee)) throw new TributarioS9Error("O fato gerador já possui cobrança com outros dados.");
      return { assessment, guide };
    }
    const [tax] = await tx.select().from(taxes).where(and(eq(taxes.name, "Taxa de Sepultamento"), eq(taxes.isActive, true))).limit(1);
    if (!tax) throw new TributarioS9Error("Cadastre a Taxa de Sepultamento antes de emitir a guia.");
    const year = input.dueDate.getUTCFullYear();
    const assessment = await createTaxAssessmentInTransaction(tx, fullActor(actor), { year, taxId: tax.id, taxpayerId: input.taxpayerId, taxableBase: fee, rate: 100, competence: new Date() });
    const guide = await generateTaxGuideInTransaction(tx, fullActor(actor), { assessmentId: assessment.id, dueDate: input.dueDate });
    if (input.movementId) await tx.update(cemeteryMovements).set({ feeAssessmentId: assessment.id }).where(eq(cemeteryMovements.id, input.movementId));
    if (input.concessionId) await tx.update(cemeteryConcessions).set({ feeAssessmentId: assessment.id }).where(eq(cemeteryConcessions.id, input.concessionId));
    return { assessment, guide };
  }, { timeoutMs: 60000 });
}

// Taxa de cemitério não paga segue para dívida ativa (TRI-436).
export async function enrollCemeteryFeeInDebt(connection: DatabaseConnection, actor: Actor, assessmentId: string) {
  return withDatabaseTransaction(connection, async tx => {
    const debt = await enrollOriginAssessment(tx, actor, assessmentId);
    const [previous] = await tx.select({ id: debtEvents.id }).from(debtEvents).where(and(eq(debtEvents.activeDebtId, debt.id), eq(debtEvents.eventType, "INSCRICAO"))).limit(1);
    if (!previous) await debtEvent(tx, actor, debt.id, "INSCRICAO", "Taxa de cemitério inscrita em dívida ativa.", { assessmentId });
    return debt;
  }, transactionDefaults);
}

export function cemeteryOccupancy(graves: { capacity: number; occupantCount: number }[]) {
  return occupancyStats(graves);
}

export function concessionCurrentSituation(concession: { concessionType: string; status: string; endsAt?: Date | string | null }, now = new Date()) {
  return concessionSituation(concession, now);
}

// S9-E — BI com dados reais da base, filtros e drill-down (TRI-437..445).
export async function tributarioBi(db: DatabaseExecutor, filters: { year?: number; taxName?: string; debtStatus?: string }) {
  const year = filters.year;
  const declarationPeriod = year ? and(gte(activeDebtDeclarationTotals.competence, new Date(Date.UTC(year, 0, 1))), lt(activeDebtDeclarationTotals.competence, new Date(Date.UTC(year + 1, 0, 1)))) : undefined;
  const [assessmentRows, paymentRows, debts, agreements, legacyPlans, cases, protestRows, declarations, activities] = await Promise.all([
    db.select({ assessment: taxAssessments, tax: { name: taxes.name }, realEstate: { id: realEstates.id, fiscalZone: realEstates.fiscalZone, propertyUse: realEstates.propertyUse } }).from(taxAssessments).innerJoin(taxes, eq(taxes.id, taxAssessments.taxId)).leftJoin(realEstates, eq(realEstates.id, taxAssessments.realEstateId)).where(and(year ? eq(taxAssessments.year, year) : undefined, filters.taxName ? eq(taxes.name, filters.taxName) : undefined)).limit(2000),
    db.select({ payment: taxPayments, assessment: { year: taxAssessments.year }, tax: { name: taxes.name } }).from(taxPayments).innerJoin(taxGuides, eq(taxGuides.id, taxPayments.guideId)).innerJoin(taxAssessments, eq(taxAssessments.id, taxGuides.assessmentId)).innerJoin(taxes, eq(taxes.id, taxAssessments.taxId)).where(and(eq(taxPayments.status, "Confirmado"), year ? eq(taxAssessments.year, year) : undefined)).limit(2000),
    db.select().from(taxActiveDebts).where(and(year ? eq(taxActiveDebts.year, year) : undefined, filters.debtStatus ? eq(taxActiveDebts.status, filters.debtStatus) : undefined)).orderBy(desc(taxActiveDebts.updatedAt)).limit(1000),
    db.select().from(activeDebtAgreementTotals).limit(1000),
    db.select({ status: taxDebtInstallments.status, totalValueDecimal: taxDebtInstallments.totalValueDecimal, totalValue: taxDebtInstallments.totalValue }).from(taxDebtInstallments).limit(1000),
    db.select({ status: executionCases.status, internalProtocol: executionCases.internalProtocol, activeDebtId: executionCases.activeDebtId }).from(executionCases).limit(500),
    db.select({ status: protestItems.status, batchId: protestItems.batchId, activeDebtId: protestItems.activeDebtId }).from(protestItems).limit(1000),
    db.select({ competence: activeDebtDeclarationTotals.competence, issValueDecimal: activeDebtDeclarationTotals.issValueDecimal, activityId: activeDebtDeclarationTotals.activityId }).from(activeDebtDeclarationTotals).where(and(notInArray(activeDebtDeclarationTotals.status, ["CANCELADA", "SUBSTITUIDA"]), declarationPeriod)).limit(2000),
    db.select({ id: pageActivities.id, code: pageActivities.code }).from(pageActivities),
  ]);
  const assessments = assessmentRows.map(row => ({ ...row.assessment, tax: row.tax, realEstate: row.realEstate }));
  const payments = paymentRows.map(row => ({ ...row.payment, guide: { assessment: { ...row.assessment, tax: row.tax } } }));
  const activityNames = new Map(activities.map((row) => [row.id, row.code ?? row.id]));
  const previsto = assessments.reduce((sum, row) => sum.plus(new Decimal(String(row.finalValueDecimal ?? row.originalValueDecimal ?? row.originalValue ?? 0))), new Decimal(0));
  const realizado = payments.reduce((sum, row) => sum.plus(new Decimal(String(row.amountPaidDecimal ?? row.amountPaid ?? 0))), new Decimal(0));
  const rate = previsto.greaterThan(0) ? Number(realizado.div(previsto).mul(100).toFixed(2)) : 0;
  return {
    previsto: Number(previsto.toFixed(2)),
    realizado: Number(realizado.toFixed(2)),
    collectionRate: rate,
    byTax: sumBy(assessments, (row) => row.tax.name, (row) => row.finalValueDecimal ?? row.originalValueDecimal ?? row.originalValue),
    paidByTax: sumBy(payments, (row) => row.guide.assessment.tax.name, (row) => row.amountPaidDecimal ?? row.amountPaid),
    paymentTrend: trendByMonth(payments.map((row) => ({ date: row.paymentDate, value: row.amountPaidDecimal ?? row.amountPaid }))),
    debtsByStatus: sumBy(debts, (row) => row.status, (row) => row.updatedValueDecimal ?? row.updatedValue),
    debtsByOrigin: sumBy(debts, (row) => row.originDebtType, (row) => row.updatedValueDecimal ?? row.updatedValue),
    agreementsByStatus: sumBy(agreements, (row) => row.status, (row) => row.totalAgreementDecimal),
    agreementsBalance: Number(agreements.reduce((sum, row) => sum.plus(row.balanceDecimal), new Decimal(0)).toFixed(2)),
    legacyPlansByStatus: sumBy(legacyPlans, (row) => row.status, (row) => row.totalValueDecimal ?? row.totalValue),
    executionByStatus: sumBy(cases, (row) => row.status, () => 0),
    protestByStatus: sumBy(protestRows, (row) => row.status, () => 0),
    iptuByZone: sumBy(assessments.filter((row) => row.realEstate), (row) => row.realEstate?.fiscalZone ?? "SEM ZONA", (row) => row.finalValueDecimal ?? row.originalValueDecimal ?? row.originalValue),
    iptuByUse: sumBy(assessments.filter((row) => row.realEstate), (row) => row.realEstate?.propertyUse ?? "SEM USO", (row) => row.finalValueDecimal ?? row.originalValueDecimal ?? row.originalValue),
    issTrend: trendByMonth(declarations.map((row) => ({ date: row.competence, value: row.issValueDecimal }))),
    issByActivity: sumBy(declarations, (row) => activityNames.get(row.activityId) ?? row.activityId, (row) => row.issValueDecimal),
    drillDebts: debts.slice(0, 20).map((row) => ({ cda: row.cdaNumber ?? "SEM CDA", origin: row.originDebtType, status: row.status, value: Number(row.updatedValueDecimal ?? row.updatedValue), taxpayerId: row.taxpayerId })),
    counts: { assessments: assessments.length, payments: payments.length, debts: debts.length, agreements: agreements.length, cases: cases.length, protestItems: protestRows.length, declarations: declarations.length },
  };
}
