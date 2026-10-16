import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { listStructure, saveStructure } from "../src/lib/cemeteries/structure-service";
import { readFileSync, readdirSync } from "node:fs";

test("PostgreSQL: 501+ pagination, immutable field history, lot capacity concurrency and lóculo owner", async () => {
  const memory = new PGlite();
  const server = new PGLiteSocketServer({ db: memory, port: 0, host: "127.0.0.1" });
  let db: PrismaClient | undefined;
  try {
    for (const dir of readdirSync("prisma/migrations-ibema", { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name).sort()) await memory.exec(readFileSync(`prisma/migrations-ibema/${dir}/migration.sql`, "utf8"));
    await memory.exec(`
      INSERT INTO "Taxpayer" (id,status,"taxpayerType","updatedAt") VALUES ('owner','Ativo','PF',CURRENT_TIMESTAMP);
      INSERT INTO "TaxDeathCause" SELECT 'cause-' || i, 'C-' || i, 'Causa ' || i, now() FROM generate_series(1,521) i;
    `);
    await server.start();
    // PGlite has one backend; concurrent requests queue on one real PostgreSQL connection.
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://postgres:postgres@${server.getServerConn()}/postgres`, max: 1 }) });
    const actor = { usuarioId: "operator" };
    const cemeteryInput = { code: "C", name: "Cemitério", address: "Rua A", phone: "", wakePlace: "", observations: "", active: true };
    const cemetery = await saveStructure(db, actor, "CEMITERIO", undefined, cemeteryInput);
    await saveStructure(db, actor, "CEMITERIO", cemetery.id, { ...cemeteryInput, name: "Nome corrigido", address: "Rua B" });
    const history = await db.cemeteryChangeHistory.findMany({ where: { targetId: cemetery.id, fieldName: "name" }, orderBy: { createdAt: "asc" } });
    assert.equal(history.length, 2);
    assert.equal(history[1].previousValue, "Cemitério");
    assert.equal(history[1].newValue, "Nome corrigido");
    assert.equal(history[1].actorUsuarioId, "operator");
    const lastPage = await listStructure(db, { tipo: "CAUSA", page: 27 });
    assert.equal(lastPage.total, 521); assert.equal(lastPage.rows.length, 1);
    const filtered = await listStructure(db, { tipo: "CAUSA", q: "Causa 521" });
    assert.equal(filtered.total, 1);
    const fieldInput = { cemeteryId: cemetery.id, targetType: "LOTE", fieldKey: "area", label: "Área", valueType: "NUMERICO", required: true, active: true };
    const field = await saveStructure(db, actor, "CAMPO", undefined, fieldInput);
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
    assert.equal(await db.taxGrave.count({ where: { lotId: lot.id } }), 1);
    const rejection = outcomes.find(r => r.status === "rejected");
    assert.match(String(rejection?.status === "rejected" && rejection.reason), /Limite de sepulturas/);
  } finally { await db?.$disconnect(); await server.stop(); await memory.close(); }
});
