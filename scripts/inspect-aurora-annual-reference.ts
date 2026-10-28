import { config } from "dotenv";
import { and, asc, eq, like, or, sql } from "drizzle-orm";
import type { DatabaseExecutor } from "../src/db/transaction";
import { setupCatalogEntries } from "../src/db/schema/finance-setup-tools";
import { openFinanceSetupConnection, readSetupVersion } from "./lib/finance-setup-tools";
config({ path: ".env.local", quiet: true });
config({ quiet: true });

export async function inspectAnnualReference(db: DatabaseExecutor) {
    const version = await readSetupVersion(db, "p1-tce-pr-account-2026-1.0d");
    const entries = await db.select({ code: setupCatalogEntries.code, name: setupCatalogEntries.name }).from(setupCatalogEntries).where(and(eq(setupCatalogEntries.versionId, version.id), eq(setupCatalogEntries.kind, "ACCOUNT"), or(...["6.2.2.1", "8.2.1", "5.3"].map(prefix => like(setupCatalogEntries.code, `${prefix}%`))), sql`${setupCatalogEntries.attributes} #> '{postingAllowed}' = 'true'::jsonb`)).orderBy(asc(setupCatalogEntries.code));
    return { sourceHash: version.sourceHash, accounts: entries };
}
async function main() {
  const connection = openFinanceSetupConnection();
  try { console.log(JSON.stringify(await inspectAnnualReference(connection.db), null, 2)); }
  finally { await connection.pool.end(); }
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
