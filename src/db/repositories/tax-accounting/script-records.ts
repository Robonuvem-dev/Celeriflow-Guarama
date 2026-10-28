import { asc, eq } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import { users } from "@/db/schema/identity";
import { requiredTaxRecord } from "./records";

export async function readTaxAccountingAdoptionActor(tx: DatabaseExecutor) {
  return requiredTaxRecord((await tx.select({ id: users.id }).from(users).where(eq(users.ativo, true)).orderBy(asc(users.createdAt)).limit(1))[0], "Operador ativo");
}
