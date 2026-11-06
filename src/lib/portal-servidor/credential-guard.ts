import { sql } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import { AccessError } from "@/lib/platform/access-error";

export async function assertEmployeePortalNotLocked(database: DatabaseExecutor, userId: string) {
  const result = await database.execute(sql`SELECT 1 FROM "EmployeePortalLoginGuard" WHERE "userId"=${userId} AND "lockedUntil">now()`);
  if (result.rows.length) throw new AccessError("Acesso temporariamente bloqueado. Aguarde para tentar novamente.", 423);
}
