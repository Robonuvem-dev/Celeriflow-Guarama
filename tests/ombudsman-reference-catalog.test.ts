import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { ombudsmanReferenceSchema } from "../src/lib/attendance/reference-catalog";
test("Ouvidoria cadastra assuntos por tipo, subassuntos e justificativas relacionais sem duplicação",async()=>{
 const base={kind:"SUBJECT",requestType:"Reclamação",name:" Serviço ",subjectId:null,subsubjectId:null,isActive:true};
 assert.equal(ombudsmanReferenceSchema.parse(base).name,"Serviço");
 assert.equal(ombudsmanReferenceSchema.safeParse({...base,kind:"JUSTIFICATION"}).success,false);
 assert.equal(ombudsmanReferenceSchema.safeParse({...base,requestType:"tipo inexistente"}).success,false);
 const database=new PGlite();
 try{
 await database.exec(await readFile(new URL("../db/migrations/20261030120500_ombudsman_reference_catalog/migration.sql",import.meta.url),"utf8"));
 await database.exec(`INSERT INTO "OmbudsmanReferenceCatalog" (id,kind,"requestType",name) VALUES ('subject','SUBJECT','Reclamação','Serviço'); INSERT INTO "OmbudsmanReferenceCatalog" (id,kind,"requestType",name,"subjectId") VALUES ('child','SUBSUBJECT','Reclamação','Prazo','subject'); INSERT INTO "OmbudsmanReferenceCatalog" (id,kind,"requestType",name,"subjectId","subsubjectId") VALUES ('reason','JUSTIFICATION','Reclamação','Atraso injustificado','subject','child')`);
 await assert.rejects(database.exec(`INSERT INTO "OmbudsmanReferenceCatalog" (id,kind,"requestType",name) VALUES ('duplicate','SUBJECT','Reclamação',' SERVIÇO ')`));
 await assert.rejects(database.exec(`INSERT INTO "OmbudsmanReferenceCatalog" (id,kind,"requestType",name) VALUES ('bad','JUSTIFICATION','Reclamação','Sem vínculos')`));
 assert.equal((await database.query('SELECT id FROM "OmbudsmanReferenceCatalog"')).rows.length,3);
 }finally{await database.close();}
});
