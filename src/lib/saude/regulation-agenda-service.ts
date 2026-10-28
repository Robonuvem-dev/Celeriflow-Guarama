import { eq, sql } from "drizzle-orm";
import type { DatabaseTransaction } from "@/db/transaction";
import { healthRegulationRequests, healthRegulationQuotas, healthRegulationEvents } from "@/db/schema/health-regulation";
import { adjustRegulationAppointmentQuota } from "./regulation-service";
import { updateWaitlistWithEvent } from "./waitlist-events";

export async function syncRegulationAppointment(tx: DatabaseTransaction, appointmentId: string, status: string, actorUsuarioId: string) {
  if (status === "Faltou") { const schedule = (await tx.execute<{ releaseAbsenceSlot: boolean }>(sql`SELECT s."releaseAbsenceSlot" FROM "HealthAppointment" a JOIN "HealthCareSchedule" s ON s.id=a."scheduleId" WHERE a.id=${appointmentId} LIMIT 1`)).rows[0]; if (schedule && !schedule.releaseAbsenceSlot) return; }
  const [linked] = await tx.select({ id: healthRegulationRequests.id }).from(healthRegulationRequests).where(eq(healthRegulationRequests.appointmentId, appointmentId)).limit(1);
  if (!linked) return;
  await tx.execute(sql`SELECT id FROM "HealthRegulationRequest" WHERE id=${linked.id} FOR UPDATE`);
  const [request] = await tx.select().from(healthRegulationRequests).where(eq(healthRegulationRequests.id, linked.id)).limit(1);
  if (!request) throw new Error("Solicitação não encontrada.");
  if (status === "Atendido" && !request.executedAt && request.quotaId) {
    await tx.execute(sql`SELECT id FROM "HealthRegulationQuota" WHERE id=${request.quotaId} FOR UPDATE`);
    const [quota] = await tx.select().from(healthRegulationQuotas).where(eq(healthRegulationQuotas.id, request.quotaId)).limit(1);
    if (!quota) throw new Error("Cota não encontrada.");
    if (quota.reservedQuantity < 1) throw new Error("A execução exige reserva de cota válida na regulação.");
    await adjustRegulationAppointmentQuota(tx, quota.id, request.requestUnitId, true);
    await tx.update(healthRegulationRequests).set({ status: "EXECUTADA", executedAt: new Date() }).where(eq(healthRegulationRequests.id, request.id));
    await tx.insert(healthRegulationEvents).values({ requestId: request.id, fromStatus: request.status, toStatus: "EXECUTADA", eventType: "APPOINTMENT_EXECUTED", actorUsuarioId });
  }
  if (["Cancelado", "Faltou"].includes(status) && !request.executedAt && ["AUTORIZADA", "AGENDADA"].includes(request.status)) {
    if (request.quotaId) {
      await tx.execute(sql`SELECT id FROM "HealthRegulationQuota" WHERE id=${request.quotaId} FOR UPDATE`);
      const [quota] = await tx.select().from(healthRegulationQuotas).where(eq(healthRegulationQuotas.id, request.quotaId)).limit(1);
      if (!quota) throw new Error("Cota não encontrada.");
      if (quota.reservedQuantity < 1) throw new Error("Saldo reservado da cota incoerente.");
      await adjustRegulationAppointmentQuota(tx, quota.id, request.requestUnitId, false);
    }
    await tx.update(healthRegulationRequests).set({ status: "CANCELADA", quotaId: null }).where(eq(healthRegulationRequests.id, request.id));
    await updateWaitlistWithEvent(tx, { regulationRequestId: request.id }, { status: "Cancelado" }, { type: status === "Faltou" ? "APPOINTMENT_ABSENT" : "APPOINTMENT_CANCELLED", actorUsuarioId });
    await tx.insert(healthRegulationEvents).values({ requestId: request.id, fromStatus: request.status, toStatus: "CANCELADA", eventType: status === "Faltou" ? "APPOINTMENT_ABSENT" : "APPOINTMENT_CANCELLED", actorUsuarioId });
  }
}
