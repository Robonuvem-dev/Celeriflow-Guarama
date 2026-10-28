import { eq, sql } from "drizzle-orm";
import type { DatabaseTransaction } from "@/db/transaction";
import { healthWaitlists, healthWaitlistEvents } from "@/db/schema/health-agenda";

export async function updateWaitlistWithEvent(tx: DatabaseTransaction, where: { id: string } | { regulationRequestId: string } | { appointmentId: string }, data: { status: string; appointmentId?: string | null; scheduleId?: string | null }, event: { type: string; actorUsuarioId: string; notes?: string | null }) {
  const filter = "id" in where ? eq(healthWaitlists.id, where.id) : "regulationRequestId" in where ? eq(healthWaitlists.regulationRequestId, where.regulationRequestId) : eq(healthWaitlists.appointmentId, where.appointmentId);
  const [initial] = await tx.select({ id: healthWaitlists.id }).from(healthWaitlists).where(filter).limit(1);
  if (!initial) return null;
  await tx.execute(sql`SELECT id FROM "HealthWaitlist" WHERE id=${initial.id} FOR UPDATE`);
  const [current] = await tx.select().from(healthWaitlists).where(eq(healthWaitlists.id, initial.id)).limit(1);
  if (!current) throw new Error("Registro de espera não encontrado.");
  if (current.status === data.status && (data.appointmentId === undefined || current.appointmentId === data.appointmentId) && (data.scheduleId === undefined || current.scheduleId === data.scheduleId)) return { id: current.id };
  await tx.update(healthWaitlists).set(data).where(eq(healthWaitlists.id, current.id));
  await tx.insert(healthWaitlistEvents).values({ waitlistId: current.id, eventType: event.type, fromStatus: current.status, toStatus: data.status, appointmentId: data.appointmentId === undefined ? current.appointmentId : data.appointmentId, notes: event.notes || null, actorUsuarioId: event.actorUsuarioId, createdAt: new Date() });
  return { id: current.id };
}
