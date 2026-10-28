import "./helpers/fleet-test-environment";
import assert from "node:assert/strict";
import test from "node:test";
import { Decimal } from "../src/db/decimal";
import { fleetConsumptions, fleetExpenses, fleetUnits } from "../src/db/schema/fleet";
import { getFleetExpenseIndicators } from "../src/lib/frotas/indicators";
import { createFleetTestDatabase, fleetTestContext } from "./fleet-fixture";

test("BI de Frotas usa apenas a projeção canônica, recorte de setor e cobertura de valores", { timeout: 180000 }, async () => {
  const fixture = await createFleetTestDatabase(), { connection } = fixture, db = connection.db;
  try {
    const context = fleetTestContext(db, { id: "u", profileCode: "ANALISTA", departmentId: "saude", modulePermissions: [{ code: "FROTAS", canView: true, canEdit: false }] });
    await db.insert(fleetUnits).values([
      { id: "health", code: "BI-HEALTH", name: "Saúde", category: "VEICULO", departmentId: "saude", createdById: "u" },
      { id: "works", code: "BI-WORKS", name: "Obras", category: "MAQUINA", departmentId: "obras", createdById: "u" },
    ]);
    const expense = (id: string, unitId: string, amount: string | null, date = "2026-04-10") => ({ id, unitId, amount: amount === null ? null : new Decimal(amount), occurredAt: new Date(`${date}T00:00:00Z`), nature: "COMBUSTIVEL", description: "Projeção canônica", sourceType: "CONSUMO", sourceId: id, sourceKey: id, createdById: "u" });
    await db.insert(fleetExpenses).values([expense("a", "health", "100.01"), expense("b", "health", "23.44"), expense("c", "health", null), expense("other-sector", "works", "999.99"), expense("outside-period", "health", "500.00", "2025-12-31")]);
    await db.insert(fleetConsumptions).values({ unitId: "health", type: "COMBUSTIVEL", origin: "TERCEIRO", occurredAt: new Date("2026-04-10T00:00:00Z"), material: "Gasolina", quantity: new Decimal("1.001"), measurementUnit: "L", cost: new Decimal("100.01"), createdById: "u" });
    const from = new Date("2026-01-01T00:00:00Z"), to = new Date("2026-09-30T00:00:00Z");
    const result = await getFleetExpenseIndicators(context, from, to, connection);
    assert.equal(result.total, 3); assert.equal(result.knownAmount, "123.45"); assert.equal(result.missing, 1); assert.equal(result.complete, false);
    assert.deepEqual(result.groups, [{ nature: "COMBUSTIVEL", amount: "123.45", count: 3 }]);
    await assert.rejects(getFleetExpenseIndicators({ ...context, user: { ...context.user, modulePermissions: [] } }, from, to, connection), /perfil/);
    await assert.rejects(getFleetExpenseIndicators(context, to, from, connection), /Período/);
  } finally { await fixture.close(); }
});
