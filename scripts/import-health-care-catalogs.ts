import "dotenv/config";
import { createHash } from "node:crypto";
import { and, asc, count, eq } from "drizzle-orm";
import type { DatabaseConnection } from "../src/db/connection";
import { withDatabaseTransaction } from "../src/db/transaction";
import { users } from "../src/db/schema/identity";
import { healthSusImportBatches, healthSusProcedures, healthSusReferences } from "../src/db/schema/health-catalogs";
import { openCrossDomainDatabase } from "./lib/cross-domain-database";

const CID_URL = "https://raw.githubusercontent.com/SidneyBissoli/cid10-br-mcp/master/data/CID-10-SUBCATEGORIAS.CSV";
const SIGTAP_URL = "https://raw.githubusercontent.com/RicardoHerrero/SIGTAP-dataSUS/main/tabelas/TabelaUnificada_202310_v2310101444/tb_procedimento.txt";

async function source(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Falha ao obter catálogo (${response.status}): ${url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  return { content: new TextDecoder("windows-1252").decode(bytes), checksum: createHash("sha256").update(bytes).digest("hex") };
}

function chunks<T>(items: T[], size = 1000) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

function cidCode(raw: string) {
  const code = raw.trim().toUpperCase();
  return code.length > 3 ? `${code.slice(0, 3)}.${code.slice(3)}` : code;
}

async function importCids(connection: DatabaseConnection, actorUsuarioId: string, fetchSource: typeof source) {
  const file = await fetchSource(CID_URL);
  const [existing] = await connection.db.select({ id: healthSusImportBatches.id }).from(healthSusImportBatches).where(and(eq(healthSusImportBatches.source, "SIA"), eq(healthSusImportBatches.competence, "2022-01"), eq(healthSusImportBatches.checksum, file.checksum))).limit(1);
  if (existing) {
    const [row] = await connection.db.select({ count: count() }).from(healthSusReferences).where(and(eq(healthSusReferences.sourceBatchId, existing.id), eq(healthSusReferences.kind, "CID")));
    return row.count;
  }
  const records = file.content.split(/\r?\n/).slice(1).map(line => line.split(";")).filter(columns => columns[0]?.trim() && columns[4]?.trim()).map(columns => ({ code: cidCode(columns[0]), classification: columns[1]?.trim() || null, description: columns[4].trim() }));
  await withDatabaseTransaction(connection, async tx => {
    const [batch] = await tx.insert(healthSusImportBatches).values({ source: "SIA", competence: "2022-01", origin: `Ministério da Saúde/DATASUS CID-10 · ${CID_URL}`, fileName: "CID-10-SUBCATEGORIAS.CSV", fileFormat: "CSV", contractVersion: "F1-C/catalog-v1", checksum: file.checksum, actorUsuarioId }).returning({ id: healthSusImportBatches.id });
    await tx.update(healthSusReferences).set({ isCurrent: false }).where(and(eq(healthSusReferences.source, "SIA"), eq(healthSusReferences.kind, "CID"), eq(healthSusReferences.isCurrent, true)));
    for (const group of chunks(records)) await tx.insert(healthSusReferences).values(group.map(item => ({ ...item, source: "SIA", competence: "2022-01", kind: "CID", sourceBatchId: batch.id })));
    await tx.update(healthSusImportBatches).set({ status: "COMPLETED", processedCount: records.length, insertedCount: records.length, completedAt: new Date() }).where(eq(healthSusImportBatches.id, batch.id));
  }, { timeoutMs: 120_000 });
  return records.length;
}

async function importProcedures(connection: DatabaseConnection, actorUsuarioId: string, fetchSource: typeof source) {
  const file = await fetchSource(SIGTAP_URL);
  const [existing] = await connection.db.select({ id: healthSusImportBatches.id }).from(healthSusImportBatches).where(and(eq(healthSusImportBatches.source, "SIGTAP"), eq(healthSusImportBatches.competence, "2023-10"), eq(healthSusImportBatches.checksum, file.checksum))).limit(1);
  if (existing) {
    const [row] = await connection.db.select({ count: count() }).from(healthSusProcedures).where(eq(healthSusProcedures.sourceBatchId, existing.id));
    return row.count;
  }
  const complexity: Record<string, string> = { "0": "Não se aplica", "1": "Atenção básica", "2": "Média complexidade", "3": "Alta complexidade" };
  const records = file.content.split(/\r?\n/).filter(line => line.length >= 260).map(line => ({ code: line.slice(0, 10).trim(), description: line.slice(10, 260).trim(), complexity: complexity[line.slice(260, 261)] || null, allowedSex: line.slice(261, 262).trim() || null, groupCode: line.slice(0, 2), subgroupCode: line.slice(0, 4), financing: line.slice(312, 314).trim() || null })).filter(item => item.code && item.description);
  await withDatabaseTransaction(connection, async tx => {
    const [batch] = await tx.insert(healthSusImportBatches).values({ source: "SIGTAP", competence: "2023-10", origin: `Ministério da Saúde/DATASUS SIGTAP · ${SIGTAP_URL}`, fileName: "tb_procedimento.txt", fileFormat: "TXT", contractVersion: "F1-C/catalog-v1", checksum: file.checksum, actorUsuarioId }).returning({ id: healthSusImportBatches.id });
    await tx.update(healthSusProcedures).set({ isCurrent: false }).where(and(eq(healthSusProcedures.source, "SIGTAP"), eq(healthSusProcedures.isCurrent, true)));
    for (const group of chunks(records)) await tx.insert(healthSusProcedures).values(group.map(item => ({ ...item, source: "SIGTAP", competence: "2023-10", sourceBatchId: batch.id })));
    await tx.update(healthSusImportBatches).set({ status: "COMPLETED", processedCount: records.length, insertedCount: records.length, completedAt: new Date() }).where(eq(healthSusImportBatches.id, batch.id));
  }, { timeoutMs: 120_000 });
  return records.length;
}

export async function importHealthCareCatalogs(connection: DatabaseConnection, fetchSource: typeof source = source) {
  const [actor] = await connection.db.select({ id: users.id }).from(users).orderBy(asc(users.createdAt)).limit(1);
  if (!actor) throw new Error("Não existe usuário ativo para registrar a autoria da carga SUS.");
  const [cids, procedures] = await Promise.all([importCids(connection, actor.id, fetchSource), importProcedures(connection, actor.id, fetchSource)]);
  return { cids, procedures };
}

async function main() {
  const connection = openCrossDomainDatabase();
  try {
    const { cids, procedures } = await importHealthCareCatalogs(connection);
    console.log(`Catálogos persistidos: ${cids} CIDs e ${procedures} procedimentos SIGTAP.`);
  } finally { await connection.pool.end(); }
}

if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
