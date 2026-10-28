import type { Decimal } from "@/db/decimal";
import type { JsonValue } from "@/db/json";

export type MunicipalFiscalIndexDefinitionRecord = {
  id: string; financialYearId: string; code: string; revision: number; legalReference: string; minimumPercentage: Decimal;
  effectiveFrom: Date; definition: JsonValue; reason: string; actorId: string; createdAt: Date;
};
export type FiscalAccountingTransaction = {
  id: string; financialYearId: string; governmentEntityId: string | null; budgetUnitId: string | null;
  date: Date; status: string; sourceType: string; sourceId: string | null; reversalOfId: string | null;
};
export type FiscalAccountingEntry = {
  id: string; accountId: string; transactionId: string | null; type: string; valueDecimal: Decimal | null; transaction: FiscalAccountingTransaction;
};
