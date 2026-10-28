import { readFileSync, readdirSync } from "node:fs";
import type { DatabaseExecutor } from "../src/db/transaction";
import type { PermissionUser } from "../src/lib/contracts/identity";
import type { FleetContext } from "../src/lib/contracts/fleet";
import { createLocalDrizzleDatabase } from "./helpers/local-drizzle-database";

/** Replay the installed DDL authority through an isolated real Neon transport. */
export async function createFleetTestDatabase(history = true) {
  const fixture = await createLocalDrizzleDatabase();
  try {
    if (history) for (const directory of readdirSync("prisma/migrations-ibema", { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name).sort()) {
      await fixture.database.exec(readFileSync(`prisma/migrations-ibema/${directory}/migration.sql`, "utf8"));
    }
    return fixture;
  } catch (error) { await fixture.close(); throw error; }
}

export function fleetTestContext(database: DatabaseExecutor, user: Partial<PermissionUser> & Pick<PermissionUser, "id">): FleetContext {
  return { database, user: {
    name: "Operador de Frota", firebaseUid: "fixture-not-authenticated", email: "fleet@fixture.invalid", role: "Operador",
    profileCode: "SYSTEM_ADMINISTRATOR", employeeId: null, departmentId: null, secretariatId: null, modulePermissions: [], allowedBudgetUnitIds: [], ...user,
  } };
}
