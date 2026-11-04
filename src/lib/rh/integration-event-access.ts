import { sql } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import { isSystemAdministrator, type AppContext } from "@/lib/platform/tenant-context";
import { assertFunctionalHolderAccess } from "./functional-record-service";
import { assertPersonnelDepartment, assertPersonnelRubrics } from "./personnel-scope";
import { assertPayrollBudgetScope } from "./payroll-access";
import { canAccessPersonnelClinicalData } from "./clinical-access";

/** Download authorization follows the event's referenced origins, including events without a top-level run. */
export async function assertIntegrationEventAccess(db: DatabaseExecutor, context: AppContext, payload: unknown) {
  const contracts = new Set<string>(), employees = new Set<string>(), runs = new Set<string>(), payrolls = new Set<string>(), statements = new Set<string>(), entries = new Set<string>(), rubrics = new Set<string>();
  let nodes = 0;
  const collect = (value: unknown, depth: number) => {
    if (value == null || typeof value !== "object") return;
    if (++nodes > 10000 || depth > 20) throw new Error("Origem excede os limites de conferência de acesso.");
    if (Array.isArray(value)) { for (const item of value) collect(item, depth + 1); return; }
    const record = value as Record<string, unknown>;
    if (record.kind === "READAPTACAO" && !canAccessPersonnelClinicalData(context.user)) throw new Error("A origem contém dados clínicos de acesso restrito.");
    for (const [key, child] of Object.entries(record)) {
      const add = (target: Set<string>) => { if (typeof child === "string" && child) target.add(child); else if (Array.isArray(child)) for (const id of child) if (typeof id === "string" && id) target.add(id); };
      if (["contractId", "contractIds", "previousContractId", "sourceContractId", "targetContractId", "benefitContractId"].includes(key)) add(contracts);
      if (["employeeId", "employeeIds"].includes(key)) add(employees);
      if (["runId", "sourceRunId", "runIds"].includes(key)) add(runs);
      if (["payrollId", "payrollIds"].includes(key)) add(payrolls);
      if (["statementId", "statementIds"].includes(key)) add(statements);
      if (["entryId", "entryIds", "sourceEntryId", "targetEntryId"].includes(key)) add(entries);
      if (key === "rubricCode") add(rubrics);
      collect(child, depth + 1);
    }
  };
  collect(payload, 0);
  if (isSystemAdministrator(context.user)) return;
  for (const id of entries) {
    const [entry] = (await db.execute<{ contractId: string }>(sql`SELECT "contractId" FROM "HrRightEntry" WHERE id=${id}`)).rows;
    if (!entry) throw new Error("Entrada de origem indisponível para conferência de acesso.");
    contracts.add(entry.contractId);
  }
  for (const id of statements) {
    const [statement] = (await db.execute<{ runId: string }>(sql`SELECT "runId" FROM "HrPayrollStatement" WHERE id=${id}`)).rows;
    if (!statement) throw new Error("Demonstrativo de origem indisponível.");
    runs.add(statement.runId);
  }
  for (const id of runs) {
    const [run] = (await db.execute<{ payrollId: string }>(sql`SELECT "payrollId" FROM "HrPayrollRun" WHERE id=${id}`)).rows;
    if (!run) throw new Error("Cálculo de origem indisponível.");
    payrolls.add(run.payrollId);
  }
  for (const id of payrolls) await assertPayrollBudgetScope(context, id);
  for (const id of contracts) {
    const [contract] = (await db.execute<{ employeeId: string; departmentId: string | null }>(sql`SELECT "employeeId","departmentId" FROM "HrEmploymentContract" WHERE id=${id}`)).rows;
    if (!contract) throw new Error("Contrato de origem indisponível.");
    employees.add(contract.employeeId); assertPersonnelDepartment(context.user, contract.departmentId);
  }
  for (const id of employees) await assertFunctionalHolderAccess(db, context, id);
  assertPersonnelRubrics(context.user, [...rubrics]);
  if (!employees.size && !payrolls.size) throw new Error("Origem geral sem titular verificável exige administrador do sistema.");
}
