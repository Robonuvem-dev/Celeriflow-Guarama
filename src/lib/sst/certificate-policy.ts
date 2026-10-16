import { z } from "zod";
import { SstValidationError } from "./errors";

const identifier = z.string().trim().min(1).max(100);
export const certificateInput = z.object({
  budgetUnitId: identifier,
  employeeId: identifier,
  reasonId: identifier,
  issuerPersonId: identifier,
  issuerCouncil: z.string().trim().min(2).max(100),
  submissionKey: z.string().uuid(),
  dependentId: z.string().trim().max(100).default(""),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  presentedAt: z.string().default(""),
  protocolNumber: z.string().trim().max(100).default(""),
  processId: z.string().trim().max(100).default(""),
  cidCodes: z.array(z.string().trim().toUpperCase().regex(/^[A-Z][0-9]{2}(?:\.?[0-9A-Z]{1,2})?$/, "CID inválido.")).max(20).default([]),
}).superRefine((value, context) => {
  if (value.endsAt <= value.startsAt) context.addIssue({ code: "custom", path: ["endsAt"], message: "O término deve ser posterior ao início." });
});

export const reasonInput = z.object({
  budgetUnitId: identifier,
  code: z.string().trim().toUpperCase().min(1).max(40).regex(/^[A-Z0-9_.-]+$/),
  name: z.string().trim().min(2).max(160),
  dependentPolicy: z.enum(["DISABLED", "OPTIONAL", "REQUIRED"]),
  restrictedRoleIds: z.array(identifier).max(100).default([]),
  restrictedRegimeIds: z.array(identifier).max(100).default([]),
  autoProtocol: z.boolean(), autoPresentedAt: z.boolean(), printReceipt: z.boolean(),
  suggestLeave: z.boolean(), createLeaveOnApproval: z.boolean(),
  leaveType: z.string().trim().min(2).max(100),
});

export function assertCertificateReason(reason: { dependentPolicy: string; restrictedRoleIds: string[] }, roleId: string | null, dependentId: string) {
  if (roleId && reason.restrictedRoleIds.includes(roleId)) throw new SstValidationError("Este motivo não permite atestados para o cargo selecionado.");
  if (reason.dependentPolicy === "REQUIRED" && !dependentId) throw new SstValidationError("Informe o dependente para este motivo.");
  if (reason.dependentPolicy === "DISABLED" && dependentId) throw new SstValidationError("Este motivo não permite dependente.");
}

// Intersect with real planned shifts; union overlapping certificates before summing.
export function absenceMinutes(shifts: { start: Date; end: Date }[], certificates: { start: Date; end: Date }[]) {
  const union = (intervals: { start: Date; end: Date }[]) => {
    const sorted = intervals.map(({ start, end }) => [start.getTime(), end.getTime()]).filter(([start, end]) => Number.isFinite(start) && Number.isFinite(end) && end > start).sort((a, b) => a[0] - b[0]);
    const result: number[][] = [];
    for (const interval of sorted) {
      const last = result.at(-1);
      if (last && interval[0] <= last[1]) last[1] = Math.max(last[1], interval[1]);
      else result.push([...interval]);
    }
    return result;
  };
  const planned = union(shifts);
  const absent = union(certificates);
  const plannedMinutes = planned.reduce((sum, [start, end]) => sum + (end - start) / 60_000, 0);
  const absentMinutes = planned.reduce((sum, [start, end]) => sum + absent.reduce((total, [a, b]) => total + Math.max(0, Math.min(end, b) - Math.max(start, a)) / 60_000, 0), 0);
  return { plannedMinutes, absentMinutes, index: plannedMinutes ? absentMinutes / plannedMinutes * 100 : null };
}
