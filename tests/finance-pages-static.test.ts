import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import ts from "typescript";

const root = "src/app/app-domain/financeiro";

async function financePages() {
  return (await readdir(root, { recursive: true })).filter(file => file.endsWith(".tsx")).sort();
}

function parse(file: string, text: string) {
  return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

function visualStructure(source: ts.SourceFile) {
  const tokens: unknown[] = [];
  function visit(node: ts.Node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      tokens.push(["open", node.tagName.getText(source), node.attributes.properties.map(attribute => ts.isJsxAttribute(attribute)
        ? [attribute.name.getText(source), attribute.initializer && ts.isStringLiteral(attribute.initializer) ? attribute.initializer.text : "expression"] : ["spread"])]);
    } else if (ts.isJsxClosingElement(node)) tokens.push(["close", node.tagName.getText(source)]);
    else if (ts.isJsxText(node)) {
      const text = node.text.replace(/\s+/g, " ").trim();
      if (text) tokens.push(["text", text]);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return tokens;
}

test("todos os TSX de Financeiro usam contratos independentes do ORM removido", async () => {
  const files = await financePages();
  assert.equal(files.length, 64);
  for (const file of files) {
    const source = parse(file, await readFile(join(root, file), "utf8"));
    const forbidden: string[] = [];
    function visit(node: ts.Node) {
      if (ts.isIdentifier(node) && /^(?:prisma|Prisma|\$transaction|\$queryRaw|\$executeRaw)$/.test(node.text)) forbidden.push(node.text);
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && /(?:@prisma\/|\/prisma$)/.test(node.moduleSpecifier.text)) forbidden.push(node.moduleSpecifier.text);
      ts.forEachChild(node, visit);
    }
    visit(source);
    assert.deepEqual(forbidden, [], file);
  }
});

const visualBase = process.env.FINANCE_PAGES_VISUAL_BASE;
test("estrutura JSX, textos e atributos visuais coincidem com a base aprovada", { skip: !visualBase }, async () => {
  for (const file of await financePages()) {
    const relative = join(root, file);
    const [actual, approved] = await Promise.all([readFile(relative, "utf8"), readFile(join(visualBase!, relative), "utf8")]);
    assert.deepEqual(visualStructure(parse(file, actual)), visualStructure(parse(file, approved)), file);
  }
});
