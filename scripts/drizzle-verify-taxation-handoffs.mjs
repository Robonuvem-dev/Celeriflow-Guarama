import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import ts from "typescript";

const base = process.argv.find(argument => argument.startsWith("--base="))?.slice(7) ?? "3f05dcd";
const roots = ["src/app/app-domain/tributacao", "src/app/app-domain/cemiterios", "src/app/validar-alvara", "src/app/portal/tributario", "src/app/portal/nfse"];
const changed = execFileSync("git", ["diff", "--name-only", "--diff-filter=M", base, "--", ...roots], { encoding: "utf8" }).trim().split(/\r?\n/).filter(file => file.endsWith(".tsx"));
function jsxRoots(text, name) {
  const source = ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const roots = [];
  function visit(node) {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)) roots.push(node.getText(source).replaceAll("\r\n", "\n"));
    else ts.forEachChild(node, visit);
  }
  visit(source);
  return roots;
}
const failures = changed.filter(file => JSON.stringify(jsxRoots(execFileSync("git", ["show", `${base}:${file}`], { encoding: "utf8" }), file)) !== JSON.stringify(jsxRoots(readFileSync(file, "utf8"), file)));
console.log(JSON.stringify({ result: failures.length ? "FAIL" : "PASS", base, scope: "Exact JSX roots in changed taxation/cemetery/public-tax pages; only CRLF/LF normalized", files: changed.length, checked: changed, failures }, null, 2));
assert.equal(failures.length, 0, "Taxation/cemetery JSX handoffs changed");
