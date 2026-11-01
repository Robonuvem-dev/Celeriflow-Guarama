import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import { and, count, eq } from "drizzle-orm";
import { createLocalDrizzleDatabase } from "./helpers/local-drizzle-database";
import { withDatabaseTransaction } from "../src/db/transaction";
import { getPostgresError } from "../src/db/errors";
import { auditEvents } from "../src/db/schema/audit";
import { recyclingMaterialBindings, recyclingMovements, recyclingStocks } from "../src/db/schema/environment-recycling";
import { saveRecyclingCatalogEntry } from "../src/db/repositories/environment/recycling-catalog";
import { hasRecyclingStockSchema, loadRecyclingStockPage, recordRecyclingMovement } from "../src/db/repositories/environment/recycling-stock";
import { recyclingEntryKey, type RecyclingEntry } from "../src/lib/environment/recycling-catalog";
import { normalizeRecyclingMovementInput, recyclingToday } from "../src/lib/environment/recycling-stock";
import { canPerformModuleOperation, canViewModule } from "../src/lib/platform/tenant-context";
import type { PermissionUser } from "../src/lib/contracts/identity";

let fixture: Awaited<ReturnType<typeof createLocalDrizzleDatabase>>;
const now = new Date("2026-11-01T15:00:00Z");
const normalize = (raw: unknown) => normalizeRecyclingMovementInput(raw, now);
before(async () => {
  fixture = await createLocalDrizzleDatabase();
  await fixture.database.exec(`
    CREATE TABLE "Usuario" (id text PRIMARY KEY);
    INSERT INTO "Usuario" VALUES ('operator'),('other'),('fail-audit');
    CREATE TABLE "ConfiguracaoInstancia" (id text PRIMARY KEY);
    INSERT INTO "ConfiguracaoInstancia" VALUES ('one'),('two'),('paging');
    CREATE TABLE "ConfiguracaoParametroInstancia" (
      id text PRIMARY KEY, "configuracaoInstanciaId" text NOT NULL REFERENCES "ConfiguracaoInstancia"(id),
      chave text NOT NULL, valor jsonb NOT NULL,
      "createdAt" timestamp DEFAULT now(), "updatedAt" timestamp DEFAULT now(),
      UNIQUE ("configuracaoInstanciaId",chave)
    );
    CREATE TABLE "AuditEvent" (
      id text PRIMARY KEY, "eventType" text NOT NULL, "targetType" text NOT NULL, "targetId" text NOT NULL,
      "actorUsuarioId" text NOT NULL REFERENCES "Usuario"(id), "createdAt" timestamp DEFAULT now(),
      CHECK ("targetType" <> 'RecyclingMovement' OR "actorUsuarioId" <> 'fail-audit')
    );
    CREATE TABLE "MaterialStock" (id text PRIMARY KEY,quantity numeric);
    INSERT INTO "MaterialStock" VALUES ('preserve-patrimony',77);
    CREATE TABLE "EnvWaste" (id text PRIMARY KEY,"quantityKg" numeric);
    INSERT INTO "EnvWaste" VALUES ('preserve-collection',33);
  `);
});
after(async () => { await fixture?.close(); });

