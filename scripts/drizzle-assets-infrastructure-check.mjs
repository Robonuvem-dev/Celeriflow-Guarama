import fs from "node:fs";
import { execFileSync } from "node:child_process";
import ts from "typescript";

// Read-only, bounded parser/inventory check. No compiler program, database,
// generated client, schema mutation or source rewriting is involved.
const roots = [
  "src/lib/patrimonio", "src/lib/obras",
  "src/app/app-domain/patrimonio", "src/app/app-domain/obras", "src/app/app-domain/iluminacao-publica",
  "src/app/api/patrimonio", "src/app/api/obras", "src/app/api/iluminacao-publica", "src/app/api/construcao-civil", "src/app/api/auth/construcao-civil",
  "src/app/portal/construcao-civil", "src/components/construction",
  "src/db/repositories/assets",
  "src/db/repositories/infrastructure",
];
function walk(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap(entry => {
    const name = `${root}/${entry.name}`;
    return entry.isDirectory() ? walk(name) : /\.[cm]?[jt]sx?$/.test(name) ? [name] : [];
  });
}
const files = [...new Set(roots.flatMap(walk).concat(
  ["src/db/schema/assets.ts", "src/db/schema/assets-stock.ts", "src/db/schema/assets-requests.ts", "src/db/schema/infrastructure.ts", "src/db/schema/construction-core.ts", "src/db/schema/construction-documents.ts", "src/db/schema/construction-portal.ts", "src/db/schema/construction-viability.ts", "src/db/schema/construction-integrations.ts", "src/db/schema/construction-enforcement.ts", "src/db/schema/construction-opening.ts", "src/db/schema/construction-taxation.ts", "src/db/schema/construction-lifecycle.ts", "src/lib/contracts/assets-stock.ts", "src/lib/contracts/infrastructure.ts", "src/lib/contracts/construction.ts", "src/lib/contracts/construction-scopes.ts", "tests/helpers/construction-shared-tables.ts", "tests/helpers/construction-requests-fixture.ts", "tests/helpers/construction-taxation-fixture.ts", "tests/helpers/assets-accounting-fixture.ts", "tests/helpers/stock-accounting-fixture.ts"],
  fs.readdirSync("tests").filter(name => /^(construction|patrimony|stock-valuation|asset-valuation)/.test(name) && /\.[cm]?[jt]s$/.test(name)).map(name => `tests/${name}`),
  ["tests/helpers/construction-fee-issue-fixture.ts", "scripts/adopt-aurora-asset-depreciation-accounts.ts", "scripts/adopt-aurora-asset-depreciation-profiles.ts", "scripts/adopt-aurora-asset-impairment-profiles.ts"],
  fs.readdirSync("scripts").filter(name => /^(seed-(patrimony|warehouse)|.*construction)/.test(name) && /\.[cm]?[jt]s$/.test(name)).map(name => `scripts/${name}`),
))].filter(file => fs.existsSync(file)).sort();
const marker = /@prisma\/|\bPrisma\b|\bprisma\b|\$transaction|\$queryRaw|\$executeRaw|\bdmmf\b/i;
const residual = [], legacyCodeResidual = [], syntaxErrors = [], visualChanges = [];
const changed = new Set(execFileSync("git", ["-c", "core.autocrlf=false", "diff", "--name-only"], { encoding: "utf8" }).trim().split(/\r?\n/));
function parse(file, source) {
  return ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
}
function jsxRoots(sourceFile) {
  const found = [];
  function visit(node) {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)) {
      found.push(node.getText(sourceFile).replace(/\r\n/g, "\n"));
    } else ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return found;
}
// Keep the lexical inventory above, including historical SQL paths. This second
// view finds actual code symbols/imports without counting comments/path strings.
// It is a bounded AST inventory, not typechecking or an indirect-dependency scan.
function legacyCodeLines(sourceFile) {
  const lines = new Set();
  const symbol = /^(?:prisma|Prisma|dmmf|\$transaction|\$queryRaw|\$queryRawUnsafe|\$executeRaw|\$executeRawUnsafe)$/i;
  function visit(node) {
    if ((ts.isIdentifier(node) && symbol.test(node.text))
      || (ts.isStringLiteralLike(node) && node.text.startsWith("@prisma/"))
      || (ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression) && symbol.test(node.argumentExpression.text))) {
      lines.add(sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return [...lines].sort((a, b) => a - b);
}
for (const file of files) {
  const source = fs.readFileSync(file, "utf8"), parsed = parse(file, source);
  const hits = source.split(/\r?\n/).flatMap((line, index) => marker.test(line) ? [{ line: index + 1, text: line.trim() }] : []);
  if (hits.length) residual.push({ file, hits });
  const codeLines = legacyCodeLines(parsed);
  if (codeLines.length) legacyCodeResidual.push({ file, lines: codeLines });
  for (const diagnostic of parsed.parseDiagnostics) syntaxErrors.push({ file, message: ts.flattenDiagnosticMessageText(diagnostic.messageText, " ") });
  if (file.endsWith(".tsx") && changed.has(file)) {
    // The index includes the owner's pending visual merge, which must remain
    // the baseline while MERGE_HEAD is open. This command only reads Git.
    const original = execFileSync("git", ["show", `:${file}`], { encoding: "utf8" });
    if (JSON.stringify(jsxRoots(parsed)) !== JSON.stringify(jsxRoots(parse(file, original)))) visualChanges.push(file);
  }
}
console.log(JSON.stringify({ checkedFiles: files.length, residualFiles: residual.length, legacyCodeResidualFiles: legacyCodeResidual.length, syntaxErrors, visualChanges, legacyCodeResidual, residual: process.argv.includes("--summary") ? residual.map(({ file, hits }) => ({ file, matches: hits.length })) : residual }, null, 2));
if (syntaxErrors.length || visualChanges.length) process.exitCode = 1;
if (process.argv.includes("--require-clean") && residual.length) process.exitCode = 1;
