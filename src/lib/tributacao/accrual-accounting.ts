import { and, count, eq, inArray } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import type { JsonValue } from "@/db/json";
import type { DatabaseTransaction } from "@/db/transaction";
import { accountingEntries } from "@/db/schema/finance-accounting";
import { taxRegistryEntries } from "@/db/schema/taxation-registry";
import { taxActiveDebts } from "@/db/schema/tax-accounting";
import { taxAuditLogs } from "@/db/schema/taxation-audit";
import { findTaxAccountingEvent, findTaxAccountingTransaction, lockTaxAccountingRow, readConfirmedTaxAssessmentPayments, readTaxAccountingCatalog, readTaxAccountingPlan, readTaxAccountingTransaction, readTaxActiveDebt, readTaxAssessment, readTaxPayment, taxAccountingObject as taxScopeSnapshot, taxAssessmentPosition, taxProfilePeriod } from "@/db/repositories/tax-accounting/records";
import { postAccountingEventInTransaction, postAccountingTransactionInTransaction, type FinanceActor } from "@/lib/financeiro";
import { resolveAccountClassificationSnapshots } from "@/lib/financeiro/account-catalog";
import { resolveTaxAssessmentScope, resolveTaxFinancialYear, taxAssessmentCompensatedValue } from "./scope";

type Profile = { receivableAccountId: string; revenueAccountId: string; deductionAccountId: string; lossAccountId: string; budgetUnitId: string; governmentEntityId: string; catalogVersionId: string };
function profile(value: JsonValue): Profile {
  const data = taxScopeSnapshot(value);
  const field = (name: string) => {
    const result = data[name];
    if (typeof result !== "string" || !result) throw new Error("Perfil contábil tributário incompleto.");
    return result;
  };
  return { receivableAccountId: field("receivableAccountId"), revenueAccountId: field("revenueAccountId"), deductionAccountId: field("deductionAccountId"), lossAccountId: field("lossAccountId"), budgetUnitId: field("budgetUnitId"), governmentEntityId: field("governmentEntityId"), catalogVersionId: field("catalogVersionId") };
}

