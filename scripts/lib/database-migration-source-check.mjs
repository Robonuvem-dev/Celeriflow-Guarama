import ts from "typescript";

export const legacyDatabaseModule = /^(?:@prisma\/|prisma(?:\/|$))|(?:^|\/)(?:lib\/prisma|generated\/(?:platform-)?prisma)(?:\/|\.[cm]?[jt]s|$)/;
const legacyMethods = new Set(["$transaction", "$queryRaw", "$queryRawUnsafe", "$executeRaw", "$executeRawUnsafe", "$disconnect", "$connect", "$extends"]);
// Repositories use explicit Drizzle tables/projections, not model delegates.
// Catch calls through fixture/client aliases even after imports were removed.
const legacyDelegates = new Set(["findUnique", "findUniqueOrThrow", "findFirst", "findFirstOrThrow", "findMany", "createMany", "createManyAndReturn", "updateMany", "updateManyAndReturn", "deleteMany", "upsert", "count"]);
const legacyCliCommands = new Set(["generate", "migrate", "db", "validate", "studio", "init", "format", "version", "-v", "--version"]);

/** Inspect executable imports/accesses; ordinary SQL archive paths are data. */
export function findLegacyDatabaseReferences(source) {
  const matches = [];
  const requireNames = new Set(["require"]);
  const createRequireNames = new Set();
  for (const statement of source.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier) && ["module", "node:module"].includes(statement.moduleSpecifier.text)) {
      const bindings = statement.importClause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) for (const element of bindings.elements) {
        if ((element.propertyName ?? element.name).text === "createRequire") createRequireNames.add(element.name.text);
      }
    }
  }
  function collectRequireNames(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && ts.isCallExpression(node.initializer) && ts.isIdentifier(node.initializer.expression) && createRequireNames.has(node.initializer.expression.text)) requireNames.add(node.name.text);
    ts.forEachChild(node, collectRequireNames);
  }
  collectRequireNames(source);
  const moduleCall = expression => expression.kind === ts.SyntaxKind.ImportKeyword ||
    ts.isIdentifier(expression) && requireNames.has(expression.text) ||
    ts.isPropertyAccessExpression(expression) && (
      expression.name.text === "resolve" && ts.isIdentifier(expression.expression) && requireNames.has(expression.expression.text) ||
      expression.name.text === "require" && ts.isIdentifier(expression.expression) && expression.expression.text === "module"
    );
  function record(node, kind, symbol) {
    const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
    if (!matches.some(match => match.line === line && match.kind === kind && match.symbol === symbol)) matches.push({ line, kind, symbol });
  }
  function visit(node) {
    if (ts.isArrayLiteralExpression(node) && node.elements[0] && ts.isStringLiteralLike(node.elements[0]) && node.elements[0].text === "prisma") {
      const command = node.elements[1];
      if (command && (!ts.isStringLiteralLike(command) || legacyCliCommands.has(command.text))) record(node, "legacy-tooling", "prisma CLI argument vector");
    }
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier) && legacyDatabaseModule.test(node.moduleSpecifier.text)) record(node, "module", node.moduleSpecifier.text);
    if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference) && node.moduleReference.expression && ts.isStringLiteral(node.moduleReference.expression) && legacyDatabaseModule.test(node.moduleReference.expression.text)) record(node, "module", node.moduleReference.expression.text);
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal) && legacyDatabaseModule.test(node.argument.literal.text)) record(node, "import-type", node.argument.literal.text);
    if (ts.isCallExpression(node) && moduleCall(node.expression) && node.arguments[0] && ts.isStringLiteralLike(node.arguments[0]) && legacyDatabaseModule.test(node.arguments[0].text)) record(node, "dynamic-module", node.arguments[0].text);
    if (ts.isCallExpression(node)) {
      const name = ts.isIdentifier(node.expression) ? node.expression.text : ts.isPropertyAccessExpression(node.expression) ? node.expression.name.text : "";
      const strings = node.arguments.filter(ts.isStringLiteralLike).map(argument => argument.text);
      const processStrings = node.arguments.flatMap(argument => ts.isArrayLiteralExpression(argument) ? argument.elements.filter(ts.isStringLiteralLike).map(element => element.text) : ts.isStringLiteralLike(argument) ? [argument.text] : []);
      if (["join", "resolve"].includes(name) && strings.some((part, index) => part === "node_modules" && strings[index + 1] === "prisma" || /(?:^|[\\/])node_modules[\\/]prisma(?:[\\/]|$)/.test(part))) record(node, "legacy-tooling", "node_modules/prisma");
      if (["spawn", "spawnSync", "execFile", "execFileSync", "run"].includes(name) && strings[0] === "prisma") record(node, "legacy-tooling", "prisma CLI");
      if (["spawn", "spawnSync", "execFile", "execFileSync", "exec", "execSync"].includes(name) && processStrings.some(value => /(?:^|\s)(?:npx\s+)?prisma\s+(?:generate|migrate|db|validate|studio|init|format)(?:\s|$)/.test(value))) record(node, "legacy-tooling", "prisma shell command");
      if (ts.isPropertyAccessExpression(node.expression) && legacyDelegates.has(node.expression.name.text)) record(node, "legacy-delegate", node.expression.name.text);
      if (ts.isElementAccessExpression(node.expression) && node.expression.argumentExpression && ts.isStringLiteralLike(node.expression.argumentExpression) && legacyDelegates.has(node.expression.argumentExpression.text)) record(node, "legacy-delegate", node.expression.argumentExpression.text);
      const input = node.arguments[0];
      if (["create", "update", "delete", "aggregate", "groupBy"].includes(name) && input && ts.isObjectLiteralExpression(input)) {
        const fields = input.properties.flatMap(property => property.name && (ts.isIdentifier(property.name) || ts.isStringLiteralLike(property.name)) ? [property.name.text] : []);
        if (fields.includes("where") || name === "create" && fields.includes("data") || name === "aggregate" && fields.some(field => field.startsWith("_")) || name === "groupBy" && fields.includes("by")) record(node, "legacy-delegate", name);
      }
    }
    if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "PrismaClient") record(node, "client", node.expression.text);
    if (ts.isBindingElement(node) && ts.isObjectBindingPattern(node.parent)) {
      const name = node.propertyName ?? node.name;
      if (ts.isIdentifier(name) && name.text === "prisma") record(node, "legacy-binding", "prisma");
    }
    if (ts.isPropertyAccessExpression(node)) {
      if (legacyMethods.has(node.name.text) || node.name.text === "prisma") record(node, "legacy-access", node.name.text);
      if (ts.isIdentifier(node.expression) && node.expression.text === "Prisma") record(node, "namespace", `Prisma.${node.name.text}`);
    }
    if (ts.isElementAccessExpression(node) && node.argumentExpression && ts.isStringLiteralLike(node.argumentExpression) && (legacyMethods.has(node.argumentExpression.text) || node.argumentExpression.text === "prisma")) record(node, "legacy-access", node.argumentExpression.text);
    if (ts.isPropertyAssignment(node) && (ts.isIdentifier(node.name) || ts.isStringLiteralLike(node.name)) && node.name.text === "prisma") record(node, "legacy-context", "prisma");
    if (ts.isQualifiedName(node) && ts.isIdentifier(node.left) && node.left.text === "Prisma") record(node, "namespace-type", `Prisma.${node.right.text}`);
    ts.forEachChild(node, visit);
  }
  visit(source);
  return matches;
}
