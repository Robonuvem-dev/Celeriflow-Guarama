import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import provenance from "../fixtures/table-migration-provenance.json";

export const migrationProvenance = provenance;
export const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const normalize = (file: string) => file.replaceAll("\\", "/");
const printer = ts.createPrinter({ removeComments: true, newLine: ts.NewLineKind.LineFeed });
const parsedSources = new Map<string, ts.SourceFile>();

export function assertHistoricalArtifact(text: string, sha256: string) {
  assert.equal(digest(text.replaceAll("\r\n", "\n")), sha256, "Historical artifact changed; never regenerate it from current UI.");
}

export function historicalVisualBaseline() {
  const record = provenance.historicalArtifacts["historical-visual-baselines.json"];
  const text = readFileSync(new URL("../fixtures/historical-visual-baselines.json", import.meta.url), "utf8").replaceAll("\r\n", "\n");
  assertHistoricalArtifact(text, record.lfSha256);
  const baseline = JSON.parse(text) as {
    formatVersion: number; sourceCommit: string; typescriptVersion: string;
    works: { files: Record<string, { sourceSha256: string; jsxRoots: { count: number; sha256: string } }> };
    planning: { files: Record<string, { fullAstSha256: string; jsxRoots: { count: number; sha256: string } }>; financeWrappers: Record<string, unknown>; decimalException: unknown };
    cemetery: { files: Record<string, { jsxRoots: { count: number; sha256: string } }>; decimalException: unknown };
  };
  assert.equal(baseline.formatVersion, 1);
  assert.equal(baseline.sourceCommit, record.sourceCommit);
  assert.equal(baseline.typescriptVersion, record.typescriptVersion);
  for (const section of ["works", "planning", "cemetery"] as const) {
    assert.equal(Object.keys(baseline[section].files).length, record.counts[section]);
    for (const entry of Object.values(baseline[section].files)) {
      assert.match(entry.jsxRoots.sha256, /^[a-f0-9]{64}$/);
      assert.ok(Number.isSafeInteger(entry.jsxRoots.count) && entry.jsxRoots.count >= 0);
    }
  }
  return baseline;
}

export function historicalHealthBaseline() {
  const record = provenance.historicalArtifacts["health-pages-original-jsx.json"];
  const text = readFileSync(new URL("../fixtures/health-pages-original-jsx.json", import.meta.url), "utf8").replaceAll("\r\n", "\n");
  assertHistoricalArtifact(text, record.lfSha256);
  const baseline = JSON.parse(text) as { formatVersion: number; normalization: string; files: Record<string, { count: number; sha256: string }> };
  assert.equal(baseline.formatVersion, 1);
  assert.equal(baseline.normalization, record.normalization);
  assert.equal(Object.keys(baseline.files).length, record.count);
  return baseline;
}

export function currentSources(directory: string, tsxOnly = true): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (entry.name === "__tests__") return [];
    const file = normalize(path.join(directory, entry.name));
    return entry.isDirectory() ? currentSources(file, tsxOnly) : (tsxOnly ? /\.tsx$/ : /\.[cm]?[jt]sx?$/).test(file) && !/\.(test|spec)\./.test(file) ? [file] : [];
  }).sort();
}

export function assertReviewedInventory(actual: string[], original: string[], additions: string[] = []) {
  assert.deepEqual([...actual].map(normalize).sort(), [...original, ...additions].map(normalize).sort(), "Every historical file and every reviewed addition must be accounted for.");
}

export function assertArchivedInventory(section: keyof typeof provenance.inventories, actual: string[]) {
  const inventory = provenance.inventories[section];
  const additions = inventory.authorizedAdditions.map(file => `${inventory.root}/${file}`);
  for (const file of additions) assert.ok(actual.includes(file), `Missing reviewed addition: ${file}`);
  const historical = actual.filter(file => !additions.includes(file)).sort();
  assert.equal(historical.length, inventory.originalCount);
  assert.equal(digest(JSON.stringify(historical)), inventory.originalPathsSha256, `${section}: deleted/replaced historical path or unreviewed addition`);
  assert.equal(actual.length, inventory.originalCount + additions.length);
}

export function parseContractSource(file: string, text?: string) {
  if (text === undefined && parsedSources.has(file)) return parsedSources.get(file)!;
  const content = text ?? readFileSync(file, "utf8");
  const diagnostics = ts.transpileModule(content, { fileName: file, reportDiagnostics: true, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.Preserve } }).diagnostics ?? [];
  assert.deepEqual(diagnostics.filter(item => item.category === ts.DiagnosticCategory.Error).map(item => ts.flattenDiagnosticMessageText(item.messageText, "\n")), [], file);
  const source = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  if (text === undefined) parsedSources.set(file, source);
  return source;
}