/** Recognition is opt-in by immutable municipal profile; historical assessments are never backfilled implicitly. */
export async function recognizeTaxAssessmentInTransaction(tx: DatabaseTransaction, actor: FinanceActor, assessmentId: string) {
  await lockTaxAccountingRow(tx, "TaxAssessment", assessmentId);
  const assessment = await readTaxAssessment(tx, assessmentId);
  const origin = await resolveTaxAssessmentScope(tx, actor, assessment.taxId, assessment.calculationSnapshot);
  if (!origin.budgetUnitId || !origin.governmentEntityId) return;
  const scope = { budgetUnitId: origin.budgetUnitId, governmentEntityId: origin.governmentEntityId };
  if (taxScopeSnapshot(assessment.calculationSnapshot).recognitionPolicy === "PRESERVE_LEGACY_NO_RETROACTIVE_RECOGNITION") return;
  const positions = await tx.select().from(taxRegistryEntries).where(taxAssessmentPosition(assessment.id, "ACCOUNTING_POSITION"));
  if (positions.length) {
    if (positions.length !== 1) throw new Error("Reconhecimento patrimonial tributário ambíguo.");
    const data = taxScopeSnapshot(positions[0].data), selected = profile(positions[0].data);
    const originalValue = typeof data.originalValue === "string" && /^\d+(?:\.\d{1,2})?$/.test(data.originalValue) ? new Decimal(data.originalValue) : null;
    const transaction = typeof data.recognitionTransactionId === "string" ? await findTaxAccountingTransaction(tx, data.recognitionTransactionId) : null;
    if (!originalValue?.isFinite() || originalValue.lte(0) || selected.budgetUnitId !== scope.budgetUnitId || selected.governmentEntityId !== scope.governmentEntityId || !transaction || transaction.status !== "POSTADO" || transaction.reversedBy || transaction.sourceModule !== "TRIBUTACAO" || transaction.sourceType !== "TAX_ASSESSMENT" || transaction.sourceId !== assessment.id || transaction.eventType !== "TAX_ASSESSMENT_RECOGNIZED" || transaction.budgetUnitId !== scope.budgetUnitId || transaction.governmentEntityId !== scope.governmentEntityId || transaction.financialYear.governmentEntityId !== scope.governmentEntityId || transaction.entries.length !== 2 || !transaction.entries.some(entry => entry.accountId === selected.receivableAccountId && entry.type === "Débito" && entry.valueDecimal?.eq(originalValue)) || !transaction.entries.some(entry => entry.accountId === selected.revenueAccountId && entry.type === "Crédito" && entry.valueDecimal?.eq(originalValue))) throw new Error("Reconhecimento original sem posição patrimonial conciliada para reexecução.");
    return;
  }
  const date = assessment.competence ?? (assessment.year === new Date().getUTCFullYear() ? new Date() : new Date(Date.UTC(assessment.year, 0, 1, 12)));
  const profiles = await tx.select().from(taxRegistryEntries).where(taxProfilePeriod(assessment.taxId, "ACCOUNTING_PROFILE", scope.budgetUnitId, date));
  const superseded = new Set(profiles.map(entry => taxScopeSnapshot(entry.data).supersedesEntryId).filter((id): id is string => typeof id === "string"));
  const current = profiles.filter(entry => !superseded.has(entry.id));
  if (!current.length && !profiles.length) return;
  if (current.length !== 1) throw new Error("Perfis contábeis tributários sobrepostos para a UG.");
  const selected = profile(current[0].data);
  if (selected.budgetUnitId !== scope.budgetUnitId || selected.governmentEntityId !== scope.governmentEntityId) throw new Error("Perfil tributário fora do ente de origem.");
  const catalog = await readTaxAccountingCatalog(tx, selected.catalogVersionId);
  const accounts = [selected.receivableAccountId, selected.revenueAccountId, selected.deductionAccountId, selected.lossAccountId];
  if (catalog.status !== "PUBLISHED" || catalog.year !== date.getUTCFullYear() || new Set(accounts).size !== 4 || accounts.some(id => !catalog.entries.some(entry => entry.kind === "ACCOUNT" && entry.canonicalId === id && taxScopeSnapshot(entry.attributes).operational === true && taxScopeSnapshot(entry.attributes).pocOnly === false))) throw new Error("Perfil tributário sem quatro contas municipais publicadas e vigentes.");
  const year = await resolveTaxFinancialYear(tx, date.getUTCFullYear(), scope);
  const value = assessment.finalValueDecimal;
  if (!value || value.lte(0)) throw new Error("Constituição tributária sem valor Decimal positivo.");
  const transaction = await postAccountingTransactionInTransaction(tx, actor, { financialYearId: year.id, ...scope, date, history: `Constituição patrimonial do lançamento ${assessment.assessmentNumber}`, sourceModule: "TRIBUTACAO", sourceType: "TAX_ASSESSMENT", sourceId: assessment.id, eventType: "TAX_ASSESSMENT_RECOGNIZED", idempotencyKey: `TAX_ASSESSMENT:${assessment.id}:RECOGNIZED`, lines: [{ accountId: selected.receivableAccountId, type: "Débito", value }, { accountId: selected.revenueAccountId, type: "Crédito", value }] });
  await tx.insert(taxRegistryEntries).values({ entityType: "TAX_ASSESSMENT", entityId: assessment.id, category: "ACCOUNTING_POSITION", title: "Direito tributário reconhecido", status: "ATIVO", source: "CONTABILIDADE", actorUsuarioId: actor.usuarioId, data: { ...selected, profileEntryId: current[0].id, recognitionTransactionId: transaction.id, recognizedAt: date.toISOString(), originalValue: value.toFixed(2) } });
}

