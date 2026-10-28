import { and, asc, count, desc, eq, exists, gt, gte, ilike, inArray, lte, notExists, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { Decimal } from "@/db/decimal";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseTransaction } from "@/db/transaction";
import { accountingEntries, accountingPlans, accountingTransactions } from "@/db/schema/finance-accounting";
import { users } from "@/db/schema/identity";
import { planningBudgetUnitLabels } from "@/db/schema/planning-catalog";
import { taxes } from "@/db/schema/taxation-core";
import { taxIntegrationEvents } from "@/db/schema/tax-accounting";
import { findTaxPaymentByKey, taxAccountingObject as object } from "@/db/repositories/tax-accounting/records";
import { taxAccountingOriginFilter } from "@/db/repositories/tax-accounting/movements";
import { z } from "zod";
import { resolveFinancialReportScope } from "@/lib/financeiro/report-scope";

const moneyFilter = z.string().regex(/^\d{1,16}(?:\.\d{1,2})?$/).optional();
export const taxAccountingFilters = z.object({
  governmentEntityId: z.string().min(1), financialYearId: z.string().min(1), budgetUnitId: z.string().min(1).optional(),
  from: z.iso.date().optional(), through: z.iso.date().optional(), taxId: z.string().min(1).optional(),
  eventType: z.string().trim().max(150).optional(), account: z.string().trim().max(150).optional(),
  minimum: moneyFilter, maximum: moneyFilter, page: z.coerce.number().int().min(1).max(100000).default(1),
}).refine(value => !value.from || !value.through || value.from <= value.through, "Data inicial posterior à final.")
  .refine(value => !value.minimum || !value.maximum || new Decimal(value.minimum).lte(value.maximum), "Valor mínimo superior ao máximo.");
type AvailableReference = { id: string; date: string; eventType: string; amount: string; originEventId: string; guideId: string; assessmentId: string; taxId: string; taxName: string; budgetUnitId: string };
const reversals = alias(accountingTransactions, "taxAccountingReversals");
const contains = (value: string) => `%${value}%`;

async function availableReferences(tx: DatabaseTransaction, input: z.infer<typeof taxAccountingFilters>, budgetUnitIds: string[], year: number) {
  const result: AvailableReference[] = [];
  // Pending references have no posting account: account filters cannot classify them using today's matrix.
  if (input.account) return result;
  let cursor: string | undefined;
  for (;;) {
    const references = await tx.select({ id: taxIntegrationEvents.id, eventType: taxIntegrationEvents.eventType, payload: taxIntegrationEvents.payload }).from(taxIntegrationEvents).where(and(eq(taxIntegrationEvents.integrationCode, "ACCOUNTING"), eq(taxIntegrationEvents.status, "PENDENTE"), cursor ? gt(taxIntegrationEvents.id, cursor) : undefined)).orderBy(asc(taxIntegrationEvents.id)).limit(500);
    if (!references.length) break;
    for (const reference of references) {
      const payload = object(reference.payload);
      const date = typeof payload.competence === "string" ? new Date(payload.competence) : null;
      const sourceId = typeof payload.sourceId === "string" ? payload.sourceId : null;
      if (!date || !Number.isFinite(date.getTime()) || date.getUTCFullYear() !== year || !sourceId || reference.eventType !== "ARRECADACAO") continue;
      const day = date.toISOString().slice(0, 10);
      if (input.from && day < input.from || input.through && day > input.through || input.eventType && !reference.eventType.toLowerCase().includes(input.eventType.toLowerCase())) continue;
      const bankReturn = (await tx.select().from(taxIntegrationEvents).where(eq(taxIntegrationEvents.id, sourceId)).limit(1))[0];
      if (bankReturn?.integrationCode !== "BANK_RETURN" || bankReturn.status !== "PROCESSADO") continue;
      const originPayload = object(bankReturn.payload);
      if (originPayload.amount !== payload.amount || originPayload.occurredAt !== payload.competence) continue;
      const payment = await findTaxPaymentByKey(tx, bankReturn.idempotencyKey);
      if (payment?.status !== "Confirmado") continue;
      const assessment = payment.guide.assessment;
      if (input.taxId && assessment.taxId !== input.taxId) continue;
      const revenue = payment.revenueIntegration?.revenue;
      const memory = object(assessment.calculationSnapshot);
      const budgetUnitId = revenue ? revenue.budgetUnitId : (typeof memory.budgetUnitId === "string" ? memory.budgetUnitId : null);
      const governmentEntityId = revenue ? revenue.financialYear?.governmentEntityId : memory.governmentEntityId;
      if (!budgetUnitId || !budgetUnitIds.includes(budgetUnitId) || governmentEntityId !== input.governmentEntityId || revenue && revenue.financialYearId !== input.financialYearId) continue;
      const amount = typeof payload.amount === "string" && /^\d+(?:\.\d{1,2})?$/.test(payload.amount) ? new Decimal(payload.amount) : null;
      if (!amount || !amount.isFinite() || amount.lte(0) || input.minimum && amount.lt(input.minimum) || input.maximum && amount.gt(input.maximum)) continue;
      if (payment.revenueIntegration && (await tx.select({ id: accountingTransactions.id }).from(accountingTransactions).where(and(inArray(accountingTransactions.sourceModule, ["TRIBUTACAO", "TRIBUTARIO"]), eq(accountingTransactions.sourceType, "TAX_PAYMENT"), eq(accountingTransactions.sourceId, payment.revenueIntegration.revenueId), eq(accountingTransactions.financialYearId, input.financialYearId), eq(accountingTransactions.governmentEntityId, input.governmentEntityId), eq(accountingTransactions.budgetUnitId, budgetUnitId), eq(accountingTransactions.status, "POSTADO"), notExists(tx.select({ id: reversals.id }).from(reversals).where(eq(reversals.reversalOfId, accountingTransactions.id))))).limit(1))[0]) continue;
      result.push({ id: reference.id, date: date.toISOString(), eventType: reference.eventType, amount: amount.toFixed(2), originEventId: sourceId, guideId: payment.guideId, assessmentId: payment.guide.assessmentId, taxId: assessment.taxId, taxName: assessment.tax.name, budgetUnitId });
    }
    cursor = references[references.length - 1].id;
  }
  return result.sort((left, right) => right.date.localeCompare(left.date) || right.id.localeCompare(left.id));
}

