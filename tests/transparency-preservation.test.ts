import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {PGlite} from "@electric-sql/pglite";

test("banco preserva bytes/versão e retirada, permitindo classificação editorial",async()=>{
 const db=new PGlite();
 try{
  await db.exec(await readFile("prisma/migrations-ibema/20261013010000_transparency_publications/migration.sql","utf8"));
  await db.exec(await readFile("prisma/migrations-ibema/20261013030000_transparency_file_preservation/migration.sql","utf8"));
  await db.query(`INSERT INTO "TransparencyPublication" (id,"publicKey","collectionSlug",entity,year,title,"group","referencePeriod","values","updatedAt","fileUrl","filePathname","sha256") VALUES ('one','public-one','publicacoes','prefeitura',2026,'Teste','Saúde','2026','{}',now(),'blob-private','instances/test/documents/file',$1)`,["a".repeat(64)]);
  await db.exec(`UPDATE "TransparencyPublication" SET status='PUBLISHED',"publishedAt"=now() WHERE id='one'`);
  await assert.rejects(db.exec(`UPDATE "TransparencyPublication" SET "sha256"='${"b".repeat(64)}' WHERE id='one'`),/immutable/);
  await assert.rejects(db.exec(`DELETE FROM "TransparencyPublication" WHERE id='one'`),/preserved/);
  await db.exec(`UPDATE "TransparencyPublication" SET title='Título conferido' WHERE id='one'`);
  await db.exec(`UPDATE "TransparencyPublication" SET status='WITHDRAWN',"withdrawnAt"=now() WHERE id='one'`);
  await assert.rejects(db.exec(`UPDATE "TransparencyPublication" SET status='PUBLISHED' WHERE id='one'`),/preserved/);
 }finally{await db.close();}
});
