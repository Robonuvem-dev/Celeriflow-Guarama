import { doublePrecision, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { createId } from '../src/db/ids';

// Minimal write projections for these synthetic seeds. Physical DDL remains in
// migrations-ibema; Finance's read-only projections do not supply write defaults.
const timestamps = () => ({
  id: text('id').primaryKey().$defaultFn(createId),
  updatedAt: timestamp('updatedAt', { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
});
export const seedBudgetUnits = pgTable('BudgetUnit', {
  ...timestamps(), code: text('code').notNull(), name: text('name').notNull(), secretariatId: text('secretariatId').notNull(),
});
export const seedResourceSources = pgTable('ResourceSource', {
  ...timestamps(), code: text('code').notNull(), name: text('name').notNull(),
});
export const seedExpenseNatures = pgTable('ExpenseNature', {
  ...timestamps(), code: text('code').notNull(), name: text('name').notNull(),
});
export const seedAppropriations = pgTable('BudgetAppropriation', {
  ...timestamps(), code: text('code').notNull(), financialYearId: text('financialYearId').notNull(), budgetUnitId: text('budgetUnitId').notNull(),
  expenseNatureId: text('expenseNatureId').notNull(), resourceSourceId: text('resourceSourceId').notNull(),
  initialValue: doublePrecision('initialValue').notNull().default(0), updatedValue: doublePrecision('updatedValue').notNull().default(0), committedValue: doublePrecision('committedValue').notNull().default(0),
});
export const seedCommitments = pgTable('Commitment', {
  ...timestamps(), number: text('number').notNull(), date: timestamp('date', { precision: 3 }).notNull().defaultNow(), value: doublePrecision('value').notNull(),
  type: text('type').notNull(), history: text('history').notNull(), appropriationId: text('appropriationId').notNull(), supplierId: text('supplierId').notNull(), status: text('status').notNull(),
});
