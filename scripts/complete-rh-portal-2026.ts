import "dotenv/config";
import { asc, eq, sql } from "drizzle-orm";
import { mkdir, writeFile } from "node:fs/promises";
import { createDatabaseConnection } from "../src/db/connection";
import { withDatabaseTransaction } from "../src/db/transaction";
import { inDatabaseTransactionScope } from "../src/db/transaction-scope";
import { employees, departments } from "../src/db/schema/administration";
import { attendanceRecords } from "../src/db/schema/personnel-records";
import { hrEmploymentContracts, hrEmploymentRevisions, hrPayrollRuns, hrPayrollStatements, payrolls } from "../src/db/schema/personnel-workforce";
import { hrPayrollRules } from "../src/db/schema/personnel-configuration";
import { installDocumentaryPocParameters, RH_POC_CODE } from "../src/lib/rh/poc-bootstrap";
import { saveEmploymentContract, calculatePayrollRun, closePayrollRun, publishPayrollStatements } from "../src/lib/rh/workforce-service";
import { postServiceTimeAllowance } from "../src/lib/rh/service-time-allowance";
import { generateAttendanceOvertime } from "../src/lib/rh/attendance-payroll";

const packageId = "RH_PORTAL_2026_V1";
const actorId = `SYSTEM:${packageId}`;
const months = process.argv.find(arg => arg.startsWith("--months="))?.slice(9).split(",") ?? ["08", "09", "10"];
if (months.some(month => !["08", "09", "10"].includes(month)) || new Set(months).size !== months.length) throw new Error("Este pacote histórico abrange somente agosto, setembro e outubro de 2026, sem repetições.");
async function main() {
const connection = createDatabaseConnection(process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL!);
try {
  const selected = await connection.db.select({ employee: employees, location: departments.name }).from(employees).leftJoin(departments, eq(departments.id, employees.departmentId)).where(eq(employees.isActive, true)).orderBy(asc(employees.id));
  if (!process.argv.includes("--apply")) {
    console.log(JSON.stringify({ mode: "PREVIEW", packageId, employees: selected.length, months, scope: "DEMONSTRACAO", salaryFallback: "1621.00 somente no contrato demonstrativo quando salário cadastral é zero", admission: "2026-01-01 estimada", preservesEmployeeMaster: true, createsUsers: false, realPayments: false }, null, 2));
  } else {
    await mkdir("docs", { recursive: true });
    const installed = await installDocumentaryPocParameters(connection, actorId);
    const rules = await connection.db.select().from(hrPayrollRules).where(eq(hrPayrollRules.ruleSetId, installed.ruleSetId));
    const ats = rules.find(rule => rule.code === "ATS")!;
    const overtime = rules.find(rule => rule.code === "HORAS_EXTRAS_PONTO")!;
    const contracts: Array<typeof hrEmploymentContracts.$inferSelect> = [];
    let estimatedSalaries = 0;
    for (const { employee, location } of selected) {
      const previous = await connection.db.select().from(hrEmploymentContracts).where(eq(hrEmploymentContracts.employeeId, employee.id));
      const own = previous.find(row => (row.details as { seedPackage?: string }).seedPackage === packageId);
      if (previous.length && !own) throw new Error("Servidor possui contrato de outra origem; concilie explicitamente antes de incluir no pacote.");
      const salary = employee.salaryBase > 0 ? employee.salaryBase.toFixed(2) : "1621.00";
      if (employee.salaryBase <= 0) estimatedSalaries++;
      const contract = own ?? await saveEmploymentContract(connection, actorId, {
        employeeId: employee.id, registration: `DEMO26-${employee.id}`, regimeId: installed.regimeId, roleId: employee.roleId!, departmentId: employee.departmentId || undefined,
        workLocation: location || "Lotação demonstrativa", monthlyHours: employee.contractedHours || 220, salary,
        admittedAt: "2026-01-01", appointedAt: "", swornAt: "", endsAt: "",
        details: { seedPackage: packageId, pocPackage: RH_POC_CODE, estimated: true, sourceEmployeeRegistration: employee.registration, admissionEstimated: true, regimeEstimated: true, salaryEstimated: employee.salaryBase <= 0, salarySource: employee.salaryBase > 0 ? "Employee.salaryBase na preparação" : "Piso fictício para demonstração: R$ 1621,00", attendanceSource: "Jornada sintética; não representa marcações reais" },
        reason: "Histórico demonstrativo autorizado de 2026: identidade/lotação existentes; admissão, regime e jornada diária estimados. Não gera pagamento real.",
      });
      contracts.push(contract);
    }
    console.log(JSON.stringify({ event: "contracts", total: contracts.length, estimatedSalaries }));
    const revisions = await connection.db.select().from(hrEmploymentRevisions);
    for (const month of months) {
      const competence = `${month}/2026`, monthIndex = Number(month) - 1;
      const payrollId = `${packageId}:${month}`;
      await connection.db.insert(payrolls).values({ id: payrollId, competence, type: "Mensal", status: "Aberta" }).onConflictDoNothing();
      const records: Array<typeof attendanceRecords.$inferInsert> = [];
      for (const [index, contract] of contracts.entries()) {
        // Use the revision in force in the historical month, not November's new estimates.
        const revision = revisions.filter(row => row.contractId === contract.id && row.effectiveFrom <= new Date(Date.UTC(2026, monthIndex, 1))).sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime() || b.version - a.version)[0];
        const historical = revision?.snapshot as { monthlyHours?: number } | undefined;
        if (!historical?.monthlyHours) throw new Error("Contrato sem jornada histórica para preparar o ponto.");
        let first = true;
        for (let date = new Date(Date.UTC(2026, monthIndex, 1)); date.getUTCMonth() === monthIndex; date = new Date(date.getTime() + 86400000)) {
          const civil = date.toISOString().slice(0, 10);
          // National holidays in the default Aug–Oct window. Other months require the local holiday calendar.
          if ([0, 6].includes(date.getUTCDay()) || ["2026-09-07", "2026-10-12"].includes(civil) || date > new Date()) continue;
          const hours = Math.min(8, historical.monthlyHours / 25);
          const extraHours = first && index % 10 === 0 ? 1 : 0;
          const entry = new Date(`${civil}T11:00:00Z`); // 08:00 America/Sao_Paulo; one-hour unpaid interval.
          const exit = new Date(entry.getTime() + (hours + 1 + extraHours) * 3600000);
          records.push({ id: `${packageId}:${contract.employeeId}:${civil}`, employeeId: contract.employeeId, date: new Date(date), entryTime: entry, exitTime: exit, contractedHours: hours, hoursWorked: hours + extraHours, extraHours, bankHours: 0, status: "Presente" });
          first = false;
        }
      }
      await withDatabaseTransaction(connection, async tx => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`${packageId}:attendance:${month}`}))`);
        // Never add a synthetic duplicate over an operator's attendance for the same civil day.
        const existing = await tx.select({ employeeId: attendanceRecords.employeeId, date: attendanceRecords.date }).from(attendanceRecords).where(sql`date>=${new Date(Date.UTC(2026, monthIndex, 1))} AND date<${new Date(Date.UTC(2026, monthIndex + 1, 1))}`);
        const keys = new Set(existing.map(row => `${row.employeeId}:${row.date.toISOString().slice(0, 10)}`));
        const missing = records.filter(row => !keys.has(`${row.employeeId}:${row.date.toISOString().slice(0, 10)}`));
        for (let start = 0; start < missing.length; start += 250) await tx.insert(attendanceRecords).values(missing.slice(start, start + 250)).onConflictDoNothing();
      }, { timeoutMs: 120000 });
      console.log(JSON.stringify({ event: "attendance", competence, records: records.length }));
      const [stored] = await connection.db.select().from(payrolls).where(eq(payrolls.id, payrollId));
      if (stored.status !== "Fechada") for (const contract of contracts) {
        await postServiceTimeAllowance(connection, actorId, { contractId: contract.id, payrollId, ruleId: ats.id });
        await generateAttendanceOvertime(connection, actorId, { contractId: contract.id, ruleId: overtime.id, competence });
      }
      // The bootstrap deliberately performs the full business validation/projection, including
      // immutable statements and origins. An outer transaction allows a municipal-sized batch.
      const run = await withDatabaseTransaction(connection, tx => inDatabaseTransactionScope(connection, tx, () => calculatePayrollRun(connection, actorId, { payrollId, requestKey: payrollId, mode: "OFICIAL", scope: "DEMONSTRACAO", contractIds: contracts.map(row => row.id) })), { timeoutMs: 600000 });
      const closed = await withDatabaseTransaction(connection, tx => inDatabaseTransactionScope(connection, tx, () => closePayrollRun(connection, actorId, run.id)), { timeoutMs: 600000 });
      const [published] = await connection.db.select({ releaseAt: hrPayrollStatements.releaseAt }).from(hrPayrollStatements).where(sql`${hrPayrollStatements.runId}=${run.id} AND ${hrPayrollStatements.releaseAt} IS NOT NULL`).limit(1);
      await publishPayrollStatements(connection, actorId, run.id, published?.releaseAt ?? closed.approvedAt ?? new Date());
      console.log(JSON.stringify({ event: "payroll", competence, statements: run.statements.length, status: "FECHADA", scope: "DEMONSTRACAO", published: true }));
      const results = await connection.db.select({ competence: payrolls.competence, status: hrPayrollRuns.status, scope: hrPayrollRuns.scope, statements: sql<number>`count(${hrPayrollStatements.id})::int`, published: sql<number>`count(*) FILTER(WHERE ${hrPayrollStatements.releaseAt}<=now() AND ${hrPayrollStatements.revokedAt} IS NULL)::int` }).from(payrolls).innerJoin(hrPayrollRuns, eq(hrPayrollRuns.payrollId, payrolls.id)).innerJoin(hrPayrollStatements, eq(hrPayrollStatements.runId, hrPayrollRuns.id)).where(sql`starts_with(${payrolls.id},${`${packageId}:`}) AND ${hrPayrollRuns.status}='FECHADA'`).groupBy(payrolls.competence, hrPayrollRuns.status, hrPayrollRuns.scope).orderBy(payrolls.competence);
      await writeFile("docs/RH_PORTAL_POPULACAO_2026.json", JSON.stringify({ checkedAt: new Date().toISOString(), packageId, estimatedSalaries, estimatedSalariesMeaning: "Cadastros com base não positiva encontrados nesta execução; não substitui o diagnóstico inicial nem a estimativa salarial posterior.", salaryVersion: "Revisão vigente em cada competência histórica; não usa as estimativas de novembro.", attendanceLimitation: "Divisores mensais da primeira versão foram usados como monthlyHours/25; marcas sintéticas históricas preservadas, sem homologação da jornada.", employees: contracts.length, results, realPayments: false, createsUsers: false }, null, 2) + "\n");
    }
  }
} finally { await connection.pool.end(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
