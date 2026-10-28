import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import ts from 'typescript';

function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(path.join(directory, entry.name)) : [path.join(directory, entry.name)]);
}
const pages = files('src/app/app-domain/rh').filter(file => file.endsWith('.tsx')).map(file => file.replaceAll('\\', '/')).sort();
const readers = files('src/db/repositories/personnel-pages');
const printer = ts.createPrinter({ removeComments: true, newLine: ts.NewLineKind.LineFeed });

test('RH: os 98 TSX conservam integralmente o JSX/CSS da base 5cfa75d', () => {
  assert.equal(pages.length, 98);
  const entries = pages.map(file => {
    const source = ts.createSourceFile(file, readFileSync(file, 'utf8').replaceAll('\r\n', '\n'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const nodes: string[] = [];
    function visit(node: ts.Node) {
      if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)) {
        nodes.push(printer.printNode(ts.EmitHint.Unspecified, node, source));
        return;
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
    return [file, nodes];
  });
  // Read-only extraction from fixed commit 5cfa75dfe20a6d3fcc20dce33e818585cb8b9954,
  // canonicalizing only CRLF. Includes JSX expressions and all class/style literals.
  assert.equal(createHash('sha256').update(JSON.stringify(entries)).digest('hex'), '19c3e7885201ca55ae4af58d87062b41944cc27557a1f9d6468fde27434ef951');
});

test('RH: páginas, leitores e DTO não importam cliente/tipos legados nem têm queries inline', () => {
  for (const file of [...pages, ...readers, 'src/lib/contracts/personnel-pages.ts']) {
    const text = readFileSync(file, 'utf8');
    assert.doesNotMatch(text, /@prisma\/client|Prisma\.|context\.prisma|\$queryRaw|\$transaction/, file);
    if (file.endsWith('.tsx')) assert.doesNotMatch(text, /\b(?:database|executor|db)\.(?:select|execute|query|transaction)\s*[(<]/, file);
  }
});
