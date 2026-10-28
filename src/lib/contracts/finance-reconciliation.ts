import type { Decimal } from "@/db/decimal";
import type { JsonValue } from "@/db/json";
import type { ImportedBankStatementItem } from "./finance-banking";

export type ReconciliationBankAccount = {
  id: string; bankName: string; agency: string; bankId: string | null; bankBranchId: string | null;
  accountNumber: string; accountType: string; currentBalance: number; currentBalanceDecimal: Decimal | null;
  resourceSourceId: string | null; budgetUnitId: string | null; accountingPlanId: string | null;
  isActive: boolean; externalId: string | null; purpose: string | null; linkedInvestmentAccountId: string | null;
  createdAt: Date; updatedAt: Date;
};
export type BankReconciliationSession = {
  id: string; bankAccountId: string | null; banco: string; agencia: string; contaNumero: string; periodo: string;
  dataInicio: Date; dataFim: Date; saldoInicialDecimal: Decimal; totalDebitosDecimal: Decimal;
  totalCreditosDecimal: Decimal; saldoFinalDecimal: Decimal; saldoRazaoDecimal: Decimal; diferencaDecimal: Decimal;
  status: string; totalItensBanco: number; totalItensContabeis: number; itensConciliados: number; itensDivergentes: number;
  confirmadoPor: string | null; confirmadoEm: Date | null; reciboIntegracao: string | null; createdAt: Date; updatedAt: Date;
};
export type ReconciliationAllocation = {
  id: string; groupId: string; statementItemId: string; treasuryMovementId: string; amountDecimal: Decimal; createdAt: Date;
};
export type ReconciliationAllocationGroup = {
  id: string; sessionId: string; bankAccountId: string; idempotencyKey: string; request: JsonValue; reason: string;
  status: string; authorUsuarioId: string; reversedByUsuarioId: string | null; reversalReason: string | null;
  reversedAt: Date | null; createdAt: Date;
};
export type ReconciliationTreasuryMovement = {
  id: string; date: Date; type: string; direction: string; valueDecimal: Decimal; history: string | null; status: string;
  bankAccountId: string; resourceSourceId: string | null; financialYearId: string; revenueId: string | null;
  sourceModule: string; sourceType: string; sourceId: string | null; eventType: string; idempotencyKey: string | null; createdAt: Date;
};
export type ReconciliationStatementOrigin = ImportedBankStatementItem & { reconciliationAllocations: ReconciliationAllocation[] };
export type ReconciliationTreasuryOrigin = ReconciliationTreasuryMovement & {
  statementItems: ImportedBankStatementItem[]; reconciliationAllocations: ReconciliationAllocation[];
};
