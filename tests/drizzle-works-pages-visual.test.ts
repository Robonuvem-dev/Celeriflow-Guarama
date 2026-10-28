import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { getTableConfig } from "drizzle-orm/pg-core";
import * as mappings from "../src/db/schema/works-pages";

const root = join(process.cwd(), "src/app/app-domain/obras");
const baseline = JSON.parse(readFileSync(new URL("./fixtures/historical-visual-baselines.json", import.meta.url), "utf8")) as {
  formatVersion: number; sourceCommit: string;
  works: { files: Record<string, { jsxRoots: { count: number; sha256: string } }> };
};
function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(join(directory, entry.name)) : entry.name.endsWith(".tsx") ? [join(directory, entry.name)] : []);
}
const printer = ts.createPrinter({ removeComments: true, newLine: ts.NewLineKind.LineFeed });
function jsx(source: ts.SourceFile) {
  const result: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)) { result.push(printer.printNode(ts.EmitHint.Unspecified, node, source)); return; }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return result;
}

test("Obras: todos os TSX sem dependência Prisma ativa e com sintaxe válida", () => {
  const inventory = files(root);
  assert.equal(inventory.length, 59);
  for (const file of inventory) {
    const text = readFileSync(file, "utf8");
    assert.doesNotMatch(text, /\b[Pp]risma\b|@prisma\//, relative(root, file));
    const result = ts.transpileModule(text, { fileName: file, reportDiagnostics: true, compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.Preserve } });
    assert.deepEqual(result.diagnostics, [], relative(root, file));
  }
});

test("Obras: AST de todos os JSX/CSS idêntico à baseline 5cfa75d", () => {
  assert.equal(baseline.formatVersion, 1);
  assert.equal(baseline.sourceCommit, "5cfa75dfe20a6d3fcc20dce33e818585cb8b9954");
  const inventory = files(root);
  assert.deepEqual(inventory.map(file => relative(process.cwd(), file).replaceAll("\\", "/")).sort(), Object.keys(baseline.works.files).sort());
  for (const file of inventory) {
    const path = relative(process.cwd(), file).replaceAll("\\", "/");
    const parsed = ts.createSourceFile(file, readFileSync(file, "utf8").replaceAll("\r\n", "\n"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const nodes = jsx(parsed);
    assert.deepEqual({ count: nodes.length, sha256: createHash("sha256").update(JSON.stringify(nodes)).digest("hex") }, baseline.works.files[path].jsxRoots, relative(root, file));
  }
});

test("Obras: mappings exclusivos completos e compatíveis com o catálogo físico", () => {
  const captured = JSON.parse(readFileSync(new URL("./fixtures/installed-physical-catalog.json", import.meta.url), "utf8")) as { catalog: { columns: { schema: string; table_name: string; name: string; type: string; not_null: boolean }[] } };
  for (const table of Object.values(mappings)) {
    const config = getTableConfig(table);
    const columns = captured.catalog.columns.filter(column => column.schema === "public" && column.table_name === config.name);
    assert.equal(config.columns.length, columns.length, config.name);
    for (const column of config.columns) {
      const physical = columns.find(value => value.name === column.name);
      assert.ok(physical, `${config.name}.${column.name}`);
      assert.equal(column.notNull, physical.not_null, `${config.name}.${column.name} nullability`);
      const declared = column.getSQLType().replace(/\s+/g, "").toLowerCase();
      const installed = physical.type.replace(/without time zone/g, "").replace(/\s+/g, "").toLowerCase();
      assert.equal(declared, installed, `${config.name}.${column.name} physical type`);
    }
  }
});
