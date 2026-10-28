import type { Decimal } from "@/db/decimal";
import type { JsonValue } from "@/db/json";

/** Complete persisted declaration scalar contract, shared by access and channel readers. */
export interface ItbiDeclarationRecord {
  id: string;
  declarationNumber: string;
  status: string;
  transactionTypeId: string;
  realEstateId: string;
  processId: string | null;
  protocolNumber: string | null;
  registryOffice: string | null;
  transmissionScope: string;
  transmittedFraction: Decimal;
  declaredPropertyValue: Decimal;
  taxableBase: Decimal;
  appliedRate: Decimal;
  taxAmount: Decimal;
  calculationSnapshot: JsonValue;
  blockingTaxDebt: Decimal;
  nonTaxDebtAmount: Decimal;
  isLeasehold: boolean;
  leaseholdDetails: string | null;
  cadastralUpdateMode: string;
  cadastralUpdatedAt: Date | null;
  assessmentId: string | null;
  guideId: string | null;
  documentId: string | null;
  analysisNotes: string | null;
  analyzedAt: Date | null;
  createdByUsuarioId: string;
  createdAt: Date;
  updatedAt: Date;
}
