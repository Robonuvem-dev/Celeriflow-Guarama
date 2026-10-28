import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { databaseTimestamp } from "../src/db/temporal";
import { createSstDrizzleFixture } from "./helpers/sst-drizzle-fixture";
import { sstTestContext } from "./helpers/sst-drizzle-context";
import { sstDatabaseError } from "./helpers/sst-database-error";
import { getPostgresError } from "../src/db/errors";
import { assertDisciplineAccess, disciplineUnitWhere } from "../src/lib/sst/clinical-access";
import { clinicalRecordInput, vaccinationInput } from "../src/lib/sst/clinical-policy";
import { questionnaireQuestions } from "../src/lib/sst/questionnaire-policy";
import { registerClinicalRecord, registerOccupationalVaccination, registerProfessionalRole, registerDisciplineGrant, clinicalRecordDocument, listClinicalRecords, listOccupationalVaccinations } from "../src/lib/sst/clinical-service";
import { SstValidationError } from "../src/lib/sst/errors";

const key = "2d161f17-63ca-4d57-9c87-82c4f74e4d5a", otherKey = "4d161f17-63ca-4d57-9c87-82c4f74e4d5a";
const visit = { budgetUnitId: "ug", personId: "worker", professionalRoleId: "role", discipline: "MEDICINE", attendedAt: "2026-10-01T03:00:00Z", occupationalContext: "Exposição ocupacional", narrative: "Atendimento clínico", opinion: "Parecer profissional", submissionKey: key };
const shot = { budgetUnitId: "ug", personId: "worker", professionalRoleId: "role", vaccineId: "vaccine", administeredAt: "2026-10-01", doseNumber: 1, lotNumber: "LOT-1", source: "EXTERNAL_PROOF", occupationalContext: "Comprovante externo conferido", submissionKey: key };
const professional = { budgetUnitId: "ug", personId: "doctor", usuarioId: "actor", discipline: "MEDICINE", council: "CRM PR 123", startsAt: "2026-10-01", endsAt: "2026-10-01" };
async function fixture(options: { seedRole?: boolean; roleUser?: string; startsAt?: string; endsAt?: string } = {}) {
  const local = await createSstDrizzleFixture(["BudgetUnit", "Person", "Employee", "Usuario", "Medicine", "Vaccine", "Institution", "ReportTemplate", "AuditEvent"]), db = local.database;
  try {
    // The installed timestamp-without-time-zone defaults store UTC wall time.
    // Embedded PostgreSQL may initialize its session zone from the host.
    await db.exec("SET TIME ZONE 'UTC'");
    await db.exec(`CREATE TABLE "SstAso" (id TEXT PRIMARY KEY);
    CREATE TABLE "SstAccessGrant" ("usuarioId" TEXT,"budgetUnitId" TEXT,"isActive" BOOLEAN,"canReadClinical" BOOLEAN,"canAssess" BOOLEAN);
    CREATE TABLE "HrEmployeeFunctionalPeriod" (id TEXT,"employeeId" TEXT,"budgetUnitId" TEXT,"startsAt" TIMESTAMP,"endsAt" TIMESTAMP,voided BOOLEAN DEFAULT false,"supersedesId" TEXT);
    INSERT INTO "BudgetUnit" (id,code,name,"secretariatId","updatedAt") VALUES ('ug','UG','UG histórica','HISTORICAL_SECRETARIAT',now()),('other','OTHER','Outra','s',now());
    INSERT INTO "Person" (id,"fullName","updatedAt") VALUES ('worker','Servidor',now()),('doctor','Profissional',now()),('other-professional','Outro profissional',now());
    INSERT INTO "Employee" (id,name,"personId","secretariatId","updatedAt") VALUES ('employee','Servidor','worker','CURRENT_OTHER_SECRETARIAT',now());
    INSERT INTO "Usuario" (id,nome,email,"perfilId","updatedAt") VALUES ('actor','Registrador','actor@example.invalid','profile',now()),('other-user','Outro','other@example.invalid','profile',now());
    INSERT INTO "SstAccessGrant" VALUES ('actor','ug',true,true,true),('other-user','ug',true,true,true);
    INSERT INTO "HrEmployeeFunctionalPeriod" VALUES ('period','employee','ug','2025-01-01','2027-01-01',false,NULL);
    INSERT INTO "Vaccine" (id,name,"updatedAt") VALUES ('vaccine','Vacina canônica',now());
    INSERT INTO "Medicine" (id,name,"updatedAt") VALUES ('medicine','Nome canônico',now());
    INSERT INTO "Institution" (id,name,"legalName","updatedAt") VALUES ('institution','Instituição','Instituição canônica',now());
    INSERT INTO "ReportTemplate" (id,scope,fingerprint,header,footer,orientation,"updatedAt") VALUES ('template','GLOBAL','configured-template','Cabeçalho configurado','Rodapé configurado','PORTRAIT',now());`);
    for (const name of ["20261010210000_add_sst_questionnaires", "20261011010000_add_sst_clinical_services", "20261011120000_harden_sst_clinical_integrity"]) await db.exec(readFileSync(`prisma/migrations-ibema/${name}/migration.sql`, "utf8"));
    await db.exec(`INSERT INTO "SstDisciplineGrant" (id,"budgetUnitId","usuarioId",discipline,"canRead","canWrite") SELECT u||'-'||d,'ug',u,d,true,true FROM unnest(ARRAY['actor','other-user']) u CROSS JOIN unnest(ARRAY['MEDICINE','NURSING','PSYCHOLOGY','SOCIAL_WORK']) d`);
    const medicalQuestions = questionnaireQuestions.parse([{ key: "symptom", label: "Sintoma", section: "Geral", kind: "TEXT", required: true, choices: [] }]);
    const psychologyQuestions = questionnaireQuestions.parse([{ key: "history", label: "Histórico psicológico", section: "Anamnese", kind: "TEXT", required: true, choices: [] }]);
    await db.query(`INSERT INTO "SstQuestionnaireVersion" (id,"budgetUnitId",code,title,version,questions,"submissionKey","requestHash","createdById",discipline)
      VALUES ('q','ug','MED','Anamnese',1,$1::jsonb,'q','h','actor','MEDICINE'),
        ('foreign-q','other','MED','Outra',1,$1::jsonb,'foreign','h','actor','MEDICINE'),
        ('psy-q','ug','PSY','Psicologia',1,$2::jsonb,'psy','h','actor','PSYCHOLOGY')`, [JSON.stringify(medicalQuestions), JSON.stringify(psychologyQuestions)]);
    if (options.seedRole !== false) await db.query(`INSERT INTO "SstProfessionalRole" (id,"budgetUnitId","personId","usuarioId",discipline,council,"startsAt","endsAt","createdById") VALUES ('role','ug','doctor',$1,'MEDICINE','CRM PR 123',$2,$3,'actor')`, [options.roleUser ?? "actor", options.startsAt ?? "2026-10-01", options.endsAt ?? "2026-10-01"]);
    const context = sstTestContext(local.connection.db, { id: "actor", name: "Registrador", profileCode: "SST_OPERATOR", permissions: JSON.stringify({ modules: { SST: { blocked: false, create: true } } }) });
    const counts = async () => (await db.query<{ clinical: number; vaccines: number; audits: number }>(`SELECT (SELECT count(*)::int FROM "SstClinicalRecord") clinical,(SELECT count(*)::int FROM "SstVaccination") vaccines,(SELECT count(*)::int FROM "AuditEvent") audits`)).rows[0];
    return { ...local, db, context, counts };
  } catch (error) { await local.close(); throw error; }
}
test("generic clinical authorization cannot read psychology without its discipline grant; module and UG are enforced first", async () => {
  const f = await fixture();
  try {
    await f.db.exec(`UPDATE "SstDisciplineGrant" SET "canRead"=false,"canWrite"=false WHERE discipline='PSYCHOLOGY'`);
    await assert.rejects(assertDisciplineAccess(f.context, "ug", "PSYCHOLOGY"), /atuação profissional/);
    await assert.rejects(assertDisciplineAccess(f.context, "other", "PSYCHOLOGY"), /Unidade Gestora/);
    await f.db.exec(`UPDATE "SstDisciplineGrant" SET "canRead"=true,"isActive"=false WHERE discipline='PSYCHOLOGY'`);
    await assert.rejects(assertDisciplineAccess(f.context, "ug", "PSYCHOLOGY"), /atuação profissional/);
    await f.db.exec(`UPDATE "SstDisciplineGrant" SET "isActive"=true WHERE discipline='PSYCHOLOGY'`);
    await assertDisciplineAccess(f.context, "ug", "PSYCHOLOGY");
    await assert.rejects(assertDisciplineAccess(f.context, "ug", "PSYCHOLOGY", true));
    f.context.user.permissions = JSON.stringify({ modules: { SST: { blocked: true } } });
    await assert.rejects(assertDisciplineAccess(f.context, "ug", "MEDICINE"), /módulo SST/);
    assert.deepEqual(disciplineUnitWhere(f.context, "MEDICINE"), { id: { in: [] } });
  } finally { await f.close(); }
});
test("only the canonical role usuario may author a visit or proof; generic privilege cannot self-create a habilitation", async () => {
  const f = await fixture({ roleUser: "other-user" });
  try {
    await assert.rejects(registerClinicalRecord(f.context, visit), /usuário registrador/);
    await assert.rejects(registerOccupationalVaccination(f.context, shot), /usuário registrador/);
    await assert.rejects(registerProfessionalRole(f.context, {}), /administração técnica/);
    await assert.rejects(registerDisciplineGrant(f.context, {}), /administração técnica/);
    f.context.user.profileCode = "SYSTEM_ADMINISTRATOR";
    await assert.rejects(registerClinicalRecord(f.context, visit), /usuário registrador/);
    await assert.rejects(registerOccupationalVaccination(f.context, shot), /usuário registrador/);
    assert.deepEqual(await f.counts(), { clinical: 0, vaccines: 0, audits: 0 });
  } finally { await f.close(); }
});
test("discipline authorization is sysadmin-only, rejects inactive users and reflects audited revocation", async () => {
  const f = await fixture();
  try {
    f.context.user.profileCode = "SYSTEM_ADMINISTRATOR";
    const grant = { usuarioId: "actor", budgetUnitId: "ug", discipline: "PSYCHOLOGY", canRead: true, canWrite: true, isActive: true };
    await assert.rejects(registerDisciplineGrant(f.context, { ...grant, canRead: false }), /leitura/);
    await f.db.exec(`UPDATE "Usuario" SET ativo=false WHERE id='actor'`);
    await assert.rejects(registerDisciplineGrant(f.context, grant), /inativo/);
    await f.db.exec(`UPDATE "Usuario" SET ativo=true WHERE id='actor'`);
    const id = await registerDisciplineGrant(f.context, grant); assert.ok(id);
    assert.equal(await registerDisciplineGrant(f.context, { ...grant, isActive: false }), id);
    f.context.user.profileCode = "SST_OPERATOR";
    await assert.rejects(assertDisciplineAccess(f.context, "ug", "PSYCHOLOGY"), /atuação profissional/);
    assert.equal((await f.counts()).audits, 2);
  } finally { await f.close(); }
});
test("civil day validity is inclusive and vaccines DATE never shift to the preceding day", async () => {
  const f = await fixture();
  try {
    await registerClinicalRecord(f.context, visit); await registerOccupationalVaccination(f.context, shot);
    const document = await clinicalRecordDocument(f.context, { id: (await f.db.query<{ id: string }>('SELECT id FROM "SstClinicalRecord"')).rows[0].id });
    assert.equal(document.record.attendedAt.toISOString(), "2026-10-01T03:00:00.000Z");
    assert.deepEqual((await f.db.query('SELECT "administeredAt"::text FROM "SstVaccination"')).rows, [{ administeredAt: "2026-10-01" }]);
    for (const attendedAt of ["2026-10-01T02:59:59Z", "2026-10-02T03:00:00Z"]) await assert.rejects(registerClinicalRecord(f.context, { ...visit, attendedAt, submissionKey: otherKey }), /vigência/);
    await f.db.exec('UPDATE "SstProfessionalRole" SET "isActive"=false');
    await assert.rejects(registerClinicalRecord(f.context, { ...visit, submissionKey: otherKey }), /vigência/);
    await assert.rejects(registerOccupationalVaccination(f.context, { ...shot, doseNumber: 2, submissionKey: otherKey }), /vigência/);
    await assert.rejects(registerClinicalRecord(f.context, { ...visit, attendedAt: "2999-01-01T03:00:00Z" }), /futura/);
    for (const value of ["not-a-date", "2026-02-30T03:00:00Z", Infinity]) assert.equal(clinicalRecordInput.safeParse({ ...visit, attendedAt: value }).success, false);
    for (const value of ["2026-02-30", "2026-10-01T00:00:00Z", Infinity]) assert.equal(vaccinationInput.safeParse({ ...shot, administeredAt: value }).success, false);
  } finally { await f.close(); }
});
test("professional registration preserves canonical council/dates and rejects inactive account bindings", async () => {
  const f = await fixture({ seedRole: false });
  try {
    f.context.user.profileCode = "SYSTEM_ADMINISTRATOR";
    await f.db.exec(`UPDATE "Usuario" SET ativo=false WHERE id='actor'`);
    await assert.rejects(registerProfessionalRole(f.context, professional), /inativo/);
    await f.db.exec(`UPDATE "Usuario" SET ativo=true WHERE id='actor'`);
    await registerProfessionalRole(f.context, professional);
    assert.deepEqual((await f.db.query('SELECT council,"usuarioId","createdById","startsAt"::text FROM "SstProfessionalRole"')).rows, [{ council: "CRM PR 123", usuarioId: "actor", createdById: "actor", startsAt: "2026-10-01" }]);
    assert.deepEqual((await f.db.query('SELECT "targetType" FROM "AuditEvent"')).rows, [{ targetType: "SST_PROFESSIONAL" }]);
    await assert.rejects(registerProfessionalRole(f.context, { ...professional, endsAt: "2026-09-30" }));
  } finally { await f.close(); }
});
test("identical professional creation retries return the original id without a second write/audit; conflicting metadata or creator blocks", async () => {
  const f = await fixture({ seedRole: false });
  try {
    f.context.user.profileCode = "SYSTEM_ADMINISTRATOR";
    const id = await registerProfessionalRole(f.context, professional);
    assert.equal(await registerProfessionalRole(f.context, professional), id);
    for (const changes of [{ council: "CRM PR 999" }, { usuarioId: "other-user" }, { personId: "other-professional" }, { startsAt: "2026-09-30" }, { endsAt: "2026-10-02" }]) await assert.rejects(registerProfessionalRole(f.context, { ...professional, ...changes }), /sobreposta/);
    f.context.user.id = "other-user";
    await assert.rejects(registerProfessionalRole(f.context, professional), /sobreposta/);
    assert.equal((await f.counts()).audits, 1);
    const unlinked = { ...professional, startsAt: "2026-11-01", endsAt: "2026-11-01", usuarioId: "" };
    const freeId = await registerProfessionalRole(f.context, unlinked);
    assert.equal(await registerProfessionalRole(f.context, unlinked), freeId);
    assert.deepEqual((await f.db.query('SELECT "usuarioId" FROM "SstProfessionalRole" WHERE id=$1', [freeId])).rows, [{ usuarioId: null }]);
  } finally { await f.close(); }
});
test("a medical clinic user with an own canonical role and clinical write grants cannot edit their own authorization", async () => {
  const f = await fixture();
  try {
    f.context.user.profileCode = "MEDICAL_CLINIC"; await registerClinicalRecord(f.context, visit);
    const before = (await f.db.query('SELECT * FROM "SstDisciplineGrant" ORDER BY id')).rows;
    for (const changes of [{ isActive: false }, { canWrite: false }, { discipline: "PSYCHOLOGY" }]) await assert.rejects(registerDisciplineGrant(f.context, { usuarioId: "actor", budgetUnitId: "ug", discipline: "MEDICINE", canRead: true, canWrite: true, isActive: true, ...changes }), /administração técnica/);
    assert.deepEqual((await f.db.query('SELECT * FROM "SstDisciplineGrant" ORDER BY id')).rows, before);
    assert.equal((await f.counts()).audits, 1);
  } finally { await f.close(); }
});
test("historical worker UG is explicit: current secretariat does not grant or deny coverage and missing/ambiguous history blocks", async () => {
  const f = await fixture();
  try {
    await registerClinicalRecord(f.context, visit);
    await f.db.exec(`INSERT INTO "HrEmployeeFunctionalPeriod" SELECT 'duplicate',"employeeId","budgetUnitId","startsAt","endsAt",false,NULL FROM "HrEmployeeFunctionalPeriod"`);
    for (const mode of ["ambiguous", "missing"]) {
      if (mode === "missing") await f.db.exec('DELETE FROM "HrEmployeeFunctionalPeriod"');
      await assert.rejects(registerClinicalRecord(f.context, { ...visit, submissionKey: otherKey }), /período funcional RH/);
      await assert.rejects(registerOccupationalVaccination(f.context, shot), /período funcional RH/);
    }
    await f.db.exec('UPDATE "Employee" SET "personId"=NULL');
    await assert.rejects(registerClinicalRecord(f.context, { ...visit, submissionKey: otherKey }), /servidor canônico/);
    assert.deepEqual(await f.counts(), { clinical: 1, vaccines: 0, audits: 1 });
  } finally { await f.close(); }
});
test("questionnaire scope, canonical medicine and MEDICINE-only requests are enforced before writes", async () => {
  const f = await fixture();
  try {
    for (const questionnaireVersionId of ["foreign-q", "psy-q"]) await assert.rejects(registerClinicalRecord(f.context, { ...visit, questionnaireVersionId, answers: {} }), /Questionário incompatível/);
    await assert.rejects(registerClinicalRecord(f.context, { ...visit, questionnaireVersionId: "q", answers: { unknown: "PHI" } }), /não pertencem/);
    const medication = { kind: "MEDICATION", description: "Nome adulterado", medicineId: "medicine", instructions: "Uma dose diária", quantity: 1, days: 1 };
    await f.db.exec('UPDATE "Medicine" SET "isActive"=false');
    await assert.rejects(registerClinicalRecord(f.context, { ...visit, requests: [medication] }), /catálogo canônico/);
    await f.db.exec('UPDATE "Medicine" SET "isActive"=true');
    const id = await registerClinicalRecord(f.context, { ...visit, requests: [medication] });
    const document = await clinicalRecordDocument(f.context, { id });
    assert.equal(document.requests[0].description, "Nome canônico"); assert.equal(document.snapshot.council, "CRM PR 123");
    for (const discipline of ["NURSING", "PSYCHOLOGY", "SOCIAL_WORK"]) {
      assert.equal(clinicalRecordInput.safeParse({ ...visit, discipline, requests: [medication] }).success, false);
      assert.equal(clinicalRecordInput.safeParse({ ...visit, discipline, requests: [{ kind: "EXAM", description: "Exame" }] }).success, false);
      assert.equal(clinicalRecordInput.safeParse({ ...visit, discipline, requests: [{ kind: "REFERRAL", description: "Encaminhamento" }] }).success, true);
    }
  } finally { await f.close(); }
});
test("identical retries preserve council snapshots and audit count; changed payload/actor and duplicate vaccine doses block", async () => {
  const f = await fixture();
  try {
    const id = await registerClinicalRecord(f.context, visit), vaccineId = await registerOccupationalVaccination(f.context, shot);
    await f.db.exec('UPDATE "SstProfessionalRole" SET "isActive"=false');
    assert.equal(await registerClinicalRecord(f.context, visit), id); assert.equal(await registerOccupationalVaccination(f.context, shot), vaccineId);
    await assert.rejects(registerClinicalRecord(f.context, { ...visit, narrative: "Outro atendimento" }), /outros dados/);
    await assert.rejects(registerOccupationalVaccination(f.context, { ...shot, lotNumber: "OTHER" }), /outros dados/);
    await assert.rejects(registerOccupationalVaccination(f.context, { ...shot, submissionKey: otherKey }), /Dose.*já registrada/);
    f.context.user.id = "other-user";
    await assert.rejects(registerClinicalRecord(f.context, visit), /outros dados/); await assert.rejects(registerOccupationalVaccination(f.context, shot), /outros dados/);
    assert.deepEqual(await f.counts(), { clinical: 1, vaccines: 1, audits: 2 });
    const audits = (await f.db.query('SELECT "eventType","targetType","targetId","actorUsuarioId" FROM "AuditEvent"')).rows;
    assert.doesNotMatch(JSON.stringify(audits), /Atendimento clínico|Exposição|CID|CRM/);
  } finally { await f.close(); }
});
test("same vaccine/person/dose/date blocks a new submission but annual cycles on another civil date are allowed in canonical scope", async () => {
  const f = await fixture({ startsAt: "2025-10-01", endsAt: "2026-10-02" });
  try {
    await registerOccupationalVaccination(f.context, { ...shot, administeredAt: "2025-10-01" });
    await assert.rejects(registerOccupationalVaccination(f.context, { ...shot, administeredAt: "2025-10-01", submissionKey: otherKey }), /já registrada.*nesta data/);
    const id = await registerOccupationalVaccination(f.context, { ...shot, submissionKey: otherKey });
    assert.equal(await registerOccupationalVaccination(f.context, { ...shot, submissionKey: otherKey }), id);
    assert.deepEqual((await f.db.query('SELECT "administeredAt"::text,"doseNumber" FROM "SstVaccination" ORDER BY "administeredAt"')).rows, [{ administeredAt: "2025-10-01", doseNumber: 1 }, { administeredAt: "2026-10-01", doseNumber: 1 }]);
    await assert.rejects(registerOccupationalVaccination(f.context, { ...shot, budgetUnitId: "foreign", submissionKey: key }), /Unidade Gestora/);
    await f.db.exec('DELETE FROM "HrEmployeeFunctionalPeriod"');
    await assert.rejects(registerOccupationalVaccination(f.context, { ...shot, administeredAt: "2026-10-02", submissionKey: "5d161f17-63ca-4d57-9c87-82c4f74e4d5a" }), /período funcional RH/);
    assert.deepEqual(await f.counts(), { clinical: 0, vaccines: 2, audits: 2 });
  } finally { await f.close(); }
});
test("date-specific PostgreSQL conflicts become domain errors; unrelated constraints and database errors retain their cause", async () => {
  const f = await fixture();
  try {
    await f.db.exec(`CREATE FUNCTION reject_shot() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE unique_violation USING CONSTRAINT='SstVaccination_person_vaccine_dose_date_key'; END $$;
      CREATE TRIGGER test_conflict BEFORE INSERT ON "SstVaccination" FOR EACH ROW EXECUTE FUNCTION reject_shot()`);
    await assert.rejects(registerOccupationalVaccination(f.context, shot), error => error instanceof SstValidationError && /nesta data/.test(error.message));
    await f.db.exec(`CREATE OR REPLACE FUNCTION reject_shot() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE unique_violation USING CONSTRAINT='unrelated_key'; END $$`);
    await assert.rejects(registerOccupationalVaccination(f.context, shot), error => getPostgresError(error)?.constraint === "unrelated_key");
    await f.db.exec(`CREATE OR REPLACE FUNCTION reject_shot() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Database unavailable'; END $$`);
    await assert.rejects(registerOccupationalVaccination(f.context, shot), sstDatabaseError("P0001", /Database unavailable/));
    assert.deepEqual(await f.counts(), { clinical: 0, vaccines: 0, audits: 0 });
  } finally { await f.close(); }
});
test("report authorization precedes private data, validates discipline/type and uses genuine timestamps and configured GLOBAL metadata", async () => {
  const f = await fixture();
  try {
    // Capture the default's origin in the INSERT transaction, independently of
    // both the report DTO and the raw driver's (unmapped) timestamp strings.
    await f.db.exec(`CREATE TABLE clinical_timestamp_origin (id text PRIMARY KEY, "transactionAt" timestamp(3), "clockAt" timestamp(3), timezone text);
      CREATE FUNCTION clinical_timestamp_origin() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
        INSERT INTO clinical_timestamp_origin VALUES (NEW.id, transaction_timestamp() AT TIME ZONE 'UTC', clock_timestamp() AT TIME ZONE 'UTC', current_setting('TimeZone'));
        RETURN NEW;
      END $$;
      CREATE TRIGGER clinical_timestamp_origin AFTER INSERT ON "SstClinicalRecord" FOR EACH ROW EXECUTE FUNCTION clinical_timestamp_origin()`);
    const before = Date.now(), id = await registerClinicalRecord(f.context, visit);
    const origin = (await f.connection.db.execute<{ createdAt: string; createdById: string; transactionAt: string; clockAt: string; timezone: string }>(sql`
      SELECT r."createdAt", r."createdById", o."transactionAt", o."clockAt", o.timezone
      FROM "SstClinicalRecord" r JOIN clinical_timestamp_origin o ON o.id=r.id WHERE r.id=${id}
    `)).rows[0];
    assert.equal(origin.timezone, "UTC"); assert.equal(origin.createdById, "actor");
    assert.equal(databaseTimestamp(origin.createdAt).getTime(), databaseTimestamp(origin.transactionAt).getTime(), "createdAt must be the INSERT transaction timestamp");
    assert.ok(databaseTimestamp(origin.clockAt).getTime() >= databaseTimestamp(origin.transactionAt).getTime());
    await assert.rejects(clinicalRecordDocument(f.context, { id, printing: true }), /emitir relatórios/);
    assert.equal((await f.counts()).audits, 1);
    f.context.user.permissions = JSON.stringify({ modules: { SST: { blocked: false, create: true, issueReports: true } } });
    const document = await clinicalRecordDocument(f.context, { id, printing: true, report: "opinion", issuedAt: "1900-01-01", issuedBy: "Fake" });
    assert.equal(document.title, "Laudo médico ocupacional"); assert.equal(document.template!.header, "Cabeçalho configurado"); assert.equal(document.template!.footer, "Rodapé configurado");
    assert.equal(document.template!.orientation, "PORTRAIT"); assert.equal(document.institution!.legalName, "Instituição canônica"); assert.equal(document.emission!.issuedBy, "Registrador");
    assert.ok(Math.abs(Date.now() - Date.parse(document.emission!.issuedAt)) < 5000);
    assert.equal(document.record.attendedAt.toISOString(), "2026-10-01T03:00:00.000Z");
    assert.equal(document.record.createdAt.getTime(), databaseTimestamp(origin.createdAt).getTime(), "report and raw PostgreSQL timestamp must represent the same UTC instant");
    assert.ok(document.record.createdAt.getTime() >= before - 1000, JSON.stringify({ before: new Date(before).toISOString(), reported: document.record.createdAt.toISOString(), ...origin }));
    await assert.rejects(clinicalRecordDocument(f.context, { id, report: "invented" }));
    await f.db.exec(`INSERT INTO "SstProfessionalRole" (id,"budgetUnitId","personId","usuarioId",discipline,council,"startsAt","endsAt","createdById") VALUES ('psy-role','ug','doctor','actor','PSYCHOLOGY','CRP 123','2026-10-01','2026-10-01','actor')`);
    const psyId = await registerClinicalRecord(f.context, { ...visit, professionalRoleId: "psy-role", discipline: "PSYCHOLOGY", submissionKey: otherKey });
    await assert.rejects(clinicalRecordDocument(f.context, { id: psyId, printing: true, report: "opinion" }), /Medicina/);
    await f.db.exec(`UPDATE "SstDisciplineGrant" SET "canRead"=false,"canWrite"=false WHERE discipline='MEDICINE'`);
    await assert.rejects(clinicalRecordDocument(f.context, { id }), /atuação profissional/);
  } finally { await f.close(); }
});
test("clinical services use shared catalog only, never SUSPatient or assistential patient history", async () => {
  const f = await fixture();
  try {
    // Assistential relations deliberately do not exist in this fixture.
    const id = await registerClinicalRecord(f.context, { ...visit, requests: [{ kind: "MEDICATION", description: "Remédio", medicineId: "medicine", instructions: "Uma dose", quantity: 1, days: 1 }] });
    await registerOccupationalVaccination(f.context, shot); await clinicalRecordDocument(f.context, { id });
    assert.equal((await f.counts()).clinical, 1); assert.equal((await f.counts()).vaccines, 1);
  } finally { await f.close(); }
});
test("private chart and vaccine lists are audited before reading, paginated by 20, and cannot replace a selected UG with an allowed-unit spread", async () => {
  const f = await fixture();
  try {
    for (let n = 1; n <= 45; n++) await registerClinicalRecord(f.context, { ...visit, submissionKey: `00000000-0000-4000-8000-${n.toString().padStart(12, "0")}` });
    const result = await listClinicalRecords(f.context, { discipline: "MEDICINE", budgetUnitId: "ug", page: 2 });
    assert.equal(result.total, 45); assert.equal(result.page, 2); assert.equal(result.records.length, 20);
    assert.deepEqual(Object.keys(result.records[0]).sort(), ["attendedAt", "id", "snapshot"]);
    const foreign = await listOccupationalVaccinations(f.context, { discipline: "MEDICINE", budgetUnitId: "foreign", page: 100 });
    assert.equal(foreign.total, 0); assert.equal(foreign.page, 1); assert.equal(foreign.records.length, 0);
    await f.db.exec(`CREATE FUNCTION reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'audit unavailable'; END $$;
      CREATE TRIGGER test_audit BEFORE INSERT ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION reject_audit();
      ALTER TABLE "SstClinicalRecord" RENAME TO "HiddenClinicalRecord"`);
    await assert.rejects(listClinicalRecords(f.context, { discipline: "MEDICINE", page: 1 }), sstDatabaseError("P0001", /audit unavailable/));
    await assert.rejects(listClinicalRecords(f.context, { discipline: "MEDICINE", page: Infinity }));
  } finally { await f.close(); }
});

