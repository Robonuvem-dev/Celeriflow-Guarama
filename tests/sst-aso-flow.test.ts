import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { assertAsoProfessional, secondVacationWarning, asoCorrectionVersion } from "../src/lib/sst/aso-flow-policy";
import { prepareAsoFlow } from "../src/lib/sst/aso-flow-registration";
import { asoInput } from "../src/lib/sst/aso-policy";
import type { Prisma } from "@prisma/client";
import { correctAso, readAsoFollowUp } from "../src/lib/sst/aso-flow-service";
import type { AppContext } from "../src/lib/platform/tenant-context";
import { asoDocumentOwners } from "../src/lib/sst/aso-flow-access";
import { loadEsocialSource } from "../src/lib/sst/esocial-source";

const day = new Date("2026-10-01");
const role = { id: "doctor-role", budgetUnitId: "ug", personId: "doctor", discipline: "MEDICINE", council: "CRM PR 1", startsAt: day, endsAt: day, isActive: true };
const expected = { budgetUnitId: "ug", personId: "doctor", discipline: "MEDICINE", council: "CRM PR 1", performedAt: day };
test("administrative habilitation checks UG, profession, council and inclusive civil validity", () => {
  assert.doesNotThrow(() => assertAsoProfessional(role, expected));
  for (const invalid of [undefined, { ...role, isActive: false }, { ...role, budgetUnitId: "other" }, { ...role, discipline: "NURSING" }, { ...role, council: "CRM PR 2" }, { ...role, endsAt: new Date("2026-09-30") }]) assert.throws(() => assertAsoProfessional(invalid, expected), /habilitação administrativa/);
});
test("second open acquisition period uses recorded RH deadline without adding a concession year", () => {
  const first = { id: "first", acquisitionStart: new Date("2023-01-01"), acquisitionEnd: new Date("2023-12-31"), expiresAt: new Date("2026-10-05") };
  const second = { id: "second", acquisitionStart: new Date("2024-01-01"), acquisitionEnd: new Date("2024-12-31"), expiresAt: new Date("2026-10-20") };
  assert.equal(secondVacationWarning([second, first], day, 20)?.id, "second");
  assert.equal(secondVacationWarning([first, second], day, 10), null);
  assert.equal(secondVacationWarning([first], day, 365), null);
  assert.notEqual(asoCorrectionVersion("hash", { id: "correction", requestHash: "revision" }), "hash");
});
test("pre-emission refuses specialized questionnaires, wrong answer types and absent explicit RH contract", async () => {
  const input = asoInput.parse({ budgetUnitId: "ug", personId: "worker", examinerPersonId: "doctor", examinerCouncil: "CRM PR 1", kind: "PERIODICO", result: "APTO", performedAt: "2026-10-01", validUntil: "2027-10-01", programGroupId: "group", submissionKey: "2d161f17-63ca-4d57-9c87-82c4f74e4d5a", anamnesis: { questionnaireVersionId: "q", answers: { history: false, count: 0 } }, exams: [{ name: "Clínico", kind: "CLINICO", source: "REALIZADO", performedAt: "2026-10-01", validUntil: "2027-10-01", result: "Normal", professionalPersonId: "doctor", professionalCouncil: "CRM PR 1" }] });
  const q = { id: "q", budgetUnitId: "ug", discipline: "MEDICINE", questions: [{ key: "history", label: "Histórico", kind: "BOOLEAN", required: true }, { key: "count", label: "Quantidade", kind: "NUMBER", required: true }] };
  const tx = { sstProfessionalRole: { findMany: async () => [role] }, sstQuestionnaireVersion: { findUnique: async () => q }, $queryRaw: async () => [] } as unknown as Prisma.TransactionClient;
  const candidate = await prepareAsoFlow(tx, input, undefined);
  assert.deepEqual(candidate.answers, { history: false, count: 0 });
  assert.equal(candidate.functional, null);
  await assert.rejects(prepareAsoFlow(tx, { ...input, functionalPeriodId: "period" }, undefined), /Candidato sem servidor/);
  await assert.rejects(prepareAsoFlow(tx, input, "employee"), /vínculo funcional histórico/);
  await assert.rejects(prepareAsoFlow(tx, { ...input, anamnesis: { ...input.anamnesis, answers: { history: "false", count: 0 } } }, undefined));
  q.discipline = "PSYCHOLOGY";
  await assert.rejects(prepareAsoFlow(tx, input, undefined), /Medicina/);
});
test("pre-emission returns the typed historical contract and snapshot for an employee", async () => {
  const input = asoInput.parse({ budgetUnitId: "ug", personId: "worker", functionalPeriodId: "period", examinerPersonId: "doctor", examinerCouncil: "CRM PR 1", kind: "PERIODICO", result: "APTO", performedAt: "2026-10-01", validUntil: "2027-10-01", programGroupId: "group", submissionKey: "2d161f17-63ca-4d57-9c87-82c4f74e4d5a", anamnesis: { questionnaireVersionId: "q", answers: { history: false } }, exams: [{ name: "Clínico", kind: "CLINICO", source: "REALIZADO", performedAt: "2026-10-01", validUntil: "2027-10-01", result: "Normal", professionalPersonId: "doctor", professionalCouncil: "CRM PR 1" }] });
  const period = { id: "period", governmentEntityId: "entity", contractReference: "Contrato RH 001", employmentRegimeId: "regime", localId: "local", costCenterId: "center", startsAt: new Date("2026-01-01"), endsAt: new Date("2027-01-01"), sourceReference: "Registro oficial RH", roleId: "historical-role", departmentId: "historical-department", snapshot: { registration: "001", role: "Cargo histórico", department: "Lotação histórica" } };
  const tx = {
    sstProfessionalRole: { findMany: async () => [role] },
    sstQuestionnaireVersion: { findUnique: async () => ({ id: "q", budgetUnitId: "ug", discipline: "MEDICINE", questions: [{ key: "history", label: "Histórico", kind: "BOOLEAN", required: true }] }) },
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      if (!strings.join("").includes('FROM "HrEmployeeFunctionalPeriod"')) return [];
      assert.deepEqual(values.slice(0, 3), ["period", "employee", "ug"]);
      return [period];
    },
  } as unknown as Prisma.TransactionClient;
  const flow = await prepareAsoFlow(tx, input, "employee");
  assert.ok(flow.functional);
  assert.equal(flow.functional.id, "period");
  assert.equal(flow.functional.roleId, "historical-role");
  assert.equal(flow.functional.departmentId, "historical-department");
  assert.equal(flow.functional.governmentEntityId, "entity");
  assert.deepEqual(flow.functional.snapshot, period.snapshot);
});
test("additive workflow migration enforces atomic source, immutable correction and exam document ownership", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE "BudgetUnit" (id TEXT PRIMARY KEY); CREATE TABLE "Document" (id TEXT PRIMARY KEY,"fileUrl" TEXT); CREATE TABLE "Vacation" (id TEXT PRIMARY KEY);
      CREATE TABLE "DocumentVersion" ("documentId" TEXT,"fileUrl" TEXT);
      CREATE TABLE "SstAso" (id TEXT PRIMARY KEY,"budgetUnitId" TEXT,"personId" TEXT,"employeeId" TEXT,"examinerPersonId" TEXT,"examinerCouncil" TEXT,"performedAt" DATE,"createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE "SstAnamnesis" (id TEXT PRIMARY KEY,"asoId" TEXT,"questionnaireVersionId" TEXT,revision INT);
      CREATE TABLE "SstProfessionalRole" (id TEXT PRIMARY KEY,"budgetUnitId" TEXT,"personId" TEXT,discipline TEXT,council TEXT,"isActive" BOOLEAN,"startsAt" DATE,"endsAt" DATE);
      CREATE TABLE "SstQuestionnaireVersion" (id TEXT PRIMARY KEY,"budgetUnitId" TEXT,discipline TEXT);
      CREATE TABLE "SstOccupationalExam" (id TEXT PRIMARY KEY,"asoId" TEXT,"professionalPersonId" TEXT,"professionalCouncil" TEXT,"performedAt" DATE,kind TEXT,snapshot JSONB);
      CREATE TABLE "HrEmployeeFunctionalPeriod" (id TEXT PRIMARY KEY,"employeeId" TEXT,"budgetUnitId" TEXT,"startsAt" TIMESTAMP,"endsAt" TIMESTAMP,voided BOOLEAN,"supersedesId" TEXT);
      INSERT INTO "BudgetUnit" VALUES ('ug'); INSERT INTO "Document" VALUES ('doc','private:original'),('generic-alias','private:original'); INSERT INTO "DocumentVersion" VALUES ('doc','private:old-version');
      INSERT INTO "SstAso" VALUES ('legacy','ug','worker',NULL,'doctor','CRM PR 1','2026-10-01',CURRENT_TIMESTAMP);
      INSERT INTO "SstQuestionnaireVersion" VALUES ('q','ug','MEDICINE');
      INSERT INTO "SstProfessionalRole" VALUES ('role','ug','doctor','MEDICINE','CRM PR 1',true,'2026-01-01','2027-12-31');`);
    await db.exec(readFileSync("prisma/migrations-ibema/20261011080000_complete_sst_aso_workflow/migration.sql", "utf8"));
    await assert.rejects(db.exec(`INSERT INTO "SstAso" VALUES ('invalid','ug','worker',NULL,'doctor','CRM PR 1','2026-10-01',CURRENT_TIMESTAMP)`), /transactional pre-emission/);
    await db.transaction(async (tx) => {
      await tx.exec(`INSERT INTO "SstAso" VALUES ('new','ug','worker',NULL,'doctor','CRM PR 1','2026-10-01',CURRENT_TIMESTAMP); INSERT INTO "SstAnamnesis" VALUES ('n','new','q',1); INSERT INTO "SstAsoFlowSource" VALUES ('new','n','role',NULL)`);
    });
    await assert.rejects(db.transaction(async (tx) => {
      await tx.exec(`INSERT INTO "SstAso" VALUES ('bad-profession','ug','worker',NULL,'doctor','CRM PR 1','2026-10-01',CURRENT_TIMESTAMP);
        INSERT INTO "SstAnamnesis" VALUES ('bad-n','bad-profession','q',1);
        INSERT INTO "SstOccupationalExam" VALUES ('bad-exam','bad-profession','doctor','CRM PR 1','2026-10-01','CLINICO','{"professionalDiscipline":"NURSING"}');
        INSERT INTO "SstAsoFlowSource" VALUES ('bad-profession','bad-n','role',NULL)`);
    }), /professional qualification/);
    await db.exec(`INSERT INTO "SstAsoCorrection" (id,"asoId",kind,reason,"requestHash","createdById") VALUES ('correction','new','ANNULMENT','Justificativa administrativa','hash','user')`);
    await assert.rejects(db.exec(`UPDATE "SstAsoCorrection" SET reason='Outra justificativa'`), /immutable/);
    await assert.rejects(db.exec(`DELETE FROM "SstAsoFlowSource"`), /immutable/);
    await db.exec(`INSERT INTO "SstOccupationalExam" (id,"asoId") VALUES ('exam','legacy')`);
    await assert.rejects(db.exec(`INSERT INTO "SstAsoDocument" (id,"asoId","examId","documentId",kind,"requestHash","createdById") VALUES ('link','new','exam','doc','ORIGIN','hash','user')`), /another ASO/);
    await db.exec(`INSERT INTO "SstAsoDocument" (id,"asoId","documentId",kind,"requestHash","createdById") VALUES ('generated','new','doc','GENERATED','hash','user')`);
    const adapter = { $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.reduce((result, chunk, i) => result + chunk + (i < values.length ? `$${i + 1}` : ""), "");
      return (await db.query(sql, values)).rows;
    } } as unknown as Parameters<typeof asoDocumentOwners>[0];
    assert.deepEqual(await asoDocumentOwners(adapter, "private:original"), [{ budgetUnitId: "ug" }]);
    assert.deepEqual(await asoDocumentOwners(adapter, "private:old-version"), [{ budgetUnitId: "ug" }]);
    assert.deepEqual(await asoDocumentOwners(adapter, "unrelated"), []);
    assert.equal((await db.query(`SELECT id FROM "SstAso" WHERE id='legacy'`)).rows.length, 1);
  } finally { await db.close(); }
});

function workflowContext(readOnly = false) {
  const corrections: { id: string; requestHash: string; createdById: string }[] = [];
  const origin = { id: "aso", budgetUnitId: "ug", personId: "worker", employeeId: "employee", createdAt: day };
  const replacement = { ...origin, id: "successor", createdAt: new Date("2026-10-02") };
  const tx = {
    $queryRaw: async () => corrections,
    $executeRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      if (strings.join("").includes("INSERT INTO")) corrections.push({ id: String(values[0]), requestHash: String(values[5]), createdById: String(values[6]) });
      return 1;
    },
    sstAso: { findUniqueOrThrow: async () => origin, findUnique: async ({ where }: { where: { id: string } }) => where.id === "successor" ? replacement : origin },
    auditEvent: { create: async () => ({}) },
  };
  const context = {
    user: { id: "user", role: "SST", profileCode: "SST_OPERATOR", modulePermissions: [], allowedBudgetUnitIds: ["ug"], permissions: JSON.stringify({ modules: { SST: { update: true } } }) },
    prisma: { sstAso: tx.sstAso, sstAccessGrant: { findUnique: async () => ({ isActive: true, canReadClinical: true, canAssess: !readOnly }) }, $transaction: async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx) },
  } as unknown as AppContext;
  return { context, corrections };
}
test("correction retry never mutates or duplicates issued origins, and clinical reader cannot correct", async () => {
  const raw = { asoId: "aso", kind: "ANNULMENT", reason: "Justificativa registrada", submissionKey: "2d161f17-63ca-4d57-9c87-82c4f74e4d5a" };
  const fixture = workflowContext();
  assert.equal(await correctAso(fixture.context, raw), raw.submissionKey);
  assert.equal(await correctAso(fixture.context, raw), raw.submissionKey);
  assert.equal(fixture.corrections.length, 1);
  await assert.rejects(correctAso(fixture.context, { ...raw, reason: "Justificativa alterada" }), /já corrigido/);
  const reader = workflowContext(true);
  await assert.rejects(correctAso(reader.context, raw), /clínica/);
  assert.equal(reader.corrections.length, 0);
});
test("follow-up checks UG clinical authorization before fetching records, slots, deadlines or GED links", async () => {
  let queried = false;
  const { context } = workflowContext();
  context.prisma = { sstAso: { findUnique: async () => ({ budgetUnitId: "other" }) }, $queryRaw: async () => { queried = true; return []; } } as unknown as AppContext["prisma"];
  await assert.rejects(readAsoFollowUp(context, "aso"), /Unidade Gestora/);
  assert.equal(queried, false);
});
test("ASO correction changes eSocial source hash/version and preserves predecessor provenance on successor", async () => {
  const { context } = workflowContext();
  let correction: { id: string; kind: string; replacementAsoId: string | null; requestHash: string } | undefined;
  let predecessor: { id: string; asoId: string; requestHash: string } | undefined = undefined;
  context.prisma = {
    sstAccessGrant: { findUnique: async () => ({ isActive: true, canReadClinical: true }) },
    sstDisciplineGrant: { findUnique: async () => ({ isActive: true, canRead: true }) },
    sstAso: { findFirst: async () => ({ id: "aso", employeeId: "employee", budgetUnitId: "ug", requestHash: "issued-hash", kind: "PERIODICO", result: "APTO", performedAt: day, examinerCouncil: "CRM PR 1", snapshot: { cpf: "12345678901", registration: "123", examinerName: "Médico" }, exams: [] }) },
    $queryRaw: async (strings: TemplateStringsArray) => strings.join("").includes('WHERE "replacementAsoId"=') ? predecessor ? [predecessor] : [] : correction ? [correction] : [],
  } as unknown as AppContext["prisma"];
  const original = await loadEsocialSource(context, "S2220", "aso", "ug");
  correction = { id: "correction", kind: "ANNULMENT", replacementAsoId: null, requestHash: "correction-hash" };
  const annulled = await loadEsocialSource(context, "S2220", "aso", "ug");
  assert.notEqual(original.sourceVersion, annulled.sourceVersion);
  assert.notEqual(original.sourceHash, annulled.sourceHash);
  assert.ok(annulled.missing.some((m) => m.includes("ASO anulado")));
  correction = undefined;
  predecessor = { id: "predecessor", asoId: "original-aso", requestHash: "predecessor-hash" };
  const successor = await loadEsocialSource(context, "S2220", "aso", "ug");
  assert.notEqual(original.sourceVersion, successor.sourceVersion);
  assert.ok(successor.missing.some((m) => m.includes("original-aso")));
});
