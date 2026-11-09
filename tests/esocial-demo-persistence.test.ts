import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { createLocalDrizzleDatabase } from './helpers/local-drizzle-database';
import { withDatabaseTransaction } from '../src/db/transaction';
import { runPersistedDemoCommand } from '../src/db/repositories/personnel-esocial-demo';
import { commandSchema, type DemoState } from '../src/lib/rh/esocial/contract';

test('migração consolidada, replay, rollback, isolamento e reset preservam evidências',async()=>{
  const fixture=await createLocalDrizzleDatabase();
  try{
    await fixture.database.exec(`CREATE TABLE "BudgetUnit"(id text PRIMARY KEY);CREATE TABLE "Usuario"(id text PRIMARY KEY);INSERT INTO "BudgetUnit" VALUES('unit'),('other');INSERT INTO "Usuario" VALUES('operator');`);
    await fixture.database.exec(readFileSync('db/migrations/20261108235000_cf06_esocial_demo/migration.sql','utf8'));
    await fixture.database.exec(`INSERT INTO "HrEsocialDemoEnvironment"("tenantId","employerId",enabled,"createdById") VALUES('tenant','unit',true,'operator'),('tenant','other',true,'operator');`);
    const input=commandSchema.parse({action:'COMPLETE',employerId:'unit',period:'2026-10',idempotencyKey:randomUUID()});
    let stored=0;
    const store=async(runId:string,a:{hash:string})=>{stored++;return `https://private.example/${runId}/${a.hash}`;};
    const run=(command=input)=>withDatabaseTransaction(fixture.connection,tx=>runPersistedDemoCommand(tx,'tenant','operator',command,store));
    const first=await run();assert.equal(first.replayed,false);assert.ok(stored>0);
    const count=stored,replay=await run();assert.equal(replay.runId,first.runId);assert.equal(replay.replayed,true);assert.equal(stored,count);
    await assert.rejects(()=>run({...input,action:'RESET'}),/idempotente/);
    const read=async(id:string)=>(await fixture.connection.db.execute<{state:DemoState}>(sql`SELECT state FROM "HrEsocialDemoRun" WHERE id=${id}`)).rows[0].state;
    const completed=await read(first.runId);assert.equal(completed.totalizers.length,9);assert.ok(completed.artifacts.every(a=>a.objectUrl));
    const again=await run({...input,idempotencyKey:randomUUID()});assert.equal(again.runId,first.runId);assert.equal((await read(first.runId)).totalizers.length,9);assert.equal(stored,count);
    await assert.rejects(()=>withDatabaseTransaction(fixture.connection,tx=>runPersistedDemoCommand(tx,'tenant','operator',{...input,employerId:'other',idempotencyKey:randomUUID()},async()=>{throw new Error('storage failed');})),/storage failed/);
    assert.equal((await fixture.connection.db.execute(sql`SELECT id FROM "HrEsocialDemoRun" WHERE "employerId"='other'`)).rows.length,0);
    const other=await run({...input,employerId:'other',idempotencyKey:randomUUID()});assert.notEqual(other.runId,first.runId);
    const reset=await run({...input,action:'RESET',idempotencyKey:randomUUID()});assert.notEqual(reset.runId,first.runId);assert.equal((await read(reset.runId)).generation,2);assert.equal((await read(first.runId)).totalizers.length,9);
    assert.equal((await fixture.connection.db.execute(sql`SELECT id FROM "HrEsocialDemoArtifact" WHERE "runId"=${first.runId}`)).rows.length,completed.artifacts.length);
    await assert.rejects(()=>fixture.connection.db.execute(sql`DELETE FROM "HrEsocialDemoCommand" WHERE "runId"=${first.runId}`),/Failed query/);
    await assert.rejects(()=>fixture.connection.db.execute(sql`UPDATE "HrEsocialDemoArtifact" SET hash='changed' WHERE "runId"=${first.runId}`),/Failed query/);
  }finally{await fixture.close();}
});