/** Returns the frozen profile from the recognition, rather than today's routing configuration. */
export async function recognizedTaxProfile(tx: DatabaseTransaction, actor: FinanceActor, assessmentId: string, date: Date) {
  const assessment = await readTaxAssessment(tx, assessmentId);
  const scope = await resolveTaxAssessmentScope(tx, actor, assessment.taxId, assessment.calculationSnapshot);
  const positions = await tx.select().from(taxRegistryEntries).where(taxAssessmentPosition(assessmentId, "ACCOUNTING_POSITION"));
  if (!positions.length) return null;
  if (positions.length !== 1) throw new Error("Reconhecimento patrimonial tributário ambíguo.");
  const data = taxScopeSnapshot(positions[0].data);
  const selected = profile(positions[0].data);
  const original = typeof data.recognitionTransactionId === "string" ? await findTaxAccountingTransaction(tx, data.recognitionTransactionId) : null;
  if (selected.budgetUnitId !== scope.budgetUnitId || selected.governmentEntityId !== scope.governmentEntityId || !original || original.status !== "POSTADO" || original.sourceId !== assessment.id || original.eventType !== "TAX_ASSESSMENT_RECOGNIZED" || original.budgetUnitId !== scope.budgetUnitId || original.governmentEntityId !== scope.governmentEntityId || date < original.date || original.entries.length !== 2 || !original.entries.some(entry => entry.accountId === selected.receivableAccountId && entry.type === "Débito" && entry.valueDecimal?.eq(String(data.originalValue))) || !original.entries.some(entry => entry.accountId === selected.revenueAccountId && entry.type === "Crédito" && entry.valueDecimal?.eq(String(data.originalValue)))) throw new Error("Direito tributário sem partida original conciliada ou data compatível.");
  const debtPosition = await tx.select().from(taxRegistryEntries).where(taxAssessmentPosition(assessmentId, "DEBT_ACCOUNTING_POSITION"));
  if (debtPosition.length > 1) throw new Error("Reclassificação contábil da dívida ativa ambígua.");
  if (!debtPosition.length) return selected;
  const debtData = taxScopeSnapshot(debtPosition[0].data);
  if (typeof debtData.receivableAccountId !== "string" || typeof debtData.lossAccountId !== "string" || typeof debtData.transactionId !== "string" || typeof debtData.amount !== "string" || debtData.budgetUnitId !== selected.budgetUnitId || debtData.governmentEntityId !== selected.governmentEntityId) throw new Error("Posição da dívida ativa incompleta ou fora do ente de origem.");
  const debtAmount = debtData.amount;
  const reclassification = await readTaxAccountingTransaction(tx, debtData.transactionId);
  if (reclassification.status !== "POSTADO" || reclassification.reversedBy || reclassification.budgetUnitId !== selected.budgetUnitId || reclassification.governmentEntityId !== selected.governmentEntityId || reclassification.sourceModule !== "TRIBUTACAO" || reclassification.sourceType !== "ACTIVE_DEBT_RECLASSIFICATION" || reclassification.sourceId !== assessmentId || date < reclassification.date || reclassification.entries.length !== 2 || !reclassification.entries.some(entry => entry.accountId === debtData.receivableAccountId && entry.type === "Débito" && entry.valueDecimal?.eq(debtAmount)) || !reclassification.entries.some(entry => entry.accountId === selected.receivableAccountId && entry.type === "Crédito" && entry.valueDecimal?.eq(debtAmount))) throw new Error("Dívida ativa sem partida original de reclassificação conciliada.");
  return { ...selected, receivableAccountId: debtData.receivableAccountId, lossAccountId: debtData.lossAccountId };
}

