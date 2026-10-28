import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { asc, eq, sql } from 'drizzle-orm';
import { withDatabaseTransaction, type DatabaseExecutor } from '../src/db/transaction';
import type { JsonValue } from '../src/db/json';
import type { ExternalOperationsContext } from '../src/lib/contracts/personnel-external-operations';
import { externalConnections } from '../src/db/schema/personnel-external-operations';
import { hrIntegrationEvents } from '../src/db/schema/personnel-workforce';
import { hrConsignmentAgreements, hrConsignmentInstallments, hrConsignmentEntries } from '../src/db/schema/personnel-consignment';
import { findExternalMovement } from '../src/db/repositories/personnel-external-operations/movements';
import { requireHrIntegrationEvent } from '../src/db/repositories/personnel/integration';

function object(value: JsonValue | null | undefined) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value));
  return value;
}
function causeMessage(expected: string) {
  return (error: unknown): boolean => {
    while (error instanceof Error) {
      if (error.message.includes(expected)) return true;
      error = error.cause;
    }
    return false;
  };
}
function databaseCode(expected: string) {
  return (error: unknown): boolean => {
    while (error instanceof Error) {
      if ('code' in error && error.code === expected) return true;
      error = error.cause;
    }
    return false;
  };
}
const forbidden = (error: unknown) => error instanceof Error && 'status' in error && error.status === 403;
async function fingerprint(db: DatabaseExecutor) {
  const rows: Array<{ table: string; hash: string }> = [];
  for (const table of ['IntegrationConnection', 'HrMovement', 'HrIntegrationEvent', 'HrConsignmentAgreement', 'HrConsignmentInstallment', 'HrConsignmentEntry', 'HrEmploymentContract', 'HrEmploymentRevision', 'HrPayrollRun', 'HrPayrollStatement', 'Payroll', 'PayrollBenefit', 'BenefitConfig', 'Person', 'Employee']) {
    const [row] = (await db.execute<{ hash: string }>(sql`SELECT md5(COALESCE(string_agg(to_jsonb(r)::text,'' ORDER BY to_jsonb(r)::text),'')) AS hash FROM ${sql.identifier(table)} r`)).rows;
    rows.push({ table, hash: row.hash });
  }
  return rows;
}
function partnerContext(db: ExternalOperationsContext['database'], id = 'ext-partner'): ExternalOperationsContext {
  return { database: db, user: { id, firebaseUid: `fixture:${id}`, email: `${id}@example.test`, name: id, role: 'Convenente', profileCode: 'EXTERNAL_OPERATIONS_TEST', allowedBudgetUnitIds: [], modulePermissions: [], employeeId: null, secretariatId: null, departmentId: null } };
}
const configuration = {
  environment: 'PRODUCAO_RESTRITA', employerCnpj: '11222333000181', layoutVersion: 'S-1.3',
  xsdPackageReference: 'documental:package:1', xsdSha256: 'a'.repeat(64),
  sendEndpoint: 'https://esocial.example.test/send', queryEndpoint: 'https://esocial.example.test/query',
  credentialReference: 'vault:rh/esocial', effectiveFrom: '2026-01-01',
};
const header = 'matricula;rubrica;valor;inicio;fim;referencia;observacao';
const reservation = {
  grantId: 'ext-grant-main', contractId: 'ext-contract-a', requestKey: 'c73cf394-228c-4a11-a1b5-d6b557fa8001',
  number: 'CONV-001', firstCompetence: '11/2026', count: 2, amount: '10.01', reason: 'Reserva documental do convênio de teste.',
};

