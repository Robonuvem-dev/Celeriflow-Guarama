import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { prepareMigrationSql } from "./database-migrate-sql.mjs";
import { validateHistoricalProvenance } from "./database-migrate-provenance.mjs";

export const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
export const sha256 = value => createHash("sha256").update(value).digest("hex");
export const stableJson = value => JSON.stringify(canonical(value));
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
const requireValue = (condition, message) => { if (!condition) throw new Error(message); };
const validHash = value => typeof value === "string" && /^[0-9a-f]{64}$/.test(value);

export function loadMigrationSet(root = repositoryRoot) {
  const policy = JSON.parse(readFileSync(join(root, "db/migration-authority.json"), "utf8"));
  requireValue(policy.formatVersion === 1 && policy.authority === "celeriflow-explicit-sql-v1", "Unsupported migration authority");
  const historyBytes = readFileSync(join(root, policy.historyReport));
  const history = JSON.parse(historyBytes);
  const recoveryBytes = readFileSync(join(root, policy.recoveryReport));
  const recovery = JSON.parse(recoveryBytes);
  requireValue(history.migrations === policy.historicalCount && history.records.length === policy.historicalCount, "Historical inventory count changed");
  requireValue(recovery.result === "PASS" && recovery.replay.migrationsApplied === policy.historicalCount && recovery.replay.catalogDifferences === 0, "Missing successful historical recovery provenance");
  const names = new Set();
  const records = new Map(history.records.map(record => [record.name, record]));
  requireValue(records.size === policy.historicalCount, "Duplicate historical provenance name");
  const envelopes = new Set(policy.historicalTransactionEnvelopes);
  const readDirectory = (directory, historical) => {
    const absolute = resolve(root, directory);
    requireValue(absolute.startsWith(resolve(root) + "/") || absolute.startsWith(resolve(root) + "\\"), "Migration path must be inside repository");
    requireValue(existsSync(absolute), `SQL migration directory missing: ${directory}`);
    const entries = readdirSync(absolute, { withFileTypes: true });
    for (const entry of entries) {
      requireValue(!entry.isSymbolicLink(), `Symlink in migration directory: ${entry.name}`);
      requireValue(entry.isDirectory() || entry.name === ".gitkeep" || (historical && entry.name === "migration_lock.toml"), `Unexpected file in SQL migration directory: ${entry.name}`);
    }
    return entries.filter(entry => entry.isDirectory()).map(entry => entry.name).sort().map(name => {
      requireValue(/^\d{14}_[a-z0-9_]+$/.test(name) && !names.has(name), `Invalid/duplicate migration name: ${name}`);
      names.add(name);
      const file = join(absolute, name, "migration.sql");
      const bytes = readFileSync(file);
      const sql = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
      const lfSql = sql.replaceAll("\r\n", "\n");
      const checksum = sha256(bytes), lfChecksum = sha256(lfSql), crlfChecksum = sha256(lfSql.replaceAll("\n", "\r\n"));
      const byteVariants = [...new Set([checksum, lfChecksum, crlfChecksum])];
      const provenance = historical ? records.get(name) : null;
      const source = relative(root, file).replaceAll("\\", "/");
      let historicalProof = null, classification = null;
      if (historical) {
        requireValue(provenance && [provenance.localChecksum, provenance.lfChecksum, provenance.installedChecksum].every(validHash), `${name}: missing checksum provenance`);
        requireValue(lfChecksum === provenance.lfChecksum && byteVariants.includes(provenance.localChecksum), `${name}: historical SQL content changed`);
        const uniformClassification = provenance.installedChecksum === provenance.localChecksum ? "EXACT"
          : byteVariants.includes(provenance.installedChecksum) ? "LINE_ENDINGS_ONLY" : "UNRESOLVED_HISTORICAL_DIFFERENCE";
        const artifact = `db/historical-provenance/${name}.json`;
        const artifactPath = join(root, artifact);
        if (existsSync(artifactPath)) {
          const archive = JSON.parse(readFileSync(artifactPath, "utf8"));
          const proof = validateHistoricalProvenance(bytes, archive, { name, source, installedChecksum: provenance.installedChecksum, lfChecksum });
          requireValue(byteVariants.includes(archive.sourceChecksumAtDiscovery), `${name}: archived discovery source checksum differs`);
          requireValue([uniformClassification, "PROVEN_MIXED_LINE_ENDINGS", "LINE_ENDINGS_ONLY"].includes(provenance.classification), `${name}: inconsistent proven provenance classification`);
          historicalProof = { artifact, artifactDigest: sha256(stableJson(archive)), discoverySourceChecksum: archive.sourceChecksumAtDiscovery, installedChecksum: proof.installedChecksum, normalizedSha256: proof.normalizedSha256, lineCount: proof.lineCount, lineTerminators: proof.lineTerminators, bom: proof.bom };
          classification = "PROVEN_MIXED_LINE_ENDINGS";
        } else {
          requireValue(uniformClassification === provenance.classification, `${name}: inconsistent provenance classification`);
          classification = uniformClassification;
        }
      }
      const prepared = prepareMigrationSql(sql, { name, allowHistoricalEnvelope: historical && envelopes.has(name) });
      return { name, source, historical, checksum, lfChecksum, byteVariants, provenance, classification, historicalProof, ...prepared };
    });
  };
  const historical = readDirectory(policy.historicalDirectory, true);
  requireValue(historical.length === policy.historicalCount && historical.every(migration => records.has(migration.name)), "Historical files do not match inventory");
  requireValue([...envelopes].every(name => historical.some(migration => migration.name === name)), "Unknown transaction envelope exception");
  const future = readDirectory(policy.futureDirectory, false);
  requireValue(future.every(migration => migration.name > historical.at(-1).name), "New SQL migrations must sort after the historical baseline");
  const baseline = historical.map(({ name, lfChecksum, provenance, classification, historicalProof }) => ({ name, lfChecksum, installedChecksum: provenance.installedChecksum, classification, ...(historicalProof ? { historicalProof } : {}) }));
  const unresolved = historical.filter(migration => migration.classification === "UNRESOLVED_HISTORICAL_DIFFERENCE")
    .map(({ name, provenance, checksum, lfChecksum }) => ({ name, installedChecksum: provenance.installedChecksum, localChecksum: checksum, lfChecksum, classification: provenance.classification }));
  const provenHistoricalVariants = historical.filter(migration => migration.historicalProof).map(({ name, lfChecksum, historicalProof }) => ({ name, lfChecksum, classification: "PROVEN_MIXED_LINE_ENDINGS", ...historicalProof }));
  let auditedBaseline;
  if (policy.auditedBaseline) {
    const source = policy.auditedBaseline.manifest;
    requireValue(typeof source === "string" && /^db\/[a-z0-9-]+\.json$/.test(source), "Invalid audited baseline manifest path");
    const manifest = JSON.parse(readFileSync(join(root, source), "utf8"));
    const digest = sha256(stableJson(manifest));
    requireValue(validHash(policy.auditedBaseline.manifestDigest) && digest === policy.auditedBaseline.manifestDigest, "Audited baseline manifest digest changed");
    auditedBaseline = { source, digest, manifest };
  }
  return { policy, historical, future, migrations: [...historical, ...future], baselineDigest: sha256(stableJson(baseline)), historySha256: sha256(historyBytes), unresolved, provenHistoricalVariants, recovery, recoverySha256: sha256(recoveryBytes), auditedBaseline };
}
