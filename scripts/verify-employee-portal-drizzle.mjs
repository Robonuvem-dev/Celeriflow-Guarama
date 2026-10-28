import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

const roots = [
  "src/lib/portal-servidor", "src/db/repositories/portal-servidor", "src/db/schema/employee-portal.ts", "src/lib/contracts/employee-portal.ts",
  "src/app/app-domain/portal-servidor", "src/app/api/portal-servidor", "src/app/portal-servidor", "src/app/api/auth/portal-servidor/session/route.ts",
  "src/app/portal/concursos", "src/app/portal/convenentes", "src/app/portal/departamentos", "src/app/api/portal/concursos", "src/app/api/portal/convenentes", "src/app/api/portal/departamentos",
  "src/app/validar-emissao", "src/app/validar-recibo", "tests/employee-portal-login.test.ts", "tests/employee-portal-final-services.test.ts", "tests/employee-portal-routes.test.ts", "tests/helpers/employee-portal-fixture.ts",
];
const baselineIndex = process.argv.indexOf("--baseline-dir"), baseline = baselineIndex < 0 ? null : process.argv[baselineIndex + 1];
if (baselineIndex >= 0 && !baseline) throw new Error("Informe o diretório da cópia-base após --baseline-dir.");
const failures = [], files = [], printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
let jsxFiles = 0, compared = 0, exports = 0;
async function collect(file) {
  let information;
  try { information = await stat(file); } catch (error) { if (error.code === "ENOENT") return; throw error; }
  if (information.isDirectory()) for (const entry of await readdir(file)) await collect(path.join(file, entry));
  else if (/\.(?:[cm]?[jt]sx?|css)$/.test(file)) files.push(file);
}
function jsxTrees(source) {
  const trees = [];
  function visit(node) {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)) {
      trees.push(printer.printNode(ts.EmitHint.Unspecified, node, source));
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return trees;
}
for (const root of roots) await collect(root);
for (const file of [...new Set(files)].sort()) {
  const text = await readFile(file, "utf8");
  if (file.endsWith(".css")) {
    if (baseline) {
      const original = await readFile(path.join(baseline, file), "utf8");
      if (text.replaceAll("\r\n", "\n") !== original.replaceAll("\r\n", "\n")) failures.push(`${file}: CSS difere da base`);
      compared++;
    }
    continue;
  }
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  for (const diagnostic of source.parseDiagnostics) failures.push(`${file}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, " ")}`);
  function visit(node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && /(?:@prisma\/|(?:^|\/)prisma$)/i.test(node.moduleSpecifier.text)) failures.push(`${file}: import legado ${node.moduleSpecifier.text}`);
    if (ts.isIdentifier(node) && /^(?:prisma|PrismaClient|Prisma|\$(?:queryRaw|executeRaw|transaction)(?:Unsafe)?)$/.test(node.text)) {
      const position = source.getLineAndCharacterOfPosition(node.getStart(source));
      failures.push(`${file}:${position.line + 1}: referência ativa ${node.text}`);
    }
    if (ts.isElementAccessExpression(node) && ts.isStringLiteral(node.argumentExpression) && /^(?:prisma|\$(?:queryRaw|executeRaw|transaction)(?:Unsafe)?)$/.test(node.argumentExpression.text)) failures.push(`${file}: acesso legado por índice`);
    if (ts.isFunctionDeclaration(node) && node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)) exports++;
    ts.forEachChild(node, visit);
  }
  visit(source);
  const trees = jsxTrees(source);
  if (trees.length) {
    jsxFiles++;
    if (baseline) {
      const original = ts.createSourceFile(file, await readFile(path.join(baseline, file), "utf8"), ts.ScriptTarget.Latest, true);
      if (JSON.stringify(trees) !== JSON.stringify(jsxTrees(original))) failures.push(`${file}: árvores JSX diferem da base`);
      compared++;
    }
  }
}
console.log(JSON.stringify({ files: new Set(files).size, exportedFunctions: exports, jsxFiles, baselineCompared: compared, failures }, null, 2));
if (!baseline) console.log("Comparação JSX/CSS não executada: forneça --baseline-dir com uma cópia-base preparada pela integração.");
if (failures.length) process.exitCode = 1;
