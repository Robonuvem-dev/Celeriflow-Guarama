import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { assertMandatoryInspections, calculateCompletionBalance, completionSchema, constructionCurrentPublishedArtifactWhere, validateLifecycleEvidence } from "../src/lib/obras/construction-lifecycle-policy";

test("partial areas retain four-decimal precision and total consumes exact remaining area", () => {
  assert.deepEqual(calculateCompletionBalance("0.3000", ["0.1000"], "0.2000", "TOTAL"), { area: "0.2000", cumulativeArea: "0.3000", remainingArea: "0.0000" });
  assert.equal(calculateCompletionBalance("250.1234", ["100.0001"], "50.0002", "PARTIAL").remainingArea, "100.1231");
  assert.throws(() => calculateCompletionBalance("1", ["0.9999"], "0.0002", "TOTAL"), /exceder/);
  assert.throws(() => calculateCompletionBalance("1", [], "0", "PARTIAL"), /positiva/);
  assert.throws(() => calculateCompletionBalance("1", [], "0.9", "TOTAL"), /exatamente/);
  assert.throws(() => calculateCompletionBalance("1", [], "1", "PARTIAL"), /total/);
});

test("latest pending or failed mandatory inspection blocks conclusion despite earlier approval", () => {
  assert.throws(() => assertMandatoryInspections([], []), /plano/);
  assert.throws(() => assertMandatoryInspections([{ id: "structural" }], []), /vistorias/);
  assert.throws(() => assertMandatoryInspections([{ id: "structural" }], [{ inspectionTypeId: "structural", status: "FAILED" }, { inspectionTypeId: "structural", status: "APPROVED" }]), /vistorias/);
  assert.throws(() => assertMandatoryInspections([{ id: "structural" }, { id: "final" }], [{ inspectionTypeId: "structural", status: "APPROVED" }]), /vistorias/);
  assert.doesNotThrow(() => assertMandatoryInspections([{ id: "structural" }], [{ inspectionTypeId: "structural", status: "APPROVED" }]));
});

test("checklist enforces required criteria, documents and additional fields", () => {
  const definition = { checks: [{ key: "safe", label: "Segurança", required: true }], documents: [{ label: "Laudo", required: true }], fields: [{ key: "date", label: "Data", type: "DATE", required: true, options: [] }] };
  const input = { checks: { safe: true }, documentIds: { Laudo: "ged1" }, fieldValues: { date: "2026-10-10" } };
  assert.equal(validateLifecycleEvidence(definition, input, true).documentIds.Laudo, "ged1");
  assert.throws(() => validateLifecycleEvidence(definition, { ...input, checks: {} }, true), /critérios/);
  assert.throws(() => validateLifecycleEvidence(definition, { ...input, documentIds: {} }, true), /documentos/);
  assert.throws(() => validateLifecycleEvidence(definition, { ...input, fieldValues: { date: "2026-02-30" } }, true), /inválida/);
  assert.throws(() => validateLifecycleEvidence(definition, { ...input, checks: { arbitrary: true } }, true), /previsto/);
  assert.equal(completionSchema.safeParse({ caseId: "c", requestKey: crypto.randomUUID(), kind: "TOTAL", completedAt: "2026-02-30", area: "1", notes: "Teste", ...input }).success, false);
});

