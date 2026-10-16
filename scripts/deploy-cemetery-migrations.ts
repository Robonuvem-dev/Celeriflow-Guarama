import { config } from "dotenv";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

config({ path: ".env.local", quiet: true }); config({ quiet: true });
neonConfig.webSocketConstructor = ws;
const pool = new Pool({ connectionString: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL });
const names = ["20261011010000_cemetery_integrity", "20261011020000_cemetery_automatic_fees"];

async function main() {
  const client = await pool.connect();
  try {
    const apply = process.argv.includes("--apply");
    const result: { name: string; state: string }[] = [];
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('CEMETERY_MIGRATIONS_DEPLOY'))");
    for (const name of names) {
      const sql = readFileSync(`prisma/migrations-ibema/${name}/migration.sql`, "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const { rows } = await client.query('SELECT checksum,finished_at,rolled_back_at FROM "_prisma_migrations" WHERE migration_name=$1 ORDER BY started_at DESC', [name]);
      if (rows.some(r => !r.finished_at && !r.rolled_back_at)) throw new Error(`Migration com execução incompleta: ${name}`);
      const existing = rows.find(r => r.finished_at && !r.rolled_back_at);
      if (existing) {
        if (existing.checksum !== checksum) throw new Error(`Checksum divergente: ${name}`);
        result.push({ name, state: "APPLIED_CHECKSUM_VERIFIED" }); continue;
      }
      if (!apply) { result.push({ name, state: "PENDING" }); continue; }
      await client.query(sql);
      await client.query('INSERT INTO "_prisma_migrations" (id,checksum,migration_name,started_at,finished_at,applied_steps_count) VALUES ($1,$2,$3,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,1)', [randomUUID(), checksum, name]);
      result.push({ name, state: "APPLIED" });
    }
    await client.query(apply ? "COMMIT" : "ROLLBACK");
    console.log(JSON.stringify({ mode: apply ? "CEMETERY_ONLY_DEPLOY" : "PREVIEW", migrations: result }, null, 2));
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); await pool.end(); }
}
main().catch(error => { console.error(error instanceof Error && /^(Migration|Checksum)/.test(error.message) ? error.message : "Não foi possível concluir a aplicação das migrations de Cemitérios."); process.exitCode = 1; });
