import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Offline provenance check. Never update the installed migration ledger to
// conceal a historical checksum mismatch, and never modify committed SQL here.
const snapshot = ".agent/drizzle/database-before-2026-10-28T01-26-00.861Z";
const manifest = JSON.parse(readFileSync(join(snapshot, "manifest.json"), "utf8"));
const table = manifest.counts.find(row => row.schema === "public" && row.table === "_prisma_migrations");
assert.ok(table);
const bytes = readFileSync(join(snapshot, "tables", table.file));
const sha256 = value => createHash("sha256").update(value).digest("hex");
assert.equal(sha256(bytes), table.sha256);
const applied = bytes.toString("utf8").trim().split("\n").filter(Boolean).map(line => JSON.parse(line));
const directory = "prisma/migrations-ibema";
const names = readdirSync(directory, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
const records = names.map(name => {
  const entries = applied.filter(row => row.migration_name === name);
  assert.equal(entries.length, 1, `${name} installed ledger entry count`);
  const entry = entries[0];
  assert.ok(entry.finished_at && !entry.rolled_back_at, `${name} was not completed`);
  const sql = readFileSync(join(directory, name, "migration.sql"), "utf8");
  const localChecksum = sha256(sql), lfChecksum = sha256(sql.replaceAll("\r\n", "\n"));
  const crlfChecksum = sha256(sql.replaceAll("\r\n", "\n").replaceAll("\n", "\r\n"));
  return { name, installedChecksum: entry.checksum, localChecksum, lfChecksum, classification: localChecksum === entry.checksum ? "EXACT" : [lfChecksum, crlfChecksum].includes(entry.checksum) ? "LINE_ENDINGS_ONLY" : "UNRESOLVED_HISTORICAL_DIFFERENCE" };
});
assert.equal(applied.length, names.length, "Unexpected installed migrations");
const counts = Object.fromEntries(Object.entries(Object.groupBy(records, record => record.classification)).map(([name, values]) => [name, values.length]));
const unresolved = records.filter(record => record.classification === "UNRESOLVED_HISTORICAL_DIFFERENCE");
const report = { generatedAt: new Date().toISOString(), mode: "OFFLINE LEDGER PROVENANCE CHECK", snapshotCapturedAt: manifest.capturedAt, result: unresolved.length ? "HISTORICAL_DIFFERENCES_REQUIRE_RECONCILIATION" : "PASS", migrations: names.length, counts, records, note: "Installed ledger is preserved. Final catalog replay equality alone does not prove byte identity of every historical SQL source." };
writeFileSync("docs/drizzle-inventory/migration-history.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify({ result: report.result, migrations: report.migrations, counts, unresolved, report: "docs/drizzle-inventory/migration-history.json" }, null, 2));
if (unresolved.length) process.exitCode = 1;