test("lifecycle migration persists linked history, unique request keys and exact SQL decimals", async () => {
  const db = new PGlite();
  try {
    await db.exec('CREATE TABLE "ConstructionCase" ("id" TEXT PRIMARY KEY); CREATE TABLE "ConstructionReview" ("id" TEXT PRIMARY KEY); CREATE TABLE "ConstructionCatalogEntry" ("id" TEXT PRIMARY KEY); CREATE TABLE "Document" ("id" TEXT PRIMARY KEY); CREATE TABLE "Process" ("id" TEXT PRIMARY KEY);');
    await db.exec(await readFile(new URL("../prisma/migrations-ibema/20261010240000_construction_lifecycle/migration.sql", import.meta.url), "utf8"));
    await db.exec(`INSERT INTO "ConstructionCase" VALUES ('c'); INSERT INTO "Process" VALUES ('p');
      INSERT INTO "ConstructionCompletion" ("id","caseId","requestKey","number","kind","completedAt","area","cumulativeArea","remainingArea","notes","evidenceSnapshot","debtSnapshot","createdBy") VALUES ('done','c','key','CONC-2026-000001','PARTIAL','2026-10-10',0.1001,0.1001,0.2002,'Conclusão','{}','{}','actor');
      INSERT INTO "ConstructionPropertyUpdate" ("id","completionId","requestKey","processId","proposedSnapshot","createdBy") VALUES ('update','done','update-key','p','[{"builtArea":"0.1001"}]','actor');`);
    const balance = await db.query<{ area: string; remainingArea: string }>('SELECT "area"::text, "remainingArea"::text FROM "ConstructionCompletion"');
    assert.deepEqual(balance.rows[0], { area: "0.1001", remainingArea: "0.2002" });
    await db.exec(`INSERT INTO "ConstructionCatalogEntry" VALUES ('structural');
      INSERT INTO "ConstructionInspection" ("id","caseId","requestKey","inspectionTypeId","sequence","requestedAt","status","requestNotes","definitionSnapshot","requestedBy") VALUES
      ('earlier','c','inspection-1','structural',1,'2026-10-10 12:00:00.000','APPROVED','Teste','{}','staff'),
      ('latest','c','inspection-2','structural',2,'2026-10-10 12:00:00.000','REQUESTED','Nova vistoria','{}','staff');`);
    const inspections = await db.query<{ inspectionTypeId: string; status: string }>('SELECT "inspectionTypeId", "status" FROM "ConstructionInspection" ORDER BY "sequence" DESC');
    assert.throws(() => assertMandatoryInspections([{ id: "structural" }], inspections.rows), /vistorias/);
    await assert.rejects(db.exec(`DELETE FROM "ConstructionCompletion" WHERE "id"='done'`), /foreign key/);
    await assert.rejects(db.exec(`INSERT INTO "ConstructionPropertyUpdate" ("id","completionId","requestKey","processId","proposedSnapshot","createdBy") VALUES ('duplicate','done','second','p','[]','actor')`), /unique/);
    await assert.rejects(db.exec(`UPDATE "ConstructionCompletion" SET "remainingArea"=-0.0001 WHERE "id"='done'`), /check constraint/);
    await assert.rejects(db.exec(`UPDATE "ConstructionCompletion" SET "kind"='TOTAL' WHERE "id"='done'`), /check constraint/);
    await assert.rejects(db.transaction(async (tx) => {
      await tx.exec(`INSERT INTO "ConstructionCompletionSequence" ("year","nextNumber") VALUES (2026,2)`);
      await tx.exec(`UPDATE "ConstructionPropertyUpdate" SET "status"='APPLIED', "afterSnapshot"='[]' WHERE "id"='update'`);
      throw new Error("Falha cadastral exige rollback integral");
    }), /rollback/);
    assert.equal((await db.query('SELECT * FROM "ConstructionCompletionSequence"')).rows.length, 0);
    assert.equal((await db.query<{ status: string }>('SELECT "status" FROM "ConstructionPropertyUpdate"')).rows[0].status, "PENDING");
    await db.exec(`UPDATE "ConstructionPropertyUpdate" SET "status"='APPLIED', "beforeSnapshot"='[{"builtArea":"0.0000"}]', "afterSnapshot"='[{"builtArea":"0.1001"}]', "appliedBy"='cadastro', "appliedAt"=CURRENT_TIMESTAMP WHERE "id"='update'`);
    const history = await db.query<{ status: string; appliedBy: string }>('SELECT "status", "appliedBy" FROM "ConstructionPropertyUpdate"');
    assert.deepEqual(history.rows[0], { status: "APPLIED", appliedBy: "cadastro" });
  } finally { await db.close(); }
});

test("PostgreSQL: F5 publication contract releases current renewals and rejects unsigned, expired and superseded artifacts", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE artifacts (id TEXT PRIMARY KEY, status TEXT NOT NULL, "publishedAt" TIMESTAMP, "validUntil" TIMESTAMP);
      INSERT INTO artifacts VALUES
      ('unsigned','ISSUED',NULL,NULL),
      ('inconsistent','PUBLISHED',NULL,NULL),
      ('expired','PUBLISHED','2026-01-01','2026-10-09'),
      ('original','SUPERSEDED','2026-01-01','2027-01-01'),
      ('renewed','PUBLISHED','2026-10-10 10:00:00','2027-01-01'),
      ('future','PUBLISHED','2026-10-11',NULL),
      ('indefinite','PUBLISHED','2026-10-10 10:00:00',NULL);`);
    const now = new Date("2026-10-10T12:00:00Z");
    const where = constructionCurrentPublishedArtifactWhere(now);
    assert.equal(where.status, "PUBLISHED");
    assert.equal(where.publishedAt.not, null);
    const current = await db.query<{ id: string }>('SELECT id FROM artifacts WHERE status=$1 AND "publishedAt" IS NOT NULL AND "publishedAt" <= $2 AND ("validUntil" IS NULL OR "validUntil" >= $3) ORDER BY id', [where.status, where.publishedAt.lte.toISOString(), where.OR[1].validUntil!.gte.toISOString()]);
    assert.deepEqual(current.rows.map((artifact) => artifact.id), ["indefinite", "renewed"]);
  } finally { await db.close(); }
});
