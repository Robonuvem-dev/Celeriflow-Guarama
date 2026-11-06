import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

test("sources are valid UTF-8 and server directives precede notification and database imports", () => {
  const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z", "--", "src"], { encoding: "utf8" }).split("\0").filter(path => /\.[cm]?[jt]sx?$/.test(path));
  const misplaced = [];
  let checked = 0;
  for (const file of new Set(files)) {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(readFileSync(file));
    if (!text.includes("use server")) continue;
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    let prologue = true;
    for (const statement of source.statements) {
      const directive = ts.isExpressionStatement(statement) && ts.isStringLiteral(statement.expression);
      if (directive && statement.expression.text === "use server") {
        checked++;
        if (!prologue) misplaced.push(`${file}:${source.getLineAndCharacterOfPosition(statement.getStart()).line + 1}`);
      }
      if (!directive) prologue = false;
    }
  }
  assert.ok(checked > 0, "The source inventory must include Server Action modules.");
  assert.deepEqual(misplaced, [], "Imports before use server expose server dependencies to the client graph.");
});