/** Reclassifies an already recognized receivable without recognizing legacy debt or a second VPA. */
export async function reclassifyActiveDebtInTransaction(tx: DatabaseTransaction, actor: FinanceActor, debtId: string, date: Date) {
  if (!Number.isFinite(date.valueOf())) throw new Error("Data da reclassificação inválida.");
  const origin = await readTaxActiveDebt(tx, debtId);
  if (!origin.assessmentId) return null;
  await lockTaxAccountingRow(tx, "TaxAssessment", origin.assessmentId);
  await lockTaxAccountingRow(tx, "ActiveDebt", debtId);
  const debt = await readTaxActiveDebt(tx, debtId);
  if (debt.assessmentId !== origin.assessmentId) throw new Error("Origem da dívida alterada durante a reclassificação.");
  const assessmentId = origin.assessmentId;
  const existing = (await tx.select().from(taxRegistryEntries).where(taxAssessmentPosition(assessmentId, "DEBT_ACCOUNTING_POSITION")).limit(1))[0];
  const selected = await recognizedTaxProfile(tx, actor, assessmentId, date);
  if (!selected) return null;
  if (existing) return existing;
  const assessment = await readTaxAssessment(tx, assessmentId);
  if (debt.budgetUnitId !== selected.budgetUnitId || debt.governmentEntityId !== selected.governmentEntityId) throw new Error("Dívida ativa diverge da UG/ente do direito reconhecido.");
  const eventCode = `TAX_ACTIVE_DEBT:${assessment.taxId}:${selected.budgetUnitId}`;
  const lossCode = `TAX_ACTIVE_DEBT_EXTINCTION:${assessment.taxId}:${selected.budgetUnitId}`;
  const [event, loss] = await Promise.all([
    findTaxAccountingEvent(tx, eventCode),
    findTaxAccountingEvent(tx, lossCode),
  ]);
  const profiles = await tx.select().from(taxRegistryEntries).where(taxProfilePeriod(assessment.taxId, "DEBT_ACCOUNTING_PROFILE", selected.budgetUnitId, date));
  const superseded = new Set(profiles.map(entry => taxScopeSnapshot(entry.data).supersedesEntryId));
  const current = profiles.filter(entry => !superseded.has(entry.id));
  if (profiles.length && current.length !== 1) throw new Error("Perfis de dívida ativa sobrepostos para a data/UG.");
  const configured = current[0] ? taxScopeSnapshot(current[0].data) : null;
  if (configured && (configured.governmentEntityId !== selected.governmentEntityId || configured.originalReceivableAccountId !== selected.receivableAccountId || typeof configured.debtReceivableAccountId !== "string" || typeof configured.lossAccountId !== "string")) throw new Error("Perfil DA diverge da origem reconhecida, ente ou contas.");
  if (!configured && (!event?.isActive || !loss?.isActive || event.rules.length !== 1 || loss.rules.length !== 1 || event.rules[0].isReference || loss.rules[0].isReference || event.rules[0].creditAccountId !== selected.receivableAccountId || loss.rules[0].creditAccountId !== event.rules[0].debitAccountId || new Set([selected.receivableAccountId, event.rules[0].debitAccountId, loss.rules[0].debitAccountId]).size !== 3)) throw new Error("Dívida ativa reconhecida exige matriz municipal por tributo/UG: direito DA contra direito original e VPD de extinção contra direito DA.");
  const lossAccount = await readTaxAccountingPlan(tx, configured ? String(configured.lossAccountId) : loss!.rules[0].debitAccountId);
  const debtAccount = await readTaxAccountingPlan(tx, configured ? String(configured.debtReceivableAccountId) : event!.rules[0].debitAccountId);
  if (configured) {
    if (typeof configured.catalogVersionId !== "string") throw new Error("Perfil DA sem edição contábil municipal.");
    const catalog = await readTaxAccountingCatalog(tx, configured.catalogVersionId);
    const ids = [selected.receivableAccountId, debtAccount.id, lossAccount.id];
    if (catalog.status !== "PUBLISHED" || catalog.year !== date.getUTCFullYear() || new Set(ids).size !== 3 || ids.some(id => !catalog.entries.some(entry => entry.kind === "ACCOUNT" && entry.canonicalId === id && taxScopeSnapshot(entry.attributes).operational === true && taxScopeSnapshot(entry.attributes).pocOnly === false))) throw new Error("Perfil DA sem três contas municipais distintas, publicadas e vigentes.");
  }
  if (lossAccount.type !== "VPD" || debtAccount.type !== "Ativo") throw new Error("Reclassificação da dívida exige conta analítica de ativo e VPD de extinção.");
  await resolveAccountClassificationSnapshots(tx, [{ id: lossAccount.id }, { id: debtAccount.id }], date, selected);
  const payments = await readConfirmedTaxAssessmentPayments(tx, assessment.id);
  if (payments.some(payment => !payment.amountPaidDecimal) || !assessment.finalValueDecimal) throw new Error("Reclassificação exige saldo Decimal conciliado.");
  const paid = payments.reduce((sum, payment) => sum.plus(payment.amountPaidDecimal!), new Decimal(0)).plus(await taxAssessmentCompensatedValue(tx, assessment.id));
  const value = assessment.finalValueDecimal.minus(paid);
  if (value.lte(0)) throw new Error("Direito sem saldo positivo para reclassificação em dívida ativa.");
  const year = await resolveTaxFinancialYear(tx, date.getUTCFullYear(), selected);
  const [{ total: priorEditions }] = await tx.select({ total: count() }).from(taxRegistryEntries).where(and(eq(taxRegistryEntries.entityType, "TAX_ASSESSMENT"), eq(taxRegistryEntries.entityId, assessment.id), eq(taxRegistryEntries.category, "DEBT_ACCOUNTING_POSITION")));
  const key = `ACTIVE_DEBT:${debt.id}:RECLASSIFICATION${priorEditions ? `:EDITION:${priorEditions + 1}` : ""}`;
  const posting = { financialYearId: year.id, governmentEntityId: selected.governmentEntityId, budgetUnitId: selected.budgetUnitId, date, history: `Reclassificação em dívida ativa — ${debt.cdaNumber ?? debt.id}`, sourceModule: "TRIBUTACAO", sourceType: "ACTIVE_DEBT_RECLASSIFICATION", sourceId: assessment.id, idempotencyKey: key };
  const transaction = configured ? await postAccountingTransactionInTransaction(tx, actor, { ...posting, eventType: eventCode, lines: [{ accountId: debtAccount.id, type: "Débito", value }, { accountId: selected.receivableAccountId, type: "Crédito", value }] }) : await postAccountingEventInTransaction(tx, actor, { ...posting, eventCode, value });
  const lines = await tx.select().from(accountingEntries).where(eq(accountingEntries.transactionId, transaction.id));
  if (lines.length !== 2 || !lines.some(line => line.accountId === debtAccount.id && line.type === "Débito" && line.valueDecimal?.eq(value)) || !lines.some(line => line.accountId === selected.receivableAccountId && line.type === "Crédito" && line.valueDecimal?.eq(value))) throw new Error("Matriz mudou durante a reclassificação; repita com a configuração vigente conciliada.");
  const [entry] = await tx.insert(taxRegistryEntries).values({ entityType: "TAX_ASSESSMENT", entityId: assessment.id, category: "DEBT_ACCOUNTING_POSITION", title: "Direito reconhecido reclassificado em dívida ativa", status: "ATIVO", source: "CONTABILIDADE", actorUsuarioId: actor.usuarioId, data: { debtId: debt.id, budgetUnitId: selected.budgetUnitId, governmentEntityId: selected.governmentEntityId, originalReceivableAccountId: selected.receivableAccountId, receivableAccountId: debtAccount.id, lossAccountId: lossAccount.id, profileEntryId: current[0]?.id ?? null, eventCode, lossCode, transactionId: transaction.id, amount: value.toFixed(2), reclassifiedAt: date.toISOString() } }).returning();
  await tx.update(taxActiveDebts).set({ updatedValue: Number(value), updatedValueDecimal: value }).where(eq(taxActiveDebts.id, debt.id));
  await tx.insert(taxAuditLogs).values({ action: "RECLASSIFY_ACTIVE_DEBT", entityType: "ActiveDebt", entityId: debt.id, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, payload: { registryEntryId: entry.id, accountingTransactionId: transaction.id, amount: value.toFixed(2), ...selected } });
  return entry;
}