async function migrationDb() {
  const db = new PGlite();
  await db.exec(`CREATE TABLE "BudgetUnit" (id TEXT PRIMARY KEY); CREATE TABLE "Person" (id TEXT PRIMARY KEY); CREATE TABLE "Usuario" (id TEXT PRIMARY KEY); CREATE TABLE "Vaccine" (id TEXT PRIMARY KEY); CREATE TABLE "SstQuestionnaireVersion" (id TEXT PRIMARY KEY,"budgetUnitId" TEXT NOT NULL);
    INSERT INTO "BudgetUnit" VALUES ('ug'),('other'); INSERT INTO "Person" VALUES ('worker'),('doctor'); INSERT INTO "Usuario" VALUES ('actor'); INSERT INTO "Vaccine" VALUES ('vaccine');`);
  for (const name of ["20261011010000_add_sst_clinical_services", "20261011120000_harden_sst_clinical_integrity"]) await db.exec(readFileSync(`prisma/migrations-ibema/${name}/migration.sql`, "utf8"));
  await db.exec(`INSERT INTO "SstProfessionalRole" (id,"budgetUnitId","personId","usuarioId",discipline,council,"startsAt","endsAt","createdById") VALUES ('role','ug','doctor','actor','MEDICINE','CRM PR 123','2026-10-01','2026-10-01','actor'); INSERT INTO "SstQuestionnaireVersion" VALUES ('q','ug','MEDICINE'),('otherq','other','MEDICINE'),('psychq','ug','PSYCHOLOGY')`);
  return db;
}
async function insertVisit(db: PGlite, id: string, at = "2026-10-01 03:00:00", q: string | null = null, discipline = "MEDICINE") {
  return db.query(`INSERT INTO "SstClinicalRecord" (id,"budgetUnitId","personId","professionalRoleId",discipline,"attendedAt","occupationalContext",narrative,opinion,diagnosis,requests,"questionnaireVersionId","questionnaireSnapshot",answers,snapshot,"submissionKey","requestHash","createdById") VALUES ($1,'ug','worker','role',$4,$2,'Contexto','Narrativa','Parecer','','[]',$3,'{}','{}','{"council":"CRM PR 123"}',$1,'hash','actor')`, [id, at, q, discipline]);
}
async function insertShot(db: PGlite, id: string, at = "2026-10-01", dose = 1, professionalRoleId = "role") {
  return db.query(`INSERT INTO "SstVaccination" (id,"budgetUnitId","personId","professionalRoleId","vaccineId","administeredAt","doseNumber","lotNumber",source,"occupationalContext",snapshot,"submissionKey","requestHash","createdById") VALUES ($1,'ug','worker',$4,'vaccine',$2,$3,'LOT','EXTERNAL_PROOF','Contexto','{}',$1,'hash','actor')`, [id, at, dose, professionalRoleId]);
}
test("deployed 0100 followed by additive 1200 enforces UTC civil validity independent of session timezone, DATE validity, scope and inactive roles", async () => {
  const db = await migrationDb();
  try {
    assert.match((await db.query<{ definition: string }>(`SELECT pg_get_functiondef('sst_clinical_scope()'::regprocedure) definition`)).rows[0].definition, /FOR SHARE/);
    for (const zone of ["UTC", "Pacific/Auckland"]) {
      await db.exec(`SET TIME ZONE '${zone}'`); await insertVisit(db, `valid-${zone}`, "2026-10-02 02:59:59", "q");
      await assert.rejects(insertVisit(db, "before", "2026-10-01 02:59:59"), /validity/); await assert.rejects(insertVisit(db, "after", "2026-10-02 03:00:00"), /validity/);
    }
    await insertShot(db, "shot"); await assert.rejects(insertVisit(db, "infinite", "infinity")); await assert.rejects(insertShot(db, "infinite-shot", "infinity", 2));
    await assert.rejects(db.exec(`INSERT INTO "SstProfessionalRole" (id,"budgetUnitId","personId",discipline,council,"startsAt","endsAt","createdById") VALUES ('infinite-role','ug','doctor','MEDICINE','CRM','2026-10-02','infinity','actor')`), /check constraint/);
    await assert.rejects(insertShot(db, "duplicate"), /SstVaccination_person_vaccine_dose_date_key/);
    await db.exec(`INSERT INTO "SstProfessionalRole" (id,"budgetUnitId","personId","usuarioId",discipline,council,"startsAt","endsAt","createdById") VALUES ('prior-role','ug','doctor','actor','MEDICINE','CRM PR 123','2025-10-01','2025-10-01','actor')`);
    await insertShot(db, "annual-cycle", "2025-10-01", 1, "prior-role"); await assert.rejects(insertShot(db, "annual-duplicate", "2025-10-01", 1, "prior-role"), /SstVaccination_person_vaccine_dose_date_key/);
    assert.equal((await db.query<{ total: number }>('SELECT count(*)::int total FROM "SstVaccination"')).rows[0].total, 2);
    await assert.rejects(insertShot(db, "old", "2026-09-30", 2), /validity/);
    await assert.rejects(insertVisit(db, "wrong-q", undefined, "otherq"), /questionnaire scope/); await assert.rejects(insertVisit(db, "psych-q", undefined, "psychq"), /questionnaire scope/);
    await assert.rejects(insertVisit(db, "wrong-discipline", undefined, null, "PSYCHOLOGY"), /discipline mismatch/);
    await assert.rejects(db.exec(`INSERT INTO "SstDisciplineGrant" (id,"budgetUnitId","usuarioId",discipline,"canRead","canWrite") VALUES ('bad-grant','ug','actor','MEDICINE',false,true)`), /check constraint/);
    await db.exec('UPDATE "SstProfessionalRole" SET "isActive"=false'); await assert.rejects(insertVisit(db, "inactive"), /must be active/); await assert.rejects(insertShot(db, "inactive-shot", undefined, 2), /must be active/);
  } finally { await db.close(); }
});
test("0100 history is immutable, council cannot change, and failed mutation rolls back the entire transaction", async () => {
  const db = await migrationDb();
  try {
    await insertVisit(db, "visit"); await insertShot(db, "shot");
    for (const table of ["SstClinicalRecord", "SstVaccination"]) { await assert.rejects(db.exec(`UPDATE "${table}" SET "requestHash"='changed'`), /immutable/); await assert.rejects(db.exec(`DELETE FROM "${table}"`), /immutable/); }
    await assert.rejects(db.exec(`UPDATE "SstProfessionalRole" SET council='CRM OTHER'`), /immutable/); await assert.rejects(db.exec('DELETE FROM "SstProfessionalRole"'), /immutable/);
    await db.exec("BEGIN"); await insertVisit(db, "rolled-back"); await assert.rejects(db.exec(`UPDATE "SstClinicalRecord" SET diagnosis='changed' WHERE id='visit'`), /immutable/); await db.exec("ROLLBACK");
    assert.deepEqual((await db.query('SELECT id FROM "SstClinicalRecord" ORDER BY id')).rows, [{ id: "visit" }]);
    assert.deepEqual((await db.query('SELECT council FROM "SstProfessionalRole"')).rows, [{ council: "CRM PR 123" }]);
  } finally { await db.close(); }
});
test("real historical service enforces instant end-exclusive coverage and full Sao Paulo vaccination civil day", async () => {
  const f = await fixture({ startsAt: "2026-10-01", endsAt: "2026-10-02" });
  try {
    f.connection.pool.options.max = 1;
    await f.db.exec(`UPDATE "HrEmployeeFunctionalPeriod" SET "startsAt"='2026-10-01 03:00',"endsAt"='2026-10-02 03:00'`);
    for (const [index, zone] of ["UTC", "America/Los_Angeles", "Pacific/Auckland"].entries()) {
      await f.connection.db.execute((await import("drizzle-orm")).sql`SELECT set_config('TimeZone', ${zone}, false)`);
      await registerClinicalRecord(f.context, { ...visit, submissionKey: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}` });
      await registerOccupationalVaccination(f.context, { ...shot, doseNumber: index + 1, submissionKey: `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}` });
    }
    await assert.rejects(registerClinicalRecord(f.context, { ...visit, attendedAt: "2026-10-02T03:00:00Z", submissionKey: key }), /período funcional RH/);
    await f.db.exec(`UPDATE "HrEmployeeFunctionalPeriod" SET "startsAt"='2026-10-01 04:00'`);
    await assert.rejects(registerOccupationalVaccination(f.context, { ...shot, doseNumber: 4, submissionKey: key }), /período funcional RH/);
    await f.db.exec(`UPDATE "HrEmployeeFunctionalPeriod" SET "startsAt"='2026-10-01 03:00'; INSERT INTO "HrEmployeeFunctionalPeriod" VALUES ('correction','employee','ug','2026-10-01 03:00','2026-10-02 03:00',true,'period')`);
    await assert.rejects(registerClinicalRecord(f.context, visit), /período funcional RH/);
  } finally { await f.close(); }
});
