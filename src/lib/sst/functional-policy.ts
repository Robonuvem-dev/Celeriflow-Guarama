import { z } from "zod";

const optionalId = z.string().default("");
export const functionalPeriodInput = z.object({
  submissionKey: z.string().uuid(), employeeId: z.string().min(1), budgetUnitId: z.string().min(1),
  governmentEntityId: z.string().min(1), employmentRegimeId: z.string().min(1),
  roleId: z.string().min(1), functionRoleId: optionalId, departmentId: z.string().min(1),
  localId: z.string().min(1), costCenterId: z.string().min(1),
  startsAt: z.coerce.date(), endsAt: z.coerce.date(),
  contractReference: z.string().trim().min(3).max(200), sourceReference: z.string().trim().min(10).max(1000),
  supersedesId: optionalId, voided: z.boolean().default(false),
}).refine((v) => v.endsAt > v.startsAt, "Vigência final deve ser posterior à inicial (limite exclusivo).")
  .refine((v) => !v.voided || !!v.supersedesId, "Anulação exige referência ao período anterior.");

export type FunctionalScope = {
  id: string; employeeId: string; budgetUnitId: string; governmentEntityId: string;
  employmentRegimeId: string; roleId: string; functionRoleId: string | null;
  departmentId: string; localId: string; costCenterId: string;
  startsAt: Date; endsAt: Date; contractReference: string; snapshot: Record<string, unknown>;
};

export type HistoricalTechnicalResponsibility = {
  id: string; budgetUnitId: string; personId: string; kind: "ENVIRONMENTAL" | "BIOLOGICAL";
  groupId: string | null; council: string; sourceReference: string;
  startsAt: Date; endsAt: Date; effectiveEndsAt: Date; revokedAt: Date | null;
  snapshot: { personName: string; council: string; sourceReference: string };
};

// Legacy GHE roleIds mean cargo only. A separately declared function never substitutes cargo.
export function matchesHistoricalExposure(period: FunctionalScope, group: { departmentIds: string[]; roleIds: string[] }) {
  return (!group.departmentIds.length || group.departmentIds.includes(period.departmentId)) &&
    (!group.roleIds.length || group.roleIds.includes(period.roleId));
}

export function historicalIntersection(a: { startsAt: Date; endsAt: Date }, b: { startsAt: Date; endsAt: Date }) {
  const startsAt = new Date(Math.max(a.startsAt.getTime(), b.startsAt.getTime()));
  const endsAt = new Date(Math.min(a.endsAt.getTime(), b.endsAt.getTime()));
  return startsAt < endsAt ? { startsAt, endsAt } : null;
}
