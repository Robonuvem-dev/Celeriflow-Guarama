import { asc, eq } from "drizzle-orm";
import type { DatabaseExecutor } from "../../transaction";
import { instanceParameters } from "../../schema/instance-configuration";

export async function readTransparencyParameter(db: DatabaseExecutor, key: string): Promise<{ valor: unknown } | null> {
  const [row] = await db.select({ valor: instanceParameters.valor }).from(instanceParameters).where(eq(instanceParameters.chave, key)).orderBy(asc(instanceParameters.createdAt)).limit(1);
  return row ?? null;
}
