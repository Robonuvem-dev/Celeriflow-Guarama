import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { getTableColumns, getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import * as tables from "../src/db/schema/cemeteries";

function sources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? sources(join(directory, entry.name)) : /\.(ts|tsx)$/.test(entry.name) ? [join(directory, entry.name)] : []);
}
const owned = ["src/lib/cemeteries", "src/app/app-domain/cemiterios", "src/app/api/cemiterios", "src/components/cemeteries", "src/db/repositories/cemeteries"];
const sourceFiles = [...owned.flatMap(sources), "src/db/schema/cemeteries.ts", "src/lib/contracts/cemeteries-fees.ts", "src/lib/contracts/cemeteries-workflow.ts", "scripts/seed-cemetery-demo.ts"];

test("reserva cemiterial: sintaxe e nenhuma dependência/consulta do ORM removido", () => {
  for (const file of sourceFiles) {
    const source = readFileSync(file, "utf8");
    const compiled = ts.transpileModule(source, { fileName: file, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.Preserve, isolatedModules: true }, reportDiagnostics: true });
    assert.deepEqual((compiled.diagnostics ?? []).filter(item => item.category === ts.DiagnosticCategory.Error).map(item => ts.flattenDiagnosticMessageText(item.messageText, "\n")), [], file);
    assert.ok(!/@prisma\//.test(source), file);
    assert.ok(!/\.(?:\$transaction|\$queryRaw(?:Unsafe)?|\$executeRaw(?:Unsafe)?)\b/.test(source), file);
    assert.ok(!/\b(?:PrismaClient|TransactionClient|Prisma)\b/.test(source), file);
  }
});

function jsxRoots(source: string, file: string) {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const result: string[] = [];
  function visit(node: ts.Node) {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)) {
      result.push(node.getText(tree).replaceAll("\r\n", "\n"));
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  return result;
}
const visualBase = JSON.parse(readFileSync(new URL("./fixtures/historical-visual-baselines.json", import.meta.url), "utf8")) as {
  formatVersion: number; sourceCommit: string;
  cemetery: {
    decimalException: { path: string; namespace: string; before: string; after: string };
    files: Record<string, { decimalOccurrences: number; jsxRoots: { count: number; sha256: string }; decimalNormalizedJsxRoots: { count: number; sha256: string } }>;
  };
};
const fingerprint = (nodes: string[]) => ({ count: nodes.length, sha256: createHash("sha256").update(JSON.stringify(nodes)).digest("hex") });
test("JSX/CSS cemiterial preservado por AST contra a cópia visual", t => {
  assert.equal(visualBase.formatVersion, 1);
  assert.equal(visualBase.sourceCommit, "5cfa75dfe20a6d3fcc20dce33e818585cb8b9954");
  assert.deepEqual(visualBase.cemetery.decimalException, { path: "src/app/app-domain/cemiterios/taxas/guias/[id]/page.tsx", namespace: "Prisma.Decimal", before: "Prisma.Decimal.max(0, total.minus(paid))", after: "Decimal.max(0, total.minus(paid))" });
  const files = sourceFiles.filter(file => file.endsWith(".tsx"));
  assert.deepEqual(files.map(file => file.replaceAll("\\", "/")).sort(), Object.keys(visualBase.cemetery.files).sort());
  let strict = 0, scalarOnly = 0;
  for (const file of files) {
    const before = visualBase.cemetery.files[file.replaceAll("\\", "/")];
    const after = fingerprint(jsxRoots(readFileSync(file, "utf8"), file));
    if (before.jsxRoots.count === after.count && before.jsxRoots.sha256 === after.sha256) { strict++; continue; }
    // The only allowed expression change removes the former decimal namespace;
    // markup, props, CSS, text and the arithmetic itself must remain identical.
    assert.equal(file.replaceAll("\\", "/"), "src/app/app-domain/cemiterios/taxas/guias/[id]/page.tsx");
    assert.equal(before.decimalOccurrences, 1);
    assert.deepEqual(before.decimalNormalizedJsxRoots, after, relative(".", file));
    scalarOnly++;
  }
  t.diagnostic(JSON.stringify({ compared: files.length, exactJsxRoots: strict, decimalNamespaceOnly: scalarOnly, sourceCommit: visualBase.sourceCommit }));
});

const catalogFile = new URL("./fixtures/installed-physical-catalog.json", import.meta.url);
test("mapeamento cemiterial corresponde ao catálogo instalado, inclusive FK nullable SET NULL", t => {
  const snapshot: { catalog: { columns: { schema: string; table_name: string; name: string; type: string; not_null: boolean }[]; constraints: { schema: string; table_name: string; name: string; definition: string }[] } } = JSON.parse(readFileSync(catalogFile, "utf8"));
  const physical = new Map(snapshot.catalog.columns.filter(column => column.schema === "public").map(column => [`${column.table_name}.${column.name}`, column]));
  const normalize = (type: string) => type.replace(/\s+/g, " ").replace(/\s+\(/g, "(").replace(" without time zone", "").replace("decimal(", "numeric(");
  let checked = 0;
  for (const table of Object.values(tables)) {
    for (const column of Object.values(getTableColumns(table))) {
      const name = `${getTableName(table)}.${column.name}`, installed = physical.get(name);
      assert.ok(installed, name);
      assert.equal(normalize(column.getSQLType()), normalize(installed.type), name);
      assert.equal(column.notNull, installed.not_null, name);
      checked++;
    }
  }
  const installed = snapshot.catalog.constraints.find(constraint => constraint.name === "TaxBurialMovement_deceasedId_fkey");
  assert.equal(installed?.definition, 'FOREIGN KEY ("deceasedId") REFERENCES "TaxDeceased"(id) ON UPDATE CASCADE ON DELETE SET NULL');
  const mapping = getTableConfig(tables.cemeteryMovements).foreignKeys.find(key => key.reference().columns.some(column => column.name === "deceasedId"));
  assert.equal(tables.cemeteryMovements.deceasedId.notNull, false);
  assert.equal(mapping?.onDelete, "set null"); assert.equal(mapping?.onUpdate, "cascade");
  t.diagnostic(JSON.stringify({ columnsChecked: checked, tablesChecked: Object.keys(tables).length, snapshot: "tests/fixtures/installed-physical-catalog.json" }));
});
