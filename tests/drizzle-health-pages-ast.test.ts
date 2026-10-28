import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { healthPagesJsxFingerprint } from "./helpers/health-pages-jsx-fingerprint";

const root = "src/app/app-domain/saude";
type Fingerprint = { count: number; sha256: string };
const baseline: { files: Record<string, Fingerprint> } = JSON.parse(readFileSync("tests/fixtures/health-pages-original-jsx.json", "utf8"));
function files(directory = root): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (directory === root && entry.name === "farmacia") return [];
    const file = join(directory, entry.name);
    return entry.isDirectory() ? files(file) : entry.name.endsWith(".tsx") ? [file.slice(root.length + 1).replaceAll("\\", "/")] : [];
  });
}
test("Health pages retain every original JSX AST outside the separately owned pharmacy", () => {
  assert.deepEqual(files().sort(), Object.keys(baseline.files).sort());
  for (const [file, fingerprint] of Object.entries(baseline.files)) {
    const source = readFileSync(join(root, file), "utf8");
    assert.deepEqual(healthPagesJsxFingerprint(file, source), fingerprint, `${file}: original JSX/CSS/actions/labels/expressions`);
    assert.doesNotMatch(source, /@prisma|\bPrisma\b|\bprisma\b|\$transaction|\$queryRaw|\$executeRaw/, `${file}: no legacy database access`);
  }
});
