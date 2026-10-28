import type { JsonValue } from "@/db/json";

export type TaxAnnualBatchRecord = {
  id: string; governmentEntityId: string; budgetUnitId: string; financialYearId: string; taxId: string; parameterId: string; year: number; competence: Date;
  targetType: string; actorUsuarioId: string; idempotencyKey: string; requestHash: string; ruleSnapshot: JsonValue; status: string; reason: string;
  scheduledAt: Date | null; queuedAt: Date | null; completedAt: Date | null; createdAt: Date; updatedAt: Date;
};

export type AnnualComparisonPosition = {
  launched: string; net: string; discount: string; paid: string; outstanding: string;
  assessments: number; guides: number; pendingDecimal: number;
};

export type AnnualValueChange = { difference: string; percentage: string | null };