function input(prefix: string, overrides: Record<string, unknown> = {}) {
  return {
    kind: "ENTRY", materialCode: `${prefix}-M`, depotCode: `${prefix}-D`, typeCode: `${prefix}-T`, unitCode: `${prefix}-U`,
    quantity: "10.125", amount: "0", occurredOn: "2026-10-31", origin: "Coleta do bairro", notes: "Comprovante 01", idempotencyKey: randomUUID(), ...overrides,
  };
}
function exit(prefix: string, overrides: Record<string, unknown> = {}) {
  return input(prefix, { kind: "EXIT", typeCode: "", unitCode: "", destinationCode: `${prefix}-C`, origin: "", quantity: "4.025", amount: "15,27", ...overrides });
}
async function save(raw: unknown, instanceId = "one", actor = "operator") {
  const parsed = normalize(raw);
  return withDatabaseTransaction(fixture.connection, tx => recordRecyclingMovement(tx, instanceId, actor, parsed));
}
async function seed(prefix: string, instanceId = "one") {
  const values: RecyclingEntry[] = ([ ["materials", "M"], ["depots", "D"], ["depots", "D2"], ["types", "T"], ["units", "U"], ["units", "U2"], ["centers", "C"] ] as const).map(([kind, suffix]) => ({
    kind, code: `${prefix}-${suffix}`, name: `${kind} ${prefix}-${suffix}`, description: "", address: "Endereço original", active: true,
  }));
  await withDatabaseTransaction(fixture.connection, async tx => {
    for (const entry of values) await saveRecyclingCatalogEntry(tx, { instanceId, actorUsuarioId: "operator", mode: "create", entry });
  });
  return values;
}
const materialKey = (prefix: string) => recyclingEntryKey({ kind: "materials", code: `${prefix}-M` });
async function position(prefix: string, instanceId = "one", depotSuffix = "D") {
  return (await fixture.connection.db.select().from(recyclingStocks).where(and(eq(recyclingStocks.instanceId, instanceId), eq(recyclingStocks.materialKey, materialKey(prefix)), eq(recyclingStocks.depotKey, recyclingEntryKey({ kind: "depots", code: `${prefix}-${depotSuffix}` })))))[0];
}
async function history(prefix: string, instanceId = "one") {
  return fixture.connection.db.select().from(recyclingMovements).where(and(eq(recyclingMovements.instanceId, instanceId), eq(recyclingMovements.materialKey, materialKey(prefix)))).orderBy(recyclingMovements.sequence);
}
async function eventCount(prefix: string) {
  const records = await history(prefix);
  const events = await fixture.connection.db.select().from(auditEvents).where(eq(auditEvents.targetType, "RecyclingMovement"));
  return events.filter(event => records.some(record => event.targetId === `${record.instanceId}:${record.id}`)).length;
}

test("migração aditiva é transacional e a funcionalidade fica indisponível até sua aplicação", async () => {
  assert.equal(await hasRecyclingStockSchema(fixture.connection.db), false);
  await assert.rejects(save(input("UNAVAILABLE")), /ainda não está disponível/);
  const migration = await readFile("db/migrations/20261101120000_cf10_recycling_stock/migration.sql", "utf8");
  await fixture.database.exec(`BEGIN;\n${migration}\nROLLBACK;`);
  assert.equal(await hasRecyclingStockSchema(fixture.connection.db), false);
  await fixture.database.exec(migration);
  assert.equal(await hasRecyclingStockSchema(fixture.connection.db), true);
  assert.deepEqual((await fixture.database.query('SELECT quantity::text FROM "MaterialStock"')).rows, [{ quantity: "77" }]);
  assert.deepEqual((await fixture.database.query('SELECT "quantityKg"::text FROM "EnvWaste"')).rows, [{ quantityKg: "33" }]);
});

test("validação conserva precisão, data municipal e rejeita entradas/saídas incompletas", () => {
  assert.equal(recyclingToday(new Date("2026-11-02T01:00:00Z")), "2026-11-01");
  assert.equal(normalize(exit("VALID")).amount.toFixed(2), "15.27");
  for (const raw of [input("BAD", { quantity: "0" }), input("BAD", { quantity: "-1" }), input("BAD", { quantity: "1.0001" }), input("BAD", { quantity: "NaN" }), input("BAD", { quantity: "1e3" }), input("BAD", { quantity: "1.234,56" }), input("BAD", { occurredOn: "2026-02-30" }), input("BAD", { occurredOn: "2026-11-02" }), input("BAD", { origin: " " }), input("BAD", { amount: "1" }), exit("BAD", { destinationCode: "" }), exit("BAD", { amount: "-1" }), exit("BAD", { amount: "1.001" })]) assert.throws(() => normalize(raw));
});

