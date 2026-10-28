import "./helpers/fleet-test-environment";
import test from "node:test";
import assert from "node:assert/strict";
import { count } from "drizzle-orm";
import { getPostgresError } from "../src/db/errors";
import { fleetUnits } from "../src/db/schema/fleet";
import { createFleetTestDatabase } from "./fleet-fixture";
import { AccessError } from "../src/lib/platform/tenant-context";
import { fleetPageIssue } from "../src/lib/frotas/page-errors";

for (const partialSchema of [false, true]) {
  test(`Abertura de Frotas · ${partialSchema ? "coluna pendente" : "tabela pendente"}`, async () => {
    const fixture = await createFleetTestDatabase(false), db = fixture.connection.db;
    try {
      if (partialSchema) await fixture.database.exec('CREATE TABLE "FleetUnit" ("id" TEXT PRIMARY KEY);');
      const query = partialSchema ? db.select({ id: fleetUnits.id, operationalStatus: fleetUnits.operationalStatus }).from(fleetUnits) : db.select({ total: count() }).from(fleetUnits);
      await assert.rejects(query, error => {
        assert.equal(getPostgresError(error)?.code, partialSchema ? "42703" : "42P01");
        const issue = fleetPageIssue(error);
        assert.equal(issue?.kind, "database");
        assert.doesNotMatch(JSON.stringify(issue), /postgresql|SELECT|FleetUnit|operationalStatus/);
        return true;
      });
    } finally {
      await fixture.close();
    }
  });
}

test("Abertura de Frotas · sessão e setor sem ocultar erros inesperados", () => {
  assert.equal(fleetPageIssue(new AccessError("Sessão inválida.", 401))?.kind, "session");
  const sectorMessage = "Vincule o usuário a um setor para acessar os registros de Frotas.";
  assert.equal(fleetPageIssue(new AccessError(sectorMessage, 403))?.message, sectorMessage);
  assert.equal(fleetPageIssue(new AccessError("Módulo inativo.", 423))?.kind, "access");
  assert.equal(fleetPageIssue(new Error("Falha inesperada com dados internos")), null);
  assert.equal(fleetPageIssue(Object.assign(new Error("Connection closed"), { code: "08006" })), null);
});
