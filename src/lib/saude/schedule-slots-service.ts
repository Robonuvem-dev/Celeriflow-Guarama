import { z } from "zod";
import type { AppContext } from "@/lib/platform/tenant-context";
import { assertHealthUnitAccess } from "@/lib/platform/tenant-context";
import { professionalAcceptsTime, professionalBookingWindows } from "./professional-booking-service";
import { and, eq, gte, lt, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { healthAppointments, healthCareSchedules, healthScheduleBlocks } from "@/db/schema/health-agenda";

export async function listHealthScheduleSlots(context: AppContext, raw: unknown) {
  const input = z.object({ scheduleId: z.string().min(1), day: z.iso.date() }).strict().parse(raw);
  const database = context.database ?? db;
  const [schedule] = await database.select().from(healthCareSchedules).where(eq(healthCareSchedules.id, input.scheduleId)).limit(1);
  if (!schedule) throw new Error("Cronograma não encontrado.");
  const blocks = await database.select().from(healthScheduleBlocks).where(eq(healthScheduleBlocks.scheduleId, schedule.id));
  assertHealthUnitAccess(context.user, schedule.unitId);
  if (schedule.status !== "Ativo" || !schedule.startTime || !schedule.endTime) return [];
  const day = new Date(`${input.day}T12:00:00Z`), start = new Date(`${input.day}T00:00:00-03:00`), end = new Date(start.valueOf() + 86400000);
  if (schedule.kind === "FIXO" && schedule.weekday !== day.getUTCDay() || schedule.kind === "DIARIO" && schedule.date?.toISOString().slice(0, 10) !== input.day) return [];
  if (schedule.validFrom && input.day < schedule.validFrom.toISOString().slice(0, 10) || schedule.validUntil && input.day > schedule.validUntil.toISOString().slice(0, 10)) return [];
  if (!schedule.allowHolidays && (await database.execute(sql`SELECT id FROM "CalendarEvent" WHERE "isHoliday"=true AND date>=${start} AND date<${end} LIMIT 1`)).rows.length) return [];
  const windows = schedule.professionalId ? await professionalBookingWindows(database, { professionalId: schedule.professionalId, unitId: schedule.unitId, specialtyId: schedule.specialtyId, date: day }) : null;
  const appointments = await database.select({ date: healthAppointments.date }).from(healthAppointments).where(and(eq(healthAppointments.scheduleId, schedule.id), gte(healthAppointments.date, start), lt(healthAppointments.date, end), inArray(healthAppointments.status, schedule.releaseAbsenceSlot ? ["Agendado", "Confirmado", "Aguardando", "Em Atendimento", "Atendido"] : ["Agendado", "Confirmado", "Aguardando", "Em Atendimento", "Atendido", "Faltou"])));
  const remaining = Math.max(0, schedule.totalSlots - appointments.length);
  if (!remaining) return [];
  const minutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
  const slots: { value: string; label: string }[] = [];
  for (let minute = minutes(schedule.startTime); minute < minutes(schedule.endTime); minute += schedule.slotMinutes) {
    const time = `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
    const date = new Date(`${input.day}T${time}:00-03:00`);
    if (!professionalAcceptsTime(windows, date) || appointments.some(appointment => appointment.date.valueOf() === date.valueOf()) || blocks.some(block => date >= block.startsAt && date < block.endsAt)) continue;
    slots.push({ value: `${input.day}T${time}`, label: `${input.day} · ${time}` });
  }
  return slots;
}
