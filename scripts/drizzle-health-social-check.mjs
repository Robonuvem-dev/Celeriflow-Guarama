import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import ts from "typescript";

// Read-only inventory and syntax/JSX check. No connections, DDL or type checking.
const roots = ["src/lib/saude", "src/lib/social", "src/lib/portal-paciente", "src/app/app-domain/saude", "src/app/app-domain/social", "src/app/app-domain/portal-paciente", "src/app/portal-paciente", "src/app/api/saude", "src/app/api/social", "src/app/api/portal-paciente"];
const supportRoots = ["src/db/repositories/health", "src/db/repositories/social"];
const supportFiles = ["src/db/schema/social.ts", "src/db/schema/social-finance-options.ts", ...fs.readdirSync("src/db/schema").filter(file => /^health-.*\.ts$/.test(file)).map(file => `src/db/schema/${file}`), "src/lib/contracts/social.ts", "src/lib/contracts/patient-portal.ts", "src/lib/contracts/health-programs.ts"];
const normalize = file => file.replaceAll(path.sep, "/");
function walk(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(root, entry.name);
    return entry.isDirectory() ? walk(file) : /\.(?:[cm]?js|tsx?)$/.test(entry.name) ? [normalize(file)] : [];
  });
}
const production = roots.flatMap(walk).sort();
const auxiliary = ["scripts", "tests"].flatMap(walk).filter(file => /(?:health|saude|social|patient-portal|portal-paciente)/i.test(path.basename(file)) || /(?:lib\/(?:saude|social|portal-paciente)|repositories\/(?:health|social))\//.test(fs.readFileSync(file, "utf8"))).filter(file => !file.endsWith("drizzle-health-social-check.mjs")).sort();
const parses = new Map();
function parse(file, text = fs.readFileSync(file, "utf8")) {
  return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : file.endsWith(".ts") ? ts.ScriptKind.TS : ts.ScriptKind.JS);
}
function references(file) {
  const source = parses.get(file) ?? parse(file);
  parses.set(file, source);
  const lines = new Set();
  function visit(node) {
    if ((ts.isIdentifier(node) && /^(?:Prisma|PrismaClient|prisma|getTenantPrisma)$/.test(node.text)) || (ts.isStringLiteral(node) && /(?:@prisma\/client|(?:^|\/)lib\/prisma$)/.test(node.text))) lines.add(source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1);
    ts.forEachChild(node, visit);
  }
  visit(source);
  return [...lines].sort((a, b) => a - b);
}
const residual = files => files.map(file => ({ file, lines: references(file) })).filter(row => row.lines.length);
const checked = [...new Set([...production, ...supportRoots.flatMap(walk), ...supportFiles.filter(file => fs.existsSync(file)), ...auxiliary])];
const syntaxErrors = checked.flatMap(file => {
  const source = parses.get(file) ?? parse(file);
  return source.parseDiagnostics.map(diagnostic => ({ file, line: source.getLineAndCharacterOfPosition(diagnostic.start ?? 0).line + 1, message: ts.flattenDiagnosticMessageText(diagnostic.messageText, " ") }));
});
function jsx(source) {
  const fragments = [];
  function visit(node) {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)) fragments.push(node.getText(source).replaceAll("\r\n", "\n"));
    else ts.forEachChild(node, visit);
  }
  visit(source);
  return fragments;
}
const changedPages = execFileSync("git", ["-c", "core.safecrlf=false", "diff", "--name-only", "--", ...roots], { encoding: "utf8" }).trim().split(/\r?\n/).filter(file => file.endsWith(".tsx"));
const jsxChanges = changedPages.filter(file => {
  const before = execFileSync("git", ["show", `HEAD:${file}`], { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
  return JSON.stringify(jsx(parse(file, before))) !== JSON.stringify(jsx(parse(file)));
});
const result = { productionFiles: production.length, productionResidual: residual(production), auxiliaryResidual: residual(auxiliary), syntaxFilesChecked: checked.length, syntaxErrors, jsxFilesCompared: changedPages.length, jsxChanges };
console.log(JSON.stringify(result, null, 2));
if (syntaxErrors.length || jsxChanges.length) process.exitCode = 1;
