import test from "node:test";
import assert from "node:assert/strict";
import PDFDocument from "pdfkit";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { extractConstructionPlan, extractPdfPages, comparePlanZoning, validateGroundedMeasurements, PLAN_MAX_BYTES } from "../src/lib/obras/construction-extraction";
import { createExportSnapshot, validateExportRecords, verifyExportHash, selectConstructionExportPermit, type ExportRecord } from "../src/lib/obras/construction-export";
import { constructionExportRecords } from "../src/lib/obras/construction-export-service";
import { Prisma } from "@prisma/client";

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
test("export service uses F5 PUBLISHED/validity query and produces a valid downloadable snapshot from actual publication evidence", async () => {
  const tx = {
    constructionCase: { findMany: async () => [{ id: "c1", totalArea: new Prisma.Decimal("100"), process: { protocolNumber: "2026/1", person: { cpf: record.ownerDocument }, company: null }, properties: [{ realEstate: { municipalInsc: "123", streetName: "Rua A", number: "1" } }], lifecycleStart: null }] },
    constructionIssuedDocument: { findMany: async (query: { where: { status: string; publishedAt: { not: null; lte: Date }; OR: unknown[] }; orderBy: { publishedAt: string } }) => {
      assert.equal(query.where.status, "PUBLISHED"); assert.equal(query.where.publishedAt.not, null); assert.ok(query.where.publishedAt.lte instanceof Date); assert.deepEqual(query.where.OR, [{ validUntil: null }, { validUntil: { gte: query.where.publishedAt.lte } }]); assert.equal(query.orderBy.publishedAt, "desc");
      return [permitFixture];
    } },
    documentVersion: { findMany: async (query: { where: { status: string; id: { in: string[] } }; include: { signatures: boolean } }) => {
      assert.equal(query.where.status, "SIGNED"); assert.deepEqual(query.where.id.in, ["version1"]); assert.equal(query.include.signatures, true); return [versionFixture];
    } },
  } as unknown as Prisma.TransactionClient;
  const rows = await constructionExportRecords(tx, { administrator: true, departmentId: null, employeeId: null, roles: [] }, ["c1"]);
  assert.equal(rows[0].permitStatus, "PUBLISHED"); assert.equal(rows[0].permitDocumentVersionId, "version1"); assert.equal(rows[0].permitHashSha256, "signed-hash"); assert.equal(rows[0].permitValidUntil, permitFixture.validUntil.toISOString());
  const snapshot = createExportSnapshot(rows, { period: "2026-01", version: 1, createdAt: "2026-10-10T00:00:00Z" });
  assert.equal(snapshot.validation.valid, true); assert.ok(verifyExportHash(snapshot.payload, snapshot.hashSha256)); assert.equal(JSON.parse(snapshot.payload).records[0].permitId, "published1");
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
