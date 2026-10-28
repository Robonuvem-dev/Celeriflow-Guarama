import type { JsonValue } from "@/db/json";
import type { Decimal } from "@/db/decimal";
import type { TaxpayerDetails } from "./registry";
import type { EconomicRegistrationRow, LicenseRow, AssessmentRow } from "./taxation-pages";
import type { TaxRegistryEntryRecord } from "./taxation-registry";

export type EconomicRegistrationRecord = EconomicRegistrationRow;
export type EconomicRegistrationDetails = EconomicRegistrationRecord & { taxpayer: TaxpayerDetails };
export type EconomicRegistrationChange = { municipalInsc?: string; primaryCnae?: string | null; taxRegime?: string | null; status?: string };
export type EconomicRegistrationCreate = Pick<EconomicRegistrationRecord, "municipalInsc" | "primaryCnae" | "taxRegime" | "taxpayerId" | "status" | "startDate">;
export type EconomicRegistryRecord = TaxRegistryEntryRecord;
export type EconomicRegistryInput = Pick<EconomicRegistryRecord, "entityType" | "entityId" | "category" | "title" | "data"> & Partial<Pick<EconomicRegistryRecord, "version" | "source" | "status" | "effectiveFrom" | "actorUsuarioId" | "processId" | "documentId">>;
export type EconomicAuditInput = { action: string; entityType: string; entityId: string; authorUsuarioId: string; authorEmployeeId?: string | null; payload: JsonValue };
export type EconomicLicenseRecord = LicenseRow;
export type EconomicLicenseCreate = Pick<EconomicLicenseRecord, "licenseType" | "taxpayerId" | "economicRegistrationId" | "issueDate" | "validUntil" | "qrCode" | "status">;
export type EconomicAssessmentRecord = AssessmentRow & { guides: { payments: { amountPaidDecimal: Decimal | null }[] }[] };
export type EconomicDebtRecord = { id: string; governmentEntityId: string | null; budgetUnitId: string | null; assessment: { calculationSnapshot: JsonValue | null } | null };
export type EconomicOriginRecord = { governmentEntity: { name: string }; budgetUnit: { code: string } };
export type EconomicDocumentVersion = { id: string; documentId: string; versionNumber: number; fileUrl: string; hashSha256: string; status: string; lockedAt: Date | null; finalizedAt: Date; publicValidationCode: string | null; createdAt: Date };
export type EconomicSignatureEvidence = {
  id: string; documentVersionId: string; documentSignatureId: string; certificateId: string; documentHash: string; canonicalPayload: string; signatureBase64: string; algorithm: string;
  certificateSubject: string; certificateIssuer: string; certificateSerial: string; certificateFingerprint: string; certificatePemSnapshot: string;
  intermediatePemsSnapshot: JsonValue; trustedRootPemSnapshot: string; signedAt: Date; validationStatus: string; createdByUsuarioId: string; createdAt: Date;
};
