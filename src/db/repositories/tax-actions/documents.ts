import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import { users } from "@/db/schema/identity";
import { institutions, employees } from "@/db/schema/administration";
import { companies, taxpayers } from "@/db/schema/registry";
import { people } from "@/db/schema/people";
import { itbiDeclarations, itbiTransactionTypes, itbiParties, itbiEvents } from "@/db/schema/tax-itbi";
import { taxes, taxAssessments, taxGuides } from "@/db/schema/taxation-core";
import { pagePayments } from "@/db/schema/taxation-pages";
import { fiscalDocuments, fiscalOrders, fiscalProductivityPeriods } from "@/db/schema/taxation-inspection";
import { actionActiveDebts, actionCdaVersions, actionDebtEvents, actionExclusions, actionAgreements, actionInstallmentRules, actionQuotas, actionBenefitGrants } from "@/db/schema/tax-actions";
import { pageBenefitRules } from "@/db/schema/taxation-pages";
import { taxIntegrationEvents } from "@/db/schema/tax-accounting";

export async function actionActorName(database: DatabaseExecutor, id: string) {
  return (await database.select({ nome: users.nome }).from(users).where(eq(users.id, id)).limit(1))[0] ?? null;
}
export async function actionTaxpayerParties(database: DatabaseExecutor, ids: string[]) {
  return database.select({ id: taxpayers.id, person: { fullName: people.fullName, cpf: people.cpf }, company: { corporateName: companies.corporateName, cnpj: companies.cnpj } }).from(taxpayers).leftJoin(people, eq(people.id, taxpayers.personId)).leftJoin(companies, eq(companies.id, taxpayers.companyId)).where(inArray(taxpayers.id, ids));
}
export async function actionItbiDocument(database: DatabaseExecutor, id: string, allowed?: string[]) {
  const [row] = await database.select({ declaration: itbiDeclarations, transactionType: itbiTransactionTypes }).from(itbiDeclarations).innerJoin(itbiTransactionTypes, eq(itbiTransactionTypes.id, itbiDeclarations.transactionTypeId)).where(and(eq(itbiDeclarations.id, id), allowed === undefined ? undefined : allowed.length ? sql`${itbiDeclarations.calculationSnapshot}->'budgetUnitId' IN (${sql.join(allowed.map(unit => sql`${JSON.stringify(unit)}::jsonb`), sql`, `)})` : sql`false`)).limit(1);
  if (!row) return null;
  const [parties, events] = await Promise.all([database.select().from(itbiParties).where(eq(itbiParties.declarationId, id)), database.select().from(itbiEvents).where(eq(itbiEvents.declarationId, id)).orderBy(asc(itbiEvents.createdAt))]);
  return { ...row.declaration, transactionType: row.transactionType, parties, events };
}
export async function actionExclusion(database: DatabaseExecutor, id: string) {
  return (await database.select().from(actionExclusions).where(eq(actionExclusions.id, id)).limit(1))[0] ?? null;
}
export async function actionGuideDocument(database: DatabaseExecutor, id: string) {
  const [row] = await database.select({ guide: taxGuides, assessment: taxAssessments, tax: taxes }).from(taxGuides).innerJoin(taxAssessments, eq(taxAssessments.id, taxGuides.assessmentId)).innerJoin(taxes, eq(taxes.id, taxAssessments.taxId)).where(eq(taxGuides.id, id)).limit(1);
  if (!row) return null;
  const [parties, payments] = await Promise.all([actionTaxpayerParties(database, [row.assessment.taxpayerId]), database.select().from(pagePayments).where(and(eq(pagePayments.guideId, id), eq(pagePayments.status, "Confirmado"))).orderBy(asc(pagePayments.paymentDate))]);
  if (!parties[0]) throw new Error("Contribuinte não encontrado.");
  return { ...row.guide, assessment: { ...row.assessment, tax: row.tax, taxpayer: parties[0] }, payments };
}
export async function actionPixCharge(database: DatabaseExecutor, guideId: string) {
  return (await database.select().from(taxIntegrationEvents).where(and(eq(taxIntegrationEvents.integrationCode, "PIX_ADAPTER"), sql`${taxIntegrationEvents.payload}->'guideId'=${JSON.stringify(guideId)}::jsonb`)).orderBy(desc(taxIntegrationEvents.createdAt)).limit(1))[0] ?? null;
}
export async function actionCdaDocument(database: DatabaseExecutor, id: string) {
  const [debt] = await database.select().from(actionActiveDebts).where(eq(actionActiveDebts.id, id)).limit(1);
  const [institution] = await database.select({ name: institutions.name, legalName: institutions.legalName, cnpj: institutions.cnpj, city: institutions.city, state: institutions.state }).from(institutions).limit(1);
  if (!debt) return { debt: null, institution, versions: [], events: [] };
  const [parties, versions, events] = await Promise.all([actionTaxpayerParties(database, [debt.taxpayerId]), database.select().from(actionCdaVersions).where(eq(actionCdaVersions.activeDebtId, id)).orderBy(asc(actionCdaVersions.versionNumber)), database.select().from(actionDebtEvents).where(eq(actionDebtEvents.activeDebtId, id)).orderBy(desc(actionDebtEvents.createdAt)).limit(30)]);
  if (!parties[0]) throw new Error("Contribuinte não encontrado.");
  return { debt: { ...debt, taxpayer: parties[0] }, institution, versions, events };
}
export async function actionFiscalDocument(database: DatabaseExecutor, id: string) {
  const [row] = await database.select({ document: fiscalDocuments, order: fiscalOrders }).from(fiscalDocuments).innerJoin(fiscalOrders, eq(fiscalOrders.id, fiscalDocuments.orderId)).where(eq(fiscalDocuments.id, id)).limit(1);
  return row ? { ...row.document, order: row.order } : null;
}
export async function actionProductivityReport(database: DatabaseExecutor, competence: string, employeeId?: string) {
  const periods = await database.select().from(fiscalProductivityPeriods).where(and(eq(fiscalProductivityPeriods.competence, competence), employeeId === undefined ? undefined : eq(fiscalProductivityPeriods.employeeId, employeeId))).orderBy(asc(fiscalProductivityPeriods.employeeId));
  const names = await database.select({ id: employees.id, name: employees.name }).from(employees).where(inArray(employees.id, periods.map(row => row.employeeId)));
  return { periods, employees: names };
}
export async function actionBenefitReport(database: DatabaseExecutor) {
  const rows = await database.select({ grant: actionBenefitGrants, rule: { name: pageBenefitRules.name, legalReference: pageBenefitRules.legalReference } }).from(actionBenefitGrants).innerJoin(pageBenefitRules, eq(pageBenefitRules.id, actionBenefitGrants.ruleId)).orderBy(desc(actionBenefitGrants.grantedAt));
  return rows.map(row => ({ ...row.grant, rule: row.rule }));
}
export async function actionInstallmentReport(database: DatabaseExecutor, id?: string) {
  const rows = await database.select({ agreement: actionAgreements, rule: actionInstallmentRules }).from(actionAgreements).innerJoin(actionInstallmentRules, eq(actionInstallmentRules.id, actionAgreements.ruleId)).where(id === undefined ? undefined : eq(actionAgreements.id, id)).orderBy(desc(actionAgreements.createdAt));
  const quotas = await database.select().from(actionQuotas).where(inArray(actionQuotas.agreementId, rows.map(row => row.agreement.id))).orderBy(asc(actionQuotas.quotaNumber));
  return rows.map(row => ({ ...row.agreement, rule: row.rule, quotas: quotas.filter(quota => quota.agreementId === row.agreement.id) }));
}
