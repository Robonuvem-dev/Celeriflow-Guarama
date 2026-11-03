import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import { eq } from "drizzle-orm";
import { createLocalDrizzleDatabase } from "./helpers/local-drizzle-database";
import { withDatabaseTransaction } from "../src/db/transaction";
import { saveLegalText, setMasterDataActive } from "../src/db/repositories/registry/master-data-operations";
import { legalTexts, legalTextVersions } from "../src/db/schema/master-data";
import { insertAuditEvent } from "../src/db/repositories/platform/audit";
import type { LegalTextInput } from "../src/lib/contracts/master-data";

let fixture: Awaited<ReturnType<typeof createLocalDrizzleDatabase>>;
let sequence = 0;
before(async () => {
  fixture = await createLocalDrizzleDatabase();
  const migration = await readFile("prisma/migrations-ibema/20261010130000_add_master_data_foundation/migration.sql", "utf8");
  // Use the existing table definitions, not a new schema or a production database.
  for (const name of ["LegalText", "LegalTextVersion"]) {
    const start = migration.indexOf(`CREATE TABLE "${name}" (`);
    assert(start >= 0);
    await fixture.database.exec(migration.slice(start, migration.indexOf(";", start) + 1));
  }
  await fixture.database.exec(`
    CREATE UNIQUE INDEX ON "LegalText" (type,number,"governmentLevel","issuingBody");
    CREATE UNIQUE INDEX ON "LegalTextVersion" ("legalTextId","versionNumber");
    CREATE UNIQUE INDEX ON "LegalTextVersion" ("documentId");
    ALTER TABLE "LegalTextVersion" ADD FOREIGN KEY ("legalTextId") REFERENCES "LegalText"(id);
    CREATE TABLE "Usuario" (id text PRIMARY KEY); INSERT INTO "Usuario" VALUES ('actor');
    CREATE TABLE "AuditEvent" (id text PRIMARY KEY,"eventType" text NOT NULL,"targetType" text NOT NULL,"targetId" text NOT NULL,"actorUsuarioId" text NOT NULL REFERENCES "Usuario"(id),"createdAt" timestamp DEFAULT now());
  `);
});
after(async () => { await fixture?.close(); });
function input(overrides: Partial<LegalTextInput> = {}): LegalTextInput { return { type: "Lei", number: String(++sequence), summary: "Ementa fixture", governmentLevel: "MUNICIPAL", issuingBody: "Prefeitura fixture", governmentEntityId: null, publicationDate: new Date("2026-01-01T12:00:00Z"), effectiveFrom: null, effectiveUntil: null, ...overrides }; }
function save(id: string | null, data: LegalTextInput, content: string, expectedVersion?: number) {
  return withDatabaseTransaction(fixture.connection, async tx => {
    const result = await saveLegalText(tx, id, data, content, expectedVersion);
    await insertAuditEvent(tx, { actorUsuarioId: "actor", eventType: "ADMINISTRATIVE_MUTATION", targetType: "LEGAL_TEXT", targetId: result });
    return result;
  });
}
async function versions(id: string) { return withDatabaseTransaction(fixture.connection, tx => tx.select().from(legalTextVersions).where(eq(legalTextVersions.legalTextId, id)).orderBy(legalTextVersions.versionNumber)); }

