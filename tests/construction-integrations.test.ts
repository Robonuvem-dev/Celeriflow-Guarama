import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { count, eq } from "drizzle-orm";
import PDFDocument from "pdfkit";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { extractConstructionPlan, extractPdfPages, comparePlanZoning, validateGroundedMeasurements, PLAN_MAX_BYTES } from "../src/lib/obras/construction-extraction";
import { createExportSnapshot, validateExportRecords, verifyExportHash, selectConstructionExportPermit, type ExportRecord } from "../src/lib/obras/construction-export";
import { constructionExportRecords, persistConstructionExport } from "../src/lib/obras/construction-export-service";
import { withDatabaseTransaction } from "../src/db/transaction";
import { Decimal } from "../src/db/decimal";
import { constructionIssuedDocuments } from "../src/db/schema/construction-documents";
import { constructionFederalExports, constructionFederalExportItems, constructionFederalExportReceipts, constructionPlanExtractions } from "../src/db/schema/construction-integrations";
import { constructionPropertyZones, constructionZoneVersions } from "../src/db/schema/construction-viability";
import { documentVersions, documentSignatures } from "../src/db/schema/document-workflow";
import { findConstructionExport, findConstructionExportReceipt, findConstructionPlanExtraction, listConstructionPlanPropertyZones } from "../src/db/repositories/infrastructure/construction-integrations";
import { createLocalDrizzleDatabase } from "./helpers/local-drizzle-database";

