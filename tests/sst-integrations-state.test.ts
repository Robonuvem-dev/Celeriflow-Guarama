import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

test("isolated PG evidence state: scope, signed attempt, receipt timestamp, terminal immutability and idempotent guards", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE "BudgetUnit" (id TEXT PRIMARY KEY); INSERT INTO "BudgetUnit" VALUES ('ug'),('other'); CREATE TABLE "Employee" (id TEXT PRIMARY KEY); INSERT INTO "Employee" VALUES ('employee');`);
    await db.exec(readFileSync("prisma/migrations-ibema/20261011060000_add_sst_integrations/migration.sql","utf8"));
    await db.exec(`INSERT INTO "SstEsocialConfiguration" (id,"budgetUnitId",environment,version,"employerRegistration","credentialReference","providerReference",layout,"submissionKey","requestHash","createdById") VALUES ('config','ug','RESTRICTED',1,'12345678','TEST_A1','TEST_PROVIDER','test-layout','config-key','test-hash','actor');`);
    const event = (id: string, unit = "ug", environment = "RESTRICTED", missing = "[]") => db.query(`INSERT INTO "SstEsocialEvent" (id,"budgetUnitId","employeeId",kind,environment,"sourceId","sourceVersion","sourceHash","sourceSnapshot","missingFields","configurationId","configurationKey",layout,"submissionKey","requestHash","createdById") VALUES ($1,$2,'employee','S2220',$3,$1,'test-version',$1,'{}',$4::jsonb,'config','config','test-layout',$1,'test-hash','actor')`,[id,unit,environment,missing]);
    await assert.rejects(event("cross","other"),/scope/);
    await assert.rejects(event("cross-env","ug","PRODUCTION"),/scope/);
    await event("event"); await event("incomplete","ug","RESTRICTED",'["Table 27"]');
    const digest = "a".repeat(64);
    const evidence = (id: string, status: string, receipt: string | null, environment = "RESTRICTED", eventId = "event", protocol = "fixture-protocol", processed = "2026-01-01T10:00:00Z") => db.query(`INSERT INTO "SstEsocialEvidence" (id,"eventId",environment,status,"signedXml","xmlHash","eventXmlId","certificateFingerprint","responseXml","responseHash",endpoint,"correlationId",protocol,receipt,"rejectionCodes","processedAt","receivedAt","createdById") VALUES ($1,$2,$3,$4,'test-only-xml',$5,'fixture-event','test-only-cert','test-only-response',$6,'https://test.invalid','fixture-correlation',$7,$8,'[]',$9,'2026-01-01T10:01:00Z','actor')`,[id,eventId,environment,status,digest,createHash("sha256").update(id).digest("hex"),protocol,receipt,processed]);
    await assert.rejects(evidence("without-attempt","ACCEPTED","test-only-receipt"),/matching signed/);
    await db.query(`INSERT INTO "SstEsocialAttempt" (id,"eventId","signedXml","xmlHash","eventXmlId","certificateFingerprint","createdById") VALUES ('attempt','event','test-only-xml',$1,'fixture-event','test-only-cert','actor')`,[digest]);
    await assert.rejects(evidence("null-receipt","ACCEPTED",null),/check constraint/);
    await assert.rejects(evidence("env-mismatch","ACCEPTED","test-only-receipt","PRODUCTION"),/environment mismatch/);
    await assert.rejects(evidence("incomplete","ACCEPTED","test-only-receipt","RESTRICTED","incomplete"),/Incomplete source/);
    await evidence("processing","PROCESSING",null);
    await assert.rejects(evidence("changed-protocol","ACCEPTED","test-only-receipt","RESTRICTED","event","different"),/transition/);
    await assert.rejects(evidence("future-timestamp","ACCEPTED","test-only-receipt","RESTRICTED","event","fixture-protocol","2027-01-01"),/check constraint/);
    await evidence("accepted","ACCEPTED","test-only-receipt");
    await assert.rejects(evidence("later","PROCESSING",null),/transition/);
    await assert.rejects(db.exec(`DELETE FROM "SstEsocialEvidence" WHERE id='accepted'`),/immutable/);
    await assert.rejects(db.exec(`UPDATE "SstEsocialAttempt" SET "eventXmlId"='different' WHERE id='attempt'`),/immutable/);
    assert.equal((await db.query('SELECT id FROM "SstEsocialEvidence"')).rows.length,2);
  } finally { await db.close(); }
});
