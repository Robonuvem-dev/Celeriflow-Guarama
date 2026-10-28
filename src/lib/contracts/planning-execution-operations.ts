import { z } from "zod";
import type { JsonObject, JsonValue } from "@/db/json";
import type { DatabaseExecutor } from "@/db/transaction";

export type ReadExecutor = Pick<DatabaseExecutor, "select" | "execute">;
export type RclReference = { budgetUnitId: string; resourceSourceId: string; revenueNature: { id: string } | null };

export function planningOperationObject(value: JsonValue): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export const rolloverFiscalDefinition = z.object({
  revenueCodes: z.array(z.string()), expenseCodes: z.array(z.string()),
  excludedRevenueCodes: z.array(z.string()), excludedExpenseCodes: z.array(z.string()),
}).passthrough();
export const rolloverQuotaCalculation = z.object({ weights: z.array(z.string()).optional(), initialPlanned: z.string().optional() }).passthrough();
export const legislativeTransitionDate = z.object({ date: z.string() }).passthrough();
