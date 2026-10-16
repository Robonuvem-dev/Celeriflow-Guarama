import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { Prisma } from "@prisma/client";
import { PDFDocument } from "pdf-lib";
import type { AppContext } from "../src/lib/platform/tenant-context";
import { certificateReport, reportCivilRange } from "../src/lib/sst/report-service";
import { exportCertificateReport } from "../src/lib/sst/functional-report-export";
import { registerCertificate } from "../src/lib/sst/certificate-service";

async function fixture() {
  const db = new PGlite();
  await db.exec(`
    CREATE TABLE "BudgetUnit" (id TEXT PRIMARY KEY,"secretariatId" TEXT);
    CREATE TABLE "Employee" (id TEXT PRIMARY KEY,name TEXT,registration TEXT,"personId" TEXT,"isActive" BOOLEAN,"roleId" TEXT,"departmentId" TEXT,"secretariatId" TEXT);
    CREATE TABLE "Person" (id TEXT PRIMARY KEY,"fullName" TEXT,"birthDate" TIMESTAMP);
    CREATE TABLE "SstAccessGrant" ("usuarioId" TEXT,"budgetUnitId" TEXT,"isActive" BOOLEAN,"canReadClinical" BOOLEAN,"canAssess" BOOLEAN);
    CREATE TABLE "HrBudgetUnitEntityMapping" (id TEXT PRIMARY KEY,"budgetUnitId" TEXT,"governmentEntityId" TEXT);
    CREATE TABLE "HrEmployeeFunctionalPeriod" (id TEXT PRIMARY KEY,"employeeId" TEXT,"budgetUnitId" TEXT,"governmentEntityId" TEXT,"employmentRegimeId" TEXT,"roleId" TEXT,"functionRoleId" TEXT,"departmentId" TEXT,"localId" TEXT,"costCenterId" TEXT,"startsAt" TIMESTAMP,"endsAt" TIMESTAMP,"supersedesId" TEXT,voided BOOLEAN DEFAULT false,snapshot JSONB);
    CREATE TABLE "SstCertificateReason" (id TEXT PRIMARY KEY,"budgetUnitId" TEXT,name TEXT,"isActive" BOOLEAN,"autoProtocol" BOOLEAN,"autoPresentedAt" BOOLEAN,"printReceipt" BOOLEAN,"suggestLeave" BOOLEAN,"createLeaveOnApproval" BOOLEAN,"leaveType" TEXT,"dependentPolicy" TEXT,"restrictedRoleIds" TEXT[]);
    CREATE TABLE "SstReasonRegimePolicy" (id TEXT PRIMARY KEY,"reasonId" TEXT,version INTEGER,"restrictedRegimeIds" TEXT[]);
    CREATE TABLE "SstMedicalCertificate" (id TEXT PRIMARY KEY,"budgetUnitId" TEXT,"employeeId" TEXT,"issuerPersonId" TEXT,"issuerCouncil" TEXT,"reasonId" TEXT,"startsAt" TIMESTAMP,"endsAt" TIMESTAMP,"presentedAt" TIMESTAMP,"protocolNumber" TEXT,"cidCodes" TEXT[],status TEXT,"roleIdSnapshot" TEXT,"departmentIdSnapshot" TEXT,"createdById" TEXT,"reasonSnapshot" JSONB,"processId" TEXT,"dependentId" TEXT);
    CREATE TABLE "SstCertificateFunctionalSource" ("certificateId" TEXT PRIMARY KEY,"functionalPeriodId" TEXT REFERENCES "HrEmployeeFunctionalPeriod"(id),"regimePolicyId" TEXT,snapshot JSONB);
    CREATE TABLE "SstPlannedShift" (id TEXT PRIMARY KEY,"employeeId" TEXT,"budgetUnitId" TEXT,"startsAt" TIMESTAMP,"endsAt" TIMESTAMP);
    CREATE TABLE "HealthSusReference" (id TEXT PRIMARY KEY,kind TEXT,code TEXT,"isActive" BOOLEAN,"isCurrent" BOOLEAN);
    CREATE TABLE "AuditEvent" ("actorUsuarioId" TEXT,"eventType" TEXT,"targetType" TEXT,"targetId" TEXT);
    INSERT INTO "BudgetUnit" VALUES ('ug','shared'),('foreign','shared');
    INSERT INTO "Person" VALUES ('subject','Servidor histórico','1990-01-01'),('doctor','Emitente privado',NULL),('presentPerson','Servidor sem atestado',NULL);
    INSERT INTO "Employee" VALUES ('e','=Servidor privado','100','subject',true,'currentRole','currentDept','wrongCurrentSecretariat'),('present','Presente','101','presentPerson',true,'currentRole','currentDept','shared');
    INSERT INTO "SstAccessGrant" VALUES ('u','ug',true,true,true);
    INSERT INTO "HrBudgetUnitEntityMapping" VALUES ('map','ug','entity'),('foreignMap','foreign','otherEntity');
    INSERT INTO "HrEmployeeFunctionalPeriod" (id,"employeeId","budgetUnitId","governmentEntityId","employmentRegimeId","roleId","functionRoleId","departmentId","localId","costCenterId","startsAt","endsAt",snapshot) VALUES
      ('oldPeriod','e','ug','entity','regimeA','oldCargo','function','oldDept','localA','centerA','2026-10-01','2026-10-11','{"regime":{"name":"Regime histórico A"},"local":"Local histórico A","costCenter":{"name":"Centro histórico A"}}'),
      ('newPeriod','e','ug','entity','regimeB','newCargo','function','newDept','localB','centerB','2026-10-11','2026-11-01','{"regime":{"name":"Regime B"},"local":"Local B","costCenter":{"name":"Centro B"}}'),
      ('presentPeriod','present','ug','entity','regimeA','oldCargo',NULL,'oldDept','localA','centerA','2026-10-01','2026-11-01','{}');
    INSERT INTO "SstCertificateReason" VALUES ('reason','ug','Motivo vigente',true,true,true,false,true,true,'Licença médica','DISABLED',ARRAY[]::text[]);
    INSERT INTO "SstMedicalCertificate" (id,"budgetUnitId","employeeId","issuerPersonId","issuerCouncil","reasonId","startsAt","endsAt","presentedAt","protocolNumber","cidCodes",status,"reasonSnapshot") VALUES
      ('c1','ug','e','doctor','CRM PR 123','reason','2026-10-10 08:00','2026-10-10 12:00','2026-10-10','SST-1',ARRAY['M54.5'],'APPROVED','{"name":"Motivo histórico"}'),
      ('c2','ug','e','doctor','CRM PR 123','reason','2026-10-10 11:00','2026-10-10 14:00','2026-10-10','SST-2',ARRAY['M54.5'],'APPROVED','{"name":"Motivo histórico"}'),
      ('foreign','foreign','e','doctor','CRM PR 123','reason','2026-10-10 08:00','2026-10-10 22:00','2026-10-10','FOREIGN',ARRAY['Z99'],'APPROVED','{}');
    INSERT INTO "SstCertificateFunctionalSource" SELECT id,'oldPeriod',NULL,jsonb_build_object('employmentRegimeId','regimeA','localId','localA','costCenterId','centerA') FROM "SstMedicalCertificate" WHERE id IN ('c1','c2');
    INSERT INTO "SstPlannedShift" VALUES ('s1','e','ug','2026-10-10 08:00','2026-10-10 16:00'),('s2','e','ug','2026-10-10 08:00','2026-10-10 12:00'),('s3','present','ug','2026-10-10 08:00','2026-10-10 16:00'),('sForeign','e','foreign','2026-10-10 08:00','2026-10-10 22:00');
    INSERT INTO "HealthSusReference" VALUES ('officialCID','CID','M54.5',true,true),('retiredCID','CID','Z99',false,true);
  `);
  let datasetQueries = 0;
  const user = { id: "u", profileCode: "OPERADOR", allowedBudgetUnitIds: ["ug"], modulePermissions: [], permissions: JSON.stringify({ modules: { SST: { blocked: false, issueReports: true, create: true } } }) } as AppContext["user"];
  const audit = { create: async ({ data }: { data: Record<string, string> }) => db.query('INSERT INTO "AuditEvent" VALUES ($1,$2,$3,$4)', [data.actorUsuarioId, data.eventType, data.targetType, data.targetId]) };
  const raw = async (sql: Prisma.Sql | TemplateStringsArray, ...values: unknown[]) => {
    datasetQueries++;
    const query = Array.isArray(sql) ? Prisma.sql(sql as TemplateStringsArray, ...values) : sql as Prisma.Sql;
    return (await db.query(query.text, query.values)).rows;
  };
  const prisma = {
    $queryRaw: raw,
    sstAccessGrant: { findUnique: async ({ where }: { where: { usuarioId_budgetUnitId: { usuarioId: string; budgetUnitId: string } } }) => (await db.query('SELECT * FROM "SstAccessGrant" WHERE "usuarioId"=$1 AND "budgetUnitId"=$2', [where.usuarioId_budgetUnitId.usuarioId, where.usuarioId_budgetUnitId.budgetUnitId])).rows[0] || null },
    auditEvent: audit,
  };
  const context = { user, prisma } as unknown as AppContext;
  return { db, context, raw, audit, queryCount: () => datasetQueries };
}
const input = { budgetUnitId: "ug", from: new Date("2026-10-10T00:00Z"), until: new Date("2026-10-11T00:00Z"), employmentRegimeId: "regimeA", localId: "localA", costCenterId: "centerA" };

