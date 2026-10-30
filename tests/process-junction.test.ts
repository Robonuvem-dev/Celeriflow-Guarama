import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import type { DatabaseTransaction } from "../src/db/transaction";
import { joinProcesses,undoProcessJunction } from "../src/lib/protocols/junction-service";
test("junção reversível impede auto-vínculo, ciclo, duplicação, setor indevido e preserva auditoria",async()=>{
 const engine=new PGlite(),database=drizzle(engine);
 try{
 await engine.exec(`CREATE TABLE "Process" (id text PRIMARY KEY,"currentDepartmentId" text,status text); CREATE TABLE "Usuario" (id text PRIMARY KEY); INSERT INTO "Usuario" VALUES ('actor'); INSERT INTO "Process" VALUES ('a','dept','Recebido'),('b','dept','Recebido'),('c','dept','Recebido'),('foreign','other','Recebido'),('closed','dept','Arquivado'); CREATE TABLE "AuditEvent" (id text PRIMARY KEY,"actorUsuarioId" text NOT NULL,"eventType" text NOT NULL,"targetType" text NOT NULL,"targetId" text NOT NULL,"createdAt" timestamp DEFAULT now());`);
 await engine.exec(await readFile(new URL("../db/migrations/20261030120700_process_junction/migration.sql",import.meta.url),"utf8"));
 const join=(parentId:string,childId:string)=>database.transaction(tx=>joinProcesses(tx as unknown as DatabaseTransaction,{parentId,childId,departmentId:"dept",actorId:"actor",reason:"Justificativa de teste válida"}));
 await assert.rejects(join("a","a"),/si próprio/);
 await assert.rejects(join("a","foreign"),/setor atual/);
 await assert.rejects(join("a","closed"),/andamento/);
 const first=await join("a","b");await assert.rejects(join("c","b"),/junção ativa/);
 await join("b","c");await assert.rejects(join("c","a"),/ciclo/);
 await database.transaction(tx=>undoProcessJunction(tx as unknown as DatabaseTransaction,{id:first.id,departmentId:"dept",actorId:"actor",reason:"Separação justificada para teste"}));
 await assert.rejects(database.transaction(tx=>undoProcessJunction(tx as unknown as DatabaseTransaction,{id:first.id,departmentId:"dept",actorId:"actor",reason:"Não repetir a operação"})),/desfeita/);
 await join("a","b");
 const links=await engine.query<{endedAt:string|null}>('SELECT "endedAt" FROM "ProcessJunction"');assert.equal(links.rows.length,3);assert.equal(links.rows.filter(row=>row.endedAt).length,1);
 assert.equal((await engine.query('SELECT id FROM "AuditEvent"')).rows.length,4);
 }finally{await engine.close();}
});
