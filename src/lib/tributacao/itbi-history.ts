import { sql } from "drizzle-orm";
import type { DatabaseTransaction } from "@/db/transaction";
import type { TaxActor } from "./index";

export async function attributeItbiHistory(tx: DatabaseTransaction, actor: Pick<TaxActor, "usuarioId">) {
  await tx.execute(sql`SELECT set_config('celeriflow.itbi_actor', ${actor.usuarioId}, true)`);
}
