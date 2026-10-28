import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { and, asc, eq, getTableName, inArray, sql } from 'drizzle-orm';
import type { DatabaseExecutor } from '../src/db/transaction';
import { withDatabaseTransaction } from '../src/db/transaction';
import { Decimal } from '../src/db/decimal';
import * as m from '../src/db/schema/municipal-setup-tools';
import * as p from '../src/db/schema/municipal-setup-personnel';
import { hrEmploymentContracts, hrEmploymentRevisions, hrIntegrationEvents, hrPayrollRuns, hrPayrollStatements, hrRightEntries } from '../src/db/schema/personnel-workforce';

async function fingerprint(db: DatabaseExecutor) {
  const names = [...new Set([...Object.values(m), ...Object.values(p)].map(getTableName)), 'HrEmploymentContract', 'HrEmploymentRevision', 'HrIntegrationEvent', 'HrPayrollRun', 'HrPayrollStatement', 'HrRightEntry', 'PayrollItem', 'AccountingTransaction'];
  const result: Array<{ name: string; fingerprint: string }> = [];
  for (const name of names.sort()) {
    const [row] = (await db.execute<{ fingerprint: string }>(sql`SELECT md5(COALESCE(string_agg(to_jsonb(r)::text,'' ORDER BY to_jsonb(r)::text),'')) AS fingerprint FROM ${sql.identifier(name)} r`)).rows;
    result.push({ name, fingerprint: row.fingerprint });
  }
  return result;
}
const databaseCode = (code: string) => (error: unknown): boolean => {
  while (error instanceof Error) {
    if ('code' in error && error.code === code) return true;
    error = error.cause;
  }
  return false;
};

