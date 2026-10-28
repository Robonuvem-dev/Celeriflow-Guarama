import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import ts from "typescript";

const base = process.argv.find(argument => argument.startsWith("--base="))?.slice(7) ?? "3f05dcd";
const files = execFileSync("git", ["diff", "--name-only", "--diff-filter=M", base, "--", "src/**/*.tsx"], { encoding: "utf8" }).trim().split(/\r?\n/).filter(Boolean);
function jsxRoots(text, fileName) {
  const file = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const roots = [];
  function visit(node) {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)) roots.push(node.getText(file).replaceAll("\r\n", "\n"));
    else ts.forEachChild(node, visit);
  }
  visit(file);
  return roots;
}
const failures = [];
for (const file of files) {
  const expected = jsxRoots(execFileSync("git", ["show", `${base}:${file}`], { encoding: "utf8" }), file);
  const actual = jsxRoots(readFileSync(file, "utf8"), file);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) failures.push(file);
}
console.log(JSON.stringify({ result: failures.length ? "FAIL" : "PASS", base, files: files.length, scope: "Exact JSX roots of all modified TSX files; only CRLF/LF normalized", checked: files, failures }, null, 2));
assert.equal(failures.length, 0, "Visual handoffs differ from the shared base");
