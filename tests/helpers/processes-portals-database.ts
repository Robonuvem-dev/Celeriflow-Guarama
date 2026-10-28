import { readFile, readdir } from "node:fs/promises";
import { createLocalDrizzleDatabase } from "./local-drizzle-database";

/** Replay authoritative SQL only in a disposable local database. Reuses the
 * production driver so repositories and transaction callbacks need no casts. */
export async function createProcessesPortalsDatabase() {
  const fixture = await createLocalDrizzleDatabase();
  try {
    const root = new URL("../../prisma/migrations-ibema/", import.meta.url);
    const directories = (await readdir(root, { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
    for (const directory of directories) await fixture.database.exec(await readFile(new URL(`${directory}/migration.sql`, root), "utf8"));
    return fixture;
  } catch (error) {
    await fixture.close();
    throw error;
  }
}
