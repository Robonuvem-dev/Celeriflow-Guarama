import { and, asc, count, desc, eq, getTableColumns, ilike, inArray, isNotNull, isNull, like, or, sql } from 'drizzle-orm';
import type { DatabaseExecutor } from '../../transaction';
import { hrEmploymentContracts as contracts, hrEmploymentRevisions as revisions, hrMovements as movements, hrRightEntries as rights, hrPayrollRuns as runs, hrPayrollStatements as statements, hrIntegrationEvents as events, payrolls } from '../../schema/personnel-workforce';
import { hrPayrollRules, hrPayrollRuleSets, hrEmploymentRegimes } from '../../schema/personnel-configuration';
import { hrConsignmentAgreements as agreements, hrConsignmentInstallments as installments, hrConsignmentEntries as entries } from '../../schema/personnel-consignment';
import { employees, roles } from '../../schema/administration';
import { accessiblePayrollWhere } from '@/lib/rh/payroll-access';
import type { PermissionUser } from '@/lib/contracts/identity';
import type { ConsignmentRow, EmploymentContract, EmploymentRevision, PayrollRun, PayrollStatement, Payroll, Employee, PayrollRule, PayrollRuleSet, IntegrationEvent, Movement, RightEntry, WorkforceOperationsPage } from '@/lib/contracts/personnel-pages';
import { personnelPageNumber } from './requests';
import { readContractRegimes } from './catalog';

