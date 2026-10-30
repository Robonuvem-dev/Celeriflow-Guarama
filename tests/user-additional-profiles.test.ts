import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { readFile } from "node:fs/promises";
import { canViewModule,canEditModule,canPerformModuleOperation,isSystemAdministrator,isModuleBlockedForUser } from "../src/lib/platform/tenant-context";
import type { PermissionUser } from "../src/lib/contracts/identity";
import type { DatabaseExecutor } from "../src/db/transaction";
import { readAdditionalProfiles } from "../src/db/repositories/platform/additional-profiles";
const matrix=(modules:Record<string,object>)=>JSON.stringify({modules});
const user:PermissionUser={id:"u",firebaseUid:"f",email:"user@example.test",name:"Usuário",role:"Consulta",profileCode:"READ",permissions:matrix({TRIBUTACAO:{blocked:false,create:false,update:false,delete:false,issueReports:false}}),modulePermissions:[],allowedBudgetUnitIds:[],employeeId:null,departmentId:null,secretariatId:null};
test("perfis complementares somam operações ativas e preservam restrições individuais e perfil principal",()=>{
 assert.equal(canViewModule(user,"TRIBUTACAO"),true);assert.equal(canPerformModuleOperation(user,"TRIBUTACAO","create"),false);
 const combined={...user,additionalProfiles:[{id:"p2",code:"FISCAL_EDITOR",name:"Fiscal editor",permissions:matrix({TRIBUTACAO:{blocked:false,create:true,update:true,delete:false,issueReports:true},PROCESSOS:{blocked:false,create:false,update:false,delete:false,issueReports:false}})}]};
 assert.equal(canPerformModuleOperation(combined,"TRIBUTACAO","create"),true);
 assert.equal(canPerformModuleOperation(combined,"TRIBUTACAO","delete"),false);
 assert.equal(canPerformModuleOperation(combined,"TRIBUTACAO","issueReports"),true);
 assert.equal(canEditModule(combined,"TRIBUTACAO"),true);assert.equal(canViewModule(combined,"PROCESSOS"),true);assert.equal(isModuleBlockedForUser(combined,"PROCESSOS"),false);
 assert.equal(isSystemAdministrator(combined),false);
 const restricted={...combined,modulePermissions:[{code:"TRIBUTACAO",canView:true,canEdit:false}]};
 assert.equal(canPerformModuleOperation(restricted,"TRIBUTACAO","update"),false);assert.equal(canViewModule(restricted,"PROCESSOS"),false);
 assert.equal(combined.profileCode,"READ");
});
test("identidade lê somente memberships ativos, sem duplicatas, com restauração legacy sem tabela",async()=>{
 const engine=new PGlite();const database=drizzle(engine) as unknown as DatabaseExecutor;
 try{
 await engine.exec('CREATE TABLE "Usuario" (id text PRIMARY KEY); CREATE TABLE "ConfiguracaoPerfil" (id text PRIMARY KEY,codigo text,nome text,permissoes text,ativo boolean); INSERT INTO "Usuario" VALUES (\'u\'); INSERT INTO "ConfiguracaoPerfil" VALUES (\'active\',\'EDIT\',\'Editor\',\'{}\',true),(\'inactive\',\'OLD\',\'Antigo\',\'{}\',false);');
 assert.deepEqual(await readAdditionalProfiles(database,"u"),[]);
 await engine.exec(await readFile(new URL("../db/migrations/20261030120600_user_additional_profiles/migration.sql",import.meta.url),"utf8"));
 await engine.exec(`INSERT INTO "UsuarioPerfilAdicional" VALUES ('u','active'),('u','inactive')`);
 assert.deepEqual((await readAdditionalProfiles(database,"u")).map(profile=>profile.id),["active"]);
 await assert.rejects(engine.exec(`INSERT INTO "UsuarioPerfilAdicional" VALUES ('u','active')`));
 await engine.exec(`DELETE FROM "Usuario" WHERE id='u'`);assert.equal((await engine.query('SELECT * FROM "UsuarioPerfilAdicional"')).rows.length,0);
 }finally{await engine.close();}
});
