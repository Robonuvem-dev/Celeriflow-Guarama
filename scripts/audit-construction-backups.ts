import { config } from "dotenv";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";

config({ path: ".env.local", quiet: true });
config({ quiet: true });
neonConfig.webSocketConstructor = ws;
const connectionString = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!connectionString) throw new Error("Configure a conexão municipal antes de auditar.");
const db = new PrismaClient({ adapter: new PrismaNeon({ connectionString }) });
async function main() {
let checked = 0;
const failures: { id: string; reason: string }[] = [];
try {
  let cursor: string | undefined;
  do {
    const rows = await db.constructionIssuedDocument.findMany({ orderBy: { id: "asc" }, take: 100, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), select: { id: true, backupPath: true, hashSha256: true } });
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
} finally { await db.$disconnect(); }
}
main().catch(() => { console.error("Não foi possível executar a auditoria de backups."); process.exitCode = 1; });
