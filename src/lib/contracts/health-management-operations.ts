import type { DatabaseConnection } from "@/db/connection";
import type { DatabaseExecutor } from "@/db/transaction";
import type { PermissionUser } from "./identity";

export type HealthManagementContext = {
  user: PermissionUser;
  database?: DatabaseExecutor;
  connection?: DatabaseConnection;
};
export type HealthManagementPeriod = { gte?: Date; lte?: Date } | undefined;
export type HealthAdministrativeMergeInput = { kind: "ADDRESS" | "PATIENT" | "PROFESSIONAL"; targetId: string; sourceId: string; actorUsuarioId: string };
