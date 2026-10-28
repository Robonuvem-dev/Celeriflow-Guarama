import type { Database } from "../../src/db/connection";
import type { AppContext } from "../../src/lib/platform/tenant-context";

/** Real Drizzle executor; fail immediately if a migrated path uses the legacy context. */
export function sstTestContext(database: Database, user: Partial<AppContext["user"]> = {}): AppContext {
  const context = {
    database,
    user: { id: "user", firebaseUid: "user", email: "sst@example.invalid", name: "SST", role: "SST", profileCode: "TEST", permissions: "{}", modulePermissions: [], allowedBudgetUnitIds: ["ug"], employeeId: null, departmentId: null, secretariatId: null, ...user },
    get prisma(): never { throw new Error("SST test reached the legacy database context."); },
  };
  // Context composition must not evaluate the legacy fail-fast accessor.
  Object.defineProperty(context, "prisma", { enumerable: false });
  return context;
}
