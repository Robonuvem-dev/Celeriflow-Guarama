import type { DatabaseExecutor } from "@/db/transaction";
import type { PermissionUser } from "./identity";

export type HealthVaccinationContext = { user: PermissionUser; database?: DatabaseExecutor };
