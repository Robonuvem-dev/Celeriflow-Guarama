import type { Prisma } from "@prisma/client";
import { adjustRegulationAppointmentQuota } from "./regulation-service";
import { updateWaitlistWithEvent } from "./waitlist-events";

export async function syncRegulationAppointment(tx: Prisma.TransactionClient, appointmentId: string, status: string, actorUsuarioId: string) {
  if (status === "Faltou") { const appointment = await tx.healthAppointment.findUnique({ where: { id: appointmentId }, select: { schedule: { select: { releaseAbsenceSlot: true } } } }); if (appointment?.schedule && !appointment.schedule.releaseAbsenceSlot) return; }
  const linked = await tx.healthRegulationRequest.findUnique({ where: { appointmentId }, select: { id: true } });
  if (!linked) return;
  await tx.$queryRaw`SELECT id FROM "HealthRegulationRequest" WHERE id=${linked.id} FOR UPDATE`;
  const request = await tx.healthRegulationRequest.findUniqueOrThrow({ where: { id: linked.id } });
  if (status === "Atendido" && !request.executedAt && request.quotaId) {
    await tx.$queryRaw`SELECT id FROM "HealthRegulationQuota" WHERE id=${request.quotaId} FOR UPDATE`;
    const quota = await tx.healthRegulationQuota.findUniqueOrThrow({ where: { id: request.quotaId } });
    if (quota.reservedQuantity < 1) throw new Error("A execução exige reserva de cota válida na regulação.");
    await adjustRegulationAppointmentQuota(tx, quota.id, request.requestUnitId, true);
    await tx.healthRegulationRequest.update({ where: { id: request.id }, data: { status: "EXECUTADA", executedAt: new Date() } });
    await tx.healthRegulationEvent.create({ data: { requestId: request.id, fromStatus: request.status, toStatus: "EXECUTADA", eventType: "APPOINTMENT_EXECUTED", actorUsuarioId } });
  }
  if (["Cancelado", "Faltou"].includes(status) && !request.executedAt && ["AUTORIZADA", "AGENDADA"].includes(request.status)) {
    if (request.quotaId) {
      await tx.$queryRaw`SELECT id FROM "HealthRegulationQuota" WHERE id=${request.quotaId} FOR UPDATE`;
      const quota = await tx.healthRegulationQuota.findUniqueOrThrow({ where: { id: request.quotaId } });
      if (quota.reservedQuantity < 1) throw new Error("Saldo reservado da cota incoerente.");
      await adjustRegulationAppointmentQuota(tx, quota.id, request.requestUnitId, false);
    }
    await tx.healthRegulationRequest.update({ where: { id: request.id }, data: { status: "CANCELADA", quotaId: null } });
    await updateWaitlistWithEvent(tx, { regulationRequestId: request.id }, { status: "Cancelado" }, { type: status === "Faltou" ? "APPOINTMENT_ABSENT" : "APPOINTMENT_CANCELLED", actorUsuarioId });
    await tx.healthRegulationEvent.create({ data: { requestId: request.id, fromStatus: request.status, toStatus: "CANCELADA", eventType: status === "Faltou" ? "APPOINTMENT_ABSENT" : "APPOINTMENT_CANCELLED", actorUsuarioId } });
  }
}