async function pdfFixture(text?: string, count = 1) {
  const doc = new PDFDocument({ autoFirstPage: false }); const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => { doc.on("data", (chunk) => chunks.push(chunk)); doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject); });
  for (let i = 0; i < count; i++) { doc.addPage(); if (text) doc.text(text); }
  doc.end(); return done;
}
test("real PDF text is extracted with page, literal evidence and units; demo adapter is explicit", async () => {
  const bytes = await pdfFixture("Area do terreno: 300 m2\nArea construida: 120,5 m2\nAltura: 7 m");
  const result = await extractConstructionPlan(bytes, { provider: "DEMO_RULES" });
  assert.equal(result.engine, "DEMO_RULES"); assert.equal(result.model, "demo-label-parser-v1");
  assert.ok(result.pages[0].text.includes("300")); assert.equal(result.measurements.find((m) => m.field === "landArea")?.value, 300);
  assert.equal(result.measurements.find((m) => m.field === "builtArea")?.value, 120.5);
  assert.ok(result.measurements.every((m) => m.page === 1 && result.pages[0].text.includes(m.evidence)));
  const comparison = comparePlanZoning(result.measurements, { id: "z1", version: 3, legalBasis: "Lei demo", minimumLandArea: "200", maxFloorAreaRatio: "0.3", active: true });
  assert.equal(comparison.status, "DIVERGENCE");
});
test("blank/scanned PDF is unidentifiable without OCR, never fabricated/manual", async () => {
  const result = await extractConstructionPlan(await pdfFixture(), { provider: "DEMO_RULES" });
  assert.equal(result.status, "UNIDENTIFIABLE"); assert.deepEqual(result.measurements, []); assert.ok(result.limitations.some((line) => line.includes("OCR")));
});
test("OCR adapter consumes PDF bytes and returned page text, identifies OCR provenance", async () => {
  const transport: typeof fetch = async (_url, options) => {
    assert.equal(JSON.parse(String(options?.body)).language, "por");
    assert.ok(JSON.parse(String(options?.body)).pdfBase64.startsWith("JVBER"));
    return Response.json({ pages: [{ page: 1, text: "Area do terreno: 250 m2" }] });
  };
  const result = await extractConstructionPlan(await pdfFixture(), { provider: "DEMO_RULES", ocrEndpoint: "https://ocr.example.test" }, transport);
  assert.equal(result.pages[0].method, "OCR"); assert.equal(result.measurements[0].value, 250);
});
test("configurable AI adapter rejects unsupported evidence and missing credential", async () => {
  const bytes = await pdfFixture("Area do terreno: 300 m2");
  await assert.rejects(extractConstructionPlan(bytes, { provider: "OPENAI_COMPATIBLE", endpoint: "https://ai.example.test", model: "model" }), /credencial/);
  const transport: typeof fetch = async () => Response.json({ choices: [{ message: { content: JSON.stringify({ measurements: [{ field: "landArea", value: 300, unit: "m²", page: 1, evidence: "invented 300", confidence: 0.99 }] }) } }] });
  await assert.rejects(extractConstructionPlan(bytes, { provider: "OPENAI_COMPATIBLE", endpoint: "https://ai.example.test", model: "configured-model", apiKey: "test" }, transport), /evidência/);
});
test("numeric hallucination and conflicting measurements cannot yield zoning compliance", () => {
  assert.throws(() => validateGroundedMeasurements([{ field: "landArea", value: 999, unit: "m²", page: 1, evidence: "Area 300 m2", confidence: .9 }], [{ page: 1, text: "Area 300 m2", method: "PDF_TEXT" }]), /numérico/);
  const evidence = [{ field: "landArea" as const, value: 300, unit: "m²" as const, page: 1, evidence: "300 m2", confidence: .9 }, { field: "landArea" as const, value: 400, unit: "m²" as const, page: 2, evidence: "400 m2", confidence: .9 }];
  assert.equal(comparePlanZoning(evidence, { id: "z", version: 1, legalBasis: "Lei", active: true, minimumLandArea: "200", maxFloorAreaRatio: "1" }).status, "INSUFFICIENT_EVIDENCE");
});
test("invalid, oversized and excessive page PDFs fail with limits", async () => {
  await assert.rejects(extractPdfPages(Buffer.from("not PDF")), /não é um PDF/);
  await assert.rejects(extractPdfPages(new Uint8Array(PLAN_MAX_BYTES + 1)), /15 MB/);
  await assert.rejects(extractPdfPages(await pdfFixture(undefined, 41)), /40 páginas/);
});
const record: ExportRecord = { caseId: "c1", protocol: "2026/1", permitId: "issued1", permitNumber: "ALV-1", permitIssuedAt: "2026-10-01T00:00:00Z", permitStatus: "PUBLISHED", ownerDocument: "52998224725", properties: [{ registration: "123", address: "Rua A 1" }], area: "100.0000", startedAt: "2026-10-02" };
test("export snapshots preserve exact download hash and identify municipal demo layout", () => {
  const snapshot = createExportSnapshot([record], { period: "2026-10", version: 1, createdAt: "2026-10-10T00:00:00Z" });
  assert.ok(verifyExportHash(snapshot.payload, snapshot.hashSha256)); assert.ok(!verifyExportHash(snapshot.payload + " ", snapshot.hashSha256));
  assert.equal(JSON.parse(snapshot.payload).demonstration, true);
  const correction = createExportSnapshot([{ ...record, area: "101.0000" }], { period: "2026-10", version: 2, rectifiesId: "old", reason: "Correção área", createdAt: "2026-10-11T00:00:00Z" });
  assert.notEqual(correction.hashSha256, snapshot.hashSha256); assert.equal(JSON.parse(correction.payload).rectifiesId, "old");
});
test("exports reject unissued permits, missing cadastral data, inconsistent dates and period", () => {
  const result = validateExportRecords([{ ...record, permitId: null, permitStatus: "APPROVED", ownerDocument: null, properties: [], startedAt: "2026-09-01" }], "2026-11");
  assert.equal(result.valid, false);
  for (const code of ["NO_ISSUED_PERMIT", "OWNER_DOCUMENT", "PROPERTY", "START_BEFORE_PERMIT", "OUTSIDE_PERIOD"]) assert.ok(result.issues.some((issue) => issue.code === code));
});

