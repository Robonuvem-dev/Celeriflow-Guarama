import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { exactDecimal, assertHomologation, assertRetry, accidentInput } from "../src/lib/sst/accident-policy";
import { restrictionInput } from "../src/lib/sst/restriction-policy";
import { addAccidentEvidence, registerAccident, readCat, listAccidents } from "../src/lib/sst/accident-service";
import { dispatchRestrictionEmails, readRestriction } from "../src/lib/sst/restriction-service";
import type { AppContext } from "../src/lib/platform/tenant-context";
import { createSstAccidentFixture } from "./helpers/sst-accident-fixture";

const user: AppContext["user"] = { id: "user", name: "SST", email: "sst@example.invalid", firebaseUid: "user", profileCode: "SST_OPERATOR", role: "SST", modulePermissions: [], allowedBudgetUnitIds: ["ug"], employeeId: "employee", departmentId: null, secretariatId: null, permissions: JSON.stringify({ modules: { SST: { blocked: false, create: true, issueReports: true } } }) };
const raw = { submissionKey: "779b172f-10c2-4325-bc32-d33cba4fdeaa", budgetUnitId: "ug", employeeId: "employee", occurredAt: "2026-10-01T12:00:00Z", location: "Oficina", description: "Ocorrência informada", kind: "TYPICAL", agent: "Máquina", bodyParts: ["Mão"], statement: "Depoimento colhido", witnesses: [] };

