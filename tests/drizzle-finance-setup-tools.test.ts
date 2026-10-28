import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { and, asc, eq, getTableName, sql } from 'drizzle-orm';
import { Decimal } from '../src/db/decimal';
import type { DatabaseExecutor } from '../src/db/transaction';
import { withDatabaseTransaction } from '../src/db/transaction';
import * as tables from '../src/db/schema/finance-setup-tools';
import { adoptSetupBankSources, adoptSetupPostingRule, readSetupEvent, setupObject } from '../scripts/lib/finance-setup-tools';

function databaseCode(expected: string) {
  return (error: unknown): boolean => {
    while (error instanceof Error) {
      if ('code' in error && error.code === expected) return true;
      error = error.cause;
    }
    return false;
  };
}
async function configuration(db: DatabaseExecutor) {
  const values: Array<{ name: string; fingerprint: string }> = [];
  for (const name of [...new Set(Object.values(tables).map(getTableName))].sort()) {
    // Table names come exclusively from the test's physical projections.
    const [row] = (await db.execute<{ fingerprint: string }>(sql`SELECT md5(COALESCE(string_agg(to_jsonb(r)::text,'' ORDER BY to_jsonb(r)::text),'')) AS fingerprint FROM ${sql.identifier(name)} r`)).rows;
    values.push({ name, fingerprint: row.fingerprint });
  }
  return values;
}

