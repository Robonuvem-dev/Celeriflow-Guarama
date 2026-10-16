import { z } from "zod";
import { SstValidationError } from "./errors";

export const asoFlowSettings = z.object({
  budgetUnitId: z.string().min(1).max(100),
  suggestedResults: z.array(z.enum(["APTO", "INAPTO", "APTO_RESTRICOES", "APTO_RECOMENDACOES", "INAPTO_TEMPORARIO"])).max(5),
  vacationWarningDays: z.coerce.number().int().min(0).max(365),
});
export function assertAsoProfessional(role: { budgetUnitId: string; personId: string; discipline: string; council: string; startsAt: Date; endsAt: Date; isActive: boolean } | undefined,
  expected: { budgetUnitId: string; personId: string; discipline: string; council: string; performedAt: Date }) {
  if (!role || !role.isActive || role.budgetUnitId !== expected.budgetUnitId || role.personId !== expected.personId || role.discipline !== expected.discipline || role.council !== expected.council || role.startsAt > expected.performedAt || role.endsAt < expected.performedAt) {
    throw new SstValidationError("Profissional sem habilitação administrativa da atuação/conselho na UG e data do exame. O cadastro não representa verificação junto ao conselho oficial.");
  }
}
export function secondVacationWarning(periods: { id: string; acquisitionStart: Date; acquisitionEnd: Date; expiresAt: Date }[], day: Date, warningDays: number) {
  const ordered = [...periods].filter((p) => p.acquisitionEnd <= day).sort((a, b) => a.acquisitionStart.getTime() - b.acquisitionStart.getTime() || a.id.localeCompare(b.id));
  const second = ordered[1];
  if (!second) return null;
  const days = Math.ceil((second.expiresAt.getTime() - day.getTime()) / 86400000);
  return days <= warningDays ? { ...second, daysUntilExpiry: days } : null;
}
export function asoCorrectionVersion(originHash: string, correction: { id: string; requestHash: string } | undefined) {
  return correction ? `${originHash}:${correction.id}:${correction.requestHash}` : originHash;
}
