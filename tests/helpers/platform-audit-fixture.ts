import { readFile, readdir } from "node:fs/promises";
import { accessProfiles, users } from "../../src/db/schema/identity";
import { createLocalDrizzleDatabase } from "./local-drizzle-database";

/** Replay the installed SQL, including the append-only audit guards and FKs. */
export async function createPlatformAuditFixture() {
  const fixture = await createLocalDrizzleDatabase();
  try {
    const directories = (await readdir("prisma/migrations-ibema", { withFileTypes: true }))
      .filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
    for (const directory of directories) {
      await fixture.database.exec(await readFile(`prisma/migrations-ibema/${directory}/migration.sql`, "utf8"));
    }
    const [profile] = await fixture.connection.db.insert(accessProfiles).values({
      codigo: "PLATFORM_AUDIT_FIXTURE", nome: "Auditoria local", permissoes: "{}",
    }).returning({ id: accessProfiles.id });
    const [actor] = await fixture.connection.db.insert(users).values({
      nome: "Operador local", email: "platform-audit@example.invalid", perfilId: profile.id,
    }).returning({ id: users.id });
    return { ...fixture, actorId: actor.id };
  } catch (error) {
    await fixture.close();
    throw error;
  }
}
