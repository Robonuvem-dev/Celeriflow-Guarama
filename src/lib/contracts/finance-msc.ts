import type { Decimal } from "@/db/decimal";
import type { JsonValue } from "@/db/json";

export type MscLedgerEntry = {
  id: string;
  type: string;
  valueDecimal: Decimal | null;
  classificationSnapshot: JsonValue | null;
  transaction: { date: Date; eventType: string; governmentEntityId: string | null; budgetUnitId: string | null };
};

export type MscArchiveAudit = {
  period: string; institutionCode: string; csvHash: string; evidenceHash: string;
  sourceEntryCount: number; outputRows: number; governmentEntityIds: string[]; budgetUnitIds: string[];
  referenceHash: string; transmissionStatus: "NOT_TRANSMITTED";
};
