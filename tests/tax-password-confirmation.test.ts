import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import type { DatabaseExecutor } from "../src/db/transaction";
import { assertPasswordIdentity, assertTaxPasswordConfirmation, grantTaxPasswordConfirmation, readTaxPasswordPreference, setTaxPasswordPreference } from "../src/lib/tributacao/password-confirmation";
test("confirmação exige senha recente da mesma conta e rejeita identidades/tokens antigos",()=>{
 const session={firebaseUid:"u1",email:"user@example.test"};const proof={uid:"u1",email:"user@example.test",auth_time:100,firebase:{sign_in_provider:"password"}};
 assert.doesNotThrow(()=>assertPasswordIdentity(session,proof,120000));
 assert.throws(()=>assertPasswordIdentity(session,{...proof,uid:"outro"},120000),/mesma conta/);
 assert.throws(()=>assertPasswordIdentity(session,{...proof,firebase:{sign_in_provider:"google.com"}},120000),/mesma conta/);
 assert.throws(()=>assertPasswordIdentity(session,proof,200000),/expirada/);
});
test("preferência por usuário bloqueia manutenções sem senha, expira e consome confirmação só uma vez",async()=>{
 const pg=new PGlite();try{
 await pg.exec(readFileSync("db/migrations/20261030121000_tax_password_confirmation/migration.sql","utf8"));const db=drizzle(pg) as unknown as DatabaseExecutor;
 const now=new Date("2026-10-30T12:00:00Z");
 assert.equal(await readTaxPasswordPreference(db,"u1"),false);await assertTaxPasswordConfirmation(db,"u1",now);
 await setTaxPasswordPreference(db,"u1",true);await assert.rejects(assertTaxPasswordConfirmation(db,"u1",now),/Confirmação de senha exigida/);
 await grantTaxPasswordConfirmation(db,"u1",100,now);await assertTaxPasswordConfirmation(db,"u1",now);await assert.rejects(assertTaxPasswordConfirmation(db,"u1",now),/exigida/);
 await assert.rejects(grantTaxPasswordConfirmation(db,"u1",100,now),/já foi usada/);
 await grantTaxPasswordConfirmation(db,"u1",101,now);await assert.rejects(assertTaxPasswordConfirmation(db,"u1",new Date(now.getTime()+61000)),/exigida/);
 await assertTaxPasswordConfirmation(db,"outro",now);
 await assert.rejects(setTaxPasswordPreference(db,"u1",false),/exigida/);
 await grantTaxPasswordConfirmation(db,"u1",102,new Date());await setTaxPasswordPreference(db,"u1",false);assert.equal(await readTaxPasswordPreference(db,"u1"),false);
 }finally{await pg.close();}
});