export function descendants<T extends ts.Node>(source: ts.Node, predicate: (node: ts.Node) => node is T): T[];
export function descendants(source: ts.Node, predicate: (node: ts.Node) => boolean): ts.Node[];
export function descendants(source: ts.Node, predicate: (node: ts.Node) => boolean) {
  const result: ts.Node[] = [];
  const visit = (node: ts.Node) => { if (predicate(node)) result.push(node); ts.forEachChild(node, visit); };
  visit(source); return result;
}

function imports(source: ts.SourceFile) {
  const bindings = new Map<string, { symbol: string; from: string }>();
  for (const declaration of source.statements) {
    if (!ts.isImportDeclaration(declaration) || !ts.isStringLiteral(declaration.moduleSpecifier) || declaration.importClause?.isTypeOnly) continue;
    const from = declaration.moduleSpecifier.text, clause = declaration.importClause;
    if (clause?.name) bindings.set(clause.name.text, { symbol: "default", from });
    if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) for (const item of clause.namedBindings.elements) {
      if (!item.isTypeOnly) bindings.set(item.name.text, { symbol: item.propertyName?.text ?? item.name.text, from });
    }
  }
  return bindings;
}
const print = (node: ts.Node, source: ts.SourceFile) => printer.printNode(ts.EmitHint.Unspecified, node, source).trim();
function expression(text: string) {
  const source = ts.createSourceFile("expression.ts", `const value = (${text});`, ts.ScriptTarget.Latest, true);
  const declaration = source.statements[0] as ts.VariableStatement;
  return print((declaration.declarationList.declarations[0].initializer as ts.ParenthesizedExpression).expression, source);
}

/** Check actual bound calls (including aliases), never comments or unused imports. */
export function assertBoundCall(input: string | ts.SourceFile, from: string, symbol: string, args?: string[], minimum = 1) {
  const source = typeof input === "string" ? parseContractSource(input) : input;
  const binding = imports(source);
  const calls = descendants(source, ts.isCallExpression).filter(call => {
    if (!ts.isIdentifier(call.expression)) return false;
    const imported = binding.get(call.expression.text);
    return imported?.from === from && imported.symbol === symbol && (!args || args.length === call.arguments.length && args.every((arg, index) => print(call.arguments[index], source) === expression(arg)));
  });
  assert.ok(calls.length >= minimum, `${source.fileName}: missing ${minimum} bound ${symbol}(${args?.join(", ") ?? "…"}) from ${from}`);
  return calls;
}

export function assertFormAction(file: string, from: string, symbol: string) {
  const source = parseContractSource(file), binding = imports(source);
  const matches = descendants(source, ts.isJsxAttribute).filter(attribute => {
    if (!["action", "formAction"].includes(attribute.name.getText(source)) || !attribute.initializer || !ts.isJsxExpression(attribute.initializer) || !attribute.initializer.expression || !ts.isIdentifier(attribute.initializer.expression)) return false;
    const imported = binding.get(attribute.initializer.expression.text);
    return imported?.from === from && imported.symbol === symbol;
  });
  assert.ok(matches.length, `${file}: ${symbol} must remain wired to a form action`);
}

export function assertDrizzleOnly(files: string[], noInlineSql = false) {
  for (const file of files) assertDrizzleSource(parseContractSource(file), noInlineSql);
}

export function assertDrizzleSource(source: ts.SourceFile, noInlineSql = false) {
    const file = source.fileName;
    const client = source.statements.some(node => ts.isExpressionStatement(node) && ts.isStringLiteral(node.expression) && node.expression.text === "use client");
    for (const node of descendants(source, () => true)) {
      if (ts.isIdentifier(node)) assert.doesNotMatch(node.text, /^(?:prisma|Prisma|PrismaClient|TransactionClient|\$transaction|\$queryRaw(?:Unsafe)?|\$executeRaw(?:Unsafe)?)$/, file);
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        assert.doesNotMatch(node.moduleSpecifier.text, /@prisma\/|(?:generated\/|\/)prisma(?:\/|$)/, file);
        if (client && ts.isImportDeclaration(node) && !node.importClause?.isTypeOnly) {
          const runtime = !node.importClause || !!node.importClause.name || !node.importClause.namedBindings || !ts.isNamedImports(node.importClause.namedBindings) || node.importClause.namedBindings.elements.some(item => !item.isTypeOnly);
          if (runtime) assert.doesNotMatch(node.moduleSpecifier.text, /^(?:drizzle-orm|@\/db\/(?:client|schema|repositories))/, `${file}: database dependency crossed client boundary`);
        }
      }
      if (ts.isCallExpression(node)) {
        if ((node.expression.kind === ts.SyntaxKind.ImportKeyword || ts.isIdentifier(node.expression) && node.expression.text === "require") && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) assert.doesNotMatch(node.arguments[0].text, /@prisma|generated\/prisma/, file);
        if (noInlineSql && file.endsWith(".tsx") && ts.isPropertyAccessExpression(node.expression) && /^(?:database|executor|db)$/.test(node.expression.expression.getText(source))) assert.doesNotMatch(node.expression.name.text, /^(?:select|execute|query|transaction)$/, `${file}: page-level SQL`);
      }
    }
}

