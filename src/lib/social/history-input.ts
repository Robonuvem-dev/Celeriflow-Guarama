import { z } from "zod";

export const socialDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Data inválida.");
export const factSchema = z.object({
  personId: z.string().min(1), unitId: z.string().min(1), catalogId: z.string().min(1),
  kind: z.enum(["VULNERABILITY", "POTENTIALITY"]), identifiedAt: socialDateSchema,
  observations: z.string().trim().max(4000),
});
export const financialEntrySchema = z.object({
  personId: z.string().min(1), unitId: z.string().min(1), catalogId: z.string().min(1),
  kind: z.enum(["INCOME", "EXPENSE"]),
  competence: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  value: z.string().regex(/^\d{1,12}(\.\d{1,2})?$/).refine((value) => Number(value) > 0, "Valor deve ser positivo."),
  employmentDescription: z.string().trim().max(500), observations: z.string().trim().max(4000),
});
