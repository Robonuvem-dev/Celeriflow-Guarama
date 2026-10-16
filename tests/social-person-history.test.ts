import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { socialAmountCents, socialCentsDisplay } from "../src/lib/social/money";
import { factSchema, financialEntrySchema } from "../src/lib/social/history-input";
import { socialDocumentTemplates } from "../src/lib/social/document-templates";

test("histórico preserva identificação encerrada e permite nova identificação", async () => {
  const db = new PGlite();
  try {
    await db.exec('CREATE TABLE "Person" (id TEXT PRIMARY KEY); CREATE TABLE "SocialUnit" (id TEXT PRIMARY KEY);');
    await db.exec(readFileSync("prisma/migrations-ibema/20261010050000_social_suas_catalogs/migration.sql", "utf8"));
    await db.exec(readFileSync("prisma/migrations-ibema/20261010080000_social_person_history/migration.sql", "utf8"));
    await db.exec(`INSERT INTO "Person" VALUES ('person'); INSERT INTO "SocialUnit" VALUES ('unit'); INSERT INTO "SocialCatalogEntry" (id,kind,name,"updatedAt") VALUES ('catalog','VULNERABILITY','Teste',CURRENT_TIMESTAMP);`);
    const insert = 'INSERT INTO "SocialPersonFact" (id,"personId","catalogId","unitId",kind,"identifiedAt","createdBy","updatedAt") VALUES ($1,\'person\',\'catalog\',\'unit\',\'VULNERABILITY\',\'2026-01-01\',\'actor\',CURRENT_TIMESTAMP)';
    await db.query(insert, ["first"]);
    await assert.rejects(db.query(insert, ["duplicate"]));
    await assert.rejects(db.exec(`UPDATE "SocialPersonFact" SET "endedAt"='2025-01-01' WHERE id='first'`));
    await db.exec(`UPDATE "SocialPersonFact" SET "endedAt"='2026-02-01',"endingReason"='Superação registrada' WHERE id='first'`);
    await db.query(insert, ["second"]);
    const result = await db.query<{ count: number }>('SELECT COUNT(*)::integer AS count FROM "SocialPersonFact"');
    assert.equal(result.rows[0].count, 2);
    await assert.rejects(db.exec(`INSERT INTO "SocialFinancialEntry" (id,"personId","catalogId","unitId",kind,competence,value,"createdBy") VALUES ('bad','person','catalog','unit','INCOME','2026-01-01',-1,'actor')`));
  } finally { await db.close(); }
});

test("valores socioeconômicos preservam precisão em centavos", () => {
  const total = socialAmountCents("0.10") + socialAmountCents("0.20");
  assert.equal(total, BigInt(30));
  assert.equal(socialCentsDisplay(total), "R$ 0,30");
  assert.equal(socialCentsDisplay(-total), "-R$ 0,30");
  assert.throws(() => socialAmountCents("1.001"));
});

test("registros socioassistenciais rejeitam datas e valores inválidos", () => {
  assert.equal(factSchema.safeParse({ personId: "p", unitId: "u", catalogId: "c", kind: "VULNERABILITY", identifiedAt: "2026-02-30", observations: "" }).success, false);
  const base = { personId: "p", unitId: "u", catalogId: "c", kind: "INCOME", competence: "2026-01", employmentDescription: "", observations: "" };
  assert.equal(financialEntrySchema.safeParse({ ...base, value: "0" }).success, false);
  assert.equal(financialEntrySchema.safeParse({ ...base, value: "1.001" }).success, false);
  assert.equal(financialEntrySchema.safeParse({ ...base, value: "100.10" }).success, true);
});

test("modelos POC têm referências e identificadores de campo sem colisão", () => {
  const codes = socialDocumentTemplates.map((template) => template.code);
  assert.equal(new Set(codes).size, codes.length);
  for (const template of socialDocumentTemplates) {
    const keys = template.sections.flatMap((section) => section.fields.map((field) => field.key));
    assert.equal(new Set(keys).size, keys.length, template.code);
    assert.equal(template.version, "POC-1.0");
    assert.match(template.source, /^https:\/\//);
    assert.ok(template.signatures.length);
  }
});
