import assert from "node:assert/strict";
import test from "node:test";
import type { PermissionUser } from "../src/lib/contracts/identity";
import { createLocalDrizzleDatabase } from "./helpers/local-drizzle-database";
import { canDownloadConstructionCase, canDownloadLinkedOmbudsman, canDownloadLinkedProcess, canDownloadLinkedTicket, findDownloadConstructionArtifact, findDownloadConstructionVersion, findDownloadDocument, findDownloadEnvironmentDocument, findDownloadOccupationalOwner, listDownloadConstructionCaseIds, listDownloadPlanningOwners } from "../src/db/repositories/platform/downloads";
import { findFollowupBatchReceiver, findPharmacyJudicialAttachment, findSisabBatchExport, readPharmacyJudicialCaseUnit } from "../src/db/repositories/platform/health-exports";
import { PersistenceError } from "../src/db/errors";
import { withDatabaseTransaction } from "../src/db/transaction";
import { sql } from "drizzle-orm";

test("shared downloads keep owner projections, confidential grants and historical-sector access", { timeout: 60_000 }, async t => {
  const fixture = await createLocalDrizzleDatabase();
  const db = fixture.connection.db;
  const user: PermissionUser = {
    id: "user-a", firebaseUid: "user-a", email: "user-a@example.invalid", name: "Leitora", role: "Operador", profileCode: "OPERACIONAL",
    permissions: "{}", modulePermissions: [], allowedBudgetUnitIds: [], employeeId: null, departmentId: "dep-a", secretariatId: null,
  };
  const attendance = { user, attendanceAccess: { isAdmin: false, isManager: false, isOmbudsman: false } };
  const protocol = { user, protocolAccess: { isAdmin: false, canView: true, canEdit: false, canCreate: false, canUpdate: false } };
  try {
    // These read-only fixtures expose only columns queried by the download
    // boundary. Domain suites separately replay and exercise authoritative DDL.
    await fixture.database.exec(`
      CREATE TABLE "Document" (id text PRIMARY KEY, "fileUrl" text);
      CREATE TABLE "DocumentVersion" (id text PRIMARY KEY, "documentId" text, "fileUrl" text, "hashSha256" text, "versionNumber" integer, status text);
      CREATE TABLE "Ticket" (id text PRIMARY KEY, "departmentId" text);
      CREATE TABLE "Ombudsman" (id text PRIMARY KEY, "departmentId" text, "isConfidential" boolean);
      CREATE TABLE "OmbudsmanAccess" (id text PRIMARY KEY, "ombudsmanId" text, "userId" text);
      CREATE TABLE "Process" (id text PRIMARY KEY, "currentDepartmentId" text);
      CREATE TABLE "ProcessMovement" (id text PRIMARY KEY, "processId" text, "fromDepartmentId" text, "toDepartmentId" text);
      CREATE TABLE "TicketDocument" ("documentId" text, "ticketId" text);
      CREATE TABLE "OmbudsmanDocument" ("documentId" text, "ombudsmanId" text);
      CREATE TABLE "ProcessDocument" ("documentId" text, "processId" text);
      CREATE TABLE "SstMedicalCertificate" (id text PRIMARY KEY, "budgetUnitId" text);
      CREATE TABLE "SstCertificateDocument" ("documentId" text, "certificateId" text);
      CREATE TABLE "HealthStandardDocument" (id text PRIMARY KEY, "documentId" text);
      CREATE TABLE "ConstructionIssuedDocument" (id text PRIMARY KEY, "caseId" text, status text, "documentVersionId" text, "hashSha256" text, number text, "fileUrl" text);
      CREATE TABLE "ConstructionCase" (id text PRIMARY KEY, "processId" text);
      CREATE TABLE "EnvDocument" (id text PRIMARY KEY, "fileUrl" text);
      INSERT INTO "Document" VALUES ('shared','blob:shared'),('plain','blob:plain'),('occupational','blob:occupational');
      INSERT INTO "Ticket" VALUES ('own-ticket','dep-a'),('other-ticket','dep-b');
      INSERT INTO "Ombudsman" VALUES ('public-own','dep-a',false),('public-other','dep-b',false),('private-own','dep-a',true),('private-grant','dep-b',true);
      INSERT INTO "OmbudsmanAccess" VALUES ('grant-a','private-grant','user-a'),('grant-b','private-own','user-b');
      INSERT INTO "Process" VALUES ('current','dep-a'),('sent','dep-b'),('received','dep-b'),('unseen','dep-b');
      INSERT INTO "ProcessMovement" VALUES ('sent-m','sent','dep-a','dep-b'),('received-m','received','dep-b','dep-a');
      INSERT INTO "TicketDocument" VALUES ('shared','own-ticket');
      INSERT INTO "OmbudsmanDocument" VALUES ('shared','private-grant');
      INSERT INTO "ProcessDocument" VALUES ('shared','sent');
      INSERT INTO "SstMedicalCertificate" VALUES ('medical-a','ug-a'),('medical-b','ug-b');
      INSERT INTO "SstCertificateDocument" VALUES ('shared','medical-a'),('occupational','medical-b');
      INSERT INTO "HealthStandardDocument" VALUES ('health-reference','shared');
      INSERT INTO "ConstructionCase" VALUES ('own-case','current'),('historical-case','sent'),('unseen-case','unseen');
      INSERT INTO "ConstructionIssuedDocument" VALUES ('issued','own-case','PUBLISHED','version-final','sha-final','ALV/2026/001','blob:issued');
      INSERT INTO "EnvDocument" VALUES ('environmental','blob:environmental');
      INSERT INTO "DocumentVersion" VALUES
        ('version-final','shared','construction-local:shared','sha-final',1,'FINAL'),
        ('version-signed','shared','construction-local:shared','sha-signed',2,'SIGNED'),
        ('version-draft','shared','construction-local:shared','sha-draft',3,'DRAFT');
    `);
    await t.test("document relation shape retains optional owners and empty collections", async () => {
      assert.deepEqual(await findDownloadDocument(db, "blob:shared"), {
        id: "shared", sstCertificateDocument: { certificate: { budgetUnitId: "ug-a" } }, ticketLinks: [{ ticketId: "own-ticket" }],
        ombudsmanLinks: [{ ombudsmanId: "private-grant" }], processDocuments: [{ processId: "sent" }], healthStandardDocument: { id: "health-reference" },
      });
      assert.deepEqual(await findDownloadDocument(db, "blob:plain"), { id: "plain", sstCertificateDocument: null, ticketLinks: [], ombudsmanLinks: [], processDocuments: [], healthStandardDocument: null });
      assert.equal(await findDownloadDocument(db, "blob:missing"), null);
      assert.deepEqual(await findDownloadOccupationalOwner(db, "blob:occupational"), { budgetUnitId: "ug-b" });
    });
    await t.test("ticket visibility preserves department, manager and administrator paths", async () => {
      assert.equal(await canDownloadLinkedTicket(db, ["own-ticket"], attendance), true);
      assert.equal(await canDownloadLinkedTicket(db, ["other-ticket"], attendance), false);
      assert.equal(await canDownloadLinkedTicket(db, ["other-ticket"], { ...attendance, attendanceAccess: { ...attendance.attendanceAccess, isManager: true } }), true);
      assert.equal(await canDownloadLinkedTicket(db, ["other-ticket"], { ...attendance, attendanceAccess: { ...attendance.attendanceAccess, isAdmin: true } }), true);
      assert.equal(await canDownloadLinkedTicket(db, ["own-ticket"], { ...attendance, user: { ...user, departmentId: null } }), false);
      assert.equal(await canDownloadLinkedTicket(db, [], attendance), false);
    });
    await t.test("confidential documents require a grant independent of department visibility", async () => {
      assert.equal(await canDownloadLinkedOmbudsman(db, ["public-own"], attendance), true);
      assert.equal(await canDownloadLinkedOmbudsman(db, ["public-other"], attendance), false);
      assert.equal(await canDownloadLinkedOmbudsman(db, ["private-own"], attendance), false);
      assert.equal(await canDownloadLinkedOmbudsman(db, ["private-grant"], attendance), true);
      assert.equal(await canDownloadLinkedOmbudsman(db, ["private-grant"], { ...attendance, user: { ...user, departmentId: null } }), true);
      assert.equal(await canDownloadLinkedOmbudsman(db, ["private-own"], { ...attendance, attendanceAccess: { ...attendance.attendanceAccess, isOmbudsman: true } }), true);
    });
    await t.test("protocol access includes current, sent and received sectors", async () => {
      for (const id of ["current", "sent", "received"]) assert.equal(await canDownloadLinkedProcess(db, [id], protocol), true);
      assert.equal(await canDownloadLinkedProcess(db, ["unseen"], protocol), false);
      assert.equal(await canDownloadLinkedProcess(db, ["current"], { ...protocol, user: { ...user, departmentId: null } }), false);
      assert.equal(await canDownloadLinkedProcess(db, ["unseen"], { ...protocol, protocolAccess: { ...protocol.protocolAccess, isAdmin: true } }), true);
    });
    await t.test("construction permission retains current-sector and active-role requirements", async () => {
      const access = { administrator: false, employeeId: null, departmentId: "dep-a", roles: ["ANALYST"] };
      assert.deepEqual(await listDownloadConstructionCaseIds(db, ["current", "sent"]), ["own-case", "historical-case"]);
      assert.equal(await canDownloadConstructionCase(db, ["own-case"], access), true);
      assert.equal(await canDownloadConstructionCase(db, ["historical-case"], access), false);
      assert.equal(await canDownloadConstructionCase(db, ["own-case"], { ...access, roles: [] }), false);
      assert.equal(await canDownloadConstructionCase(db, ["own-case"], { ...access, departmentId: null }), false);
      assert.equal(await canDownloadConstructionCase(db, ["unseen-case"], { ...access, administrator: true }), true);
      assert.equal(await canDownloadConstructionCase(db, [], { ...access, administrator: true }), false);
      assert.deepEqual(await findDownloadConstructionArtifact(db, "blob:issued"), { id: "issued", caseId: "own-case", status: "PUBLISHED", documentVersionId: "version-final", hashSha256: "sha-final", number: "ALV/2026/001" });
    });
    await t.test("planning has an explicit absence path and preserves missing jurisdiction", async () => {
      assert.deepEqual(await listDownloadPlanningOwners(db, "construction-local:shared"), []);
      await fixture.database.exec(`
        CREATE TABLE "PlanningDocumentLink" (id text PRIMARY KEY, "documentVersionId" text, "instrumentId" text);
        CREATE TABLE "PlanningInstrument" (id text PRIMARY KEY, "governmentEntityId" text);
        CREATE TABLE "PlanningEntityScope" ("governmentEntityId" text PRIMARY KEY, jurisdiction text);
        INSERT INTO "PlanningDocumentLink" VALUES ('plan-a','version-final','instrument-a'),('plan-missing','version-final','instrument-b');
        INSERT INTO "PlanningInstrument" VALUES ('instrument-a','entity-a'),('instrument-b','entity-b');
        INSERT INTO "PlanningEntityScope" VALUES ('entity-a','EXECUTIVE');
      `);
      assert.deepEqual(await listDownloadPlanningOwners(db, "construction-local:shared"), [{ id: "plan-a", jurisdiction: "EXECUTIVE" }, { id: "plan-missing", jurisdiction: null }]);
    });
    await t.test("local construction bytes resolve the newest final/signed version only", async () => {
      assert.deepEqual(await findDownloadConstructionVersion(db, "shared", "construction-local:shared"), { hashSha256: "sha-signed" });
      assert.equal(await findDownloadConstructionVersion(db, "plain", "construction-local:shared"), null);
      assert.deepEqual(await findDownloadEnvironmentDocument(db, "blob:environmental"), { id: "environmental" });
    });
    await t.test("health exports preserve stored bytes and resolve only the requested batch, unit and case attachment", async () => {
      await fixture.database.exec(`
        ALTER TABLE "Document" ADD COLUMN title text;
        UPDATE "Document" SET title='Anexo do processo titular' WHERE id='shared';
        CREATE TABLE "HealthEsusBatch" (id text PRIMARY KEY, "fileContent" text, competence text, hash text);
        CREATE TABLE "HealthFollowupBinding" (id text PRIMARY KEY, "unitId" text NOT NULL);
        CREATE TABLE "HealthFollowupBatch" (id text PRIMARY KEY, "bindingId" text NOT NULL REFERENCES "HealthFollowupBinding"(id), "contractName" text NOT NULL);
        CREATE TABLE "HealthPharmacyJudicialCase" (id text PRIMARY KEY, "unitId" text NOT NULL);
        CREATE TABLE "HealthPharmacyJudicialDocument" ("caseId" text REFERENCES "HealthPharmacyJudicialCase"(id), "documentId" text REFERENCES "Document"(id), UNIQUE("caseId","documentId"));
        INSERT INTO "HealthEsusBatch" VALUES ('sisab-a',E'#SISAB|COMPETENCIA:2026-01\\nESUS|202601|INDIVIDUAL','2026-01','frozen-hash');
        INSERT INTO "HealthFollowupBinding" VALUES ('binding-a','health-unit-a'),('binding-b','health-unit-b');
        INSERT INTO "HealthFollowupBatch" VALUES ('batch-a','binding-a','HIPERDIA'),('batch-b','binding-b','RIRA');
        INSERT INTO "HealthPharmacyJudicialCase" VALUES ('judicial-a','health-unit-a'),('judicial-b','health-unit-b');
        INSERT INTO "HealthPharmacyJudicialDocument" VALUES ('judicial-a','shared'),('judicial-b','plain');
      `);
      assert.deepEqual(await findSisabBatchExport(db, "sisab-a"), { fileContent: "#SISAB|COMPETENCIA:2026-01\nESUS|202601|INDIVIDUAL", competence: "2026-01", hash: "frozen-hash" });
      assert.deepEqual(await findFollowupBatchReceiver(db, "batch-a"), { contractName: "HIPERDIA", binding: { unitId: "health-unit-a" } });
      assert.deepEqual(await findFollowupBatchReceiver(db, "batch-b"), { contractName: "RIRA", binding: { unitId: "health-unit-b" } });
      assert.deepEqual(await readPharmacyJudicialCaseUnit(db, "judicial-a"), { unitId: "health-unit-a" });
      assert.deepEqual(await findPharmacyJudicialAttachment(db, "judicial-a", "shared"), { document: { title: "Anexo do processo titular", fileUrl: "blob:shared" } });
      assert.equal(await findPharmacyJudicialAttachment(db, "judicial-b", "shared"), null);
      assert.equal(await findPharmacyJudicialAttachment(db, "judicial-a", "plain"), null);
      const absent = "') OR TRUE; --";
      assert.equal(await findSisabBatchExport(db, absent), null);
      assert.equal(await findFollowupBatchReceiver(db, absent), null);
      await assert.rejects(readPharmacyJudicialCaseUnit(db, absent), error => error instanceof PersistenceError && error.kind === "not-found");
      await assert.rejects(withDatabaseTransaction(fixture.connection, async tx => {
        await tx.execute(sql`UPDATE "HealthFollowupBinding" SET "unitId"='uncommitted-unit' WHERE id='binding-a'`);
        assert.deepEqual(await findFollowupBatchReceiver(tx, "batch-a"), { contractName: "HIPERDIA", binding: { unitId: "uncommitted-unit" } });
        throw new Error("health export caller rollback");
      }), /health export caller rollback/);
      assert.deepEqual(await findFollowupBatchReceiver(db, "batch-a"), { contractName: "HIPERDIA", binding: { unitId: "health-unit-a" } });
    });
    await t.test("URL and owner identifiers remain parameters even with SQL punctuation", async () => {
      const payload = "') OR TRUE; DROP TABLE \"Document\"; --";
      assert.equal(await findDownloadDocument(db, payload), null);
      assert.equal(await findDownloadEnvironmentDocument(db, payload), null);
      assert.equal(await canDownloadLinkedTicket(db, [payload], attendance), false);
      assert.equal(await canDownloadLinkedProcess(db, [payload], protocol), false);
      assert.equal(await canDownloadConstructionCase(db, [payload], { administrator: true, employeeId: null, departmentId: null, roles: [] }), false);
      assert.ok(await findDownloadDocument(db, "blob:shared"));
    });
  } finally { await fixture.close(); }
});
