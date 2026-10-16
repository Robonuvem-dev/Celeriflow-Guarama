import type { Prisma } from "@prisma/client";

export async function updateWaitlistWithEvent(tx: Prisma.TransactionClient, where: Prisma.HealthWaitlistWhereUniqueInput, data: { status: string; appointmentId?: string | null; scheduleId?: string | null }, event: { type: string; actorUsuarioId: string; notes?: string | null }) {
  const initial = await tx.healthWaitlist.findUnique({ where, select: { id: true } });
  if (!initial) return null;
  await tx.$queryRaw`SELECT id FROM "HealthWaitlist" WHERE id=${initial.id} FOR UPDATE`;
  const current = await tx.healthWaitlist.findUniqueOrThrow({ where: { id: initial.id } });
  if (current.status === data.status && (data.appointmentId === undefined || current.appointmentId === data.appointmentId) && (data.scheduleId === undefined || current.scheduleId === data.scheduleId)) return { id: current.id };
  await tx.healthWaitlist.update({ where: { id: current.id }, data });
  await tx.healthWaitlistEvent.create({ data: { waitlistId: current.id, eventType: event.type, fromStatus: current.status, toStatus: data.status, appointmentId: data.appointmentId === undefined ? current.appointmentId : data.appointmentId, notes: event.notes || null, actorUsuarioId: event.actorUsuarioId, createdAt: new Date() } });
  return { id: current.id };
}
