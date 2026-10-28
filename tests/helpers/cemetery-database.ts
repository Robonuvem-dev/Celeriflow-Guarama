import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { accessProfiles, users } from "../../src/db/schema/identity";
import { createLocalDrizzleDatabase } from "./local-drizzle-database";

/** Physical SQL is the independent fixture authority. No generated ORM model,
 * relaxed columns/defaults or synthetic DDL. PGlite remains a single backend;
 * pool max=1 serializes competing callers, not a proof of real lock contention. */
export async function createCemeteryDatabase(actorId = "operator") {
  const fixture = await createLocalDrizzleDatabase();
  fixture.connection.pool.options.max = 1;
  try {
    const directory = "prisma/migrations-ibema";
    for (const entry of readdirSync(directory, { withFileTypes: true }).filter(entry => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
      await fixture.database.exec(readFileSync(join(directory, entry.name, "migration.sql"), "utf8"));
    }
    const [profile] = await fixture.connection.db.select({ id: accessProfiles.id }).from(accessProfiles).limit(1);
    if (!profile) throw new Error("Perfil histórico ausente da fixture.");
    await fixture.connection.db.insert(users).values({ id: actorId, nome: "Operador cemiterial de teste", email: `${actorId}@cemetery.example.test`, perfilId: profile.id });
    return fixture;
  } catch (error) { await fixture.close(); throw error; }
}
