import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// Production excludes tooling and tests. Check all of those roots here, while
// following their normal imports and inheriting the project's strict options.
const directory = resolve(".next/cache/auxiliary-typecheck");
const inventory = [...new Set(execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }).split("\0"))].filter(path => path && existsSync(path)).sort();
const sources = inventory.filter(path => /\.(?:ts|tsx|mts|cts)$/.test(path) && !path.endsWith(".d.ts") && (/^(?:scripts|tests|prisma)\//.test(path) || /^src\/.*(?:\/__tests__\/|\.(?:test|spec)\.)/.test(path) || path === "drizzle.config.ts"));
const shared = inventory.filter(path => path.endsWith(".d.ts") && path.startsWith("src/"));
for (const path of ["next-env.d.ts", ".next/types/routes.d.ts"]) if (existsSync(path)) shared.push(path);
const groups = [];
let group = [], bytes = 0;
for (const path of sources) {
  const size = readFileSync(path).byteLength;
  if (group.length && (group.length >= 65 || bytes + size > 900_000)) { groups.push(group); group = []; bytes = 0; }
  group.push(path); bytes += size;
}
if (group.length) groups.push(group);
assert.equal(groups.flat().length, sources.length);
assert.equal(new Set(groups.flat()).size, sources.length);
assert.ok(sources.length > 0);
const digest = createHash("sha256").update(JSON.stringify(sources.map(path => [path, createHash("sha256").update(readFileSync(path)).digest("hex")]))).digest("hex");
mkdirSync(directory, { recursive: true });
writeFileSync(resolve(directory, "manifest.json"), JSON.stringify({ at: new Date().toISOString(), inputsDigest: digest, sources: sources.length, shared, groups }, null, 2));
for (const [index, files] of groups.entries()) writeFileSync(resolve(directory, `part-${index + 1}.json`), JSON.stringify({ extends: resolve("tsconfig.json"), compilerOptions: { incremental: false }, files: [...shared, ...files].map(path => resolve(path)), include: [], exclude: [] }, null, 2));
console.log(JSON.stringify({ scope: "AUXILIARY_TYPESCRIPT", sources: sources.length, partitions: groups.length, inputsDigest: digest }));
const args = process.argv.slice(2);
if (args.length === 1 && args[0] === "--plan") process.exit(0);
let selected;
if (args.length) {
  assert.ok(args.length === 2 && args[0] === "--partition", "Use --plan or --partition N.");
  selected = Number(args[1]);
  assert.ok(Number.isInteger(selected) && selected >= 1 && selected <= groups.length);
}
const results = [];
for (const [index, files] of groups.entries()) {
  if (selected !== undefined && selected !== index + 1) continue;
  const result = spawnSync(process.execPath, ["--max-old-space-size=4096", resolve("node_modules/typescript/bin/tsc"), "--project", resolve(directory, `part-${index + 1}.json`), "--noEmit", "--incremental", "false", "--pretty", "false", "--extendedDiagnostics"], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  if (result.error) throw result.error;
  const output = `${result.stdout}\n${result.stderr}`;
  writeFileSync(resolve(directory, `part-${index + 1}.log`), output);
  const diagnostics = output.split(/\r?\n/).filter(line => /error TS\d+:/.test(line));
  const record = { partition: index + 1, roots: files.length, exit: result.status, signal: result.signal, diagnostics, memory: /Memory used:\s+([^\r\n]+)/.exec(output)?.[1], totalTime: /Total time:\s+([^\r\n]+)/.exec(output)?.[1] };
  results.push(record);
  console.log(JSON.stringify(record));
  writeFileSync(resolve(directory, "results.json"), JSON.stringify({ inputsDigest: digest, results }, null, 2));
  if (result.signal || /heap out of memory/.test(output)) break;
}
process.exitCode = results.every(result => result.exit === 0) ? 0 : 1;