test('municipal setup: nine tools against historical SQL with real Neon/Drizzle transactions', { timeout: 360_000 }, async t => {
  const { createSpecializedDrizzleFixture } = await import('./helpers/specialized-drizzle-fixture');
  const fixture = await createSpecializedDrizzleFixture();
  try {
    await fixture.database.exec(await readFile('tests/fixtures/municipal-setup-tools.sql', 'utf8'));
    const connection = fixture.connection, db = connection.db;
    const { seedMunicipalPlanning } = await import('../scripts/seed-municipal-planning');
    const { verifyPlanningReadiness } = await import('../scripts/verify-planning-readiness');
    const { adoptAdvanceAccounting } = await import('../scripts/adopt-aurora-advance-accounting');
    const { adoptPayrollAccounts } = await import('../scripts/adopt-aurora-payroll-accounts');
    const { adoptTravelPolicy } = await import('../scripts/adopt-aurora-travel-policy');
    const { adoptTravelWorkflows } = await import('../scripts/adopt-aurora-travel-workflows');
    const { documentaryPocPreview, seedHrDocumentaryPoc } = await import('../scripts/seed-hr-documentary-poc');
    const { linkedPocPreview, seedHrPocLinkedWorkflows } = await import('../scripts/seed-hr-poc-linked-workflows');
    const { seedRh } = await import('../scripts/seed-rh');
    const { prepareMunicipalPocDataset, RH_POC_CODE } = await import('../scripts/lib/municipal-setup-poc');
    const { municipalEdition, municipalObject, municipalAccountingEvent } = await import('../scripts/lib/municipal-setup-tools');

    await t.test('municipal seed rejects unauthorized actor and rolls back late collision after councilors; applies once with exact civil dates and Decimal totals', async () => {
      const before = await fingerprint(db);
      await assert.rejects(seedMunicipalPlanning(connection, 'missing-user'), /administrador técnico ativo/);
      assert.deepEqual(await fingerprint(db), before);
      await db.insert(m.sources).values({ id: 'municipal-source-collision', code: '000', name: 'Existing operator source' });
      const conflict = await fingerprint(db);
      await assert.rejects(seedMunicipalPlanning(connection, 'municipal-admin'), databaseCode('23505'));
      assert.deepEqual(await fingerprint(db), conflict);
      await db.delete(m.sources).where(eq(m.sources.id, 'municipal-source-collision'));
      await seedMunicipalPlanning(connection, 'municipal-admin');
      const entities = await db.select().from(m.entities).where(inArray(m.entities.code, ['PMVA', 'CMVA'])).orderBy(asc(m.entities.code));
      assert.equal(entities.length, 2);
      const instruments = await db.select().from(m.instruments).where(inArray(m.instruments.governmentEntityId, entities.map(row => row.id)));
      assert.equal(instruments.length, 6);
      assert.equal((await db.select().from(m.councilors)).length, 9);
      assert.equal((await db.select().from(m.advisors)).length, 9);
      assert.deepEqual((await db.select().from(m.advisors)).map(row => row.startsAt.toISOString()), Array(9).fill('2025-01-06T00:00:00.000Z'));
      const years = await db.select().from(m.years).where(inArray(m.years.governmentEntityId, entities.map(row => row.id)));
      assert.ok(years.every(row => row.year === 2027 && row.endDate.toISOString() === '2027-12-31T23:59:59.999Z' && row.status === 'Preparação'));
      const laws = await db.select().from(m.loas);
      assert.deepEqual(laws.map(row => row.totalExpense.toFixed(2)).sort(), ['2450000.00', '26000000.00']);
      assert.ok(laws.every(row => row.totalExpense.eq(row.totalRevenue)));
      const lines = await db.select().from(m.lines);
      assert.equal(lines.length, 60);
      assert.equal(lines.filter(row => row.kind === 'EXPENSE' && row.physicalTarget?.eq('4.5')).length, 6);
      const [audit] = await db.select().from(m.audits).where(eq(m.audits.action, 'MUNICIPAL_REFERENCE_LOADED'));
      assert.deepEqual(audit.payload, { municipality: 'Vila das Araucárias', entities: 2, councilors: 9, advisors: 9 });
      const applied = await fingerprint(db);
      await seedMunicipalPlanning(connection, 'municipal-admin');
      assert.deepEqual(await fingerprint(db), applied);
    });

    await t.test('planning diagnostic counts, published catalog, module order and absent migration evidence remain read-only', async () => {
      // The historical files do not create their executor's metadata registry.
      // A transaction-local TEMP relation reproduces its captured physical layout,
      // without creating/altering a production relation or disabling any guard.
      const before = await fingerprint(db);
      const rollback = new Error('readiness fixture rollback');
      await assert.rejects(withDatabaseTransaction(connection, async tx => {
        await tx.execute(sql`CREATE TEMP TABLE "_prisma_migrations" (id varchar(36) PRIMARY KEY, checksum varchar(64) NOT NULL, finished_at timestamptz, migration_name varchar(255) NOT NULL, logs text, rolled_back_at timestamptz, started_at timestamptz NOT NULL DEFAULT now(), applied_steps_count integer NOT NULL DEFAULT 0) ON COMMIT DROP`);
        await tx.execute(sql`INSERT INTO "_prisma_migrations" (id,checksum,migration_name,finished_at) VALUES ('readiness-1','fixture','20261011200000_planning_accounting_command_integrity',now()),('readiness-2','fixture','20261011210000_planning_catalog_maintenance',now()),('readiness-3','fixture','20261011220000_planning_publication',NULL)`);
        const report = await verifyPlanningReadiness(tx, true);
        assert.equal(report.mode, 'READ_ONLY'); assert.ok(report.tables.every(row => row.present));
        assert.deepEqual(report.missingMigrations, ['20261011220000_planning_publication']);
        assert.deepEqual(report.instruments, { total: 6, implanted: 0 });
        assert.equal(report.publishedCatalogs, 1); assert.equal(report.storageConfigured, true);
        assert.equal(report.browserAcceptance, 'NOT_EXECUTED_AUTHENTICATED');
        assert.deepEqual(report.modules.map(row => row.codigo), [...report.modules.map(row => row.codigo)].sort());
        assert.deepEqual(await fingerprint(tx), before);
        throw rollback;
      }), error => error === rollback);
      assert.deepEqual(await fingerprint(db), before);
    });

    await t.test('advance/payroll account editions preserve exact hashes, aliases, order, pairs, immutable publications and idempotence', async () => {
      for (const [run, hash, id, count] of [
        [adoptAdvanceAccounting, '3780b2dd74644743490f499c78dbbb0d557c348e8dfa1d9c9706c73cbb00c377', 'aurora-advance-controls-2026-v1', 5],
        [adoptPayrollAccounts, 'e934a1a19fd50d898a41f3aeeee784143d2d514b4c3c57c57acdb5c4c9521f32', 'aurora-payroll-accounts-2026-v1', 6],
      ] as const) {
        const before = await fingerprint(db);
        const preview = await run(connection);
        assert.equal(preview.mode, 'READ_ONLY'); assert.equal(preview.hash, hash);
        assert.deepEqual(await fingerprint(db), before);
        await run(connection, true);
        const edition = await municipalEdition(db, id); assert.ok(edition);
        assert.equal(edition.status, 'PUBLISHED'); assert.equal(edition.sourceHash, hash); assert.equal(edition.entries.length, count);
        assert.ok(edition.entries.every(row => row.canonicalId === `aurora-account:${row.code}` && municipalObject(row.attributes).operational === true));
        const applied = await fingerprint(db);
        await run(connection, true);
        assert.deepEqual(await fingerprint(db), applied);
      }
      for (const [code, debit, credit] of [
        ['ADVANCE_GRANTED', '7.9.1.2.1.00.00.00.00.00.00.00', '8.9.1.2.1.01.00.00.00.00.00.00'],
        ['ADVANCE_REPORTED', '8.9.1.2.1.01.00.00.00.00.00.00', '8.9.1.2.1.02.00.00.00.00.00.00'],
        ['ADVANCE_APPROVED', '8.9.1.2.1.02.00.00.00.00.00.00', '8.9.1.2.1.03.00.00.00.00.00.00'],
        ['ADVANCE_DISALLOWED', '8.9.1.2.1.02.00.00.00.00.00.00', '8.9.1.2.1.04.00.00.00.00.00.00'],
      ]) {
        const event = await municipalAccountingEvent(db, code); assert.ok(event);
        assert.deepEqual(event.rules.map(row => [row.debitAccountId, row.creditAccountId, row.isReference]), [[`aurora-account:${debit}`, `aurora-account:${credit}`, false]]);
      }
      await db.update(m.plans).set({ name: 'Operator edit' }).where(eq(m.plans.code, '2.1.1.1.1.01.02.00.00.00.00.00'));
      const drift = await fingerprint(db);
      await assert.rejects(adoptPayrollAccounts(connection, true), /Conta local conflitante/);
      assert.deepEqual(await fingerprint(db), drift);
    });

    await t.test('travel policy creates a production-only set and regime with exact hash/JSON, dates and replay; refuses operator divergence', async () => {
      const before = await fingerprint(db), preview = await adoptTravelPolicy(connection);
      assert.equal(preview.hash, '94043dba0c3ff941ed664fca482c2b39374965e26f03d4f046bba7da1e60909d');
      assert.equal('plannedRuleSetId' in preview && preview.plannedRuleSetId, 'aurora-travel-rules-2026-v1');
      assert.deepEqual(await fingerprint(db), before);
      const result = await adoptTravelPolicy(connection, true);
      assert.deepEqual(result.ruleIds, ['aurora-travel-2026-v1:aurora-travel-rules-2026-v1']);
      const [set] = await db.select().from(p.ruleSets).where(eq(p.ruleSets.id, 'aurora-travel-rules-2026-v1'));
      assert.deepEqual([set.scope, set.isDemo, set.effectiveFrom.toISOString(), set.effectiveUntil?.toISOString()], ['PRODUCAO', false, '2026-01-01T00:00:00.000Z', '2026-12-31T23:59:59.999Z']);
      const [rule] = await db.select().from(p.rules).where(eq(p.rules.id, result.ruleIds[0]));
      assert.deepEqual(municipalObject(rule.value).rates, { DF: '600.00', CAPITAL: '450.00', INTERIOR: '300.00', INTERNACIONAL: '200.00' });
      const applied = await fingerprint(db);
      await adoptTravelPolicy(connection, true);
      assert.deepEqual(await fingerprint(db), applied);
      await db.update(p.rules).set({ value: { ...municipalObject(rule.value), minimumDistanceKm: 51 } }).where(eq(p.rules.id, rule.id));
      await assert.rejects(adoptTravelPolicy(connection, true), /Política existente divergente/);
      await db.update(p.rules).set({ value: rule.value }).where(eq(p.rules.id, rule.id));
    });

    await t.test('travel workflows group by entity, preserve unit order and publish only after stages; failure in second entity rolls back first', async () => {
      const before = await fingerprint(db), preview = await adoptTravelWorkflows(connection);
      assert.equal(preview.hash, 'dc631c31ea498eef61a8a3aa90b576a7d56a103ccd653ba1a2ad665c4686591d');
      assert.deepEqual(preview.rows.map(row => row.budgetUnitIds), [['municipal-travel-exe-1', 'municipal-travel-exe-2'], ['municipal-travel-leg-1']]);
      assert.deepEqual(await fingerprint(db), before);
      const collisionId = 'aurora-travel-workflow:municipal-travel-leg:rh';
      await db.insert(m.departments).values({ id: collisionId, name: 'Operator work', secretariatId: 'municipal-travel-secretariat' });
      const conflicting = await fingerprint(db);
      await assert.rejects(adoptTravelWorkflows(connection, true), databaseCode('23505'));
      assert.deepEqual(await fingerprint(db), conflicting);
      await db.delete(m.departments).where(eq(m.departments.id, collisionId));
      const applied = await adoptTravelWorkflows(connection, true);
      const stages = await db.select().from(m.stages).orderBy(asc(m.stages.definitionId), asc(m.stages.position));
      assert.deepEqual(stages.map(row => [row.position, row.slaCalendarDays, row.label]), [[1, 3, 'Revisão RH'], [2, 3, 'Autorização e empenho'], [1, 3, 'Revisão RH'], [2, 3, 'Autorização e empenho']]);
      const publication = (await db.execute<{ status: string; actor: string; published: boolean }>(sql`SELECT status,"publishedByUsuarioId" AS actor,"publishedAt" IS NOT NULL AS published FROM "GenericProcessWorkflowDefinition"`)).rows;
      assert.ok(publication.every(row => row.status === 'PUBLISHED' && row.actor === 'municipal-admin' && row.published));
      const state = await fingerprint(db);
      assert.deepEqual(await adoptTravelWorkflows(connection, true), applied);
      assert.deepEqual(await fingerprint(db), state);
      await assert.rejects(withDatabaseTransaction(connection, tx => tx.update(m.stages).set({ slaCalendarDays: 4 }).where(eq(m.stages.id, stages[0].id)).then(() => undefined)), databaseCode('P0001'));
      assert.deepEqual(await fingerprint(db), state);
    });

    await t.test('legacy RH seed retains 17 write payloads, three employee identities and original append semantics', async () => {
      const logs: string[] = [];
      await seedRh(connection, message => { logs.push(message); });
      const staff = await db.select().from(m.employees).where(inArray(m.employees.cpf, ['111.111.111-11', '222.222.222-22', '333.333.333-33'])).orderBy(asc(m.employees.cpf));
      assert.deepEqual(staff.map(row => [row.name, row.isActive]), [['João Carlos Silva', true], ['Maria Fernanda Souza', true], ['Pedro Henrique Oliveira', false]]);
      assert.deepEqual((await db.select().from(m.payrolls)).map(row => [row.competence, row.status, row.totalValue]), [['06/2026', 'Fechada', 7000], ['07/2026', 'Aberta', 7000]]);
      const vacation = await db.select().from(m.vacations).where(eq(m.vacations.employeeId, staff[1].id));
      assert.equal(vacation[0].enjoymentStart, null);
      assert.equal(vacation[0].acquisitionStart.toISOString(), '2025-01-01T00:00:00.000Z');
      assert.equal(logs.at(-1), 'Seed de RH finalizado com sucesso!');
      await seedRh(connection, () => undefined);
      assert.equal((await db.select().from(m.employees).where(inArray(m.employees.id, staff.map(row => row.id)))).length, 3);
      assert.equal((await db.select().from(m.payrolls)).length, 4);
      assert.equal((await db.select().from(m.benefits)).length, 1);
    });

    await t.test('documentary previews need no connection; local dataset and three-stage installation preserve rules, null bounds and operator edits', async () => {
      const before = await fingerprint(db);
      assert.deepEqual(documentaryPocPreview('10/2026', ['--calculate', '--close']), { mode: 'PREVIEW', code: RH_POC_CODE, competence: '10/2026', fictionalPeople: 3, contracts: 3, payrollTypes: 9, scope: 'DEMONSTRACAO', calculates: true, closes: true, publishes: false, realPayments: 0, createsUsers: false });
      assert.equal(linkedPocPreview().scenarios.length, 6);
      await assert.rejects(prepareMunicipalPocDataset(connection, 'SYSTEM:RH_POC_DOCUMENTAL_V1', '01/2027'), /referência 2026/);
      assert.deepEqual(await fingerprint(db), before);
      const result = await seedHrDocumentaryPoc(connection);
      assert.equal(result.contractIds.length, 3); assert.equal(result.payrollIds.length, 9);
      const contracts = await db.select().from(hrEmploymentContracts).where(inArray(hrEmploymentContracts.id, result.contractIds)).orderBy(asc(hrEmploymentContracts.registration));
      assert.deepEqual(contracts.map(row => [row.salary.toFixed(2), row.monthlyHours, row.endsAt]), [['4400.00', 200, null], ['5000.00', 100, null], ['1621.00', 200, null]]);
      assert.ok(contracts.every(row => row.admittedAt.toISOString() === '2020-01-01T00:00:00.000Z'));
      const band = await db.select().from(p.bands).orderBy(asc(p.bands.sequence));
      assert.deepEqual(band.map(row => [row.lowerLimit.toFixed(2), row.upperLimit?.toFixed(2) ?? null, row.employeeRate.toString()]), [['0.00', '1621.00', '7.5'], ['1621.00', '2902.84', '9'], ['2902.84', '4354.27', '12'], ['4354.27', null, '14']]);
      const [rule] = await db.select().from(p.rules).where(and(eq(p.rules.ruleSetId, result.ruleSetId), eq(p.rules.code, 'IRRF_DEDUCAO_DEPENDENTE')));
      await db.update(p.rules).set({ value: '190.01' }).where(eq(p.rules.id, rule.id));
      const applied = await fingerprint(db);
      const replay = await seedHrDocumentaryPoc(connection);
      assert.deepEqual(replay, result);
      assert.deepEqual(await fingerprint(db), applied);
      await db.update(p.rules).set({ value: rule.value }).where(eq(p.rules.id, rule.id));
      const events = await db.select().from(hrIntegrationEvents).where(eq(hrIntegrationEvents.eventType, 'PARAMETROS_POC_INSTALADOS'));
      assert.equal(events.length, 1);
    });

    await t.test('documentary calculations close nine official demonstrative payroll types and replay without duplicate facts', async () => {
      const result = await seedHrDocumentaryPoc(connection, '10/2026', ['--calculate', '--close']);
      assert.equal(result.runs.length, 9);
      assert.deepEqual(result.runs.map(row => row.type), ['Mensal', 'Complementar', 'Rescisão', 'RRA', 'Férias', '1ª parcela 13º', '13º', 'Diferença 13º', 'Adiantamento salarial']);
      assert.equal(result.runs[0].gross, '11021.00');
      assert.ok(result.runs.every(row => new Decimal(row.gross).minus(row.deductions).eq(row.net)));
      const runs = await db.select().from(hrPayrollRuns).where(inArray(hrPayrollRuns.id, result.runs.map(row => row.id)));
      assert.ok(runs.every(row => row.status === 'FECHADA' && row.mode === 'OFICIAL' && row.scope === 'DEMONSTRACAO'));
      const statements = await db.select().from(hrPayrollStatements).where(inArray(hrPayrollStatements.runId, result.runs.map(row => row.id)));
      assert.equal(statements.length, 27); assert.ok(statements.every(row => row.releaseAt === null));
      const applied = await fingerprint(db);
      assert.deepEqual(await seedHrDocumentaryPoc(connection, '10/2026', ['--calculate', '--close']), result);
      assert.deepEqual(await fingerprint(db), applied);
    });

    await t.test('linked workflow uses temporal revision, pension, source runs and vacation entries with publication and preserves production isolation', async () => {
      const result = await seedHrPocLinkedWorkflows(connection, true);
      assert.equal(result.published, true);
      assert.deepEqual(result.runs.map(row => row.type), ['Mensal', '13º', 'Diferença 13º', 'Férias']);
      assert.equal(Object.keys(result.vacationEntryIds).length, 3);
      const revisions = await db.select().from(hrEmploymentRevisions).where(eq(hrEmploymentRevisions.reason, 'POC_DOCUMENTAL:INTRAMES_V2'));
      assert.equal(revisions.length, 1); assert.equal(revisions[0].effectiveFrom.toISOString(), '2026-11-16T00:00:00.000Z');
      const rights = await db.select().from(hrRightEntries).where(inArray(hrRightEntries.id, Object.values(result.vacationEntryIds).flat()));
      assert.equal(rights.length, 3); assert.ok(rights.every(row => row.quantity.eq('-10')));
      const runs = await db.select().from(hrPayrollRuns).where(inArray(hrPayrollRuns.id, result.runs.map(row => row.id)));
      assert.ok(runs.every(row => row.scope === 'DEMONSTRACAO' && row.status === 'FECHADA'));
      assert.ok(runs.filter(row => row.payrollId !== 'rh-poc-payroll-v1-11-2026-0').every(row => municipalObject(row.snapshot).specialParameters));
      const released = await db.select().from(hrPayrollStatements).where(inArray(hrPayrollStatements.runId, result.runs.map(row => row.id)));
      assert.equal(released.length, 12); assert.ok(released.every(row => row.releaseAt instanceof Date));
      const replay = await seedHrPocLinkedWorkflows(connection);
      assert.deepEqual(replay.runs, result.runs); assert.deepEqual(replay.vacationEntryIds, result.vacationEntryIds);
      assert.equal((await db.select().from(hrEmploymentRevisions).where(eq(hrEmploymentRevisions.reason, 'POC_DOCUMENTAL:INTRAMES_V2'))).length, 1);
      const [production] = await db.select().from(p.ruleSets).where(eq(p.ruleSets.id, 'aurora-travel-rules-2026-v1'));
      assert.equal(production.scope, 'PRODUCAO'); assert.equal(production.isDemo, false);
    });
  } finally { await fixture.close(); }
});