test("money is exact string decimal; stale or incomplete opinions never homologate", () => {
  assert.equal(exactDecimal("999999999999.99"), "999999999999.99");
  for (const bad of [0.1, "0.00", "1.001", "1e4", "-1.00", "NaN"]) assert.throws(() => exactDecimal(bad));
  assert.throws(() => assertHomologation(2, [{ kind: "TECHNICAL", version: 1, approved: true }, { kind: "MEDICAL", version: 2, approved: true }]));
  assert.throws(() => assertHomologation(1, [{ kind: "TECHNICAL", version: 1, approved: true }, { kind: "MEDICAL", version: 1, approved: false }]));
  assert.doesNotThrow(() => assertHomologation(1, [{ kind: "TECHNICAL", version: 1, approved: true }, { kind: "MEDICAL", version: 1, approved: true }]));
  assert.doesNotThrow(() => assertRetry({ requestHash: "h", createdById: "a" }, "h", "a"));
  assert.throws(() => assertRetry({ requestHash: "h", createdById: "a" }, "other", "a"));
  assert.throws(() => assertRetry({ requestHash: "h", createdById: "a" }, "h", "other"));
});
test("restriction validates dates, CID and unique role-attribute decisions", () => {
  const input = { submissionKey: raw.submissionKey, budgetUnitId: "ug", employeeId: "employee", professionalRoleId: "doctor", startsAt: "2026-10-01", endsAt: "2026-11-01", type: "Temporária", reason: "Avaliação médica", degree: "Parcial", cidCodes: ["M54.5"], attributes: [{ attributeId: "duty", allowed: false }] };
  assert.equal(restrictionInput.safeParse(input).success, true);
  assert.equal(restrictionInput.safeParse({ ...input, endsAt: "2026-09-01" }).success, false);
  assert.equal(restrictionInput.safeParse({ ...input, attributes: [...input.attributes, ...input.attributes] }).success, false);
  assert.equal(accidentInput.safeParse(raw).success, true);
  assert.equal(accidentInput.safeParse({ ...raw, kind: "INCIDENT", bodyParts: [], statement: "", agent: "", causeAnalysis: "Causa investigada e documentada" }).success, true);
  assert.equal(accidentInput.safeParse({ ...raw, kind: "INCIDENT", causeAnalysis: "" }).success, false);
});
test("clinical medicine writes deny administrative, read-only and cross-UG actors before transaction", async () => {
  const f = await createSstAccidentFixture();
  try {
    await f.seedCat(); await f.seedRestriction();
    const input = { catId: "cat", submissionKey: raw.submissionKey, kind: "MEDICAL", data: { opinion: "Parecer favorável fundamentado" } };
    await f.db.exec('UPDATE "SstAccessGrant" SET "canAssess"=false');
    await assert.rejects(addAccidentEvidence(f.context, input), /clínica/);
    await f.db.exec('UPDATE "SstAccessGrant" SET "canAssess"=true; UPDATE "SstDisciplineGrant" SET "canWrite"=false');
    await assert.rejects(addAccidentEvidence(f.context, input), /atuação/);
    f.context.user.allowedBudgetUnitIds = ["other"];
    await assert.rejects(readCat(f.context, "cat"), /Unidade Gestora/);
    await assert.rejects(readRestriction(f.context, "restriction"), /Unidade Gestora/);
    assert.equal((await f.db.query('SELECT id FROM "SstCatEvidence"')).rows.length, 0);
  } finally { await f.close(); }
});
test("signing a stale investigation revision is rejected rather than silently reassigned", async () => {
  const f = await createSstAccidentFixture();
  try {
    await f.seedCat();
    await f.db.exec(`INSERT INTO "SstCatEvidence" (id,"catId",kind,version,clinical,data,"createdById","submissionKey","requestHash") VALUES ('investigation','cat','INVESTIGATION',2,true,'{}','user','investigation','hash')`);
    await assert.rejects(addAccidentEvidence(f.context, { catId: "cat", expectedVersion: 1, kind: "MEDICAL", submissionKey: raw.submissionKey, data: { opinion: "Parecer da revisão anterior" } }), /investigação foi revisada/);
    assert.equal((await f.db.query('SELECT id FROM "SstCatEvidence"')).rows.length, 1);
  } finally { await f.close(); }
});
test("portal identity cannot be replaced by employee ID and list scopes precede count", async () => {
  const f = await createSstAccidentFixture();
  try {
    f.context.user = { ...user };
    await assert.rejects(registerAccident(f.context, { ...raw, employeeId: "another" }, true), /vínculo autenticado/);
    await assert.rejects(listAccidents(f.context, 1, "", "another"), /vínculo autenticado/);
    await f.seedCat(); f.context.user.allowedBudgetUnitIds = ["other"];
    const result = await listAccidents(f.context, 500);
    assert.equal(result.page, 1); assert.equal(result.total, 0); assert.equal(result.rows.length, 0);
  } finally { await f.close(); }
});
test("CAT service retry reuses immutable source and rejects changed content, cross-UG and ambiguous lotation", async () => {
  const f = await createSstAccidentFixture();
  try {
    f.context.user = { ...user };
    const id = await registerAccident(f.context, raw);
    assert.equal(await registerAccident(f.context, raw), id);
    await assert.rejects(registerAccident(f.context, { ...raw, agent: "Outro agente" }), /outros dados/);
    await f.db.exec(`INSERT INTO "BudgetUnit" (id,code,name,"secretariatId","updatedAt") VALUES ('ambiguous','AMB','Ambígua','s',now())`);
    await assert.rejects(registerAccident(f.context, raw), /ambígua/);
    f.context.user.allowedBudgetUnitIds = [];
    await assert.rejects(registerAccident(f.context, raw), /Unidade Gestora/);
    assert.equal((await f.db.query('SELECT id FROM "SstCat"')).rows.length, 1);
  } finally { await f.close(); }
});
test("email outbox only marks sent after real provider receipt; failed delivery is not fabricated", async () => {
  const f = await createSstAccidentFixture();
  try {
    await f.seedRestriction();
    assert.equal(await dispatchRestrictionEmails(f.context, async () => ({ receipt: "" })), 0);
    assert.deepEqual((await f.db.query('SELECT status,"providerReceipt" FROM "SstRestrictionEmailOutbox"')).rows, [{ status: "FAILED", providerReceipt: null }]);
    await f.db.exec(`UPDATE "SstRestrictionEmailOutbox" SET status='PENDING'`);
    assert.equal(await dispatchRestrictionEmails(f.context, async message => { assert.equal(message.idempotencyKey, "outbox"); assert.ok(!message.text.includes("CID")); return { receipt: "provider-accepted-123" }; }), 1);
    assert.deepEqual((await f.db.query('SELECT status,"providerReceipt" FROM "SstRestrictionEmailOutbox"')).rows, [{ status: "SENT", providerReceipt: "provider-accepted-123" }]);
  } finally { await f.close(); }
});
test("PostgreSQL guards current investigation, immutable evidence and exact reimbursement limits", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE "BudgetUnit"("id" text primary key); CREATE TABLE "Employee"("id" text primary key); CREATE TABLE "Usuario"("id" text primary key); CREATE TABLE "Person"("id" text primary key); CREATE TABLE "Role"("id" text primary key); CREATE TABLE "SstProfessionalRole"("id" text primary key); INSERT INTO "BudgetUnit" VALUES ('ug'); INSERT INTO "Employee" VALUES ('employee'); INSERT INTO "Usuario" VALUES ('actor');`);
    await db.exec(readFileSync(new URL("../prisma/migrations-ibema/20261011030000_add_sst_accidents/migration.sql", import.meta.url), "utf8"));
    await db.exec(`INSERT INTO "SstCat"("id","budgetUnitId","employeeId","submissionKey","requestHash","createdById","occurredAt","kind","source","data","snapshot") VALUES ('cat','ug','employee','k','h','actor','2026-10-01','TYPICAL','SST','{}','{}');`);
    const evidence = async (id: string, kind: string, version: number, clinical: boolean, approved = false) => db.query(`INSERT INTO "SstCatEvidence"("id","catId","kind","version","clinical","approved","data","createdById","submissionKey","requestHash") VALUES ($1,'cat',$2,$3,$4,$5,'{}','actor',$1,'h')`, [id, kind, version, clinical, approved]);
    await assert.rejects(evidence("early", "HOMOLOGATION", 1, false), /Investigation/);
    await evidence("inv", "INVESTIGATION", 1, true);
    await evidence("technical", "TECHNICAL", 1, false, true);
    await assert.rejects(evidence("incomplete", "HOMOLOGATION", 1, false), /favorable/);
    await evidence("medical", "MEDICAL", 1, true, true);
    await evidence("inv2", "INVESTIGATION", 2, true);
    await assert.rejects(evidence("stale", "HOMOLOGATION", 1, false), /Current/);
    await evidence("technical2", "TECHNICAL", 2, false, true);
    await evidence("medical2", "MEDICAL", 2, true, true);
    await evidence("approved", "HOMOLOGATION", 2, false);
    await assert.rejects(evidence("later", "INVESTIGATION", 3, true), /closed/);
    await assert.rejects(db.exec(`UPDATE "SstCatEvidence" SET "approved"=false WHERE "id"='medical2'`), /immutable/);
    await assert.rejects(db.exec(`DELETE FROM "SstCat" WHERE "id"='cat'`), /immutable/);
    const ledger = (id: string, kind: string, amount: string, expense: string | null) => db.query(`INSERT INTO "SstCatLedger"("id","catId","kind","amount","description","expenseId","createdById","submissionKey","requestHash") VALUES ($1,'cat',$2,$3,'Controle',$4,'actor',$1,'h')`, [id, kind, amount, expense]);
    await ledger("expense", "EXPENSE", "0.30", null);
    await ledger("refund1", "REIMBURSEMENT", "0.10", "expense");
    await ledger("refund2", "REIMBURSEMENT", "0.20", "expense");
    await assert.rejects(ledger("refund3", "REIMBURSEMENT", "0.01", "expense"), /exceeds/);
    await assert.rejects(ledger("wrong", "REIMBURSEMENT", "0.01", "missing"), /same CAT/);
    const amounts = await db.query<{ amount: string }>(`SELECT SUM("amount")::text amount FROM "SstCatLedger" WHERE "kind"='REIMBURSEMENT'`);
    assert.equal(amounts.rows[0].amount, "0.30");
    await assert.rejects(db.exec(`UPDATE "SstCatLedger" SET "amount"=5 WHERE "id"='expense'`), /immutable/);
    await db.exec(`INSERT INTO "SstProfessionalRole" VALUES ('doctor'); INSERT INTO "SstRestriction"("id","budgetUnitId","employeeId","professionalRoleId","startsAt","endsAt","data","createdById","submissionKey","requestHash") VALUES ('restriction','ug','employee','doctor','2026-01-01','2027-01-01','{}','actor','rk','h');`);
    await assert.rejects(db.exec(`INSERT INTO "SstRestrictionEmailOutbox"("id","restrictionId","recipient","dueAt","status") VALUES ('mail','restriction','mail@example.invalid',now(),'SENT')`), /check constraint/);
    await db.exec(`INSERT INTO "SstRestrictionFollowup"("id","restrictionId","followedAt","data","createdById","submissionKey","requestHash") VALUES ('release','restriction','2026-01-02','{"outcome":"RELEASE"}','actor','release','h');`);
    await assert.rejects(db.exec(`INSERT INTO "SstRestrictionFollowup"("id","restrictionId","followedAt","data","createdById","submissionKey","requestHash") VALUES ('later','restriction','2026-01-03','{"outcome":"MAINTAIN"}','actor','later','h');`), /closed/);
    await assert.rejects(db.exec(`UPDATE "SstRestrictionFollowup" SET "data"='{}'`), /immutable/);
  } finally { await db.close(); }
});
