import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { exactDecimal, assertHomologation, assertRetry, accidentInput } from "../src/lib/sst/accident-policy";
import { restrictionInput } from "../src/lib/sst/restriction-policy";
import { addAccidentEvidence, registerAccident, readCat, listAccidents } from "../src/lib/sst/accident-service";
import { dispatchRestrictionEmails, readRestriction } from "../src/lib/sst/restriction-service";
import type { AppContext } from "../src/lib/platform/tenant-context";

const user: AppContext["user"] = { id: "actor", name: "SST", email: "sst@example.invalid", firebaseUid: "actor", profileCode: "SST_OPERATOR", role: "SST", modulePermissions: [], allowedBudgetUnitIds: ["ug"], employeeId: "employee", departmentId: null, secretariatId: null, permissions: JSON.stringify({ modules: { SST: { blocked: false, create: true, issueReports: true } } }) };
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
  let writes = 0;
  const cat = { id: "cat", budgetUnitId: "ug", employeeId: "employee", occurredAt: new Date("2026-10-01") };
  const make = (canAssess: boolean, canWrite: boolean) => ({ user: { ...user }, prisma: { $queryRaw: async () => [cat], sstAccessGrant: { findUnique: async () => ({ isActive: true, canReadClinical: true, canAssess }) }, sstDisciplineGrant: { findUnique: async () => ({ isActive: true, canRead: true, canWrite }) }, $transaction: async () => { writes++; } } } as unknown as AppContext);
  const input = { catId: "cat", submissionKey: raw.submissionKey, kind: "MEDICAL", data: { opinion: "Parecer favorável fundamentado" } };
  await assert.rejects(addAccidentEvidence(make(false, true), input), /clínica/);
  await assert.rejects(addAccidentEvidence(make(true, false), input), /atuação/);
  const context = make(true, true); context.user.allowedBudgetUnitIds = ["other"];
  await assert.rejects(readCat(context, "cat"), /Unidade Gestora/);
  await assert.rejects(readRestriction(context, "restriction"), /Unidade Gestora/);
  assert.equal(writes, 0);
});
test("signing a stale investigation revision is rejected rather than silently reassigned", async () => {
  const cat = { id: "cat", budgetUnitId: "ug", occurredAt: new Date("2026-10-01") };
  let query = 0, writes = 0;
  const tx = { $queryRaw: async () => { query++; return query <= 2 ? [] : [{ kind: "INVESTIGATION", version: 2, approved: false }]; }, $executeRaw: async () => { writes++; } };
  const context = { user, prisma: { $queryRaw: async () => [cat], sstAccessGrant: { findUnique: async () => ({ isActive: true, canReadClinical: true, canAssess: true }) }, sstDisciplineGrant: { findUnique: async () => ({ isActive: true, canRead: true, canWrite: true }) }, $transaction: async (fn: (db: typeof tx) => Promise<unknown>) => fn(tx) } } as unknown as AppContext;
  await assert.rejects(addAccidentEvidence(context, { catId: "cat", expectedVersion: 1, kind: "MEDICAL", submissionKey: raw.submissionKey, data: { opinion: "Parecer da revisão anterior" } }), /investigação foi revisada/);
  assert.equal(writes, 0);
});
test("portal identity cannot be replaced by employee ID and list scopes precede count", async () => {
  const context = { user: { ...user }, prisma: {} } as AppContext;
  await assert.rejects(registerAccident(context, { ...raw, employeeId: "another" }, true), /vínculo autenticado/);
  await assert.rejects(listAccidents(context, 1, "", "another"), /vínculo autenticado/);
  const sql: string[] = [];
  const scoped = { user, prisma: { budgetUnit: { findMany: async () => [] }, $queryRaw: async (strings: TemplateStringsArray) => { sql.push(strings.join("?")); return sql.length === 1 ? [{ total: BigInt(0) }] : []; } } } as unknown as AppContext;
  const result = await listAccidents(scoped, 500);
  assert.equal(result.page, 1); assert.equal(result.total, 0);
  assert.match(sql[0], /WHERE/); assert.match(sql[1], /ORDER BY.*LIMIT 20 OFFSET/);
});
test("CAT service retry reuses immutable source and rejects changed content, cross-UG and ambiguous lotation", async () => {
  let record: { id: string; createdById: string; requestHash: string } | undefined;
  let insertCount = 0, unitCount = 1;
  const tx = {
    budgetUnit: { findUnique: async () => ({ id: "ug", name: "Prefeitura", secretariatId: "s" }), count: async () => unitCount },
    employee: { findUnique: async () => ({ id: "employee", isActive: true, name: "Servidor", secretariatId: "s", registration: "123", roleId: "role", role: { name: "Operador" } }) },
    auditEvent: { create: async () => ({}) },
    $queryRaw: async () => record ? [record] : [],
    $executeRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      if (strings.join("").includes('INSERT INTO "SstCat"')) { insertCount++; record = { id: String(values[0]), requestHash: String(values[4]), createdById: String(values[5]) }; }
      return 1;
    },
  };
  const context = { user: { ...user }, prisma: { $transaction: async (fn: (db: typeof tx) => Promise<unknown>) => fn(tx) } } as unknown as AppContext;
  const id = await registerAccident(context, raw);
  assert.equal(await registerAccident(context, raw), id); assert.equal(insertCount, 1);
  await assert.rejects(registerAccident(context, { ...raw, agent: "Outro agente" }), /outros dados/);
  unitCount = 2;
  await assert.rejects(registerAccident(context, raw), /ambígua/);
  context.user.allowedBudgetUnitIds = [];
  await assert.rejects(registerAccident(context, raw), /Unidade Gestora/);
  assert.equal(insertCount, 1);
});
test("email outbox only marks sent after real provider receipt; failed delivery is not fabricated", async () => {
  const updates: string[] = [];
  let available = true;
  const tx = {
    $queryRaw: async () => { if (!available) return []; available = false; return [{ id: "outbox", recipient: "responsible@example.invalid", restrictionId: "restriction" }]; },
    $executeRaw: async (strings: TemplateStringsArray) => { updates.push(strings.join("?")); return 1; },
  };
  const context = { user, prisma: { budgetUnit: { findMany: async () => [{ id: "ug" }] }, $transaction: async (fn: (db: typeof tx) => Promise<unknown>) => fn(tx), $executeRaw: tx.$executeRaw } } as unknown as AppContext;
  assert.equal(await dispatchRestrictionEmails(context, async () => ({ receipt: "" })), 0);
  assert.ok(updates.some(s => s.includes("'FAILED'"))); assert.ok(!updates.some(s => s.includes("'SENT'")));
  available = true; updates.length = 0;
  assert.equal(await dispatchRestrictionEmails(context, async message => { assert.equal(message.idempotencyKey, "outbox"); assert.ok(!message.text.includes("CID")); return { receipt: "provider-accepted-123" }; }), 1);
  assert.ok(updates.some(s => s.includes("'SENT'")));
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
