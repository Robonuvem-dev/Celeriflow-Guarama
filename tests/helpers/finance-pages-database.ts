import { readFile, readdir } from "node:fs/promises";
import { createLocalDrizzleDatabase } from "./local-drizzle-database";

/** Disposable historical database over the actual Neon WebSocket driver.
 * Open/close fixtures sequentially: Neon transport configuration is global. */
export async function createFinancePagesDatabase() {
  const fixture = await createLocalDrizzleDatabase();
  try {
    const root = new URL("../../prisma/migrations-ibema/", import.meta.url);
    const directories = (await readdir(root, { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
    for (const directory of directories) await fixture.database.exec(await readFile(new URL(`${directory}/migration.sql`, root), "utf8"));
    await fixture.database.exec(await readFile(new URL("../fixtures/finance-pages.sql", import.meta.url), "utf8"));
    return fixture;
  } catch (error) {
    await fixture.close();
    throw error;
  }
}
