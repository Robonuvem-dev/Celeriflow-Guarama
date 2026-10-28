import { config } from "dotenv";
import { and, asc, eq, like, sql } from "drizzle-orm";
import type { DatabaseExecutor } from "../src/db/transaction";
import { setupCatalogEntries } from "../src/db/schema/finance-setup-tools";
import { openFinanceSetupConnection, readSetupVersion } from "./lib/finance-setup-tools";
config({ path: ".env.local", quiet: true });
config({ quiet: true });

export async function inspectRapReference(db: DatabaseExecutor) {
    const source = await readSetupVersion(db, "p1-tce-pr-account-2026-1.0d");
    const entries = await db.select().from(setupCatalogEntries).where(and(eq(setupCatalogEntries.versionId, source.id), eq(setupCatalogEntries.kind, "ACCOUNT"), like(setupCatalogEntries.code, "6.3.%"), sql`${setupCatalogEntries.attributes} #> '{postingAllowed}' = 'true'::jsonb`)).orderBy(asc(setupCatalogEntries.code));
    return { sourceHash: source.sourceHash, accounts: entries.map(entry => ({ id: entry.id, code: entry.code, name: entry.name, degree: entry.degree, attributes: entry.attributes })) };
}
async function main() {
  const connection = openFinanceSetupConnection();
  try { console.log(JSON.stringify(await inspectRapReference(connection.db), null, 2)); }
  finally { await connection.pool.end(); }
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
