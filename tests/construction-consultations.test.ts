import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
test("consultas preservam pergunta, resposta e setor; resposta única não pode ser reescrita", async () => {
  const db=new PGlite();
  try {
    await db.exec(`CREATE TABLE "ConstructionCase" (id TEXT PRIMARY KEY); CREATE TABLE "Department" (id TEXT PRIMARY KEY); CREATE TABLE "Employee" (id TEXT PRIMARY KEY); CREATE FUNCTION "construction_config_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Immutable'; END; $$; INSERT INTO "ConstructionCase" VALUES ('case'); INSERT INTO "Department" VALUES ('source'),('target'); INSERT INTO "Employee" VALUES ('employee')`);
    await db.exec(readFileSync("prisma/migrations-ibema/20261010280000_construction_consultations/migration.sql","utf8"));
    const input=`INSERT INTO "ConstructionConsultation" (id,"caseId","requestKey","requestedBy","sourceDepartmentId","targetDepartmentId",question,"dueAt") VALUES ($1,'case',$2,'actor','source',$3,'Solicito parecer técnico sobre o empreendimento','2026-12-01')`;
    await assert.rejects(db.query(input,["same","key-same","source"]));
    await assert.rejects(db.query(input,["missing","key-missing","unknown"]));
    await db.query(input,["consultation","key","target"]);
    await assert.rejects(db.query(input,["duplicate","key","target"]));
    await assert.rejects(db.exec(`UPDATE "ConstructionConsultation" SET question='Pergunta adulterada' WHERE id='consultation'`));
    await db.exec(`INSERT INTO "ConstructionConsultationResponse" (id,"consultationId","employeeId","actorId",opinion) VALUES ('response','consultation','employee','actor','Parecer técnico registrado de forma motivada')`);
    await assert.rejects(db.exec(`INSERT INTO "ConstructionConsultationResponse" (id,"consultationId","employeeId","actorId",opinion) VALUES ('duplicate','consultation','employee','actor','Tentativa de outra resposta')`));
    await assert.rejects(db.exec(`UPDATE "ConstructionConsultationResponse" SET opinion='Parecer adulterado' WHERE id='response'`));
    await assert.rejects(db.exec(`DELETE FROM "ConstructionConsultationResponse" WHERE id='response'`));
    await assert.rejects(db.exec(`DELETE FROM "Department" WHERE id='target'`));
  } finally { await db.close(); }
});
