import { z } from "zod";
import type { AppContext } from "@/lib/platform/tenant-context";
import { assertHealthUnitAccess } from "@/lib/platform/tenant-context";
import { professionalAcceptsTime, professionalBookingWindows } from "./professional-booking-service";

export async function listHealthScheduleSlots(context: AppContext, raw: unknown) {
  const input = z.object({ scheduleId: z.string().min(1), day: z.iso.date() }).strict().parse(raw);
  const schedule = await context.prisma.healthCareSchedule.findUniqueOrThrow({ where: { id: input.scheduleId }, include: { blocks: true } });
  assertHealthUnitAccess(context.user, schedule.unitId);
  if (schedule.status !== "Ativo" || !schedule.startTime || !schedule.endTime) return [];
  const day = new Date(`${input.day}T12:00:00Z`), start = new Date(`${input.day}T00:00:00-03:00`), end = new Date(start.valueOf() + 86400000);
  if (schedule.kind === "FIXO" && schedule.weekday !== day.getUTCDay() || schedule.kind === "DIARIO" && schedule.date?.toISOString().slice(0, 10) !== input.day) return [];
  if (schedule.validFrom && input.day < schedule.validFrom.toISOString().slice(0, 10) || schedule.validUntil && input.day > schedule.validUntil.toISOString().slice(0, 10)) return [];
  if (!schedule.allowHolidays && await context.prisma.calendarEvent.count({ where: { isHoliday: true, date: { gte: start, lt: end } } })) return [];
  const windows = schedule.professionalId ? await professionalBookingWindows(context.prisma, { professionalId: schedule.professionalId, unitId: schedule.unitId, specialtyId: schedule.specialtyId, date: day }) : null;
  const appointments = await context.prisma.healthAppointment.findMany({ where: { scheduleId: schedule.id, date: { gte: start, lt: end }, status: { in: schedule.releaseAbsenceSlot ? ["Agendado", "Confirmado", "Aguardando", "Em Atendimento", "Atendido"] : ["Agendado", "Confirmado", "Aguardando", "Em Atendimento", "Atendido", "Faltou"] } }, select: { date: true } });
  const remaining = Math.max(0, schedule.totalSlots - appointments.length);
  if (!remaining) return [];
  const minutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
  const slots: { value: string; label: string }[] = [];
  for (let minute = minutes(schedule.startTime); minute < minutes(schedule.endTime); minute += schedule.slotMinutes) {
    const time = `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
    const date = new Date(`${input.day}T${time}:00-03:00`);
    if (!professionalAcceptsTime(windows, date) || appointments.some(appointment => appointment.date.valueOf() === date.valueOf()) || schedule.blocks.some(block => date >= block.startsAt && date < block.endsAt)) continue;
    slots.push({ value: `${input.day}T${time}`, label: `${input.day} · ${time}` });
  }
  return slots;
}
