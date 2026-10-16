import assert from "node:assert/strict";
import test from "node:test";
import { Prisma, type PrismaClient } from "@prisma/client";
import { buildHrReport, hrReportInputSchema } from "../src/lib/rh/report-service";

const date = (value: string) => new Date(`${value}T00:00:00Z`);
function contract(id: string, employeeId: string, regimeId = "efetivo", endsAt: string | null = null) {
  const snapshot = {
    id, employeeId, registration: id, regimeId, roleId: "professor", departmentId: null, costCenterId: null,
    workLocation: "Escola anterior", salaryLevel: "A-01", admittedAt: date("2025-01-01").toISOString(),
    appointedAt: null, swornAt: null, endsAt: endsAt ? date(endsAt).toISOString() : null,
    monthlyHours: 100, salary: "2000.00", status: "ATIVO", version: 1, details: {},
  };
  return {
    ...snapshot, admittedAt: date("2025-01-01"), endsAt: endsAt ? date(endsAt) : null, salary: new Prisma.Decimal(2000),
    workLocation: "Escola atual", employee: { id: employeeId, name: employeeId },
    revisions: [
      { id: `${id}-1`, contractId: id, version: 1, effectiveFrom: date("2025-01-01"), snapshot, actorId: "test", reason: "admissão", createdAt: date("2025-01-01") },
      { id: `${id}-2`, contractId: id, version: 2, effectiveFrom: date("2026-08-15"), snapshot: { ...snapshot, workLocation: "Escola atual", version: 2 }, actorId: "test", reason: "lotação", createdAt: date("2026-08-15") },
    ],
  };
}
const contracts = [contract("001", "Pessoa A"), contract("002", "Pessoa A", "temporario"), contract("003", "Pessoa B", "efetivo", "2026-07-30"), contract("004", "Pessoa C", "efetivo", "2026-07-31")];
const db = {
  hrEmploymentContract: { findMany: async () => contracts },
  hrEmploymentRegime: { findMany: async () => [{ id: "efetivo", name: "Efetivo" }, { id: "temporario", name: "Temporário" }] },
  role: { findMany: async () => [{ id: "professor", name: "Professor" }] },
} as unknown as PrismaClient;

test("relação documental usa a revisão vigente, inclui término na referência e preserva unidade mensal", async () => {
  const report = await buildHrReport(db, hrReportInputSchema.parse({ kind: "SERVIDORES_ATIVOS", format: "CSV", referenceDate: "2026-07-31" }));
  assert.deepEqual(report.rows.map(row => row[1]), ["001", "002", "004"]);
  assert.equal(report.rows[0][3], "Professor");
  assert.equal(report.rows[0][4], "Escola anterior");
  assert.equal(report.rows[0][9], "100");
  assert.match(report.headers[9], /mensal/);
  const august = await buildHrReport(db, hrReportInputSchema.parse({ kind: "SERVIDORES_ATIVOS", format: "CSV", competence: "08/2026" }));
  assert.equal(august.rows[0][4], "Escola atual");
});

test("contagem diferencia pessoas únicas de vínculos e não soma pessoas dos regimes", async () => {
  const report = await buildHrReport(db, hrReportInputSchema.parse({ kind: "QUANTIDADE_SERVIDORES", format: "XLSX", referenceDate: "2026-07-31" }));
  assert.deepEqual(report.rows.at(-1), ["2026-07-31", "TOTAL", "Total do filtro", "2", "3"]);
  assert.equal(report.rows.find(row => row[1] === "efetivo")?.[3], "2");
  assert.equal(report.rows.find(row => row[1] === "temporario")?.[3], "1");
  assert.equal(hrReportInputSchema.safeParse({ kind: "SERVIDORES_ATIVOS", format: "PDF", referenceDate: "2026-02-30" }).success, false);
});
