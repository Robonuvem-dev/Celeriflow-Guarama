import { and, asc, desc, eq, getTableColumns, inArray, like, or, sql } from 'drizzle-orm';
import type { DatabaseExecutor } from '../../transaction';
import { hrEmploymentRegimes, hrPayrollRules, hrPayrollRuleSets, hrPayrollRubrics, hrPayrollRubricIncidences, hrVacationPolicies, hrCalculationPolicies, hrSocialSecuritySchemes, hrSocialSecurityBands } from '../../schema/personnel-configuration';
import { hrPortalRequests, hrEmploymentContracts } from '../../schema/personnel-workforce';
import { planningBudgetUnits } from '../../schema/planning-budget';
import { employees } from '../../schema/administration';
import { documentClasses } from '../../schema/document-workflow';
import { integrationConnections } from '../../schema/integrations';
import { hrExternalConfigurationSchema } from '@/lib/rh/external-configuration';
import { isSystemAdministrator } from '@/lib/platform/tenant-context';
import type { PermissionUser } from '@/lib/contracts/identity';
import type { PayrollRule, PayrollRuleSet, BudgetUnitOption, HrPortalRequest, EmploymentRegime, EmploymentContract, PayrollSettingsRuleSet, RuleSetOption } from '@/lib/contracts/personnel-pages';

