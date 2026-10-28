import type { Decimal } from "@/db/decimal";
import type { JsonValue } from "@/db/json";

export type CemeteryFeeVersion = {
  id: string; ruleId: string; scopeKey: string; cemeteryId: string | null; eventType: string; version: number;
  label: string; formula: string; baseAmount: Decimal; dueDays: number; taxId: string;
  validFrom: Date; validUntil: Date | null; legalBasis: string; publishedBy: string; createdAt: Date;
};
export type CemeteryFeeEvent = {
  id: string; eventKey: string; eventType: string; sourceType: string; sourceId: string;
  cemeteryId: string | null; taxpayerId: string | null; occurredAt: Date; quantity: Decimal;
  ruleVersionId: string | null; calculationSnapshot: JsonValue | null; amount: Decimal | null;
  dueDate: Date | null; assessmentId: string | null; guideId: string | null; status: string; lastError: string | null;
};
export type CemeteryEventGuide = {
  id: string; guideNumber: string | null; status: string; dueDate: Date; totalValueDecimal: Decimal | null;
  assessment: { assessmentNumber: string | null; taxpayer: { person: { fullName: string } | null; company: { corporateName: string } | null } };
};
