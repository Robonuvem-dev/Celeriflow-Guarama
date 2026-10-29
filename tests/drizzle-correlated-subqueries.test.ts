import assert from "node:assert/strict";
import test from "node:test";
import { loadMigrationSet } from "../scripts/database-migrate-files.mjs";
import { createLocalDrizzleDatabase } from "./helpers/local-drizzle-database";
import { listGedFolders } from "../src/db/repositories/documents/queries";
import { findMscCatalogVersion } from "../src/db/repositories/finance/msc-configuration";

test("correlated Drizzle projections count each outer folder/catalog instead of inner self IDs", { timeout: 120_000 }, async t => {
  const fixture = await createLocalDrizzleDatabase();
  try {
    for (const migration of loadMigrationSet().migrations) await fixture.database.exec(migration.executionSql);
    await fixture.database.exec(`
      INSERT INTO "Folder" (id,name,"updatedAt") VALUES ('corr-a','A',now()),('corr-b','B',now());
      INSERT INTO "Folder" (id,name,"parentId","updatedAt") VALUES ('corr-child-a','Filha A','corr-a',now());
      INSERT INTO "Document" (id,title,"documentType","fileUrl","folderId","updatedAt") VALUES
        ('corr-doc-1','Primeiro','Teste','/fixture/1','corr-a',now()),
        ('corr-doc-2','Segundo','Teste','/fixture/2','corr-a',now()),
        ('corr-doc-3','Terceiro','Teste','/fixture/3','corr-b',now());
      INSERT INTO "ConfiguracaoPerfil" (id,codigo,nome,permissoes,"updatedAt") VALUES ('corr-profile','CORR_FIXTURE','Fixture','{}',now());
      INSERT INTO "Usuario" (id,nome,email,"perfilId","updatedAt") VALUES ('corr-user','Fixture','corr@example.invalid','corr-profile',now());
      INSERT INTO "PlanningCatalogVersion" (id,year,label,"normativeReference","sourceHash","createdById") VALUES
        ('corr-version-a',2026,'A','Fixture','corr-a','corr-user'),
        ('corr-version-b',2026,'B','Fixture','corr-b','corr-user');
      INSERT INTO "PlanningCatalogEntry" (id,"versionId",kind,code,name,degree,"canonicalId",attributes) VALUES
        ('corr-entry-1','corr-version-a','ACCOUNT','CORR.1','Primeira',7,'corr-account-1','{}'),
        ('corr-entry-2','corr-version-a','ACCOUNT','CORR.2','Segunda',7,'corr-account-2','{}'),
        ('corr-entry-3','corr-version-b','ACCOUNT','CORR.3','Terceira',7,'corr-account-3','{}');
    `);
    await t.test("GED: asymmetric documents and child folders match independent grouped SQL", async () => {
      const folders = await listGedFolders(fixture.connection.db, null);
      assert.deepEqual(folders.map(folder => [folder.id, folder._count.documents, folder._count.children]), [["corr-a", 2, 1], ["corr-b", 1, 0]]);
      const oracle = await fixture.database.query<{ folderId: string; total: number }>('SELECT "folderId",count(*)::integer AS total FROM "Document" WHERE id LIKE \'corr-doc-%\' GROUP BY "folderId" ORDER BY "folderId"');
      assert.deepEqual(folders.map(folder => ({ folderId: folder.id, total: folder._count.documents })), oracle.rows);
    });
    await t.test("MSC: catalogs with different entry populations remain isolated", async () => {
      const first = await findMscCatalogVersion(fixture.connection.db, "corr-version-a");
      const second = await findMscCatalogVersion(fixture.connection.db, "corr-version-b");
      assert.ok(first); assert.ok(second);
      assert.equal(first._count.entries, 2);
      assert.equal(second._count.entries, 1);
      const oracle = await fixture.database.query<{ versionId: string; total: number }>('SELECT "versionId",count(*)::integer AS total FROM "PlanningCatalogEntry" WHERE id LIKE \'corr-entry-%\' GROUP BY "versionId" ORDER BY "versionId"');
      assert.deepEqual([{ versionId: first.id, total: first._count.entries }, { versionId: second.id, total: second._count.entries }], oracle.rows);
    });
  } finally { await fixture.close(); }
});
