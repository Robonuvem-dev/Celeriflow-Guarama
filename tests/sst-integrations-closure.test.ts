import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import type { AppContext } from "../src/lib/platform/tenant-context";
import { functionalSstReport, pppReport, portalPppReport } from "../src/lib/sst/closure-service";
import { emitClosureDocument } from "../src/lib/sst/closure-document";
import { readFileSync } from "node:fs";

test("isolated PG consolidated report includes every source, pages 20, scopes before count and protects portal clinical data", { timeout: 60000 }, async () => {
  const db = new PGlite(); const server = new PGLiteSocketServer({ db, port: 0, host: "127.0.0.1" }); let client: PrismaClient | undefined;
  try {
    await db.exec(`CREATE TABLE "BudgetUnit" (id TEXT PRIMARY KEY); INSERT INTO "BudgetUnit" VALUES ('ug'),('other');
      CREATE TABLE "AuditEvent" (id TEXT PRIMARY KEY,"actorUsuarioId" TEXT,"eventType" TEXT,"targetType" TEXT,"targetId" TEXT,"createdAt" TIMESTAMP DEFAULT now());
      CREATE TABLE "Employee" (id TEXT PRIMARY KEY,"personId" TEXT,"isActive" BOOLEAN DEFAULT true); INSERT INTO "Employee" (id,"personId") VALUES ('employee','person'),('other-employee','other-person');
      CREATE TABLE "HrEmployeeFunctionalPeriod" (id TEXT PRIMARY KEY,"employeeId" TEXT,"budgetUnitId" TEXT,"governmentEntityId" TEXT,"employmentRegimeId" TEXT,"roleId" TEXT,"functionRoleId" TEXT,"departmentId" TEXT,"localId" TEXT,"costCenterId" TEXT,"startsAt" TIMESTAMP,"endsAt" TIMESTAMP,"contractReference" TEXT,snapshot JSONB,voided BOOLEAN,"supersedesId" TEXT);
      CREATE TABLE "HrBudgetUnitEntityMapping" ("budgetUnitId" TEXT,"governmentEntityId" TEXT); INSERT INTO "HrBudgetUnitEntityMapping" VALUES ('ug','entity');
      INSERT INTO "HrEmployeeFunctionalPeriod" VALUES ('history','employee','ug','entity','regime','historical-role',NULL,'old-department','old-local','center','2026-02-01','2026-03-01','canonical-contract','{"role":"Historic role","local":"Historic local"}',false,NULL);
      CREATE TABLE "SstMedicalCertificate" (id TEXT PRIMARY KEY,"employeeId" TEXT,"budgetUnitId" TEXT,"startsAt" TIMESTAMP,"endsAt" TIMESTAMP,"cidCodes" TEXT[]);
      INSERT INTO "SstMedicalCertificate" SELECT 'c'||n,'employee','ug','2026-02-02','2026-02-03',ARRAY['Z00.0'] FROM generate_series(1,41) n;
      INSERT INTO "SstMedicalCertificate" VALUES ('other-ug','employee','other','2026-02-02','2026-02-03',ARRAY['SECRET_CID']);
      CREATE TABLE "SstMedicalAssessment" (id TEXT PRIMARY KEY,"certificateId" TEXT,"assessedAt" TIMESTAMP); INSERT INTO "SstMedicalAssessment" VALUES ('assessment','c1','2026-02-04');
      CREATE TABLE "SstCat" (id TEXT PRIMARY KEY,"employeeId" TEXT,"budgetUnitId" TEXT,"occurredAt" TIMESTAMP,kind TEXT,data JSONB); INSERT INTO "SstCat" VALUES ('cat','employee','ug','2026-02-05','CAT','{"cid":"SECRET_MEDICAL"}');
      CREATE TABLE "SstCatEvidence" (id TEXT PRIMARY KEY,"catId" TEXT,"createdAt" TIMESTAMP,data JSONB); INSERT INTO "SstCatEvidence" VALUES ('cat-evidence','cat','2026-02-06','{"cid":"SECRET_MEDICAL"}');
      CREATE TABLE "SstEquipmentDelivery" (id TEXT PRIMARY KEY,"budgetUnitId" TEXT,"deliveredAt" TIMESTAMP); INSERT INTO "SstEquipmentDelivery" VALUES ('delivery','ug','2026-02-07');
      CREATE TABLE "SstEquipmentDeliveryItem" (id TEXT PRIMARY KEY,"deliveryId" TEXT,"employeeId" TEXT); INSERT INTO "SstEquipmentDeliveryItem" VALUES ('item','delivery','employee');
      CREATE TABLE "SstAso" (id TEXT PRIMARY KEY,"employeeId" TEXT,"budgetUnitId" TEXT,"performedAt" TIMESTAMP); INSERT INTO "SstAso" VALUES ('aso','employee','ug','2026-02-08');
      CREATE TABLE "SstOccupationalExam" (id TEXT PRIMARY KEY,"asoId" TEXT,"performedAt" TIMESTAMP); INSERT INTO "SstOccupationalExam" VALUES ('exam','aso','2026-02-08');
      CREATE TABLE "SstRestriction" (id TEXT PRIMARY KEY,"employeeId" TEXT,"budgetUnitId" TEXT,"startsAt" TIMESTAMP,"endsAt" TIMESTAMP); INSERT INTO "SstRestriction" VALUES ('restriction','employee','ug','2026-02-09','2026-02-10');
      CREATE TABLE "SstRestrictionFollowup" (id TEXT PRIMARY KEY,"restrictionId" TEXT,"followedAt" TIMESTAMP); INSERT INTO "SstRestrictionFollowup" VALUES ('followup','restriction','2026-02-10');
      CREATE TABLE "SstClinicalRecord" (id TEXT PRIMARY KEY,"personId" TEXT,"budgetUnitId" TEXT,discipline TEXT,"attendedAt" TIMESTAMP,requests JSONB); INSERT INTO "SstClinicalRecord" VALUES ('clinical','person','ug','MEDICINE','2026-02-11','[{"kind":"REFERRAL","description":"Medical request"}]'),('psychology','person','ug','PSYCHOLOGY','2026-02-14','[{"description":"SECRET_PSYCHOLOGY"}]'),('social','person','ug','SOCIAL_WORK','2026-02-15','[{"description":"SECRET_SOCIAL"}]'),('nursing','person','ug','NURSING','2026-02-16','[{"description":"SECRET_NURSING"}]');
      CREATE TABLE "SstAccessGrant" (id TEXT PRIMARY KEY,"usuarioId" TEXT,"budgetUnitId" TEXT,"canReadClinical" BOOLEAN,"canAssess" BOOLEAN,"isActive" BOOLEAN,"createdAt" TIMESTAMP DEFAULT now(),"updatedAt" TIMESTAMP DEFAULT now(),UNIQUE("usuarioId","budgetUnitId"));
      INSERT INTO "SstAccessGrant" (id,"usuarioId","budgetUnitId","canReadClinical","canAssess","isActive") VALUES ('reader-access','reader','ug',true,false,true);
      CREATE TABLE "SstDisciplineGrant" (id TEXT PRIMARY KEY,"usuarioId" TEXT,"budgetUnitId" TEXT,discipline TEXT,"canRead" BOOLEAN,"canWrite" BOOLEAN,"isActive" BOOLEAN,UNIQUE("usuarioId","budgetUnitId",discipline));
      INSERT INTO "SstDisciplineGrant" VALUES ('reader-med','reader','ug','MEDICINE',true,false,true),('reader-psy','reader','ug','PSYCHOLOGY',false,false,true),('reader-social','reader','ug','SOCIAL_WORK',true,false,false),('reader-nursing','reader','ug','NURSING',false,true,true);
      CREATE TABLE "SstAnamnesis" (id TEXT PRIMARY KEY,"asoId" TEXT,"createdAt" TIMESTAMP); INSERT INTO "SstAnamnesis" VALUES ('anamnesis','aso','2026-02-12');
      CREATE TABLE "SstVaccination" (id TEXT PRIMARY KEY,"personId" TEXT,"budgetUnitId" TEXT,"administeredAt" TIMESTAMP); INSERT INTO "SstVaccination" VALUES ('vaccine','person','ug','2026-02-13');`);
    await db.exec(readFileSync("prisma/migrations-ibema/20261011060000_add_sst_integrations/migration.sql", "utf8"));
    await server.start(); client = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://postgres:postgres@${server.getServerConn()}/postgres`, max: 1 }) });
    // Programs have no historical rows in this fixture; canonical history and
    // every consolidated source/count/pagination query execute against PG.
    const prisma = new Proxy(client, { get(target, property) {
      if (property === "sstProgramExposureGroup") return { findMany: async () => [] };
      // The grant lookup and record-level EXISTS run against the same isolated
      // PG rows, including canRead=false, write-only and inactive grants.
      if (property === "sstDisciplineGrant") return { findUnique: async ({where}:{where:{usuarioId_budgetUnitId_discipline:{usuarioId:string;budgetUnitId:string;discipline:string}}}) => {
        const key=where.usuarioId_budgetUnitId_discipline;
        return (await target.$queryRaw<{isActive:boolean;canRead:boolean;canWrite:boolean}[]>`SELECT "isActive","canRead","canWrite" FROM "SstDisciplineGrant" WHERE "usuarioId"=${key.usuarioId} AND "budgetUnitId"=${key.budgetUnitId} AND discipline=${key.discipline}`)[0] || null;
      }};
      const value = Reflect.get(target, property); return typeof value === "function" ? value.bind(target) : value;
    } });
    const context = { prisma, user: { id: "actor", name: "Test", email: "test@example.invalid", firebaseUid: "actor", role: "ADMIN", profileCode: "SYSTEM_ADMINISTRATOR", permissions: "{}", modulePermissions: [], allowedBudgetUnitIds: [], employeeId: "employee", departmentId: null, secretariatId: null } } as unknown as AppContext;
    const input = { employeeId: "employee", budgetUnitId: "ug", from: "2026-01-01", until: "2027-01-01" };
    const pages = await Promise.all([1,2,3].map(page => functionalSstReport(context,input,page)));
    assert.deepEqual(pages.map(page => page.records.length),[20,20,15]);
    assert.equal(pages[0].total,55);
    const records = pages.flatMap(page => page.records);
    assert.equal(new Set(records.map(row => `${row.source}:${row.id}`)).size,55);
    assert.equal(new Set(records.map(row => row.source)).size,12);
    assert.equal(JSON.stringify(records).includes("SECRET_CID"),false);
    const ppp = await pppReport(context,input);
    assert.equal(ppp.periods[0].roleId,"historical-role");
    assert.equal(ppp.missingHistory.length,2); assert.equal(ppp.missingLtcat.length,1); assert.equal(ppp.complete,false);
    assert.equal(JSON.stringify(ppp).includes("SECRET_MEDICAL"),false);
    const emitted = await emitClosureDocument(context,"FUNCTIONAL",input);
    assert.equal(emitted.pdf.subarray(0,4).toString(),"%PDF");
    const stored = (await db.query<{snapshot:{records:unknown[]}}>('SELECT snapshot FROM "SstClosureEmission" WHERE id=$1',[emitted.id])).rows[0];
    assert.equal(stored.snapshot.records.length,55);
    const reader = {...context,user:{...context.user,id:"reader",profileCode:"SST_READER",allowedBudgetUnitIds:["ug"],permissions:JSON.stringify({modules:{SST:{blocked:false,view:true,issueReports:true}}})}};
    const restricted = await functionalSstReport(reader,input);
    assert.equal(restricted.total,52);
    assert.deepEqual(restricted.authorizedDisciplines,["MEDICINE"]);
    assert.deepEqual(restricted.omittedDisciplines,["NURSING","PSYCHOLOGY","SOCIAL_WORK"]);
    assert.equal(JSON.stringify(restricted).includes("SECRET_PSYCHOLOGY"),false);
    assert.equal(JSON.stringify(restricted).includes("SECRET_SOCIAL"),false);
    assert.equal(JSON.stringify(restricted).includes("SECRET_NURSING"),false);
    const restrictedPdf = await emitClosureDocument(reader,"FUNCTIONAL",input);
    const restrictedStored = (await db.query<{snapshot:{records:unknown[]}}>('SELECT snapshot FROM "SstClosureEmission" WHERE id=$1',[restrictedPdf.id])).rows[0];
    assert.equal(restrictedStored.snapshot.records.length,52);
    assert.equal(JSON.stringify(restrictedStored).includes("SECRET_PSYCHOLOGY"),false);
    await db.exec(`UPDATE "SstDisciplineGrant" SET "canRead"=true WHERE id='reader-psy';`);
    const withPsychology = await functionalSstReport(reader,input);
    assert.equal(withPsychology.total,53);
    assert.equal(JSON.stringify(withPsychology.records).includes("SECRET_PSYCHOLOGY"),true);
    assert.equal(JSON.stringify(withPsychology.records).includes("SECRET_SOCIAL"),false);
    await db.exec(`UPDATE "SstDisciplineGrant" SET "canRead"=false WHERE id='reader-med';`);
    await assert.rejects(functionalSstReport(reader,input),/atuação/); // Generic grant alone is insufficient.
    await assert.rejects(db.exec(`UPDATE "SstClosureEmission" SET "contentHash"='changed' WHERE id='${emitted.id}'`),/immutable/);
    const ownPdf = await emitClosureDocument(context,"PPP",{budgetUnitId:"ug",from:input.from,until:input.until},true);
    const ownStored = (await db.query('SELECT snapshot FROM "SstClosureEmission" WHERE id=$1',[ownPdf.id])).rows[0];
    assert.equal(JSON.stringify(ownStored).includes("SECRET_MEDICAL"),false);
    assert.equal(JSON.stringify(ownStored).includes("SECRET_PSYCHOLOGY"),false);
    await assert.rejects(emitClosureDocument(context,"FUNCTIONAL",input,true),/Portal/);
    const own = await portalPppReport(context,{budgetUnitId:"ug",from:input.from,until:input.until,employeeId:"other-employee"} as unknown as Parameters<typeof portalPppReport>[1]);
    assert.equal(own.input.employeeId,"employee");
    await assert.rejects(portalPppReport(context,{budgetUnitId:"other",from:input.from,until:input.until}),/próprio/);
  } finally { await client?.$disconnect(); await server.stop(); await db.close(); }
});
