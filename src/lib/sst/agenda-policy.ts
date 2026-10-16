import { z } from "zod";

const interval = { startsAt: z.coerce.date(), endsAt: z.coerce.date() };
export const boardInput = z.object({
  budgetUnitId: z.string().min(1), name: z.string().trim().min(2).max(160), ...interval,
  members: z.array(z.object({ personId: z.string().min(1), council: z.string().trim().min(2).max(100) })).min(1).max(30),
}).superRefine((input, ctx) => {
  if (input.endsAt < input.startsAt) ctx.addIssue({ code: "custom", path: ["endsAt"], message: "Vigência inválida." });
  if (new Set(input.members.map((member) => member.personId)).size !== input.members.length) ctx.addIssue({ code: "custom", path: ["members"], message: "Um profissional não pode aparecer duas vezes na junta." });
});
export const availabilityInput = z.object({
  budgetUnitId: z.string().min(1), professionalPersonId: z.string().min(1), unitName: z.string().trim().min(2).max(160),
  ...interval, slotMinutes: z.coerce.number().int().min(5).max(240),
}).refine((input) => input.endsAt > input.startsAt && input.endsAt.getTime() - input.startsAt.getTime() >= input.slotMinutes * 60000 && input.endsAt.getTime() - input.startsAt.getTime() <= 31 * 86400000, "Informe uma disponibilidade de até 31 dias que comporte ao menos um atendimento.");
export function availableSlots(window: { startsAt: Date; endsAt: Date; slotMinutes: number }, occupied: { startsAt: Date; endsAt: Date }[]) {
  const slots: { startsAt: Date; endsAt: Date }[] = [];
  if (!Number.isFinite(window.startsAt.getTime()) || !Number.isFinite(window.endsAt.getTime()) || !Number.isInteger(window.slotMinutes) || window.slotMinutes < 5 || window.slotMinutes > 240 || window.endsAt.getTime() - window.startsAt.getTime() > 31 * 86400000) throw new RangeError("Disponibilidade inválida.");
  for (let start = window.startsAt.getTime(); start + window.slotMinutes * 60000 <= window.endsAt.getTime(); start += window.slotMinutes * 60000) {
    const end = start + window.slotMinutes * 60000;
    if (!occupied.some((item) => item.startsAt.getTime() < end && item.endsAt.getTime() > start)) slots.push({ startsAt: new Date(start), endsAt: new Date(end) });
    if (slots.length > 2000) break;
  }
  return slots;
}
