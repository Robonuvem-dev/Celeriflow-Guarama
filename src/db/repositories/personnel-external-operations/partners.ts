import { and, asc, desc, eq, getTableColumns, gte, inArray, isNull, lte, or } from 'drizzle-orm';
import type { DatabaseExecutor, DatabaseTransaction } from '../../transaction';
import { hrEmploymentContracts, hrIntegrationEvents, hrPayrollRuns } from '../../schema/personnel-workforce';
import { hrPayrollRules, hrPayrollRuleSets } from '../../schema/personnel-configuration';
import { hrConsignmentAgreements as agreements, hrConsignmentInstallments as installments, hrConsignmentEntries as entries } from '../../schema/personnel-consignment';
import { employees } from '../../schema/administration';
import { planningBudgetUnits as units } from '../../schema/planning-budget';
import { externalPayrollScopes } from '../../schema/personnel-external-operations';
import type { PartnerDiscountAgreement, PartnerDiscountGrant } from '@/lib/contracts/personnel-external-operations';

export function readPartnerPortalRules(db: DatabaseExecutor, now: Date) {
  return db.select({ id: hrPayrollRules.id, name: hrPayrollRules.name, value: hrPayrollRules.value }).from(hrPayrollRules).innerJoin(hrPayrollRuleSets, eq(hrPayrollRuleSets.id, hrPayrollRules.ruleSetId))
    .where(and(eq(hrPayrollRules.category, 'PORTAL'), eq(hrPayrollRules.valueType, 'JSON'), eq(hrPayrollRules.isActive, true), eq(hrPayrollRuleSets.status, 'ATIVA'), lte(hrPayrollRuleSets.effectiveFrom, now), or(isNull(hrPayrollRuleSets.effectiveUntil), gte(hrPayrollRuleSets.effectiveUntil, now)))).orderBy(asc(hrPayrollRules.name));
}
export function readPartnerContractOptions(db: DatabaseExecutor, ids: string[]) {
  return db.select({ id: hrEmploymentContracts.id, registration: hrEmploymentContracts.registration, employee: { name: employees.name, secretariatId: employees.secretariatId } }).from(hrEmploymentContracts)
    .innerJoin(employees, eq(employees.id, hrEmploymentContracts.employeeId)).where(and(inArray(hrEmploymentContracts.id, ids), eq(employees.isActive, true)));
}
export function readPartnerUnits(db: DatabaseExecutor, ids: string[]) {
  return db.select({ id: units.id, secretariatId: units.secretariatId }).from(units).where(inArray(units.id, ids));
}
export async function requirePartnerContract(db: DatabaseExecutor, id: string) {
  const [contract] = await db.select({ ...getTableColumns(hrEmploymentContracts), employee: { secretariatId: employees.secretariatId } }).from(hrEmploymentContracts).innerJoin(employees, eq(employees.id, hrEmploymentContracts.employeeId)).where(eq(hrEmploymentContracts.id, id)).limit(1);
  if (!contract) throw new Error('Contrato não encontrado.');
  return contract;
}
export async function requirePartnerUnit(db: DatabaseExecutor, id: string) {
  const [unit] = await db.select({ id: units.id, secretariatId: units.secretariatId }).from(units).where(eq(units.id, id)).limit(1);
  if (!unit) throw new Error('Unidade gestora não encontrada.');
  return unit;
}
export async function requirePartnerReferenceRun(db: DatabaseExecutor, id: string) {
  const [run] = await db.select({ payrollId: hrPayrollRuns.payrollId }).from(hrPayrollRuns).where(eq(hrPayrollRuns.id, id)).limit(1);
  if (!run) throw new Error('Cálculo não encontrado.');
  return run;
}
export async function findPartnerPayrollScope(db: DatabaseExecutor, payrollId: string) {
  return (await db.select().from(externalPayrollScopes).where(eq(externalPayrollScopes.payrollId, payrollId)).limit(1))[0] ?? null;
}
export async function markPartnerEventProcessed(tx: DatabaseTransaction, id: string): Promise<void> {
  await tx.update(hrIntegrationEvents).set({ status: 'PROCESSADO' }).where(eq(hrIntegrationEvents.id, id));
}
export async function readPartnerAgreements(db: DatabaseExecutor, grants: PartnerDiscountGrant[]): Promise<PartnerDiscountAgreement[]> {
  if (!grants.length) return [];
  const rows = await db.select().from(agreements).where(or(...grants.map(grant => and(eq(agreements.supplierId, grant.policy.supplierId), inArray(agreements.contractId, grant.contracts.map(contract => contract.id)), eq(agreements.sourceRunId, grant.policy.sourceRunId))))).orderBy(desc(agreements.createdAt), asc(agreements.id));
  const schedules = rows.length ? await db.select().from(installments).where(inArray(installments.agreementId, rows.map(row => row.id))).orderBy(asc(installments.sequence)) : [];
  const kinds = schedules.length ? await db.select({ installmentId: entries.installmentId, kind: entries.kind }).from(entries).where(inArray(entries.installmentId, schedules.map(row => row.id))) : [];
  return rows.map(row => ({ ...row, installments: schedules.filter(schedule => schedule.agreementId === row.id).map(schedule => ({ ...schedule, entries: kinds.filter(entry => entry.installmentId === schedule.id).map(entry => ({ kind: entry.kind })) })) }));
}
export async function findPartnerInstallment(db: DatabaseExecutor, id: string, grant: PartnerDiscountGrant) {
  return (await db.select({ id: installments.id }).from(installments).innerJoin(agreements, eq(agreements.id, installments.agreementId)).where(and(eq(installments.id, id), eq(agreements.supplierId, grant.policy.supplierId), inArray(agreements.contractId, grant.contracts.map(contract => contract.id)), eq(agreements.sourceRunId, grant.policy.sourceRunId))).limit(1))[0] ?? null;
}
