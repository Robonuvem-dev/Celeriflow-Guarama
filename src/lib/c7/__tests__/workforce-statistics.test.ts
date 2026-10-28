import assert from "node:assert/strict";
import test from "node:test";
import { createControlWorkforceFixture } from "../../../../tests/helpers/control-workforce-fixture";
import { sql } from "drizzle-orm";
import { roles } from "@/db/schema/administration";
import type { JsonObject } from "@/db/json";
import { controlWorkforceStatisticsReport, readControlWorkforceStatistics } from "../workforce-statistics";

test("controle/RH: corte histórico conserva cargo, enquadramento e multivínculo após alteração atual", async () => {
  const f = await createControlWorkforceFixture();
  try {
    await f.db.db.insert(roles).values([{ id: "cargo-antigo", name: "Cargo anterior", isActive: false }, { id: "cargo-novo", name: "Cargo atual", isActive: true }]);
    await f.db.db.execute(sql`INSERT INTO "CostCenter" (id, code, name, "governmentEntityId", "secretariatId") VALUES ('centro-historico', 'HIST', 'Centro histórico', 'ente', 'secretaria')`);
    for (const id of ["estat-1", "estat-2"]) {
      const contract = { id, employeeId: "servidora-ana", registration: id, regimeId: "regime", roleId: "cargo-antigo", departmentId: null, costCenterId: "centro-historico", workLocation: "Sede original", salaryLevel: "NIVEL_1", admittedAt: "2020-01-01T00:00:00.000Z", appointedAt: null, swornAt: null, endsAt: null, monthlyHours: 220, salary: "100.00", status: "ATIVO", version: 1, details: {} } satisfies JsonObject;
      await f.db.db.execute(sql`INSERT INTO "HrEmploymentContract" (id, "employeeId", registration, "regimeId", "roleId", "costCenterId", "workLocation", "salaryLevel", "admittedAt", salary, details)
        VALUES (${id}, 'servidora-ana', ${id}, 'regime', 'cargo-antigo', 'centro-historico', 'Sede original', 'NIVEL_1', '2020-01-01', '100.00', '{}'::jsonb)`);
      await f.db.db.execute(sql`INSERT INTO "HrEmploymentRevision" (id, "contractId", version, "effectiveFrom", "actorId", reason, snapshot)
        VALUES (${`${id}-v1`}, ${id}, 1, '2020-01-01', 'ana', 'Revisão funcional original', ${JSON.stringify(contract)}::jsonb)`);
      const changed = { ...contract, roleId: "cargo-novo", workLocation: "Sede atual", salaryLevel: "NIVEL_2", version: 2 };
      await f.db.db.execute(sql`UPDATE "HrEmploymentContract" SET "roleId"='cargo-novo', "workLocation"='Sede atual', "salaryLevel"='NIVEL_2', version=2 WHERE id=${id}`);
      await f.db.db.execute(sql`INSERT INTO "HrEmploymentRevision" (id, "contractId", version, "effectiveFrom", "actorId", reason, snapshot)
        VALUES (${`${id}-v2`}, ${id}, 2, '2026-07-01', 'ana', 'Alteração funcional de julho', ${JSON.stringify(changed)}::jsonb)`);
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
    // Historical eligibility must survive a current transfer outside the entity.
    await f.db.db.execute(sql`INSERT INTO "GovernmentEntity" VALUES ('outro-ente', 'Outra entidade', 'CAMARA')`);
    await f.db.db.execute(sql`INSERT INTO "CostCenter" (id, code, name, "governmentEntityId", "secretariatId") VALUES ('centro-externo', 'EXT', 'Centro externo', 'outro-ente', 'secretaria')`);
    await f.db.db.execute(sql`UPDATE "HrEmploymentContract" SET "costCenterId"='centro-externo', version=3 WHERE id='estat-1'`);
    await f.db.db.execute(sql`INSERT INTO "HrEmploymentRevision" (id, "contractId", version, "effectiveFrom", "actorId", reason, snapshot)
      SELECT 'estat-1-v3', 'estat-1', 3, '2026-08-01', 'ana', 'Transferência para outra entidade', snapshot || jsonb_build_object('costCenterId', 'centro-externo', 'version', 3)
      FROM "HrEmploymentRevision" WHERE id='estat-1-v2'`);
    const historical = await readControlWorkforceStatistics(f.db, actor, { financialYearId: "ano", referenceDate: "2026-06-30" });
    assert.equal(historical.totalContracts, 2);
    const transferred = await readControlWorkforceStatistics(f.db, actor, { financialYearId: "ano", referenceDate: "2026-08-01" });
    assert.equal(transferred.totalContracts, 1);
    assert.deepEqual(transferred.rows.map(row => row.contractId), ["estat-2"]);
  } finally { await f.close(); }
});
