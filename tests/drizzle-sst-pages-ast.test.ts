import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(path.join(directory, entry.name)) : [path.join(directory, entry.name)]);
}
const pages = files("src/app/app-domain/sst").filter(file => file.endsWith(".tsx")).map(file => file.replaceAll("\\", "/")).sort();

test("SST: all 86 TSX preserve the historical JSX expressions and CSS byte-for-byte", () => {
  assert.equal(pages.length, 86);
  const entries = pages.map(file => {
    const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const nodes: string[] = [];
    function visit(node: ts.Node) {
      if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)) {
        nodes.push(node.getText(source));
        return;
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
    return [file, nodes];
  });
  // Captured before these edits, independently compared with the supplied
  // main-sync worktree. Includes nested JSX, conditions, strings and className.
  assert.equal(createHash("sha256").update(JSON.stringify(entries)).digest("hex"), "b9865c728366e50925ae78b6a47ce52e6c747978374bdcb7ddd0449a476e2305");
});

test("SST: TSX/readers/DTOs have no legacy ORM dependencies or page-level SQL", () => {
  for (const file of [...pages, ...files("src/db/repositories/sst-pages"), "src/lib/contracts/sst-pages.ts"]) {
    const text = readFileSync(file, "utf8");
    assert.doesNotMatch(text, /@prisma\/client|\bPrisma\b|\bprisma\b|\$queryRaw|\$transaction|@ts-ignore|@ts-nocheck/, file);
    if (file.endsWith(".tsx")) assert.doesNotMatch(text, /drizzle-orm|@\/db\/schema|\bsstRows\b|\b(?:database|executor|db)\.(?:select|execute|query|transaction)\s*[(<]/, file);
  }
});
