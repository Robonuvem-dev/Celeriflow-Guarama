import { readFile, readdir } from "node:fs/promises";
import { createLocalDrizzleDatabase } from "./local-drizzle-database";

/** Replay the authoritative SQL history locally; no DMMF or remote database. */
export async function createTaxationDrizzleFixture() {
  const fixture = await createLocalDrizzleDatabase();
  try {
    const folders = (await readdir("prisma/migrations-ibema", { withFileTypes: true }))
      .filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
    for (const folder of folders) {
      await fixture.database.exec(await readFile(`prisma/migrations-ibema/${folder}/migration.sql`, "utf8"));
    }
    return fixture;
  } catch (error) {
    await fixture.close();
    throw error;
  }
}
