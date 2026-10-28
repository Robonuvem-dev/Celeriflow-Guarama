import type { DatabaseConnection } from "@/db/connection";
import type { DatabaseExecutor } from "@/db/transaction";
import type { PermissionUser } from "./identity";
import type { PlanningJurisdiction } from "@/lib/planejamento/policy";

/** Readers can run on the caller's uncommitted executor. */
export type PlanningPublicationContext = {
  user: PermissionUser;
  jurisdiction: PlanningJurisdiction;
  database?: DatabaseExecutor;
  connection?: DatabaseConnection;
};

/** Publication owns several transactions separated by external storage IO. */
export type PlanningPublicationConnectionContext = PlanningPublicationContext & { connection: DatabaseConnection };
export type PlanningPublicationFormat = "PDF" | "CSV";
