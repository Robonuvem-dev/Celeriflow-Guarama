import assert from "node:assert/strict";
import test from "node:test";
import { and, asc, count, eq } from "drizzle-orm";
import { cemeteryChangeHistory, cemeteryGraves } from "../src/db/schema/cemeteries";
import { createCemeteryDatabase } from "./helpers/cemetery-database";
import { getStructure, listStructure, saveStructure } from "../src/lib/cemeteries/structure-service";

test("PostgreSQL: 501+ pagination, immutable field history, lot capacity concurrency and lóculo owner", { timeout: 180000 }, async () => {
  const fixture = await createCemeteryDatabase();
  const db = fixture.connection;
  const memory = fixture.database;
  try {
    await memory.exec(`
      INSERT INTO "Taxpayer" (id,status,"taxpayerType","updatedAt") VALUES ('owner','Ativo','PF',CURRENT_TIMESTAMP);
      INSERT INTO "TaxDeathCause" SELECT 'cause-' || i, 'C-' || i, 'Causa ' || i, now() FROM generate_series(1,521) i;
    `);
    const actor = { usuarioId: "operator" };
    const cemeteryInput = { code: "C", name: "Cemitério", address: "Rua A", phone: "", wakePlace: "", observations: "", active: true };
    const cemetery = await saveStructure(db, actor, "CEMITERIO", undefined, cemeteryInput);
    assert.ok(cemetery.createdAt instanceof Date); assert.ok(cemetery.updatedAt instanceof Date);
    const readBack = await getStructure(db.db, "CEMITERIO", cemetery.id);
    assert.ok(readBack?.createdAt instanceof Date);
    assert.equal(readBack.createdAt.toISOString(), cemetery.createdAt.toISOString(), "SQL bruto mantém o timestamp UTC do DTO");
    await saveStructure(db, actor, "CEMITERIO", cemetery.id, { ...cemeteryInput, name: "Nome corrigido", address: "Rua B" });
    const history = await db.db.select().from(cemeteryChangeHistory).where(and(eq(cemeteryChangeHistory.targetId, cemetery.id), eq(cemeteryChangeHistory.fieldName, "name"))).orderBy(asc(cemeteryChangeHistory.createdAt));
    assert.equal(history.length, 2);
    assert.equal(history[1].previousValue, "Cemitério");
    assert.equal(history[1].newValue, "Nome corrigido");
    assert.equal(history[1].actorUsuarioId, "operator");
    const nullHistory = await memory.query<{ sql_null: boolean; json_null: boolean }>('SELECT "previousValue" IS NULL AS sql_null, "previousValue" = \'null\'::jsonb AS json_null FROM "CemeteryChangeHistory" WHERE "id"=$1', [history[0].id]);
    assert.equal(nullHistory.rows[0].sql_null, false); assert.equal(nullHistory.rows[0].json_null, true, "histórico inicial conserva JSON null explícito");
    const lastPage = await listStructure(db, { tipo: "CAUSA", page: 27 });
    assert.equal(lastPage.total, 521); assert.equal(lastPage.rows.length, 1);
    const filtered = await listStructure(db, { tipo: "CAUSA", q: "Causa 521" });
    assert.equal(filtered.total, 1);
    const fieldInput = { cemeteryId: cemetery.id, targetType: "LOTE", fieldKey: "area", label: "Área", valueType: "NUMERICO", required: true, active: true };
    const field = await saveStructure(db, actor, "CAMPO", undefined, fieldInput);
    const sector = await saveStructure(db, actor, "QUADRA", undefined, { cemeteryId: cemetery.id, code: "Q1", name: "Quadra", sortOrder: 0 });
    assert.equal(sector.createdAt, undefined, "quadras não ganham coluna temporal inexistente");
    assert.equal((await listStructure(db, { tipo: "QUADRA" })).rows[0].id, sector.id);
    const lotInput = { cemeteryId: cemetery.id, identifier: "L1", ownerTaxpayerId: "owner", graveLimit: 1, active: true, additionalData: { area: "10.5" } };
    const lot = await saveStructure(db, actor, "LOTE", undefined, lotInput);
    assert.equal((lot.additionalData as { area: number }).area, 10.5);
    await assert.rejects(saveStructure(db, actor, "CAMPO", field.id, { ...fieldInput, valueType: "DESCRITIVO" }), /permanentes/);
    await saveStructure(db, actor, "CAMPO", field.id, { ...fieldInput, active: false });
    const edited = await saveStructure(db, actor, "LOTE", lot.id, { ...lotInput, additionalData: {} });
    assert.equal((edited.additionalData as { area: number }).area, 10.5);
    const grave = { cemeteryId: cemetery.id, lotId: lot.id, sectorId: "", code: "G1", graveType: "GAVETA", ownerTaxpayerId: "", capacity: 1, notes: "", active: true };
    await assert.rejects(saveStructure(db, actor, "SEPULTURA", undefined, grave), /Lóculo exige/);
    const outcomes = await Promise.allSettled([saveStructure(db, actor, "SEPULTURA", undefined, { ...grave, ownerTaxpayerId: "owner" }), saveStructure(db, actor, "SEPULTURA", undefined, { ...grave, code: "G2", ownerTaxpayerId: "owner" })]);
    assert.equal(outcomes.filter(r => r.status === "fulfilled").length, 1);
    assert.equal((await db.db.select({ total: count() }).from(cemeteryGraves).where(eq(cemeteryGraves.lotId, lot.id)))[0].total, 1);
    const rejection = outcomes.find(r => r.status === "rejected");
    assert.match(String(rejection?.status === "rejected" && rejection.reason), /Limite de sepulturas/);
  } finally { await fixture.close(); }
});
