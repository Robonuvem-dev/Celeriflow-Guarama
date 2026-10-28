import { config } from "dotenv";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import type { DatabaseConnection } from "../src/db/connection";
import { withDatabaseTransaction } from "../src/db/transaction";
import { openCrossDomainDatabase, queryRows } from "./lib/cross-domain-database";
import { readPlanningCatalogs } from "./lib/cross-domain-planning-catalogs";
import { firstActiveP1Actor, insertP1DraftCatalog } from "./lib/cross-domain-p1-catalogs";

type CboMetadata = { sha256: string; url: string; capturedAt: string; encoding: string };
export function parseP1CboCapture(bytes: Uint8Array, metadata: CboMetadata) {
  const hash = createHash("sha256").update(bytes).digest("hex");
  if (hash !== metadata.sha256 || metadata.encoding !== "windows-1252") throw new Error("Hash ou codificação CBO divergente.");
  const lines = new TextDecoder("windows-1252", { fatal: true }).decode(bytes).split(/\r?\n/);
  if (lines.shift() !== "CODIGO;TITULO") throw new Error("Cabeçalho CBO inesperado.");
  const rows = lines.filter(line => line.trim()).map(line => {
    const match = /^(\d{6});([^;\r\n"]+)$/.exec(line);
    if (!match) throw new Error(`Registro CBO fora do formato simples da fonte: ${line.slice(0, 100)}`);
    return { code: match[1], name: match[2].trim() };
  });
  if (rows.length < 2000 || new Set(rows.map(row => row.code)).size !== rows.length) throw new Error("Quantidade CBO inesperada ou códigos duplicados.");
  return { metadata, hash, rows, versionId: `p1-mte-cbo-capture-${hash.slice(0, 16)}` };
}

export async function importP1CboCapture(connection: DatabaseConnection, capture: ReturnType<typeof parseP1CboCapture>, apply: boolean) {
  const { metadata, hash, rows, versionId } = capture;
  return withDatabaseTransaction(connection, async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${versionId}, 0))::text`);
    const [previous] = await readPlanningCatalogs(tx, [versionId]);
    const local = await queryRows<{ id: string; code: string; description: string }>(tx, sql`SELECT id,code,description FROM "HealthCbo" WHERE code=ANY(${sql.param(rows.map(row => row.code))}::text[])`);
    const localByCode = new Map(local.map(row => [row.code, row]));
    const compatible = rows.filter(row => localByCode.get(row.code)?.description === row.name);
    const conflicts = rows.filter(row => localByCode.has(row.code) && localByCode.get(row.code)?.description !== row.name).map(row => ({ code: row.code, official: row.name, local: localByCode.get(row.code)!.description }));
    if (previous) {
      if (previous.sourceHash !== hash || previous.status !== "DRAFT" || previous.entries.length !== rows.length) throw new Error("Versão CBO existente divergente; preservar revisão local.");
      const entries = new Map(previous.entries.map(entry => [entry.code, entry]));
      for (const row of rows) {
        const entry = entries.get(row.code);
        if (!entry || entry.kind !== "CBO" || entry.name !== row.name || entry.canonicalId !== `UNMAPPED:CBO:${row.code}`) throw new Error(`De-para CBO alterado: ${row.code}; não sobrescrever.`);
      }
    } else if (apply) {
      const actor = await firstActiveP1Actor(tx);
      await insertP1DraftCatalog(tx, {
        id: versionId, year: new Date(metadata.capturedAt).getUTCFullYear(), label: "CBO MTE — captura ocupações (vigência a conciliar)", sourceHash: hash,
        normativeReference: `CBO 2002, Portaria MTE 397/2002. Fonte ${metadata.url}; captura ${metadata.capturedAt}. Data de vigência individual não declarada no CSV; revisão pendente.`,
        entries: rows.map(row => ({ versionId, kind: "CBO", code: row.code, name: row.name, parentCode: row.code.slice(0, 4), degree: 5, canonicalId: `UNMAPPED:CBO:${row.code}`, attributes: { sourceUrl: metadata.url, sourceHash: hash, capturedAt: metadata.capturedAt, encoding: metadata.encoding, mapped: false, effectiveDatesVerified: false } })),
      }, actor.id, "IMPORT_CBO_DRAFT", { sourceHash: hash, entries: rows.length, status: "DRAFT", adopted: false });
    }
    return { mode: apply ? "ADDITIVE_IDEMPOTENT" : "READ_ONLY", versionId, sourceHash: hash, sourceUrl: metadata.url, entries: rows.length, status: "DRAFT", adopted: false, existingCanonicalCandidates: compatible.length, conflicts, canonicalMappingPending: true, effectiveDatesVerified: false };
  }, { timeoutMs: 120_000, lockTimeoutMs: 120_000 });
}

async function main() {
  config({ path: ".env.local", quiet: true });
  config({ quiet: true });
  const apply = process.argv.includes("--apply");
  const metadata = JSON.parse(readFileSync("docs/poc-p0/fontes/CBO_MTE_METADATA.json", "utf8")) as CboMetadata;
  const capture = parseP1CboCapture(readFileSync("docs/poc-p0/fontes/CBO_MTE_OCUPACAO.csv"), metadata);
  const connection = openCrossDomainDatabase(2_000);
  try {
    const report = await importP1CboCapture(connection, capture, apply);
    if (apply) writeFileSync("docs/poc-p0/CATALOGO_CBO_P1.json", `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report, null, 2));
  } finally { await connection.pool.end(); }
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("/import-poc-p1-cbo.ts")) {
  void main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
}
