import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

// Read-only source inventory; --write writes one domain-owned JSON report only.
const domains = ["rh", "educacao"];
const roots = [...domains.map(domain => `src/lib/${domain}`), ...domains.map(domain => `src/app/app-domain/${domain}`), ...domains.map(domain => `src/app/api/${domain}`)];
const extraRoots = ["src/db/repositories/education", "src/db/repositories/personnel"];
const sourceExtension = /\.(?:[cm]?[jt]sx?)$/;
const metadata = /\b(?:DMMF|dmmf|_runtimeDataModel)\b/;
const domainImport = /(?:lib\/(?:rh|educacao)\/|app-domain\/(?:rh|educacao)\/|db\/(?:repositories\/(?:education|personnel)|schema\/(?:education-|personnel-)))/;
const namedExclusive = /^(?:tests|scripts)\/(?:hr[-.]|education[-.]|seed-(?:hr|rh|education)|restore-hr-|adopt-aurora-(?:payroll|travel|advance)|drizzle-(?:education|personnel|inventory-personnel|verify-personnel)|helpers\/personnel-education)/;

function walk(path) {
  if (!existsSync(path)) return [];
  return readdirSync(path, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(join(path, entry.name)) : [join(path, entry.name)]);
}
function normalize(path) { return relative(process.cwd(), path).replaceAll("\\", "/"); }
function inspect(path) {
  const content = readFileSync(path, "utf8"), lines = content.split(/\r?\n/);
  const source = ts.createSourceFile(path, content, ts.ScriptTarget.Latest, true);
  const references = new Set(), metadataReferences = new Set();
  const clientImports = [];
  function visit(node) {
    if (ts.isIdentifier(node) && ["prisma", "Prisma", "PrismaClient", "DMMF", "dmmf", "_runtimeDataModel", "$transaction", "$queryRaw", "$executeRaw", "$queryRawUnsafe", "$executeRawUnsafe"].includes(node.text)) {
      const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
      references.add(line);
      if (["DMMF", "dmmf", "_runtimeDataModel"].includes(node.text)) metadataReferences.add(line);
    }
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && /(?:^@prisma\/|(?:^|\/)lib\/prisma$)/.test(node.moduleSpecifier.text)) clientImports.push({ line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, specifier: node.moduleSpecifier.text, typeOnly: node.importClause?.isTypeOnly === true });
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && ts.isStringLiteral(node.arguments[0]) && /(?:^@prisma\/|(?:^|\/)lib\/prisma$)/.test(node.arguments[0].text)) clientImports.push({ line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, specifier: node.arguments[0].text, typeOnly: false });
    ts.forEachChild(node, visit);
  }
  visit(source);
  return { path: normalize(path), lines: lines.length,
    legacyImport: clientImports.length > 0, legacyReference: references.size > 0, metadata: metadataReferences.size > 0,
    clientImports, legacyLines: [...references].sort((a, b) => a - b),
    transactional: /\$transaction|withDatabaseTransaction|DatabaseTransaction/.test(content),
    financialDependencies: [...new Set([...content.matchAll(/(?:from\s*|import\s*\()["']([^"']*(?:financeiro|\/finance\/)[^"']*)["']/g)].map(match => match[1]))],
    rawTables: [...new Set([...content.matchAll(/\b(?:FROM|JOIN|INTO|UPDATE)\s+"([A-Za-z][A-Za-z0-9_]*)"/g)].map(match => match[1]))].sort(),
  };
}

const production = roots.flatMap(walk).filter(path => sourceExtension.test(path)).map(inspect).sort((a, b) => a.path.localeCompare(b.path));
const repositories = extraRoots.flatMap(walk).filter(path => sourceExtension.test(path)).map(inspect);
const schemas = walk("src/db/schema").filter(path => /\/(?:education-|personnel-)/.test(normalize(path))).map(inspect);
const contracts = walk("src/lib/contracts").filter(path => /\/(?:education-|personnel\.ts$)/.test(normalize(path))).map(inspect);
const outside = ["src", "scripts", "tests"].flatMap(walk).filter(path => sourceExtension.test(path) && !roots.some(root => normalize(path).startsWith(`${root}/`))).map(path => ({ path, content: readFileSync(path, "utf8") }));
const tools = outside.filter(({ path, content }) => /^(?:scripts|tests)\//.test(normalize(path)) && (namedExclusive.test(normalize(path)) || domainImport.test(content))).map(({ path }) => inspect(path));
const externalConsumers = outside.filter(({ path, content }) => normalize(path).startsWith("src/") && domainImport.test(content) && !extraRoots.some(root => normalize(path).startsWith(`${root}/`))).map(({ path, content }) => ({ path: normalize(path), imports: [...new Set([...content.matchAll(/(?:from\s*|import\s*\()["']([^"']+)["']/g)].map(match => match[1]).filter(specifier => domainImport.test(specifier)))] }));
const globalMetadataConsumers = outside.filter(({ content }) => metadata.test(content) && /(?:@prisma\/client|lib\/prisma)/.test(content)).map(({ path }) => inspect(path)).filter(info => info.metadata).map(info => info.path);
const summary = roots.map(root => { const rows = production.filter(row => row.path.startsWith(`${root}/`)); return { root, files: rows.length, legacyFiles: rows.filter(row => row.legacyReference || row.legacyImport).length, metadataFiles: rows.filter(row => row.metadata).length }; });
const report = { generatedAt: new Date().toISOString(), scope: "RH + Educação; SST e Portal do Servidor transferidos a frentes exclusivas", summary, production, repositories, schemas, contracts, tools, externalConsumers, globalMetadataConsumers };
if (process.argv.slice(2).some(arg => !["--write", "--summary"].includes(arg))) throw new Error("Use --write e/ou --summary.");
if (process.argv.includes("--write")) writeFileSync("docs/drizzle-personnel-education-inventory.json", `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(process.argv.includes("--summary") ? { summary, toolFiles: tools.length, legacyToolFiles: tools.filter(row => row.legacyImport || row.legacyReference).length, externalConsumers, globalMetadataConsumers } : report, null, 2));