test("municipal, estadual e federal reutilizam cadastro/versões existentes sem duplicar estrutura", async () => {
  for (const governmentLevel of ["MUNICIPAL", "ESTADUAL", "FEDERAL"]) {
    const data = input({ governmentLevel }); const id = await save(null, data, "Texto integral original");
    assert.equal((await versions(id))[0].content, "Texto integral original");
    await save(id, data, "Texto integral original", 1); assert.equal((await versions(id)).length, 1);
    await save(id, { ...data, effectiveUntil: new Date("2027-01-01T12:00:00Z") }, "Texto revisado", 1);
    const rows = await versions(id); assert.deepEqual(rows.map(r => r.versionNumber), [1, 2]); assert.equal(rows[0].content, "Texto integral original");
  }
});
test("edições simultâneas da mesma versão têm um vencedor e preservam a versão anterior", async () => {
  const data = input(); const id = await save(null, data, "Original");
  const results = await Promise.allSettled([save(id, data, "Revisão A", 1), save(id, data, "Revisão B", 1)]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  const failure = results.find(r => r.status === "rejected") as PromiseRejectedResult;
  assert.match(failure.reason.message, /outra pessoa/);
  const rows = await versions(id); assert.deepEqual(rows.map(r => r.versionNumber), [1, 2]); assert.equal(rows[0].content, "Original");
  const audits = await fixture.database.query<{ count: number }>('SELECT count(*)::int AS count FROM "AuditEvent" WHERE "targetId"=$1', [id]);
  assert.equal(audits.rows[0].count, 2);
});
test("33.8: os oito tipos municipais preservam o texto integral e a ementa sem limitação por categoria", async () => {
  const content = "Conteúdo integral com acentos, artigos e disposições transitórias.\n".repeat(1000);
  for (const type of ["Lei Orgânica", "Plano Plurianual", "LDO", "Lei", "Decreto", "Portaria", "Resolução", "Ato Normativo"]) {
    const data = input({ type }); const id = await save(null, data, content);
    const rows = await versions(id); assert.equal(rows[0].content, content); assert.equal(rows[0].summary, data.summary);
    const stored = await withDatabaseTransaction(fixture.connection, tx => tx.select().from(legalTexts).where(eq(legalTexts.id, id)));
    assert.equal(stored[0].type, type); assert.equal(stored[0].governmentLevel, "MUNICIPAL");
  }
});
test("consumidores legados sem token mantêm contrato e sequenciam versões sem conflito", async () => {
  const data = input(); const id = await save(null, data, "Original");
  const ids = await Promise.all([save(id, data, "A"), save(id, data, "B")]);
  assert.deepEqual(ids, [id, id]); assert.deepEqual((await versions(id)).map(r => r.versionNumber), [1, 2, 3]);
});
test("mudança de metadados invalida editores antigos mesmo sem mudar o conteúdo", async () => {
  const data = input(); const id = await save(null, data, "Original");
  await save(id, { ...data, issuingBody: "Câmara fixture" }, "Original", 1);
  await assert.rejects(save(id, data, "Sobrescrita antiga", 1), /outra pessoa/);
  assert.equal((await versions(id)).length, 2);
});
test("edição de norma inativa não cria versão falsamente vigente", async () => {
  const data = input(); const id = await save(null, data, "Original");
  await withDatabaseTransaction(fixture.connection, tx => setMasterDataActive(tx, "legalTexts", id, false));
  await save(id, data, "Revisão inativa", 1);
  assert.equal((await versions(id))[1].status, "INATIVO");
});
test("falha de auditoria reverte conteúdo, metadados e número da versão", async () => {
  const data = input(); const id = await save(null, data, "Original");
  await assert.rejects(withDatabaseTransaction(fixture.connection, async tx => {
    await saveLegalText(tx, id, { ...data, summary: "Não persistir" }, "Não persistir", 1);
    await insertAuditEvent(tx, { actorUsuarioId: "inexistente", eventType: "ADMINISTRATIVE_MUTATION", targetType: "LEGAL_TEXT", targetId: id });
  }));
  assert.equal((await versions(id)).length, 1);
  const row = await withDatabaseTransaction(fixture.connection, tx => tx.select().from(legalTexts).where(eq(legalTexts.id, id)));
  assert.equal(row[0].summary, data.summary);
});
test("versão inválida, norma inexistente e duplicidade falham sem gravações parciais", async () => {
  const data = input(); const id = await save(null, data, "Original");
  for (const token of [-1, 0, 2, 1.5, Number.NaN]) await assert.rejects(save(id, data, "Inválido", token), /outra pessoa/);
  await assert.rejects(save("inexistente", data, "Inválido", 1), /não encontrado/);
  await assert.rejects(save(null, data, "Duplicado")); assert.equal((await versions(id)).length, 1);
});
