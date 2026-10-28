import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { getTableConfig } from 'drizzle-orm/pg-core';
import * as schema from '../src/db/schema/finance-setup-tools';

// Extracted read-only from all twelve original programs before editing.
const golden: Record<string, [string, string]> = {
  'prepare-aurora-accounting-actor.ts': ['7c1bb65bb369e700eda01d0efffc2db39777922374814637a435de10bc9bbc0c', 'efa1fc9ceb0b355c8f0f2f01487e152c11d7890e5de250e5a493b85d855ae6e8'],
  'prepare-aurora-bank-resource-sources.ts': ['46e429d12f78eb6ea5a4cd1cccee50de69b17cfb3078287b9581b58dd2883f7c', 'be888d4f31e6f67c1d2a8aa606f4f29ab5ff8e814badfc36f3569bbb61c7beb2'],
  'prepare-aurora-budget-posting-matrix.ts': ['7ae7490c146236b6f94c6994e9dd9c791054444a6d504aa2a231bd0156da4e5c', '65adf6b1c9b56203f03fa1d48cab5859ddee58ed90114bcbf0dfc2583c6ae674'],
  'prepare-aurora-finance-control.ts': ['02a3d343874f1d578c59c6d3befe5d463a489a271643d66bc7eac20440478fa9', 'd7cd7c2865b39235974b23ffdb02ad4c27b82cf27534b7c642bbcdab5d30c981'],
  'prepare-aurora-payment-posting-matrix.ts': ['e89637bdddc33fbfac54caa261edefb8120e082337b5593e5b2766f8d9f88830', '4de6db3fe4e89d356e7c57a4689cbc809b267082318f8f63e1601285264a9a07'],
  'prepare-aurora-rap-posting-matrix.ts': ['c8c204f80910dc54b794e1fc4dd2e8f3799e61fc845d08dd8be964c5b48be3fc', 'e0ddfa4fc148118a6cb693ff7ba98a187f6dde3371e3556fc3ec9063c2e1ca34'],
  'prepare-aurora-rap-registration-matrix.ts': ['4bff8b5b38bb9ab2ab6c4e07ba828d6e9a6791f5a624fe425029203d301d98b1', '1ac110cdc95db3c4be86c7b387e47fc81fc4936b66a7a2a613b6c2fcd7565c82'],
  'inspect-aurora-annual-reference.ts': ['4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945', '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945'],
  'inspect-aurora-rap-reference.ts': ['4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945', '609473cf08ad896d324b27e6f97df6add1a30371d3cc472efdddf98238b2525d'],
  'verify-aurora-annual-readiness.ts': ['4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945', '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945'],
  'verify-aurora-resource-availability.ts': ['4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945', '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945'],
  'repair-financial-year-8081.ts': ['b4c0f0f9ea55f9029b1ac386f8d44f0b7d97da30071e67d97ab5b55e43560537', '2835eeb9255ebcff624b1f7b504741744b42497bab869a97b5476bc6e5c2c59a'],
};
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const printer = ts.createPrinter({ removeComments: true });

test('AST setup: twelve original definition/hash expressions and twenty JSON payloads remain byte-equivalent', () => {
  assert.equal(Object.keys(golden).length, 12);
  let payloadCount = 0;
  for (const [file, [definitionsHash, payloadHash]] of Object.entries(golden)) {
    const source = ts.createSourceFile(file, readFileSync(`scripts/${file}`, 'utf8'), ts.ScriptTarget.Latest, true);
    const definitions = source.statements.filter(ts.isVariableStatement).flatMap(statement => statement.declarationList.declarations).filter(declaration => !['object', 'json'].includes(declaration.name.getText(source))).map(declaration => [declaration.name.getText(source), printer.printNode(ts.EmitHint.Expression, declaration.initializer!, source)]);
    assert.equal(digest(definitions), definitionsHash, file);
    const payloads: Array<[string, string]> = [];
    function visit(node: ts.Node) {
      if (ts.isPropertyAssignment(node) && ['payload', 'snapshot', 'sourceSnapshot', 'attributes'].includes(node.name.getText(source))) {
        const result = ts.transform(node.initializer, [context => {
          const normalize: ts.Visitor = value => {
            if (ts.isAsExpression(value) || ts.isTypeAssertionExpression(value) || ts.isParenthesizedExpression(value)) return ts.visitNode(value.expression, normalize);
            if (ts.isCallExpression(value) && value.expression.getText(source) === 'setupObject') return ts.visitNode(value.arguments[0], normalize);
            return ts.visitEachChild(value, normalize, context);
          };
          return value => ts.visitNode(value, normalize) as ts.Expression;
        }]);
        payloads.push([node.name.getText(source), printer.printNode(ts.EmitHint.Expression, result.transformed[0], source)]);
        result.dispose();
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
    payloadCount += payloads.length;
    assert.equal(digest(payloads), payloadHash, file);
  }
  assert.equal(payloadCount, 20);
});

test('AST setup: zero legacy APIs, own connection lifecycle and mapped physical columns', () => {
  for (const file of [...Object.keys(golden).map(name => `scripts/${name}`), 'scripts/lib/finance-setup-tools.ts', 'src/db/schema/finance-setup-tools.ts']) {
    const text = readFileSync(file, 'utf8');
    assert.doesNotMatch(text, /@prisma|Prisma|\bprisma\b|new Proxy|\$transaction|\$queryRaw|\$executeRaw|DMMF/, file);
    assert.doesNotMatch(text, /\.toNumber\(|Number\([^)]*(?:value|amount|balance)/i, file);
    if (file.startsWith('scripts/') && !file.includes('/lib/')) {
      assert.match(text, /require\.main === module/, file);
      assert.match(text, /finally \{ await connection\.pool\.end\(\); \}/, file);
    }
  }
  const catalog = JSON.parse(readFileSync(new URL('./fixtures/installed-physical-catalog.json', import.meta.url), 'utf8')).catalog as { columns: Array<{ schema: string; table_name: string; name: string; type: string; not_null: boolean }> };
  let columns = 0;
  for (const table of Object.values(schema)) {
    const config = getTableConfig(table);
    for (const column of config.columns) {
      const actual = catalog.columns.find(item => item.schema === 'public' && item.table_name === config.name && item.name === column.name);
      assert.ok(actual, `${config.name}.${column.name}`);
      const expected = column.getSQLType().replaceAll(' ', '').toLowerCase();
      assert.equal(expected.startsWith('timestamp') ? `${expected}withouttimezone` : expected, actual.type.replaceAll(' ', '').toLowerCase(), `${config.name}.${column.name}`);
      if (column.notNull) assert.equal(actual.not_null, true, `${config.name}.${column.name}`);
      columns++;
    }
  }
  assert.equal(columns, 196);
});
