import { and, eq, inArray } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import { healthProfessionals, healthProfessionalAssignments, healthProfessionalShifts } from "@/db/schema/health-workforce";
import { employees } from "@/db/schema/administration";
import { getHealthAccessAt } from "./health-access-policy";

type Window = { weekday: number; startTime: string; endTime: string };
export async function professionalBookingWindows(tx: DatabaseExecutor, input: { professionalId: string; unitId: string; specialtyId?: string | null; date: Date }): Promise<Window[] | null> {
  const [professional] = await tx.select({ unitId: healthProfessionals.unitId }).from(healthProfessionals).innerJoin(employees, eq(employees.id, healthProfessionals.employeeId)).where(and(eq(healthProfessionals.id, input.professionalId), eq(healthProfessionals.isActive, true), eq(employees.isActive, true))).limit(1);
  if (!professional) return [];
  const links = await tx.select().from(healthProfessionalAssignments).where(and(eq(healthProfessionalAssignments.professionalId, input.professionalId), eq(healthProfessionalAssignments.unitId, input.unitId)));
  if (!links.length) return professional.unitId === input.unitId ? null : [];
  const day = getHealthAccessAt(input.date).date;
  const assignments = links.filter(link => link.isActive && (!link.specialtyId || !input.specialtyId || link.specialtyId === input.specialtyId) && (!link.validFrom || day >= link.validFrom.toISOString().slice(0, 10)) && (!link.validUntil || day <= link.validUntil.toISOString().slice(0, 10)));
  if (!assignments.length) return [];
  const shifts = await tx.select({ weekday: healthProfessionalShifts.weekday, startTime: healthProfessionalShifts.startTime, endTime: healthProfessionalShifts.endTime }).from(healthProfessionalShifts).where(and(inArray(healthProfessionalShifts.assignmentId, assignments.map(link => link.id)), eq(healthProfessionalShifts.isActive, true)));
  return shifts.length ? shifts : null;
}

export function professionalAcceptsTime(windows: Window[] | null, date: Date) {
  if (windows === null) return true;
  const instant = getHealthAccessAt(date);
  return windows.some(window => window.weekday === instant.weekday && window.startTime <= instant.time && window.endTime > instant.time);
}
