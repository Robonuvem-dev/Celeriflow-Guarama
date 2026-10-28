import type { DatabaseExecutor } from "@/db/transaction";
import type { PermissionUser } from "./identity";

export type HealthFollowupContext = { user: PermissionUser; database?: DatabaseExecutor };