// CENTRAL RUN ONLY: independent full historical SQL, loopback PostgreSQL and
// the actual Neon/Drizzle driver. This file is never imported by light checks.
test('RH external operations: all four services on historical SQL with real Neon/Drizzle transactions', { timeout: 240_000 }, async t => {
  const { createSpecializedDrizzleFixture } = await import('./helpers/specialized-drizzle-fixture');
  const fixture = await createSpecializedDrizzleFixture();
  try {
    await fixture.database.exec(await readFile('tests/fixtures/personnel-external-operations.sql', 'utf8'));
    const connection = fixture.connection, db = connection.db;
    const { saveHrExternalConfiguration, describeHrExternalReadiness } = await import('../src/lib/rh/external-configuration');
    const { generateBenefitMovement } = await import('../src/lib/rh/benefit-calculation');
    const { importPayrollMovements } = await import('../src/lib/rh/movement-import');
    const partner = await import('../src/lib/rh/partner-discounts');
    const context = partnerContext(db), fault = partnerContext(db, 'ext-fail-actor');
    const canonical = (await fingerprint(db)).filter(row => ['Person', 'Employee', 'HrEmploymentContract', 'HrEmploymentRevision'].includes(row.table));

    await t.test('external configuration validates CNPJ/HTTPS/reference/schema and reports both environments without persistence or transmission', async () => {
      const before = await fingerprint(db), readiness = await describeHrExternalReadiness(db);
      assert.deepEqual(readiness.map(row => [row.environment, row.configured, row.status, row.transmissionAvailable]), [['PRODUCAO_RESTRITA', false, 'NAO_CONFIGURADO', false], ['PRODUCAO', false, 'NAO_CONFIGURADO', false]]);
      for (const patch of [{ employerCnpj: '11111111111111' }, { sendEndpoint: 'http://example.test/send' }, { queryEndpoint: 'http://example.test/query' }, { xsdSha256: 'bad' }, { credentialReference: 'plain-secret' }, { extra: true }]) {
        await assert.rejects(saveHrExternalConfiguration(connection, { ...configuration, ...patch }));
      }
      assert.deepEqual(await fingerprint(db), before);
    });

    await t.test('configuration upsert preserves ID/mock/creation metadata, omits credential from JSON and resets prior test evidence only on update', async () => {
      const created = await saveHrExternalConfiguration(connection, configuration);
      assert.equal(created.code, 'ESOCIAL_RH_PRODUCAO_RESTRITA'); assert.equal(created.status, 'CONFIGURANDO'); assert.equal(created.provider, 'eSocial'); assert.equal(created.category, 'GOVERNAMENTAL');
      assert.equal(created.credentialReference, configuration.credentialReference); assert.equal(created.baseUrl, configuration.sendEndpoint);
      assert.equal(created.lastTestedAt, null); assert.equal(created.lastTestStatus, null); assert.equal(created.lastTestMessage, null);
      assert.ok(created.createdAt instanceof Date); assert.ok(created.updatedAt instanceof Date);
      const { credentialReference: _credential, ...expected } = configuration;
      void _credential;
      assert.deepEqual(created.configuration, expected); assert.ok(!('credentialReference' in object(created.configuration)));
      await db.update(externalConnections).set({ mockScenario: { historical: true, decimal: '90071992547409.93', optional: null }, lastTestedAt: new Date('2099-10-20T12:34:56.789Z'), lastTestStatus: 'APROVADO', lastTestMessage: 'Evidência anterior' }).where(eq(externalConnections.id, created.id));
      const updated = await saveHrExternalConfiguration(connection, { ...configuration, layoutVersion: ' S-1.4 ', credentialReference: 'secret://rh/new' });
      assert.equal(updated.id, created.id); assert.equal(updated.createdAt.toISOString(), created.createdAt.toISOString());
      assert.deepEqual(updated.mockScenario, { historical: true, decimal: '90071992547409.93', optional: null });
      assert.equal(updated.lastTestedAt, null); assert.equal(updated.lastTestStatus, null); assert.equal(updated.lastTestMessage, 'Configuração preparada. Nenhuma assinatura, conexão ou transmissão realizada.');
      assert.equal(object(updated.configuration).layoutVersion, 'S-1.4');
      const production = await saveHrExternalConfiguration(connection, { ...configuration, environment: 'PRODUCAO' });
      await db.update(externalConnections).set({ configuration: sql`'null'::jsonb` }).where(eq(externalConnections.id, production.id));
      const before = await fingerprint(db), readiness = await describeHrExternalReadiness(db);
      assert.deepEqual(readiness.map(row => [row.environment, row.configured, row.transmissionAvailable]), [['PRODUCAO_RESTRITA', true, false], ['PRODUCAO', false, false]]);
      assert.deepEqual(readiness[0].issues, ['CLIENTE_XML_XSD_XMLDSIG_MTLS_E_WORKER_PENDENTES']);
      assert.equal(readiness[1].issues[0], 'PARAMETROS_CERTIFICADO_E_LAYOUT_PENDENTES');
      assert.deepEqual(await fingerprint(db), before);
    });

    await t.test('benefit generation uses historical revision, active assignment/rubric, UTC absence overlap, exact deduction cap and legacy Float custom value', async () => {
      const food = await generateBenefitMovement(connection, 'ext-actor', { contractId: 'ext-contract-a', ruleId: 'ext-benefit-food', competence: '11/2026' });
      assert.equal(food.amount.toFixed(2), '140.14'); assert.equal(food.sourceKey, 'BENEFICIO:ext-food:11/2026'); assert.equal(food.reference, '14 dias');
      assert.equal(food.startsAt.toISOString(), '2026-11-01T00:00:00.000Z'); assert.equal(food.endsAt?.toISOString(), '2026-11-30T23:59:59.999Z');
      const event = await requireHrIntegrationEvent(db, food.sourceKey), payload = object(event.payload), calculated = object(payload.calculated);
      assert.equal(event.domain, 'AUDITORIA'); assert.equal(event.environment, 'DEMONSTRACAO'); assert.equal(event.eventType, 'CALCULO_BENEFICIO');
      assert.equal(payload.contractVersion, 1); assert.equal(calculated.total, '140.14'); assert.equal(calculated.employee, '0'); assert.equal(calculated.entity, '140.14');
      assert.ok(Array.isArray(calculated.days)); assert.equal(object(calculated.days[3]).reason, 'FERIAS');
      assert.match(food.notes, new RegExp(event.id));
      const transport = await generateBenefitMovement(connection, 'ext-actor', { contractId: 'ext-contract-second', ruleId: 'ext-benefit-transport', competence: '11/2026' });
      assert.equal(transport.amount.toFixed(2), '30.00', '500.00 historical salary, not future 800.00, supplies the 6% cap');
      assert.equal(object((await requireHrIntegrationEvent(db, transport.sourceKey)).payload).contractVersion, 1);
      const custom = await generateBenefitMovement(connection, 'ext-actor', { contractId: 'ext-contract-a', ruleId: 'ext-benefit-custom', competence: '11/2026' });
      assert.equal(custom.amount.toFixed(2), '102.35');
      assert.equal(object(object((await requireHrIntegrationEvent(db, custom.sourceKey)).payload).calculated).total, '102.35');
      const before = await fingerprint(db);
      assert.equal((await generateBenefitMovement(connection, 'ext-partner-2', { contractId: 'ext-contract-a', ruleId: 'ext-benefit-food', competence: '11/2026' })).id, food.id);
      await assert.rejects(generateBenefitMovement(connection, 'ext-actor', { contractId: 'ext-contract-second', ruleId: 'ext-benefit-food', competence: '11/2026' }), /conteúdo diferente/);
      assert.deepEqual(await fingerprint(db), before);
    });

    await t.test('benefits reject invalid regime/contract/configuration/assignment/rubric/custom policy with no partial evidence', async () => {
      const before = await fingerprint(db), input = { contractId: 'ext-contract-a', ruleId: 'ext-benefit-food', competence: '12/2026' };
      for (const suffix of ['inactive', 'draftset', 'expiredset']) await assert.rejects(generateBenefitMovement(connection, 'ext-actor', { ...input, ruleId: `ext-benefit-${suffix}` }), /ativos e vigentes/);
      await assert.rejects(generateBenefitMovement(connection, 'ext-actor', { ...input, competence: '01/2199' }), /ativos e vigentes/);
      for (const contractId of ['ext-contract-ended', 'ext-contract-inactive-regime']) await assert.rejects(generateBenefitMovement(connection, 'ext-actor', { ...input, contractId }), /ativos e vigentes/);
      await assert.rejects(generateBenefitMovement(connection, 'ext-actor', { ...input, contractId: 'ext-contract-no-revision' }), /sem revisão vigente/);
      for (const suffix of ['disabled', 'duplicate']) await assert.rejects(generateBenefitMovement(connection, 'ext-actor', { ...input, ruleId: `ext-benefit-${suffix}` }), /um único direito ativo/);
      await assert.rejects(generateBenefitMovement(connection, 'ext-actor', { ...input, contractId: 'ext-contract-b' }), /um único direito ativo/);
      for (const suffix of ['formula', 'wrongtype']) await assert.rejects(generateBenefitMovement(connection, 'ext-actor', { ...input, ruleId: `ext-benefit-${suffix}` }), /rubrica MANUAL ativa/);
      await assert.rejects(generateBenefitMovement(connection, 'ext-actor', { ...input, ruleId: 'ext-benefit-customblocked' }), /autorização na política/);
      assert.deepEqual(await fingerprint(db), before);
    });

    await t.test('late movement failure rolls back the previously enqueued benefit evidence in the same transaction', async () => {
      const before = await fingerprint(db), input = { contractId: 'ext-contract-a', ruleId: 'ext-benefit-food', competence: '12/2026' };
      await assert.rejects(generateBenefitMovement(connection, 'ext-fail-actor', input), causeMessage('external fixture late movement failure'));
      assert.deepEqual(await fingerprint(db), before);
      const movement = await generateBenefitMovement(connection, 'ext-actor', input);
      assert.equal(movement.amount.toFixed(2), '230.23');
    });

    await t.test('CSV preview/apply preserve raw hash, big/signed Decimal, quoted multiline notes, civil dates and actor-independent replay', async () => {
      const csv = `${header}\r\nEXT-A;FOOD;90071992547409,93;2028-02-29;;;"Ato; com ""aspas""\r\ne continuação"\r\nEXT-SECOND;VT;-0,01;2028-03-01;2028-03-31;1;Compensação de origem`;
      const hash = createHash('sha256').update(csv).digest('hex'), before = await fingerprint(db);
      assert.deepEqual(await importPayrollMovements(connection, 'ext-actor', { batchKey: 'exact-batch', csv, mode: 'PREVIA' }), { lines: 2, created: 2, reused: 0, mode: 'PREVIA', hash });
      assert.deepEqual(await fingerprint(db), before);
      assert.deepEqual(await importPayrollMovements(connection, 'ext-actor', { batchKey: 'exact-batch', csv, mode: 'APLICAR' }), { lines: 2, created: 2, reused: 0, mode: 'APLICAR', hash });
      const first = await findExternalMovement(db, 'IMPORT:exact-batch:1'), second = await findExternalMovement(db, 'IMPORT:exact-batch:2');
      assert.ok(first && second); assert.equal(first.amount.toFixed(2), '90071992547409.93'); assert.equal(second.amount.toFixed(2), '-0.01');
      assert.equal(first.startsAt.toISOString(), '2028-02-29T00:00:00.000Z'); assert.equal(first.endsAt, null); assert.equal(first.reference, null); assert.equal(first.notes, 'Ato; com "aspas"\ne continuação');
      const event = await requireHrIntegrationEvent(db, 'IMPORTACAO:exact-batch');
      assert.deepEqual(event.payload, { batchKey: 'exact-batch', hash, csv, actorId: 'ext-actor', rows: 2 });
      const applied = await fingerprint(db);
      assert.deepEqual(await importPayrollMovements(connection, 'ext-partner-2', { batchKey: 'exact-batch', csv, mode: 'APLICAR' }), { lines: 2, created: 0, reused: 2, mode: 'APLICAR', hash });
      assert.deepEqual(await fingerprint(db), applied);
    });

    await t.test('import rejects duplicate files/changed replay and rolls back both bad late rows and late audit failure; immutable guards remain active', async () => {
      const csv = `${header}\nEXT-A;FOOD;1.01;2027-01-01;;;Lote de controle`;
      await importPayrollMovements(connection, 'ext-actor', { batchKey: 'control', csv, mode: 'APLICAR' });
      const before = await fingerprint(db);
      for (const mode of ['PREVIA', 'APLICAR']) await assert.rejects(importPayrollMovements(connection, 'ext-actor', { batchKey: 'another-key', csv, mode }), /já foi importado com outra chave/);
      await assert.rejects(importPayrollMovements(connection, 'ext-actor', { batchKey: 'control', csv: `${header}\nEXT-A;FOOD;2.02;2027-01-01;;;Conteúdo alterado`, mode: 'APLICAR' }), /lote repetido com conteúdo diferente/);
      await assert.rejects(importPayrollMovements(connection, 'ext-actor', { batchKey: 'invalid-row', csv: `${header}\nEXT-A;FOOD;3.03;2027-01-01;;;Primeira linha\nEXT-SECOND;MISSING;1;2027-01-01;;;Segunda linha inválida`, mode: 'APLICAR' }), /Linha 3/);
      for (const registration of ['EXT-ENDED', 'EXT-INACTIVE-REGIME', 'MISSING', "EXT-A') OR TRUE --"]) await assert.rejects(importPayrollMovements(connection, 'ext-actor', { batchKey: `missing-${registration}`, csv: `${header}\n${registration};FOOD;1;2027-01-01;;;Origem inválida`, mode: 'APLICAR' }), /contrato\/regime\/rubrica ativo não encontrado/);
      await assert.rejects(importPayrollMovements(connection, 'ext-actor', { batchKey: 'audit-fail', csv: `${header}\nEXT-A;FOOD;4.04;2027-01-01;;;Falha tardia de auditoria`, mode: 'APLICAR' }), causeMessage('external fixture late event failure'));
      await assert.rejects(withDatabaseTransaction(connection, tx => tx.execute(sql`UPDATE "HrMovement" SET notes='Alteração indevida' WHERE "sourceKey"='IMPORT:control:1'`)), databaseCode('P0001'));
      await assert.rejects(withDatabaseTransaction(connection, tx => tx.execute(sql`UPDATE "HrIntegrationEvent" SET payload='{}'::jsonb WHERE "sourceKey"='IMPORTACAO:control'`)), databaseCode('P0001'));
      assert.deepEqual(await fingerprint(db), before);
    });

    await t.test('partner grants keep actor policy, active/effective set, active employee and UG-secretariat filtering without adding contract-status restrictions', async () => {
      const before = await fingerprint(db), grants = await partner.listOwnPartnerDiscountGrants(context);
      assert.equal(grants[0].id, 'ext-grant-main');
      assert.deepEqual(grants.map(row => row.id).sort(), ['ext-grant-main', 'ext-grant-wrongreference', 'ext-grant-wrongunit']);
      assert.deepEqual(grants[0].contracts.map(row => row.id).sort(), ['ext-contract-a', 'ext-contract-ended', 'ext-contract-second']);
      assert.equal(grants[0].contracts.find(row => row.id === 'ext-contract-a')?.label, 'EXT-A · Titular A');
      assert.deepEqual(grants.find(row => row.id === 'ext-grant-wrongunit')?.contracts.map(row => row.id), ['ext-contract-b']);
      assert.deepEqual(await partner.listOwnPartnerDiscounts(partnerContext(db, 'ext-actor')), { grants: [], agreements: [] });
      assert.deepEqual(await fingerprint(db), before);
    });

    await t.test('partner reservation validates policy/UG/reference/margin and rolls back agreements, schedules and entries on late portal-event failure', async () => {
      const before = await fingerprint(db);
      await assert.rejects(partner.reservePartnerDiscount(partnerContext(db, 'ext-outsider'), reservation, connection), forbidden);
      await assert.rejects(partner.reservePartnerDiscount(context, { ...reservation, grantId: 'ext-grant-inactive' }, connection), forbidden);
      await assert.rejects(partner.reservePartnerDiscount(context, { ...reservation, grantId: 'ext-grant-wrongunit' }, connection), /Contrato fora da unidade/);
      await assert.rejects(partner.reservePartnerDiscount(context, { ...reservation, grantId: 'ext-grant-wrongreference' }, connection), /Referência de folha fora da unidade/);
      await assert.rejects(partner.reservePartnerDiscount(context, { ...reservation, amount: '500.01' }, connection), /excede a margem/);
      await assert.rejects(partner.reservePartnerDiscount(fault, { ...reservation, number: 'CONV-FAIL' }, connection), causeMessage('external fixture late event failure'));
      assert.deepEqual(await fingerprint(db), before);
      const id = await partner.reservePartnerDiscount(context, reservation, connection);
      const [agreement] = await db.select().from(hrConsignmentAgreements).where(eq(hrConsignmentAgreements.id, id));
      assert.equal(agreement.sourceKey, `CONVENENTE:ext-partner:${reservation.requestKey}`); assert.equal(agreement.supplierId, 'ext-supplier'); assert.equal(agreement.scope, 'DEMONSTRACAO');
      const installments = await db.select().from(hrConsignmentInstallments).where(eq(hrConsignmentInstallments.agreementId, id)).orderBy(asc(hrConsignmentInstallments.sequence));
      assert.deepEqual(installments.map(row => [row.sequence, row.competenceAt.toISOString(), row.amount.toFixed(2)]), [[1, '2026-11-01T00:00:00.000Z', '10.01'], [2, '2026-12-01T00:00:00.000Z', '10.01']]);
      const event = await requireHrIntegrationEvent(db, `CONVENENTE:PEDIDO:${id}`);
      assert.equal(event.status, 'PROCESSADO'); assert.equal(event.domain, 'PORTAL');
      assert.deepEqual(event.payload, { grantId: 'ext-grant-main', agreementId: id, actorId: 'ext-partner', supplierId: 'ext-supplier', budgetUnitId: 'ext-ug-a' });
      assert.equal(object(object(agreement.snapshot).request).amount, '10.01');
      assert.equal(await partner.reservePartnerDiscount(context, reservation, connection), id);
      assert.deepEqual(await db.select().from(hrConsignmentAgreements).where(eq(hrConsignmentAgreements.id, id)), [agreement]);
      assert.deepEqual(await db.select().from(hrConsignmentInstallments).where(eq(hrConsignmentInstallments.agreementId, id)).orderBy(asc(hrConsignmentInstallments.sequence)), installments);
      assert.equal((await requireHrIntegrationEvent(db, event.sourceKey)).payloadHash, event.payloadHash);
      const replayed = await fingerprint(db);
      await assert.rejects(partner.reservePartnerDiscount(context, { ...reservation, amount: '10.02' }, connection), /dados diferentes/);
      assert.deepEqual(await fingerprint(db), replayed);
    });

    await t.test('partner listings preserve nested agreement/installment/entry shape, Decimal, UTC dates, order and no-grant isolation', async () => {
      const before = await fingerprint(db), result = await partner.listOwnPartnerDiscounts(context);
      assert.equal(result.agreements.length, 1);
      const [agreement] = result.agreements;
      assert.ok(agreement.createdAt instanceof Date); assert.equal(agreement.number, reservation.number);
      assert.deepEqual(agreement.installments.map(row => [row.sequence, row.amount.toFixed(2), row.competenceAt.toISOString(), row.entries]), [[1, '10.01', '2026-11-01T00:00:00.000Z', [{ kind: 'RESERVA' }]], [2, '10.01', '2026-12-01T00:00:00.000Z', [{ kind: 'RESERVA' }]]]);
      assert.equal((await partner.listOwnPartnerDiscounts(partnerContext(db, 'ext-partner-2'))).agreements[0].id, agreement.id, 'grant scope, not reservation actor, controls visibility');
      assert.deepEqual((await partner.listOwnPartnerDiscounts(partnerContext(db, 'ext-actor'))).agreements, []);
      assert.deepEqual(await fingerprint(db), before);
    });

    await t.test('partner posting enforces allowed payroll/installment/UG, rolls back late ledger failure, delegates one transaction and replays without duplicates', async () => {
      const { agreements } = await partner.listOwnPartnerDiscounts(context);
      assert.ok(agreements[0]);
      const installmentId = agreements[0].installments[0].id, input = { grantId: 'ext-grant-main', installmentId, payrollId: 'ext-payroll' }, before = await fingerprint(db);
      await assert.rejects(partner.postPartnerDiscount(partnerContext(db, 'ext-actor'), input, connection), forbidden);
      await assert.rejects(partner.postPartnerDiscount(context, { ...input, payrollId: 'missing' }, connection), /Folha fora da autorização/);
      await assert.rejects(partner.postPartnerDiscount(context, { ...input, installmentId: 'missing' }, connection), /Parcela indisponível/);
      await assert.rejects(partner.postPartnerDiscount(context, { ...input, payrollId: 'ext-payroll-other' }, connection), /Folha fora da unidade/);
      await assert.rejects(partner.postPartnerDiscount(fault, input, connection), causeMessage('external fixture late posting failure'));
      assert.deepEqual(await fingerprint(db), before);
      const movement = await partner.postPartnerDiscount(context, input, connection);
      assert.equal(movement.sourceKey, `CONSIGNACAO:PARCELA:${installmentId}`); assert.equal(movement.amount.toFixed(2), '10.01'); assert.equal(movement.reference, `${reservation.number} / 1`);
      assert.equal(movement.startsAt.toISOString(), '2026-11-01T00:00:00.000Z');
      const entries = await db.select().from(hrConsignmentEntries).where(eq(hrConsignmentEntries.installmentId, installmentId));
      assert.deepEqual(entries.map(row => row.kind).sort(), ['LANCAMENTO', 'RESERVA']);
      assert.equal(entries.find(row => row.kind === 'LANCAMENTO')?.amount.toFixed(2), '0.00');
      assert.equal(entries.find(row => row.kind === 'LANCAMENTO')?.movementId, movement.id);
      const posted = await fingerprint(db);
      assert.equal((await partner.postPartnerDiscount(partnerContext(db, 'ext-partner-2'), input, connection)).id, movement.id);
      assert.deepEqual(await fingerprint(db), posted);
    });

    await t.test('same-origin guards reject global fallback before pool acquisition; configuration composition rolls back on the real caller transaction', async () => {
      const before = await fingerprint(db);
      await assert.rejects(partner.reservePartnerDiscount(context, reservation), /deve corresponder ao banco do contexto/);
      await assert.rejects(partner.postPartnerDiscount(context, { grantId: 'ext-grant-main', installmentId: 'unused', payrollId: 'ext-payroll' }), /deve corresponder ao banco do contexto/);
      const { upsertExternalConfiguration } = await import('../src/db/repositories/personnel-external-operations/configuration');
      const rollback = new Error('external configuration rollback');
      await assert.rejects(withDatabaseTransaction(connection, async tx => {
        await upsertExternalConfiguration(tx, 'ESOCIAL_RH_PRODUCAO', { name: 'Configuração local não commitada', category: 'GOVERNAMENTAL', provider: 'eSocial', environment: 'PRODUCAO', status: 'CONFIGURANDO', baseUrl: configuration.sendEndpoint, credentialReference: configuration.credentialReference, configuration: { ...configuration, environment: 'PRODUCAO' } });
        assert.equal((await describeHrExternalReadiness(tx))[1].configured, true);
        throw rollback;
      }), error => error === rollback);
      assert.deepEqual(await fingerprint(db), before);
    });

    assert.deepEqual((await fingerprint(db)).filter(row => ['Person', 'Employee', 'HrEmploymentContract', 'HrEmploymentRevision'].includes(row.table)), canonical);
    const processed = await db.select().from(hrIntegrationEvents).where(eq(hrIntegrationEvents.eventType, 'DESCONTO_CONVENENTE_RESERVADO'));
    assert.equal(processed.length, 1); assert.equal(processed[0].status, 'PROCESSADO');
  } finally { await fixture.close(); }
});
