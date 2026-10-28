import { and, asc, eq, inArray, isNull, lte, gte, or, type SQL } from "drizzle-orm";
import type { DatabaseExecutor } from "../../transaction";
import { employees } from "../../schema/administration";
import { people } from "../../schema/people";
import { hrEmploymentContracts, hrEmploymentRevisions, hrMovements, hrPayrollRuns, hrPayrollStatements, hrRightEntries, hrPortalRequests, payrolls } from "../../schema/personnel-workforce";
import { hrEmploymentRegimes, hrPayrollRules, hrPayrollRuleSets } from "../../schema/personnel-configuration";

export async function requireEmploymentContract(db: DatabaseExecutor, id: string) {
  const [contract] = await db.select().from(hrEmploymentContracts).where(eq(hrEmploymentContracts.id, id)).limit(1);
  if (!contract) throw new Error("Contrato não encontrado.");
  return contract;
}
export async function listEmploymentContracts(db: DatabaseExecutor, condition?: SQL) {
  const contracts = await db.select().from(hrEmploymentContracts).where(condition).orderBy(asc(hrEmploymentContracts.id));
  const revisions = contracts.length ? await db.select().from(hrEmploymentRevisions).where(inArray(hrEmploymentRevisions.contractId, contracts.map(row => row.id))) : [];
  return contracts.map(contract => ({ ...contract, revisions: revisions.filter(row => row.contractId === contract.id) }));
}
export async function requireEmployeeWithPerson(db: DatabaseExecutor, id: string) {
  const [row] = await db.select({ employee: employees, person: people }).from(employees).leftJoin(people, eq(people.id, employees.personId)).where(eq(employees.id, id)).limit(1);
  if (!row) throw new Error("Servidor não encontrado.");
  return { ...row.employee, person: row.person };
}
export async function requireEmploymentHistory(db: DatabaseExecutor, id: string) {
  const contract = await requireEmploymentContract(db, id);
  const revisions = await db.select().from(hrEmploymentRevisions).where(eq(hrEmploymentRevisions.contractId, id));
  return { ...contract, revisions };
}
export async function requireEmploymentHolderHistory(db: DatabaseExecutor, id: string) {
  const contract = await requireEmploymentHistory(db, id);
  const [employee] = await db.select().from(employees).where(eq(employees.id, contract.employeeId)).limit(1);
  if (!employee) throw new Error("Servidor não encontrado.");
  return { ...contract, employee };
}
export async function requireEmploymentIdentityHistory(db: DatabaseExecutor, id: string) {
  const contract = await requireEmploymentHistory(db, id);
  return { ...contract, employee: await requireEmployeeWithPerson(db, contract.employeeId) };
}
export async function requireEmploymentWorkspace(db: DatabaseExecutor, id: string, period?: { start: Date; end: Date }) {
  const contract = await requireEmploymentContract(db, id);
  const [employee, revisions, movements] = await Promise.all([
    requireEmployeeWithPerson(db, contract.employeeId),
    db.select().from(hrEmploymentRevisions).where(eq(hrEmploymentRevisions.contractId, id)),
    db.select().from(hrMovements).where(and(eq(hrMovements.contractId, id), period ? and(lte(hrMovements.startsAt, period.end), or(isNull(hrMovements.endsAt), gte(hrMovements.endsAt, period.start))) : undefined)),
  ]);
  return { ...contract, employee, revisions, movements };
}
export async function requireEmploymentRegime(db: DatabaseExecutor, id: string) {
  const [row] = await db.select({ regime: hrEmploymentRegimes, ruleSet: hrPayrollRuleSets }).from(hrEmploymentRegimes).innerJoin(hrPayrollRuleSets, eq(hrPayrollRuleSets.id, hrEmploymentRegimes.ruleSetId)).where(eq(hrEmploymentRegimes.id, id)).limit(1);
  if (!row) throw new Error("Regime não encontrado.");
  return { ...row.regime, ruleSet: row.ruleSet };
}
export async function requirePayrollRule(db: DatabaseExecutor, id: string) {
  const [row] = await db.select({ rule: hrPayrollRules, ruleSet: hrPayrollRuleSets }).from(hrPayrollRules).innerJoin(hrPayrollRuleSets, eq(hrPayrollRuleSets.id, hrPayrollRules.ruleSetId)).where(eq(hrPayrollRules.id, id)).limit(1);
  if (!row) throw new Error("Regra não encontrada.");
  return { ...row.rule, ruleSet: row.ruleSet };
}
export async function requirePayroll(db: DatabaseExecutor, id: string) {
  const [payroll] = await db.select().from(payrolls).where(eq(payrolls.id, id)).limit(1);
  if (!payroll) throw new Error("Folha não encontrada.");
  return payroll;
}
export async function requirePayrollRun(db: DatabaseExecutor, id: string) {
  const [run] = await db.select().from(hrPayrollRuns).where(eq(hrPayrollRuns.id, id)).limit(1);
  if (!run) throw new Error("Cálculo não encontrado.");
  return run;
}
export async function requirePayrollRunWithStatements(db: DatabaseExecutor, id: string) {
  const run = await requirePayrollRun(db, id);
  const [payroll, statements] = await Promise.all([requirePayroll(db, run.payrollId), db.select().from(hrPayrollStatements).where(eq(hrPayrollStatements.runId, id)).orderBy(asc(hrPayrollStatements.contractId))]);
  return { ...run, payroll, statements };
}
export async function requireRightEntry(db: DatabaseExecutor, id: string) {
  const [entry] = await db.select().from(hrRightEntries).where(eq(hrRightEntries.id, id)).limit(1);
  if (!entry) throw new Error("Direito/provisão não encontrado.");
  return entry;
}
export async function requireHrPortalRequest(db: DatabaseExecutor, id: string) {
  const [request] = await db.select().from(hrPortalRequests).where(eq(hrPortalRequests.id, id)).limit(1);
  if (!request) throw new Error("Solicitação funcional não encontrada.");
  return request;
}
export async function findActivePayrollRule(db: DatabaseExecutor, ruleSetId: string, code: string) {
  const [rule] = await db.select().from(hrPayrollRules).where(and(eq(hrPayrollRules.ruleSetId, ruleSetId), eq(hrPayrollRules.code, code), eq(hrPayrollRules.isActive, true))).limit(1);
  return rule ?? null;
}
export async function listClosedContractCompetences(db: DatabaseExecutor, contractId: string) {
  return db.select({ competence: payrolls.competence }).from(hrPayrollStatements).innerJoin(hrPayrollRuns, eq(hrPayrollRuns.id, hrPayrollStatements.runId)).innerJoin(payrolls, eq(payrolls.id, hrPayrollRuns.payrollId)).where(and(eq(hrPayrollStatements.contractId, contractId), eq(hrPayrollRuns.status, "FECHADA")));
}
export async function requirePayrollStatement(db: DatabaseExecutor, runId: string, contractId: string) {
  const [statement] = await db.select().from(hrPayrollStatements).where(and(eq(hrPayrollStatements.runId, runId), eq(hrPayrollStatements.contractId, contractId))).limit(1);
  if (!statement) throw new Error("Demonstrativo não encontrado.");
  return statement;
}
