import { asc, eq } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import { sstAsos, sstExams } from "@/db/schema/sst-clinical";

/** Caller checks clinical authorization from a scope-only query before loading. */
export async function readSstAso(database: DatabaseExecutor, id: string) {
  const [record] = await database.select().from(sstAsos).where(eq(sstAsos.id, id));
  if (!record) throw new Error("ASO não encontrado.");
  return { ...record, exams: await database.select().from(sstExams).where(eq(sstExams.asoId, id)).orderBy(asc(sstExams.id)) };
}