test("real historical report uses original period, distinct local/center and worker UG; overlapping hours stay united", async () => {
  const f = await fixture();
  try {
    const report = await certificateReport(f.context, { ...input, roleId: "oldCargo", departmentId: "oldDept" });
    assert.equal(report.total, 2);
    assert.equal(report.records[0].regimeName, "Regime histórico A");
    assert.equal(report.records[0].reason.name, "Motivo histórico");
    assert.equal(report.statistics.length, 2);
    assert.equal(report.statistics.reduce((sum, r) => sum + r.plannedMinutes, 0), 960);
    assert.equal(report.statistics.reduce((sum, r) => sum + r.absentMinutes, 0), 360);
    assert.equal(report.statistics.find((r) => r.employeeId === "present")?.certificateCount, 0);
    assert.equal(report.unverifiedPlannedShiftCount, 0);
    assert.equal((await certificateReport(f.context, { ...input, costCenterId: "localA" })).total, 0);
    assert.equal((await certificateReport(f.context, { ...input, employmentRegimeId: "regimeB" })).total, 0);
    await f.db.exec(`UPDATE "HrEmployeeFunctionalPeriod" SET "endsAt"='2026-10-10 12:00' WHERE id='presentPeriod'`);
    const incomplete = await certificateReport(f.context, input);
    assert.equal(incomplete.unverifiedPlannedShiftCount, 1);
    assert.equal(incomplete.statistics.find((r) => r.employeeId === "present")?.plannedMinutes, 240);
  } finally { await f.db.close(); }
});
test("CSV/PDF use actual historical rows, share ACL before counts, and audits contain no PHI", async () => {
  const f = await fixture();
  try {
    const csv = await exportCertificateReport(f.context, input, { kind: "atestados", format: "csv" });
    assert.match(csv.content.toString(), /Regime histórico A/);
    assert.match(csv.content.toString(), /"'=Servidor privado"/);
    assert.doesNotMatch(csv.content.toString(), /FOREIGN/);
    const pdf = await exportCertificateReport(f.context, input, { kind: "atestados", format: "pdf" });
    assert.equal(pdf.content.subarray(0, 5).toString(), "%PDF-");
    assert.ok((await PDFDocument.load(pdf.content)).getPageCount() > 0);
    const audits = (await f.db.query('SELECT * FROM "AuditEvent"')).rows;
    assert.equal(audits.length, 2);
    assert.doesNotMatch(JSON.stringify(audits), /M54|Servidor privado|Emitente privado|Motivo histórico/);
    for (const format of ["csv", "pdf"]) {
      const before = f.queryCount();
      await assert.rejects(exportCertificateReport(f.context, { ...input, budgetUnitId: "foreign" }, { format }), /Unidade Gestora/);
      assert.equal(f.queryCount(), before);
    }
    await f.db.exec('UPDATE "SstAccessGrant" SET "canReadClinical"=false');
    const before = f.queryCount();
    await assert.rejects(exportCertificateReport(f.context, input, { format: "pdf" }), /clínica/);
    assert.equal(f.queryCount(), before);
  } finally { await f.db.close(); }
});
test("report has server-side stable 20-row pages, strict dates, and legacy source remains explicitly missing", async () => {
  const f = await fixture();
  try {
    await f.db.exec(`INSERT INTO "SstMedicalCertificate" SELECT 'copy-'||n,"budgetUnitId","employeeId","issuerPersonId","issuerCouncil","reasonId","startsAt","endsAt","presentedAt",'COPY-'||n,"cidCodes",status,"roleIdSnapshot","departmentIdSnapshot","createdById","reasonSnapshot","processId","dependentId" FROM "SstMedicalCertificate",generate_series(1,40) n WHERE id='c1';
      INSERT INTO "SstCertificateFunctionalSource" SELECT id,'oldPeriod',NULL,'{}' FROM "SstMedicalCertificate" WHERE id LIKE 'copy-%';`);
    const first = await certificateReport(f.context, { ...input, page: 1 });
    const second = await certificateReport(f.context, { ...input, page: 2 });
    assert.equal(first.total, 42); assert.equal(first.records.length, 20); assert.equal(second.records.length, 20);
    assert.equal(first.records.some((r) => second.records.some((s) => s.id === r.id)), false);
    assert.equal((await certificateReport(f.context, { ...input, page: 99 })).page, 3);
    assert.throws(() => reportCivilRange("2026-02-30", "2026-03-01"));
    await f.db.exec(`DELETE FROM "SstCertificateFunctionalSource" WHERE "certificateId"='c1'`);
    const legacy = await certificateReport(f.context, { budgetUnitId: "ug", from: input.from, until: input.until });
    assert.equal(legacy.missingHistoricalSourceCount, 1);
    assert.equal(legacy.records.find((r) => r.id === "c1")?.regimeName, null);
  } finally { await f.db.close(); }
});
test("new certificate uses official CID and historical reason restrictions against real canonical tables", async () => {
  const f = await fixture();
  let creates = 0;
  try {
    const tx = {
      $queryRaw: f.raw, $executeRaw: async (sql: TemplateStringsArray, ...values: unknown[]) => { const query = Prisma.sql(sql, ...values); return (await f.db.query(query.text, query.values)).affectedRows; },
      budgetUnit: { findUnique: async () => (await f.db.query('SELECT * FROM "BudgetUnit" WHERE id=$1', ["ug"])).rows[0] },
      employee: { findUnique: async () => (await f.db.query('SELECT * FROM "Employee" WHERE id=$1', ["e"])).rows[0] },
      person: { findUnique: async () => (await f.db.query('SELECT * FROM "Person" WHERE id=$1', ["doctor"])).rows[0] },
      sstCertificateReason: { findUnique: async () => (await f.db.query('SELECT * FROM "SstCertificateReason" WHERE id=$1', ["reason"])).rows[0] },
      healthSusReference: { findMany: async ({ where }: { where: { code: { in: string[] } } }) => (await f.db.query('SELECT code FROM "HealthSusReference" WHERE kind=\'CID\' AND "isActive" AND "isCurrent" AND code=ANY($1)', [where.code.in])).rows },
      sstMedicalCertificate: { findUnique: async () => null, create: async ({ data }: { data: Record<string, unknown> }) => { creates++; await f.db.query(`INSERT INTO "SstMedicalCertificate" (id,"employeeId","budgetUnitId","issuerPersonId","reasonId","startsAt","endsAt","protocolNumber","cidCodes",status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'RECEIVED')`, ["newCert", data.employeeId, data.budgetUnitId, data.issuerPersonId, data.reasonId, data.startsAt, data.endsAt, data.protocolNumber, data.cidCodes]); return { id: "newCert" }; } },
      auditEvent: f.audit,
    };
    f.context.prisma = { ...f.context.prisma, $transaction: async (callback: (value: typeof tx) => Promise<unknown>) => { await f.db.exec("BEGIN"); try { const result = await callback(tx); await f.db.exec("COMMIT"); return result; } catch (error) { await f.db.exec("ROLLBACK"); throw error; } } } as unknown as AppContext["prisma"];
    const raw = { budgetUnitId: "ug", employeeId: "e", issuerPersonId: "doctor", reasonId: "reason", issuerCouncil: "CRM PR 123", startsAt: "2026-10-10T08:00Z", endsAt: "2026-10-10T12:00Z", submissionKey: "00000000-0000-4000-8000-000000000001", cidCodes: ["M545"] };
    await f.db.exec(`UPDATE "SstCertificateReason" SET "restrictedRoleIds"=ARRAY['oldCargo']`);
    await assert.rejects(registerCertificate(f.context, raw), /cargo selecionado/);
    await f.db.exec(`UPDATE "SstCertificateReason" SET "restrictedRoleIds"=ARRAY[]::text[]; INSERT INTO "SstReasonRegimePolicy" VALUES ('policy','reason',1,ARRAY['regimeA'])`);
    await assert.rejects(registerCertificate(f.context, raw), /regime contratual/);
    await f.db.exec(`INSERT INTO "SstReasonRegimePolicy" VALUES ('policy2','reason',2,ARRAY[]::text[])`);
    await assert.rejects(registerCertificate(f.context, { ...raw, cidCodes: ["Z99"] }), /catálogo oficial/);
    assert.equal(creates, 0);
    assert.equal((await registerCertificate(f.context, raw)).id, "newCert");
    const source = (await f.db.query<{ functionalPeriodId: string }>('SELECT "functionalPeriodId" FROM "SstCertificateFunctionalSource" WHERE "certificateId"=\'newCert\'')).rows[0];
    assert.equal(source.functionalPeriodId, "oldPeriod");
  } finally { await f.db.close(); }
});