function resolveImport(file: string, specifier: string) {
  if (!specifier.startsWith(".") && !specifier.startsWith("@/")) return null;
  const base = specifier.startsWith("@/") ? `src/${specifier.slice(2)}` : normalize(path.join(path.dirname(file), specifier));
  return ["", ".tsx", ".ts", "/index.tsx", "/index.ts"].map(suffix => base + suffix).find(candidate => existsSync(candidate)) ?? null;
}

/** Resolve the rendered function/export, not every export of an imported file. */
export function operationalRendererChain(file: string, exported = "default", seen = new Set<string>()): string[] | null {
  const key = `${file}#${exported}`;
  if (seen.has(key)) return null;
  seen.add(key);
  if (file === "src/components/app-ui/operational/OperationalTable.tsx" && exported === "OperationalTable") return [key];
  const source = parseContractSource(file), binding = imports(source);
  const declaration = source.statements.find(node => ts.isFunctionDeclaration(node) && (exported === "default" ? node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.DefaultKeyword) : node.name?.text === exported));
  if (!declaration) return null;
  for (const opening of descendants(declaration, node => ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node))) {
    const tag = (opening as ts.JsxOpeningElement | ts.JsxSelfClosingElement).tagName.getText(source);
    const imported = binding.get(tag);
    const destination = imported ? resolveImport(file, imported.from) : file;
    if (!destination || /^[a-z]/.test(tag)) continue;
    const chain = operationalRendererChain(destination, imported?.symbol ?? tag, new Set(seen));
    if (chain) return [key, ...chain];
  }
  return null;
}

export function assertOperationalRenderer(file: string, exported = "default") {
  const chain = operationalRendererChain(file, exported);
  assert.ok(chain, `${file}#${exported}: no rendered chain to the shared OperationalTable (an unused import is not coverage)`);
  return chain;
}

export function assertJsxProps(file: string, tag: string, properties: string[]) {
  const source = parseContractSource(file);
  const elements = descendants(source, node => ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) as (ts.JsxOpeningElement | ts.JsxSelfClosingElement)[];
  const matches = elements.filter(node => node.tagName.getText(source) === tag);
  assert.ok(matches.length, `${file}: missing rendered ${tag}`);
  for (const node of matches) for (const property of properties) assert.ok(node.attributes.properties.some(attribute => ts.isJsxAttribute(attribute) && attribute.name.getText(source) === property && attribute.initializer), `${file}: ${tag}.${property} is disconnected`);
}

export function assertJsxValues(file: string, tag: string, values: Record<string, string>) {
  const source = parseContractSource(file);
  const elements = descendants(source, node => ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) as (ts.JsxOpeningElement | ts.JsxSelfClosingElement)[];
  assert.ok(elements.some(node => node.tagName.getText(source) === tag && Object.entries(values).every(([key, expected]) => {
    const attribute = node.attributes.properties.find(item => ts.isJsxAttribute(item) && item.name.getText(source) === key) as ts.JsxAttribute | undefined;
    const initializer = attribute?.initializer;
    if (!initializer) return false;
    const value = ts.isJsxExpression(initializer) ? initializer.expression : initializer;
    return value && print(value, source) === expression(expected);
  })), `${file}: no ${tag} with payload/permission bindings ${JSON.stringify(values)}`);
}

export function assertVariableValue(file: string, name: string, expected: string) {
  const source = parseContractSource(file);
  assert.ok(descendants(source, ts.isVariableDeclaration).some(node => ts.isIdentifier(node.name) && node.name.text === name && node.initializer && print(node.initializer, source) === expression(expected)), `${file}: authorized scope/value ${name} changed`);
}
