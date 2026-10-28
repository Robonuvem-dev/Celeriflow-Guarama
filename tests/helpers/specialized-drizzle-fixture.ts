import { readFile, readdir } from "node:fs/promises";
import { createLocalDrizzleDatabase } from "./local-drizzle-database";

/** Full historical SQL keeps cultural joins, unique indexes and C7/audit guards
 * authoritative. Domain fixtures are written through the real Neon/Drizzle
 * connection inside the test's rollback transaction. */
export async function createSpecializedDrizzleFixture() {
  const fixture = await createLocalDrizzleDatabase();
  try {
    fixture.connection.pool.options.max = 1;
    const folders = (await readdir("prisma/migrations-ibema", { withFileTypes: true }))
      .filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
    for (const folder of folders) {
      try {
        await fixture.database.exec(await readFile(`prisma/migrations-ibema/${folder}/migration.sql`, "utf8"));
      } catch (error) {
        throw new Error(`Falha no histórico SQL da fixture especializada: ${folder}`, { cause: error });
      }
    }
    return fixture;
  } catch (error) {
    await fixture.close();
    throw error;
  }
}
