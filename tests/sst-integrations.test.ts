import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import type { AppContext } from "../src/lib/platform/tenant-context";
import { configureEsocial, prepareEsocial, readEsocialEvent, listEsocialEvents, transmitEsocial } from "../src/lib/sst/esocial-service";
import { exchangeVerified, verifyExchangeResponse, hashArtifact, hashSource, configurationInput, type EsocialTransport, type SourceEnvelope, type SubmissionBinding, type VerifiedResponse } from "../src/lib/sst/esocial-contract";
import { missingPeriods } from "../src/lib/sst/closure-policy";
import { functionalSstReport, portalPppReport } from "../src/lib/sst/closure-service";
import { catLayoutProvenance } from "../src/lib/sst/accident-layout-policy";

const source: SourceEnvelope = { kind: "S2220", sourceId: "aso", sourceVersion: "v1", sourceHash: hashArtifact("source"), budgetUnitId: "ug", employeeId: "employee", data: {}, missing: [] };
const binding: SubmissionBinding = { ...source, eventId: "event", environment: "RESTRICTED", layout: "S-1.3", credentialReference: "EXTERNAL_A1", employerRegistration: "12345678" };
// A contract test double is deliberately local to tests; it is never resolved
// by the UI or registered as a real provider, and is not homologation evidence.
function contractDouble(overrides: Partial<VerifiedResponse> = {}): EsocialTransport {
  const xml = '<test-fixture Id="event"/>';
  return { mode: "REAL", buildAndSign: async () => ({ xml, xmlHash: hashArtifact(xml), eventXmlId: "event", certificateFingerprint: "test-only" }), validateSignedXml: async () => {},
    send: async () => ({ bytes: "contract-test-response", endpoint: "https://test.invalid", receivedAt: new Date("2026-10-01T10:00:00Z"), correlationId: "test" }),
    consult: async () => { throw new Error("not used"); },
    verifyResponse: async (_response, signed) => ({ environment: "RESTRICTED", eventXmlId: signed.eventXmlId, xmlHash: signed.xmlHash, protocol: "test-protocol", receipt: "test-receipt", processedAt: new Date("2026-10-01T09:59:59Z"), outcome: "ACCEPTED", rejectionCodes: [], ...overrides }) };
}
test("XML validation is fail closed; MOCK, incomplete sources and fake signatures never reach send", async () => {
  await assert.rejects(exchangeVerified(source, binding), /indisponíveis/);
  await assert.rejects(exchangeVerified(source, binding, { mode: "MOCK" } as unknown as EsocialTransport), /indisponíveis/);
  await assert.rejects(exchangeVerified({ ...source, missing: ["Tabela 27"] }, binding, contractDouble()), /incompleta/);
  let sends = 0;
  const transport = contractDouble();
  transport.validateSignedXml = async () => { throw new Error("invalid XMLDSig reference/signature"); };
  transport.send = async () => { sends++; throw new Error("must not send"); };
  await assert.rejects(exchangeVerified(source, binding, transport), /XMLDSig/);
  assert.equal(sends, 0);
});
test("acceptance requires event-bound provenance, correct environment, official receipt and timestamp", async () => {
  for (const override of [{ environment: "PRODUCTION" as const }, { eventXmlId: "other" }, { xmlHash: hashArtifact("other") }, { receipt: null }, { processedAt: new Date("2027-01-01") }, { rejectionCodes: ["123"] }]) await assert.rejects(exchangeVerified(source, binding, contractDouble(override)));
  const transport = contractDouble();
  transport.verifyResponse = async () => ({ statusAccepted: true }) as unknown as VerifiedResponse;
  await assert.rejects(exchangeVerified(source, binding, transport));
  const signed = await contractDouble().buildAndSign(source, binding);
  const response = await contractDouble().send(signed, binding);
  await assert.rejects(verifyExchangeResponse(contractDouble(), response, signed, binding, "different-protocol"), /protocolo/);
  await assert.rejects(verifyExchangeResponse(contractDouble(), { ...response, endpoint: "http://test.invalid" }, signed, binding), /proveniência/);
});
test("PPP coverage preserves missing intervals instead of inventing current historical risks", () => {
  const date = (value: string) => new Date(value);
  assert.deepEqual(missingPeriods(date("2026-01-01"), date("2026-05-01"), [{ startsAt: date("2026-02-01"), endsAt: date("2026-03-01") }, { startsAt: date("2026-02-15"), endsAt: date("2026-04-01") }]).map(value => [value.startsAt.toISOString().slice(0,10), value.endsAt.toISOString().slice(0,10)]), [["2026-01-01","2026-02-01"],["2026-04-01","2026-05-01"]]);
  assert.equal(configurationInput.safeParse({ budgetUnitId: "ug", environment: "RESTRICTED", employerRegistration: "12345678", credentialReference: "-----BEGIN PRIVATE KEY-----", providerReference: "EXTERNAL", submissionKey: crypto.randomUUID() }).success, false);
});

