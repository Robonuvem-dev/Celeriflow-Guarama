import assert from "node:assert/strict";
import test from "node:test";
import { config } from "dotenv";
import { eq, inArray } from "drizzle-orm";
import { createDatabaseConnection } from "../src/db/connection";
import { createId } from "../src/db/ids";
import { getPostgresError } from "../src/db/errors";
import { withDatabaseTransaction } from "../src/db/transaction";
import { consumerUnits, sanitationServiceOrders } from "../src/db/schema/sanitation";
import { findConsumerUnitStatus, findMeterReading, findServiceOrder, insertConsumerUnit, insertMeterReading, insertServiceOrder, reserveConsumerUnitIdentifiers, searchConsumerUnitOptions, updateServiceOrder } from "../src/db/repositories/sanitation/operations";
import { listMeterReadings, listServiceOrders } from "../src/db/repositories/sanitation/queries";
import { parseSanitationQuery } from "../src/lib/saneamento/list-query";
import { processWaterReadingAndBill } from "../src/lib/saneamento/saneamento-engine";
import { formatConsumerUnitIdentifier } from "../src/lib/saneamento/unit-code";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

test("Saneamento no Neon: sequência mensal, leitura única, corte/religação e rollback", {
  skip: process.env.DRIZZLE_VERIFY_DATABASE !== "1", timeout: 180_000,
}, async t => {
  const url = process.env.DATABASE_URL;
  assert.ok(url);
  const connection = createDatabaseConnection(url);
  const fixture = createId();
  const orderId = createId();
  const rollback = new Error("expected sanitation rollback");
  try {
    await assert.rejects(withDatabaseTransaction(connection, async tx => {
      await insertConsumerUnit(tx, { address: `Rua verificação ${fixture}, 1`, streetAddress: "Rua verificação, 1", neighborhood: "Centro", postalCode: "30000000", category: "Residencial", ownerName: "Fixture", ownerDocument: fixture }, new Date("2099-11-01T12:00:00Z"));
      const [unit] = await searchConsumerUnitOptions(tx, fixture, true);
      assert.ok(unit);
      assert.match(unit.code, /^209911\d{5}$/);
      await t.test("leitura preserva consumo, projeção, datas e unicidade por competência", async () => {
        await insertMeterReading(tx, { unitId: unit.id, competence: "11/2099", previousValue: 100, currentValue: 125, readerName: fixture });
        const listed = await listMeterReadings(tx, parseSanitationQuery({ year: "2099", month: "11", q: fixture }));
        assert.equal(listed.total, 1);
        assert.equal(listed.records[0].consumption, 25);
        assert.equal(listed.records[0].unit.code, unit.code);
        assert.equal((await findMeterReading(tx, listed.records[0].id))?.readingDate instanceof Date, true);
        await assert.rejects(tx.transaction(nested => insertMeterReading(nested, { unitId: unit.id, competence: "11/2099", previousValue: 125, currentValue: 130, readerName: fixture })), error => getPostgresError(error)?.code === "23505");
      });
      await t.test("corte e religação atualizam a unidade na mesma transação", async () => {
        await insertServiceOrder(tx, { orderNumber: orderId, orderType: "Corte", description: fixture, priority: "Normal", unitId: unit.id, technician: fixture, status: "Em Andamento" });
        const listed = await listServiceOrders(tx, parseSanitationQuery({ q: orderId }));
        assert.equal(listed.total, 1);
        assert.equal(listed.records[0].unit?.code, unit.code);
        const id = listed.records[0].id;
        await updateServiceOrder(tx, id, { orderType: "Corte", description: fixture, priority: "Normal", status: "Concluída", technician: fixture }, unit.id);
        assert.deepEqual(await findConsumerUnitStatus(tx, unit.id), { status: "Cortada" });
        await updateServiceOrder(tx, id, { orderType: "Religação", description: fixture, priority: "Normal", status: "Concluída", technician: fixture }, unit.id);
        assert.deepEqual(await findConsumerUnitStatus(tx, unit.id), { status: "Ativa" });
        await assert.rejects(tx.transaction(nested => updateServiceOrder(nested, id, { orderType: "Corte", description: "Must roll back", priority: "Normal", status: "Concluída", technician: fixture }, "missing-fixture-unit")), /Registro não encontrado/);
        assert.equal((await findServiceOrder(tx, id))?.orderType, "Religação");
        assert.equal((await findServiceOrder(tx, id))?.description, fixture);
      });
      await t.test("caminho legado de faturamento mantém decimal e cálculo progressivo", async () => {
        const result = await processWaterReadingAndBill(tx, { codigoMatricula: fixture, nomeConsumidor: "Fixture", endereco: "Rua de verificação", numeroHidrometro: fixture, leituraAnterior: 100, leituraAtual: 115, tipoTarifa: "RESIDENCIAL" });
        assert.equal(result.billing.consumoM3, 15);
        assert.equal(result.record.valorFatura.toFixed(2), result.billing.valorTotalFatura.toFixed(2));
        assert.equal(result.record.statusFatura, "EMITIDA");
        assert.equal(result.record.createdAt instanceof Date, true);
      });
      throw rollback;
    }, { timeoutMs: 120_000 }), error => error === rollback);
    assert.deepEqual(await searchConsumerUnitOptions(connection.db, fixture, false), []);
    assert.deepEqual(await connection.db.select({ id: sanitationServiceOrders.id }).from(sanitationServiceOrders).where(eq(sanitationServiceOrders.orderNumber, orderId)), []);
    assert.deepEqual(await connection.db.select({ id: consumerUnits.id }).from(consumerUnits).where(eq(consumerUnits.ownerDocument, fixture)), []);
  } finally { await connection.pool.end(); }
});

