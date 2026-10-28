import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { Decimal } from '../src/db/decimal';
import * as tables from '../src/db/schema/personnel-external-operations';
import { calculateDailyBenefit, hrBenefitRuleSchema } from '../src/lib/rh/benefit-calculation';
import { parsePayrollMovementImport } from '../src/lib/rh/movement-import';

const empty = '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945';
// Read-only AST capture of the four original modules before edits. Each tuple
// contains schemas/inputs, pure functions, and audit-event payload fingerprints.
const golden: Record<string, [string, string, string]> = {
  'benefit-calculation': ['f442a79eb52ebd1086668cc2d38c89e692c1abaa73d9a4b2d61b36fded402703', '63b0df3c32c36b19535a97a40c3b582630c0d3d45fddd11db205066bc17351c1', '114d8385ccc7cc497b759acd8e7df41c537c980f039a0abba5c8d0375df83372'],
  'external-configuration': ['ccfdcfb99a52ab0895762a9fbd7d1ba6d9df3248e56e7dc359153125875a19f5', empty, empty],
  'movement-import': ['acb4138c26426566871c50222cae5611d1834e40bf56c7984cebcdc00bd043ee', '3103bc836fcfb90543ab5547e50edc407a2ab618aa586f346d7b89a93ff9d716', '5ef02204bbb7832c18f01ae9d76eecd78290d1a1f8eb4fcd79e8c74cf329e542'],
  'partner-discounts': ['7bb5f807cc6b80190e2e6f76114166d3a89b87205601bd611bcaad81d8fc8df6', empty, '1815a7ce7ad63fcace0a8182a6ccce417d925c3bf6cb43a2cda067a6f6805762'],
};
const printer = ts.createPrinter({ removeComments: true });
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function normalize(node: ts.Node, source: ts.SourceFile) {
  const result = ts.transform(node, [context => {
    const visit: ts.Visitor = value => {
      if (ts.isAsExpression(value) || ts.isParenthesizedExpression(value)) return ts.visitNode(value.expression, visit);
      if (ts.isStringLiteral(value)) return ts.factory.createStringLiteral(value.text);
      if ((ts.isPropertyAccessExpression(value) || ts.isQualifiedName(value)) && value.getText(source) === 'Prisma.Decimal') return ts.factory.createIdentifier('Decimal');
      return ts.visitEachChild(value, visit, context);
    };
    return value => ts.visitNode(value, visit) as ts.Node;
  }]);
  const text = printer.printNode(ts.EmitHint.Unspecified, result.transformed[0], source);
  result.dispose();
  return text;
}

