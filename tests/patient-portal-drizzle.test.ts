import assert from "node:assert/strict";
import test from "node:test";
import { sql } from "drizzle-orm";
import { createLocalDrizzleDatabase } from "./helpers/local-drizzle-database";
import { withDatabaseTransaction } from "../src/db/transaction";
import { createPortalManifestation, findPortalPatient, readPortalAppointments, readPortalLabReports, readPortalManifestations, readPortalOpenSchedules } from "../src/db/repositories/health/patient-portal";

test("portal Drizzle preserva titularidade, publicação, datas e atomicidade da ouvidoria", async t => {
  const fixture = await createLocalDrizzleDatabase();
  const database = fixture.connection.db;
  try {
    await fixture.database.exec(`
      CREATE TABLE "Person" (id text PRIMARY KEY, "fullName" text NOT NULL);
      CREATE TABLE "Employee" (id text PRIMARY KEY, "personId" text, name text);
      CREATE TABLE "Patient" (id text PRIMARY KEY, "personId" text NOT NULL, "usuarioId" text UNIQUE, status text NOT NULL);
      CREATE TABLE "HealthUnit" (id text PRIMARY KEY, name text NOT NULL);
      CREATE TABLE "HealthProfessional" (id text PRIMARY KEY, "employeeId" text, specialty text);
      CREATE TABLE "HealthSpecialty" (id text PRIMARY KEY, name text);
      CREATE TABLE "HealthCareSchedule" (id text PRIMARY KEY, "unitId" text, "specialtyId" text, "professionalId" text, date date, weekday integer, "totalSlots" integer, status text);
      CREATE TABLE "HealthAppointment" (id text PRIMARY KEY, "patientId" text NOT NULL, "unitId" text NOT NULL, "professionalId" text, "scheduleId" text, date timestamp(3) NOT NULL, status text, specialty text, priority text);
      CREATE TABLE "Document" (id text PRIMARY KEY, title text NOT NULL, "fileUrl" text NOT NULL);
      CREATE TABLE "HealthLabOrder" (id text PRIMARY KEY, "patientId" text NOT NULL);
      CREATE TABLE "HealthLabReport" (id text PRIMARY KEY, "orderId" text NOT NULL, "documentId" text NOT NULL, status text, "createdAt" timestamp(3), "releasedAt" timestamp(3), "publishedAt" timestamp(3));
      CREATE TABLE "SupportChannel" (id text PRIMARY KEY, name text NOT NULL, "isActive" boolean NOT NULL);
      CREATE TABLE "SequenceCounter" (id text PRIMARY KEY, key text NOT NULL UNIQUE, value integer NOT NULL, "createdAt" timestamp(3) DEFAULT now(), "updatedAt" timestamp(3) NOT NULL);
      CREATE TABLE "Ombudsman" (id text PRIMARY KEY, "protocolNumber" text NOT NULL UNIQUE, type text, subject text, description text, "channelId" text REFERENCES "SupportChannel"(id), "personId" text, "isAnonymous" boolean, "isConfidential" boolean, status text DEFAULT 'Recebida', response text, "respondedAt" timestamp(3), "createdAt" timestamp(3) DEFAULT now(), "updatedAt" timestamp(3) NOT NULL);
      CREATE TABLE "OmbudsmanIdentity" (id text PRIMARY KEY, "ombudsmanId" text NOT NULL UNIQUE REFERENCES "Ombudsman"(id), "personId" text NOT NULL REFERENCES "Person"(id), "createdAt" timestamp(3) DEFAULT now());
      CREATE TABLE "OmbudsmanAuditLog" (id text PRIMARY KEY, "ombudsmanId" text REFERENCES "Ombudsman"(id), "userId" text NOT NULL CHECK ("userId" <> 'reject-audit'), action text, details jsonb);
      CREATE TABLE "OmbudsmanMovement" (id text PRIMARY KEY, "ombudsmanId" text REFERENCES "Ombudsman"(id), "toDepartmentId" text, reason text, "createdAt" timestamp(3));
      CREATE TABLE "OmbudsmanInteraction" (id text PRIMARY KEY, "ombudsmanId" text REFERENCES "Ombudsman"(id), type text, message text, "isInternal" boolean, "createdAt" timestamp(3));
      INSERT INTO "Person" VALUES ('person-a','Titular A'),('person-b','Titular B');
      INSERT INTO "Patient" VALUES ('patient-a','person-a','user-a','Ativo'),('patient-b','person-b','user-b','Inativo');
      INSERT INTO "Employee" VALUES ('employee-a','person-a','Servidor A');
      INSERT INTO "HealthUnit" VALUES ('unit','UBS');
      INSERT INTO "HealthCareSchedule" VALUES ('schedule','unit',NULL,NULL,'2026-10-28',NULL,3,'Ativo');
      INSERT INTO "HealthAppointment" VALUES ('appointment-a','patient-a','unit',NULL,'schedule','2026-10-28 14:30:00.123','Confirmado',NULL,'Normal'),('appointment-b','patient-b','unit',NULL,'schedule','2026-10-28 15:00:00','Cancelado',NULL,'Normal');
      INSERT INTO "Document" VALUES ('doc','Laudo','/documento');
      INSERT INTO "HealthLabOrder" VALUES ('order-a','patient-a'),('order-b','patient-b');
      INSERT INTO "HealthLabReport" VALUES
        ('visible','order-a','doc','RELEASED','2026-10-28 14:30:00.123','2026-10-28 14:30:00.123','2026-10-28 14:30:00.123'),
        ('draft','order-a','doc','DRAFT','2026-10-28',NULL,NULL),
        ('unpublished','order-a','doc','RELEASED','2026-10-28','2026-10-28',NULL),
        ('other-owner','order-b','doc','RELEASED','2026-10-28','2026-10-28','2026-10-28');
      INSERT INTO "SupportChannel" VALUES ('channel','Portal',true);
    `);
    await t.test("identidade vem do usuário ou da cadeia do servidor ativo", async () => {
      assert.equal((await findPortalPatient(database, "user-a", null))?.id, "patient-a");
      assert.equal(await findPortalPatient(database, "user-b", null), null);
      assert.equal((await findPortalPatient(database, "unlinked-user", "employee-a"))?.id, "patient-a");
      assert.equal(await findPortalPatient(database, "unlinked-user", "other-employee"), null);
    });
    await t.test("agendamentos e laudos preservam Date UTC e filtros de publicação/titular", async () => {
      const appointments = await readPortalAppointments(database, "patient-a");
      assert.deepEqual(appointments.map(row => row.id), ["appointment-a"]);
      assert.equal(appointments[0].date.toISOString(), "2026-10-28T14:30:00.123Z");
      assert.equal(appointments[0].professional, null);
      const reports = await readPortalLabReports(database, "patient-a");
      assert.deepEqual(reports.map(row => row.id), ["visible"]);
      assert.equal(reports[0].releasedAt?.toISOString(), "2026-10-28T14:30:00.123Z");
      const schedules = await readPortalOpenSchedules(database);
      assert.equal(schedules[0].free, 2);
      assert.equal(schedules[0].when, new Date("2026-10-28T00:00:00Z").toLocaleDateString("pt-BR"));
    });
    const year = new Date().getFullYear();
    await fixture.database.exec(`INSERT INTO "Ombudsman" (id,"protocolNumber","updatedAt") VALUES ('legacy','OUV-${year}-000019',now());`);
    const input = { type: "Sugestão", subject: "Atendimento", description: "Descrição da manifestação", isAnonymous: false };
    const create = (actor: string, isAnonymous = false) => withDatabaseTransaction(fixture.connection, tx => createPortalManifestation(tx, actor, "person-a", { ...input, isAnonymous }));
    await t.test("falha de auditoria reverte manifestação, identidade e incremento da sequência", async () => {
      await assert.rejects(create("reject-audit"));
      assert.equal((await database.execute<{ total: number }>(sql`SELECT count(*)::int AS total FROM "Ombudsman"`)).rows[0].total, 1);
      assert.equal((await database.execute<{ total: number }>(sql`SELECT count(*)::int AS total FROM "OmbudsmanIdentity"`)).rows[0].total, 0);
      assert.equal((await database.execute<{ total: number }>(sql`SELECT count(*)::int AS total FROM "SequenceCounter"`)).rows[0].total, 0);
    });
    await t.test("anonimato não grava identidade e não aparece na consulta por pessoa", async () => {
      const identified = await create("actor");
      const anonymous = await create("actor", true);
      assert.equal(identified.protocolNumber, `OUV-${year}-000020`);
      assert.equal(anonymous.protocolNumber, `OUV-${year}-000021`);
      await database.execute(sql`INSERT INTO "OmbudsmanInteraction" VALUES ('internal',${identified.id},'NOTE','sigiloso',true,'2026-10-28'),('public',${identified.id},'RESPONSE','público',false,'2026-10-28')`);
      await database.execute(sql`INSERT INTO "OmbudsmanMovement" SELECT n::text,${identified.id},'department',n::text,'2026-10-01'::timestamp + n * interval '1 day' FROM generate_series(1,21) n`);
      const rows = await readPortalManifestations(database, "person-a");
      assert.deepEqual(rows.map(row => row.id), [identified.id]);
      assert.deepEqual(rows[0].interactions.map(row => row.message), ["público"]);
      assert.equal(rows[0].movements.length, 20);
      assert.equal(rows[0].movements[0].reason, "21");
      assert.equal(rows[0].movements[0].createdAt.toISOString(), "2026-10-22T00:00:00.000Z");
      assert.ok(rows[0].createdAt instanceof Date);
      assert.deepEqual(await readPortalManifestations(database, "person-b"), []);
      const audit = (await database.execute<{ details: { isAnonymous: boolean } }>(sql`SELECT details FROM "OmbudsmanAuditLog" WHERE "ombudsmanId"=${anonymous.id}`)).rows[0];
      assert.equal(audit.details.isAnonymous, true);
    });
  } finally {
    await fixture.close();
  }
});
