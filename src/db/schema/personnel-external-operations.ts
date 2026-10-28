import { boolean, doublePrecision, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { createId } from '../ids';
import type { JsonValue } from '../json';

// Private physical projections. Historical SQL owns DDL, constraints and guards.
const at = (name: string) => timestamp(name, { precision: 3 });
export const externalBenefitConfigurations = pgTable('BenefitConfig', {
  id: text('id').primaryKey(), isActive: boolean('isActive').notNull().default(true),
});
export const externalBenefitAssignments = pgTable('PayrollBenefit', {
  id: text('id').primaryKey(), employeeId: text('employeeId').notNull(), benefitConfigId: text('benefitConfigId').notNull(),
  customValue: doublePrecision('customValue'), status: text('status').notNull().default('Ativo'),
});
export const externalBenefitVacations = pgTable('Vacation', {
  id: text('id').primaryKey(), employeeId: text('employeeId').notNull(), status: text('status').notNull().default('A vencer'),
  enjoymentStart: at('enjoymentStart'), enjoymentEnd: at('enjoymentEnd'),
});
export const externalBenefitLeaves = pgTable('Leave', {
  id: text('id').primaryKey(), employeeId: text('employeeId').notNull(), type: text('type').notNull(),
  status: text('status').notNull().default('Ativa'), startDate: at('startDate').notNull(), endDate: at('endDate').notNull(),
});
export const externalConnections = pgTable('IntegrationConnection', {
  id: text('id').primaryKey().$defaultFn(createId), code: text('code').notNull().unique(), name: text('name').notNull(),
  category: text('category').notNull(), provider: text('provider').notNull(), environment: text('environment').notNull().default('MOCK'), status: text('status').notNull().default('CONFIGURANDO'),
  baseUrl: text('baseUrl'), credentialReference: text('credentialReference'), configuration: jsonb('configuration').$type<JsonValue>(), mockScenario: jsonb('mockScenario').$type<JsonValue>(),
  lastTestedAt: at('lastTestedAt'), lastTestStatus: text('lastTestStatus'), lastTestMessage: text('lastTestMessage'),
  createdAt: at('createdAt').notNull().defaultNow(), updatedAt: at('updatedAt').notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
});
export const externalPayrollScopes = pgTable('SstBenefitPayrollScope', {
  payrollId: text('payrollId').primaryKey(), budgetUnitId: text('budgetUnitId').notNull(),
});
