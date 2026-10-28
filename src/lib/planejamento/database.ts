import { db, databaseConnection } from "@/db/client";
import type { DatabaseConnection } from "@/db/connection";
import type { DatabaseExecutor } from "@/db/transaction";

export type PlanningDatabaseContext = { database?: DatabaseExecutor; connection?: DatabaseConnection };
export function planningDatabase(context: PlanningDatabaseContext): DatabaseExecutor { return context.database ?? context.connection?.db ?? db; }
export function planningConnection(context: PlanningDatabaseContext): DatabaseConnection { return context.connection ?? databaseConnection; }
