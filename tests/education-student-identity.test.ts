import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import type { DatabaseExecutor } from "../src/db/transaction";
import { listEducationStudents } from "../src/db/repositories/education/core";
test("consulta de alunos conserva nascimento e filiação separadamente do responsável", async () => {
 const pg = new PGlite();
 try {
  await pg.exec(`CREATE TABLE "Person" (id text primary key,"fullName" text,cpf text,"birthDate" timestamp,"motherName" text,"fatherName" text,"motherUnknown" boolean,"fatherUnknown" boolean);
  CREATE TABLE "Student" (id text primary key,"studentCode" text,status text,"usesSchoolTransport" boolean,"needsSpecialMeal" boolean,"personId" text,"dietaryRestrictions" text);
  CREATE TABLE "EducationalGuardian" ("studentId" text,"kinship" text,"personId" text);
  CREATE TABLE "Enrollment" ("studentId" text,"schoolId" text,"classId" text,status text);
  CREATE TABLE "School" (id text,name text); CREATE TABLE "SchoolClass" (id text,name text);
  INSERT INTO "Person" VALUES ('p','Ana',NULL,'2015-02-03','Maria',NULL,false,true);
  INSERT INTO "Student" VALUES ('s','A1','Ativo',false,true,'p','Sem leite/lactose');`);
  const rows = await listEducationStudents(drizzle(pg) as unknown as DatabaseExecutor);
  assert.equal(rows[0].person.birthDate?.toISOString().slice(0,10), "2015-02-03");
  assert.equal(rows[0].person.motherName,"Maria"); assert.equal(rows[0].person.fatherUnknown,true);
  assert.deepEqual(rows[0].guardians,[]); assert.equal(rows[0].dietaryRestrictions,"Sem leite/lactose");
 } finally { await pg.close(); }
});
