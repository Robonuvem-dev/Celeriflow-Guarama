import { and, asc, count, desc, eq, gte, ilike, inArray, lte, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { DatabaseConnection } from "../../connection";
import { withDatabaseTransaction, type DatabaseExecutor } from "../../transaction";
import type { AccountingPageFilters } from "@/lib/contracts/finance-pages";
import type { JsonValue } from "../../json";
import { accountingComponents, accountingEntries, accountingEvents, accountingPlans, accountingRules, accountingTransactions, annualAccountingCloses, monthlyAccountingCloseEvents, monthlyAccountingCloses } from "../../schema/finance-accounting";
import { financialAuditLogs } from "../../schema/finance-identity";
import { financialYears } from "../../schema/finance-years";
import { payments } from "../../schema/finance-payments";
import { budgetAppropriations, commitments } from "../../schema/finance-budget";
import { planningBudgetUnitLabels, planningEntityUnits } from "../../schema/planning-catalog";
import { users } from "../../schema/identity";
import { employees } from "../../schema/administration";

export async function readFinancePostingRules(db: DatabaseExecutor) {
  const events = await db.select().from(accountingEvents).where(eq(accountingEvents.isActive, true)).orderBy(asc(accountingEvents.code));
  const rules = await db.select().from(accountingRules).where(and(eq(accountingRules.isActive, true), inArray(accountingRules.eventId, events.map(row => row.id))));
  const components = await db.select().from(accountingComponents).where(inArray(accountingComponents.ruleId, rules.map(row => row.id))).orderBy(asc(accountingComponents.sequence));
  return events.map(event => ({ ...event, rules: rules.filter(rule => rule.eventId === event.id).map(rule => ({ ...rule, components: components.filter(component => component.ruleId === rule.id) })) }));
}

async function readTransactionEntries(db: DatabaseExecutor, transactionIds: string[]) {
  return db.select({ entry: accountingEntries, account: accountingPlans, author: { name: employees.name } })
    .from(accountingEntries).innerJoin(accountingPlans, eq(accountingPlans.id, accountingEntries.accountId))
    .innerJoin(employees, eq(employees.id, accountingEntries.authorId)).where(inArray(accountingEntries.transactionId, transactionIds)).orderBy(asc(accountingEntries.id));
}

export async function readFinanceAccountingOverview(db: DatabaseExecutor, entityIds: string[], budgetUnitIds: string[]) {
  const [transactions, monthly, annual] = await Promise.all([
    db.select().from(accountingTransactions).where(inArray(accountingTransactions.budgetUnitId, budgetUnitIds)).orderBy(desc(accountingTransactions.date)).limit(20),
    db.select({ close: monthlyAccountingCloses, financialYear: { year: financialYears.year } }).from(monthlyAccountingCloses).innerJoin(financialYears, eq(financialYears.id, monthlyAccountingCloses.financialYearId)).where(inArray(financialYears.governmentEntityId, entityIds)).orderBy(desc(monthlyAccountingCloses.competence)).limit(24),
    db.select({ close: annualAccountingCloses, financialYear: { year: financialYears.year }, closedByUsuario: { nome: users.nome } }).from(annualAccountingCloses).innerJoin(financialYears, eq(financialYears.id, annualAccountingCloses.financialYearId)).leftJoin(users, eq(users.id, annualAccountingCloses.closedByUsuarioId)).where(inArray(financialYears.governmentEntityId, entityIds)).orderBy(desc(annualAccountingCloses.createdAt)),
  ]);
  const requested = alias(users, "finance_page_requested"), authorized = alias(users, "finance_page_authorized");
  const [entries, events] = await Promise.all([
    readTransactionEntries(db, transactions.map(row => row.id)),
    db.select({ event: monthlyAccountingCloseEvents, requestedByUsuario: { nome: requested.nome }, authorizedByUsuario: { nome: authorized.nome } }).from(monthlyAccountingCloseEvents)
      .innerJoin(requested, eq(requested.id, monthlyAccountingCloseEvents.requestedByUsuarioId)).leftJoin(authorized, eq(authorized.id, monthlyAccountingCloseEvents.authorizedByUsuarioId))
      .where(inArray(monthlyAccountingCloseEvents.monthlyAccountingCloseId, monthly.map(row => row.close.id))).orderBy(desc(monthlyAccountingCloseEvents.createdAt)),
  ]);
  return {
    transactions: transactions.map(transaction => ({ ...transaction, entries: entries.filter(row => row.entry.transactionId === transaction.id).map(({ entry, account }) => ({ ...entry, account })) })),
    monthlyCloses: monthly.map(({ close, financialYear }) => ({ ...close, financialYear, events: events.filter(row => row.event.monthlyAccountingCloseId === close.id).map(({ event, requestedByUsuario, authorizedByUsuario }) => ({ ...event, requestedByUsuario, authorizedByUsuario })) })),
    annualCloses: annual.map(({ close, ...relations }) => ({ ...close, ...relations })),
  };
}

export async function readFinanceAnnualStages(db: DatabaseExecutor, entityIds: string[], yearIds: string[]) {
  const logs = (action: string, entityType?: string, limit?: number) => {
    const query = db.select({ id: financialAuditLogs.id, entityId: financialAuditLogs.entityId, financialYearId: financialAuditLogs.financialYearId,
      payload: sql<JsonValue>`${financialAuditLogs.payload}`, createdAt: financialAuditLogs.createdAt })
      .from(financialAuditLogs).where(and(inArray(financialAuditLogs.financialYearId, yearIds), eq(financialAuditLogs.action, action), entityType ? eq(financialAuditLogs.entityType, entityType) : undefined))
      .orderBy(desc(financialAuditLogs.createdAt)).$dynamic();
    return limit === undefined ? query : query.limit(limit);
  };
  const [editions, registrationStages, estimativeStages, extraStages, extraUndone, extraNotes, programStages, programUndone] = await Promise.all([
    logs("ANNUAL_BALANCE_EDITION", "AnnualBalanceEdition", 100),
    logs("ANNUAL_PAYABLE_STAGE_COMPLETE", "AnnualPayableRegistrationStage", 100),
    logs("ANNUAL_ESTIMATIVE_COMPLETE", "AnnualEstimativeStage", 100),
    logs("ANNUAL_EXTRA_TRANSPORT_COMPLETE", undefined, 100), logs("ANNUAL_EXTRA_TRANSPORT_UNDONE"), logs("ANNUAL_EXTRA_NOTE_COPY"),
    logs("ANNUAL_PAYMENT_PROGRAM_COMPLETE", undefined, 100), logs("ANNUAL_PAYMENT_PROGRAM_UNDONE"),
  ]);
  const programs = await db.select({ payment: payments, appropriation: { financialYearId: budgetAppropriations.financialYearId, budgetUnitId: budgetAppropriations.budgetUnitId } }).from(payments)
    .innerJoin(commitments, eq(commitments.id, payments.commitmentId)).innerJoin(budgetAppropriations, eq(budgetAppropriations.id, commitments.appropriationId))
    .innerJoin(planningEntityUnits, eq(planningEntityUnits.budgetUnitId, budgetAppropriations.budgetUnitId)).where(inArray(planningEntityUnits.governmentEntityId, entityIds)).orderBy(desc(payments.date));
  return {
    editions, registrationStages, estimativeStages, extraStages, extraUndone, extraNotes, programStages, programUndone,
    programs: programs.map(({ payment, appropriation }) => ({ ...payment, commitment: { appropriation } })),
  };
}

export async function readFinanceAccountingEntries(connection: DatabaseConnection, filters: AccountingPageFilters) {
  return withDatabaseTransaction(connection, async tx => {
    const where = and(eq(accountingTransactions.governmentEntityId, filters.governmentEntityId), eq(accountingTransactions.financialYearId, filters.financialYearId),
      inArray(accountingTransactions.financialYearId, tx.select({ id: financialYears.id }).from(financialYears).where(eq(financialYears.governmentEntityId, filters.governmentEntityId))),
      inArray(accountingTransactions.budgetUnitId, filters.budgetUnitIds), filters.sourceModule ? eq(accountingTransactions.sourceModule, filters.sourceModule) : undefined,
      filters.from ? gte(accountingTransactions.date, filters.from) : undefined, filters.through ? lte(accountingTransactions.date, filters.through) : undefined,
      filters.account ? sql`EXISTS (SELECT 1 FROM ${accountingEntries} INNER JOIN ${accountingPlans} ON ${accountingPlans.id}=${accountingEntries.accountId} WHERE ${accountingEntries.transactionId}=${accountingTransactions.id} AND ${or(ilike(accountingPlans.code, `%${filters.account}%`), ilike(accountingPlans.name, `%${filters.account}%`))})` : undefined,
      filters.q ? or(ilike(accountingTransactions.history, `%${filters.q}%`), ilike(accountingTransactions.sourceId, `%${filters.q}%`), ilike(accountingTransactions.eventType, `%${filters.q}%`)) : undefined);
    const [total] = await tx.select({ count: count() }).from(accountingTransactions).where(where);
    const transactions = await tx.select({ transaction: accountingTransactions, authorUsuario: { nome: users.nome }, budgetUnit: { code: planningBudgetUnitLabels.code, name: planningBudgetUnitLabels.name } }).from(accountingTransactions)
      .innerJoin(users, eq(users.id, accountingTransactions.authorUsuarioId)).leftJoin(planningBudgetUnitLabels, eq(planningBudgetUnitLabels.id, accountingTransactions.budgetUnitId))
      .where(where).orderBy(desc(accountingTransactions.date), desc(accountingTransactions.id)).limit(50).offset((filters.page - 1) * 50);
    const entries = await readTransactionEntries(tx, transactions.map(row => row.transaction.id));
    return { count: total.count, transactions: transactions.map(({ transaction, ...relations }) => ({ ...transaction, ...relations,
      entries: entries.filter(row => row.entry.transactionId === transaction.id).map(({ entry, account, author }) => ({ ...entry, account, author })) })) };
  }, { isolationLevel: "repeatable read", timeoutMs: 5_000 });
}