export async function returnActiveDebtReceivableInTransaction(tx: DatabaseTransaction, actor: FinanceActor, debtId: string, date: Date, reason: string) {
  const debt = await readTaxActiveDebt(tx, debtId);
  if (!debt.assessmentId) return null;
  const selected = await recognizedTaxProfile(tx, actor, debt.assessmentId, date);
  const position = (await tx.select().from(taxRegistryEntries).where(taxAssessmentPosition(debt.assessmentId, "DEBT_ACCOUNTING_POSITION")).limit(1))[0];
  if (!position) return null;
  if (!selected) throw new Error("Devolução de dívida contabilizada sem reconhecimento original conciliado.");
  const data = taxScopeSnapshot(position.data);
  if (typeof data.originalReceivableAccountId !== "string" || debt.budgetUnitId !== selected.budgetUnitId || debt.governmentEntityId !== selected.governmentEntityId) throw new Error("Devolução da dívida diverge da conta original/UG/ente preservados.");
  const assessment = await readTaxAssessment(tx, debt.assessmentId);
  const payments = await readConfirmedTaxAssessmentPayments(tx, assessment.id);
  if (!assessment.finalValueDecimal || payments.some(payment => !payment.amountPaidDecimal)) throw new Error("Devolução da dívida exige posição Decimal conciliada.");
  const paid = payments.reduce((sum, payment) => sum.plus(payment.amountPaidDecimal!), new Decimal(0)).plus(await taxAssessmentCompensatedValue(tx, assessment.id));
  const residual = assessment.finalValueDecimal.minus(paid);
  if (residual.lte(0)) throw new Error("Dívida extinta não possui direito residual para devolver à origem.");
  const year = await resolveTaxFinancialYear(tx, date.getUTCFullYear(), selected);
  const transaction = await postAccountingTransactionInTransaction(tx, actor, { financialYearId: year.id, governmentEntityId: selected.governmentEntityId, budgetUnitId: selected.budgetUnitId, date, history: reason.trim(), sourceModule: "TRIBUTACAO", sourceType: "ACTIVE_DEBT_RETURN", sourceId: assessment.id, eventType: "ACTIVE_DEBT_RETURNED_TO_ORIGIN", idempotencyKey: `ACTIVE_DEBT:${position.id}:RETURN`, lines: [{ accountId: data.originalReceivableAccountId, type: "Débito", value: residual }, { accountId: selected.receivableAccountId, type: "Crédito", value: residual }] });
  await tx.update(taxRegistryEntries).set({ status: "DEVOLVIDA" }).where(eq(taxRegistryEntries.id, position.id));
  const [entry] = await tx.insert(taxRegistryEntries).values({ entityType: "TAX_ASSESSMENT", entityId: assessment.id, category: "DEBT_RETURN_POSITION", title: "Direito residual devolvido à origem", status: "ATIVO", source: "CONTABILIDADE", actorUsuarioId: actor.usuarioId, data: { debtId, originalPositionId: position.id, amount: residual.toFixed(2), transactionId: transaction.id, reason: reason.trim(), returnedAt: date.toISOString(), budgetUnitId: selected.budgetUnitId, governmentEntityId: selected.governmentEntityId } }).returning();
  await tx.insert(taxAuditLogs).values({ action: "RETURN_ACTIVE_DEBT_RECEIVABLE", entityType: "ActiveDebt", entityId: debtId, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, payload: { registryEntryId: entry.id, originalPositionId: position.id, accountingTransactionId: transaction.id, amount: residual.toFixed(2), reason: reason.trim() } });
  return entry;
}

