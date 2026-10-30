import "./helpers/fleet-test-environment";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createLocalDrizzleDatabase } from "./helpers/local-drizzle-database";
import { saveAssetCatalog, copyAssetRequesters } from "../src/lib/patrimonio/catalog-service";
import { assetCatalogs, validateCatalogDetails } from "../src/lib/patrimonio/catalog-definitions";
import type { PermissionUser } from "../src/lib/contracts/identity";
import { reviseMaterialRequest } from "../src/lib/patrimonio/request-revisions";
import { renderAssetReport } from "../src/lib/patrimonio/catalog-report";

const user: PermissionUser = { id: "admin", firebaseUid: "admin", email: "admin@test.invalid", name: "Admin", role: "ADMIN", profileCode: "SYSTEM_ADMINISTRATOR", modulePermissions: [], allowedBudgetUnitIds: [], employeeId: null, departmentId: null, secretariatId: null };
test("cadastros patrimoniais: limites, datas e classificações válidas", () => {
  assert.throws(() => validateCatalogDetails("niveis", { materialId: "m", minimum: "10", average: "5", maximum: "20" }), /mínimo/);
  assert.throws(() => validateCatalogDetails("depreciacao", { months: "0", residualPercent: "20", legalBasis: "Lei 448/2002" }), /Vida útil/);
  assert.throws(() => validateCatalogDetails("seguros", { assetId: "a", insurer: "S", policy: "1", startsAt: "2026-02-30", endsAt: "2026-12-31" }), /inválida/);
  assert.equal(validateCatalogDetails("niveis", { materialId: "m", minimum: "1", average: "3", maximum: "5" }).average, "3");
});
test("SQL e CRUD persistente, concorrência, escopo e cópia idempotente de exercício", async () => {
  const fixture = await createLocalDrizzleDatabase();
  try {
    await fixture.database.exec(`CREATE TABLE "Department" (id TEXT PRIMARY KEY, "isActive" BOOLEAN); INSERT INTO "Department" VALUES ('dept',true),('other',true);
      CREATE TABLE "Employee" (id TEXT PRIMARY KEY,"departmentId" TEXT,"isActive" BOOLEAN); INSERT INTO "Employee" VALUES ('employee','dept',true);
      CREATE TABLE "Asset" (id TEXT PRIMARY KEY,"departmentId" TEXT); INSERT INTO "Asset" VALUES ('asset','dept');
      CREATE TABLE "Material" (id TEXT PRIMARY KEY,"isActive" BOOLEAN,"minStock" DOUBLE PRECISION,"maxStock" DOUBLE PRECISION,"updatedAt" TIMESTAMP); INSERT INTO "Material" VALUES ('material',true,0,0,CURRENT_TIMESTAMP);
      CREATE TABLE "AssetCategory" (id TEXT PRIMARY KEY,code TEXT UNIQUE,name TEXT,"lifeSpan" INTEGER,"isActive" BOOLEAN,"createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE "AuditEvent" (id TEXT PRIMARY KEY, "actorUsuarioId" TEXT,"eventType" TEXT,"targetType" TEXT,"targetId" TEXT,"createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE "MaterialRequest" (id TEXT PRIMARY KEY, number TEXT, "idempotencyKey" TEXT, status TEXT, date TIMESTAMP DEFAULT CURRENT_TIMESTAMP, justification TEXT, "sourceWarehouseId" TEXT, "departmentId" TEXT, "requesterId" TEXT, "approvedByEmployeeId" TEXT, "approvedAt" TIMESTAMP, "issuedByEmployeeId" TEXT, "issuedAt" TIMESTAMP, "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE "MaterialRequestItem" (id TEXT PRIMARY KEY, "quantityRequested" DOUBLE PRECISION, "quantityApproved" DOUBLE PRECISION DEFAULT 0, "quantityDelivered" DOUBLE PRECISION DEFAULT 0, "requestId" TEXT, "materialId" TEXT, "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
      INSERT INTO "MaterialRequest" (id,number,status,"departmentId") VALUES ('request','1','Pendente','dept');
      INSERT INTO "MaterialRequestItem" (id,"requestId","quantityRequested") VALUES ('item','request',2);`);
    await fixture.database.exec(readFileSync("db/migrations/20261030120000_asset_catalog_records/migration.sql", "utf8"));
    const input = { kind: "requisitantes", code: "R1", name: "Requisitante", year: 2026, departmentId: "dept", details: { employeeId: "employee", authorization: "Portaria 1" } };
    const id = await saveAssetCatalog(fixture.connection, user, input);
    const stored = await fixture.database.query<{ updatedAt: Date }>('SELECT "updatedAt" FROM "AssetCatalogRecord" WHERE id=$1', [id]);
    await saveAssetCatalog(fixture.connection, user, { ...input, id, name: "Requisitante atualizado", version: new Date(stored.rows[0].updatedAt).toISOString() });
    await assert.rejects(saveAssetCatalog(fixture.connection, user, { ...input, id, version: "2000-01-01T00:00:00.000Z" }), /outra sessão/);
    assert.equal(await copyAssetRequesters(fixture.connection, user, "dept", 2026), 1);
    assert.equal(await copyAssetRequesters(fixture.connection, user, "dept", 2026), 0);
    const copied = await fixture.database.query<{ name: string }>('SELECT name FROM "AssetCatalogRecord" WHERE year=2027');
    assert.equal(copied.rows[0].name, "Requisitante atualizado");
    await assert.rejects(saveAssetCatalog(fixture.connection, { ...user, role: "USER", profileCode: "USER", departmentId: "other" }, input), /escopo/);
    await assert.rejects(saveAssetCatalog(fixture.connection, user, { ...input, code: "R2", details: { employeeId: "missing", authorization: "Portaria" } }), /Servidor/);
    for (const [kind, definition] of Object.entries(assetCatalogs)) {
      const details = Object.fromEntries(definition.fields.map(field => [field.key, !field.required ? "" : field.key === "employeeId" ? "employee" : field.key === "assetId" ? "asset" : field.key === "materialId" ? "material" : field.type === "number" ? "2" : field.type === "date" ? "2026-01-01" : "Cadastro de teste"]));
      await saveAssetCatalog(fixture.connection, user, { kind, code: `CAT-${kind}`, name: definition.title, year: 2026, departmentId: "dept", details });
    }
    const counts = await fixture.database.query<{ total: number }>('SELECT count(DISTINCT kind)::int AS total FROM "AssetCatalogRecord"');
    assert.equal(counts.rows[0].total, Object.keys(assetCatalogs).length);
    assert.equal((await fixture.database.query<{ minStock: number }>('SELECT "minStock" FROM "Material" WHERE id=\'material\'')).rows[0].minStock, 2);
    await reviseMaterialRequest(fixture.connection, user, { requestId: "request", operation: "edit", reason: "Revisão de quantidade", justification: "Nova justificativa", items: [{ id: "item", quantity: 3 }] });
    assert.equal((await fixture.database.query<{ quantityRequested: number }>('SELECT "quantityRequested" FROM "MaterialRequestItem" WHERE id=\'item\'')).rows[0].quantityRequested, 3);
    assert.equal((await reviseMaterialRequest(fixture.connection, user, { requestId: "request", operation: "cancel", reason: "Cancelamento solicitado" })).status, "Cancelada");
    assert.equal((await reviseMaterialRequest(fixture.connection, user, { requestId: "request", operation: "restore", reason: "Estorno autorizado" })).status, "Pendente");
    await fixture.database.exec('UPDATE "MaterialRequestItem" SET "quantityDelivered"=1');
    await assert.rejects(reviseMaterialRequest(fixture.connection, user, { requestId: "request", operation: "cancel", reason: "Não pode cancelar entregue" }), /entrega/);
  } finally { await fixture.close(); }
});
test("emissão de relatório preserva valores, neutraliza fórmulas e escapa HTML e assinaturas", () => {
  const rows = [["=HYPERLINK(1)", "<script>alert(1)</script>", "3"]];
  const signatures = [{ name: "Servidor & Responsável", role: "Gestor" }];
  const html = renderAssetReport("Relatório", ["Código", "Bem", "Quantidade"], rows, signatures, "html");
  assert.ok(html.includes("&lt;script&gt;")); assert.ok(!html.includes("<script>")); assert.ok(html.includes("Servidor &amp; Responsável"));
  const csv = renderAssetReport("Relatório", ["Código", "Bem", "Quantidade"], rows, signatures, "csv");
  assert.ok(csv.includes('"\'=HYPERLINK(1)"')); assert.ok(csv.includes("Assinatura"));
});
