import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { sql } from 'drizzle-orm';
import { createLocalDrizzleDatabase } from './helpers/local-drizzle-database';
import { employeeIdentifierIndex } from '../src/lib/rh/employee-identifiers';
import { withDatabaseTransaction } from '../src/db/transaction';

test('migração numera pelo cadastro local, mantém vínculos e reserva números para todos os caminhos de escrita', async () => {
  const fixture = await createLocalDrizzleDatabase();
  const db = fixture.connection.db;
  try {
    await fixture.database.exec(`CREATE TABLE "Employee"(id text PRIMARY KEY,name text,registration text,"createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE "Contract"(id text PRIMARY KEY,"employeeId" text REFERENCES "Employee"(id),registration text,snapshot jsonb);
      INSERT INTO "Employee"(id,name,registration,"createdAt") VALUES
        ('a','Primeiro','OLD-1','2026-11-09 02:59:59'),
        ('c','Terceiro','OLD-3','2026-11-09 03:00:00'),
        ('b','Segundo','OLD-2','2026-11-09 03:00:00');
      INSERT INTO "Contract" VALUES('contract','a','OLD-CONTRACT','{"registration":"OLD-1"}');`);
    await fixture.database.exec(readFileSync('db/migrations/20261109160000_employee_registration_standard/migration.sql','utf8'));
    const read = async (id: string) => (await db.execute<{registration:string;createdAt:string}>(sql`SELECT registration,"createdAt" FROM "Employee" WHERE id=${id}`)).rows[0];
    assert.equal((await read('a')).registration,'2026110800001');
    assert.equal((await read('b')).registration,'2026110900001');
    assert.equal((await read('c')).registration,'2026110900002');
    assert.deepEqual((await db.execute(sql`SELECT "employeeId",registration,snapshot FROM "Contract"`)).rows,[{employeeId:'a',registration:'OLD-CONTRACT',snapshot:{registration:'OLD-1'}}]);
    assert.equal((await db.execute<{previousRegistration:string}>(sql`SELECT "previousRegistration" FROM "EmployeeRegistrationAllocation" WHERE "employeeId"='a'`)).rows[0].previousRegistration,'OLD-1');
    await db.execute(sql`UPDATE "Employee" SET name='Nome alterado',registration='ARBITRARY' WHERE id='a'`);
    assert.equal((await read('a')).registration,'2026110800001');
    await db.execute(sql`INSERT INTO "Employee"(id,registration,"createdAt") VALUES('a','SEED','2020-01-01') ON CONFLICT(id) DO UPDATE SET registration=excluded.registration`);
    assert.equal((await read('a')).registration,'2026110800001');
    await assert.rejects(()=>db.execute(sql`UPDATE "Employee" SET "createdAt"='2020-01-01' WHERE id='a'`));
    await assert.rejects(()=>db.execute(sql`UPDATE "EmployeeRegistrationAllocation" SET registration='2026110809999' WHERE "employeeId"='a'`));
    const allocate = (id:string) => db.execute(sql`INSERT INTO "Employee"(id,registration,"createdAt") VALUES(${id},'supplied-number','2026-11-09 15:00:00') RETURNING registration`);
    await Promise.all(Array.from({length:8},(_,index)=>allocate(`new-${index}`)));
    const issued = (await db.execute<{registration:string}>(sql`SELECT registration FROM "Employee" WHERE id LIKE 'new-%' ORDER BY registration`)).rows.map(r=>r.registration);
    assert.equal(new Set(issued).size,8);
    assert.equal(issued[0],'2026110900003');assert.equal(issued.at(-1),'2026110900010');
    await db.execute(sql`DELETE FROM "Employee" WHERE id LIKE 'new-%'`);
    await allocate('after-delete');assert.equal((await read('after-delete')).registration,'2026110900011');
    await assert.rejects(()=>withDatabaseTransaction(fixture.connection, async tx=>{
      await tx.execute(sql`INSERT INTO "Employee"(id,"createdAt") VALUES('rollback','2026-11-09 15:00:00')`);
      throw new Error('intentional rollback');
    }),/intentional rollback/);
    assert.equal(await read('rollback'),undefined);
    // Boundary of a five-digit code rejects overflow rather than truncating it.
    await db.execute(sql`UPDATE "EmployeeRegistrationCounter" SET "lastNumber"=99999 WHERE day='2026-11-09'`);
    await assert.rejects(()=>allocate('overflow'));
    assert.equal(await read('overflow'),undefined);
  } finally { await fixture.close(); }
});

test('importações aceitam matrícula nova e anterior, sem resolver códigos ambíguos para outra pessoa', () => {
  const resolve = employeeIdentifierIndex([
    {id:'a',registration:'2026110800001',cpf:'123.456.789-01'},
    {id:'b',registration:'2026110800002',cpf:null},
  ],[
    {employeeId:'a',registration:'004218'},
    {employeeId:'b',registration:'TI-2026-001'},
    {employeeId:'a',registration:'DUP'},
    {employeeId:'b',registration:'DUP'},
    {employeeId:'inactive',registration:'OLD-INACTIVE'},
  ]);
  assert.equal(resolve('2026110800001'),'a');assert.equal(resolve('004218'),'a');
  assert.equal(resolve(' ti-2026-001 '),'b');assert.equal(resolve('12345678901'),'a');
  assert.equal(resolve('DUP'),undefined);assert.equal(resolve('OLD-INACTIVE'),undefined);
  assert.equal(resolve('XXX12345678901'),undefined);assert.equal(resolve('UNKNOWN'),undefined);
});
