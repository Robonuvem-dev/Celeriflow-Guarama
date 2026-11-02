import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { and, count, eq } from "drizzle-orm";
import { createLocalDrizzleDatabase } from "./helpers/local-drizzle-database";
import { withDatabaseTransaction } from "../src/db/transaction";
import { getPostgresError } from "../src/db/errors";
import { instanceParameters } from "../src/db/schema/instance-configuration";
import { auditEvents } from "../src/db/schema/audit";
import { saveRecyclingCatalogEntry } from "../src/db/repositories/environment/recycling-catalog";
import { recyclingCatalogs, recyclingEntryKey, type RecyclingEntry } from "../src/lib/environment/recycling-catalog";

let fixture: Awaited<ReturnType<typeof createLocalDrizzleDatabase>>;
before(async () => {
  fixture = await createLocalDrizzleDatabase();
  await fixture.database.exec(`
    CREATE TABLE "Usuario" (id text PRIMARY KEY);
    INSERT INTO "Usuario" VALUES ('operator');
    CREATE TABLE "ConfiguracaoInstancia" (id text PRIMARY KEY);
    INSERT INTO "ConfiguracaoInstancia" VALUES ('one'), ('two');
    CREATE TABLE "ConfiguracaoParametroInstancia" (
      id text PRIMARY KEY,
      "configuracaoInstanciaId" text NOT NULL REFERENCES "ConfiguracaoInstancia"(id),
      chave text NOT NULL, valor jsonb NOT NULL,
      "createdAt" timestamp NOT NULL DEFAULT now(), "updatedAt" timestamp NOT NULL DEFAULT now(),
      UNIQUE ("configuracaoInstanciaId", chave)
    );
    CREATE TABLE "AuditEvent" (
      id text PRIMARY KEY, "eventType" text NOT NULL, "targetType" text NOT NULL,
      "targetId" text NOT NULL, "actorUsuarioId" text NOT NULL REFERENCES "Usuario"(id),
      "createdAt" timestamp NOT NULL DEFAULT now()
    );
  `);
});
after(async () => { await fixture?.close(); });

function entry(kind: RecyclingEntry["kind"], code: string, name = "Cadastro original"): RecyclingEntry {
  return { kind, code, name, description: "Descrição", address: "Rua central", active: true };
}
function save(value: RecyclingEntry, mode: "create" | "update" = "create", instanceId = "one", actorUsuarioId = "operator") {
  return withDatabaseTransaction(fixture.connection, tx => saveRecyclingCatalogEntry(tx, {
    instanceId, actorUsuarioId, mode, entry: value,
  }));
}
async function read(value: RecyclingEntry, instanceId = "one") {
  return (await fixture.connection.db.select().from(instanceParameters).where(and(
    eq(instanceParameters.configuracaoInstanciaId, instanceId),
    eq(instanceParameters.chave, recyclingEntryKey(value)),
  )))[0];
}
async function audits(value: RecyclingEntry, instanceId = "one") {
  return fixture.connection.db.select().from(auditEvents).where(eq(auditEvents.targetId, `${instanceId}:${recyclingEntryKey(value)}`));
}

test("os cinco catálogos persistem e editam o registro legado sem mudar sua identidade", async () => {
  for (const kind of Object.keys(recyclingCatalogs) as RecyclingEntry["kind"][]) {
    const original = entry(kind, "CRUD");
    await save(original);
    const created = await read(original);
    assert.deepEqual(created.valor, original);
    const revised = { ...original, name: "Cadastro atualizado", active: false };
    await save(revised, "update");
    const updated = await read(original);
    assert.equal(updated.id, created.id);
    assert.equal(updated.chave, created.chave);
    assert.deepEqual(updated.valor, revised);
    const events = await audits(original);
    assert.equal(events.length, 2);
    assert(events.every(event => event.actorUsuarioId === "operator" && event.targetType === "RecyclingCatalog" && event.eventType === "ADMINISTRATIVE_MUTATION"));
  }
});

test("códigos iguais permanecem separados por instância e catálogo e não alteram outros parâmetros", async () => {
  const unit = entry("units", "SCOPE");
  const material = entry("materials", "SCOPE");
  await fixture.connection.db.insert(instanceParameters).values({ configuracaoInstanciaId: "one", chave: "OTHER_MODULE:SCOPE", valor: { preserve: true } });
  await save(unit);
  await save(material);
  await save({ ...unit, name: "Outra instância" }, "create", "two");
  await save({ ...unit, name: "Unidade editada" }, "update");
  assert.equal((await read(unit)).id === (await read(material)).id, false);
  assert.deepEqual((await read(material)).valor, material);
  assert.deepEqual((await read(unit, "two")).valor, { ...unit, name: "Outra instância" });
  const [other] = await fixture.connection.db.select().from(instanceParameters).where(eq(instanceParameters.chave, "OTHER_MODULE:SCOPE"));
  assert.deepEqual(other.valor, { preserve: true });
});

test("duplicidade normalizada e edição inexistente não gravam dados nem eventos", async () => {
  const original = entry("depots", "duplicate");
  await save(original);
  await assert.rejects(save({ ...original, code: "DUPLICATE", name: "Não substituir" }), /Código já cadastrado/);
  assert.deepEqual((await read(original)).valor, original);
  assert.equal((await audits(original)).length, 1);
  const missing = entry("depots", "MISSING");
  await assert.rejects(save(missing, "update"), /Registro não encontrado/);
  assert.equal(await read(missing), undefined);
  assert.equal((await audits(missing)).length, 0);
});

test("duas criações concorrentes do mesmo código têm somente um vencedor e uma auditoria", async () => {
  const first = entry("centers", "concurrent", "Primeiro centro");
  const second = entry("centers", "CONCURRENT", "Segundo centro");
  const results = await Promise.allSettled([save(first), save(second)]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  const failure = results.find(result => result.status === "rejected");
  assert(failure?.status === "rejected");
  assert.match(String(failure.reason), /Código já cadastrado/);
  const winner = results[0].status === "fulfilled" ? first : second;
  assert.deepEqual((await read(first)).valor, winner);
  assert.equal((await audits(first)).length, 1);
});

test("falha de auditoria reverte tanto inclusão quanto alteração do catálogo", async () => {
  const newEntry = entry("materials", "ROLLBACK-CREATE");
  const invalidActor = (error: unknown) => getPostgresError(error)?.code === "23503";
  await assert.rejects(save(newEntry, "create", "one", "missing-user"), invalidActor);
  assert.equal(await read(newEntry), undefined);
  assert.equal((await audits(newEntry)).length, 0);

  const original = entry("materials", "ROLLBACK-UPDATE");
  await save(original);
  const before = await read(original);
  await assert.rejects(save({ ...original, name: "Não persistir", active: false }, "update", "one", "missing-user"), invalidActor);
  assert.deepEqual(await read(original), before);
  assert.equal((await audits(original)).length, 1);
  const [invalid] = await fixture.connection.db.select({ total: count() }).from(auditEvents).where(eq(auditEvents.actorUsuarioId, "missing-user"));
  assert.equal(invalid.total, 0);
});