test('Finance setup tools: twelve programs, real transactions, historical SQL and golden evidence', { timeout: 240_000 }, async t => {
  // Intentionally loaded only by the central integration run, never by AST/lint.
  const { createSpecializedDrizzleFixture } = await import('./helpers/specialized-drizzle-fixture');
  const fixture = await createSpecializedDrizzleFixture();
  try {
    await fixture.database.exec(await readFile('tests/fixtures/finance-setup-tools.sql', 'utf8'));
    const connection = fixture.connection, db = connection.db;
    const [historicalBank] = (await db.execute<{ id: string }>(sql`SELECT id FROM "Bank" WHERE compe='001'`)).rows;
    assert.ok(historicalBank, 'Bank reference 001 must come from historical SQL');
    const { prepareAccountingActor } = await import('../scripts/prepare-aurora-accounting-actor');
    const { prepareFinanceControl } = await import('../scripts/prepare-aurora-finance-control');
    const { prepareBudgetPostingMatrix } = await import('../scripts/prepare-aurora-budget-posting-matrix');
    const { preparePaymentPostingMatrix } = await import('../scripts/prepare-aurora-payment-posting-matrix');
    const { prepareRapPostingMatrix } = await import('../scripts/prepare-aurora-rap-posting-matrix');
    const { prepareRapRegistrationMatrix } = await import('../scripts/prepare-aurora-rap-registration-matrix');
    const { prepareBankResourceSources } = await import('../scripts/prepare-aurora-bank-resource-sources');
    const { inspectAnnualReference } = await import('../scripts/inspect-aurora-annual-reference');
    const { inspectRapReference } = await import('../scripts/inspect-aurora-rap-reference');
    const { verifyAnnualReadiness } = await import('../scripts/verify-aurora-annual-readiness');
    const { verifyResourceAvailability } = await import('../scripts/verify-aurora-resource-availability');
    const { repairFinancialYear8081 } = await import('../scripts/repair-financial-year-8081');

    await t.test('actor preview, functional link, exact evidence, replay and operator drift', async () => {
      const before = await configuration(db);
      const preview = await prepareAccountingActor(connection);
      assert.equal(preview.mode, 'READ_ONLY'); assert.equal(preview.linked, false);
      assert.deepEqual(await configuration(db), before);
      const result = await prepareAccountingActor(connection, true);
      assert.equal(result.usuarioId, 'setup-admin');
      assert.equal(result.employeeId, 'aurora-accounting-responsible-admin');
      assert.equal(result.authenticationCredentialsChanged, false);
      const [audit] = await db.select().from(tables.setupAudits).where(eq(tables.setupAudits.action, 'PREPARE_ACCOUNTING_ACTOR'));
      assert.deepEqual(audit.payload, { previousEmployeeId: null, employeeId: result.employeeId, decision: result.decision, parameterOrigin: 'OWNER_ESTIMATE', authenticationCredentialsChanged: false });
      const adopted = await configuration(db);
      assert.equal((await prepareAccountingActor(connection, true)).replay, true);
      assert.deepEqual(await configuration(db), adopted);
      await db.update(tables.setupUsers).set({ employeeId: null }).where(eq(tables.setupUsers.id, 'setup-admin'));
      await assert.rejects(prepareAccountingActor(connection, true), /Vínculo alterado após preparação/);
      await db.update(tables.setupUsers).set({ employeeId: result.employeeId }).where(eq(tables.setupUsers.id, 'setup-admin'));
    });

    await t.test('finance/control preview, late uniqueness failure rolls back all preceding work, then adoption/replay', async () => {
      const before = await configuration(db);
      const preview = await prepareFinanceControl(connection);
      assert.equal(preview.configurationHash, '5f09af7d66079f95bd7a71dd8e2b8bdde6892dec86cf5df1c064d9076ec8c440');
      assert.deepEqual(await configuration(db), before);
      const conflictingPlanId = 'aurora-finance-control-2026-v1:plan:leg';
      await db.insert(tables.setupControlPlans).values({ id: conflictingPlanId, title: 'Existing operator work', reference: 'Preserve', ownerId: 'setup-admin', budgetUnitId: 'p0-current-leg-ug-1' });
      const collision = await configuration(db);
      await assert.rejects(prepareFinanceControl(connection, true), databaseCode('23505'));
      assert.deepEqual(await configuration(db), collision);
      await db.delete(tables.setupControlPlans).where(eq(tables.setupControlPlans.id, conflictingPlanId));
      const result = await prepareFinanceControl(connection, true);
      assert.equal(result.financialFactsPreserved, true); assert.equal(result.replay, false);
      assert.deepEqual((await db.select({ status: tables.setupYears.status }).from(tables.setupYears)).map(row => row.status), ['Aberto', 'Aberto']);
      const banks = await db.select().from(tables.setupBankAccounts).orderBy(asc(tables.setupBankAccounts.id));
      assert.ok(banks.every(row => row.bankId === historicalBank.id));
      assert.deepEqual(banks.map(row => [row.id, row.currentBalanceDecimal?.toFixed(2), row.resourceSourceId]), [['aurora-finance-control-2026-v1:bank:exe', '0.00', 'aurora-source-1500'], ['aurora-finance-control-2026-v1:bank:leg', '0.00', 'aurora-source-1500']]);
      assert.deepEqual((await db.select().from(tables.setupCostPolicies)).map(row => row.effectiveFrom.toISOString()), ['2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z']);
      const checklist = await db.select().from(tables.setupControlEvents).where(eq(tables.setupControlEvents.eventType, 'CHECKLIST_PUBLISHED'));
      assert.equal(checklist.length, 2);
      const snapshot = setupObject(checklist[0].snapshot);
      assert.equal(snapshot.category, 'Gestão municipal'); assert.ok(Array.isArray(snapshot.groups));
      const adopted = await configuration(db);
      assert.equal((await prepareFinanceControl(connection, true)).replay, true);
      assert.deepEqual(await configuration(db), adopted);
    });

    await t.test('four matrices keep hashes, ordered pairs, scoped editions, audits and unchanged accounting facts', async () => {
      const preparations = [
        { run: prepareBudgetPostingMatrix, hash: '98cf05f30817e9afab91797428ee09b324f8fc2d464eafa58672f28850bb7d90', key: 'aurora-budget-posting-matrix-2026-v1', pairs: [['EMPENHO_EMITIDO', 'available', 'committed'], ['LIQUIDACAO_REGISTRADA', 'committed', 'settled']] },
        { run: preparePaymentPostingMatrix, hash: 'c235f129dd057db9050733f9857887fff580c6f69c16ab82d300df19ec0cbc10', key: 'aurora-payment-posting-matrix-2026-v1', pairs: [['PAGAMENTO_EFETIVADO', 'aurora-budget-posting-matrix-2026-v1:account:settled', 'paid']] },
        { run: prepareRapPostingMatrix, hash: '7c7e8a1d079012607b314e523a23793cb852f3a7dae1e1df09b8d3cc57ac5f53', key: 'aurora-rap-posting-matrix-2026-v1', pairs: [['RAP_NAO_PROCESSADO_LIQUIDACAO', 'unprocessed-pending', 'unprocessed-settled'], ['RAP_NAO_PROCESSADO_PAGAMENTO', 'unprocessed-settled', 'unprocessed-paid'], ['RAP_PROCESSADO_PAGAMENTO', 'processed-pending', 'processed-paid']] },
        { run: prepareRapRegistrationMatrix, hash: 'b45a7fc9c1ce5d93fbe19e62fc22936c9c1a1fd248f50d844fa78434cffeb226', key: 'aurora-rap-registration-matrix-2026-v1', pairs: [['RAP_NAO_PROCESSADO_INSCRICAO', 'aurora-budget-posting-matrix-2026-v1:account:committed', 'unprocessed-registered'], ['RAP_PROCESSADO_INSCRICAO', 'aurora-budget-posting-matrix-2026-v1:account:settled', 'processed-registered']] },
      ];
      for (const preparation of preparations) {
        const before = await configuration(db);
        const preview = await preparation.run(connection);
        assert.equal(preview.mode, 'READ_ONLY'); assert.equal(preview.configurationHash, preparation.hash);
        assert.deepEqual(await configuration(db), before);
        const result = await preparation.run(connection, true);
        assert.equal(result.replay, false); assert.equal(result.configurationHash, preparation.hash);
        for (const [code, debit, credit] of preparation.pairs) {
          const event = await readSetupEvent(db, code, true);
          assert.ok(event?.isActive); assert.equal(event.rules.length, 1);
          assert.deepEqual([event.rules[0].debitAccountId, event.rules[0].creditAccountId, event.rules[0].isReference, event.rules[0].components.length], [debit.includes(':') ? debit : `${preparation.key}:account:${debit}`, `${preparation.key}:account:${credit}`, false, 0]);
          const [audit] = await db.select().from(tables.setupAudits).where(and(eq(tables.setupAudits.action, 'UPSERT'), eq(tables.setupAudits.entityId, event.rules[0].id)));
          assert.deepEqual(setupObject(audit.payload).previousComponents, []);
          assert.deepEqual(setupObject(audit.payload).replacedRuleIds, []);
        }
        const editions = await db.select().from(tables.setupCatalogVersions).where(sql`${tables.setupCatalogVersions.id} LIKE ${`${preparation.key}:catalog:%`}`);
        assert.equal(editions.length, 2); assert.ok(editions.every(edition => edition.status === 'PUBLISHED' && edition.year === 2026));
        const adopted = await configuration(db);
        assert.equal((await preparation.run(connection, true)).replay, true);
        assert.deepEqual(await configuration(db), adopted);
      }
      assert.equal((await db.select().from(tables.setupTransactions)).length, 0);
      const event = await readSetupEvent(db, 'EMPENHO_EMITIDO', true); assert.ok(event);
      await db.update(tables.setupRules).set({ isReference: true }).where(eq(tables.setupRules.id, event.rules[0].id));
      await assert.rejects(prepareBudgetPostingMatrix(connection, true), /alterada após adoção/);
      await db.update(tables.setupRules).set({ isReference: false }).where(eq(tables.setupRules.id, event.rules[0].id));
    });

    await t.test('reference inspectors preserve prefixes, code order and JSON boolean versus string/null', async () => {
      const before = await configuration(db);
      const annual = await inspectAnnualReference(db), rap = await inspectRapReference(db);
      assert.equal(annual.sourceHash, '824d3dc03ad3f2d40abdbb10b2e2c5a30b590854af974be0a403fb12349d851a');
      assert.equal(annual.accounts.length, 8); assert.equal(rap.accounts.length, 5);
      assert.deepEqual(annual.accounts.map(row => row.code), [...annual.accounts.map(row => row.code)].sort());
      assert.ok(annual.accounts.every(row => !row.name.includes('Não escritural')));
      assert.ok(rap.accounts.every(row => setupObject(row.attributes).postingAllowed === true));
      assert.deepEqual(await configuration(db), before);
    });

    await t.test('multisource preview/apply/replay preserve primary source and audited permission set; drift is rejected', async () => {
      const before = await configuration(db);
      const preview = await prepareBankResourceSources(connection);
      assert.equal(preview.configurationHash, 'af9887ce9fa0596973b426401c291be7f03b2d27dca2a486551c55b8c74bf456');
      assert.deepEqual(await configuration(db), before);
      const result = await prepareBankResourceSources(connection, true);
      assert.equal(result.treasuryPreserved, true);
      const permissions = await db.select().from(tables.setupBankPermissions);
      assert.equal(permissions.length, 4); assert.ok(permissions.every(row => row.isActive));
      const audits = await db.select().from(tables.setupAudits).where(eq(tables.setupAudits.action, 'CONFIGURE_SOURCES'));
      assert.equal(audits.length, 2);
      assert.ok(audits.every(row => JSON.stringify(setupObject(row.payload).previousSources) === '[]'));
      const adopted = await configuration(db);
      assert.equal((await prepareBankResourceSources(connection, true)).replay, true);
      assert.deepEqual(await configuration(db), adopted);
      const permission = permissions[0];
      const condition = and(eq(tables.setupBankPermissions.bankAccountId, permission.bankAccountId), eq(tables.setupBankPermissions.resourceSourceId, permission.resourceSourceId));
      await db.update(tables.setupBankPermissions).set({ isActive: false }).where(condition);
      await assert.rejects(prepareBankResourceSources(connection, true), /alterada após adoção/);
      await db.update(tables.setupBankPermissions).set({ isActive: true }).where(condition);
    });

    await t.test('readiness and resource availability keep snapshots read-only, reject partial/empty scope and exact Decimal cash', async () => {
      await db.execute(sql`INSERT INTO "TreasuryMovement" (id,type,direction,"valueDecimal","bankAccountId","financialYearId","resourceSourceId",date) VALUES ('cash-large','ARRECADACAO','Entrada','90071992547409.93','aurora-finance-control-2026-v1:bank:exe','setup-year-exe','aurora-source-1500','2026-10-20 12:34:56.789'),('cash-cent','ARRECADACAO','Entrada','0.07','aurora-finance-control-2026-v1:bank:exe','setup-year-exe','aurora-source-1501','2026-10-20 12:34:56.789')`);
      const before = await configuration(db);
      const annual = await verifyAnnualReadiness(connection);
      assert.equal(annual.mode, 'READ_ONLY'); assert.equal(annual.evidence.length, 2);
      assert.ok(annual.evidence.every(row => row.partialOperatorRejected && !row.reportPersisted && !row.accountingFactsCreated && row.issuesByCode.MONTH_NOT_CLOSED === 12));
      const resource = await verifyResourceAvailability(connection);
      assert.equal(resource.evidence.length, 2);
      const executive = resource.evidence.find(row => row.governmentEntityId === 'p0-current-exe'); assert.ok(executive);
      assert.deepEqual(executive.rows.map(row => row.availableBalance), ['90071992547409.93', '0.07']);
      assert.equal(executive.rows.reduce((sum, row) => sum.plus(row.availableBalance), new Decimal('0')).toFixed(2), '90071992547410.00');
      assert.ok(resource.evidence.every(row => row.cashReconciled && row.unauthorizedReportRejected && row.fullEntity === false));
      assert.deepEqual(await configuration(db), before);
    });

    await t.test('transaction-only rule helper uses the real transaction and rolls its evidence back with the caller', async () => {
      const before = await configuration(db), rollback = new Error('technical rollback setup');
      await assert.rejects(withDatabaseTransaction(connection, async tx => {
        await adoptSetupPostingRule(tx, { usuarioId: 'setup-admin', employeeId: 'aurora-accounting-responsible-admin' }, { eventCode: 'SETUP_ROLLBACK', eventName: 'Technical fixture', debitAccountId: 'aurora-budget-posting-matrix-2026-v1:account:available', creditAccountId: 'aurora-budget-posting-matrix-2026-v1:account:committed' });
        assert.ok(await readSetupEvent(tx, 'SETUP_ROLLBACK'));
        throw rollback;
      }), error => error === rollback);
      assert.deepEqual(await configuration(db), before);
    });

    await t.test('all setup scopes reject a unit reassigned to another entity and preserve operator work', async () => {
      const condition = eq(tables.setupBindings.budgetUnitId, 'p0-current-exe-ug-1');
      await db.update(tables.setupBindings).set({ governmentEntityId: 'p0-current-leg' }).where(condition);
      try {
        const before = await configuration(db);
        for (const run of [prepareFinanceControl, prepareBudgetPostingMatrix, preparePaymentPostingMatrix, prepareRapPostingMatrix, prepareRapRegistrationMatrix, prepareBankResourceSources]) {
          await assert.rejects(run(connection, true), /UG|Escopo|Conta fora/);
          assert.deepEqual(await configuration(db), before);
        }
      } finally {
        await db.update(tables.setupBindings).set({ governmentEntityId: 'p0-current-exe' }).where(condition);
      }
      const before = await configuration(db);
      await assert.rejects(withDatabaseTransaction(connection, tx => adoptSetupBankSources(tx, { usuarioId: 'setup-admin', employeeId: 'aurora-accounting-responsible-admin' }, 'aurora-finance-control-2026-v1:bank:exe', ['aurora-source-1500'])), /saldo bancário pendente/);
      assert.deepEqual(await configuration(db), before);
      await assert.rejects(withDatabaseTransaction(connection, tx => tx.update(tables.setupCatalogVersions).set({ label: 'Overwrite forbidden' }).where(eq(tables.setupCatalogVersions.id, 'p1-tce-pr-account-2026-1.0d')).then(() => undefined)), databaseCode('P0001'));
      assert.deepEqual(await configuration(db), before);
    });

    await t.test('8081 repair validates exact known set, migrates thirteen movements, retains old audit and replays as no-op', async () => {
      await db.execute(sql`INSERT INTO "FinancialYear" (id,year,status,"startDate","endDate","updatedAt") VALUES ('repair-invalid',8081,'Aberto','8081-01-01','8081-12-31',CURRENT_TIMESTAMP),('repair-canonical',2026,'Aberto','2026-01-01','2026-12-31',CURRENT_TIMESTAMP)`);
      await db.execute(sql`INSERT INTO "Secretariat" (id,name,"updatedAt") VALUES ('repair-secretariat','Assist�ncia 6055',CURRENT_TIMESTAMP)`);
      await db.execute(sql`INSERT INTO "BudgetUnit" (id,code,name,"secretariatId","updatedAt") VALUES ('repair-unit','BU-6055','Legado','repair-secretariat',CURRENT_TIMESTAMP)`);
      await db.execute(sql`INSERT INTO "ResourceSource" (id,code,name,"updatedAt") VALUES ('repair-source','RS-6055','Legado',CURRENT_TIMESTAMP)`);
      await db.execute(sql`INSERT INTO "ExpenseNature" (id,code,name,"updatedAt") VALUES ('repair-nature','EN-6055','Legado',CURRENT_TIMESTAMP)`);
      await db.execute(sql`INSERT INTO "BudgetAppropriation" (id,code,"financialYearId","budgetUnitId","expenseNatureId","resourceSourceId","updatedAt") VALUES ('repair-appropriation','APP-6055','repair-invalid','repair-unit','repair-nature','repair-source',CURRENT_TIMESTAMP)`);
      await db.execute(sql`INSERT INTO "Expense" (id,description,value,"appropriationId","secretariatId","updatedAt") VALUES ('repair-expense-a','Legado',1,'repair-appropriation','repair-secretariat',CURRENT_TIMESTAMP),('repair-expense-b','Legado',2,'repair-appropriation','repair-secretariat',CURRENT_TIMESTAMP)`);
      await db.execute(sql`INSERT INTO "BankAccount" (id,"bankName",agency,"accountNumber","updatedAt") VALUES ('repair-bank','Fixture','1','1',CURRENT_TIMESTAMP)`);
      await db.execute(sql`INSERT INTO "TreasuryMovement" (id,type,direction,"valueDecimal","bankAccountId","financialYearId") SELECT 'repair-movement-'||n,'LEGACY','Entrada',0.01,'repair-bank','repair-invalid' FROM generate_series(1,12) n`);
      await db.insert(tables.setupAudits).values({ id: 'repair-old-evidence', action: 'ORIGINAL_SEED', entityType: 'FinancialYear', entityId: 'repair-invalid', financialYearId: 'repair-invalid', authorUsuarioId: 'setup-admin', payload: { original: true } });
      const invalid = await configuration(db);
      await assert.rejects(repairFinancialYear8081(connection), /massa inválida não corresponde/);
      assert.deepEqual(await configuration(db), invalid);
      await db.execute(sql`INSERT INTO "TreasuryMovement" (id,type,direction,"valueDecimal","bankAccountId","financialYearId") VALUES ('repair-movement-13','LEGACY','Entrada',0.01,'repair-bank','repair-invalid')`);
      assert.deepEqual(await repairFinancialYear8081(connection), { repaired: true, migratedMovements: 13, removedExpenses: 2 });
      const migrated = (await db.execute<{ financialYearId: string; valueDecimal: string }>(sql`SELECT "financialYearId","valueDecimal"::text FROM "TreasuryMovement" WHERE id LIKE 'repair-movement-%'`)).rows;
      assert.equal(migrated.length, 13); assert.ok(migrated.every(row => row.financialYearId === 'repair-canonical' && row.valueDecimal === '0.01'));
      assert.deepEqual((await db.select().from(tables.setupAudits).where(eq(tables.setupAudits.id, 'repair-old-evidence')))[0].payload, { original: true });
      const [audit] = await db.select().from(tables.setupAudits).where(eq(tables.setupAudits.action, 'CORRECAO_EXERCICIO_FINANCEIRO'));
      assert.equal(audit.financialYearId, 'repair-canonical');
      assert.equal(setupObject(audit.payload).removedAppropriationCode, 'APP-6055');
      const completed = await configuration(db);
      assert.deepEqual(await repairFinancialYear8081(connection), { repaired: false, reason: 'Exercício 8081 não encontrado.' });
      assert.deepEqual(await configuration(db), completed);
    });
  } finally {
    await fixture.close();
  }
});
