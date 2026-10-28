import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import ts from "typescript";

// Each implementation root and Next route validation belongs to exactly one
// bounded partition. Ambient declarations are shared, and imports are checked
// normally. Partition sizes are budgets, rather than a fixed number/hash that
// can accidentally combine several large domains.
const root = process.cwd();
const configPath = join(root, "tsconfig.build.json");
const config = ts.readConfigFile(configPath, ts.sys.readFile);
if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, "\n"));
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
if (parsed.errors.length) throw new Error(ts.formatDiagnosticsWithColorAndContext(parsed.errors, { getCanonicalFileName: file => file, getCurrentDirectory: () => root, getNewLine: () => "\n" }));
const nameOf = file => relative(root, file).replaceAll("\\", "/");
const canonical = file => ts.sys.useCaseSensitiveFileNames ? resolve(file) : resolve(file).toLowerCase();
const budgets = { sources: 240, bytes: 1_400_000, validations: 110 };
const validatorPath = join(root, ".next", "types", "validator.ts");
if (!existsSync(validatorPath)) throw new Error("Execute next typegen antes da checagem.");
const shared = [];
const entries = new Map();
for (const file of parsed.fileNames) {
  const name = nameOf(file);
  if (canonical(file) === canonical(validatorPath) || /^\.next\/types\/typecheck-part-\d+\.ts$/.test(name)) continue;
  if (file.endsWith(".d.ts")) shared.push(file);
  else entries.set(canonical(file), { file, bytes: statSync(file).size, validations: [] });
}
const source = ts.createSourceFile(validatorPath, readFileSync(validatorPath, "utf8"), ts.ScriptTarget.Latest, true);
if (source.parseDiagnostics.length) throw new Error("Validador Next inválido; execute next typegen novamente.");
const preamble = source.statements.filter(statement => !ts.isBlock(statement)).map(statement => statement.getFullText(source)).join("\n");
let validationCount = 0;
for (const statement of source.statements.filter(ts.isBlock)) {
  const modules = new Set();
  const visit = node => {
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) modules.add(node.argument.literal.text);
    ts.forEachChild(node, visit);
  };
  visit(statement);
  if (modules.size !== 1) throw new Error("Validação Next sem um único import de rota; formato não reconhecido.");
  const [moduleName] = modules;
  const resolvedRoute = ts.resolveModuleName(moduleName, validatorPath, parsed.options, ts.sys).resolvedModule;
  if (!resolvedRoute) throw new Error(`Rota Next não resolvida: ${moduleName}`);
  const entry = entries.get(canonical(resolvedRoute.resolvedFileName));
  if (!entry) throw new Error(`Rota Next fora do inventário de produção: ${moduleName}`);
  entry.validations.push({ id: validationCount++, text: statement.getFullText(source) });
}

const emptyGroup = () => ({ entries: [], sources: 0, bytes: 0, validations: 0 });
const fits = (group, addition) => Object.keys(budgets).every(key => group[key] + addition[key] <= budgets[key]);
const append = (group, addition) => {
  group.entries.push(...addition.entries);
  for (const key of Object.keys(budgets)) group[key] += addition[key];
};
const domains = new Map();
for (const entry of [...entries.values()].sort((a, b) => nameOf(a.file).localeCompare(nameOf(b.file), "en"))) {
  const parts = nameOf(entry.file).split("/");
  // API domains need their fourth segment; src/app/api alone is too broad.
  const depth = parts[1] === "app" && ["api", "app-domain"].includes(parts[2]) ? 4 : 3;
  const key = parts.slice(0, depth).join("/");
  if (!domains.has(key)) domains.set(key, []);
  domains.get(key).push(entry);
}
const chunks = [];
for (const domain of domains.values()) {
  let chunk = emptyGroup();
  for (const entry of domain) {
    const addition = { entries: [entry], sources: 1, bytes: entry.bytes, validations: entry.validations.length };
    if (chunk.sources && !fits(chunk, addition)) {
      chunks.push(chunk);
      chunk = emptyGroup();
    }
    // One indivisible root is always checked, even if it exceeds a budget.
    append(chunk, addition);
  }
  if (chunk.sources) chunks.push(chunk);
}
const weight = group => Math.max(...Object.keys(budgets).map(key => group[key] / budgets[key]));
chunks.sort((a, b) => weight(b) - weight(a) || nameOf(a.entries[0].file).localeCompare(nameOf(b.entries[0].file), "en"));
const groups = [];
for (const chunk of chunks) {
  const group = groups.find(candidate => fits(candidate, chunk)) ?? emptyGroup();
  if (!groups.includes(group)) groups.push(group);
  append(group, chunk);
}
const assignedSources = groups.flatMap(group => group.entries.map(entry => canonical(entry.file)));
const assignedValidations = groups.flatMap(group => group.entries.flatMap(entry => entry.validations.map(validation => validation.id)));
if (assignedSources.length !== entries.size || new Set(assignedSources).size !== entries.size ||
    assignedValidations.length !== validationCount || new Set(assignedValidations).size !== validationCount) {
  throw new Error("Cobertura inválida das partições: fontes ou validações ausentes/duplicadas.");
}

const directory = join(root, ".next", "cache", "typecheck-partitions");
mkdirSync(directory, { recursive: true });
const manifest = { budgets, sources: entries.size, routeValidations: validationCount, sharedDeclarations: shared.map(nameOf), partitions: [] };
for (const [index, group] of groups.entries()) {
  const validator = join(dirname(validatorPath), `typecheck-part-${index}.ts`);
  const validations = group.entries.flatMap(entry => entry.validations);
  writeFileSync(validator, `// Generated by typecheck-build.mjs; do not edit.\n${preamble}\n${validations.map(validation => validation.text).join("\n")}\n`);
  const project = join(directory, `part-${index}.json`);
  // The incremental builder emits inferred declaration signatures even with
  // noEmit. Check every partition independently, without an emit/signature
  // cache, so each build validates its complete current dependency graph.
  writeFileSync(project, JSON.stringify({ extends: configPath, compilerOptions: { incremental: false }, files: [...shared, ...group.entries.map(entry => entry.file), validator], include: [], exclude: [] }, null, 2));
  manifest.partitions.push({ index: index + 1, project: nameOf(project), sourceBytes: group.bytes, sources: group.entries.map(entry => nameOf(entry.file)), routeValidationIds: validations.map(validation => validation.id) });
}
writeFileSync(join(directory, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(`[typecheck] Coverage: ${entries.size} sources, ${validationCount} route validations, ${groups.length} partitions; full non-incremental checks`);
if (process.argv.includes("--plan")) process.exit(0);
const partitionOption = process.argv.indexOf("--partition");
const selected = partitionOption < 0 ? undefined : Number(process.argv[partitionOption + 1]);
if (selected !== undefined && (!Number.isInteger(selected) || selected < 1 || selected > groups.length)) throw new Error("Partição inválida.");
// --cold remains accepted: every check is already independent of tsbuildinfo.
for (const [index, group] of groups.entries()) {
  if (selected !== undefined && selected !== index + 1) continue;
  const project = join(directory, `part-${index}.json`);
  console.log(`[typecheck] Partition ${index + 1}/${groups.length}: ${group.sources} sources, ${group.validations} route validations, ${group.bytes} source bytes`);
  const result = spawnSync(process.execPath, [join(root, "node_modules", "typescript", "bin", "tsc"), "--project", project, "--noEmit", "--incremental", "false", "--extendedDiagnostics"], { stdio: "inherit", env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