test('external operations: original schemas, daily benefit/CSV algorithms, import hash and complete event payloads are preserved', () => {
  for (const [name, expected] of Object.entries(golden)) {
    const source = ts.createSourceFile(name, readFileSync(`src/lib/rh/${name}.ts`, 'utf8'), ts.ScriptTarget.Latest, true);
    const schemas: string[][] = [], pure: string[] = [], events: string[] = [], hashes: string[] = [];
    function visit(node: ts.Node) {
      if (ts.isVariableDeclaration(node) && node.initializer) {
        const name = node.name.getText(source);
        if (name.endsWith('Schema') || name === 'input') schemas.push([name, normalize(node.initializer, source)]);
        if (name === 'hash') hashes.push(normalize(node.initializer, source));
      }
      if (ts.isFunctionDeclaration(node) && ['calculateDailyBenefit', 'parseCsv', 'date', 'parsePayrollMovementImport'].includes(node.name?.text ?? '')) pure.push(normalize(node, source));
      if (ts.isCallExpression(node) && node.expression.getText(source) === 'enqueueHrIntegration') {
        const input = node.arguments[1];
        assert.ok(ts.isObjectLiteralExpression(input));
        const payload = input.properties.find(property => ts.isPropertyAssignment(property) && property.name.getText(source) === 'payload');
        assert.ok(payload && ts.isPropertyAssignment(payload));
        events.push(normalize(payload.initializer, source));
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
    assert.deepEqual([digest(schemas), digest(pure), digest(events)], expected, name);
    if (name === 'movement-import') assert.equal(digest(hashes), 'e38dd32f04cc038f034f7c29bc415b668b3aa4ddd58f63e61c475f2205f40327');
  }
});

test('external operations: all six private projections match physical types and both directions of nullability', () => {
  const catalog = JSON.parse(readFileSync(new URL('./fixtures/installed-physical-catalog.json', import.meta.url), 'utf8')).catalog as { columns: Array<{ schema: string; table_name: string; name: string; type: string; not_null: boolean }> };
  assert.equal(Object.keys(tables).length, 6);
  let columns = 0;
  for (const table of Object.values(tables)) {
    const config = getTableConfig(table);
    for (const column of config.columns) {
      const actual = catalog.columns.find(row => row.schema === 'public' && row.table_name === config.name && row.name === column.name);
      assert.ok(actual, `${config.name}.${column.name}`);
      let expected = column.getSQLType().replaceAll(' ', '');
      if (expected.startsWith('timestamp')) expected += 'withouttimezone';
      assert.equal(expected, actual.type.replaceAll(' ', '').replaceAll('"', ''), `${config.name}.${column.name}`);
      assert.equal(column.notNull, actual.not_null, `${config.name}.${column.name}`);
      columns++;
    }
  }
  assert.equal(columns, 36);
});

test('external operations: real transaction ownership, connection identity, lock order and no legacy/compatibility clients', () => {
  const repositories = ['benefits', 'configuration', 'movements', 'partners'].map(name => `src/db/repositories/personnel-external-operations/${name}.ts`);
  const services = Object.keys(golden).map(name => `src/lib/rh/${name}.ts`);
  for (const file of [...services, ...repositories, 'src/db/schema/personnel-external-operations.ts', 'src/lib/contracts/personnel-external-operations.ts']) {
    const text = readFileSync(file, 'utf8');
    assert.doesNotMatch(text, /@prisma|\bPrisma\w*|\bprisma\b|new Proxy|\$transaction|\$queryRaw|\$executeRaw|DMMF|as unknown as|as any/);
    if (repositories.includes(file)) assert.doesNotMatch(text, /databaseConnection|@\/db\/client|withDatabaseTransaction|\.transaction\(/);
  }
  const benefit = readFileSync(services[0], 'utf8'), configuration = readFileSync(services[1], 'utf8'), movement = readFileSync(services[2], 'utf8'), partner = readFileSync(services[3], 'utf8');
  assert.match(benefit, /generateBenefitMovement\(db: DatabaseConnection/);
  assert.match(movement, /importPayrollMovements\(db: DatabaseConnection/);
  assert.match(configuration, /saveHrExternalConfiguration\(db: DatabaseConnection/);
  assert.match(configuration, /describeHrExternalReadiness\(db: DatabaseExecutor/);
  assert.ok(benefit.indexOf('`RH:employee:') < benefit.indexOf('`RH:contract:'));
  assert.ok(movement.indexOf('`RH:import:') < movement.indexOf('`RH:import-hash:'));
  assert.match(movement, /timeoutMs: 60000/); assert.match(partner, /timeoutMs: 60000/);
  assert.match(partner, /context\.database !== connection\.db/);
  assert.match(partner, /reserveConsignmentAgreementInTransaction\(tx,/);
  assert.match(partner, /markPartnerEventProcessed\(tx, event\.id\)/);
  assert.match(partner, /postConsignmentInstallment\(source,/);
  assert.match(readFileSync(repositories[2], 'utf8'), /pg_advisory_xact_lock\(hashtext\(\$\{key\}\)\)::text/);
  assert.equal((partner.match(/withDatabaseTransaction\(/g) ?? []).length, 1);
});

test('daily benefit: overlaps, UTC weekdays, employment boundaries, exact cap/custom/large amounts and policy validation', () => {
  const policy = hrBenefitRuleSchema.parse({ kind: 'TRANSPORTE', benefitConfigId: 'vt', rubricCode: 'VT', posting: 'DESCONTO', dailyValue: '10.01', weekdays: [1, 2, 3, 4, 5], excludeVacation: true, excludeLeaveTypes: ['Licença'], maxEmployeeDiscountRate: '6' });
  const input = { policy, from: new Date('2026-11-01T00:00:00Z'), until: new Date('2026-11-30T23:59:59.999Z'), admittedAt: new Date('2000-01-01T00:00:00Z'), endsAt: null, salary: new Decimal('1000.01'), customValue: null, absences: [{ from: new Date('2026-11-02T00:00:00Z'), until: new Date('2026-11-06T23:59:59Z'), reason: 'FERIAS' }, { from: new Date('2026-11-04T00:00:00Z'), until: new Date('2026-11-10T23:59:59Z'), reason: 'Licença' }] };
  const result = calculateDailyBenefit(input);
  assert.equal(result.days.length, 30); assert.equal(result.days.filter(day => day.included).length, 14);
  assert.equal(result.total.toFixed(2), '140.14'); assert.equal(result.employee.toFixed(2), '60.00'); assert.equal(result.entity.toFixed(2), '80.14'); assert.equal(result.postedAmount.toFixed(2), '60.00');
  assert.equal(result.days[3].reason, 'FERIAS');
  assert.throws(() => calculateDailyBenefit({ ...input, customValue: new Decimal('1') }), /autorização/);
  const custom = calculateDailyBenefit({ ...input, policy: { ...policy, posting: 'PROVENTO', allowCustomMonthlyValue: true }, customValue: new Decimal('90071992547409.93') });
  assert.equal(custom.postedAmount.toFixed(2), '90071992547409.93'); assert.equal(custom.employee.toFixed(2), '0.00');
  for (const amount of ['-0.01', '10000000000000000', 'NaN']) assert.throws(() => calculateDailyBenefit({ ...input, policy: { ...policy, allowCustomMonthlyValue: true }, customValue: new Decimal(amount) }), /Valor de benefício inválido/);
  assert.equal(calculateDailyBenefit({ ...input, admittedAt: new Date('2026-12-01T00:00:00Z') }).postedAmount.toFixed(2), '0.00');
  for (const patch of [{ weekdays: [1, 1] }, { maxEmployeeDiscountRate: '100.01' }, { maxEmployeeDiscountRate: undefined }]) assert.equal(hrBenefitRuleSchema.safeParse({ ...policy, ...patch }).success, false);
});

test('CSV: BOM/CRLF, quoted separators/newlines/escapes, large/signed decimal text, civil dates and strict line errors', () => {
  const rows = parsePayrollMovementImport('\uFEFFmatricula;rubrica;valor;inicio;fim;referencia;observacao\r\nA;EXTRA;90071992547409,93;2028-02-29;; ;"Ato; com ""aspas""\r\ne continuação"\r\nB;EXTRA;-0,01;2028-03-01;2028-03-31;1;Compensação');
  assert.equal(rows.length, 2); assert.equal(rows[0].amount, '90071992547409.93'); assert.equal(rows[1].amount, '-0.01');
  assert.equal(rows[0].startsAt.toISOString(), '2028-02-29T00:00:00.000Z'); assert.equal(rows[0].endsAt, null); assert.equal(rows[0].reference, null); assert.equal(rows[0].notes, 'Ato; com "aspas"\ne continuação');
  const header = 'matricula;rubrica;valor;inicio;fim;referencia;observacao\n';
  for (const row of ['A;X;1;2027-02-29;;;Observação', 'A;X;1;2028-03-02;2028-03-01;;Observação', 'A;X;1e2;2028-03-01;;;Observação', 'A;X;1;2028-03-01;;;oi', 'A;X;1;2028-03-01;;Observação']) assert.throws(() => parsePayrollMovementImport(header + row), /Linha 2/);
  assert.throws(() => parsePayrollMovementImport(header + 'A;X;1;2028-03-01;;;"sem fim'), /aspas não encerradas/);
  assert.throws(() => parsePayrollMovementImport(header), /CSV sem movimentos/);
});
