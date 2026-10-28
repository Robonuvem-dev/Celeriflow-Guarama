import type { DatabaseExecutor } from "@/db/transaction";
import type { PermissionUser } from "./identity";

/** Accepts existing application contexts and isolated Drizzle fixtures. */
export type HealthPharmacyContext = { user: PermissionUser; database?: DatabaseExecutor };
