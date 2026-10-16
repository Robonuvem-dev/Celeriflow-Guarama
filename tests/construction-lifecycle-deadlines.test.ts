import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { Prisma } from "@prisma/client";
import { calculateInspectionCorrectionDeadline, assertInspectionCorrectionOpen } from "../src/lib/obras/construction-lifecycle-deadline-policy";
import { inspectionResultSchema } from "../src/lib/obras/construction-lifecycle-policy";
import { assertConstructionInspectionRequestDeadline, extendConstructionInspectionDeadline, getConstructionInspectionCorrections } from "../src/lib/obras/construction-lifecycle-deadlines";
import { submitConstructionServiceRequest } from "../src/lib/obras/construction-request-service";
import { recordConstructionInspection, requestConstructionInspection } from "../src/lib/obras/construction-lifecycle";

test("real clock: building/subdivision deadlines use configured calendar days from notification, not a backdated inspection", () => {
  const now = new Date("2026-10-10T12:34:56Z");
  for (const category of ["BUILDING", "SUBDIVISION"]) {
    const result = calculateInspectionCorrectionDeadline({ category, correctionDays: 7, configurationId: "config", configurationVersion: 3, inspectedAt: "2026-09-01", requirementNote: "Adequar drenagem e segurança conforme laudo" }, now);
    assert.equal(result.deadline.toISOString(), "2026-10-17T23:59:59.999Z");
    assert.equal(result.memory.category, category);
    assert.equal(result.memory.configurationVersion, 3);
    assert.equal(result.memory.notifiedAt, now.toISOString());
    assert.doesNotThrow(() => assertInspectionCorrectionOpen(result.deadline, new Date("2026-10-17T23:59:59.999Z"), "2026-10-17"));
    assert.throws(() => assertInspectionCorrectionOpen(result.deadline, new Date("2026-10-18T00:00:00Z")), /encerrado/);
    assert.throws(() => assertInspectionCorrectionOpen(result.deadline, now, "2026-10-18"), /agendada/);
  }
  assert.throws(() => calculateInspectionCorrectionDeadline({ category: "SUBDIVISION", correctionDays: 30, configurationId: "config", configurationVersion: 1, inspectedAt: "2026-10-11", requirementNote: "Ajustar a obra conforme exigência" }, now), /futura/);
  assert.throws(() => assertInspectionCorrectionOpen(null, now), /sem prazo/);
  assert.equal(inspectionResultSchema.safeParse({ caseId: "case", requestKey: randomUUID(), inspectionId: "inspection", inspectedAt: "2026-10-10", decision: "FAILED", notes: "Reprovada", checks: {}, documentIds: {}, fieldValues: {} }).success, false);
});

