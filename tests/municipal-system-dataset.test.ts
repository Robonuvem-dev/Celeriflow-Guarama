import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { seedFoundation, seedAdministration, seedCitizenServices, seedEducationHealthSocial, seedEnvironmentSanitation, seedCultureWorksSecurity, seedLegislative, seedPlanningProcurement, seedStockSstHealth, seedPortal, seedCommunityOperations, key } from "../scripts/municipal-system-dataset";

test("carga municipal preserva cadastros, integra pessoas e repete sem duplicação", { timeout: 300000 }, async () => {
  const memory = new PGlite(); const socket = new PGLiteSocketServer({ db: memory, host: "127.0.0.1", port: 0 });
  let db: PrismaClient | undefined;
  try {
    for (const directory of readdirSync("prisma/migrations-ibema", { withFileTypes: true }).filter(item => item.isDirectory()).map(item => item.name).sort()) await memory.exec(readFileSync(`prisma/migrations-ibema/${directory}/migration.sql`, "utf8"));
    await socket.start(); db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://postgres:postgres@${socket.getServerConn()}/postgres`, max: 1 }) });
    const profile = await db.configuracaoPerfil.findFirstOrThrow();
    const actor = await db.usuario.create({ data: { nome: "Marina Azevedo", email: "marina@auroradasveredas.example", perfilId: profile.id } });
    const existing = await db.person.create({ data: { fullName: "Cadastro preservado", cpf: "52998224725" } });
    const operations = [seedFoundation, seedAdministration, seedCitizenServices, seedEducationHealthSocial, seedEnvironmentSanitation, seedCultureWorksSecurity, seedLegislative, seedPlanningProcurement, seedStockSstHealth, seedPortal, seedCommunityOperations];
    for (const operation of operations) await db.$transaction(tx => operation({ tx, actorId: actor.id }), { timeout: 120000 });
    assert.equal(await db.person.count(), 61); assert.equal(await db.company.count(), 20);
    const names = await db.person.findMany({ where: { id: { startsWith: "aurora-system-v1:person:" } }, select: { fullName: true } });
    assert.equal(new Set(names.map(row => row.fullName)).size, 60, "Nomes completos não repetem a cada 36 registros");
    assert.deepEqual(await db.person.findUniqueOrThrow({ where: { id: existing.id } }), existing);
    const student = await db.student.findUniqueOrThrow({ where: { id: key("student") }, include: { person: true, guardians: { include: { person: true } }, enrollments: { include: { schoolClass: { include: { school: true } } } } } });
    assert.equal(student.person.id, key("person", 40)); assert.equal(student.guardians[0].person.id, key("person"));
    assert.equal(student.person.fullName.split(" ").slice(1).join(" "), student.guardians[0].person.fullName.split(" ").slice(1).join(" "));
    assert.equal(student.enrollments[0].schoolId, student.enrollments[0].schoolClass!.schoolId);
    const patient = await db.patient.findUniqueOrThrow({ where: { id: key("patient") }, include: { person: true } });
    assert.equal(patient.person.id, student.guardians[0].person.id);
    const meter = await db.sanMeterReading.findUniqueOrThrow({ where: { id: key("water-reading") }, include: { meter: true, unit: true } });
    assert.equal(meter.currentValue - meter.previousValue, meter.consumption); assert.equal(meter.meter!.unitId, meter.unitId);
    const councilor = await db.camVereador.findUniqueOrThrow({ where: { id: key("councilor") }, include: { person: true } });
    assert.equal(councilor.nomeCompleto, councilor.person!.fullName);
    for (const operation of operations) {
      const repeated: Record<string, number> = await db.$transaction(tx => operation({ tx, actorId: actor.id }), { timeout: 120000 });
      assert.equal(Object.values(repeated).reduce((sum, count) => sum + count, 0), 0);
    }
    await assert.rejects(db.$transaction(async tx => { await tx.calendarEvent.create({ data: { id: "rollback-probe", title: "Registro temporário", date: new Date(), type: "Evento" } }); await tx.patient.create({ data: { personId: "missing-person" } }); }), /Foreign key|foreign key/);
    assert.equal(await db.calendarEvent.count({ where: { id: "rollback-probe" } }), 0);
  } finally { await db?.$disconnect(); await socket.stop(); await memory.close(); }
});
