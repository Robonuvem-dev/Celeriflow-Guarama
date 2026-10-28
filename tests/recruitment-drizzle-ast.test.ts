import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { getTableConfig } from 'drizzle-orm/pg-core';
import * as tables from '../src/db/schema/personnel-recruitment';

const servicePath = 'src/lib/rh/recruitment-service.ts';
const printer = ts.createPrinter({ removeComments: true });
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function normalize(node: ts.Node, source: ts.SourceFile) {
  const result = ts.transform(node, [context => {
    const visit: ts.Visitor = value => {
      if (ts.isAsExpression(value) || ts.isParenthesizedExpression(value)) return ts.visitNode(value.expression, visit);
      if (ts.isStringLiteral(value)) return ts.factory.createStringLiteral(value.text);
      return ts.visitEachChild(value, visit, context);
    };
    return value => ts.visitNode(value, visit) as ts.Node;
  }]);
  const text = printer.printNode(ts.EmitHint.Unspecified, result.transformed[0], source);
  result.dispose();
  return text;
}

test('recruitment: original validation schemas, authorization/replay conditions, hash and ordered snapshot stay exact', () => {
  const source = ts.createSourceFile(servicePath, readFileSync(servicePath, 'utf8'), ts.ScriptTarget.Latest, true);
  const schemas: string[][] = [], conditions: string[] = [], hashes: string[] = [], snapshots: string[] = [];
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.initializer) {
      const name = node.name.getText(source);
      if (['recruitmentNoticeSchema', 'applicationInput', 'input'].includes(name)) schemas.push([name, normalize(node.initializer, source)]);
      if (name === 'hash') hashes.push(normalize(node.initializer, source));
      if (name === 'snapshot' && ts.isObjectLiteralExpression(node.initializer)) snapshots.push(normalize(node.initializer, source));
    }
    if (ts.isIfStatement(node)) {
      const condition = node.expression.getText(source);
      // These three database-dependent conditions were moved to repositories;
      // the new connection identity check is outside the original business rules.
      if (!condition.includes('context.database') && !condition.includes('readInstitutionalRecruitmentVersions') && !condition.includes('hasActiveRecruitmentApplicant') && !condition.startsWith('count &&')) conditions.push(normalize(node.expression, source));
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  // Read-only AST capture of the original module before the migration.
  assert.equal(schemas.length, 5); assert.equal(digest(schemas), '42887f0a7234d49cbe907c568a54c0b28a9e5273cebaafd8a19223e980ad8095');
  assert.equal(conditions.length, 14); assert.equal(digest(conditions), 'b436cd538169f24ddbc27b0517ff7fdffa73b32adbdf040ac04de891e12dda84');
  assert.equal(hashes.length, 1); assert.equal(digest(hashes), 'e80901a5364191328bab93e50c0b6d9c33ce16d4e4ab03586e39163e368fa50f');
  assert.equal(snapshots.length, 1); assert.equal(digest(snapshots), 'caae0f064a5b868492a21356fc2f26cab98c35c20cd1c4c108d099db9972cd4f');
});

test('recruitment: all physical columns match catalog type/nullability; typed timestamps and JSON null stay faithful', () => {
  const catalog = JSON.parse(readFileSync(new URL('./fixtures/installed-physical-catalog.json', import.meta.url), 'utf8')).catalog as { columns: Array<{ schema: string; table_name: string; name: string; type: string; not_null: boolean }> };
  let count = 0;
  assert.equal(Object.keys(tables).length, 7);
  for (const table of Object.values(tables)) {
    const config = getTableConfig(table);
    for (const column of config.columns) {
      const actual = catalog.columns.find(row => row.schema === 'public' && row.table_name === config.name && row.name === column.name);
      assert.ok(actual, `${config.name}.${column.name}`);
      let expected = column.getSQLType().replaceAll(' ', '');
      if (expected.startsWith('timestamp')) expected += 'withouttimezone';
      assert.equal(expected, actual.type.replaceAll(' ', '').replaceAll('"', ''), `${config.name}.${column.name}`);
      assert.equal(column.notNull, actual.not_null, `${config.name}.${column.name}`);
      count++;
    }
  }
  assert.equal(count, 38);
  const timestamp = tables.recruitmentApplications.decidedAt.mapFromDriverValue('2099-10-21 12:34:56.789');
  assert.ok(timestamp instanceof Date);
  assert.equal(timestamp.toISOString(), '2099-10-21T12:34:56.789Z', 'driver text must be decoded as UTC even on a non-UTC host');
});

test('recruitment: six public names/returns, three real connection transactions, same-origin reads/writes, locks and atomic audits', () => {
  const paths = [servicePath, 'src/db/repositories/personnel-recruitment/reads.ts', 'src/db/repositories/personnel-recruitment/writes.ts', 'src/lib/contracts/personnel-recruitment.ts', 'src/db/schema/personnel-recruitment.ts'];
  for (const path of paths) {
    const text = readFileSync(path, 'utf8');
    assert.doesNotMatch(text, /@prisma|\bPrisma\w*|\bprisma\b|new Proxy|\$transaction|\$queryRaw|\$executeRaw|DMMF|as unknown as|as any/);
  }
  const service = readFileSync(servicePath, 'utf8');
  const source = ts.createSourceFile(servicePath, service, ts.ScriptTarget.Latest, true);
  const exports = source.statements.filter(ts.isFunctionDeclaration).filter(node => node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword));
  assert.deepEqual(exports.map(node => node.name?.text), ['listPublicRecruitmentNotices', 'saveRecruitmentNotice', 'submitRecruitmentApplication', 'readOwnRecruitmentApplications', 'listRecruitmentApplicationsForReview', 'decideRecruitmentApplication']);
  const mutations = exports.filter(node => ['saveRecruitmentNotice', 'submitRecruitmentApplication', 'decideRecruitmentApplication'].includes(node.name!.text));
  for (const mutation of mutations) {
    assert.match(mutation.parameters[2].getText(source), /connection: DatabaseConnection = databaseConnection/);
    assert.equal(mutation.type?.getText(source), 'Promise<string>');
    assert.match(mutation.getText(source), /withDatabaseTransaction\(recruitmentConnection\(context, connection\), async tx/);
    assert.match(mutation.getText(source), /writeAuditEvent\(tx,/);
  }
  assert.equal((service.match(/withDatabaseTransaction\(/g) ?? []).length, 3);
  assert.match(service, /context\.database !== connection\.db/);
  assert.match(service, /readOwnRecruitmentApplicationRows\(context\.database \?\? db, context\.user\.id\)/);
  assert.match(service, /RH:EDITAL:\$\{input\.ruleSetId\}:\$\{input\.code\}/);
  assert.match(service, /RH:INSCRICAO_EDITAL:\$\{previous\.id\}/);
  assert.match(service, /RH:INSCRICAO_EDITAL:\$\{input\.noticeId\}/);
  const reads = readFileSync(paths[1], 'utf8'), writes = readFileSync(paths[2], 'utf8');
  assert.match(reads, /lockRecruitmentApplicationRow\(tx: DatabaseTransaction/);
  assert.match(reads, /\.for\('update'\)/);
  assert.match(reads, /#>> '\{policy,budgetUnitId\}' IN/);
  assert.match(writes, /pg_advisory_xact_lock\(hashtext\(\$\{key\}\)\)::text/);
  assert.match(writes, /decidedAt: sql`now\(\)`/);
  assert.doesNotMatch(reads + writes, /withDatabaseTransaction|databaseConnection|@\/db\/client|\.transaction\(/);
});