test("PostgreSQL/server: portal and staff cannot bypass expired failed inspections; only manager extends, history is immutable and replay-safe", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE "ConstructionCase" ("id" TEXT PRIMARY KEY); CREATE TABLE "ConstructionReview" ("id" TEXT PRIMARY KEY); CREATE TABLE "ConstructionCatalogEntry" ("id" TEXT PRIMARY KEY); CREATE TABLE "Document" ("id" TEXT PRIMARY KEY); CREATE TABLE "Process" ("id" TEXT PRIMARY KEY);`);
    await db.exec(await readFile(new URL("../prisma/migrations-ibema/20261010240000_construction_lifecycle/migration.sql", import.meta.url), "utf8"));
    await db.exec(`INSERT INTO "ConstructionCase" VALUES ('case'); INSERT INTO "ConstructionCatalogEntry" VALUES ('drainage');
      INSERT INTO "ConstructionInspection" ("id","caseId","requestKey","inspectionTypeId","sequence","status","requestNotes","resultNotes","definitionSnapshot","requestedBy") VALUES ('legacy','case','request-legacy','drainage',1,'FAILED','Pedido original','Adequar drenagem do parcelamento','{}','staff');
      INSERT INTO "ConstructionInspection" ("id","caseId","requestKey","inspectionTypeId","sequence","status","requestNotes","definitionSnapshot","requestedBy") VALUES ('reinspection','case','reinspection-key','drainage',2,'REQUESTED','Pedido anterior à migration de prazo','{}','staff');`);
    await db.exec(await readFile(new URL("../prisma/migrations-ibema/20261010330000_construction_inspection_deadlines/migration.sql", import.meta.url), "utf8"));
    await db.exec(`UPDATE "ConstructionInspection" SET "correctionDeadline"='2026-10-09 23:59:59.999', "inspectedAt"='2026-10-09' WHERE "id"='legacy'`);
    const now = new Date("2026-10-10T12:00:00Z");
    let portalWrites = 0;
    let messageWrites = 0;
    let eventWrites = 0;
    let teamNotificationLookups = 0;
    let staffInspectionWrites = 0;
    const client = {
      $queryRaw: async (query: TemplateStringsArray | Prisma.Sql, ...values: unknown[]) => {
        const sql = Array.isArray(query) ? Prisma.sql(query as TemplateStringsArray, ...values) : query as Prisma.Sql;
        return (await db.query(sql.text, sql.values)).rows;
      },
      $executeRaw: async () => 0,
      constructionCase: { findFirst: async ({ where }: { where: { AND: Record<string, unknown>[] } }) => {
        const sector = (where.AND[1] as { process?: { currentDepartmentId?: string } }).process?.currentDepartmentId;
        if (sector && sector !== "sector") return null;
        return { id: "case", processId: "process", category: "SUBDIVISION", configurationId: "config", configuration: { version: 3, correctionDays: 7 }, inspectionPlan: { inspectionTypes: [{ id: "drainage" }, { id: "structural" }], definitionSnapshot: { definition: { fields: [], checks: [], documents: [] } } }, lifecycleStart: { startedAt: new Date("2000-01-01T00:00:00Z") }, revisionCount: 0, reviewStatus: "APPROVED", correctionDeadline: null, process: { status: "Em andamento", completedAt: null, currentDepartmentId: "sector", companyId: null } };
      } },
      constructionInspection: {
        findFirst: async ({ where }: { where: { id?: string; caseId: string; inspectionTypeId?: string; status?: string } }) => (await db.query('SELECT * FROM "ConstructionInspection" WHERE "caseId"=$1 AND ($2::text IS NULL OR "id"=$2) AND ($3::text IS NULL OR "inspectionTypeId"=$3) AND ($4::text IS NULL OR "status"=$4)', [where.caseId, where.id || null, where.inspectionTypeId || null, where.status || null])).rows[0] || null,
        findUnique: async ({ where }: { where: { requestKey: string } }) => (await db.query('SELECT * FROM "ConstructionInspection" WHERE "requestKey"=$1', [where.requestKey])).rows[0] || null,
        aggregate: async () => ({ _max: { sequence: 3 } }),
        create: async () => { staffInspectionWrites++; return { id: "new-staff-inspection" }; },
        update: async ({ where, data }: { where: { id: string }; data: { status: string; inspectedAt: Date; resultNotes: string; inspectedBy: string; resultRequestKey: string; correctionDeadline: Date | null; requirementNote: string; correctionSnapshot: unknown; evidenceSnapshot: unknown } }) => {
          await db.query('UPDATE "ConstructionInspection" SET "status"=$1,"inspectedAt"=$2,"resultNotes"=$3,"inspectedBy"=$4,"resultRequestKey"=$5,"correctionDeadline"=$6,"requirementNote"=$7,"correctionSnapshot"=$8,"evidenceSnapshot"=$9 WHERE "id"=$10', [data.status, data.inspectedAt.toISOString().slice(0, 10), data.resultNotes, data.inspectedBy, data.resultRequestKey, data.correctionDeadline?.toISOString() || null, data.requirementNote, JSON.stringify(data.correctionSnapshot), JSON.stringify(data.evidenceSnapshot), where.id]);
        },
        findMany: async ({ where }: { where: { id: { in: string[] } } }) => {
        const found = await db.query<{ id: string; correctionDeadline: string | null; inspectedAt: string | null }>(`SELECT *, to_char("correctionDeadline", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "correctionDeadline", to_char("inspectedAt", 'YYYY-MM-DD') AS "inspectedAt" FROM "ConstructionInspection" WHERE "id"=ANY($1::text[]) ORDER BY "sequence" DESC`, [where.id.in]);
        return Promise.all(found.rows.map(async (inspection) => ({ ...inspection, inspectedAt: inspection.inspectedAt ? new Date(inspection.inspectedAt + "T00:00:00Z") : null, correctionDeadline: inspection.correctionDeadline ? new Date(inspection.correctionDeadline) : null, deadlineExtensions: (await db.query<{ newDeadline: string; previousDeadline: string | null; createdAt: string }>(`SELECT e.*, to_char(e."newDeadline", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "newDeadline", to_char(e."previousDeadline", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "previousDeadline", to_char(e."createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt" FROM "ConstructionInspectionDeadlineExtension" e WHERE e."inspectionId"=$1 ORDER BY e."newDeadline" DESC LIMIT 1`, [inspection.id])).rows.map((extension) => ({ ...extension, newDeadline: new Date(extension.newDeadline), previousDeadline: extension.previousDeadline ? new Date(extension.previousDeadline) : null, createdAt: new Date(extension.createdAt) })) })));
      } },
      constructionInspectionDeadlineExtension: {
        findUnique: async ({ where }: { where: { requestKey: string } }) => (await db.query('SELECT * FROM "ConstructionInspectionDeadlineExtension" WHERE "requestKey"=$1', [where.requestKey])).rows[0] || null,
        create: async ({ data }: { data: { caseId: string; inspectionId: string; requestKey: string; previousDeadline: Date | null; newDeadline: Date; reason: string; createdBy: string } }) => {
          const id = randomUUID();
          await db.query('INSERT INTO "ConstructionInspectionDeadlineExtension" ("id","caseId","inspectionId","requestKey","previousDeadline","newDeadline","reason","createdBy") VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [id, data.caseId, data.inspectionId, data.requestKey, data.previousDeadline?.toISOString() || null, data.newDeadline.toISOString(), data.reason, data.createdBy]);
          return { id };
        },
      },
      constructionServiceRequest: { findUnique: async () => null, create: async () => { portalWrites++; return { id: "external" }; } },
      document: { findMany: async () => [] },
      constructionCompletion: { findFirst: async () => null },
      usuario: { findMany: async () => { teamNotificationLookups++; return []; } },
      processEvent: { create: async () => { eventWrites++; } },
      constructionMessage: { create: async ({ data }: { data: { employeeId: string; content: string; identityId?: string } }) => { assert.equal(data.employeeId, "manager"); assert.equal(data.identityId, undefined); assert.match(data.content, /Motivo|Exigência de ajuste/); messageWrites++; } },
    } as unknown as Prisma.TransactionClient;
    await assert.rejects(assertConstructionInspectionRequestDeadline(client, "case", { now }), /encerrado/);
    // Real portal submission service must reject before writing a pending service request.
    await db.query('UPDATE "ConstructionInspection" SET "correctionDeadline"=$1 WHERE "id"=\'legacy\'', [new Date(Date.now() - 86400000).toISOString()]);
    await assert.rejects(submitConstructionServiceRequest(client, "external-identity", { caseId: "case", requestKey: randomUUID(), kind: "INSPECTION", revision: 0, termId: "term", notes: "Solicito nova vistoria de drenagem", documentIds: [] }), /encerrado/);
    assert.equal(portalWrites, 0);
    await db.exec(`UPDATE "ConstructionInspection" SET "correctionDeadline"='2026-10-09 23:59:59.999' WHERE "id"='legacy'`);
    const access = { administrator: false, employeeId: "manager", departmentId: "sector", roles: ["MANAGER"] };
    const extension = { caseId: "case", inspectionId: "legacy", requestKey: randomUUID(), newDeadline: "2026-10-20", reason: "Regularização motivada por chuvas no parcelamento" };
    await assert.rejects(extendConstructionInspectionDeadline(client, { ...access, roles: ["INSPECTOR"] }, "manager-user", extension, now), /gestor/);
    await assert.rejects(extendConstructionInspectionDeadline(client, { ...access, departmentId: "other" }, "manager-user", extension, now), /setor/);
    await assert.rejects(extendConstructionInspectionDeadline(client, access, "manager-user", { ...extension, newDeadline: "2026-10-09" }, now), /futuro/);
    const id = await extendConstructionInspectionDeadline(client, access, "manager-user", extension, now);
    assert.equal(await extendConstructionInspectionDeadline(client, access, "manager-user", extension, now), id);
    assert.equal(messageWrites, 1); assert.equal(eventWrites, 1);
    const open = await assertConstructionInspectionRequestDeadline(client, "case", { inspectionTypeId: "drainage", scheduledAt: "2026-10-20", now });
    assert.equal(open[0].originalDeadline, "2026-10-09T23:59:59.999Z");
    assert.equal(open[0].effectiveDeadline, "2026-10-20T23:59:59.999Z");
    await assert.rejects(assertConstructionInspectionRequestDeadline(client, "case", { scheduledAt: "2026-10-21", now }), /agendada/);
    await assert.rejects(assertConstructionInspectionRequestDeadline(client, "case", { scheduledAt: "2026-10-08", now }), /anteceder/);
    await assert.rejects(db.query('UPDATE "ConstructionInspectionDeadlineExtension" SET "reason"=$1 WHERE "id"=$2', ["Motivo alterado indevidamente", id]), /imutável/);
    await assert.rejects(db.query('DELETE FROM "ConstructionInspectionDeadlineExtension" WHERE "id"=$1', [id]), /imutável/);
    assert.equal((await db.query<{ reinspectionOfId: string }>(`SELECT "reinspectionOfId" FROM "ConstructionInspection" WHERE "id"='reinspection'`)).rows[0].reinspectionOfId, "legacy");
    // A pending reinspection does not hide its failed ancestor or reset an expired clock.
    await assert.rejects(assertConstructionInspectionRequestDeadline(client, "case", { now: new Date("2026-10-21T00:00:00Z") }), /encerrado/);
    await db.exec(`UPDATE "ConstructionInspection" SET "status"='APPROVED' WHERE "id"='reinspection'`);
    assert.equal((await getConstructionInspectionCorrections(client, "case")).length, 0);
    await db.exec(`INSERT INTO "ConstructionCatalogEntry" VALUES ('structural'); INSERT INTO "ConstructionInspection" ("id","caseId","requestKey","inspectionTypeId","sequence","status","requestNotes","definitionSnapshot","requestedBy") VALUES ('pending','case','pending-key','structural',3,'REQUESTED','Vistoria do parcelamento','{"definition":{"fields":[],"checks":[],"documents":[]}}','staff')`);
    await assert.rejects(db.exec(`UPDATE "ConstructionInspection" SET "status"='FAILED' WHERE "id"='pending'`), /failed_requirement_check/);
    const today = new Date().toISOString().slice(0, 10);
    const failure = { caseId: "case", requestKey: randomUUID(), inspectionId: "pending", inspectedAt: today, decision: "FAILED", notes: "Drenagem não conforme", requirementNote: "Ajustar drenagem do parcelamento conforme exigência", checks: {}, documentIds: {}, fieldValues: {} };
    const expected = calculateInspectionCorrectionDeadline({ category: "SUBDIVISION", correctionDays: 7, configurationId: "config", configurationVersion: 3, inspectedAt: today, requirementNote: failure.requirementNote });
    assert.equal(await recordConstructionInspection(client, { ...access, roles: ["INSPECTOR"] }, "fiscal-user", failure), "pending");
    assert.equal(await recordConstructionInspection(client, { ...access, roles: ["INSPECTOR"] }, "fiscal-user", failure), "pending");
    const recorded = await getConstructionInspectionCorrections(client, "case");
    assert.equal(recorded[0].effectiveDeadline, expected.deadline.toISOString());
    assert.equal(recorded[0].requirementNote, failure.requirementNote);
    assert.equal((recorded[0].correctionSnapshot as { category: string }).category, "SUBDIVISION");
    assert.equal(messageWrites, 2); assert.equal(eventWrites, 2); assert.equal(teamNotificationLookups, 2);
    await db.query('UPDATE "ConstructionInspection" SET "correctionDeadline"=$1 WHERE "id"=\'pending\'', [new Date(Date.now() - 86400000).toISOString()]);
    await assert.rejects(requestConstructionInspection(client, { ...access, roles: ["INSPECTOR"] }, "fiscal-user", { caseId: "case", requestKey: randomUUID(), inspectionTypeId: "structural", scheduledAt: "", notes: "Solicito reinspeção depois do vencimento" }), /encerrado/);
    assert.equal(staffInspectionWrites, 0);
  } finally { await db.close(); }
});
