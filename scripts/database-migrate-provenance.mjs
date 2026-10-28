import { createHash } from "node:crypto";

const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const requireProof = (condition, name, message) => { if (!condition) throw new Error(`${name}: historical byte proof invalid: ${message}`); };

// An archived proof is data, never permission to waive a checksum mismatch.
// Reconstruct all original bytes and require the installed SHA-256 exactly.
export function validateHistoricalProvenance(currentBytes, archive, { name, source, installedChecksum, lfChecksum }) {
  requireProof(Buffer.isBuffer(currentBytes), name, "source must be original bytes");
  requireProof(archive.formatVersion === 1 && archive.classification === "PROVEN_MIXED_LINE_ENDINGS", name, "unsupported archive format");
  requireProof(archive.name === name && archive.source === source && archive.installedChecksum === installedChecksum, name, "migration identity/checksum differs");
  requireProof(archive.bom === false, name, "this archive format preserves the source without a BOM");
  requireProof(typeof archive.normalizedSqlBase64 === "string", name, "normalized SQL bytes missing");
  const normalized = Buffer.from(archive.normalizedSqlBase64, "base64");
  requireProof(normalized.toString("base64") === archive.normalizedSqlBase64, name, "non-canonical base64");
  const sourceSql = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(currentBytes);
  const currentNormalized = Buffer.from(sourceSql.replaceAll("\r\n", "\n"), "utf8");
  requireProof(hash(normalized) === lfChecksum && archive.normalizedSha256 === lfChecksum, name, "normalized SHA-256 differs");
  requireProof(normalized.equals(currentNormalized), name, "SQL line bytes differ from the current source");
  requireProof(!normalized.includes(13), name, "bare CR in normalized line content");
  const lines = [];
  let start = 0;
  for (let index = 0; index < normalized.length; index++) if (normalized[index] === 10) {
    lines.push(normalized.subarray(start, index));
    start = index + 1;
  }
  if (start < normalized.length) lines.push(normalized.subarray(start));
  requireProof(lines.length === archive.lineCount && lines.length > 0 && Array.isArray(archive.lineTerminators) && archive.lineTerminators.length === lines.length, name, "line/terminator count differs");
  const kinds = new Set(archive.lineTerminators);
  requireProof(kinds.has("LF") && kinds.has("CRLF"), name, "archive is not the recorded mixed-ending variant");
  const chunks = [];
  for (let index = 0; index < lines.length; index++) {
    const ending = archive.lineTerminators[index];
    requireProof(["LF", "CRLF", "NONE"].includes(ending) && (ending !== "NONE" || index === lines.length - 1), name, "invalid terminator position");
    chunks.push(lines[index], Buffer.from(ending === "CRLF" ? "\r\n" : ending === "LF" ? "\n" : ""));
  }
  const reconstructedBytes = Buffer.concat(chunks);
  requireProof(hash(reconstructedBytes) === installedChecksum, name, "reconstructed SHA-256 does not equal the installed ledger");
  requireProof(Buffer.from(reconstructedBytes.toString("utf8").replaceAll("\r\n", "\n")).equals(normalized), name, "normalized reconstruction differs");
  return { reconstructedBytes, normalizedSha256: lfChecksum, installedChecksum, lineCount: lines.length, lineTerminators: [...archive.lineTerminators], bom: false };
}