test("perfil CF10 de consulta não movimenta e restrição individual prevalece sobre criação no perfil", () => {
  const user: PermissionUser = { id: "read", firebaseUid: "read", email: "read@example.test", name: "Consulta", role: "Consulta", profileCode: "READ", permissions: JSON.stringify({ modules: { MEIO_AMBIENTE: { blocked: false, create: false, update: false, delete: false, issueReports: false } } }), modulePermissions: [{ code: "MEIO_AMBIENTE", canView: true, canEdit: true }], allowedBudgetUnitIds: [], employeeId: null, departmentId: null, secretariatId: null };
  assert.equal(canViewModule(user, "MEIO_AMBIENTE"), true);
  assert.equal(canPerformModuleOperation(user, "MEIO_AMBIENTE", "create"), false);
  const operator = { ...user, permissions: JSON.stringify({ modules: { MEIO_AMBIENTE: { blocked: false, create: true, update: false, delete: false, issueReports: false } } }) };
  assert.equal(canPerformModuleOperation(operator, "MEIO_AMBIENTE", "create"), true);
  assert.equal(canPerformModuleOperation(operator, "MEIO_AMBIENTE", "update"), false);
  assert.equal(canPerformModuleOperation({ ...operator, modulePermissions: [{ code: "MEIO_AMBIENTE", canView: true, canEdit: false }] }, "MEIO_AMBIENTE", "create"), false);
});

test("coleta e saída conciliam saldo exato, destino, receita, sequência e auditoria sem afetar patrimônio", async () => {
  await seed("FLOW");
  const incoming = await save(input("FLOW"));
  const outgoing = await save(exit("FLOW"));
  assert.equal((await position("FLOW")).quantity.toFixed(3), "6.100");
  assert.equal(incoming.quantityBefore.toFixed(3), "0.000");
  assert.equal(outgoing.quantityBefore.toFixed(3), "10.125");
  assert.equal(outgoing.quantityAfter.toFixed(3), "6.100");
  assert.equal(outgoing.amount.toFixed(2), "15.27");
  assert.equal(outgoing.snapshot.destination?.address, "Endereço original");
  assert.equal(incoming.origin, "Coleta do bairro");
  assert.deepEqual((await history("FLOW")).map(row => row.sequence), [1, 2]);
  assert.equal(await eventCount("FLOW"), 2);
  assert.deepEqual((await fixture.database.query('SELECT quantity::text FROM "MaterialStock"')).rows, [{ quantity: "77" }]);
  assert.deepEqual((await fixture.database.query('SELECT "quantityKg"::text FROM "EnvWaste"')).rows, [{ quantityKg: "33" }]);
});

test("replay idêntico é idempotente e alteração de dados/autor na mesma chave é rejeitada", async () => {
  await seed("REPLAY");
  const entry = input("REPLAY");
  const [a, b] = await Promise.all([save(entry), save(entry)]);
  assert.equal(a.id, b.id);
  const dispatch = exit("REPLAY");
  const first = await save(dispatch);
  assert.equal((await save(dispatch)).id, first.id);
  await assert.rejects(save({ ...dispatch, quantity: "1" }), /Chave já utilizada/);
  await assert.rejects(save(dispatch, "one", "other"), /Chave já utilizada/);
  assert.equal((await position("REPLAY")).quantity.toFixed(3), "6.100");
  assert.equal(await eventCount("REPLAY"), 2);
});

test("saídas concorrentes não excedem saldo e mantêm a sequência do histórico", async () => {
  await seed("RACE");
  await save(input("RACE", { quantity: "10" }));
  const result = await Promise.allSettled([save(exit("RACE", { quantity: "7" })), save(exit("RACE", { quantity: "7" }))]);
  assert.equal(result.filter(row => row.status === "fulfilled").length, 1);
  const failure = result.find(row => row.status === "rejected");
  assert(failure?.status === "rejected");
  assert.match(String(failure.reason), /Saldo insuficiente/);
  assert.equal((await position("RACE")).quantity.toFixed(3), "3.000");
  assert.deepEqual((await history("RACE")).map(row => row.sequence), [1, 2]);
  assert.equal(await eventCount("RACE"), 2);
});

