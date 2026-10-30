import assert from "node:assert/strict";
import ts from "typescript";
import { z } from "zod";
import type { MasterDataCatalog, MasterDataOption } from "../src/app/app-domain/cadastros/master-data-types";

const optionSchema = z.object({ value: z.string(), label: z.string() }).strict();
const metadataSchema = z.object({
  columns: z.array(z.object({ key: z.string(), label: z.string() }).strict()),
  fields: z.array(z.object({ name: z.string(), label: z.string(), type: z.enum(["text", "textarea", "date", "number", "checkbox", "select", "multiselect"]).optional(), required: z.boolean().optional(), options: z.array(optionSchema).optional(), placeholder: z.string().optional() }).strict()),
});

// A deliberately small AST interpreter, not JavaScript evaluation. A new page
// expression outside this literal/option-map grammar fails for explicit review.
function expression(node: ts.Expression, values: Map<string, unknown>): unknown {
  if (ts.isParenthesizedExpression(node)) return expression(node.expression, values);
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (ts.isIdentifier(node)) { assert.ok(values.has(node.text), `Unknown metadata identifier: ${node.text}`); return values.get(node.text); }
  if (ts.isArrayLiteralExpression(node)) return node.elements.map(item => expression(item, values));
  if (ts.isObjectLiteralExpression(node)) return Object.fromEntries(node.properties.map(property => {
    if (ts.isShorthandPropertyAssignment(property)) return [property.name.text, expression(property.name, values)];
    assert.ok(ts.isPropertyAssignment(property) && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)));
    return [property.name.text, expression(property.initializer, values)];
  }));
  if (ts.isPropertyAccessExpression(node)) {
    const object = expression(node.expression, values);
    assert.ok(object && typeof object === "object" && Object.hasOwn(object, node.name.text));
    return Reflect.get(object, node.name.text);
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken) return expression(node.left, values) === expression(node.right, values);
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
    const object = expression(node.expression.expression, values), method = node.expression.name.text;
    if (method === "map" && Array.isArray(object) && node.arguments.length === 1) {
      const callback = node.arguments[0];
      assert.ok(ts.isArrowFunction(callback) && callback.parameters.length === 1 && ts.isIdentifier(callback.parameters[0].name) && !ts.isBlock(callback.body));
      const name = callback.parameters[0].name.text, body = callback.body;
      return object.map(value => expression(body, new Map([...values, [name, value]])));
    }
    if (method === "replaceAll" && typeof object === "string" && node.arguments.length === 2) {
      const [from, to] = node.arguments.map(argument => expression(argument, values));
      assert.equal(typeof from, "string"); assert.equal(typeof to, "string");
      return object.replaceAll(String(from), String(to));
    }
  }
  throw new Error(`Unsupported metadata expression: ${ts.SyntaxKind[node.kind]}`);
}

function statement(node: ts.Statement, values: Map<string, unknown>) {
  if (ts.isBlock(node)) { for (const child of node.statements) statement(child, values); return; }
  if (ts.isIfStatement(node)) {
    if (expression(node.expression, values)) statement(node.thenStatement, values);
    else if (node.elseStatement) statement(node.elseStatement, values);
    return;
  }
  if (ts.isVariableStatement(node)) {
    for (const declaration of node.declarationList.declarations) {
      assert.ok(ts.isIdentifier(declaration.name) && declaration.initializer);
      values.set(declaration.name.text, expression(declaration.initializer, values));
    }
    return;
  }
  if (ts.isExpressionStatement(node) && ts.isBinaryExpression(node.expression) && node.expression.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isIdentifier(node.expression.left)) {
    values.set(node.expression.left.text, expression(node.expression.right, values)); return;
  }
  throw new Error(`Unsupported metadata statement: ${ts.SyntaxKind[node.kind]}`);
}

/** Actual-side UI projection only: extract live metadata without importing the
 * Next page or initializing cookies/auth. No persistence/query code is run. */
export function currentMasterMetadataReader(source: string) {
  const file = ts.createSourceFile("master-data-page.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const page = file.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "renderMasterDataPage");
  assert.ok(page && ts.isFunctionDeclaration(page) && page.body);
  const start = page.body.statements.findIndex(node => ts.isVariableStatement(node) && node.declarationList.declarations.some(declaration => ts.isIdentifier(declaration.name) && declaration.name.text === "columns"));
  // Metadata construction ends before rendering. The page now passes tabs
  // straight to its client component instead of declaring a tabLinks local.
  const end = page.body.statements.findIndex((node, index) => index > start && (ts.isReturnStatement(node) || (ts.isVariableStatement(node) && node.declarationList.declarations.some(declaration => ts.isIdentifier(declaration.name) && declaration.name.text === "tabLinks"))));
  assert.ok(start >= 0 && end > start);
  const statements = page.body.statements.slice(start, end);
  return (catalog: MasterDataCatalog, options: Record<string, MasterDataOption[]>) => {
    const values = new Map<string, unknown>([["catalog", catalog], ["options", options]]);
    for (const node of statements) statement(node, values);
    return metadataSchema.parse({ columns: values.get("columns"), fields: values.get("fields") });
  };
}