const user: AppContext["user"] = { id: "actor", name: "Test", email: "test@example.invalid", firebaseUid: "actor", role: "ADMIN", profileCode: "SYSTEM_ADMINISTRATOR", permissions: "{}", modulePermissions: [], allowedBudgetUnitIds: [], employeeId: "employee", departmentId: null, secretariatId: null };
test("isolated PostgreSQL workflow: preparation retry, source provenance, environment separation, ACL and blocked transmission", { timeout: 60000 }, async () => {
  const db = new PGlite(); const server = new PGLiteSocketServer({ db, port: 0, host: "127.0.0.1" }); let prisma: PrismaClient | undefined;
  try {
    await db.exec(`CREATE TABLE "BudgetUnit" (id TEXT PRIMARY KEY,name TEXT); INSERT INTO "BudgetUnit" VALUES ('ug','UG'),('other','Other');
      CREATE TABLE "Employee" (id TEXT PRIMARY KEY); INSERT INTO "Employee" VALUES ('employee');
      CREATE TABLE "AuditEvent" (id TEXT PRIMARY KEY,"actorUsuarioId" TEXT,"eventType" TEXT,"targetType" TEXT,"targetId" TEXT,"metadata" JSONB,"createdAt" TIMESTAMP DEFAULT now());
      CREATE TABLE "SstCat" (id TEXT PRIMARY KEY,"budgetUnitId" TEXT,"employeeId" TEXT,"occurredAt" TIMESTAMP,kind TEXT,source TEXT,data JSONB,snapshot JSONB,"requestHash" TEXT,"createdById" TEXT,"createdAt" TIMESTAMP DEFAULT now());
      INSERT INTO "SstCat" VALUES ('cat','ug','employee','2026-10-01','CAT','SST','{}','{}','source-hash','actor',now());
      CREATE TABLE "SstCatEvidence" (id TEXT PRIMARY KEY,"catId" TEXT,kind TEXT,version INT,clinical BOOLEAN,approved BOOLEAN,"personId" TEXT,"professionalRoleId" TEXT,data JSONB,"createdAt" TIMESTAMP DEFAULT now(),"createdById" TEXT,"requestHash" TEXT);
      INSERT INTO "SstCatEvidence" VALUES ('homologation','cat','HOMOLOGATION',1,false,true,NULL,NULL,'{}',now(),'actor','evidence-hash');
      CREATE TABLE "SstCatLayoutVersion" (id TEXT PRIMARY KEY,"catId" TEXT,version INT,mode TEXT,"layoutVersion" TEXT,"templateSha256" TEXT,fields JSONB,"canonicalSnapshot" JSONB,"originalReceipt" TEXT,"requestHash" TEXT,"createdById" TEXT,"createdAt" TIMESTAMP DEFAULT now());
      CREATE TABLE "SstCatLayoutMedical" ("layoutVersionId" TEXT PRIMARY KEY,"medicalEvidenceId" TEXT,fields JSONB);`);
    await db.exec(readFileSync("prisma/migrations-ibema/20261011060000_add_sst_integrations/migration.sql", "utf8"));
    await server.start(); prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://postgres:postgres@${server.getServerConn()}/postgres`, max: 1 }) });
    const context = { user: { ...user }, prisma };
    const config = { budgetUnitId: "ug", environment: "RESTRICTED", employerRegistration: "12345678", credentialReference: "IBEMA_A1", providerReference: "IBEMA_PROVIDER", submissionKey: crypto.randomUUID() };
    const configId = await configureEsocial(context, config);
    assert.equal(await configureEsocial(context, config), configId);
    await assert.rejects(configureEsocial(context, { ...config, employerRegistration: "87654321" }), /outros dados/);
    const input = { budgetUnitId: "ug", sourceId: "cat", kind: "S2210", environment: "RESTRICTED", submissionKey: crypto.randomUUID() };
    const id = await prepareEsocial(context, input);
    assert.equal(await prepareEsocial(context, input), id);
    assert.equal(await prepareEsocial(context, { ...input, submissionKey: crypto.randomUUID() }), id);
    const productionId = await prepareEsocial(context, { ...input, environment: "PRODUCTION", submissionKey: crypto.randomUUID() });
    assert.notEqual(productionId, id);
    await configureEsocial(context,{...config,environment:"PRODUCTION",submissionKey:crypto.randomUUID()});
    const configuredProductionId = await prepareEsocial(context,{...input,environment:"PRODUCTION",submissionKey:crypto.randomUUID()});
    assert.notEqual(configuredProductionId,productionId);
    assert.ok((await readEsocialEvent(context,productionId)).missingFields.includes("Configuração externa do empregador/ambiente"));
    assert.equal((await readEsocialEvent(context,configuredProductionId)).missingFields.includes("Configuração externa do empregador/ambiente"),false);
    const row = await readEsocialEvent(context, id);
    assert.equal(row.configurationId, configId); assert.equal(row.evidence.length, 0); assert.ok(row.missingFields.length);
    assert.equal(hashSource(row.sourceSnapshot), row.sourceHash);
    assert.equal(row.sourceSnapshot.catLayout,null);
    await db.query(`INSERT INTO "SstCatLayoutVersion" (id,"catId",version,mode,"layoutVersion","templateSha256",fields,"canonicalSnapshot","originalReceipt","requestHash","createdById") VALUES ('layout-v1','cat',1,'COMPLETE',$1,$2,'{"agent":"Domain-recorded agent"}','{}','manual-reference-only','layout-hash-v1','actor')`,[catLayoutProvenance.version,catLayoutProvenance.sha256]);
    await db.exec(`INSERT INTO "SstCatLayoutMedical" VALUES ('layout-v1','attendance-source','{"cidCodes":"Z00.0","crm":"CRM PR 123"}');`);
    const layoutEventId = await prepareEsocial(context,{...input,submissionKey:crypto.randomUUID()});
    const layoutEvent = await readEsocialEvent(context,layoutEventId);
    assert.notEqual(layoutEventId,id);
    const layoutSnapshot = layoutEvent.sourceSnapshot.catLayout as {layout:{id:string;requestHash:string;templateSha256:string};medical:{medicalEvidenceId:string}};
    assert.equal(layoutSnapshot.layout.id,"layout-v1");
    assert.equal(layoutSnapshot.layout.requestHash,"layout-hash-v1");
    assert.equal(layoutSnapshot.layout.templateSha256,catLayoutProvenance.sha256);
    assert.equal(layoutSnapshot.medical.medicalEvidenceId,"attendance-source");
    assert.notEqual(layoutEvent.sourceVersion,row.sourceVersion);
    assert.equal(hashSource(layoutEvent.sourceSnapshot),layoutEvent.sourceHash);
    assert.equal(layoutEvent.evidence.length,0); // The manual original reference is not a receipt.
    await db.query(`INSERT INTO "SstCatLayoutVersion" (id,"catId",version,mode,"layoutVersion","templateSha256",fields,"canonicalSnapshot","requestHash","createdById") VALUES ('layout-v2','cat',2,'DRAFT',$1,$2,'{}','{}','layout-hash-v2','actor')`,[catLayoutProvenance.version,catLayoutProvenance.sha256]);
    const revisedId = await prepareEsocial(context,{...input,submissionKey:crypto.randomUUID()});
    assert.notEqual(revisedId,layoutEventId);
    assert.equal((await readEsocialEvent(context,layoutEventId)).sourceHash,layoutEvent.sourceHash);
    assert.ok((await readEsocialEvent(context,revisedId)).missingFields.some(field=>field.includes("rascunho")));
    await assert.rejects(transmitEsocial(context, id), /bloqueada/);
    assert.equal((await db.query('SELECT id FROM "SstEsocialEvidence"')).rows.length, 0);
    assert.equal((await listEsocialEvents(context, "other", 1)).total, 0);
    const denied = { ...context, user: { ...user, profileCode: "SST_ADMIN", allowedBudgetUnitIds: ["other"], permissions: JSON.stringify({ modules: { SST: { blocked: false, create: true } } }) } };
    await assert.rejects(readEsocialEvent(denied, id), /Unidade Gestora/);
    await assert.rejects(prepareEsocial(context, { ...input, budgetUnitId: "other", submissionKey: crypto.randomUUID() }), /outra UG/);
    await assert.rejects(db.exec(`UPDATE "SstEsocialEvent" SET "sourceHash"='changed' WHERE id='${id}'`), /immutable/);
    const audit = JSON.stringify((await db.query('SELECT * FROM "AuditEvent"')).rows);
    assert.equal(audit.includes("IBEMA_A1"), false); assert.equal(audit.includes("source-hash"), false);
  } finally { await prisma?.$disconnect(); await server.stop(); await db.close(); }
});
test("integral clinical report denies nonclinical users before reading/counting sources; portal ignores arbitrary employee IDs", async () => {
  let reads = 0;
  const context = { user: { ...user, profileCode: "SST_OPERATOR", allowedBudgetUnitIds: ["ug"], permissions: JSON.stringify({ modules: { SST: { blocked: false, view: true, issueReports: true } } }) }, prisma: { sstAccessGrant: { findUnique: async () => null }, $queryRaw: async () => { reads++; return []; } } } as unknown as AppContext;
  await assert.rejects(functionalSstReport(context, { employeeId: "employee", budgetUnitId: "ug", from: "2026-01-01", until: "2027-01-01" }), /clínica/);
  assert.equal(reads, 0);
  const portal = { ...context, user: { ...user, profileCode: "PORTAL", permissions: JSON.stringify({ modules: { PORTAL_SERVIDOR: { blocked: false, view: true } } }) } };
  await assert.rejects(portalPppReport(portal, { budgetUnitId: "ug", from: "2026-01-01", until: "2027-01-01", employeeId: "other" } as unknown as Parameters<typeof portalPppReport>[1]), /próprio/);
});