test("tipo e unidade permanecem consistentes entre depósitos mesmo na primeira entrada concorrente", async () => {
  await seed("UNIT");
  const first = input("UNIT", { quantity: "1" });
  const second = input("UNIT", { quantity: "1", depotCode: "UNIT-D2", unitCode: "UNIT-U2" });
  const result = await Promise.allSettled([save(first), save(second)]);
  assert.equal(result.filter(row => row.status === "fulfilled").length, 1);
  const winner = result[0].status === "fulfilled" ? first : second;
  const otherDepot = winner.depotCode === "UNIT-D" ? "UNIT-D2" : "UNIT-D";
  await save(input("UNIT", { quantity: "2", depotCode: otherDepot, unitCode: "", typeCode: "" }));
  const stocks = await fixture.connection.db.select().from(recyclingStocks).where(eq(recyclingStocks.materialKey, materialKey("UNIT")));
  assert.equal(stocks.length, 2);
  assert(stocks.every(stock => stock.unitKey === recyclingEntryKey({ kind: "units", code: winner.unitCode })));
  const page = await loadRecyclingStockPage(fixture.connection.db, "one");
  assert(page.stocks.filter(stock => stock.materialKey === materialKey("UNIT")).every(stock => String(stock.materialTotal) === "3.000"));
});

test("instâncias são isoladas e referência de outra instância não cria saldo ou associação", async () => {
  await seed("SCOPE", "one");
  await assert.rejects(save(input("SCOPE"), "two"), /não existe nesta instância/);
  assert.equal(await position("SCOPE", "two"), undefined);
  await seed("SCOPE", "two");
  await save(input("SCOPE", { quantity: "2" }), "one");
  await save(input("SCOPE", { quantity: "3" }), "two");
  assert.equal((await position("SCOPE", "one")).quantity.toFixed(3), "2.000");
  assert.equal((await position("SCOPE", "two")).quantity.toFixed(3), "3.000");
  const page = await loadRecyclingStockPage(fixture.connection.db, "two");
  assert.equal(page.stockTotal, 1);
  assert.equal(page.historyTotal, 1);
  assert(page.movements.every(row => row.instanceId === "two"));
});

test("saldo insuficiente, cadastro inativo, retroatividade e excesso não deixam gravações parciais", async () => {
  const entries = await seed("RULES");
  await save(input("RULES", { quantity: "5" }));
  await assert.rejects(save(exit("RULES", { quantity: "6" })), /Saldo insuficiente/);
  await assert.rejects(save(input("RULES", { quantity: "999999999999999.999" })), /excede o limite/);
  await assert.rejects(save(exit("RULES", { quantity: "1", occurredOn: "2026-10-30" })), /anterior à última/);
  const material = entries.find(row => row.kind === "materials")!;
  await withDatabaseTransaction(fixture.connection, tx => saveRecyclingCatalogEntry(tx, { instanceId: "one", actorUsuarioId: "operator", mode: "update", entry: { ...material, name: "Nome revisado", active: false } }));
  await assert.rejects(save(input("RULES", { quantity: "1" })), /cadastros ativos/);
  // Existing stock can still complete its lifecycle after catalog inactivation.
  await save(exit("RULES", { quantity: "1" }));
  assert.equal((await position("RULES")).quantity.toFixed(3), "4.000");
  assert.equal((await history("RULES"))[0].snapshot.material.name, material.name);
  const center = entries.find(row => row.kind === "centers")!;
  await withDatabaseTransaction(fixture.connection, tx => saveRecyclingCatalogEntry(tx, { instanceId: "one", actorUsuarioId: "operator", mode: "update", entry: { ...center, active: false } }));
  await assert.rejects(save(exit("RULES", { quantity: "1" })), /cadastros ativos/);
  assert.equal((await history("RULES")).length, 2);
});