type ContractWithEmployee = EmploymentContract & { employee: Employee };
type RunWithPayroll = PayrollRun & { payroll: Payroll };
export async function readConsignmentsPage(db: DatabaseExecutor, user: PermissionUser, q: string, requestedPage?: string): Promise<{ rows: ConsignmentRow[]; total: number; page: number }> {
  const where = and(accessiblePayrollWhere(user), q ? or(ilike(agreements.number, `%${q}%`), ilike(contracts.registration, `%${q}%`), ilike(employees.name, `%${q}%`)) : undefined);
  const [{ total }] = await db.select({ total: count() }).from(agreements).innerJoin(contracts, eq(contracts.id, agreements.contractId)).innerJoin(employees, eq(employees.id, contracts.employeeId)).innerJoin(runs, eq(runs.id, agreements.sourceRunId)).innerJoin(payrolls, eq(payrolls.id, runs.payrollId)).where(where);
  const page = personnelPageNumber(requestedPage, total);
  const rows = await db.select({ agreement: agreements, contract: contracts, employeeName: employees.name }).from(agreements).innerJoin(contracts, eq(contracts.id, agreements.contractId)).innerJoin(employees, eq(employees.id, contracts.employeeId)).innerJoin(runs, eq(runs.id, agreements.sourceRunId)).innerJoin(payrolls, eq(payrolls.id, runs.payrollId)).where(where).orderBy(desc(agreements.createdAt), asc(agreements.id)).limit(20).offset((page - 1) * 20);
  const installmentRows = rows.length ? await db.select().from(installments).where(inArray(installments.agreementId, rows.map(row => row.agreement.id))).orderBy(asc(installments.sequence)) : [];
  const entryRows = installmentRows.length ? await db.select().from(entries).where(inArray(entries.installmentId, installmentRows.map(row => row.id))) : [];
  return { total, page, rows: rows.map(({ agreement, contract, employeeName }) => ({ ...agreement, contract: { ...contract, employee: { name: employeeName } }, installments: installmentRows.filter(row => row.agreementId === agreement.id).map(row => ({ ...row, entries: entryRows.filter(entry => entry.installmentId === row.id) })) })) };
}
export async function readContractTimeline(db: DatabaseExecutor, id: string, requestedPage?: string): Promise<{ contract: EmploymentContract & { employee: { name: string } }; total: number; page: number; revisions: EmploymentRevision[] }> {
  const [contract] = await db.select({ ...getTableColumns(contracts), employee: { name: employees.name } }).from(contracts).innerJoin(employees, eq(employees.id, contracts.employeeId)).where(eq(contracts.id, id)).limit(1);
  if (!contract) throw new Error('Contrato não encontrado.');
  const [{ total }] = await db.select({ total: count() }).from(revisions).where(eq(revisions.contractId, id));
  const page = personnelPageNumber(requestedPage, total);
  const rows = await db.select().from(revisions).where(eq(revisions.contractId, id)).orderBy(desc(revisions.effectiveFrom), desc(revisions.version)).limit(20).offset((page - 1) * 20);
  return { contract, total, page, revisions: rows };
}
export async function readPersonnelPayrollRun(db: DatabaseExecutor, id: string): Promise<RunWithPayroll> {
  const [row] = await db.select({ run: runs, payroll: payrolls }).from(runs).innerJoin(payrolls, eq(payrolls.id, runs.payrollId)).where(eq(runs.id, id)).limit(1);
  if (!row) throw new Error('Cálculo não encontrado.');
  return { ...row.run, payroll: row.payroll };
}
export async function readRunStatementsPage(db: DatabaseExecutor, runId: string, requestedPage?: string): Promise<{ total: number; page: number; statements: Array<PayrollStatement & { contract: ContractWithEmployee }> }> {
  const [{ total }] = await db.select({ total: count() }).from(statements).where(eq(statements.runId, runId));
  const page = personnelPageNumber(requestedPage, total);
  const rows = await db.select({ statement: statements, contract: contracts, employee: employees }).from(statements).innerJoin(contracts, eq(contracts.id, statements.contractId)).innerJoin(employees, eq(employees.id, contracts.employeeId)).where(eq(statements.runId, runId)).orderBy(asc(statements.id)).limit(20).offset((page - 1) * 20);
  return { total, page, statements: rows.map(({ statement, contract, employee }) => ({ ...statement, contract: { ...contract, employee } })) };
}
export async function readPublishedPayrollPage(db: DatabaseExecutor, user: PermissionUser, requestedPage?: string): Promise<{ runs: Array<PayrollRun & { payroll: { competence: string; type: string } }>; total: number; page: number; statements: Array<PayrollStatement & { contract: { registration: string; employee: { name: string } }; run: PayrollRun & { payroll: { competence: string; type: string } } }> }> {
  const runRows = await db.select({ ...getTableColumns(runs), payroll: { competence: payrolls.competence, type: payrolls.type } }).from(runs).innerJoin(payrolls, eq(payrolls.id, runs.payrollId)).where(and(eq(runs.mode, 'OFICIAL'), inArray(runs.status, ['CALCULADA', 'FECHADA']), accessiblePayrollWhere(user))).orderBy(desc(runs.createdAt));
  const where = and(isNotNull(statements.releaseAt), isNull(statements.revokedAt), accessiblePayrollWhere(user));
  const [{ total }] = await db.select({ total: count() }).from(statements).innerJoin(runs, eq(runs.id, statements.runId)).innerJoin(payrolls, eq(payrolls.id, runs.payrollId)).where(where);
  const page = personnelPageNumber(requestedPage, total);
  const rows = await db.select({ statement: statements, run: runs, competence: payrolls.competence, type: payrolls.type, registration: contracts.registration, employeeName: employees.name }).from(statements).innerJoin(runs, eq(runs.id, statements.runId)).innerJoin(payrolls, eq(payrolls.id, runs.payrollId)).innerJoin(contracts, eq(contracts.id, statements.contractId)).innerJoin(employees, eq(employees.id, contracts.employeeId)).where(where).orderBy(desc(statements.releaseAt), asc(statements.id)).limit(20).offset((page - 1) * 20);
  return { runs: runRows, total, page, statements: rows.map(({ statement, run, competence, type, registration, employeeName }) => ({ ...statement, contract: { registration, employee: { name: employeeName } }, run: { ...run, payroll: { competence, type } } })) };
}
export async function readPocPage(db: DatabaseExecutor, user: PermissionUser, competence: string, code: string): Promise<{ set: (PayrollRuleSet & { rules: PayrollRule[] }) | null; payrolls: Payroll[]; contracts: ContractWithEmployee[]; sources: RunWithPayroll[] }> {
  const [ruleSet] = await db.select().from(hrPayrollRuleSets).where(and(eq(hrPayrollRuleSets.code, code), eq(hrPayrollRuleSets.scope, 'DEMONSTRACAO'), eq(hrPayrollRuleSets.isDemo, true))).limit(1);
  const ruleRows = ruleSet ? await db.select().from(hrPayrollRules).where(eq(hrPayrollRules.ruleSetId, ruleSet.id)).orderBy(asc(hrPayrollRules.code)) : [];
  const payrollRows = await db.select().from(payrolls).where(and(accessiblePayrollWhere(user), eq(payrolls.competence, competence), like(payrolls.id, 'rh-poc-payroll-v1-%'))).orderBy(asc(payrolls.id));
  const regimes = ruleSet ? await db.select({ id: hrEmploymentRegimes.id }).from(hrEmploymentRegimes).where(eq(hrEmploymentRegimes.ruleSetId, ruleSet.id)) : [];
  const contractRows = ruleSet ? await db.select({ contract: contracts, employee: employees }).from(contracts).innerJoin(employees, eq(employees.id, contracts.employeeId)).where(and(inArray(contracts.regimeId, regimes.map(regime => regime.id)), sql`${contracts.details} #> '{pocPackage}' = ${JSON.stringify(code)}::jsonb`)).orderBy(asc(contracts.registration)) : [];
  const sources = await db.select({ run: runs, payroll: payrolls }).from(runs).innerJoin(payrolls, eq(payrolls.id, runs.payrollId)).where(and(eq(runs.scope, 'DEMONSTRACAO'), eq(runs.mode, 'OFICIAL'), eq(runs.status, 'FECHADA'), eq(runs.ruleSetId, ruleSet?.id ?? ''), accessiblePayrollWhere(user), inArray(payrolls.type, ['1ª parcela 13º', '13º']))).orderBy(desc(runs.createdAt)).limit(30);
  return { set: ruleSet ? { ...ruleSet, rules: ruleRows } : null, payrolls: payrollRows, contracts: contractRows.map(({ contract, employee }) => ({ ...contract, employee })), sources: sources.map(({ run, payroll }) => ({ ...run, payroll })) };
}
export async function readWorkforceOperations(db: DatabaseExecutor, user: PermissionUser, input: { tab: string; q: string; customCode: string; customValue: string; customType: string; customFilterError: string; payrollId: string; id: string; page: string }): Promise<WorkforceOperationsPage> {
  const contractWhere = and(input.q ? or(ilike(contracts.registration, `%${input.q}%`), ilike(employees.name, `%${input.q}%`)) : undefined, input.customCode && input.tab === 'contratos' ? input.customFilterError ? sql`false` : sql`${contracts.details} #> ARRAY['customFields',${input.customCode}]::text[] = ${JSON.stringify(input.customType === 'BOOLEANO' ? input.customValue === 'true' : input.customValue)}::jsonb` : undefined);
  const runWhere = and(input.payrollId ? eq(runs.payrollId, input.payrollId) : undefined, accessiblePayrollWhere(user), input.q ? like(payrolls.competence, `%${input.q}%`) : undefined);
  const eventWhere = input.q ? or(ilike(events.domain, `%${input.q}%`), ilike(events.status, `%${input.q}%`)) : undefined;
  const totals = input.tab === 'contratos' ? await db.select({ total: count() }).from(contracts).innerJoin(employees, eq(employees.id, contracts.employeeId)).where(contractWhere) : input.tab === 'movimentos' ? await db.select({ total: count() }).from(movements).innerJoin(contracts, eq(contracts.id, movements.contractId)).innerJoin(employees, eq(employees.id, contracts.employeeId)).where(contractWhere) : input.tab === 'direitos' ? await db.select({ total: count() }).from(rights).innerJoin(contracts, eq(contracts.id, rights.contractId)).innerJoin(employees, eq(employees.id, contracts.employeeId)).where(contractWhere) : input.tab === 'calculos' ? await db.select({ total: count() }).from(runs).innerJoin(payrolls, eq(payrolls.id, runs.payrollId)).where(runWhere) : await db.select({ total: count() }).from(events).where(eventWhere);
  const total = totals[0].total, page = personnelPageNumber(input.page, total), offset = (page - 1) * 20;
  const selected: EmploymentContract | null = input.id ? (await db.select().from(contracts).where(eq(contracts.id, input.id)).limit(1))[0] ?? null : null;
  const contractRows = input.tab === 'contratos' ? await db.select({ contract: contracts, employee: employees }).from(contracts).innerJoin(employees, eq(employees.id, contracts.employeeId)).where(contractWhere).orderBy(asc(contracts.registration), asc(contracts.id)).limit(20).offset(offset) : [];
  const movementRows = input.tab === 'movimentos' ? await db.select({ movement: movements, contract: contracts }).from(movements).innerJoin(contracts, eq(contracts.id, movements.contractId)).innerJoin(employees, eq(employees.id, contracts.employeeId)).where(contractWhere).orderBy(desc(movements.createdAt), asc(movements.id)).limit(20).offset(offset) : [];
  const rightRows = input.tab === 'direitos' ? await db.select({ right: rights, contract: contracts }).from(rights).innerJoin(contracts, eq(contracts.id, rights.contractId)).innerJoin(employees, eq(employees.id, contracts.employeeId)).where(contractWhere).orderBy(desc(rights.createdAt), asc(rights.id)).limit(20).offset(offset) : [];
  const runRows = input.tab === 'calculos' ? await db.select({ run: runs, payroll: payrolls }).from(runs).innerJoin(payrolls, eq(payrolls.id, runs.payrollId)).where(runWhere).orderBy(desc(runs.createdAt), asc(runs.id)).limit(20).offset(offset) : [];
  const eventRows: IntegrationEvent[] = input.tab === 'integracoes' ? await db.select().from(events).where(eventWhere).orderBy(desc(events.createdAt), asc(events.id)).limit(20).offset(offset) : [];
  const regimes = input.tab === 'contratos' ? await readContractRegimes(db) : [];
  const roleRows = input.tab === 'contratos' ? await db.select().from(roles).where(eq(roles.isActive, true)).orderBy(asc(roles.name)) : [];
  const contractData: ContractWithEmployee[] = contractRows.map(({ contract, employee }) => ({ ...contract, employee }));
  const movementData: Array<Movement & { contract: EmploymentContract }> = movementRows.map(({ movement, contract }) => ({ ...movement, contract }));
  const rightData: Array<RightEntry & { contract: EmploymentContract }> = rightRows.map(({ right, contract }) => ({ ...right, contract }));
  const runData: RunWithPayroll[] = runRows.map(({ run, payroll }) => ({ ...run, payroll }));
  return { total, page, selected, contracts: contractData, movements: movementData, rights: rightData, runs: runData, events: eventRows, regimes, roles: roleRows };
}
export async function readPersonnelStatementSource(db: DatabaseExecutor, id: string): Promise<{ run: { id: string; payrollId: string } } | null> {
  return (await db.select({ run: { id: runs.id, payrollId: runs.payrollId } }).from(statements).innerJoin(runs, eq(runs.id, statements.runId)).where(eq(statements.id, id)).limit(1))[0] ?? null;
}
