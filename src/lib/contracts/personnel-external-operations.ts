import type { Database } from '@/db/connection';
import type { Decimal } from '@/db/decimal';
import type { JsonValue } from '@/db/json';
import type { PermissionUser } from './identity';

export type ExternalOperationsContext = { user: PermissionUser; database?: Database };
export type ExternalPayrollMovement = {
  id: string; contractId: string; sourceKey: string; rubricCode: string; startsAt: Date; endsAt: Date | null;
  amount: Decimal; reference: string | null; notes: string; actorId: string; createdAt: Date;
};
export type ExternalConnection = {
  id: string; code: string; name: string; category: string; provider: string; environment: string; status: string;
  baseUrl: string | null; credentialReference: string | null; configuration: JsonValue | null; mockScenario: JsonValue | null;
  lastTestedAt: Date | null; lastTestStatus: string | null; lastTestMessage: string | null; createdAt: Date; updatedAt: Date;
};
export type ExternalConnectionWrite = Pick<ExternalConnection, 'name' | 'category' | 'provider' | 'environment' | 'status' | 'baseUrl' | 'credentialReference'> & { configuration: JsonValue };
export type ExternalReadiness = { environment: string; configured: boolean; transmissionAvailable: boolean; status: string; issues: string[] };
export type PayrollMovementImportResult = { lines: number; created: number; reused: number; mode: 'PREVIA' | 'APLICAR'; hash: string };
export type PartnerDiscountPolicy = {
  origin: 'DESCONTOS_CONVENENTES'; budgetUnitId: string; actorUserIds: string[]; supplierId: string;
  contractIds: string[]; sourceRunId: string; consignmentRuleId: string; rubricCode: string; payrollIds: string[]; instructions: string;
};
export type PartnerDiscountGrant = { id: string; name: string; policy: PartnerDiscountPolicy; contracts: Array<{ id: string; label: string }> };
export type PartnerDiscountAgreement = {
  id: string; sourceKey: string; contractId: string; supplierId: string; sourceRunId: string; scope: string;
  number: string; rubricCode: string; snapshot: JsonValue; actorId: string; createdAt: Date;
  installments: Array<{ id: string; agreementId: string; sequence: number; competenceAt: Date; amount: Decimal; entries: Array<{ kind: string }> }>;
};
