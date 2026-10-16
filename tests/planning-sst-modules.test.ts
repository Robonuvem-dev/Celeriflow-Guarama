import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { canPerformModuleOperation, canViewModule, type AppContext } from "../src/lib/platform/tenant-context";

const user: AppContext["user"] = {
  id: "operator", firebaseUid: "operator", email: "operator@example.invalid", name: "Operador", role: "Operador", profileCode: "OPERACIONAL",
  modulePermissions: [], allowedBudgetUnitIds: [], employeeId: null, departmentId: null, secretariatId: null,
};
const permission = { showDashboardCard: true, blocked: false, create: true, update: false, delete: false, issueReports: false };

test("planning and occupational modules do not grant Finance, HR or clinical access", () => {
  const authorized = { ...user, permissions: JSON.stringify({ modules: { PLANEJAMENTO: permission, SST: permission } }) };
  assert.equal(canViewModule(authorized, "PLANEJAMENTO"), true);
  assert.equal(canViewModule(authorized, "SST"), true);
  for (const code of ["FINANCEIRO", "RH", "SAUDE", "SEGURANCA"]) assert.equal(canViewModule(authorized, code), false);
  assert.equal(canPerformModuleOperation(authorized, "PLANEJAMENTO", "create"), true);
  assert.equal(canPerformModuleOperation(authorized, "PLANEJAMENTO", "update"), false);
});

test("existing Finance and HR access is preserved without granting new modules implicitly", () => {
  const authorized = { ...user, permissions: JSON.stringify({ modules: { FINANCEIRO: permission, RH: permission } }) };
  assert.equal(canViewModule(authorized, "FINANCEIRO"), true);
  assert.equal(canViewModule(authorized, "RH"), true);
  assert.equal(canViewModule(authorized, "PLANEJAMENTO"), false);
  assert.equal(canViewModule(authorized, "SST"), false);
});

test("new module migration is additive and respects an existing activation choice", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE "ConfiguracaoModulo" (
      id TEXT PRIMARY KEY, nome TEXT NOT NULL, codigo TEXT UNIQUE NOT NULL, ativo BOOLEAN NOT NULL,
      "dataAtivacao" TIMESTAMP, "createdAt" TIMESTAMP NOT NULL, "updatedAt" TIMESTAMP NOT NULL
    );
    INSERT INTO "ConfiguracaoModulo" VALUES ('finance', 'Financeiro', 'FINANCEIRO', true, now(), now(), now());`);
    const migration = readFileSync("prisma/migrations-ibema/20261010140000_add_planning_sst_modules/migration.sql", "utf8");
    await db.exec(migration);
    await db.exec(`UPDATE "ConfiguracaoModulo" SET ativo = false WHERE codigo = 'SST'`);
    await db.exec(migration);
    const { rows } = await db.query<{ codigo: string; ativo: boolean }>('SELECT codigo, ativo FROM "ConfiguracaoModulo" ORDER BY codigo');
    assert.deepEqual(rows, [{ codigo: "FINANCEIRO", ativo: true }, { codigo: "PLANEJAMENTO", ativo: true }, { codigo: "SST", ativo: false }]);
  } finally {
    await db.close();
  }
});
