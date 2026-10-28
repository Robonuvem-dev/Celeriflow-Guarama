import { sha256, stableJson } from "./database-migrate-files.mjs";

const requireValue = (condition, message) => { if (!condition) throw new Error(`Audited baseline: ${message}`); };
const validHash = value => typeof value === "string" && /^[0-9a-f]{64}$/.test(value);

export function unresolvedBaselineTuple(migration) {
  return {
    name: migration.name, source: migration.source,
    installedChecksum: migration.provenance.installedChecksum,
    recordedLocalChecksum: migration.provenance.localChecksum,
    lfChecksum: migration.lfChecksum,
    localByteVariants: [...migration.byteVariants].sort(),
    classification: migration.classification,
  };
}

/** Validate the versioned authorization, never a generic accept/skip flag.
 * This does not prove historical bytes and never changes their classification.
 * The private catalog is required at initialization, not at future deploys. */
export function validateAuditedBaseline(set, { catalog, requestedDigest } = {}) {
  const artifact = set.auditedBaseline;
  const policy = set.policy.auditedBaseline;
  requireValue(artifact && policy, "versioned authorization manifest required");
  const { manifest, source, digest } = artifact;
  requireValue(validHash(policy.manifestDigest) && source === policy.manifest && digest === policy.manifestDigest && sha256(stableJson(manifest)) === digest, "manifest digest/source differs from pinned authority policy");
  if (requestedDigest !== undefined) requireValue(requestedDigest === digest, "explicit manifest digest differs from authorization");
  requireValue(manifest.formatVersion === 1 && manifest.kind === "AUDITED_EXISTING_DATABASE_BASELINE" && manifest.authority === set.policy.authority, "unsupported authorization manifest");
  const authorization = manifest.authorization;
  requireValue(authorization?.id && authorization.date && authorization.decision === "Baseline auditada (Recommended)"
    && authorization.acknowledgesUnresolvedHistoricalBytes === true && authorization.preserveHistoricalSqlAndLegacyLedger === true
    && authorization.executeHistoricalSql === false && authorization.requireExactFutureChecksums === true, "explicit owner authorization contract missing");
  requireValue(manifest.historicalCount === set.historical.length && manifest.baselineDigest === set.baselineDigest && manifest.historySha256 === set.historySha256, "historical baseline/inventory changed");
  requireValue(set.recovery?.result === "PASS" && set.recovery.replay?.migrationsApplied === set.historical.length && set.recovery.replay.catalogDifferences === 0
    && manifest.recovery?.source === set.policy.recoveryReport && manifest.recovery.fileSha256 === set.recoverySha256 && validHash(set.recoverySha256), "recovery PASS evidence changed");
  requireValue(validHash(manifest.reviewedCatalog?.fileSha256) && validHash(manifest.reviewedCatalog?.digest) && typeof manifest.reviewedCatalog?.source === "string", "reviewed catalog binding missing");
  const unresolved = set.historical.filter(migration => migration.classification === "UNRESOLVED_HISTORICAL_DIFFERENCE");
  const tuples = unresolved.map(unresolvedBaselineTuple);
  requireValue(tuples.length > 0 && stableJson(manifest.unresolvedHistoricalDifferences) === stableJson(tuples), "unresolved allowlist must equal the exact historical tuples");
  requireValue(stableJson(set.unresolved.map(row => row.name)) === stableJson(unresolved.map(row => row.name)), "unresolved historical inventory inconsistent");
  if (catalog) requireValue(catalog.fileSha256 === manifest.reviewedCatalog.fileSha256 && catalog.digest === manifest.reviewedCatalog.digest, "catalog artifact differs from original reviewed reference");
  return { source, digest, manifest };
}

export function baselineReceiptProvenance(migration, authorization) {
  return {
    byteProof: migration.historicalProof ?? null,
    auditedBaseline: {
      source: authorization.source, manifestDigest: authorization.digest, authorizationId: authorization.manifest.authorization.id,
      unresolvedDifference: authorization.manifest.unresolvedHistoricalDifferences.find(row => row.name === migration.name) ?? null,
    },
  };
}
