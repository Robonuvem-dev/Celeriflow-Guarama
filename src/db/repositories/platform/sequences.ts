import { sql } from "drizzle-orm";
import { sequenceCounters } from "../../schema/sequences";
import type { DatabaseExecutor } from "../../transaction";

/** Preserve the legacy bootstrap from existing codes, followed by an atomic
 * increment. Pass the source transaction when code and entity must roll back
 * together; this helper never opens a separate connection. */
export async function nextYearlyCodeDrizzle({ db, key, prefix, existingCodes, padding = 4 }: {
  db: DatabaseExecutor;
  key: string;
  prefix: string;
  existingCodes: { code: string }[];
  padding?: number;
}): Promise<string> {
  const year = new Date().getFullYear();
  const expression = new RegExp(`^${prefix}-${year}-(\\d+)$`);
  const currentMax = existingCodes.reduce((max, { code }) => Math.max(max, Number(expression.exec(code)?.[1]) || 0), 0);
  const [counter] = await db.insert(sequenceCounters).values({ key: `${key}:${year}`, value: currentMax + 1 }).onConflictDoUpdate({
    target: sequenceCounters.key,
    set: { value: sql`${sequenceCounters.value} + 1` },
  }).returning({ value: sequenceCounters.value });
  return `${prefix}-${year}-${String(counter.value).padStart(padding, "0")}`;
}
