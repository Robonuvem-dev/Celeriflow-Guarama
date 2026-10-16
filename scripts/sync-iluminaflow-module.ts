import { config } from "dotenv";
import { randomUUID } from "node:crypto";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

config({ path: ".env.local", quiet: true });
config({ quiet: true });
neonConfig.webSocketConstructor = ws;
const pool = new Pool({ connectionString: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL });

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('ILUMINAFLOW_MODULE_CATALOG'))");
    await client.query(`INSERT INTO "ConfiguracaoModulo" (id, codigo, nome, ativo, "dataAtivacao", "createdAt", "updatedAt")
      VALUES ($1, 'ILUMINACAO_PUBLICA', 'Iluminação Pública (Iluminaflow)', true, NOW(), NOW(), NOW())
      ON CONFLICT (codigo) DO UPDATE SET nome = EXCLUDED.nome, "updatedAt" = NOW()`, [randomUUID()]);
    await client.query(`UPDATE "ConfiguracaoModulo" SET nome = 'Obras e Construção Civil', "updatedAt" = NOW() WHERE codigo = 'OBRAS'`);
    const result = await client.query(`SELECT codigo, nome, ativo FROM "ConfiguracaoModulo" WHERE codigo IN ('OBRAS', 'ILUMINACAO_PUBLICA', 'DOCUMENTOS') ORDER BY codigo`);
    if (process.argv.includes("--apply")) await client.query("COMMIT");
    else await client.query("ROLLBACK");
    console.log(JSON.stringify({ applied: process.argv.includes("--apply"), modules: result.rows }, null, 2));
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(error => { console.error(error instanceof Error ? error.message : "Falha na sincronização dos módulos."); process.exitCode = 1; });
