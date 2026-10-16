import type { Prisma } from "@prisma/client";
import type { TaxActor } from "./index";

export async function attributeItbiHistory(tx: Prisma.TransactionClient, actor: Pick<TaxActor, "usuarioId">) {
  await tx.$queryRaw`SELECT set_config('celeriflow.itbi_actor', ${actor.usuarioId}, true)`;
}
