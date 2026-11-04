import { and, eq, sql } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import { employees } from "@/db/schema/administration";
import { hrPersonalRevisions } from "@/db/schema/personnel-functional-management";
import { lockPersonnel } from "@/db/repositories/personnel/integration";

/** Capture only observed data. Never backfill a historic month with today's identity. */
export async function capturePersonalRevision(tx: DatabaseExecutor, employeeId: string, actorId: string, reason: string) {
  await lockPersonnel(tx, `employee:${employeeId}`);
  const [employee] = await tx.select().from(employees).where(eq(employees.id, employeeId)).limit(1);
  if (!employee) throw new Error("Servidor não encontrado.");
  await tx.execute(sql`SELECT set_config('celeriflow.actor_id',${actorId},true)`);
  await tx.execute(sql`SELECT hr_capture_personal_observation(${employeeId},${reason})`);
  const [revision] = await tx.select().from(hrPersonalRevisions).where(eq(hrPersonalRevisions.employeeId, employeeId)).orderBy(sql`${hrPersonalRevisions.effectiveFrom} DESC`, sql`${hrPersonalRevisions.id} DESC`).limit(1);
  return revision;
}

export async function personalRevisionAt(db: DatabaseExecutor, employeeId: string, reference: string) {
  const [revision] = await db.select().from(hrPersonalRevisions).where(and(eq(hrPersonalRevisions.employeeId, employeeId), sql`${hrPersonalRevisions.effectiveFrom}<${reference}::date+interval '1 day'`)).orderBy(sql`${hrPersonalRevisions.effectiveFrom} DESC`, sql`${hrPersonalRevisions.id} DESC`).limit(1);
  return revision ?? null;
}
