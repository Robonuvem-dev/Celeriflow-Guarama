import assert from "node:assert/strict";
import test from "node:test";
import { programInput, occupationalRiskScore } from "../src/lib/sst/program-policy";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

const base = { budgetUnitId: "ug", code: "PGR2026", kind: "PGR", startsAt: "2026-10-01", endsAt: "2027-10-01", responsiblePersonId: "person", responsibleCouncil: "CREA PR 123", content: {} };
const risk = { description: "Ruído", danger: "Exposição ocupacional", possibleDamage: "Perda auditiva", propagation: "Ar", controls: "Redução na fonte", sources: "Máquina", exposureMinutes: 120, epiApplicable: true, epis: ["Protetor auricular"], probability: 3, severity: 4 };
test("PGR requires per-group hazards and assessed probability/severity", () => {
  const valid = programInput.parse({ ...base, groups: [{ groupId: "group", conditions: "Oficina", risks: [risk], exams: [] }] });
  assert.equal(occupationalRiskScore(valid.groups[0].risks[0].probability!, valid.groups[0].risks[0].severity!), 12);
  assert.equal(programInput.safeParse({ ...base, groups: [{ groupId: "group", conditions: "Oficina", risks: [{ ...risk, severity: "" }], exams: [] }] }).success, false);
  assert.equal(programInput.safeParse({ ...base, groups: [{ groupId: "group", conditions: "Oficina", risks: [{ ...risk, epis: [] }], exams: [] }] }).success, false);
});
test("PCMSO cannot omit general procedures or exams by exposure group", () => {
  const input = { ...base, kind: "PCMSO", groups: [{ groupId: "group", conditions: "", risks: [], exams: [{ name: "Audiometria", occasion: "PERIODICO" }] }] };
  assert.equal(programInput.safeParse(input).success, false);
  assert.equal(programInput.safeParse({ ...input, content: { objectives: "Prevenir agravos", responsibilities: "Médico coordenador", procedures: "Exames conforme risco", records: "Arquivo ocupacional", firstAid: "Equipe treinada", campaigns: "Campanha de vacinação" } }).success, true);
});
test("program versions and canonical exposure links remain unique and protected", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE "BudgetUnit" (id TEXT PRIMARY KEY); CREATE TABLE "Person" (id TEXT PRIMARY KEY); CREATE TABLE "SstExposureGroup" (id TEXT PRIMARY KEY);
      INSERT INTO "BudgetUnit" VALUES ('ug'); INSERT INTO "Person" VALUES ('p'); INSERT INTO "SstExposureGroup" VALUES ('g');`);
    await db.exec(readFileSync("prisma/migrations-ibema/20261010180000_add_sst_programs/migration.sql", "utf8"));
    await db.exec(`INSERT INTO "SstOccupationalProgram" (id,"budgetUnitId",code,kind,version,"startsAt","endsAt","responsiblePersonId","responsibleCouncil","responsibleSnapshot",content,"createdById") VALUES ('p1','ug','PGR','PGR',1,'2026-10-01','2027-10-01','p','CREA','{"name":"Responsável","council":"CREA"}','{}','u');
      INSERT INTO "SstProgramExposureGroup" (id,"programId","groupId","groupSnapshot",risks,exams) VALUES ('link','p1','g','{}','[]','[]');`);
    await assert.rejects(db.exec(`DELETE FROM "SstExposureGroup" WHERE id='g'`), /foreign key/);
    await assert.rejects(db.exec(`UPDATE "SstOccupationalProgram" SET version=0 WHERE id='p1'`), /immutable/);
    await assert.rejects(db.exec(`UPDATE "SstProgramExposureGroup" SET risks='[]' WHERE id='link'`), /immutable/);
  } finally { await db.close(); }
});
