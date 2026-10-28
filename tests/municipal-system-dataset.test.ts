import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq, like, sql } from "drizzle-orm";
import type { DatabaseTransaction } from "../src/db/transaction";
import { people } from "../src/db/schema/people";
import { institutions } from "../src/db/schema/administration";
import { users } from "../src/db/schema/identity";
import { consumerUnits } from "../src/db/schema/sanitation";
import { financialAuditLogs } from "../src/db/schema/finance-identity";
import { getPostgresError } from "../src/db/errors";
import { seedFoundation, seedAdministration, seedCitizenServices, seedEducationHealthSocial, seedEnvironmentSanitation, seedCultureWorksSecurity, seedLegislative, seedPlanningProcurement, seedStockSstHealth, seedPortal, seedCommunityOperations, key } from "../scripts/municipal-system-dataset";

test("carga municipal preserva cadastros, integra pessoas e repete sem duplicação", { timeout: 300_000 }, async () => {
  const memory = new PGlite();
  try {
    for (const directory of readdirSync("prisma/migrations-ibema", { withFileTypes: true }).filter(item => item.isDirectory()).map(item => item.name).sort()) await memory.exec(readFileSync(`prisma/migrations-ibema/${directory}/migration.sql`, "utf8"));
    const db = drizzle(memory);
    const [profile] = (await memory.query<{ id: string }>('SELECT id FROM "ConfiguracaoPerfil" LIMIT 1')).rows;
    const [actor] = await db.insert(users).values({ nome: "Marina Azevedo", email: "marina@auroradasveredas.example", perfilId: profile.id }).returning();
    const [existing] = await db.insert(people).values({ fullName: "Cadastro preservado", cpf: "52998224725" }).returning();
    const [institution] = await db.insert(institutions).values({ name: "Prefeitura cadastrada pelo responsável", city: "Aurora das Veredas", state: "MG" }).returning();
    const operations = [seedFoundation, seedAdministration, seedCitizenServices, seedEducationHealthSocial, seedEnvironmentSanitation, seedCultureWorksSecurity, seedLegislative, seedPlanningProcurement, seedStockSstHealth, seedPortal, seedCommunityOperations];
    const count = async (table: string) => Number((await memory.query<{ count: number }>(`SELECT count(*)::int AS count FROM "${table}"`)).rows[0].count);
    const firstCounts: Record<string, number> = {};
    for (const operation of operations) Object.assign(firstCounts, await db.transaction(tx => operation({ tx: tx as unknown as DatabaseTransaction, actorId: actor.id })));
    assert.equal(firstCounts.Person, 60); assert.equal(firstCounts.SanConsumerUnit, 18500); assert.equal(firstCounts.SanMeterReading, 55500); assert.equal(firstCounts.SanInvoice, 55500);
    assert.equal(await count("Person"), 61); assert.equal(await count("Company"), 20);
    const names = await db.select({ fullName: people.fullName }).from(people).where(like(people.id, "aurora-system-v1:person:%"));
    assert.equal(new Set(names.map(row => row.fullName)).size, 60, "Nomes completos não repetem a cada 36 registros");
    assert.deepEqual((await db.select().from(people).where(eq(people.id, existing.id)))[0], existing);
    assert.equal(await count("Institution"), 1);
    assert.deepEqual((await db.select().from(institutions).where(eq(institutions.id, institution.id)))[0], institution);
    const [student] = (await memory.query<{ personId: string; studentName: string; guardianPersonId: string; guardianName: string; schoolId: string; classSchoolId: string }>(`SELECT s."personId",p."fullName" AS "studentName",g."personId" AS "guardianPersonId",gp."fullName" AS "guardianName",e."schoolId",c."schoolId" AS "classSchoolId"
      FROM "Student" s JOIN "Person" p ON p.id=s."personId" JOIN "EducationalGuardian" g ON g."studentId"=s.id JOIN "Person" gp ON gp.id=g."personId" JOIN "Enrollment" e ON e."studentId"=s.id JOIN "SchoolClass" c ON c.id=e."classId" WHERE s.id=$1`, [key("student")])).rows;
    assert.equal(student.personId, key("person", 40)); assert.equal(student.guardianPersonId, key("person"));
    assert.equal(student.studentName.split(" ").slice(1).join(" "), student.guardianName.split(" ").slice(1).join(" "));
    assert.equal(student.schoolId, student.classSchoolId);
    const [patient] = (await memory.query<{ personId: string }>('SELECT "personId" FROM "Patient" WHERE id=$1', [key("patient")])).rows;
    assert.equal(patient.personId, student.guardianPersonId);
    const [meter] = (await memory.query<{ currentValue: number; previousValue: number; consumption: number; meterUnitId: string; unitId: string; code: string; postalCode: string }>(`SELECT r."currentValue",r."previousValue",r.consumption,m."unitId" AS "meterUnitId",r."unitId",u.code,u."postalCode" FROM "SanMeterReading" r JOIN "SanWaterMeter" m ON m.id=r."meterId" JOIN "SanConsumerUnit" u ON u.id=r."unitId" WHERE r.id=$1`, [key("water-reading")])).rows;
    assert.equal(meter.currentValue - meter.previousValue, meter.consumption); assert.equal(meter.meterUnitId, meter.unitId);
    for (const [table, expected] of Object.entries({ SanConsumerUnit: 18500, SanWaterMeter: 18500, SanMeterReading: 55500, SanInvoice: 55500, SanWaterQualityAnalysis: 720, SanPortalRequest: 900, SanSavedReport: 36 })) assert.equal(await count(table), expected, table);
    assert.match(meter.code, /^202601\d{5}$/); assert.ok(meter.postalCode);
    const [previousReading] = (await memory.query<{ currentValue: number }>('SELECT "currentValue" FROM "SanMeterReading" WHERE "unitId"=$1 AND competence=$2', [meter.unitId, "09/2026"])).rows;
    assert.equal(previousReading.currentValue, meter.previousValue, "Histórico mensal contínuo");
    const [councilor] = (await memory.query<{ nomeCompleto: string; fullName: string }>('SELECT v."nomeCompleto",p."fullName" FROM "CamVereador" v JOIN "Person" p ON p.id=v."personId" WHERE v.id=$1', [key("councilor")])).rows;
    assert.equal(councilor.nomeCompleto, councilor.fullName);
    const [schoolMenu] = (await memory.query<{ items: unknown }>('SELECT items FROM "EducationSchoolMenu" WHERE id=$1', [key("school-menu")])).rows;
    assert.deepEqual(schoolMenu.items, { meals: ["Arroz, feijão, frango e salada", "Macarrão com legumes e carne", "Fruta da estação e leite"] });
    const [exposure] = (await memory.query<{ departmentIds: string[] }>('SELECT "departmentIds" FROM "SstExposureGroup" WHERE id=$1', [key("exposure-group")])).rows;
    assert.deepEqual(exposure.departmentIds, [key("department", 0)]);
    // An operator's populated CEP is retained; only SQL NULL is backfilled.
    await db.update(consumerUnits).set({ postalCode: "operator-edit" }).where(eq(consumerUnits.id, key("water-unit", 0)));
    await db.update(consumerUnits).set({ postalCode: null }).where(eq(consumerUnits.id, key("water-unit", 1)));
    for (const operation of operations) {
      const repeated = await db.transaction(tx => operation({ tx: tx as unknown as DatabaseTransaction, actorId: actor.id }));
      assert.equal(Object.values(repeated).reduce((sum, value) => sum + value, 0), 0, operation.name);
    }
    assert.equal((await db.select().from(consumerUnits).where(eq(consumerUnits.id, key("water-unit", 0))))[0].postalCode, "operator-edit");
    assert.ok((await db.select().from(consumerUnits).where(eq(consumerUnits.id, key("water-unit", 1))))[0].postalCode);
    await assert.rejects(db.transaction(async tx => {
      await tx.execute(sql`INSERT INTO "CalendarEvent" (id,title,date,type,"updatedAt") VALUES ('rollback-probe','Registro temporário',CURRENT_TIMESTAMP,'Evento',CURRENT_TIMESTAMP)`);
      await tx.execute(sql`INSERT INTO "Patient" (id,"personId","updatedAt") VALUES ('rollback-patient','missing-person',CURRENT_TIMESTAMP)`);
    }), error => getPostgresError(error)?.code === "23503");
    assert.equal((await memory.query('SELECT id FROM "CalendarEvent" WHERE id=$1', ["rollback-probe"])).rows.length, 0);
    const failure = new Error("expected dataset audit rollback");
    await memory.exec(`DELETE FROM "PortalNews" WHERE id='${key("portal-news", 0)}'`);
    await assert.rejects(db.transaction(async transaction => {
      const tx = transaction as unknown as DatabaseTransaction;
      assert.equal((await seedPortal({ tx, actorId: actor.id })).PortalNews, 1);
      await tx.insert(financialAuditLogs).values({ action: "MUNICIPAL_DATASET_POPULATED", entityType: "DATASET", entityId: "rollback-dataset", authorUsuarioId: "missing-actor" });
      throw failure;
    }), error => getPostgresError(error)?.code === "23503");
    assert.equal((await memory.query('SELECT id FROM "PortalNews" WHERE id=$1', [key("portal-news", 0)])).rows.length, 0);
  } finally { await memory.close(); }
});
