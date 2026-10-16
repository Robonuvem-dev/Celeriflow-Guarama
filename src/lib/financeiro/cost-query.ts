import { z } from "zod";
import { costSourceTypes } from "./cost-types";

const optionalDate = z.preprocess(value => value === "" ? undefined : value, z.iso.date().optional());
export const costReportQuery = z.object({ yearId: z.string().min(1), expenseFrom: optionalDate, expenseUntil: optionalDate, appropriationFrom: optionalDate, appropriationUntil: optionalDate, sourceType: z.preprocess(value => value === "" ? undefined : value, z.enum(costSourceTypes).optional()), itemId: z.preprocess(value => value === "" ? undefined : value, z.string().min(1).optional()), movementId: z.string().min(1).optional(), format: z.enum(["PDF", "CSV"]).default("PDF") }).refine(input => !input.expenseFrom || !input.expenseUntil || input.expenseFrom <= input.expenseUntil, { message: "Período da despesa invertido." }).refine(input => !input.appropriationFrom || !input.appropriationUntil || input.appropriationFrom <= input.appropriationUntil, { message: "Período da apropriação invertido." });

export function municipalCostFilters(input: z.infer<typeof costReportQuery>) {
  return { expenseFrom: input.expenseFrom ? new Date(`${input.expenseFrom}T00:00:00Z`) : undefined, expenseUntil: input.expenseUntil ? new Date(`${input.expenseUntil}T23:59:59.999Z`) : undefined, appropriationFrom: input.appropriationFrom ? new Date(`${input.appropriationFrom}T00:00:00Z`) : undefined, appropriationUntil: input.appropriationUntil ? new Date(`${input.appropriationUntil}T23:59:59.999Z`) : undefined, sourceType: input.sourceType, itemId: input.itemId };
}