export async function readTaxAccountingMovements(db: DatabaseConnection, actor: { allowedBudgetUnitIds?: string[] }, raw: unknown) {
  const input = taxAccountingFilters.parse(raw);
  return withDatabaseTransaction(db, async tx => {
    const scope = await resolveFinancialReportScope(tx, input.financialYearId, { governmentEntityId: input.governmentEntityId, budgetUnitId: input.budgetUnitId, budgetUnitIds: actor.allowedBudgetUnitIds });
    if (!scope.governmentEntityId || !scope.budgetUnitIds?.length) throw new Error("Consulta tributária exige ente/exercício e UG autorizados.");
    if (input.taxId && !(await tx.select({ id: taxes.id }).from(taxes).where(eq(taxes.id, input.taxId)).limit(1))[0]) throw new Error("Tributo não encontrado.");
    const entryFilter = and(
      input.account ? or(ilike(accountingPlans.code, contains(input.account)), ilike(accountingPlans.name, contains(input.account)), sql`jsonb_typeof(${accountingEntries.classificationSnapshot}->'externalCode') = 'string' AND ${accountingEntries.classificationSnapshot}->>'externalCode' LIKE ${contains(input.account)}`) : undefined,
      input.minimum ? gte(accountingEntries.valueDecimal, new Decimal(input.minimum)) : undefined,
      input.maximum ? lte(accountingEntries.valueDecimal, new Decimal(input.maximum)) : undefined,
    );
    const where = and(
      eq(accountingTransactions.governmentEntityId, scope.governmentEntityId), eq(accountingTransactions.financialYearId, input.financialYearId), inArray(accountingTransactions.budgetUnitId, scope.budgetUnitIds), inArray(accountingTransactions.sourceModule, ["TRIBUTACAO", "TRIBUTARIO"]),
      input.from ? gte(accountingTransactions.date, new Date(`${input.from}T00:00:00.000Z`)) : undefined,
      input.through ? lte(accountingTransactions.date, new Date(`${input.through}T23:59:59.999Z`)) : undefined,
      input.eventType ? ilike(accountingTransactions.eventType, contains(input.eventType)) : undefined,
      input.taxId ? await taxAccountingOriginFilter(tx, input.taxId) : undefined,
      input.account || input.minimum || input.maximum ? exists(tx.select({ id: accountingEntries.id }).from(accountingEntries).innerJoin(accountingPlans, eq(accountingPlans.id, accountingEntries.accountId)).where(and(eq(accountingEntries.transactionId, accountingTransactions.id), entryFilter))) : undefined,
    );
    const [{ total }] = await tx.select({ total: count() }).from(accountingTransactions).where(where);
    const available = await availableReferences(tx, input, scope.budgetUnitIds, scope.year);
    const page = Math.min(input.page, Math.max(1, Math.ceil(Math.max(total, available.length) / 50)));
    const selected = await tx.select({ id: accountingTransactions.id, date: accountingTransactions.date, history: accountingTransactions.history, status: accountingTransactions.status, sourceType: accountingTransactions.sourceType, sourceModule: accountingTransactions.sourceModule, sourceId: accountingTransactions.sourceId, eventType: accountingTransactions.eventType, reversalOfId: accountingTransactions.reversalOfId, authorUsuario: { nome: users.nome }, budgetUnit: { code: planningBudgetUnitLabels.code, name: planningBudgetUnitLabels.name } }).from(accountingTransactions).innerJoin(users, eq(users.id, accountingTransactions.authorUsuarioId)).leftJoin(planningBudgetUnitLabels, eq(planningBudgetUnitLabels.id, accountingTransactions.budgetUnitId)).where(where).orderBy(desc(accountingTransactions.date), desc(accountingTransactions.id)).offset((page - 1) * 50).limit(50);
    const transactions = [];
    for (const transaction of selected) {
      const entries = await tx.select({ id: accountingEntries.id, type: accountingEntries.type, valueDecimal: accountingEntries.valueDecimal, classificationSnapshot: accountingEntries.classificationSnapshot, account: { code: accountingPlans.code, name: accountingPlans.name } }).from(accountingEntries).innerJoin(accountingPlans, eq(accountingPlans.id, accountingEntries.accountId)).where(and(eq(accountingEntries.transactionId, transaction.id), entryFilter)).orderBy(asc(accountingEntries.id));
      transactions.push({ ...transaction, date: transaction.date.toISOString(), entries: entries.map(({ valueDecimal, ...entry }) => { const code = object(entry.classificationSnapshot).externalCode; return { ...entry, amount: valueDecimal?.toFixed(2) ?? null, frozenAccountCode: typeof code === "string" ? code : null }; }) });
    }
    return { year: scope.year, total, page, availableTotal: available.length, available: available.slice((page - 1) * 50, page * 50), transactions };
  }, { isolationLevel: "repeatable read", timeoutMs: 60000 });
}
