import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { count, eq } from "drizzle-orm";
import { Decimal } from "../src/db/decimal";
import { constructionCases, constructionCatalogEntries, constructionReviews } from "../src/db/schema/construction-core";
import { constructionCompletions, constructionCompletionSequences, constructionInspectionPlans, constructionInspections, constructionPropertyUpdates } from "../src/db/schema/construction-lifecycle";
import { constructionDefinitionVersions } from "../src/db/schema/construction-viability";
import { constructionDocumentTemplateVersions, constructionIssuedDocuments } from "../src/db/schema/construction-documents";
import { constructionServiceRequests } from "../src/db/schema/construction-portal";
import { realEstates } from "../src/db/schema/registry";
import { processes, processTypes, processSubjects, processEvents, processSequences } from "../src/db/schema/processes";
import { completeConstructionLifecycle, startConstructionLifecycle, requestConstructionInspection, recordConstructionInspection, openConstructionPropertyUpdate, applyConstructionPropertyUpdate } from "../src/lib/obras/construction-lifecycle";
import { createConstructionTaxationFixture } from "./helpers/construction-taxation-fixture";
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

test("Drizzle: início, vistoria, conclusões parciais/exata e atualização cadastral preservam ACL, replay e rollback", async () => {
  const f = await createConstructionTaxationFixture();
  const db = f.db, pg = f.database;
  const access = { administrator: false, employeeId: "manager", departmentId: "sector", roles: ["MANAGER"] };
  const today = new Date().toISOString().slice(0, 10);
  const emptyDefinition = { fields: [], checks: [], documents: [] };
  const evidence = { checks: {}, documentIds: {}, fieldValues: {} };
  try {
    await db.update(constructionCases).set({ totalArea: new Decimal("0.3000"), expandedArea: new Decimal("0.3000") }).where(eq(constructionCases.id, "case"));
    await db.insert(constructionCatalogEntries).values({ id: "final", kind: "INSPECTION_TYPE", name: "Vistoria final" });
    await db.insert(constructionReviews).values({ id: "review", caseId: "case", requestKey: crypto.randomUUID(), revision: 0, reviewType: "PROJECT", decision: "APPROVED", notes: "Deferimento", definitionSnapshot: {}, evidenceSnapshot: {}, createdBy: "manager-user" });
    await db.insert(constructionInspectionPlans).values({ caseId: "case", requestKey: crypto.randomUUID(), reviewId: "review", inspectionTypes: [{ id: "final" }], definitionSnapshot: { definition: emptyDefinition }, createdBy: "manager-user" });
    await db.insert(constructionDocumentTemplateVersions).values({ id: "template", kind: "PERMIT", version: 1, title: "Alvará", body: "Alvará", stamp: "Municipal", signaturePolicy: "INTERNAL_ALLOWED", createdBy: "manager-user" });
    await db.insert(constructionIssuedDocuments).values({ id: "permit", requestKey: crypto.randomUUID(), caseId: "case", processId: "process", kind: "PERMIT", year: 2026, sequence: 1, number: "PERMIT-TEST", templateVersionId: "template", templateSnapshot: {}, documentId: "current-project", documentVersionId: "ged-version", fileUrl: "/project.pdf", hashSha256: "a".repeat(64), backupPath: "/backup.pdf", validationCode: "fixture", status: "ISSUED", createdBy: "manager-user" });
    await db.insert(constructionServiceRequests).values({ id: "start-request", caseId: "case", identityId: "identity", requestKey: crypto.randomUUID(), kind: "START", revision: 0, notes: "Solicito início", payload: {}, evidenceSnapshot: {} });
    const startInput = { caseId: "case", requestKey: crypto.randomUUID(), startedAt: today, notes: "Início documentado", documentIds: ["current-project"], serviceRequestId: "start-request" };
    const start = (scope = access) => f.transaction(tx => startConstructionLifecycle(tx, scope, "manager-user", startInput));
    await assert.rejects(start({ ...access, departmentId: "other" }), /setor/);
    await assert.rejects(start(), /alvará vigente/);
    await db.update(constructionIssuedDocuments).set({ status: "PUBLISHED", publishedAt: new Date(`${today}T00:00:00Z`) }).where(eq(constructionIssuedDocuments.id, "permit"));
    await assert.rejects(start(), /Taxa SUBDIVISION/);
    await f.fee("SUBDIVISION", { exemptionReason: "Isenção fundamentada para o parcelamento" });
    const startId = await start(); assert.equal(await start(), startId);
    assert.equal((await db.select().from(constructionServiceRequests).where(eq(constructionServiceRequests.id, "start-request")))[0].status, "ACCEPTED");
    const inspectionInput = { caseId: "case", requestKey: crypto.randomUUID(), inspectionTypeId: "final", scheduledAt: today, notes: "Vistoria final" };
    const inspectionId = await f.transaction(tx => requestConstructionInspection(tx, access, "manager-user", inspectionInput));
    assert.equal(await f.transaction(tx => requestConstructionInspection(tx, access, "manager-user", inspectionInput)), inspectionId);
    await assert.rejects(f.transaction(tx => requestConstructionInspection(tx, access, "manager-user", { ...inspectionInput, requestKey: crypto.randomUUID() })), /pedido pendente/);
    const result = { caseId: "case", inspectionId, requestKey: crypto.randomUUID(), inspectedAt: today, decision: "APPROVED", notes: "Vistoria aprovada", ...evidence };
    await assert.rejects(f.transaction(tx => recordConstructionInspection(tx, access, "manager-user", result)), /Taxa INSPECTION/);
    assert.equal((await db.select().from(constructionInspections).where(eq(constructionInspections.id, inspectionId)))[0].status, "REQUESTED");
    await f.fee("INSPECTION", { exemptionReason: "Isenção fundamentada de vistoria" });
    await f.transaction(tx => recordConstructionInspection(tx, access, "manager-user", result));
    await db.insert(constructionDefinitionVersions).values({ kind: "COMPLETION", version: 1, definition: emptyDefinition, publishedBy: "manager-user" });
    const partialInput = { caseId: "case", requestKey: crypto.randomUUID(), kind: "PARTIAL", completedAt: today, area: "0.1000", notes: "Entrega parcial", ...evidence };
    const complete = (input: unknown = partialInput) => f.transaction(tx => completeConstructionLifecycle(tx, access, "manager-user", input));
    await pg.exec(`CREATE FUNCTION reject_completion_history() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'history rejected'; END $$; CREATE TRIGGER reject_completion_history BEFORE INSERT ON "ProcessEvent" FOR EACH ROW EXECUTE FUNCTION reject_completion_history()`);
    await assert.rejects(complete());
    assert.equal((await db.select({ total: count() }).from(constructionCompletions))[0].total, 0);
    assert.equal((await db.select({ total: count() }).from(constructionCompletionSequences))[0].total, 0);
    await pg.exec(`DROP TRIGGER reject_completion_history ON "ProcessEvent"`);
    const partialId = await complete(); assert.equal(await complete(), partialId);
    const totalId = await complete({ ...partialInput, requestKey: crypto.randomUUID(), kind: "TOTAL", area: "0.2000" });
    const [total] = await db.select().from(constructionCompletions).where(eq(constructionCompletions.id, totalId));
    assert.equal(total.area.toFixed(4), "0.2000"); assert.equal(total.cumulativeArea.toFixed(4), "0.3000"); assert.equal(total.remainingArea.toFixed(4), "0.0000");
    assert.ok(total.completedAt instanceof Date); assert.equal(total.completedAt.toISOString(), `${today}T00:00:00.000Z`);
    await assert.rejects(f.transaction(tx => requestConstructionInspection(tx, access, "manager-user", { ...inspectionInput, requestKey: crypto.randomUUID() })), /concluída integralmente/);
    await db.insert(processTypes).values({ id: "cadaster-type", name: "Atualização cadastral", initialDepartmentId: "sector" });
    await db.insert(processSubjects).values({ id: "cadaster-subject", name: "Área e uso", processTypeId: "cadaster-type" });
    const updateInput = { caseId: "case", completionId: totalId, requestKey: crypto.randomUUID(), processTypeId: "cadaster-type", subjectId: "cadaster-subject", changes: [{ realEstateId: "property", expectedBuiltArea: "0", builtArea: "0.3000", propertyUse: "Residencial" }] };
    await pg.exec(`CREATE FUNCTION reject_property_link() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."eventType"='CONSTRUCTION_LINKED_PROCESS' THEN RAISE EXCEPTION 'link rejected'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_property_link BEFORE INSERT ON "ProcessEvent" FOR EACH ROW EXECUTE FUNCTION reject_property_link()`);
    const openUpdate = () => f.transaction(tx => openConstructionPropertyUpdate(tx, access, "manager-user", updateInput));
    await assert.rejects(openUpdate());
    assert.equal((await db.select({ total: count() }).from(processes))[0].total, 1);
    assert.equal((await db.select({ total: count() }).from(processSequences))[0].total, 0);
    await pg.exec(`DROP TRIGGER reject_property_link ON "ProcessEvent"`);
    const updateId = await openUpdate(); assert.equal(await openUpdate(), updateId);
    const [update] = await db.select().from(constructionPropertyUpdates).where(eq(constructionPropertyUpdates.id, updateId));
    const apply = (scope = access) => f.transaction(tx => applyConstructionPropertyUpdate(tx, scope, "manager-user", updateId));
    await assert.rejects(apply(), /Receba e mantenha/);
    await db.update(processes).set({ status: "Em Análise" }).where(eq(processes.id, update.processId));
    await assert.rejects(apply({ ...access, departmentId: "other" }), /setor responsável/);
    await db.update(realEstates).set({ builtArea: 1 }).where(eq(realEstates.id, "property"));
    await assert.rejects(apply(), /mudou desde a proposta/);
    await db.update(realEstates).set({ builtArea: 0 }).where(eq(realEstates.id, "property"));
    await apply(); await apply();
    const [applied] = await db.select().from(constructionPropertyUpdates).where(eq(constructionPropertyUpdates.id, updateId));
    assert.equal(applied.status, "APPLIED"); assert.ok(applied.appliedAt instanceof Date);
    assert.deepEqual(applied.beforeSnapshot, [{ id: "property", builtArea: "0.0000", propertyUse: null }]);
    assert.deepEqual(applied.afterSnapshot, [{ id: "property", builtArea: "0.3000", propertyUse: "Residencial" }]);
    assert.equal((await db.select({ total: count() }).from(processEvents).where(eq(processEvents.eventType, "CONSTRUCTION_PROPERTY_UPDATED")))[0].total, 1);
  } finally { await f.close(); }
});
