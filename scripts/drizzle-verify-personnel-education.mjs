import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import ts from "typescript";

// Read-only verification of the domain handoff. No source transformations.
const git = args => execFileSync("git", ["-c", "core.safecrlf=false", ...args], { encoding: "utf8" });
const changed = [...new Set([...git(["diff", "--name-only"]).trim().split(/\r?\n/), ...git(["ls-files", "--others", "--exclude-standard"]).trim().split(/\r?\n/)])];
const owned = path => /^(?:src\/(?:lib\/(?:rh|educacao)\/|app\/(?:app-domain\/(?:rh|educacao)\/|api\/(?:rh|educacao)\/)|db\/(?:repositories\/(?:education|personnel)\/|schema\/(?:education-|personnel-))|lib\/contracts\/(?:education-|personnel))|scripts\/(?:seed-education-|drizzle-(?:personnel|inventory-personnel|verify-personnel))|tests\/(?:drizzle-(?:personnel|education)|hr-(?:role-legal-history|workforce-service|documentary-reports|service-rights)|helpers\/personnel-(?:education|documentary|financial-regression)))/u.test(path);
const files = changed.filter(path => /\.[cm]?[jt]sx?$/.test(path) && owned(path));
const errors = [], jsxFiles = [];
function parse(path, content) { return ts.createSourceFile(path, content, ts.ScriptTarget.Latest, true); }
function jsxRoots(source) {
  const roots = [];
  function visit(node) {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)) { roots.push(node.getText(source).replaceAll("\r\n", "\n")); return; }
    ts.forEachChild(node, visit);
  }
  visit(source); return roots;
}
for (const path of files) {
  const source = parse(path, readFileSync(path, "utf8"));
  for (const diagnostic of source.parseDiagnostics) errors.push(`${path}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, " ")}`);
  if (!path.endsWith(".tsx")) continue;
  let previous;
  try { previous = parse(path, git(["show", `HEAD:${path}`])); } catch { continue; }
  if (JSON.stringify(jsxRoots(previous)) !== JSON.stringify(jsxRoots(source))) errors.push(`${path}: raízes JSX diferem do HEAD`);
  else jsxFiles.push(path);
}
console.log(JSON.stringify({ checkedFiles: files.length, unchangedJsxFiles: jsxFiles, errors }, null, 2));
if (errors.length) process.exitCode = 1;
