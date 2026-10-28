import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

// Read-only source analysis. This command never rewrites application files.
const root = process.cwd();
const output = join(root, "docs", "drizzle-inventory");
const slash = value => value.replaceAll("\\", "/");
const filesIn = directory => readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
  const path = join(directory, entry.name);
  return entry.isDirectory() ? filesIn(path) : /\.(?:[cm]?[jt]sx?)$/.test(entry.name) ? [path] : [];
});
const domainOf = path => {
  const parts = slash(path).split("/");
  if (parts[0] === "scripts" || parts[0] === "tests") return `${parts[0]}/${parts[1].split("-")[0]}`;
  if (parts[1] === "app" && parts[2] === "app-domain") return parts[3];
  if (parts[1] === "app" && parts[2] === "api") return `api/${parts[3]}`;
  if (parts[1] === "lib") return `lib/${parts[2]}`;
  return parts.slice(0, 3).join("/");
};
const schema = readFileSync(join(root, "prisma/schema.prisma"), "utf8");
const models = [...schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)].map(match => ({
  model: match[1],
  table: match[2].match(/@@map\("([^"]+)"\)/)?.[1] || match[1],
  fields: match[2].split(/\r?\n/).filter(line => /^\s*\w+\s+\w/.test(line)).map(line => line.trim()),
}));
const delegates = new Map(models.map(model => [model.model[0].toLowerCase() + model.model.slice(1), model]));
const entries = [];
for (const absolute of ["src", "scripts", "tests"].flatMap(path => filesIn(join(root, path)))) {
  const path = slash(relative(root, absolute));
  if (path === "scripts/drizzle-inventory.mjs") continue;
  const text = readFileSync(absolute, "utf8");
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
  const imports = [];
  const calls = [];
  const typeReferences = [];
  const constructors = [];
  const visit = node => {
    const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const specifier = node.moduleSpecifier.text;
      if (/prisma/i.test(specifier)) imports.push({ line, specifier, text: node.getText(source) });
    }
    if (ts.isNewExpression(node) && /prisma/i.test(node.expression.getText(source))) constructors.push({ line, expression: node.expression.getText(source) });
    if (ts.isTypeReferenceNode(node) && /Prisma|TransactionClient/.test(node.typeName.getText(source))) typeReferences.push({ line, name: node.typeName.getText(source) });
    if (ts.isCallExpression(node) || ts.isTaggedTemplateExpression(node)) {
      const expression = ts.isCallExpression(node) ? node.expression : node.tag;
      if (ts.isPropertyAccessExpression(expression)) {
        const operation = expression.name.text;
        const receiver = expression.expression;
        const delegate = ts.isPropertyAccessExpression(receiver) ? receiver.name.text : "";
        if (delegates.has(delegate) || /^\$(?:transaction|queryRaw|executeRaw|connect|disconnect|extends)/.test(operation)) {
          calls.push({ line, operation, receiver: receiver.getText(source), model: delegates.get(delegate)?.model || null, expression: node.getText(source) });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  const metadata = [...text.matchAll(/\bDMMF\b|\bdmmf\b|_runtimeDataModel/g)].map(match => ({ offset: match.index, token: match[0] }));
  if (imports.length || calls.length || typeReferences.length || constructors.length || metadata.length || /\bprisma\b/i.test(text)) entries.push({ path, domain: domainOf(path), sha256: createHash("sha256").update(text).digest("hex"), imports, constructors, typeReferences, calls, metadata, status: "pending-individual-review" });
}
const migrationRoot = join(root, "prisma/migrations-ibema");
const migrations = readdirSync(migrationRoot, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => {
  const path = join(migrationRoot, entry.name, "migration.sql");
  const bytes = readFileSync(path);
  return { name: entry.name, sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.length };
});
const byDomain = Object.groupBy(entries, entry => entry.domain);
const summary = {
  capturedAt: new Date().toISOString(), baseSha: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), branch: execFileSync("git", ["branch", "--show-current"], { encoding: "utf8" }).trim(),
  models: models.length, schemaLines: schema.split(/\r?\n/).length, enums: [...schema.matchAll(/^enum\s+(\w+)/gm)].map(match => match[1]), decimalFields: [...schema.matchAll(/^\s+\w+\s+Decimal[?\s]/gm)].length, cuidDefaults: [...schema.matchAll(/@default\(cuid\(\)\)/g)].length, updatedAtFields: [...schema.matchAll(/@updatedAt\b/g)].length,
  dependentFiles: entries.length, calls: entries.reduce((sum, entry) => sum + entry.calls.length, 0), transactions: entries.flatMap(entry => entry.calls).filter(call => call.operation === "$transaction").length, migrations: migrations.length,
  generatedClientMiB: statSync(join(root, "node_modules/.prisma/client/index.d.ts")).size / 2 ** 20,
  domains: Object.fromEntries(Object.entries(byDomain).map(([name, items]) => [name, { files: items.length, calls: items.reduce((sum, entry) => sum + entry.calls.length, 0), transactions: items.flatMap(entry => entry.calls).filter(call => call.operation === "$transaction").length }])),
};
mkdirSync(output, { recursive: true });
for (const [name, data] of Object.entries({ summary, models, migrations, sources: entries })) writeFileSync(join(output, `${name}.json`), `${JSON.stringify(data, null, 2)}\n`);
const report = ["# Inventário de dependências Prisma", "", `Base: \`${summary.baseSha}\`; branch: \`${summary.branch}\`.`, "", "Inventário automático somente de leitura. Cada arquivo permanece pendente de análise individual; a classificação por pasta não comprova cobertura funcional.", "", "| Domínio/pasta | Arquivos | Chamadas detectadas | Transações |", "|---|---:|---:|---:|", ...Object.entries(summary.domains).sort(([a], [b]) => a.localeCompare(b)).map(([name, row]) => `| ${name} | ${row.files} | ${row.calls} | ${row.transactions} |`), "", "As expressões completas, linhas e hashes estão em `sources.json`; os modelos e campos estão em `models.json`; os checksums da trilha ativa estão em `migrations.json`.", ""];
writeFileSync(join(output, "README.md"), report.join("\n"));
console.log(JSON.stringify({ ...summary, domains: Object.keys(summary.domains).length, output: slash(relative(root, output)) }, null, 2));
