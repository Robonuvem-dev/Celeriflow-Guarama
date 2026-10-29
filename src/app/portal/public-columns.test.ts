import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { transparencyCatalog } from "@/lib/transparencia/consultation-catalog";
import { fitOperationalWidths } from "@/lib/operational-tables";
import { publicOperationalColumns, transparencyOperationalColumns } from "./public-columns";

test("todas as coleções públicas preservam campos e cabem em 1224px, inclusive consolidado de pessoal", () => {
  for (const collection of transparencyCatalog) {
    for (const consolidated of [false, true]) {
      const columns = publicOperationalColumns(transparencyOperationalColumns(collection.columns, consolidated));
      assert.deepEqual(columns.filter((column) => !column.key.startsWith("__")).map((column) => column.key), collection.columns.map((column) => column.key));
      const layout = fitOperationalWidths(columns, 1224);
      assert.equal(layout.fits, true, `${collection.slug}, consolidado=${consolidated}`);
      assert.ok(layout.widths.reduce((sum, value) => sum + value, 0) <= 1224);
      assert.ok(columns.every((column) => column.type === "actions" || column.details === "overflow"));
    }
  }
});

test("as nove configurações públicas estáticas cabem em 1224px, e Estatísticas preserva os nove campos em 800px", () => {
  const files = ["construcao-civil/page.tsx", "convenentes/page.tsx", "licitacoes-e-contratos/page.tsx", "minha-area/processos/page.tsx", "planejamento/page.tsx", "portaldatransparencia/estatisticas/page.tsx", "portaldatransparencia/painel/page.tsx", "tributario/page.tsx"];
  let tables = 0;
  for (const file of files) {
    const source = ts.createSourceFile(file, readFileSync(join(process.cwd(), "src/app/portal", file), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    function visit(node: ts.Node) {
      if (ts.isJsxAttribute(node) && node.name.getText(source) === "columns" && node.initializer && ts.isJsxExpression(node.initializer) && node.initializer.expression && ts.isArrayLiteralExpression(node.initializer.expression)) {
        const columns = node.initializer.expression.elements.map((element) => {
          assert.ok(ts.isArrayLiteralExpression(element), file);
          const [key, label, initial, minimum, type] = element.elements;
          assert.ok(ts.isStringLiteral(key) && ts.isStringLiteral(label) && ts.isNumericLiteral(initial) && ts.isNumericLiteral(minimum), file);
          const action = type && ts.isStringLiteral(type) && type.text === "actions";
          return { key: key.text, label: label.text, type: action ? "actions" as const : "text" as const, initialWidth: Number(initial.text), minWidth: Number(minimum.text), maxWidth: action ? Number(initial.text) : undefined, resizable: !action, sortable: false, details: action ? "none" as const : "overflow" as const };
        });
        const available = file === "portaldatransparencia/estatisticas/page.tsx" ? 800 : 1224;
        if (available === 800) assert.deepEqual(columns.map((column) => column.key), ["entity", "type", "received", "answered", "denied", "partial", "unclassified", "identified", "anonymous"]);
        const layout = fitOperationalWidths(columns, available);
        assert.equal(layout.fits, true, file);
        assert.equal(layout.widths.reduce((sum, width) => sum + width, 0), available, file);
        tables++;
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  assert.equal(tables, 9);
});
