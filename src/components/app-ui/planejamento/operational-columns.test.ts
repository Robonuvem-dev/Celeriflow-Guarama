import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { OPERATIONAL_PAGE_SIZE, OPERATIONAL_ROW_HEIGHT } from "@/lib/operational-tables";

const files = ["PlanningCatalogPage.tsx", "PlanningHearingsPage.tsx", "PlanningImportsPage.tsx", "PlanningManagementPage.tsx", "PlanningMovementHistory.tsx", "PlanningPages.tsx", "PlanningReferencePage.tsx", "PlanningVersionPage.tsx", "PlanningForm.tsx", "PlanningLookupField.tsx", "../../cemeteries/StructurePages.tsx", "../../cemeteries/CemeteryAttachments.tsx"];

function minimum(node: ts.Node): number {
  if (ts.isJsxExpression(node) || ts.isParenthesizedExpression(node) || ts.isSpreadElement(node)) return minimum(node.expression!);
  if (ts.isArrayLiteralExpression(node)) return node.elements.reduce((sum, element) => sum + minimum(element), 0);
  if (ts.isConditionalExpression(node)) return Math.max(minimum(node.whenTrue), minimum(node.whenFalse));
  if (ts.isCallExpression(node) && ["col", "column", "draftColumn"].includes(node.expression.getText())) {
    const value = node.arguments[2];
    assert.ok(value && ts.isNumericLiteral(value), "Cada mínimo deve ser explícito");
    return Number(value.text);
  }
  if (ts.isObjectLiteralExpression(node)) {
    const property = node.properties.find(item => ts.isPropertyAssignment(item) && item.name.getText() === "minWidth");
    assert.ok(property && ts.isPropertyAssignment(property) && ts.isNumericLiteral(property.initializer));
    return Number(property.initializer.text);
  }
  throw new Error(`Configuração de colunas sem verificação: ${node.getText()}`);
}

test("todos os mínimos configurados no lote cabem nos 1224 px úteis do desktop, sem remover colunas", () => {
  let checked = 0;
  for (const file of files) {
    const source = ts.createSourceFile(file, readFileSync(new URL(file, import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    function visit(node: ts.Node) {
      if (ts.isJsxAttribute(node) && node.name.getText(source) === "columns") {
        assert.ok(node.initializer);
        const width = minimum(node.initializer);
        assert.ok(width > 0 && width <= 1224, `${file}: mínimos ${width} > 1224`);
        checked++;
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  assert.ok(checked >= 25, `${checked} configurações verificadas`);
  assert.equal((OPERATIONAL_PAGE_SIZE + 1) * OPERATIONAL_ROW_HEIGHT, 504);
});
