import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { sql } from "drizzle-orm";
import { createLocalDrizzleDatabase } from "./helpers/local-drizzle-database";
import { withDatabaseTransaction } from "../src/db/transaction";
import { getPostgresError } from "../src/db/errors";
import { users } from "../src/db/schema/identity";
import { identifier, insertToolRows, queryRows, readApplicationCatalog } from "../scripts/lib/cross-domain-database";
import { applyRepopulationChanges, type RepopulationChange } from "../scripts/lib/cross-domain-repopulation";
import { readPlanningCatalogs } from "../scripts/lib/cross-domain-planning-catalogs";
import { runMunicipalDemoStage } from "../scripts/seed-municipal-demo";
import { seedFoundation, seedCitizenServices, seedEducationHealthSocial, key } from "../scripts/municipal-system-dataset";
import { insertMunicipalDatasetRows } from "../scripts/lib/municipal-dataset-insert";
import { demoFleet, demoMaterials, demoMedicines } from "../scripts/municipal-demo-catalogs";
import { PGlite } from "@electric-sql/pglite";
import { openLocalToolDatabase } from "../scripts/lib/cross-domain-local-database";

test("ferramentas transversais: driver Neon real, preservação e rollback", { timeout: 300_000 }, async t => {
  const fixture = await createLocalDrizzleDatabase();
  const { db } = fixture.connection;
  try {
    for (const directory of readdirSync("prisma/migrations-ibema", { withFileTypes: true }).filter(item => item.isDirectory()).map(item => item.name).sort()) {
      await fixture.database.exec(readFileSync(`prisma/migrations-ibema/${directory}/migration.sql`, "utf8"));
    }
    const [profile] = await queryRows<{ id: string }>(db, sql`SELECT id FROM "ConfiguracaoPerfil" LIMIT 1`);
    const [actor] = await db.insert(users).values({ nome: "Operador de teste", email: "cross-domain@auroradasveredas.example", perfilId: profile.id }).returning();

    await t.test("inserção aditiva respeita chave de conflito, IDs, JSON e timestamps", async () => {
      await withDatabaseTransaction(fixture.connection, async tx => {
        assert.equal(await insertToolRows(tx, "MaterialCategory", { id: "cross-domain-category", code: "CROSS-DOMAIN", name: "Categoria preservada" }, ["code"]), 1);
        assert.equal(await insertToolRows(tx, "MaterialCategory", { id: "other-id", code: "CROSS-DOMAIN", name: "Não sobrescrever" }, ["code"]), 0);
        await insertToolRows(tx, "PlanningCatalogVersion", { id: "cross-domain-catalog", year: 2026, label: "Referência", normativeReference: "Somente teste", sourceHash: "cross-domain-hash", status: "DRAFT", createdById: actor.id });
        await insertToolRows(tx, "PlanningCatalogEntry", [
          { id: "cross-entry-z", versionId: "cross-domain-catalog", kind: "SOURCE", code: "Z", name: "Última", degree: 1, canonicalId: "z", attributes: { strings: ["a", "b"], nullable: null, boolean: false } },
          { id: "cross-entry-a", versionId: "cross-domain-catalog", kind: "SOURCE", code: "A", name: "Primeira", degree: 1, canonicalId: "a", attributes: { amount: "123456789012345.67" } },
        ]);
      });
      const [category] = await queryRows<{ id: string; name: string; updatedAt: unknown }>(db, sql`SELECT id,name,"updatedAt" FROM "MaterialCategory" WHERE code='CROSS-DOMAIN'`);
      assert.equal(category.id, "cross-domain-category");
      assert.equal(category.name, "Categoria preservada");
      assert.ok(category.updatedAt);
      const [catalog] = await readPlanningCatalogs(db, ["cross-domain-catalog"]);
      assert.deepEqual(catalog.entries.map(entry => entry.id), ["cross-entry-a", "cross-entry-z"]);
      assert.deepEqual(catalog.entries[1].attributes, { strings: ["a", "b"], nullable: null, boolean: false });
      await assert.rejects(withDatabaseTransaction(fixture.connection, tx => insertToolRows(tx, "MaterialCategory", { id: category.id, code: "DIFFERENT", name: "Falhar" }, ["code"])), error => getPostgresError(error)?.code === "23505");
      await assert.rejects(insertToolRows(db, 'Person"; DROP TABLE "Usuario', {}), /fora do catálogo/);
      assert.throws(() => identifier('name" = NULL; --'), /Identificador inválido/);
    });

    await t.test("catálogo físico inclui relações obrigatórias sem DMMF", async () => {
      const catalog = await readApplicationCatalog(db);
      const user = catalog.find(model => model.name === "Usuario")!;
      assert.ok(user.fields.some(field => field.name === "nome" && field.isString && !field.isArray));
      assert.ok(user.relations.some(relation => relation.model === "ConfiguracaoPerfil" && relation.required && relation.columns.includes("perfilId")));
      assert.ok(!catalog.some(model => model.name.startsWith("_")));
    });

    await withDatabaseTransaction(fixture.connection, tx => seedFoundation({ tx, actorId: actor.id }));
    const snapshot = async (id: string) => (await queryRows<{ row: Record<string, unknown> }>(db, sql`SELECT to_jsonb(p) AS row FROM "Person" p WHERE id=${id}`))[0].row;
    const firstId = key("person", 0), secondId = key("person", 1);

    await t.test("repopulação preserva snapshot completo e audita em uma transação", async () => {
      const before = await snapshot(firstId);
      const name = "Nome parametrizado '); DELETE FROM Usuario; --";
      await withDatabaseTransaction(fixture.connection, tx => applyRepopulationChanges(tx, [{ model: "Person", id: firstId, before: { fullName: String(before.fullName) }, after: { fullName: name }, snapshot: before }], actor.id));
      const after = await snapshot(firstId);
      assert.equal(after.fullName, name);
      for (const field of Object.keys(before).filter(field => !["fullName", "updatedAt"].includes(field))) assert.deepEqual(after[field], before[field], field);
      const [log] = await queryRows<{ payload: { before: unknown; after: unknown; credentialsPreserved: boolean } }>(db, sql`SELECT payload FROM "FinancialAuditLog" WHERE action='PLAUSIBLE_CADASTRO_UPDATED' AND "entityId"=${firstId}`);
      assert.deepEqual(log.payload.after, { fullName: name });
      assert.equal(log.payload.credentialsPreserved, true);
    });

    await t.test("edição concorrente ou falha de auditoria reverte todas as alterações", async () => {
      const first = await snapshot(firstId), second = await snapshot(secondId);
      const change: RepopulationChange = { model: "Person", id: firstId, before: { fullName: String(first.fullName) }, after: { fullName: "Não gravar" }, snapshot: first };
      const stale: RepopulationChange = { model: "Person", id: secondId, before: { fullName: String(second.fullName) }, after: { fullName: "Também não gravar" }, snapshot: { ...second, email: "snapshot-obsoleto" } };
      await assert.rejects(withDatabaseTransaction(fixture.connection, tx => applyRepopulationChanges(tx, [change, stale], actor.id)), /Cadastro alterado durante a prévia/);
      assert.deepEqual(await snapshot(firstId), first);
      await assert.rejects(withDatabaseTransaction(fixture.connection, tx => applyRepopulationChanges(tx, [change], "missing-actor")), error => getPostgresError(error)?.code === "23503");
      assert.deepEqual(await snapshot(firstId), first);
    });

    await t.test("cinco estágios da carga demo mantêm vínculos, valores e replay", async () => {
      await withDatabaseTransaction(fixture.connection, tx => seedCitizenServices({ tx, actorId: actor.id }));
      await withDatabaseTransaction(fixture.connection, tx => seedEducationHealthSocial({ tx, actorId: actor.id }));
      await withDatabaseTransaction(fixture.connection, tx => insertMunicipalDatasetRows(tx, "EnvEnterprise", Array.from({ length: 6 }, (_, i) => ({ id: key("enterprise", i), name: `Empreendimento ${i}` }))));
      const stages = ["organization", "stock", "fleet", "peopleAndServices", "finance"] as const;
      await assert.rejects(runMunicipalDemoStage(fixture.connection, "organization", "missing-actor"), error => getPostgresError(error)?.code === "23503");
      assert.equal((await queryRows(db, sql`SELECT id FROM "Person" WHERE starts_with(id,'aurora-mg-50k-v1:')`)).length, 0, "Falha da auditoria reverte o estágio inteiro");
      for (const stage of stages) await runMunicipalDemoStage(fixture.connection, stage, actor.id);
      const count = async (table: string) => Number((await queryRows<{ count: string }>(db, sql`SELECT count(*) AS count FROM ${identifier(table)} WHERE starts_with(id,'aurora-mg-50k-v1:')`))[0].count);
      assert.equal(await count("Person"), 180);
      assert.equal(await count("Employee"), 180);
      assert.equal(await count("Material"), demoMaterials.length + demoMedicines.length);
      assert.equal(await count("MedicineBatch"), demoMedicines.length * 2);
      assert.equal(await count("FleetUnit"), demoFleet.length);
      assert.equal(await count("BudgetAppropriation"), 45);
      const [control] = await queryRows<{ allowedLicenseCategories: string[] }>(db, sql`SELECT "allowedLicenseCategories" FROM "FleetUnitControl" WHERE "unitId"='aurora-mg-50k-v1:fleet:000'`);
      assert.deepEqual(control.allowedLicenseCategories, ["B"]);
      const [payroll] = await queryRows<{ total: string; items: string }>(db, sql`SELECT p."totalValueDecimal"::text AS total,(SELECT sum(i."valueDecimal")::text FROM "PayrollItem" i WHERE i."payrollId"=p.id) AS items FROM "Payroll" p WHERE id='aurora-mg-50k-v1:payroll:000'`);
      assert.equal(payroll.total, payroll.items);
      const prior = await snapshot("aurora-mg-50k-v1:person:000");
      for (const stage of stages) await runMunicipalDemoStage(fixture.connection, stage, actor.id);
      assert.equal(await count("Person"), 180);
      assert.deepEqual(await snapshot("aurora-mg-50k-v1:person:000"), prior);
      assert.equal(Number((await queryRows<{ count: string }>(db, sql`SELECT count(*) AS count FROM "AuditEvent" WHERE "targetId"='aurora-mg-50k-v1'`))[0].count), 5);
    });
  } finally { await fixture.close(); }
});

test("transporte P0 local usa o driver Neon e encerra seus sockets", { timeout: 60_000 }, async () => {
  const database = new PGlite();
  const local = await openLocalToolDatabase(database);
  try {
    const [row] = await queryRows<{ value: string }>(local.connection.db, sql`SELECT ${"somente loopback"}::text AS value`);
    assert.equal(row.value, "somente loopback");
  } finally { await local.close(); await database.close(); }
});
