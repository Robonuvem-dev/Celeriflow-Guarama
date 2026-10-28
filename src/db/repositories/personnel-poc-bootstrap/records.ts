import { and, asc, eq, sql } from "drizzle-orm";
import { Decimal } from "../../decimal";
import type { DatabaseExecutor, DatabaseTransaction } from "../../transaction";
import { systemInstances } from "../../schema/instance-configuration";
import { employees, roles } from "../../schema/administration";
import { people } from "../../schema/people";
import { hrCalculationPolicies, hrEmploymentRegimes, hrPayrollRubricIncidences, hrPayrollRubrics, hrPayrollRules, hrPayrollRuleSets, hrSocialSecurityBands, hrSocialSecuritySchemes, hrVacationPolicies } from "../../schema/personnel-configuration";
import { hrEmploymentContracts, payrollEvents, payrolls } from "../../schema/personnel-workforce";

function required<T>(row: T | undefined): T {
  if (!row) throw new Error("Registro POC não encontrado após inclusão ou conflito de chave.");
  return row;
}

// Every writer composes the caller's real transaction. Empty legacy updates
// become DO NOTHING, then a separate statement reads the existing unique row.
export async function lockPocBootstrap(tx: DatabaseTransaction, key: "RH:POC:BOOTSTRAP:V1" | "RH:POC:DATASET:V1" | "RH:POC:CONTRACTS:V1") {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${key}))`);
}

export async function findFirstPocInstance(database: DatabaseExecutor) {
  const [instance] = await database.select().from(systemInstances).orderBy(asc(systemInstances.createdAt)).limit(1);
  return instance ?? null;
}

export async function createPocInstance(tx: DatabaseTransaction, data: typeof systemInstances.$inferInsert) {
  return required((await tx.insert(systemInstances).values(data).returning())[0]);
}

export async function ensurePocRuleSet(tx: DatabaseTransaction, data: Pick<typeof hrPayrollRuleSets.$inferSelect, "configuracaoInstanciaId" | "code" | "name" | "status" | "scope" | "isDemo" | "effectiveFrom" | "effectiveUntil" | "legalReference">) {
  await tx.insert(hrPayrollRuleSets).values(data).onConflictDoNothing({ target: [hrPayrollRuleSets.configuracaoInstanciaId, hrPayrollRuleSets.code, hrPayrollRuleSets.effectiveFrom] });
  return required((await tx.select().from(hrPayrollRuleSets).where(and(eq(hrPayrollRuleSets.configuracaoInstanciaId, data.configuracaoInstanciaId), eq(hrPayrollRuleSets.code, data.code), eq(hrPayrollRuleSets.effectiveFrom, data.effectiveFrom))).limit(1))[0]);
}

export async function ensurePocCalculationPolicy(tx: DatabaseTransaction, data: Pick<typeof hrCalculationPolicies.$inferSelect, "ruleSetId" | "roundingMode" | "roundingScale" | "negativeNetPayPolicy" | "freezeOnClose" | "legalReference"> & { maxConsignmentMarginRate: string }) {
  await tx.insert(hrCalculationPolicies).values({ ...data, maxConsignmentMarginRate: new Decimal(data.maxConsignmentMarginRate) }).onConflictDoNothing({ target: hrCalculationPolicies.ruleSetId });
  return required((await tx.select().from(hrCalculationPolicies).where(eq(hrCalculationPolicies.ruleSetId, data.ruleSetId)).limit(1))[0]);
}

export async function ensurePocSocialSecurityScheme(tx: DatabaseTransaction, data: Pick<typeof hrSocialSecuritySchemes.$inferSelect, "ruleSetId" | "code" | "name" | "regime" | "employeeCalculationMethod" | "legalReference"> & { ceilingValue: string; employerContributionRate: string }) {
  await tx.insert(hrSocialSecuritySchemes).values({ ...data, ceilingValue: new Decimal(data.ceilingValue), employerContributionRate: new Decimal(data.employerContributionRate) }).onConflictDoNothing({ target: [hrSocialSecuritySchemes.ruleSetId, hrSocialSecuritySchemes.code] });
  return required((await tx.select().from(hrSocialSecuritySchemes).where(and(eq(hrSocialSecuritySchemes.ruleSetId, data.ruleSetId), eq(hrSocialSecuritySchemes.code, data.code))).limit(1))[0]);
}

export async function insertPocSocialSecurityBands(tx: DatabaseTransaction, data: Array<Pick<typeof hrSocialSecurityBands.$inferSelect, "socialSecuritySchemeId" | "sequence"> & { lowerLimit: string; upperLimit: string | null; employeeRate: string }>) {
  if (!data.length) return;
  await tx.insert(hrSocialSecurityBands).values(data.map(band => ({ ...band, lowerLimit: new Decimal(band.lowerLimit), upperLimit: band.upperLimit === null ? null : new Decimal(band.upperLimit), employeeRate: new Decimal(band.employeeRate) }))).onConflictDoNothing();
}

export async function ensurePocVacationPolicy(tx: DatabaseTransaction, data: Pick<typeof hrVacationPolicies.$inferSelect, "ruleSetId" | "code" | "name" | "employmentNature" | "acquisitionMonths" | "concessionMonths" | "entitlementDays" | "maxSplits" | "minFirstSplitDays" | "minOtherSplitDays" | "allowsCashAbono" | "maxCashAbonoDays" | "requiresApproval" | "legalReference"> & { additionalPayRate: string }) {
  await tx.insert(hrVacationPolicies).values({ ...data, additionalPayRate: new Decimal(data.additionalPayRate) }).onConflictDoNothing({ target: [hrVacationPolicies.ruleSetId, hrVacationPolicies.code] });
  return required((await tx.select().from(hrVacationPolicies).where(and(eq(hrVacationPolicies.ruleSetId, data.ruleSetId), eq(hrVacationPolicies.code, data.code))).limit(1))[0]);
}

export async function ensurePocEmploymentRegime(tx: DatabaseTransaction, data: Pick<typeof hrEmploymentRegimes.$inferSelect, "ruleSetId" | "code" | "name" | "employmentNature" | "esocialCategory" | "defaultMonthlyHours" | "socialSecuritySchemeId" | "vacationPolicyId" | "legalReference">) {
  await tx.insert(hrEmploymentRegimes).values(data).onConflictDoNothing({ target: [hrEmploymentRegimes.ruleSetId, hrEmploymentRegimes.code] });
  return required((await tx.select().from(hrEmploymentRegimes).where(and(eq(hrEmploymentRegimes.ruleSetId, data.ruleSetId), eq(hrEmploymentRegimes.code, data.code))).limit(1))[0]);
}

export async function ensurePocPayrollRubric(tx: DatabaseTransaction, data: Pick<typeof hrPayrollRubrics.$inferSelect, "ruleSetId" | "code" | "name" | "type" | "calculationMethod" | "formulaExpression" | "priority" | "legalReference">) {
  await tx.insert(hrPayrollRubrics).values(data).onConflictDoNothing({ target: [hrPayrollRubrics.ruleSetId, hrPayrollRubrics.code] });
  return required((await tx.select().from(hrPayrollRubrics).where(and(eq(hrPayrollRubrics.ruleSetId, data.ruleSetId), eq(hrPayrollRubrics.code, data.code))).limit(1))[0]);
}

export async function insertPocRubricIncidences(tx: DatabaseTransaction, data: Array<Pick<typeof hrPayrollRubricIncidences.$inferSelect, "rubricId" | "incidenceType" | "isIncluded">>) {
  if (!data.length) return;
  await tx.insert(hrPayrollRubricIncidences).values(data).onConflictDoNothing();
}

export async function ensurePocPayrollEvent(tx: DatabaseTransaction, data: Pick<typeof payrollEvents.$inferSelect, "code" | "name" | "type" | "isActive">) {
  await tx.insert(payrollEvents).values(data).onConflictDoNothing({ target: payrollEvents.code });
  return required((await tx.select().from(payrollEvents).where(eq(payrollEvents.code, data.code)).limit(1))[0]);
}

export async function ensurePocPayrollRule(tx: DatabaseTransaction, data: Pick<typeof hrPayrollRules.$inferSelect, "ruleSetId" | "code" | "name" | "category" | "valueType" | "value" | "legalReference" | "isActive">) {
  await tx.insert(hrPayrollRules).values(data).onConflictDoNothing({ target: [hrPayrollRules.ruleSetId, hrPayrollRules.code] });
  return required((await tx.select().from(hrPayrollRules).where(and(eq(hrPayrollRules.ruleSetId, data.ruleSetId), eq(hrPayrollRules.code, data.code))).limit(1))[0]);
}

export async function ensurePocRole(tx: DatabaseTransaction, data: Pick<typeof roles.$inferSelect, "id" | "name" | "description" | "isActive">) {
  await tx.insert(roles).values(data).onConflictDoNothing({ target: roles.id });
  return required((await tx.select().from(roles).where(eq(roles.id, data.id)).limit(1))[0]);
}

export async function findPocPersonByCpf(database: DatabaseExecutor, cpf: string) {
  const [person] = await database.select().from(people).where(eq(people.cpf, cpf)).limit(1);
  return person ?? null;
}

export async function ensurePocPerson(tx: DatabaseTransaction, data: Pick<typeof people.$inferSelect, "id" | "cpf" | "fullName" | "birthDate" | "status" | "nationality">) {
  await tx.insert(people).values(data).onConflictDoNothing({ target: people.id });
  return required((await tx.select().from(people).where(eq(people.id, data.id)).limit(1))[0]);
}

export async function ensurePocEmployee(tx: DatabaseTransaction, data: Pick<typeof employees.$inferSelect, "id" | "personId" | "cpf" | "name" | "registration" | "roleId" | "isActive">) {
  await tx.insert(employees).values(data).onConflictDoNothing({ target: employees.id });
  return required((await tx.select().from(employees).where(eq(employees.id, data.id)).limit(1))[0]);
}

export async function ensurePocPayroll(tx: DatabaseTransaction, data: Pick<typeof payrolls.$inferSelect, "id" | "competence" | "type" | "status">) {
  await tx.insert(payrolls).values(data).onConflictDoNothing({ target: payrolls.id });
  return required((await tx.select().from(payrolls).where(eq(payrolls.id, data.id)).limit(1))[0]);
}

export async function findPocContract(database: DatabaseExecutor, registration: string, employeeId: string) {
  const [contract] = await database.select().from(hrEmploymentContracts).where(and(eq(hrEmploymentContracts.registration, registration), eq(hrEmploymentContracts.employeeId, employeeId))).limit(1);
  return contract ?? null;
}
