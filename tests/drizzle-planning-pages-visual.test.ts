import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { getTableConfig } from "drizzle-orm/pg-core";
import * as mappings from "../src/db/schema/planning-pages";

const root = "src/components/app-ui/planejamento";
const baseline = JSON.parse(readFileSync(new URL("./fixtures/historical-visual-baselines.json", import.meta.url), "utf8")) as {
  formatVersion: number; sourceCommit: string;
  planning: {
    decimalException: { path: string; namespace: string; before: string; after: string };
    files: Record<string, { fullAstSha256: string; decimalConstructors: number; jsxRoots: { count: number; sha256: string }; decimalNormalizedJsxRoots: { count: number; sha256: string } }>;
    financeWrappers: Record<string, { fullAstSha256: string }>;
  };
};
const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");
const printer = ts.createPrinter({ removeComments: true, newLine: ts.NewLineKind.LineFeed });
function source(path: string) {
  const text = readFileSync(path, "utf8").replaceAll("\r\n", "\n");
  const { diagnostics } = ts.transpileModule(text, { fileName: path, reportDiagnostics: true, compilerOptions: { target: ts.ScriptTarget.ESNext, jsx: ts.JsxEmit.Preserve } });
  assert.deepEqual(diagnostics, [], path);
  return ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}
function jsx(path: string) {
  const parsed = source(path), nodes: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)) {
      const text = printer.printNode(ts.EmitHint.Unspecified, node, parsed);
      nodes.push(text);
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed); return nodes;
}

test("Planejamento: 15 TSX sem Prisma, 14 JSX exatos e somente binding Decimal na versão", () => {
  assert.equal(baseline.formatVersion, 1);
  assert.equal(baseline.sourceCommit, "5cfa75dfe20a6d3fcc20dce33e818585cb8b9954");
  assert.deepEqual(baseline.planning.decimalException, { path: "src/components/app-ui/planejamento/PlanningVersionPage.tsx", namespace: "Prisma.Decimal", before: "new Prisma.Decimal(", after: "new Decimal(" });
  const inventory = readdirSync(root).filter(file => file.endsWith(".tsx")); assert.equal(inventory.length, 15);
  assert.deepEqual(inventory.map(file => `${root}/${file}`).sort(), Object.keys(baseline.planning.files).sort());
  for (const file of inventory) {
    assert.doesNotMatch(readFileSync(join(root, file), "utf8"), /@prisma|\bprisma\b|\bPrisma\b/);
    const previous = baseline.planning.files[`${root}/${file}`], nodes = jsx(join(root, file));
    const actual = { count: nodes.length, sha256: sha256(JSON.stringify(nodes)) };
    if (file === "PlanningVersionPage.tsx") {
      assert.equal(previous.decimalConstructors, 1);
      assert.deepEqual(actual, previous.decimalNormalizedJsxRoots, file);
    } else assert.deepEqual(actual, previous.jsxRoots, file);
  }
  for (const file of ["lookups", "reports", "report-layouts", "publication-response"]) assert.doesNotMatch(readFileSync(`src/lib/planejamento/${file}.ts`, "utf8"), /@prisma|\bprisma\b|\bPrisma\b|as unknown as/);
});

test("Planejamento: seis componentes sem acesso persistente e wrappers Financeiro preservados", () => {
  for (const file of ["PlanningDocumentUpload", "PlanningForm", "PlanningLookupField", "PlanningRecordEditor", "PlanningReportSubmission", "PlanningMovementHistory"]) {
    const path = join(root, `${file}.tsx`);
    assert.equal(sha256(printer.printFile(source(path))), baseline.planning.files[path.replaceAll("\\", "/")].fullAstSha256, file);
  }
  const route = "src/app/app-domain/financeiro/orcamento/planejamento";
  for (const file of ["page.tsx", "PlanejamentoClient.tsx"]) {
    const path = join(route, file);
    assert.equal(sha256(printer.printFile(source(path))), baseline.planning.financeWrappers[path.replaceAll("\\", "/")].fullAstSha256, file);
  }
});

test("Planejamento: quatro mappings completos conferidos com o catálogo físico", () => {
  const catalog = JSON.parse(readFileSync(new URL("./fixtures/installed-physical-catalog.json", import.meta.url), "utf8")) as { catalog: { columns: { schema: string; table_name: string; name: string; type: string; not_null: boolean }[] } };
  assert.equal(Object.keys(mappings).length, 4);
  for (const table of Object.values(mappings)) {
    const config = getTableConfig(table), installed = catalog.catalog.columns.filter(row => row.schema === "public" && row.table_name === config.name);
    assert.equal(config.columns.length, installed.length, config.name);
    for (const column of config.columns) { const physical = installed.find(row => row.name === column.name); assert.ok(physical); assert.equal(column.notNull, physical.not_null); assert.equal(column.getSQLType().replace(/\s+/g, ""), physical.type.replace(/without time zone|\s+/g, "")); }
  }
});
