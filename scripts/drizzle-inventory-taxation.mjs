import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

// Read-only inventory. Calls are syntax evidence, not a claim that a path is
// reachable in production or that an indirectly imported service is migrated.
const roots = [
  "src/lib/tributacao", "src/lib/cemeteries",
  "src/app/app-domain/tributacao", "src/app/app-domain/cemiterios",
  "src/app/api/tributacao", "src/app/api/cemiterios",
  "src/app/validar-alvara", "src/app/portal/tributario", "src/app/portal/nfse",
  "src/db/repositories/taxation", "src/db/repositories/cemeteries",
];
const specific = [
  "src/db/schema/cemeteries.ts", "src/db/schema/taxation-registry.ts", "src/db/schema/taxation-nfse.ts", "src/db/schema/taxation-audit.ts",
  "src/lib/contracts/cemeteries.ts", "src/lib/contracts/taxation-documents.ts", "src/lib/contracts/taxation-registry.ts",
];
function filesIn(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const name = `${directory}/${entry.name}`;
    return entry.isDirectory() ? filesIn(name) : /\.(?:ts|tsx|mjs|cjs)$/.test(name) ? [name] : [];
  });
}
const domainName = /(?:cemetery|taxation|tributacao|economic-|property-|itbi-|fiscal-|nfse|simples-|active-debt|tax-|c8-tax)/;
const testAndScriptFiles = [...filesIn("tests"), ...filesIn("scripts")].filter(file => domainName.test(path.basename(file)));
const files = [...new Set([...roots.flatMap(filesIn), ...specific.filter(existsSync), ...testAndScriptFiles])].sort();
const legacyMethods = new Set(["findUnique", "findUniqueOrThrow", "findFirst", "findFirstOrThrow", "findMany", "createMany", "createManyAndReturn", "updateMany", "updateManyAndReturn", "deleteMany", "upsert", "aggregate", "groupBy"]);
const prismaSources = new Set(["@prisma/client", "@/lib/prisma"]);
function inspect(file) {
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, file.endsWith("tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const signals = [];
  const imports = [];
  const add = (node, kind, text) => signals.push({ line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, kind, text });
  function visit(node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const moduleName = node.moduleSpecifier.text;
      const typeOnly = node.isTypeOnly || ts.isImportDeclaration(node) && (node.importClause?.isTypeOnly || !node.importClause?.name && node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings) && node.importClause.namedBindings.elements.length > 0 && node.importClause.namedBindings.elements.every(element => element.isTypeOnly));
      imports.push({ module: moduleName, typeOnly: Boolean(typeOnly) });
      if (prismaSources.has(moduleName)) add(node, typeOnly ? "prisma-type-import" : "prisma-runtime-import", moduleName);
    }
    if (ts.isPropertyAccessExpression(node)) {
      const name = node.name.text;
      if (name === "dmmf") add(node, "dmmf", node.getText(source));
      else if (name === "prisma") add(node, "context-prisma", node.getText(source));
      else if (name.startsWith("$") && ["$transaction", "$queryRaw", "$executeRaw", "$queryRawUnsafe", "$executeRawUnsafe", "$disconnect"].includes(name)) add(node, "legacy-client-method", node.getText(source));
    }
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const callee = node.expression;
      if (legacyMethods.has(callee.name.text)) add(node, "legacy-delegate-call", callee.getText(source));
    }
    if (ts.isBindingElement(node) && (node.propertyName?.getText(source) === "prisma" || node.name.getText(source) === "prisma")) add(node, "prisma-binding", node.getText(source));
    ts.forEachChild(node, visit);
  }
  visit(source);
  return { path: file, signals, imports };
}
const inspected = files.map(inspect);
const residual = inspected.filter(file => file.signals.length);
const counts = Object.fromEntries(roots.map(root => {
  const rows = inspected.filter(file => file.path.startsWith(`${root}/`));
  return [root, { scanned: rows.length, directResidualFiles: rows.filter(file => file.signals.length).length }];
}));
const output = {
  scope: "Syntactic direct Prisma/type/legacy-call evidence in taxation/cemetery sources and named domain tests/scripts; no percentage of functional migration",
  scanned: files.length,
  directResidualFiles: residual.length,
  dmmfFiles: residual.filter(file => file.signals.some(signal => signal.kind === "dmmf")).map(file => file.path),
  counts,
  residual: process.argv.includes("--details") ? residual : residual.map(file => file.path),
};
console.log(JSON.stringify(output, null, 2));
if (process.argv.includes("--check") && residual.length) process.exitCode = 1;
