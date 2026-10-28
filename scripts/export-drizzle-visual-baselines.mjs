import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

// Only immutable Git objects supply expected content. The current worktree is
// never read to manufacture a baseline. CI consumes the exported JSON directly.
const commit = '5cfa75dfe20a6d3fcc20dce33e818585cb8b9954';
const cwd = fileURLToPath(new URL('../', import.meta.url));
const git = args => execFileSync('git', args, { cwd, maxBuffer: 8 * 1024 * 1024 });
git(['cat-file', '-e', `${commit}^{commit}`]);
const sha256 = value => createHash('sha256').update(value).digest('hex');
const fingerprint = nodes => ({ count: nodes.length, sha256: sha256(JSON.stringify(nodes)) });
const printer = ts.createPrinter({ removeComments: true, newLine: ts.NewLineKind.LineFeed });
function inventory(roots) {
  return git(['ls-tree', '-r', '--name-only', '-z', commit, '--', ...roots]).toString('utf8').split('\0').filter(path => path.endsWith('.tsx')).sort();
}
function read(path) {
  const bytes = git(['show', `${commit}:${path}`]);
  const source = ts.createSourceFile(path, bytes.toString('utf8').replaceAll('\r\n', '\n'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  assert.deepEqual(source.parseDiagnostics, [], path);
  const printed = [], verbatim = [];
  function visit(node) {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)) {
      printed.push(printer.printNode(ts.EmitHint.Unspecified, node, source));
      verbatim.push(node.getText(source).replaceAll('\r\n', '\n'));
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return { sourceSha256: sha256(bytes), fullAstSha256: sha256(printer.printFile(source)), printed, verbatim };
}
const worksRoot = 'src/app/app-domain/obras';
const worksPaths = inventory([worksRoot]);
assert.equal(worksPaths.length, 59);
const works = Object.fromEntries(worksPaths.map(path => {
  const before = read(path);
  return [path, { sourceSha256: before.sourceSha256, jsxRoots: fingerprint(before.printed) }];
}));
const planningRoot = 'src/components/app-ui/planejamento';
const planningPaths = inventory([planningRoot]);
assert.equal(planningPaths.length, 15);
const planningDecimalException = {
  path: `${planningRoot}/PlanningVersionPage.tsx`,
  namespace: 'Prisma.Decimal',
  before: 'new Prisma.Decimal(',
  after: 'new Decimal(',
};
const planning = Object.fromEntries(planningPaths.map(path => {
  const before = read(path), decimalConstructors = before.printed.join('\n').match(/new Prisma\.Decimal\(/g)?.length ?? 0;
  assert.equal(decimalConstructors, path === planningDecimalException.path ? 1 : 0, path);
  return [path, { sourceSha256: before.sourceSha256, fullAstSha256: before.fullAstSha256, jsxRoots: fingerprint(before.printed), decimalConstructors, decimalNormalizedJsxRoots: fingerprint(before.printed.map(node => node.replace(/new Prisma\.Decimal\(/g, 'new Decimal('))) }];
}));
const financeWrapperPaths = ['src/app/app-domain/financeiro/orcamento/planejamento/page.tsx', 'src/app/app-domain/financeiro/orcamento/planejamento/PlanejamentoClient.tsx'];
const financeWrappers = Object.fromEntries(financeWrapperPaths.map(path => {
  const before = read(path);
  return [path, { sourceSha256: before.sourceSha256, fullAstSha256: before.fullAstSha256 }];
}));
const cemeteryRoots = ['src/lib/cemeteries', 'src/app/app-domain/cemiterios', 'src/app/api/cemiterios', 'src/components/cemeteries', 'src/db/repositories/cemeteries'];
const cemeteryPaths = inventory(cemeteryRoots);
assert.equal(cemeteryPaths.length, 24);
const decimalException = {
  path: 'src/app/app-domain/cemiterios/taxas/guias/[id]/page.tsx',
  namespace: 'Prisma.Decimal',
  before: 'Prisma.Decimal.max(0, total.minus(paid))',
  after: 'Decimal.max(0, total.minus(paid))',
};
const cemetery = Object.fromEntries(cemeteryPaths.map(path => {
  const before = read(path), decimalOccurrences = before.verbatim.reduce((count, node) => count + node.split(decimalException.before).length - 1, 0);
  assert.equal(decimalOccurrences, path === decimalException.path ? 1 : 0, path);
  return [path, { sourceSha256: before.sourceSha256, jsxRoots: fingerprint(before.verbatim), decimalOccurrences, decimalNormalizedJsxRoots: fingerprint(before.verbatim.map(node => node.replace(decimalException.before, decimalException.after))) }];
}));
const exported = {
  formatVersion: 1,
  sourceCommit: commit,
  typescriptVersion: ts.version,
  works: { root: worksRoot, files: works },
  planning: { root: planningRoot, decimalException: planningDecimalException, files: planning, financeWrappers },
  cemetery: { roots: cemeteryRoots, decimalException, files: cemetery },
};
const output = `${JSON.stringify(exported, null, 2)}\n`;
writeFileSync(new URL('../tests/fixtures/historical-visual-baselines.json', import.meta.url), output);
console.log(JSON.stringify({ fixture: 'tests/fixtures/historical-visual-baselines.json', sourceCommit: commit, sha256: sha256(output), bytes: Buffer.byteLength(output), works: worksPaths.length, planning: planningPaths.length, financeWrappers: financeWrapperPaths.length, cemetery: cemeteryPaths.length }));
