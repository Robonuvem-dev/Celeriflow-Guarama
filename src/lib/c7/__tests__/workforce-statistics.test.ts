import assert from "node:assert/strict";
import test from "node:test";
import { createPlanningExecutionFixture } from "../../../../tests/helpers/planning-execution-fixture";
import { controlWorkforceStatisticsReport, readControlWorkforceStatistics } from "../workforce-statistics";

test("controle/RH: corte histórico conserva cargo, enquadramento e multivínculo após alteração atual", async () => {
  const previous = process.env.CELERIFLOW_ACCOUNTING_MODE;
  process.env.CELERIFLOW_ACCOUNTING_MODE = "POC";
  let f: Awaited<ReturnType<typeof createPlanningExecutionFixture>> | undefined;
  try {
    f = await createPlanningExecutionFixture();
    await f.db.role.createMany({ data: [{ id: "cargo-antigo", name: "Cargo anterior", isActive: false }, { id: "cargo-novo", name: "Cargo atual", isActive: true }] });
    await f.db.costCenter.create({ data: { id: "centro-historico", code: "HIST", name: "Centro histórico", governmentEntityId: "ente", secretariatId: "secretaria" } });
    for (const id of ["estat-1", "estat-2"]) {
      const contract = await f.db.hrEmploymentContract.create({ data: { id, employeeId: "servidora-ana", registration: id, regimeId: "regime", roleId: "cargo-antigo", costCenterId: "centro-historico", workLocation: "Sede original", salaryLevel: "NIVEL_1", admittedAt: new Date("2020-01-01"), salary: "100.00", details: {} } });
      await f.db.hrEmploymentRevision.create({ data: { contractId: id, version: 1, effectiveFrom: new Date("2020-01-01"), actorId: "ana", reason: "Revisão funcional original", snapshot: JSON.parse(JSON.stringify(contract)) } });
      const changed = await f.db.hrEmploymentContract.update({ where: { id }, data: { roleId: "cargo-novo", workLocation: "Sede atual", salaryLevel: "NIVEL_2", version: 2 } });
      await f.db.hrEmploymentRevision.create({ data: { contractId: id, version: 2, effectiveFrom: new Date("2026-07-01"), actorId: "ana", reason: "Alteração funcional de julho", snapshot: JSON.parse(JSON.stringify(changed)) } });
    }
    const actor = { usuarioId: "ana", allowedBudgetUnitIds: ["ug"] };
    const before = await readControlWorkforceStatistics(f.db, actor, { financialYearId: "ano", referenceDate: "2026-06-30", salaryLevel: "NIVEL_1", roleStatus: "INACTIVE" });
    assert.equal(before.totalPeople, 1); assert.equal(before.totalContracts, 2);
    assert.ok(before.rows.every(row => row.roleId === "cargo-antigo" && row.workLocation === "Sede original" && row.version === 1));
    const report = controlWorkforceStatisticsReport(before);
    assert.ok(report.rows.every(row => row.length === report.headers.length));
    assert.deepEqual(report.rows.find(row => row[0] === "TOTAL")?.slice(14, 16), ["1", "2"]);
    assert.equal(report.rows.filter(row => row[0] === "VINCULO").length, 2);
    const after = await readControlWorkforceStatistics(f.db, actor, { financialYearId: "ano", referenceDate: "2026-07-01", roleId: "cargo-novo", employeeId: "servidora-ana", salaryLevel: "NIVEL_2" });
    assert.equal(after.totalPeople, 1); assert.equal(after.totalContracts, 2);
    assert.ok(after.rows.every(row => row.version === 2));
    await assert.rejects(readControlWorkforceStatistics(f.db, { usuarioId: "ana", allowedBudgetUnitIds: [] }, { financialYearId: "ano", referenceDate: "2026-06-30" }), /autorizadas/);
    await assert.rejects(readControlWorkforceStatistics(f.db, actor, { financialYearId: "ano", referenceDate: "2025-06-30" }), /exercício/);
  } finally { try { await f?.close(); } finally { if (previous === undefined) delete process.env.CELERIFLOW_ACCOUNTING_MODE; else process.env.CELERIFLOW_ACCOUNTING_MODE = previous; } }
});