test("falha na auditoria reverte associação inicial, saldo e movimento e também reverte saída", async () => {
  await seed("ROLLBACK");
  await assert.rejects(save(input("ROLLBACK"), "one", "fail-audit"), error => getPostgresError(error)?.code === "23514");
  assert.equal(await position("ROLLBACK"), undefined);
  assert.equal((await history("ROLLBACK")).length, 0);
  assert.equal((await fixture.connection.db.select().from(recyclingMaterialBindings).where(eq(recyclingMaterialBindings.materialKey, materialKey("ROLLBACK")))).length, 0);
  await save(input("ROLLBACK"));
  const before = await position("ROLLBACK");
  await assert.rejects(save(exit("ROLLBACK"), "one", "fail-audit"), error => getPostgresError(error)?.code === "23514");
  assert.deepEqual(await position("ROLLBACK"), before);
  assert.equal((await history("ROLLBACK")).length, 1);
});

test("constraints SQL bloqueiam saldo negativo e edição/exclusão do histórico", async () => {
  const [movement] = await history("FLOW");
  await assert.rejects(withDatabaseTransaction(fixture.connection, tx => tx.update(recyclingStocks).set({ quantity: normalize(input("X")).quantity.neg() }).where(eq(recyclingStocks.materialKey, materialKey("FLOW")))), error => getPostgresError(error)?.code === "23514");
  await assert.rejects(withDatabaseTransaction(fixture.connection, tx => tx.update(recyclingMovements).set({ notes: "alterar" }).where(eq(recyclingMovements.id, movement.id))), error => getPostgresError(error)?.code === "P0001");
  await assert.rejects(withDatabaseTransaction(fixture.connection, tx => tx.delete(recyclingMovements).where(eq(recyclingMovements.id, movement.id))), error => getPostgresError(error)?.code === "P0001");
  assert.equal((await history("FLOW")).length, 2);
});

test("FKs SQL impedem catálogo de outra instância e troca de unidade de material com saldo/histórico", async () => {
  await assert.rejects(withDatabaseTransaction(fixture.connection, tx => tx.insert(recyclingMaterialBindings).values({ instanceId: "two", materialKey: materialKey("FLOW"), typeKey: recyclingEntryKey({ kind: "types", code: "FLOW-T" }), unitKey: recyclingEntryKey({ kind: "units", code: "FLOW-U" }) })), error => getPostgresError(error)?.code === "23503");
  await assert.rejects(withDatabaseTransaction(fixture.connection, tx => tx.update(recyclingMaterialBindings).set({ unitKey: recyclingEntryKey({ kind: "units", code: "FLOW-U2" }) }).where(and(eq(recyclingMaterialBindings.instanceId, "one"), eq(recyclingMaterialBindings.materialKey, materialKey("FLOW"))))), error => getPostgresError(error)?.code === "23503");
  assert.equal((await position("FLOW")).unitKey, recyclingEntryKey({ kind: "units", code: "FLOW-U" }));
});

test("consulta pagina saldo e histórico no servidor sem perder registros nem revelar outra instância", async () => {
  for (let i = 0; i < 22; i++) { await seed(`PAGE${i}`, "paging"); await save(input(`PAGE${i}`), "paging"); }
  const first = await loadRecyclingStockPage(fixture.connection.db, "paging");
  const second = await loadRecyclingStockPage(fixture.connection.db, "paging", { stock: "2", history: "2" });
  assert.equal(first.stockTotal, 22); assert.equal(first.historyTotal, 22);
  assert.equal(first.stocks.length, 20); assert.equal(first.movements.length, 20);
  assert.equal(second.stocks.length, 2); assert.equal(second.movements.length, 2);
  assert.equal(new Set([...first.movements, ...second.movements].map(row => row.id)).size, 22);
  assert(first.movements.every(row => row.instanceId === "paging"));
  const clamped = await loadRecyclingStockPage(fixture.connection.db, "paging", { stock: "9999", history: "invalid" });
  assert.equal(clamped.stockPage, 2); assert.equal(clamped.historyPage, 1);
  const [auditCount] = await fixture.connection.db.select({ total: count() }).from(auditEvents).where(eq(auditEvents.targetType, "RecyclingMovement"));
  assert(auditCount.total >= 22);
});
