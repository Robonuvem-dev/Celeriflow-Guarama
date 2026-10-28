import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { getTableConfig } from 'drizzle-orm/pg-core';
import * as municipal from '../src/db/schema/municipal-setup-tools';
import * as personnel from '../src/db/schema/municipal-setup-personnel';

// Read-only extraction from the nine original scripts before edits. String
// delimiter/cast normalization does not change JSON keys, array order or values.
const empty = '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945';
const golden: Record<string, [string, string]> = {
  'seed-municipal-planning.ts': [empty, '0a107735b7a0abc4e5875d0e10654d79721726619ea5b90e7615382d2971bac9'],
  'verify-planning-readiness.ts': [empty, empty],
  'adopt-aurora-advance-accounting.ts': ['cf888d0060127cf6ce430d7140dc0d80646438830a40bfe4e06882798cfebda8', '4f247e8a9be015b3860825b1c9b7fac06df06c37f14f35286c98736de1f58e28'],
  'adopt-aurora-payroll-accounts.ts': ['a085844eefddbed9b027bf687766b6d6acc991b45e780427eb480ef238ec5e40', '503544b755974e13b74702fe18a57a01e8513b1ca670e489edfa906398df7a5c'],
  'adopt-aurora-travel-policy.ts': ['7d50d8343302274c187623f3cf1ecfef85c4d455345ff800c8e9c063b1f9b45d', '2ad46c6fca19b6f1828994c8c0a0cbff97b882b28b38a1793cd8433860fa045e'],
  'adopt-aurora-travel-workflows.ts': ['fd334698127cb0f4f142cdf703206ff3376709b6a947fedbf894a042f4078c02', '97c5623bc89879a11b4bb1ea32232980edbaa85c4c832d560620f798ecd778c8'],
  'seed-hr-documentary-poc.ts': ['f79ada6d55e7b718723a6a37875583d404c3ac69fc88d8d28097464799436ac0', '4d9da05bbf44b5546f5e36e643f4d474722b0402820177547cf4fc2487bdfc63'],
  'seed-hr-poc-linked-workflows.ts': ['9a866ca80785c49e3d99deb38dd2516dab7f890e0507cab205759044647b0809', 'da3e31380ccd5ab57b0913b13010fe8ff1d4005b3b11ba1941aa4bb69ff43e62'],
  'seed-rh.ts': [empty, empty],
};
const printer = ts.createPrinter({ removeComments: true });
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function normalize(node: ts.Node, source: ts.SourceFile) {
  const result = ts.transform(node, [context => {
    const visit: ts.Visitor = value => {
      if (ts.isAsExpression(value) || ts.isParenthesizedExpression(value)) return ts.visitNode(value.expression, visit);
      if (ts.isStringLiteral(value)) return ts.factory.createStringLiteral(value.text);
      if (ts.isCallExpression(value) && value.expression.getText(source) === 'municipalObject') return ts.visitNode(value.arguments[0], visit);
      return ts.visitEachChild(value, visit, context);
    };
    return value => ts.visitNode(value, visit) as ts.Node;
  }]);
  const text = printer.printNode(ts.EmitHint.Unspecified, result.transformed[0], source);
  result.dispose();
  return text;
}

test('municipal setup: nine original hash definitions, payloads and POC rules stay exact', () => {
  assert.equal(Object.keys(golden).length, 9);
  for (const [name, [definitionsHash, payloadHash]] of Object.entries(golden)) {
    const source = ts.createSourceFile(name, readFileSync(`scripts/${name}`, 'utf8'), ts.ScriptTarget.Latest, true);
    const definitions = source.statements.filter(ts.isVariableStatement).flatMap(statement => statement.declarationList.declarations).map(declaration => [declaration.name.getText(source), declaration.initializer ? normalize(declaration.initializer, source) : null]);
    assert.equal(digest(definitions), definitionsHash, name);
    const payloads: Array<[string, string]> = [];
    function visit(node: ts.Node) {
      if (ts.isPropertyAssignment(node) && ['payload', 'details', 'specialParameters'].includes(node.name.getText(source))) payloads.push([node.name.getText(source), normalize(node.initializer, source)]);
      ts.forEachChild(node, visit);
    }
    visit(source);
    assert.equal(digest(payloads), payloadHash, name);
  }
  const source = ts.createSourceFile('poc', readFileSync('scripts/lib/municipal-setup-poc.ts', 'utf8'), ts.ScriptTarget.Latest, true);
  const definitions: Array<[string, string]> = [];
  function collectPoc(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && ['definitions', 'rules'].includes(node.name.getText(source))) definitions.push([node.name.getText(source), normalize(node.initializer!, source)]);
    ts.forEachChild(node, collectPoc);
  }
  collectPoc(source);
  assert.equal(digest(definitions), '01df6aec7daf0bdc2607b4953ef9d05abe10631d399aa3164ab634aaacabd977');
  const reference = source.statements.filter(ts.isVariableStatement).flatMap(statement => statement.declarationList.declarations).filter(declaration => ['RH_POC_CODE', 'RH_POC_REFERENCE'].includes(declaration.name.getText(source))).map(declaration => [declaration.name.getText(source), ts.isStringLiteral(declaration.initializer!) ? declaration.initializer.text : null]);
  assert.equal(digest(reference), 'b928bbef73f92fd5e26c725cfce7af2582694c607d8f15488e37638748dc5dce');
});

test('municipal setup: physical mappings, real-transaction contracts and no legacy client calls', () => {
  const helpers = ['scripts/lib/municipal-setup-tools.ts', 'scripts/lib/municipal-setup-poc.ts'];
  for (const file of [...Object.keys(golden).map(name => `scripts/${name}`), ...helpers]) {
    const text = readFileSync(file, 'utf8');
    // _prisma_migrations is an existing physical history table, not an ORM API.
    assert.doesNotMatch(text, /@prisma|\bPrisma\w*|\bprisma\b|new Proxy|\$transaction|\$queryRaw|\$executeRaw|DMMF|lib\/rh\/poc-bootstrap/);
    if (!helpers.includes(file)) assert.match(text, /require\.main === module/);
  }
  const catalog = JSON.parse(readFileSync(new URL('./fixtures/installed-physical-catalog.json', import.meta.url), 'utf8')).catalog as { columns: Array<{ schema: string; table_name: string; name: string; type: string; not_null: boolean }> };
  let columns = 0;
  for (const table of [...Object.values(municipal), ...Object.values(personnel)]) {
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
  assert.equal(columns, 448);
  const poc = readFileSync(helpers[1], 'utf8');
  assert.equal((poc.match(/withDatabaseTransaction\(connection/g) ?? []).length, 3);
  assert.match(poc, /saveEmploymentContractInTransaction\(tx, actorId/);
});

test('legacy RH seed: all seventeen original insert payloads, enums and mutable Date expressions stay exact', () => {
  const source = ts.createSourceFile('rh', readFileSync('scripts/seed-rh.ts', 'utf8'), ts.ScriptTarget.Latest, true);
  const writes: string[][] = [];
  function collectWrites(node: ts.Node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'values') {
      const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.Standard, normalize(node.arguments[0], source));
      const tokens: string[] = [];
      while (scanner.scan() !== ts.SyntaxKind.EndOfFileToken) tokens.push(scanner.getTokenText());
      writes.push(tokens);
    }
    ts.forEachChild(node, collectWrites);
  }
  collectWrites(source);
  assert.equal(writes.length, 17);
  assert.equal(digest(writes), 'c152e8cf0698b897f95b9d29e0266a5371b6620b1f0ba37184906eb0cfccf75a');
});
