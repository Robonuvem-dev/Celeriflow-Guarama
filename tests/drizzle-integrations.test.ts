import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { eq, sql } from "drizzle-orm";
import { createLocalDrizzleDatabase } from "./helpers/local-drizzle-database";
import { integrationConnections, integrationRuns } from "../src/db/schema/integrations";
import { sequenceCounters } from "../src/db/schema/sequences";
import { findIntegrationConnection, listIntegrationConnections, saveIntegrationConfiguration, updateIntegrationTestResult } from "../src/db/repositories/platform/integrations";
import { nextYearlyCodeDrizzle } from "../src/db/repositories/platform/sequences";
import { executeConfiguredHealthCheck, executeConfiguredIntegration } from "../src/lib/integrations/runtime";
import { buildRunStartEnvelope } from "../src/lib/integrations/contract";

const baseline = readFileSync(new URL("../prisma/migrations-ibema/20261009232000_baseline/migration.sql", import.meta.url), "utf8");

test("integration persistence and yearly codes use the production driver on an isolated database", { timeout: 120_000 }, async t => {
  const fixture = await createLocalDrizzleDatabase();
  const db = fixture.connection.db;
  try {
    // Reuse historical DDL rather than creating tables from the new mapping.
    const statements = ["IntegrationConnection", "IntegrationRun", "SequenceCounter"].map(name => {
      const statement = baseline.match(new RegExp(`CREATE TABLE "${name}" \\([\\s\\S]*?\\n\\);`))?.[0];
      assert.ok(statement, `Missing historical table ${name}`);
      return statement;
    });
    const keys = baseline.split(/\r?\n/).filter(line => /^(CREATE (UNIQUE )?INDEX "(IntegrationConnection_|IntegrationRun_|SequenceCounter_)|ALTER TABLE "IntegrationRun" ADD CONSTRAINT "IntegrationRun_connectionId_fkey")/.test(line));
    await fixture.database.exec([...statements, ...keys].join("\n"));
    const input = { code: "SICONFI", name: "Siconfi", category: "Financeiro", provider: "Teste", environment: "MOCK", status: "ATIVA", baseUrl: null, credentialReference: null };

    await t.test("configuration upsert preserves identity, timestamps and SQL/JSON null semantics", async () => {
      const first = await saveIntegrationConfiguration(db, input);
      let nulls = await db.execute<{ sqlNull: boolean; jsonType: string | null }>(sql`select configuration is null as "sqlNull", jsonb_typeof(configuration) as "jsonType" from "IntegrationConnection" where id=${first.id}`);
      assert.deepEqual(nulls.rows, [{ sqlNull: true, jsonType: null }]);
      // The pre-removal runtime was independently checked against this driver:
      // an omitted field creates SQL NULL; an explicit raw null creates JSON null.
      const explicitNull = await saveIntegrationConfiguration(db, { ...input, code: "NULL-JSON", configuration: null, mockScenario: null });
      const explicit = await db.execute<{ sqlNull: boolean; jsonType: string | null; mockSqlNull: boolean; mockJsonType: string | null }>(sql`select configuration is null as "sqlNull", jsonb_typeof(configuration) as "jsonType", "mockScenario" is null as "mockSqlNull", jsonb_typeof("mockScenario") as "mockJsonType" from "IntegrationConnection" where id=${explicitNull.id}`);
      assert.deepEqual(explicit.rows, [{ sqlNull: false, jsonType: "null", mockSqlNull: false, mockJsonType: "null" }]);
      const saved = await saveIntegrationConfiguration(db, { ...input, configuration: { enabled: false, retries: 2 }, mockScenario: { scenario: "success" } });
      assert.equal(saved.id, first.id);
      assert.equal(saved.createdAt.toISOString(), first.createdAt.toISOString());
      assert.ok(saved.updatedAt >= first.updatedAt);
      assert.deepEqual((await findIntegrationConnection(db, "code", input.code))?.configuration, { enabled: false, retries: 2 });
      await saveIntegrationConfiguration(db, input);
      nulls = await db.execute(sql`select configuration is null as "sqlNull", jsonb_typeof(configuration) as "jsonType" from "IntegrationConnection" where id=${first.id}`);
      assert.deepEqual(nulls.rows, [{ sqlNull: false, jsonType: "null" }]);
      assert.equal(await findIntegrationConnection(db, "id", "missing"), null);
      await updateIntegrationTestResult(db, first.id, { status: "FALHA", message: "Tente novamente" });
      assert.equal((await findIntegrationConnection(db, "id", first.id))?.status, "CONFIGURANDO");
      await updateIntegrationTestResult(db, first.id, { status: "SUCESSO", message: "Disponível" });
      assert.equal((await findIntegrationConnection(db, "id", first.id))?.lastTestStatus, "SUCESSO");
    });

    await t.test("execution records the same sanitized lifecycle and rejects an identical in-flight request", async () => {
      let entered!: () => void;
      let release!: () => void;
      const started = new Promise<void>(resolve => { entered = resolve; });
      const released = new Promise<void>(resolve => { release = resolve; });
      const request = { code: input.code, operation: "HEALTH_CHECK" as const, payload: { publicId: 1, token: "must-not-persist" } };
      const adapter = { operation: request.operation, async execute() {
        entered(); await released;
        return { data: "ok", status: "SUCESSO" as const, message: "Disponível", externalId: "mock-ref", evidence: { count: 2, responseBody: "must-not-persist" } };
      } };
      const running = executeConfiguredIntegration(db, request, adapter);
      try {
        await started;
        await assert.rejects(executeConfiguredIntegration(db, request, adapter), /já está em andamento/);
      } finally { release(); }
      assert.equal((await running).data, "ok");
      const [run] = await db.select().from(integrationRuns);
      assert.equal(run.status, "SUCESSO");
      assert.equal(run.externalId, "mock-ref");
      assert.ok(run.createdAt instanceof Date);
      assert.deepEqual(run.payload, { ...buildRunStartEnvelope({ ...request, environment: "MOCK" }), phase: "COMPLETED", outcome: { status: "SUCESSO", externalId: "mock-ref", evidence: { count: 2 } } });
      assert.equal(JSON.stringify(run.payload).includes("must-not-persist"), false);
      assert.equal((await executeConfiguredHealthCheck(db, input.code)).status, "SUCESSO");
    });

    await t.test("inactive and failed dispatches retain failure evidence and permit a later retry", async () => {
      const saved = await saveIntegrationConfiguration(db, { ...input, status: "DESATIVADA" });
      await assert.rejects(executeConfiguredHealthCheck(db, input.code), /não está ativa/);
      const [failed] = await db.select().from(integrationRuns).where(eq(integrationRuns.status, "FALHA"));
      assert.equal(failed.message, `A integração ${input.code} não está ativa nesta instalação.`);
      assert.equal((failed.payload as { phase: string }).phase, "FAILED");
      await updateIntegrationTestResult(db, saved.id, { status: "SUCESSO", message: "Disponível" });
      await assert.rejects(executeConfiguredIntegration(db, { code: input.code, operation: "HEALTH_CHECK" }, { operation: "HEALTH_CHECK", async execute() { throw new Error("private endpoint diagnostic"); } }), /private endpoint diagnostic/);
      const all = await db.select().from(integrationRuns).where(eq(integrationRuns.status, "FALHA"));
      assert.ok(all.some(run => run.message === "Falha na execução da integração. Consulte o ambiente configurado e a evidência sanitizada."));
      assert.equal(JSON.stringify(all).includes("private endpoint diagnostic"), false);
      assert.equal((await executeConfiguredHealthCheck(db, input.code)).status, "SUCESSO");
      assert.deepEqual(await db.select().from(integrationRuns).where(eq(integrationRuns.status, "EXECUTANDO")), []);
    });

    await t.test("a persisted in-flight envelope is checked before dispatch", async () => {
      const connection = await findIntegrationConnection(db, "code", input.code);
      assert.ok(connection);
      const payload = buildRunStartEnvelope({ code: input.code, operation: "HEALTH_CHECK", environment: "MOCK", payload: { code: input.code } });
      const [run] = await db.insert(integrationRuns).values({ connectionId: connection.id, operation: "HEALTH_CHECK", environment: "MOCK", status: "EXECUTANDO", message: "Persisted fixture", payload: sql`${JSON.stringify(payload)}::jsonb` }).returning();
      await assert.rejects(executeConfiguredHealthCheck(db, input.code), /já está em andamento/);
      await db.delete(integrationRuns).where(eq(integrationRuns.id, run.id));
    });

    await t.test("page projection loads three recent runs independently per connection", async () => {
      const connection = await saveIntegrationConfiguration(db, { ...input, code: "RECENT", category: "A" });
      const other = await saveIntegrationConfiguration(db, { ...input, code: "OTHER", category: "Z" });
      for (let index = 0; index < 5; index++) await db.insert(integrationRuns).values({ connectionId: connection.id, operation: String(index), environment: "MOCK", status: "SUCESSO", message: "fixture", createdAt: new Date(Date.UTC(2099, 0, index + 1)) });
      await db.insert(integrationRuns).values({ connectionId: other.id, operation: "independent", environment: "MOCK", status: "SUCESSO", message: "fixture" });
      const listed = await listIntegrationConnections(db);
      assert.equal(listed[0].code, "RECENT");
      assert.deepEqual(listed.find(row => row.id === connection.id)?.runs.map(run => run.operation), ["4", "3", "2"]);
      assert.deepEqual(listed.find(row => row.id === other.id)?.runs.map(run => run.operation), ["independent"]);
      await db.delete(integrationConnections).where(eq(integrationConnections.id, connection.id));
      assert.deepEqual(await db.select().from(integrationRuns).where(eq(integrationRuns.connectionId, connection.id)), []);
    });

    await t.test("yearly codes bootstrap from matching codes, increment atomically and roll back with the caller", async () => {
      const year = new Date().getFullYear();
      const options = { db, key: "fixture-code", prefix: "REQ", padding: 6, existingCodes: [{ code: `REQ-${year}-000007` }, { code: `REQ-${year - 1}-999999` }, { code: `OTHER-${year}-999999` }] };
      assert.equal(await nextYearlyCodeDrizzle(options), `REQ-${year}-000008`);
      const codes = await Promise.all(Array.from({ length: 5 }, () => nextYearlyCodeDrizzle(options)));
      assert.deepEqual(codes.sort(), Array.from({ length: 5 }, (_, index) => `REQ-${year}-${String(9 + index).padStart(6, "0")}`));
      const [before] = await db.select().from(sequenceCounters);
      const abort = new Error("expected rollback");
      await assert.rejects(db.transaction(async tx => { await nextYearlyCodeDrizzle({ ...options, db: tx }); throw abort; }), error => error === abort);
      const [after] = await db.select().from(sequenceCounters);
      assert.deepEqual(after, before);
    });
  } finally { await fixture.close(); }
});