export async function postTaxAssessmentAdjustment(tx: DatabaseTransaction, actor: FinanceActor, input: { assessmentId: string; date: Date; delta: Decimal; kind: "REVISION" | "BENEFIT" | "EXTINCTION"; idempotencyKey: string; reason: string }) {
  const selected = await recognizedTaxProfile(tx, actor, input.assessmentId, input.date);
  if (!selected || input.delta.isZero()) return null;
  const year = await resolveTaxFinancialYear(tx, input.date.getUTCFullYear(), selected);
  const increase = input.delta.gt(0);
  if (increase && input.kind !== "REVISION") throw new Error("Benefício ou extinção não pode aumentar o direito.");
  const value = input.delta.abs();
  return postAccountingTransactionInTransaction(tx, actor, { financialYearId: year.id, budgetUnitId: selected.budgetUnitId, governmentEntityId: selected.governmentEntityId, date: input.date, history: input.reason, sourceModule: "TRIBUTACAO", sourceType: "TAX_ASSESSMENT_ADJUSTMENT", sourceId: input.assessmentId, eventType: `TAX_ASSESSMENT_${input.kind}`, idempotencyKey: input.idempotencyKey, lines: [{ accountId: increase ? selected.receivableAccountId : input.kind === "EXTINCTION" ? selected.lossAccountId : selected.deductionAccountId, type: "Débito", value }, { accountId: increase ? selected.revenueAccountId : selected.receivableAccountId, type: "Crédito", value }] });
}

