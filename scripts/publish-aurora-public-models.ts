import { config } from "dotenv";
import { createHash } from "node:crypto";
import { put, get } from "@vercel/blob";
import { eq, sql } from "drizzle-orm";
import type { DatabaseConnection } from "../src/db/connection";
import { withDatabaseTransaction } from "../src/db/transaction";
import { transparencyPublications } from "../src/db/schema/transparency";
import { getBlobDocumentPrefix } from "../src/lib/platform/blob";
import { auroraPublicModels } from "../src/lib/transparencia/aurora-models";
import { renderTransparencyFile } from "../src/lib/transparencia/export-files";
import { parseTransparencyQuery, type PublicCollection, type PublicDataset, type TransparencyQuery } from "../src/lib/transparencia/query-contract";
import { openCrossDomainDatabase } from "./lib/cross-domain-database";

/** The only replaceable boundary is file rendering/storage. Database reads,
 * constraints, transactions and publication inserts always use real Drizzle. */
export type AuroraModelFiles = {
  documentPrefix: () => string;
  render: (collection: PublicCollection, dataset: PublicDataset, query: TransparencyQuery) => Promise<{ bytes: Buffer; contentType: string }>;
  put: (pathname: string, bytes: Buffer, contentType: string) => Promise<{ url: string; pathname: string }>;
  read: (url: string) => Promise<Uint8Array | null>;
};
const productionFiles: AuroraModelFiles = {
  documentPrefix: getBlobDocumentPrefix,
  render: (collection, dataset, query) => renderTransparencyFile(collection, dataset, query, "pdf"),
  put: (pathname, bytes, contentType) => put(pathname, bytes, { access: "private", token: process.env.BLOB_READ_WRITE_TOKEN, contentType, addRandomSuffix: true }),
  read: async url => {
    const stored = await get(url, { access: "private", token: process.env.BLOB_READ_WRITE_TOKEN });
    return stored ? Buffer.from(await new Response(stored.stream).arrayBuffer()) : null;
  },
};

export async function publishAuroraPublicModels(connection: DatabaseConnection, apply: boolean, files: AuroraModelFiles = productionFiles) {
  let created = 0, reused = 0;
  for (const model of auroraPublicModels) for (const entity of ["prefeitura", "camara"] as const) {
    const id = `aurora-public-model:${entity}:${model.code}:v1`;
    if (!apply) {
      const [prior] = await connection.db.select({ id: transparencyPublications.id }).from(transparencyPublications).where(eq(transparencyPublications.id, id)).limit(1);
      if (prior) reused++; else created++;
      continue;
    }
    const inserted = await withDatabaseTransaction(connection, async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${id}, 0))::text`);
      const [prior] = await tx.select({ id: transparencyPublications.id }).from(transparencyPublications).where(eq(transparencyPublications.id, id)).limit(1);
      if (prior) return false;
      const collection: PublicCollection = {
        slug: "publicacoes", title: `Aurora das Veredas — MODELO/PROPOSTA — ${model.title}`, group: model.group,
        description: "Modelo próprio autorizado para apresentação e adoção; não é ato promulgado nem decisão de tribunal.",
        columns: [{ key: "section", label: "Seção" }, { key: "text", label: "Conteúdo do modelo" }], filters: [], amountFields: [],
      };
      const query = parseTransparencyQuery(new URLSearchParams(`entity=${entity}&source=EXEMPLO&year=2026`));
      const dataset: PublicDataset = {
        records: model.sections.map(([section, text], index) => ({ key: `model-${index}`, entity, year: 2026, values: { section, text } })),
        source: "EXEMPLO", status: "AVAILABLE", complete: true, updatedAt: null,
        provenance: "Modelo próprio de Aurora das Veredas, baseado em fontes públicas e autorizado pelo responsável. Estágio REFERENCIA; sem ato, nomeação, aprovação ou julgamento presumidos.",
      };
      const file = await files.render(collection, dataset, query);
      const sha256 = createHash("sha256").update(file.bytes).digest("hex");
      const filename = `aurora-${entity}-${model.code}-modelo-v1.pdf`;
      const blob = await files.put(`${files.documentPrefix()}transparencia/modelos/${filename}`, file.bytes, file.contentType);
      const stored = await files.read(blob.url);
      if (!stored || createHash("sha256").update(stored).digest("hex") !== sha256) throw new Error("Modelo não confirmado no Blob.");
      await tx.insert(transparencyPublications).values({
        id, title: `MODELO/PROPOSTA — Aurora — ${model.title}`, collectionSlug: "publicacoes", entity, year: 2026, group: model.group,
        referencePeriod: "2026 — modelo próprio para adoção", documentKind: model.kind, legalStage: "REFERENCIA", source: "DOCUMENTOS", status: "PUBLISHED", publishedAt: new Date(),
        values: { origin: dataset.provenance, sourceMunicipality: "Aurora das Veredas — modelo, não documento de Ibema", sizeBytes: file.bytes.length },
        fileUrl: blob.url, filePathname: blob.pathname, filename, contentType: file.contentType, sha256,
      });
      return true;
    }, { timeoutMs: 120_000, lockTimeoutMs: 120_000 });
    if (inserted) created++; else reused++;
  }
  return { mode: apply ? "PUBLISHED_MODELS" : "READ_ONLY", created, reused, legalStage: "REFERENCIA", presumedLegalActs: false, presumedCourtJudgments: false };
}

async function main() {
  config({ path: ".env.local", quiet: true });
  const connection = openCrossDomainDatabase(2_000);
  try { console.log(JSON.stringify(await publishAuroraPublicModels(connection, process.argv.includes("--apply")))); }
  finally { await connection.pool.end(); }
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("/publish-aurora-public-models.ts")) {
  void main().catch(error => { console.error(error); process.exitCode = 1; });
}
