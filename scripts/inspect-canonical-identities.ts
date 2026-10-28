import { config } from "dotenv";
import { readCanonicalIdentityIssues } from "../src/lib/cadastros/identity-integrity";
import { createDatabaseConnection } from "../src/db/connection";
import { withDatabaseTransaction } from "../src/db/transaction";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não configurada.");
  const connection = createDatabaseConnection(url);
  try {
    const findings = await withDatabaseTransaction(connection, tx => readCanonicalIdentityIssues(tx), { isolationLevel: "repeatable read", accessMode: "read only", timeoutMs: 60_000 });
    const byType: Record<string, number> = {};
    for (const issue of findings) byType[issue.issueType] = (byType[issue.issueType] ?? 0) + 1;
    console.log(JSON.stringify({ generatedAt: new Date().toISOString(), mode: "DATABASE_READ_ONLY", preservation: "Transação READ ONLY; nenhum cadastro ou evidência histórica alterado.", byType, findings, conclusion: "Inspeção documental por registro; não substitui regressão nem aceite autenticado." }, null, 2));
  } finally { await connection.pool.end(); }
}
main().catch((error: unknown) => { console.error("Inspeção cadastral falhou:", error instanceof Error ? error.message.replace(/postgres(?:ql)?:\/\/[^\s]+/g, "[URL omitida]") : "ERRO"); process.exitCode = 1; });
