import { readFile, readdir } from "node:fs/promises";
import { createLocalDrizzleDatabase } from "./local-drizzle-database";

/** Full physical SQL history, including stock dependencies and SST guards,
 * over the production Neon/Drizzle transport connected to local PGlite. */
export async function createSstPagesDatabase() {
  const fixture = await createLocalDrizzleDatabase();
  try {
    const migrations = (await readdir("prisma/migrations-ibema", { withFileTypes: true }))
      .filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
    for (const migration of migrations) {
      await fixture.database.exec(await readFile(`prisma/migrations-ibema/${migration}/migration.sql`, "utf8"));
    }
    return fixture;
  } catch (error) {
    await fixture.close();
    throw error;
  }
}
