import { config } from "dotenv";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { z } from "zod";
import { sql } from "drizzle-orm";
import type { DatabaseConnection } from "../src/db/connection";
import { withDatabaseTransaction } from "../src/db/transaction";
import { openCrossDomainDatabase } from "./lib/cross-domain-database";
import { readPlanningCatalogs } from "./lib/cross-domain-planning-catalogs";
import { firstActiveP1Actor, insertP1DraftCatalog } from "./lib/cross-domain-p1-catalogs";

type CnaeMetadata = { sha256: string; url: string; capturedAt: string; entries: number };
export function parseP1CnaeCapture(bytes: Uint8Array, metadata: CnaeMetadata) {
  const hash = createHash("sha256").update(bytes).digest("hex");
  if (hash !== metadata.sha256) throw new Error("Hash CNAE diverge da fonte capturada.");
  const rows = z.array(z.object({ id: z.string().regex(/^\d{7}$/), descricao: z.string().min(1), classe: z.object({ id: z.string().regex(/^\d{5}$/) }).catchall(z.json()) }).catchall(z.json())).parse(JSON.parse(Buffer.from(bytes).toString("utf8")));
  if (rows.length !== metadata.entries || new Set(rows.map(row => row.id)).size !== rows.length) throw new Error("CNAE com códigos duplicados ou quantidade divergente.");
  return { metadata, hash, rows, versionId: `p1-ibge-cnae-capture-${hash.slice(0, 16)}` };
}

export async function importP1CnaeCapture(connection: DatabaseConnection, capture: ReturnType<typeof parseP1CnaeCapture>, apply: boolean) {
  const { metadata, hash, rows, versionId } = capture;
  return withDatabaseTransaction(connection, async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${versionId}, 0))::text`);
    const [previous] = await readPlanningCatalogs(tx, [versionId]);
    if (previous) {
      if (previous.sourceHash !== hash || previous.status !== "DRAFT" || previous.entries.length !== rows.length) throw new Error("Versão CNAE existente divergente; preservar revisão local.");
      const entries = new Map(previous.entries.map(entry => [entry.code, entry]));
      for (const row of rows) {
        const entry = entries.get(row.id);
        if (!entry || entry.kind !== "CNAE" || entry.name !== row.descricao || entry.parentCode !== row.classe.id || entry.canonicalId !== `UNMAPPED:CNAE:${row.id}`) throw new Error(`De-para CNAE alterado: ${row.id}; não sobrescrever.`);
      }
    } else if (apply) {
      const actor = await firstActiveP1Actor(tx);
      await insertP1DraftCatalog(tx, {
        id: versionId, year: new Date(metadata.capturedAt).getUTCFullYear(), label: "CNAE IBGE — captura API v2 (vigência a conciliar)", sourceHash: hash,
        normativeReference: `Fonte ${metadata.url}; captura ${metadata.capturedAt}. API v2 não declara versão normativa nem vigência. Não adotar sem conciliação.`,
        entries: rows.map(row => ({ versionId, kind: "CNAE", code: row.id, name: row.descricao, parentCode: row.classe.id, degree: 5, canonicalId: `UNMAPPED:CNAE:${row.id}`, attributes: { sourceUrl: metadata.url, sourceHash: hash, capturedAt: metadata.capturedAt, sourceRecord: row, mapped: false, versionVerified: false, effectiveDatesVerified: false } })),
      }, actor.id, "IMPORT_CNAE_DRAFT", { sourceHash: hash, entries: rows.length, status: "DRAFT", adopted: false });
    }
    return { mode: apply ? "ADDITIVE_IDEMPOTENT" : "READ_ONLY", versionId, sourceHash: hash, sourceUrl: metadata.url, entries: rows.length, status: "DRAFT", adopted: false, canonicalMappingPending: true, effectiveDatesVerified: false };
  }, { timeoutMs: 120_000, lockTimeoutMs: 120_000 });
}

async function main() {
  config({ path: ".env.local", quiet: true });
  config({ quiet: true });
  const apply = process.argv.includes("--apply");
  const metadata = JSON.parse(readFileSync("docs/poc-p0/fontes/CNAE_IBGE_API_V2_METADATA.json", "utf8")) as CnaeMetadata;
  const capture = parseP1CnaeCapture(readFileSync("docs/poc-p0/fontes/CNAE_IBGE_API_V2_SUBCLASSES.json"), metadata);
  const connection = openCrossDomainDatabase(2_000);
  try {
    const report = await importP1CnaeCapture(connection, capture, apply);
    if (apply) writeFileSync("docs/poc-p0/CATALOGO_CNAE_P1.json", `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report, null, 2));
  } finally { await connection.pool.end(); }
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("/import-poc-p1-cnae.ts")) {
  void main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
}
