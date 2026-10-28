import { config } from "dotenv";
import { createDatabaseConnection } from "../src/db/connection";
import { withDatabaseTransaction } from "../src/db/transaction";
import { adoptAuroraActiveDebtAccountsInTransaction } from "../src/db/repositories/tax-active-debt/account-adoption";

config({ path: ".env.local", quiet: true });
const apply = process.argv.includes("--apply");
async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL não configurada.");
  const connection = createDatabaseConnection(process.env.DATABASE_URL);
  try {
    const report = await withDatabaseTransaction(connection, tx => adoptAuroraActiveDebtAccountsInTransaction(tx, apply), { timeoutMs: 60000 });
    console.log(JSON.stringify(report, null, 2));
  } finally { await connection.pool.end(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
