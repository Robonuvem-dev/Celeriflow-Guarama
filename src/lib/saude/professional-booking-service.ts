import type { Prisma } from "@prisma/client";
import { getHealthAccessAt } from "./health-access-policy";

type Window = { weekday: number; startTime: string; endTime: string };
export async function professionalBookingWindows(tx: Prisma.TransactionClient, input: { professionalId: string; unitId: string; specialtyId?: string | null; date: Date }): Promise<Window[] | null> {
  const professional = await tx.healthProfessional.findFirst({ where: { id: input.professionalId, isActive: true, employee: { isActive: true } }, include: { assignments: { where: { unitId: input.unitId }, include: { shifts: { where: { isActive: true } } } } } });
  if (!professional) return [];
  if (!professional.assignments.length) return professional.unitId === input.unitId ? null : [];
  const day = getHealthAccessAt(input.date).date;
  const assignments = professional.assignments.filter(link => link.isActive && (!link.specialtyId || !input.specialtyId || link.specialtyId === input.specialtyId) && (!link.validFrom || day >= link.validFrom.toISOString().slice(0, 10)) && (!link.validUntil || day <= link.validUntil.toISOString().slice(0, 10)));
  if (!assignments.length) return [];
  const shifts = assignments.flatMap(link => link.shifts);
  return shifts.length ? shifts : null;
}

export function professionalAcceptsTime(windows: Window[] | null, date: Date) {
  if (windows === null) return true;
  const instant = getHealthAccessAt(date);
  return windows.some(window => window.weekday === instant.weekday && window.startTime <= instant.time && window.endTime > instant.time);
}
