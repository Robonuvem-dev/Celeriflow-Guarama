import type { DatabaseExecutor } from "@/db/transaction";
import type { PermissionUser } from "./identity";

/** Fleet services only need identity and the caller's Drizzle read executor. */
export type FleetContext = { user: PermissionUser; database?: DatabaseExecutor };
