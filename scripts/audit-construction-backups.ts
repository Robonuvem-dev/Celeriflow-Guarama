import { config } from "dotenv";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { asc, gt } from "drizzle-orm";
import { createDatabaseConnection } from "../src/db/connection";
import { constructionIssuedDocuments } from "../src/db/schema/construction-documents";

config({ path: ".env.local", quiet: true });
config({ quiet: true });
const connectionString = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!connectionString) throw new Error("Configure a conexão municipal antes de auditar.");
const connection = createDatabaseConnection(connectionString);
const db = connection.db;
async function main() {
let checked = 0;
const failures: { id: string; reason: string }[] = [];
try {
  let cursor: string | undefined;
  do {
    const rows = await db.select({ id: constructionIssuedDocuments.id, backupPath: constructionIssuedDocuments.backupPath, hashSha256: constructionIssuedDocuments.hashSha256 }).from(constructionIssuedDocuments).where(cursor ? gt(constructionIssuedDocuments.id, cursor) : undefined).orderBy(asc(constructionIssuedDocuments.id)).limit(100);
    if (!rows.length) break;
    for (const row of rows) {
      try {
        const bytes = await readFile(row.backupPath);
        if (createHash("sha256").update(bytes).digest("hex") !== row.hashSha256) throw new Error("Hash divergente.");
        checked++;
      } catch (error) { failures.push({ id: row.id, reason: error instanceof Error && error.message === "Hash divergente." ? error.message : "Backup não acessível neste servidor." }); }
    }
    cursor = rows.at(-1)!.id;
  } while (cursor);
  console.log(JSON.stringify({ mode: "READ_ONLY", checked, failures, result: failures.length ? "FAILED" : checked ? "VERIFIED" : "NO_ISSUED_DOCUMENTS" }, null, 2));
  if (failures.length) process.exitCode = 1;
} finally { await connection.pool.end(); }
}
main().catch(() => { console.error("Não foi possível executar a auditoria de backups."); process.exitCode = 1; });
