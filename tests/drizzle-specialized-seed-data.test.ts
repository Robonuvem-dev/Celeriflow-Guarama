import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import ts from 'typescript';

// Captured from the original synthetic sources before the ORM migration.
// This protects literal arrays, generation formulas and local seed-helper
// inputs without importing/executing a seed or opening a database connection.
const originalData = [
  ['seed-camara.ts', 8, '4e984d4f1366aaeb8ed2a7d0153a35f11baad96070b7fd119dcd05776d663011'],
  ['seed-seguranca.ts', 4, '3d158ce2bab0573664e81ca87d8b5e25f7a84c065e9741e2f7ae7fd6287d6087'],
  ['seed-mod4.ts', 16, '2c0a423c5e71c3962c1bc994c0fbd5e9b17e8155cf5f8ec98fe366a2ac1dda3b'],
  ['seed-mod5.ts', 11, '7bcb84882ddf86a191f3798b2b8392e0ac677a0e2d27d076e57377054befeb43'],
  ['seed-modulo12.ts', 12, '4104be474f2176e6e81e354ab8163341f8263b0c985c02a39676685ea704309e'],
  ['seed-modulo13.ts', 17, 'edde49fda18c46454ddfbe09cf3a4f04c544738aafd43ae69b52cfe05d6b4bec'],
  ['seed-modulo14.ts', 1, 'e771c84e72d8fada310535782874e5592d7dac5e5ef47808995308a2d0d13afc'],
  ['seed-obras.ts', 8, 'c74752b83f2ba5d76e5b0fc33d11c1137f3ecfee235fa00eacb30a7962c1f828'],
  ['seed-patrimonio.ts', 53, 'b1122a0385ebfb990bc370fd5c214fdf0e4552e8b4443a9be89a4de307e352af'],
] as const;

const persistenceBindings = new Set(['db', 'tx', 'connection']);
const seedMappings = new Set(['connection', 'db', 'seedTimestamps', 'medicineBatches', 'vaccines', 'vaccinationRecords']);
const printer = ts.createPrinter({ removeComments: true });

function walk(node: ts.Node, visit: (node: ts.Node) => void) {
  visit(node);
  ts.forEachChild(node, child => walk(child, visit));
}

function isPureData(node: ts.Node) {
  let pure = true;
  walk(node, child => {
    if (ts.isAwaitExpression(child) || (ts.isIdentifier(child) && persistenceBindings.has(child.text))) pure = false;
  });
  return pure;
}

function tokens(node: ts.Node, source: ts.SourceFile) {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.Standard, printer.printNode(ts.EmitHint.Unspecified, node, source));
  const result: Array<[ts.SyntaxKind, string]> = [];
  for (let kind = scanner.scan(); kind !== ts.SyntaxKind.EndOfFileToken; kind = scanner.scan()) result.push([kind, scanner.getTokenText()]);
  return JSON.stringify(result);
}

for (const [file, count, sha256] of originalData) {
  test(`synthetic seed data remains equivalent: ${file}`, () => {
    const source = ts.createSourceFile(file, readFileSync(resolve('prisma', file), 'utf8'), ts.ScriptTarget.Latest, true);
    const expressions: string[] = [];
    walk(source, node => {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && !seedMappings.has(node.name.text) && isPureData(node.initializer)) {
        if ((ts.isArrayLiteralExpression(node.initializer) && !node.initializer.elements.length) || ts.isObjectLiteralExpression(node.initializer)) return;
        expressions.push(`variable:${node.name.text}:${tokens(node.initializer, source)}`);
      }
      if (ts.isArrayLiteralExpression(node) && node.elements.length && node.elements.every(element => ts.isObjectLiteralExpression(element) || ts.isStringLiteral(element) || ts.isNumericLiteral(element)) && isPureData(node)) {
        expressions.push(`array:${tokens(node, source)}`);
      }
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && /^(ensure|upsert)/.test(node.expression.text)) {
        expressions.push(`helper:${tokens(node, source)}`);
      }
    });
    assert.equal(expressions.length, count, 'synthetic expression count changed');
    assert.equal(createHash('sha256').update(expressions.sort().join('\n')).digest('hex'), sha256, 'original literal data or generation expressions changed');
  });
}