test("reserva mensal serializa duas conexões concorrentes e gera números consecutivos", {
  skip: process.env.DRIZZLE_VERIFY_DATABASE !== "1", timeout: 60_000,
}, async () => {
  const url = process.env.DATABASE_URL;
  assert.ok(url);
  const connection = createDatabaseConnection(url);
  const ids = [createId(), createId()];
  const registeredAt = new Date("2099-12-15T12:00:00Z");
  let firstHasLock!: () => void;
  const locked = new Promise<void>(resolve => { firstHasLock = resolve; });
  let secondHasConnection!: () => void;
  const competing = new Promise<void>(resolve => { secondHasConnection = resolve; });
  try {
    const first = withDatabaseTransaction(connection, async tx => {
      const reservation = await reserveConsumerUnitIdentifiers(tx, registeredAt);
      firstHasLock();
      await competing;
      const code = formatConsumerUnitIdentifier(reservation.period, reservation.start);
      await tx.insert(consumerUnits).values({ id: ids[0], code, address: "Fixture concorrência", ownerDocument: ids[0], status: "Inativa" });
      return code;
    }).finally(() => firstHasLock());
    // Start the competing registration only after the first connection owns the
    // monthly advisory lock; each transaction commits its own isolated fixture.
    const second = (async () => {
      await locked;
      return withDatabaseTransaction(connection, async tx => {
        secondHasConnection();
        const reservation = await reserveConsumerUnitIdentifiers(tx, registeredAt);
        const code = formatConsumerUnitIdentifier(reservation.period, reservation.start);
        await tx.insert(consumerUnits).values({ id: ids[1], code, address: "Fixture concorrência", ownerDocument: ids[1], status: "Inativa" });
        return code;
      });
    })().finally(() => secondHasConnection());
    const results = await Promise.allSettled([first, second]);
    for (const result of results) if (result.status === "rejected") throw result.reason;
    const codes = results.map(result => { assert.equal(result.status, "fulfilled"); return result.value; });
    assert.match(codes[0], /^209912\d{5}$/);
    assert.equal(Number(codes[1].slice(6)), Number(codes[0].slice(6)) + 1);
  } finally {
    // Delete only the two IDs owned by this test, including partial-success cases.
    await connection.db.delete(consumerUnits).where(inArray(consumerUnits.id, ids));
    assert.deepEqual(await connection.db.select({ id: consumerUnits.id }).from(consumerUnits).where(inArray(consumerUnits.id, ids)), []);
    await connection.pool.end();
  }
});
