import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("encaminhamento exige destinatário único e retorno posterior à referência", async () => {
  const db = new PGlite();
  try {
    await db.exec('CREATE TABLE "Person" (id TEXT PRIMARY KEY); CREATE TABLE "SocialFamily" (id TEXT PRIMARY KEY); CREATE TABLE "SocialUnit" (id TEXT PRIMARY KEY); CREATE TABLE "SocialCatalogEntry" (id TEXT PRIMARY KEY);');
    await db.exec(readFileSync("prisma/migrations-ibema/20261010100000_social_network_referrals/migration.sql", "utf8"));
    await db.exec(`INSERT INTO "Person" VALUES ('person'); INSERT INTO "SocialFamily" VALUES ('family'); INSERT INTO "SocialUnit" VALUES ('unit'); INSERT INTO "SocialCatalogEntry" VALUES ('reason'); INSERT INTO "SocialNetworkOrganization" (id,name,"organizationType","updatedAt") VALUES ('destination','Rede teste','Saúde',CURRENT_TIMESTAMP);`);
    const insert = 'INSERT INTO "SocialReferral" (id,"unitId","personId","familyId","destinationOrganizationId","reasonId",objective,"referredAt","createdBy","updatedAt") VALUES ($1,\'unit\',$2,$3,\'destination\',\'reason\',\'Atendimento\',\'2026-10-10\',\'actor\',CURRENT_TIMESTAMP)';
    await assert.rejects(db.query(insert, ["none", null, null]));
    await assert.rejects(db.query(insert, ["both", "person", "family"]));
    await db.query(insert, ["valid", "person", null]);
    await assert.rejects(db.exec(`UPDATE "SocialReferral" SET "counterReferenceAt"='2026-10-09' WHERE id='valid'`));
    await db.exec(`UPDATE "SocialReferral" SET status='RETURNED',"counterReferenceAt"='2026-10-11',"counterReferenceDescription"='Atendido no destino' WHERE id='valid'`);
    const result = await db.query<{ objective: string; status: string }>('SELECT objective,status FROM "SocialReferral" WHERE id=\'valid\'');
    assert.deepEqual(result.rows, [{ objective: "Atendimento", status: "RETURNED" }]);
    await assert.rejects(db.exec(`DELETE FROM "SocialNetworkOrganization" WHERE id='destination'`));
  } finally { await db.close(); }
});
