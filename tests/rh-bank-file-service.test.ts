import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { createLocalDrizzleDatabase } from './helpers/local-drizzle-database';
import { sql } from 'drizzle-orm';
import type { DatabaseExecutor } from '../src/db/transaction';
import type { AppContext } from '../src/lib/platform/tenant-context';
import { SYSTEM_ADMIN_PROFILE_CODE } from '../src/lib/administration/c3-policy';
import { employees } from '../src/db/schema/administration';
import { hrEmploymentContracts, hrPayrollRuns, hrPayrollStatements, payrolls } from '../src/db/schema/personnel-workforce';
import { hrReferenceRecords } from '../src/db/schema/personnel-reference-records';
import { Decimal } from '../src/db/decimal';
import { generateBankFile, prepareBankFile, readBankFile } from '../src/lib/rh/bank-file-service';
import { enqueueHrIntegration } from '../src/db/repositories/personnel/integration';

test('geração bancária usa demonstrativo fechado e conta autorizada, preserva origem e confere downloads', async () => {
  const fixture = await createLocalDrizzleDatabase(), pg = fixture.database;
  try {
    for (const folder of ['../prisma/migrations-ibema/', '../db/migrations/']) {
      const directory = new URL(folder, import.meta.url);
      for (const migration of (await readdir(directory, { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name).sort()) await pg.exec(await readFile(new URL(`${migration}/migration.sql`, directory), 'utf8'));
    }
    const db: DatabaseExecutor = fixture.connection.db;
    await db.insert(employees).values({ id: 'holder', name: 'Nome atual' });
    await db.insert(hrEmploymentContracts).values({ id: 'contract', employeeId: 'holder', registration: '999', regimeId: 'regime', roleId: 'role', workLocation: 'Sede', admittedAt: new Date('2020-01-01'), salary: new Decimal(1000), details: {} });
    await db.insert(payrolls).values({ id: 'payroll', competence: '10/2026', type: 'Mensal' });
    await db.insert(hrPayrollRuns).values({ id: 'run', payrollId: 'payroll', requestKey: 'run', ruleSetId: 'rules', mode: 'OFICIAL', scope: 'DEMONSTRACAO', status: 'FECHADA', actorId: 'rh', snapshot: {}, gross: new Decimal(1000), deductions: new Decimal(30), net: new Decimal(970), employer: new Decimal(0) });
    const snapshot = { contract: { id: 'contract', employeeId: 'holder', registration: '001', employee: { name: 'Nome da competência', cpf: '52998224725' } }, items: [{ code: 'BASE', name: 'Vencimento', type: 'PROVENTO', value: '1000' }, { code: 'SINDICAL', name: 'Desconto', type: 'DESCONTO', value: '30' }] };
    await db.insert(hrPayrollStatements).values({ id: 'statement', runId: 'run', contractId: 'contract', gross: new Decimal(1000), deductions: new Decimal(30), net: new Decimal(970), employer: new Decimal(0), snapshot });
    const bank = (await db.execute<{ id: string }>(sql`SELECT id FROM "Bank" WHERE compe='001'`)).rows[0];
    await db.insert(hrReferenceRecords).values({ id: 'conv', kind: 'CONVENIO_BANCARIO', code: 'conv', name: 'Convênio documental', details: { bankId: bank.id, direction: 'CREDITO', from: '2026-01-01', until: '2026-12-31', source: 'Contrato' } });
    const account = { employeeId: 'holder', conventionId: 'conv', agency: '1234-X', account: '56789-0', accountType: 'CORRENTE', from: '2026-01-01', until: '2026-12-31', authorization: 'Autorização do titular' };
    await db.insert(hrReferenceRecords).values({ id: 'account', kind: 'CONTA_CONVENIO', code: 'account', name: 'Conta', details: account });
    const input = { runId: 'run', conventionId: 'conv', layout: 'BB_EDO001', payerName: 'Prefeitura Municipal de Vereda das Auroras', payerCnpj: '00000000000191', payerAgency: '1234', payerAgencyDv: 'X', payerAccount: '12345', payerAccountDv: '0', contract: '123456789', sequence: 1, extra: 0, paymentDate: '2026-11-05', generationDate: '2026-11-04' };
    const context = { user: { id: 'rh', profileCode: SYSTEM_ADMIN_PROFILE_CODE } } as AppContext;
    const before = JSON.stringify((await db.select().from(hrPayrollStatements))[0]);
    const output = await prepareBankFile(db, context, input);
    assert.equal(output.total, '970.00'); assert.equal(output.recipients[0].name, 'Nome da competência');
    assert.equal(output.recipients[0].registration, '001'); assert.equal(output.recipients[0].account, '56789');
    assert.equal((await prepareBankFile(db, context, { ...input, layout: 'BB_CNAB240_2026_06' })).bytes.toString().split('\r\n').filter(Boolean).length, 6);
    const generated = await generateBankFile(fixture.connection, context, input);
    assert.equal(generated.fileSha256, output.fileSha256);
    assert.equal((await generateBankFile(fixture.connection, context, input)).id, generated.id);
    await assert.rejects(() => generateBankFile(fixture.connection, context, { ...input, payerAccount: '12346' }), /já utilizado/);
    assert.equal((await readBankFile(db, context, generated.id)).bytes.compare(output.bytes), 0);
    const event = await enqueueHrIntegration(db, { sourceKey: 'bank-file', domain: 'AUDITORIA', environment: 'INTERNO', eventType: 'ARQUIVO_BANCARIO_RH_GERADO', payload: { ...output, bytes: undefined, fileBase64: output.bytes.toString('base64'), statementIds: ['statement'] } });
    const downloaded = await readBankFile(db, context, event.id);
    assert.equal(downloaded.bytes.compare(output.bytes), 0);
    assert.equal(JSON.stringify((await db.select().from(hrPayrollStatements))[0]), before);
    await db.insert(hrReferenceRecords).values({ id: 'duplicate', kind: 'CONTA_CONVENIO', code: 'duplicate', name: 'Conta concorrente', details: account });
    await assert.rejects(() => prepareBankFile(db, context, input), /única conta/);
    const denied = { user: { id: 'denied', profileCode: 'RESTRITO', allowedBudgetUnitIds: [], rolePermissions: {} } } as unknown as AppContext;
    await assert.rejects(() => readBankFile(db, denied, event.id), /fora do escopo|inexistente/);
    await assert.rejects(() => db.execute(sql`UPDATE "HrIntegrationEvent" SET payload=jsonb_set(payload,'{fileBase64}','"QUxURVJBRE8="') WHERE id=${event.id}`));
    const corrupt = await enqueueHrIntegration(db, { sourceKey: 'corrupt', domain: 'AUDITORIA', environment: 'INTERNO', eventType: 'ARQUIVO_BANCARIO_RH_GERADO', payload: { ...output, bytes: undefined, fileBase64: 'QUxURVJBRE8=', statementIds: ['statement'] } });
    await assert.rejects(() => readBankFile(db, context, corrupt.id), /diverge/);
  } finally { await fixture.close(); }
});
