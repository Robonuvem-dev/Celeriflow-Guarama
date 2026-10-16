import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("habilitação de construtora exige referência real e vigência válida; histórico é imutável", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE "Company" (id TEXT PRIMARY KEY); CREATE FUNCTION "construction_config_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Immutable'; END; $$; INSERT INTO "Company" VALUES ('company')`);
    await db.exec(readFileSync("prisma/migrations-ibema/20261010270000_construction_company_validity/migration.sql","utf8"));
    const insert = `INSERT INTO "ConstructionCompanyProfile" (id,"companyId","startsAt","endsAt","legalReference","createdBy","updatedAt") VALUES ($1,$2,$3,$4,'Teste demonstrativo','actor',CURRENT_TIMESTAMP)`;
    await assert.rejects(db.query(insert,["invalid","company","2026-10-10","2026-10-09"]));
    await assert.rejects(db.query(insert,["missing","unknown","2026-01-01","2026-12-31"]));
    await db.query(insert,["profile","company","2026-01-01","2026-12-31"]);
    await assert.rejects(db.query(insert,["duplicate","company","2026-01-01","2026-12-31"]));
    await db.exec(`INSERT INTO "ConstructionCompanyProfileEvent" (id,"profileId","actorId","before","after") VALUES ('event','profile','actor','{}','{"isActive":true}'); UPDATE "ConstructionCompanyProfile" SET "isActive"=false WHERE id='profile'`);
    await assert.rejects(db.exec(`UPDATE "ConstructionCompanyProfileEvent" SET "after"='{}' WHERE id='event'`));
    await assert.rejects(db.exec(`DELETE FROM "ConstructionCompanyProfileEvent" WHERE id='event'`));
    await assert.rejects(db.exec(`DELETE FROM "Company" WHERE id='company'`));
    const history = await db.query<{ after: { isActive: boolean } }>(`SELECT "after" FROM "ConstructionCompanyProfileEvent" WHERE id='event'`);
    assert.equal(history.rows[0].after.isActive,true);
  } finally { await db.close(); }
});
