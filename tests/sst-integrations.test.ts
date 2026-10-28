import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createLocalDrizzleDatabase } from "./helpers/local-drizzle-database";
import { createSstAccidentFixture } from "./helpers/sst-accident-fixture";
import { sstTestContext } from "./helpers/sst-drizzle-context";
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
  const local = await createSstAccidentFixture(), db = local.database;
  try {
    // Replay the complete CAT/evidence/layout history, including the homologation
    // and deferred COMPLETE-layout guards, rather than a partial read DTO table.
    await db.exec(`INSERT INTO "Usuario" (id,nome,email,"perfilId","updatedAt") VALUES ('actor','Test','test@example.invalid','profile',now());
      INSERT INTO "Person" (id,"fullName","updatedAt") VALUES ('integration-doctor','Médico da integração',now());
      INSERT INTO "SstProfessionalRole" (id,"budgetUnitId","personId","usuarioId",discipline,council,"startsAt","endsAt","createdById")
        VALUES ('integration-role','ug','integration-doctor','actor','MEDICINE','CRM PR 123','2026-01-01','2027-12-31','actor');
      INSERT INTO "SstCat" (id,"budgetUnitId","employeeId","submissionKey","requestHash","createdById","occurredAt",kind,source,data,snapshot,"createdAt")
        VALUES ('cat','ug','employee','seed-cat','source-hash','actor','2026-10-01 12:00','TYPICAL','SST','{"generatingStatus":"INITIAL","location":"Oficina","agent":"Máquina","bodyParts":["Mão"]}','{"employeeName":"Servidor","registration":"001"}','2026-10-01 12:00');
      INSERT INTO "SstCatEvidence" (id,"catId",kind,version,clinical,approved,"personId","professionalRoleId",data,"createdById","submissionKey","requestHash","createdAt")
        VALUES ('investigation','cat','INVESTIGATION',1,true,false,NULL,NULL,'{"description":"Investigação ocupacional documentada"}','actor','seed-investigation','investigation-hash','2026-10-01 13:00');
      INSERT INTO "SstCatEvidence" (id,"catId",kind,version,clinical,approved,"personId","professionalRoleId",data,"createdById","submissionKey","requestHash","createdAt")
        VALUES ('technical','cat','TECHNICAL',1,false,true,'integration-doctor',NULL,'{"opinion":"Parecer técnico favorável"}','actor','seed-technical','technical-hash','2026-10-01 13:10');
      INSERT INTO "SstCatEvidence" (id,"catId",kind,version,clinical,approved,"personId","professionalRoleId",data,"createdById","submissionKey","requestHash","createdAt")
        VALUES ('medical','cat','MEDICAL',1,true,true,'integration-doctor','integration-role','{"opinion":"Parecer médico favorável"}','actor','seed-medical','medical-hash','2026-10-01 13:20');
      INSERT INTO "SstCatEvidence" (id,"catId",kind,version,clinical,approved,"personId","professionalRoleId",data,"createdById","submissionKey","requestHash","createdAt")
        VALUES ('attendance-source','cat','ATTENDANCE',1,true,true,'integration-doctor','integration-role','{"attendedAt":"2026-10-01T13:30:00Z","injury":"Lesão ocupacional","cidCodes":["Z00.0"],"authorSnapshot":{"council":"CRM PR 123"}}','actor','seed-attendance','attendance-hash','2026-10-01 13:30');
      INSERT INTO "SstCatEvidence" (id,"catId",kind,version,clinical,approved,"personId","professionalRoleId",data,"createdById","submissionKey","requestHash","createdAt")
        VALUES ('homologation','cat','HOMOLOGATION',1,false,true,NULL,NULL,'{"opinion":"Homologação após pareceres favoráveis"}','actor','seed-homologation','evidence-hash','2026-10-01 14:00');`);
    await db.exec(readFileSync("prisma/migrations-ibema/20261011060000_add_sst_integrations/migration.sql", "utf8"));
    const context = sstTestContext(local.connection.db, { ...user });
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
    await db.transaction(async tx => {
      await tx.query(`INSERT INTO "SstCatLayoutVersion" (id,"catId",version,mode,"layoutVersion","templateSha256",provenance,fields,"canonicalSnapshot","originalReceipt","requestHash","createdById","submissionKey","createdAt")
        VALUES ('layout-v1','cat',1,'COMPLETE',$1,$2,$3::jsonb,'{"agent":"Domain-recorded agent"}','{"employeeId":"employee","budgetUnitId":"ug"}','manual-reference-only','layout-hash-v1','actor','seed-layout-v1','2026-10-01 14:10')`, [catLayoutProvenance.version, catLayoutProvenance.sha256, JSON.stringify(catLayoutProvenance)]);
      await tx.query(`INSERT INTO "SstCatLayoutMedical" ("layoutVersionId","medicalEvidenceId",fields,"createdById") VALUES ('layout-v1','attendance-source','{"cidCodes":"Z00.0","crm":"CRM PR 123"}','actor')`);
    });
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
    await db.query(`INSERT INTO "SstCatLayoutVersion" (id,"catId",version,mode,"layoutVersion","templateSha256",provenance,fields,"canonicalSnapshot","originalReceipt","requestHash","createdById","submissionKey","createdAt")
      VALUES ('layout-v2','cat',2,'DRAFT',$1,$2,$3::jsonb,'{}','{"employeeId":"employee","budgetUnitId":"ug"}',NULL,'layout-hash-v2','actor','seed-layout-v2','2026-10-01 14:20')`, [catLayoutProvenance.version, catLayoutProvenance.sha256, JSON.stringify(catLayoutProvenance)]);
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
   } finally { await local.close(); }
});
test("integral clinical report denies nonclinical users before reading/counting sources; portal ignores arbitrary employee IDs", async () => {
  const local = await createLocalDrizzleDatabase();
  try {
    await local.database.exec(`CREATE TABLE "SstAccessGrant" (id TEXT,"usuarioId" TEXT,"budgetUnitId" TEXT,"isActive" BOOLEAN,"canReadClinical" BOOLEAN,"canAssess" BOOLEAN,"createdAt" TIMESTAMP,"updatedAt" TIMESTAMP);
      CREATE TABLE "Employee" (id TEXT,"isActive" BOOLEAN);
      CREATE TABLE "HrBudgetUnitEntityMapping" ("budgetUnitId" TEXT,"governmentEntityId" TEXT);
      CREATE TABLE "HrEmployeeFunctionalPeriod" (id TEXT,"employeeId" TEXT,"budgetUnitId" TEXT,"governmentEntityId" TEXT,voided BOOLEAN,"supersedesId" TEXT,"startsAt" TIMESTAMP,"endsAt" TIMESTAMP);`);
    // Clinical source tables are intentionally absent: reading/counting them would fail.
    const context = sstTestContext(local.connection.db, { ...user, profileCode: "SST_OPERATOR", allowedBudgetUnitIds: ["ug"], permissions: JSON.stringify({ modules: { SST: { blocked: false, view: true, issueReports: true } } }) });
    await assert.rejects(functionalSstReport(context, { employeeId: "employee", budgetUnitId: "ug", from: "2026-01-01", until: "2027-01-01" }), /clínica/);
    const portal = { ...context, user: { ...user, profileCode: "PORTAL", permissions: JSON.stringify({ modules: { PORTAL_SERVIDOR: { blocked: false, view: true } } }) } };
    const untrustedInput = { budgetUnitId: "ug", from: "2026-01-01", until: "2027-01-01", employeeId: "other" };
    await assert.rejects(portalPppReport(portal, untrustedInput), /próprio/);
  } finally { await local.close(); }
});
