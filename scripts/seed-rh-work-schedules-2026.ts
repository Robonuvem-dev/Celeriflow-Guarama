import "dotenv/config";
import { and, asc, eq, sql } from "drizzle-orm";
import { writeFile } from "node:fs/promises";
import { createDatabaseConnection } from "../src/db/connection";
import { withDatabaseTransaction, type DatabaseTransaction } from "../src/db/transaction";
import { employees, roles } from "../src/db/schema/administration";
import { hrEmploymentContracts } from "../src/db/schema/personnel-workforce";
import { hrReferenceRecords } from "../src/db/schema/personnel-reference-records";
import { saveReferenceRecord, type ReferenceKind } from "../src/lib/rh/reference-records";

const packageId = "RH_ESCALAS_ESTIMADAS_2026_V1";
async function ensure(tx: DatabaseTransaction, kind: ReferenceKind, key: string, name: string, details: Record<string, string>) {
  const code = `${packageId}:${key}`;
  const [previous] = await tx.select().from(hrReferenceRecords).where(and(eq(hrReferenceRecords.kind, kind), eq(hrReferenceRecords.code, code)));
  if (previous) {
    if (JSON.stringify(Object.entries(previous.details).sort()) !== JSON.stringify(Object.entries(details).sort()) || previous.name !== name) throw new Error("Escala demonstrativa alterada; concilie antes de retomar.");
    return previous;
  }
  return saveReferenceRecord(tx, undefined, { kind, code, name, details });
}
async function main() {
  const connection = createDatabaseConnection(process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL!);
  try {
    const roster = await connection.db.select({ employee: employees, contract: hrEmploymentContracts, role: roles.name }).from(employees).innerJoin(hrEmploymentContracts, eq(hrEmploymentContracts.employeeId, employees.id)).innerJoin(roles, eq(roles.id, employees.roleId)).where(sql`${hrEmploymentContracts.details}->'salaryEstimate'->>'packageId'='RH_ESTIMATIVAS_2026_V1'`).orderBy(asc(employees.id));
    const exempt = roster.filter(row => row.role.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().startsWith("secretario"));
    const workers = roster.filter(row => !exempt.includes(row));
    const summary = { packageId, scope: "DEMONSTRACAO", effectiveFrom: "2026-11-01", employees: roster.length, scheduled: workers.length, excludedFromAutomaticClock: exempt.length, criterion: "Escala fictícia de segunda a sexta, 08h, jornada semanal estimada dividida por cinco dias; intervalo explícito de 60 minutos. Não substitui escala especial ou norma municipal.", createsAttendance: false, altersHistoricalPayroll: false };
    if (!process.argv.includes("--apply")) { console.log(JSON.stringify({ mode: "PREVIEW", ...summary })); return; }
    if (roster.length !== 198) throw new Error("População salarial esperada de 198 servidores não encontrada.");
    const ranges = new Map<number, string>();
    for (const weekly of [...new Set(workers.map(row => row.contract.monthlyHours / 5))]) {
      const exit = 8 * 60 + weekly / 5 * 60 + 60;
      if (!Number.isInteger(exit) || exit >= 24 * 60) throw new Error("Jornada sem faixa demonstrativa válida.");
      const end = `${String(Math.floor(exit / 60)).padStart(2, "0")}:${String(exit % 60).padStart(2, "0")}`;
      const range = await withDatabaseTransaction(connection, async tx => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('hr-reference-records'))`);
        const team = await ensure(tx, "EQUIPE", `team:${weekly}`, `Equipe demonstrativa ${weekly}h semanais`, { description: summary.criterion });
        return ensure(tx, "FAIXA", `range:${weekly}`, `DEMO ${weekly}h/semana — 08:00 a ${end}`, { teamId: team.id, start: "08:00", end, breakMinutes: "60" });
      });
      ranges.set(weekly, range.id);
    }
    for (const row of workers) await withDatabaseTransaction(connection, async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('hr-reference-records'))`);
      const [conflict] = await tx.select().from(hrReferenceRecords).where(and(eq(hrReferenceRecords.kind, "ESCALA"), sql`${hrReferenceRecords.details}->>'employeeId'=${row.employee.id} AND ${hrReferenceRecords.details}->>'from'<='2026-12-31' AND ${hrReferenceRecords.details}->>'until'>='2026-11-01' AND ${hrReferenceRecords.code}<>${`${packageId}:employee:${row.employee.id}`}`));
      if (conflict) throw new Error("Servidor já possui escala nesse período; preserve a programação do operador.");
      await ensure(tx, "ESCALA", `employee:${row.employee.id}`, `Escala DEMO — ${row.employee.name}`, { employeeId: row.employee.id, rangeId: ranges.get(row.contract.monthlyHours / 5)!, weekdays: "1,2,3,4,5", from: "2026-11-01", until: "2026-12-31" });
    });
    const result = { ...summary, recordedAt: new Date().toISOString(), ranges: ranges.size, excludedEmployeeIds: exempt.map(row => row.employee.id), layer: "population-not-homologation" };
    await writeFile("docs/RH_ESCALAS_ESTIMADAS_2026.json", JSON.stringify(result, null, 2) + "\n");
    console.log(JSON.stringify(result, null, 2));
  } finally { await connection.pool.end(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
