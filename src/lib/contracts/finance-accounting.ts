import type { Decimal } from "@/db/decimal";
import type { JsonValue } from "@/db/json";

export type AccountingTransactionRecord = {
  id: string; governmentEntityId: string | null; budgetUnitId: string | null; financialYearId: string; date: Date; history: string; status: string;
  sourceModule: string; sourceType: string; sourceId: string | null; eventType: string; idempotencyKey: string | null; authorUsuarioId: string; authorEmployeeId: string | null;
  postedAt: Date | null; reversalOfId: string | null; createdAt: Date; updatedAt: Date;
};
export type AccountingEntryRecord = {
  id: string; date: Date; value: number; valueDecimal: Decimal | null; classificationSnapshot: JsonValue | null; type: string; history: string; accountId: string; authorId: string; transactionId: string | null; createdAt: Date; updatedAt: Date;
};
export type AccountingRuleRecord = { id: string; eventId: string; debitAccountId: string; creditAccountId: string; description: string | null; isActive: boolean; isReference: boolean; createdAt: Date; updatedAt: Date };
export type AccountingComponentRecord = { id: string; ruleId: string; sequence: number; debitAccountId: string; creditAccountId: string; valueBasis: string; creditFromOriginBank: boolean };
export type FinancialAuditRecord = { id: string; action: string; entityType: string; entityId: string; financialYearId: string | null; budgetUnitId: string | null; payload: JsonValue | null; authorUsuarioId: string; authorEmployeeId: string | null; createdAt: Date };