/** A historical reversal restores its original account; route the restored right to the current frozen account. */
export async function reclassifyRestoredTaxReceivable(tx: DatabaseTransaction, actor: FinanceActor, input: { assessmentId: string; originalTransactionId: string; amount: Decimal; date: Date; idempotencyKey: string; reason: string }) {
  const selected = await recognizedTaxProfile(tx, actor, input.assessmentId, input.date);
  if (!selected) return null;
  const positions = await tx.select().from(taxRegistryEntries).where(and(eq(taxRegistryEntries.entityType, "TAX_ASSESSMENT"), eq(taxRegistryEntries.entityId, input.assessmentId), eq(taxRegistryEntries.category, "DEBT_ACCOUNTING_POSITION"), inArray(taxRegistryEntries.status, ["ATIVO", "DEVOLVIDA"])));
  if (!positions.length) return null;
  const accounts = new Set<string>([selected.receivableAccountId]);
  for (const position of positions) {
    const data = taxScopeSnapshot(position.data);
    if (typeof data.originalReceivableAccountId !== "string" || typeof data.receivableAccountId !== "string" || data.budgetUnitId !== selected.budgetUnitId || data.governmentEntityId !== selected.governmentEntityId) throw new Error("Contas e escopo das reclassificações históricas não foram preservados.");
    accounts.add(data.originalReceivableAccountId);
    accounts.add(data.receivableAccountId);
  }
  const original = await readTaxAccountingTransaction(tx, input.originalTransactionId);
  if (original.status !== "POSTADO" || !original.reversedBy || original.budgetUnitId !== selected.budgetUnitId || original.governmentEntityId !== selected.governmentEntityId || input.amount.lte(0)) throw new Error("Estorno do direito sem partida original conciliada.");
  const credits = original.entries.filter(entry => entry.type === "Crédito" && accounts.has(entry.accountId));
  if (credits.length !== 1 || !credits[0].valueDecimal?.eq(input.amount)) throw new Error("Partida original não contém baixa única do direito pelo valor estornado.");
  if (credits[0].accountId === selected.receivableAccountId) return null;
  const year = await resolveTaxFinancialYear(tx, input.date.getUTCFullYear(), selected);
  return postAccountingTransactionInTransaction(tx, actor, { financialYearId: year.id, budgetUnitId: selected.budgetUnitId, governmentEntityId: selected.governmentEntityId, date: input.date, history: input.reason, sourceModule: "TRIBUTACAO", sourceType: "ACTIVE_DEBT_RESTORATION", sourceId: input.assessmentId, eventType: "ACTIVE_DEBT_RECEIVABLE_RESTORED", idempotencyKey: input.idempotencyKey, lines: [{ accountId: selected.receivableAccountId, type: "Débito", value: input.amount }, { accountId: credits[0].accountId, type: "Crédito", value: input.amount }] });
}

export async function taxCollectionReceivableAccount(tx: DatabaseTransaction, actor: FinanceActor, input: { sourceModule: string; sourceType: string; sourceId?: string; date: Date }) {
  if (input.sourceModule !== "TRIBUTARIO" || input.sourceType !== "TAX_PAYMENT" || !input.sourceId) return undefined;
  const payment = await readTaxPayment(tx, input.sourceId);
  return (await recognizedTaxProfile(tx, actor, payment.guide.assessmentId, input.date))?.receivableAccountId;
}
