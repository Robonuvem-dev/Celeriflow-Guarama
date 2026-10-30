import test from "node:test";
import assert from "node:assert/strict";
import { processReferenceSchema } from "../src/lib/protocols/reference-catalog";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";

test("cadastros de processos validam assunto e preservam unicidade sem apagar histórico", async () => {
  const input = { kind: "SUBJECT_CHILD", name: " Filho ", description: null, subjectId: null, isActive: true };
  assert.equal(processReferenceSchema.safeParse(input).success, false);
  assert.equal(processReferenceSchema.parse({ ...input, subjectId: "parent" }).name, "Filho");
  const database = new PGlite();
  try {
    await database.exec('CREATE TABLE "Subject" (id text PRIMARY KEY); INSERT INTO "Subject" VALUES (\'parent\');');
    await database.exec(await readFile(new URL("../db/migrations/20261030120000_process_reference_catalog/migration.sql", import.meta.url), "utf8"));
    await assert.rejects(database.exec(`INSERT INTO "ProcessReferenceCatalog" (id,kind,name) VALUES ('missing','SUBJECT_CHILD','Filho')`));
    await database.exec(`INSERT INTO "ProcessReferenceCatalog" (id,kind,name,"subjectId") VALUES ('child','SUBJECT_CHILD','Filho','parent')`);
    await assert.rejects(database.exec(`INSERT INTO "ProcessReferenceCatalog" (id,kind,name,"subjectId") VALUES ('duplicate','SUBJECT_CHILD',' FILHO ','parent')`));
    for (const kind of ["PHYSICAL_LOCATION", "REQUIRED_DOCUMENT", "JUSTIFICATION", "REQUEST_METHOD"]) {
      await database.query('INSERT INTO "ProcessReferenceCatalog" (id,kind,name) VALUES ($1,$2,$3)', [kind,kind,"Cadastro"]);
    }
    await database.exec(`UPDATE "ProcessReferenceCatalog" SET "isActive"=false WHERE id='child'`);
    const result = await database.query<{isActive:boolean}>('SELECT "isActive" FROM "ProcessReferenceCatalog" WHERE id=\'child\'');
    assert.equal(result.rows[0].isActive,false);
    assert.equal((await database.query('SELECT id FROM "ProcessReferenceCatalog"')).rows.length,5);
  } finally { await database.close(); }
});

test("valor opcional de processo não aceita negativos nem perde precisão decimal", async () => {
  const { processRegistrationDetailSchema } = await import("../src/lib/protocols/registration-details");
  assert.equal(processRegistrationDetailSchema.safeParse({ representativePersonId: null, declaredValue: "-1" }).success, false);
  assert.equal(processRegistrationDetailSchema.safeParse({ representativePersonId: null, declaredValue: "1.001" }).success, false);
  assert.equal(processRegistrationDetailSchema.parse({ representativePersonId: null, declaredValue: "9999999999999999.99" }).declaredValue,"9999999999999999.99");
  const database = new PGlite();
  try {
    await database.exec('CREATE TABLE "Process" (id text PRIMARY KEY); CREATE TABLE "Person" (id text PRIMARY KEY); INSERT INTO "Process" VALUES (\'p\'); INSERT INTO "Person" VALUES (\'representative\');');
    await database.exec(await readFile(new URL("../db/migrations/20261030120100_process_registration_details/migration.sql", import.meta.url), "utf8"));
    await database.exec(`INSERT INTO "ProcessRegistrationDetail" ("processId","representativePersonId","declaredValue") VALUES ('p','representative',123.45)`);
    const result = await database.query<{value:string}>('SELECT "declaredValue"::text as value FROM "ProcessRegistrationDetail"');
    assert.equal(result.rows[0].value,"123.45");
    await assert.rejects(database.exec(`UPDATE "ProcessRegistrationDetail" SET "declaredValue"=-1`));
  } finally { await database.close(); }
});

test("estrutura mantém siglas e vínculo de setor/unidade/responsável com chaves estrangeiras", async () => {
  const database = new PGlite();
  try {
    await database.exec('CREATE TABLE "AdministrativeUnit" (id text PRIMARY KEY); CREATE TABLE "Department" (id text PRIMARY KEY); CREATE TABLE "Employee" (id text PRIMARY KEY); INSERT INTO "AdministrativeUnit" VALUES (\'u\'); INSERT INTO "Department" VALUES (\'d\'); INSERT INTO "Employee" VALUES (\'e\');');
    await database.exec(await readFile(new URL("../db/migrations/20261030120200_process_structure_metadata/migration.sql", import.meta.url),"utf8"));
    await database.exec(`INSERT INTO "ProcessUnitMetadata" VALUES ('u','UNI'); INSERT INTO "ProcessDepartmentMetadata" VALUES ('d','u','SET','e')`);
    await assert.rejects(database.exec(`UPDATE "ProcessDepartmentMetadata" SET "unitId"='unknown'`));
    await assert.rejects(database.exec(`UPDATE "ProcessDepartmentMetadata" SET "responsibleEmployeeId"='unknown'`));
    await assert.rejects(database.exec(`UPDATE "ProcessDepartmentMetadata" SET "acronym"=''`));
    const result = await database.query<{acronym:string}>('SELECT "acronym" FROM "ProcessDepartmentMetadata"');
    assert.equal(result.rows[0].acronym,"SET");
  } finally { await database.close(); }
});

test("parametrização da impressão por tipo exige ao menos abertura ou movimentação", async () => {
  const database = new PGlite();
  try {
    await database.exec('CREATE TABLE "ProcessType" (id text PRIMARY KEY); INSERT INTO "ProcessType" VALUES (\'type\');');
    await database.exec(await readFile(new URL("../db/migrations/20261030120300_process_print_settings/migration.sql", import.meta.url),"utf8"));
    await database.exec(`INSERT INTO "ProcessPrintSetting" ("processTypeId") VALUES ('type')`);
    await assert.rejects(database.exec(`UPDATE "ProcessPrintSetting" SET "includeOpening"=false,"includeMovements"=false`));
    await database.exec(`UPDATE "ProcessPrintSetting" SET "includeOpening"=false`);
    const result=await database.query<{includeOpening:boolean;includeMovements:boolean}>('SELECT * FROM "ProcessPrintSetting"');
    assert.equal(result.rows[0].includeOpening,false);assert.equal(result.rows[0].includeMovements,true);
  } finally { await database.close(); }
});

test("outros requerentes são cadastráveis e vinculados ao detalhe por chave estrangeira", async () => {
 const database=new PGlite();
 try {
  await database.exec('CREATE TABLE "Subject" (id text PRIMARY KEY); CREATE TABLE "Process" (id text PRIMARY KEY); CREATE TABLE "Person" (id text PRIMARY KEY); INSERT INTO "Process" VALUES (\'p\');');
  for(const path of ["20261030120000_process_reference_catalog","20261030120100_process_registration_details","20261030120400_process_other_applicant"]) await database.exec(await readFile(new URL(`../db/migrations/${path}/migration.sql`,import.meta.url),"utf8"));
  await database.exec(`INSERT INTO "ProcessReferenceCatalog" (id,kind,name) VALUES ('other','OTHER_APPLICANT','Associação sem personalidade jurídica'); INSERT INTO "ProcessRegistrationDetail" ("processId","otherApplicantId") VALUES ('p','other')`);
  await assert.rejects(database.exec(`UPDATE "ProcessRegistrationDetail" SET "otherApplicantId"='missing'`));
  assert.equal((await database.query('SELECT * FROM "ProcessRegistrationDetail"')).rows.length,1);
 } finally {await database.close();}
});