const permitFixture = { id: "published1", caseId: "c1", kind: "PERMIT", status: "PUBLISHED", publishedAt: new Date("2026-01-01T10:00:00Z"), validUntil: new Date("2099-12-31T23:59:59Z"), documentId: "doc1", documentVersionId: "version1", hashSha256: "signed-hash", number: "ALV-PUBLISHED-1" };
const signatureFixture = { isRequired: true, status: "SIGNED", documentHash: "signed-hash", documentId: "doc1", documentVersionId: "version1" };
const versionFixture = { id: "version1", documentId: "doc1", status: "SIGNED", hashSha256: "signed-hash", signatures: [signatureFixture] };
test("F5 publication gate accepts current published artifact and excludes issuance, supersession, expiry and future publication", () => {
  const now = new Date("2026-10-10T12:00:00Z");
  assert.equal(selectConstructionExportPermit("c1", [permitFixture], [versionFixture], now)?.id, "published1");
  assert.equal(selectConstructionExportPermit("c1", [{ ...permitFixture, validUntil: null }], [versionFixture], now)?.id, "published1");
  for (const invalid of [
    { ...permitFixture, status: "ISSUED" },
    { ...permitFixture, status: "SUPERSEDED" },
    { ...permitFixture, publishedAt: null },
    { ...permitFixture, publishedAt: new Date("2026-10-11T00:00:00Z") },
    { ...permitFixture, validUntil: new Date("2026-10-10T11:59:59Z") },
    { ...permitFixture, kind: "VIABILITY" },
    { ...permitFixture, caseId: "other-case" },
  ]) assert.equal(selectConstructionExportPermit("c1", [invalid], [versionFixture], now), null);
  const renewed = { ...permitFixture, id: "renewed", publishedAt: new Date("2026-02-01T10:00:00Z") };
  assert.equal(selectConstructionExportPermit("c1", [{ ...permitFixture, status: "SUPERSEDED" }, renewed], [versionFixture], now)?.id, "renewed");
  assert.equal(validateExportRecords([{ ...record, permitStatus: "ISSUED" }], "2026-10").valid, false);
  assert.equal(validateExportRecords([{ ...record, permitStatus: "SUPERSEDED" }], "2026-10").valid, false);
  assert.equal(validateExportRecords([record], "2026-10").valid, true);
});
test("publication gate requires matching signed GED version and every mandatory signature, without demanding optional ones", () => {
  const now = new Date("2026-10-10T12:00:00Z");
  for (const invalid of [
    { ...versionFixture, id: "different-version" },
    { ...versionFixture, documentId: "different-document" },
    { ...versionFixture, status: "FINAL" },
    { ...versionFixture, hashSha256: "modified" },
    { ...versionFixture, signatures: [] },
    { ...versionFixture, signatures: [{ ...signatureFixture, isRequired: false }] },
    { ...versionFixture, signatures: [signatureFixture, { ...signatureFixture, status: "PENDING" }] },
    { ...versionFixture, signatures: [{ ...signatureFixture, documentHash: "stale" }] },
    { ...versionFixture, signatures: [{ ...signatureFixture, documentVersionId: "stale-version" }] },
    { ...versionFixture, signatures: [{ ...signatureFixture, documentId: "wrong-document" }] },
  ]) assert.equal(selectConstructionExportPermit("c1", [permitFixture], [invalid], now), null);
  assert.equal(selectConstructionExportPermit("c1", [permitFixture], [{ ...versionFixture, signatures: [signatureFixture, { ...signatureFixture, isRequired: false, status: "PENDING" }] }], now)?.id, "published1");
});
test("export service preserves publication evidence, exact scalars, scoped downloads, replay, rectification and atomic rollback", async () => {
  const fixture = await createLocalDrizzleDatabase();
  const db = fixture.connection.db, pg = fixture.database;
  const access = { administrator: false, departmentId: "department", employeeId: "employee", roles: ["MANAGER"] };
  const admin = { administrator: true, departmentId: null, employeeId: null, roles: [] };
  try {
    // Explicit projections of cross-domain physical tables. Domain tables below
    // use their installed SQL, including FK/check/append-only constraints.
    await pg.exec(`CREATE TABLE "Process" (id TEXT PRIMARY KEY, "protocolNumber" TEXT, "personId" TEXT, "companyId" TEXT, "currentDepartmentId" TEXT);
      CREATE TABLE "Person" (id TEXT PRIMARY KEY, cpf TEXT);
      CREATE TABLE "Company" (id TEXT PRIMARY KEY, cnpj TEXT);
      CREATE TABLE "Document" (id TEXT PRIMARY KEY);
      CREATE TABLE "ConstructionPortalIdentity" (id TEXT PRIMARY KEY);
      CREATE TABLE "ConstructionCase" (id TEXT PRIMARY KEY, "processId" TEXT, "totalArea" NUMERIC(14,4));
      CREATE TABLE "ConstructionCaseProperty" (id TEXT PRIMARY KEY, "caseId" TEXT, "realEstateId" TEXT);
      CREATE TABLE "RealEstate" (id TEXT PRIMARY KEY, "municipalInsc" TEXT, "streetName" TEXT, number TEXT, "landArea" DOUBLE PRECISION);`);
    const baseline = await readFile(new URL("../prisma/migrations-ibema/20261009232000_baseline/migration.sql", import.meta.url), "utf8");
    const lifecycle = await readFile(new URL("../prisma/migrations-ibema/20261010240000_construction_lifecycle/migration.sql", import.meta.url), "utf8");
    const zoning = await readFile(new URL("../prisma/migrations-ibema/20261010170000_construction_rules_profiles/migration.sql", import.meta.url), "utf8");
    const tableDDL = (source: string, table: string) => {
      const start = source.indexOf(`CREATE TABLE "${table}" (`);
      assert.ok(start >= 0, `DDL histórico ausente: ${table}`);
      const end = source.indexOf(");", start);
      assert.ok(end > start);
      return source.slice(start, end + 2);
    };
    await pg.exec(tableDDL(baseline, "DocumentVersion"));
    await pg.exec(tableDDL(baseline, "DocumentSignature"));
    await pg.exec(tableDDL(lifecycle, "ConstructionLifecycleStart"));
    await pg.exec(tableDDL(zoning, "ConstructionZoneVersion"));
    await pg.exec(tableDDL(zoning, "ConstructionPropertyZone"));
    await pg.exec(await readFile(new URL("../prisma/migrations-ibema/20261010230000_construction_documents/migration.sql", import.meta.url), "utf8"));
    await pg.exec(await readFile(new URL("../prisma/migrations-ibema/20261010260000_construction_export_extraction/migration.sql", import.meta.url), "utf8"));
    await pg.exec(`INSERT INTO "Person" VALUES ('person','52998224725');
      INSERT INTO "Process" VALUES ('process','2026/1','person',NULL,'department');
      INSERT INTO "ConstructionCase" VALUES ('c1','process',100.0001);
      INSERT INTO "RealEstate" VALUES ('property','123','Rua A','1',300), ('unzoned','456','Rua B',NULL,NULL);
      INSERT INTO "ConstructionCaseProperty" VALUES ('link','c1','property');
      INSERT INTO "ConstructionLifecycleStart" (id,"caseId","requestKey","startedAt",notes,"evidenceSnapshot","createdBy") VALUES ('start','c1','start-key','2026-01-02','Início','{}','actor');
      INSERT INTO "ConstructionDocumentTemplateVersion" (id,kind,version,title,body,stamp,"signaturePolicy","createdBy") VALUES ('template','PERMIT',1,'Alvará','Corpo','Carimbo','INTERNAL_ALLOWED','actor');
      INSERT INTO "Document" VALUES ('doc1');`);
    await db.insert(documentVersions).values({ id: versionFixture.id, documentId: versionFixture.documentId, status: versionFixture.status, hashSha256: versionFixture.hashSha256, versionNumber: 1, fileUrl: "blob" });
    await db.insert(documentSignatures).values({ id: "signature", ...signatureFixture, signerUsuarioId: "signer", signerName: "Gestor", signerEmail: "signer@example.invalid", authenticationMethod: "PASSWORD_REAUTHENTICATED", verificationCode: "signature-code" });
    await db.insert(constructionIssuedDocuments).values({ ...permitFixture, requestKey: randomUUID(), processId: "process", year: 2026, sequence: 1, templateVersionId: "template", templateSnapshot: {}, fileUrl: "blob", backupPath: "backup", validationCode: "permit-code", createdBy: "actor" });
    const rows = await constructionExportRecords(db, access, ["c1"]);
    assert.equal(rows[0].permitStatus, "PUBLISHED"); assert.equal(rows[0].permitDocumentVersionId, "version1"); assert.equal(rows[0].permitHashSha256, "signed-hash"); assert.equal(rows[0].permitValidUntil, permitFixture.validUntil.toISOString());
    assert.equal(rows[0].area, "100.0001"); assert.equal(rows[0].startedAt, "2026-01-02"); assert.deepEqual(rows[0].properties, [{ registration: "123", address: "Rua A, 1" }]);
    await assert.rejects(constructionExportRecords(db, { ...access, departmentId: "other" }, ["c1"]), /indisponíveis/);
    await assert.rejects(constructionExportRecords(db, { ...access, roles: [] }, ["c1"]), /indisponíveis/);
    await db.update(documentSignatures).set({ documentHash: "stale" }).where(eq(documentSignatures.id, "signature"));
    assert.equal((await constructionExportRecords(db, access, ["c1"]))[0].permitId, null);
    await db.update(documentSignatures).set({ documentHash: "signed-hash" }).where(eq(documentSignatures.id, "signature"));
    for (const status of ["ISSUED", "SUPERSEDED"]) {
      await db.update(constructionIssuedDocuments).set({ status }).where(eq(constructionIssuedDocuments.id, "published1"));
      assert.equal((await constructionExportRecords(db, access, ["c1"]))[0].permitId, null);
    }
    await db.update(constructionIssuedDocuments).set({ status: "PUBLISHED", validUntil: new Date("2020-01-01T00:00:00Z") }).where(eq(constructionIssuedDocuments.id, "published1"));
    assert.equal((await constructionExportRecords(db, access, ["c1"]))[0].permitId, null);
    await db.update(constructionIssuedDocuments).set({ validUntil: null, publishedAt: new Date("2099-01-01T00:00:00Z") }).where(eq(constructionIssuedDocuments.id, "published1"));
    assert.equal((await constructionExportRecords(db, access, ["c1"]))[0].permitId, null);
    await db.update(constructionIssuedDocuments).set({ validUntil: permitFixture.validUntil, publishedAt: permitFixture.publishedAt }).where(eq(constructionIssuedDocuments.id, "published1"));
    const input = { requestKey: randomUUID(), caseIds: ["c1"], period: "2026-01" };
    const save = (raw: unknown, actor = "actor") => withDatabaseTransaction(fixture.connection, tx => persistConstructionExport(tx, access, actor, raw));
    const saved = await save(input);
    assert.ok(saved.createdAt instanceof Date); assert.equal(saved.version, 1);
    assert.equal((await save(input)).id, saved.id);
    await assert.rejects(save(input, "other-actor"), /indisponível/);
    assert.equal((await db.select({ total: count() }).from(constructionFederalExportItems))[0].total, 1);
    assert.equal(saved.validationSnapshot && JSON.parse(saved.payload).records[0].area, "100.0001");
    assert.ok(verifyExportHash(saved.payload, saved.hashSha256));
    await assert.rejects(save({ ...input, requestKey: randomUUID() }), /Use retificação/);
    const corrected = await save({ ...input, requestKey: randomUUID(), rectifiesId: saved.id, reason: "Retificação motivada do lote" });
    assert.equal(corrected.version, 2); assert.equal(corrected.rectifiesId, saved.id);
    await assert.rejects(save({ ...input, requestKey: randomUUID(), rectifiesId: saved.id, reason: "Referência ultrapassada" }), /mais recente/);
    await pg.exec(`CREATE FUNCTION reject_export_item() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'export item rejected'; END $$;
      CREATE TRIGGER reject_export_item BEFORE INSERT ON "ConstructionFederalExportItem" FOR EACH ROW EXECUTE FUNCTION reject_export_item();`);
    await assert.rejects(save({ ...input, requestKey: randomUUID(), rectifiesId: corrected.id, reason: "Falha posterior preserva histórico" }));
    assert.equal((await db.select({ total: count() }).from(constructionFederalExports))[0].total, 2);
    assert.equal((await db.select({ total: count() }).from(constructionFederalExportItems))[0].total, 2);
    await pg.exec(`DROP TRIGGER reject_export_item ON "ConstructionFederalExportItem"`);
    const [receipt] = await db.insert(constructionFederalExportReceipts).values({ exportId: saved.id, protocol: "manual-1", destination: "Destino municipal", submittedAt: new Date("2026-01-03T00:30:00.123Z"), evidenceUrl: "blob", evidenceHash: "hash", notes: "Comprovante manual", createdBy: "actor" }).returning();
    assert.equal((await findConstructionExportReceipt(db, access, saved.id, receipt.id))?.submittedAt.toISOString(), "2026-01-03T00:30:00.123Z");
    assert.equal(await findConstructionExportReceipt(db, access, corrected.id, receipt.id), null);
    assert.equal((await findConstructionExport(db, access, saved.id))?.payload, saved.payload);
    await assert.rejects(async () => { await db.insert(constructionFederalExportReceipts).values({ ...receipt, id: randomUUID() }); });
    const [extraction] = await db.insert(constructionPlanExtractions).values({ caseId: "c1", requestKey: randomUUID(), filename: "prancha.pdf", sourceUrl: "blob", sourceHash: "hash", engine: "DEMO_RULES", model: "demo", status: "UNIDENTIFIABLE", pages: [], measurements: [], comparison: {}, limitations: ["OCR ausente"], createdBy: "actor" }).returning();
    assert.deepEqual((await findConstructionPlanExtraction(db, access, extraction.id))?.limitations, ["OCR ausente"]);
    assert.equal(await findConstructionPlanExtraction(db, { ...access, roles: [] }, extraction.id), null);
    for (const department of ["other", null]) {
      await pg.query(`UPDATE "Process" SET "currentDepartmentId"=$1`, [department]);
      assert.equal(await findConstructionExport(db, access, saved.id), null);
      assert.equal(await findConstructionExportReceipt(db, access, saved.id, receipt.id), null);
      assert.equal(await findConstructionPlanExtraction(db, access, extraction.id), null);
      assert.ok(await findConstructionExport(db, admin, saved.id));
      assert.ok(await findConstructionPlanExtraction(db, admin, extraction.id));
    }
    await pg.exec(`UPDATE "Process" SET "currentDepartmentId"='department'`);
    const [empty] = await db.insert(constructionFederalExports).values({ requestKey: randomUUID(), scope: "department", period: "2026-02", version: 1, payload: "empty historical batch", hashSha256: "hash", validationSnapshot: {}, createdBy: "actor" }).returning();
    assert.ok(await findConstructionExport(db, { ...access, roles: [] }, empty.id), "autorização universal do lote vazio mantém semântica original");
    assert.equal(await findConstructionExport(db, { ...access, departmentId: "other" }, empty.id), null);
    await db.insert(constructionZoneVersions).values({ id: "zone", code: "ZONE", version: 1, name: "Zona", legalBasis: "Lei de teste", startsAt: new Date("2026-01-01T00:00:00Z"), endsAt: null, allowedPurposeIds: [], allowedCategories: ["BUILDING"], minimumLandArea: new Decimal("9999999999.9999"), maxFloorAreaRatio: new Decimal("1.2345"), automatic: true, publishedBy: "actor" });
    await db.insert(constructionPropertyZones).values({ realEstateId: "property", zoneId: "zone" });
    await pg.exec(`INSERT INTO "ConstructionCaseProperty" VALUES ('unzoned-link','c1','unzoned')`);
    const zones = await listConstructionPlanPropertyZones(db, "c1");
    const zone = zones.find(item => item.realEstateId === "property")?.zone;
    assert.equal(zone?.minimumLandArea.toFixed(4), "9999999999.9999"); assert.equal(zone?.startsAt.toISOString(), "2026-01-01T00:00:00.000Z"); assert.equal(zone?.endsAt, null);
    assert.equal(zones.find(item => item.realEstateId === "unzoned")?.zone, null);
    assert.equal((await findConstructionExport(db, access, saved.id))?.payload, saved.payload, "retificação não regrava bytes anteriores");
  } finally { await fixture.close(); }
});