export function readActiveRuleSets(db: DatabaseExecutor): Promise<Array<{ id: string; name: string }>> {
  return db.select({ id: hrPayrollRuleSets.id, name: hrPayrollRuleSets.name }).from(hrPayrollRuleSets).where(eq(hrPayrollRuleSets.status, 'ATIVA')).orderBy(asc(hrPayrollRuleSets.name));
}
export function readPersonnelBudgetUnits(db: DatabaseExecutor, user: PermissionUser, order: 'name' | 'code' = 'name'): Promise<BudgetUnitOption[]> {
  return db.select().from(planningBudgetUnits).where(isSystemAdministrator(user) ? undefined : inArray(planningBudgetUnits.id, user.allowedBudgetUnitIds)).orderBy(asc(order === 'name' ? planningBudgetUnits.name : planningBudgetUnits.code));
}
export function readPortalRules(db: DatabaseExecutor, kind: 'career' | 'recruitment' | 'payroll' | 'service' | 'management'): Promise<PayrollRule[]> {
  const condition = kind === 'career' ? and(eq(hrPayrollRules.valueType, 'JSON'), or(like(hrPayrollRules.code, 'PORTAL_CURSO_%'), like(hrPayrollRules.code, 'PORTAL_AVALIACAO_%'))) : kind === 'recruitment' ? like(hrPayrollRules.code, 'PORTAL_EDITAL_%') : and(eq(hrPayrollRules.valueType, 'JSON'), kind === 'payroll' ? like(hrPayrollRules.code, 'PORTAL_FOLHA_%') : kind === 'service' ? like(hrPayrollRules.code, 'PORTAL_SERVICO_%') : undefined);
  const order = kind === 'payroll' || kind === 'management' ? [asc(hrPayrollRules.name)] : [asc(hrPayrollRules.name), asc(hrPayrollRules.id)];
  return db.select().from(hrPayrollRules).where(and(eq(hrPayrollRules.category, 'PORTAL'), condition)).orderBy(...order);
}
export function readCareerRequests(db: DatabaseExecutor, kind: 'enrollments' | 'assessments'): Promise<HrPortalRequest[]> {
  return db.select().from(hrPortalRequests).where(and(eq(hrPortalRequests.kind, kind === 'enrollments' ? 'CAPACITACAO_INSCRICAO' : 'AVALIACAO_FUNCIONAL'), eq(hrPortalRequests.status, kind === 'enrollments' ? 'INSCRITA' : 'AVALIADA'))).orderBy(desc(hrPortalRequests.createdAt), asc(hrPortalRequests.id));
}
export async function readCampaignConfiguration(db: DatabaseExecutor, user: PermissionUser, edit?: string): Promise<{ units: BudgetUnitOption[]; ruleSets: Array<{ id: string; name: string }>; employees: Array<{ id: string; name: string; registration: string | null; secretariatId: string | null }>; classes: Array<{ code: string; label: string }>; rule: PayrollRule | null }> {
  const units = await readPersonnelBudgetUnits(db, user);
  const ruleSets = await readActiveRuleSets(db);
  const employeeRows = await db.select({ id: employees.id, name: employees.name, registration: employees.registration, secretariatId: employees.secretariatId }).from(employees).where(and(eq(employees.isActive, true), inArray(employees.secretariatId, units.map(unit => unit.secretariatId)))).orderBy(asc(employees.name));
  const classes = await db.select({ code: documentClasses.code, label: documentClasses.label }).from(documentClasses).where(eq(documentClasses.isActive, true)).orderBy(asc(documentClasses.label));
  const rule = edit ? (await db.select().from(hrPayrollRules).where(and(eq(hrPayrollRules.id, edit), eq(hrPayrollRules.category, 'PORTAL'))).limit(1))[0] ?? null : null;
  return { units, ruleSets, employees: employeeRows, classes, rule };
}
export async function readPensionConfiguration(db: DatabaseExecutor): Promise<{ sets: Array<PayrollRuleSet & { rules: PayrollRule[] }>; regimes: Array<{ id: string; ruleSetId: string }>; contracts: Array<EmploymentContract & { employee: { name: string; personId: string | null } }> }> {
  const sets = await db.select().from(hrPayrollRuleSets).where(and(eq(hrPayrollRuleSets.isDemo, true), eq(hrPayrollRuleSets.scope, 'DEMONSTRACAO'), eq(hrPayrollRuleSets.status, 'ATIVA'))).orderBy(asc(hrPayrollRuleSets.code));
  const rules = sets.length ? await db.select().from(hrPayrollRules).where(and(inArray(hrPayrollRules.ruleSetId, sets.map(set => set.id)), eq(hrPayrollRules.code, 'PENSOES_FOLHA'))) : [];
  const regimes = await db.select({ id: hrEmploymentRegimes.id, ruleSetId: hrEmploymentRegimes.ruleSetId }).from(hrEmploymentRegimes).where(inArray(hrEmploymentRegimes.ruleSetId, sets.map(set => set.id)));
  const contracts = await db.select({ ...getTableColumns(hrEmploymentContracts), employee: { name: employees.name, personId: employees.personId } }).from(hrEmploymentContracts).innerJoin(employees, eq(employees.id, hrEmploymentContracts.employeeId)).where(inArray(hrEmploymentContracts.regimeId, regimes.map(regime => regime.id))).orderBy(asc(hrEmploymentContracts.registration));
  return { sets: sets.map(set => ({ ...set, rules: rules.filter(rule => rule.ruleSetId === set.id) })), regimes, contracts };
}
export async function readContractRegimes(db: DatabaseExecutor): Promise<Array<EmploymentRegime & { ruleSet: PayrollRuleSet & { rules: PayrollRule[] } }>> {
  const regimes = await db.select({ regime: hrEmploymentRegimes, ruleSet: hrPayrollRuleSets }).from(hrEmploymentRegimes).innerJoin(hrPayrollRuleSets, eq(hrPayrollRuleSets.id, hrEmploymentRegimes.ruleSetId)).where(eq(hrEmploymentRegimes.isActive, true)).orderBy(asc(hrEmploymentRegimes.code));
  const rules = regimes.length ? await db.select().from(hrPayrollRules).where(and(inArray(hrPayrollRules.ruleSetId, regimes.map(row => row.ruleSet.id)), eq(hrPayrollRules.code, 'CAMPOS_CONTRATO'), eq(hrPayrollRules.isActive, true))) : [];
  return regimes.map(({ regime, ruleSet }) => ({ ...regime, ruleSet: { ...ruleSet, rules: rules.filter(rule => rule.ruleSetId === ruleSet.id) } }));
}
export async function readInstanceRuleSets(db: DatabaseExecutor): Promise<{ instance: { id: string } | null; ruleSets: RuleSetOption[] }> {
  const instance = (await db.execute<{ id: string }>(sql`SELECT id FROM "ConfiguracaoInstancia" ORDER BY "createdAt" ASC LIMIT 1`)).rows[0] ?? null;
  const ruleSets = instance ? await db.select({ id: hrPayrollRuleSets.id, code: hrPayrollRuleSets.code, name: hrPayrollRuleSets.name, status: hrPayrollRuleSets.status, scope: hrPayrollRuleSets.scope, effectiveFrom: hrPayrollRuleSets.effectiveFrom, effectiveUntil: hrPayrollRuleSets.effectiveUntil, legalReference: hrPayrollRuleSets.legalReference, notes: hrPayrollRuleSets.notes, isDemo: hrPayrollRuleSets.isDemo }).from(hrPayrollRuleSets).where(eq(hrPayrollRuleSets.configuracaoInstanciaId, instance.id)).orderBy(asc(hrPayrollRuleSets.status), desc(hrPayrollRuleSets.effectiveFrom), desc(hrPayrollRuleSets.createdAt)) : [];
  return { instance, ruleSets };
}
export async function readPayrollSettingsRuleSet(db: DatabaseExecutor, id: string, instanceId?: string): Promise<PayrollSettingsRuleSet | null> {
  const [ruleSet] = await db.select().from(hrPayrollRuleSets).where(and(eq(hrPayrollRuleSets.id, id), instanceId ? eq(hrPayrollRuleSets.configuracaoInstanciaId, instanceId) : undefined)).limit(1);
  if (!ruleSet) return null;
  const rules = await db.select().from(hrPayrollRules).where(eq(hrPayrollRules.ruleSetId, id)).orderBy(asc(hrPayrollRules.category), asc(hrPayrollRules.sortOrder), asc(hrPayrollRules.code));
  const rubrics = await db.select().from(hrPayrollRubrics).where(eq(hrPayrollRubrics.ruleSetId, id)).orderBy(asc(hrPayrollRubrics.priority), asc(hrPayrollRubrics.code));
  const incidences = rubrics.length ? await db.select().from(hrPayrollRubricIncidences).where(inArray(hrPayrollRubricIncidences.rubricId, rubrics.map(rubric => rubric.id))).orderBy(asc(hrPayrollRubricIncidences.incidenceType)) : [];
  const vacationPolicies = await db.select().from(hrVacationPolicies).where(eq(hrVacationPolicies.ruleSetId, id)).orderBy(asc(hrVacationPolicies.employmentNature), asc(hrVacationPolicies.code));
  const schemes = await db.select().from(hrSocialSecuritySchemes).where(eq(hrSocialSecuritySchemes.ruleSetId, id)).orderBy(asc(hrSocialSecuritySchemes.regime), asc(hrSocialSecuritySchemes.code));
  const bands = schemes.length ? await db.select().from(hrSocialSecurityBands).where(inArray(hrSocialSecurityBands.socialSecuritySchemeId, schemes.map(scheme => scheme.id))).orderBy(asc(hrSocialSecurityBands.sequence)) : [];
  const [calculationPolicy] = await db.select().from(hrCalculationPolicies).where(eq(hrCalculationPolicies.ruleSetId, id)).limit(1);
  const employmentRegimes = await db.select().from(hrEmploymentRegimes).where(eq(hrEmploymentRegimes.ruleSetId, id)).orderBy(asc(hrEmploymentRegimes.employmentNature), asc(hrEmploymentRegimes.code));
  return { ...ruleSet, rules, rubrics: rubrics.map(rubric => ({ ...rubric, incidences: incidences.filter(incidence => incidence.rubricId === rubric.id) })), vacationPolicies, socialSecuritySchemes: schemes.map(scheme => ({ ...scheme, bands: bands.filter(band => band.socialSecuritySchemeId === scheme.id) })), calculationPolicy: calculationPolicy ?? null, employmentRegimes };
}
export function readPositionPlanRules(db: DatabaseExecutor): Promise<Array<{ id: string; isActive: boolean; ruleSet: { name: string; scope: string } }>> {
  return db.select({ id: hrPayrollRules.id, isActive: hrPayrollRules.isActive, ruleSet: { name: hrPayrollRuleSets.name, scope: hrPayrollRuleSets.scope } }).from(hrPayrollRules).innerJoin(hrPayrollRuleSets, eq(hrPayrollRuleSets.id, hrPayrollRules.ruleSetId)).where(eq(hrPayrollRules.code, 'QUADRO_CARGOS')).orderBy(asc(hrPayrollRules.id));
}
export async function readRecertificationAudience(db: DatabaseExecutor, user: PermissionUser): Promise<{ employeeIds: string[]; budgetUnitIds: string[] } | undefined> {
  if (isSystemAdministrator(user)) return undefined;
  const units = await db.select({ secretariatId: planningBudgetUnits.secretariatId }).from(planningBudgetUnits).where(inArray(planningBudgetUnits.id, user.allowedBudgetUnitIds));
  const rows = await db.select({ id: employees.id }).from(employees).where(inArray(employees.secretariatId, units.map(unit => unit.secretariatId)));
  return { employeeIds: rows.map(employee => employee.id), budgetUnitIds: user.allowedBudgetUnitIds };
}
export async function readPersonnelExternalReadiness(db: DatabaseExecutor): Promise<Array<{ environment: string; configured: boolean; transmissionAvailable: boolean; status: string; issues: string[] }>> {
  const connections = await db.select({ environment: integrationConnections.environment, configuration: integrationConnections.configuration, credentialReference: integrationConnections.credentialReference, status: integrationConnections.status }).from(integrationConnections).where(inArray(integrationConnections.code, ['ESOCIAL_RH_PRODUCAO_RESTRITA', 'ESOCIAL_RH_PRODUCAO'])).orderBy(asc(integrationConnections.code));
  return ['PRODUCAO_RESTRITA', 'PRODUCAO'].map(environment => {
    const connection = connections.find(row => row.environment === environment);
    const configuration = connection?.configuration && typeof connection.configuration === 'object' && !Array.isArray(connection.configuration) ? connection.configuration : {};
    const parsed = hrExternalConfigurationSchema.safeParse({ ...configuration, credentialReference: connection?.credentialReference });
    return { environment, configured: parsed.success, transmissionAvailable: false, status: connection?.status || 'NAO_CONFIGURADO', issues: parsed.success ? ['CLIENTE_XML_XSD_XMLDSIG_MTLS_E_WORKER_PENDENTES'] : ['PARAMETROS_CERTIFICADO_E_LAYOUT_PENDENTES', 'CLIENTE_XML_XSD_XMLDSIG_MTLS_E_WORKER_PENDENTES'] };
  });
}
