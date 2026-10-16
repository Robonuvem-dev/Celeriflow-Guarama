import { z } from "zod";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "Data inválida.");
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const professionalLinkSchema = z.object({
  id: z.string().min(1).optional(),
  employeeId: z.string().min(1), unitId: z.string().min(1),
  jobTitle: z.string().trim().min(2).max(160), specialty: z.string().trim().max(160),
  startsAt: date, endsAt: z.union([z.literal(""), date]),
  isActive: z.boolean(),
  individualScope: z.enum(["OWN", "UNIT", "MUNICIPAL"]), familyScope: z.enum(["OWN", "UNIT", "MUNICIPAL"]),
  workStart: time, workEnd: time, workingDays: z.array(z.number().int().min(0).max(6)).min(1), includeInRma: z.boolean(),
}).refine((value) => !value.endsAt || value.endsAt >= value.startsAt, "Fim do vínculo anterior ao início.")
  .refine((value) => value.workEnd > value.workStart, "Fim do expediente deve ser posterior ao início.");