test("database enforces append-only export bytes, receipts, items and extraction evidence", async () => {
  const db = new PGlite();
  try {
    await db.exec('CREATE TABLE "ConstructionCase" ("id" TEXT PRIMARY KEY); INSERT INTO "ConstructionCase" VALUES (\'case1\');');
    await db.exec(await readFile(new URL("../prisma/migrations-ibema/20261010260000_construction_export_extraction/migration.sql", import.meta.url), "utf8"));
    await db.exec(`INSERT INTO "ConstructionFederalExport" ("id","requestKey","scope","period","version","payload","hashSha256","validationSnapshot","createdBy") VALUES ('e1','k1','GLOBAL','2026-10',1,'original bytes','hash','{}','actor');`);
    await db.exec(`INSERT INTO "ConstructionFederalExportItem" ("id","exportId","caseId") VALUES ('item1','e1','case1');`);
    await db.exec(`INSERT INTO "ConstructionFederalExportReceipt" ("id","exportId","protocol","destination","submittedAt","evidenceUrl","evidenceHash","notes","createdBy") VALUES ('r1','e1','p1','demo','2026-10-10','blob','hash','manual demo','actor');`);
    await db.exec(`INSERT INTO "ConstructionPlanExtraction" ("id","caseId","requestKey","filename","sourceUrl","sourceHash","engine","model","status","pages","measurements","comparison","limitations","createdBy") VALUES ('x1','case1','kx','plan.pdf','blob','hash','DEMO_RULES','demo','UNIDENTIFIABLE','[]','[]','{}','[]','actor');`);
    for (const table of ["ConstructionFederalExport", "ConstructionFederalExportItem", "ConstructionFederalExportReceipt", "ConstructionPlanExtraction"]) {
      await assert.rejects(db.exec(`DELETE FROM "${table}"`), /immutable/);
      await assert.rejects(db.exec(`UPDATE "${table}" SET "id"='tampered'`), /immutable/);
    }
    const bytes = await db.query<{ payload: string }>('SELECT "payload" FROM "ConstructionFederalExport"'); assert.equal(bytes.rows[0].payload, "original bytes");
  } finally { await db.close(); }
});
