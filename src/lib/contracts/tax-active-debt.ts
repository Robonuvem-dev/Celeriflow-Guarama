import type { Decimal } from "@/db/decimal";
import type { JsonValue } from "@/db/json";

export type ActiveDebtActor = { usuarioId: string; employeeId?: string | null; allowedBudgetUnitIds?: string[] };
export type ActiveDebtRecord = {
  id: string; originDebtType: string; year: number; originalValue: number; originalValueDecimal: Decimal | null; updatedValue: number; updatedValueDecimal: Decimal | null;
  cdaNumber: string | null; sourceKey: string | null; status: string; taxpayerId: string; assessmentId: string | null; bankTransactionId: string | null; integrationEventId: string | null; collectionReference: string | null;
  budgetUnitId: string | null; governmentEntityId: string | null; createdAt: Date; updatedAt: Date;
};
export type DebtNoticeDebt = { assessmentId: string; assessmentNumber: string; tax: string; year: number; total: string; paid: string; compensated: string; balance: string; dueDate: string | null; guideId: string | null; guideNumber: string | null; barcode: string | null; bankRegistered: boolean; guideAmount: string | null };
export type DebtNoticeTarget = { key: string; taxpayerId: string; taxpayer: string; document: string; propertyId: string | null; registrationId: string | null; inscription: string; address: string; balance: string; debts: DebtNoticeDebt[] };
export type DeclarantDebtPosition = { checkedAt: string; hasDebt: boolean; total: string; assessmentCount: number; activeDebtCount: number; assessments: { id: string; assessmentNumber: string | null; status: string; balance: string }[]; activeDebts: { id: string; cdaNumber: string | null; status: string; balance: string }[] };
export type ActiveDebtEventRecord = { id: string; activeDebtId: string; eventType: string; description: string; payload: JsonValue | null; actorUsuarioId: string | null; createdAt: Date };
