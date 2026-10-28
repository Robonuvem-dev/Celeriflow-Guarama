import type { Decimal } from "@/db/decimal";
import type { JsonValue } from "@/db/json";
import type { TaxpayerDetails } from "./registry";

export type FiscalEntry = {
  id: string; entityType: string; entityId: string; category: string; title: string;
  data: JsonValue; status: string; source: string; effectiveFrom: Date;
  effectiveUntil: Date | null; processId: string | null; documentId: string | null;
  actorUsuarioId: string | null; reviewedByUsuarioId: string | null; reviewedAt: Date | null;
  version: number; createdAt: Date; updatedAt: Date;
};
export type EconomicRegistrationRow = {
  id: string; municipalInsc: string; primaryCnae: string | null; taxRegime: string | null;
  status: string; startDate: Date | null; taxpayerId: string; createdAt: Date; updatedAt: Date;
};
export type LicenseRow = {
  id: string; licenseType: string; status: string; issueDate: Date | null;
  validUntil: Date | null; qrCode: string | null; taxpayerId: string;
  economicRegistrationId: string | null; createdAt: Date; updatedAt: Date;
};
export type CertificateRow = {
  id: string; certificateType: string; authCode: string; validUntil: Date; status: string;
  taxpayerId: string; documentId: string | null; createdAt: Date; updatedAt: Date;
};
export type ActiveDebtRow = {
  id: string; originDebtType: string; year: number; originalValue: number;
  originalValueDecimal: Decimal | null; updatedValue: number; updatedValueDecimal: Decimal | null;
  cdaNumber: string | null; sourceKey: string | null; status: string; taxpayerId: string;
  assessmentId: string | null; bankTransactionId: string | null; integrationEventId: string | null;
  collectionReference: string | null; createdAt: Date; updatedAt: Date;
  budgetUnitId: string | null; governmentEntityId: string | null;
};
export type LicenseDetails = LicenseRow & { taxpayer: TaxpayerDetails };
export type CertificateDetails = CertificateRow & { taxpayer: TaxpayerDetails };
export type ActiveDebtDetails = ActiveDebtRow & { taxpayer: TaxpayerDetails };
export type EconomicRegistrationDetails = EconomicRegistrationRow & { taxpayer: TaxpayerDetails };
export type FiscalPlanningUnit = {
  budgetUnitId: string; governmentEntityId: string;
  governmentEntity: { id: string; code: string; name: string; type: string; cnpj: string | null; companyId: string | null; parentId: string | null; status: string; createdAt: Date; updatedAt: Date };
  budgetUnit: { id: string; code: string; name: string; secretariatId: string; createdAt: Date; updatedAt: Date };
};
export type ItbiTypeRow = { id: string; code: string; name: string; rate: Decimal; damStage: string; cadastralUpdateMode: string; requiresDebtClearance: boolean; isActive: boolean; legalBasis: string | null; createdAt: Date; updatedAt: Date };
export type ItbiDeclarationRow = {
  id: string; declarationNumber: string; status: string; transactionTypeId: string; realEstateId: string;
  processId: string | null; protocolNumber: string | null; registryOffice: string | null; transmissionScope: string;
  transmittedFraction: Decimal; declaredPropertyValue: Decimal; taxableBase: Decimal; appliedRate: Decimal; taxAmount: Decimal;
  calculationSnapshot: JsonValue; blockingTaxDebt: Decimal; nonTaxDebtAmount: Decimal; isLeasehold: boolean;
  leaseholdDetails: string | null; cadastralUpdateMode: string; cadastralUpdatedAt: Date | null;
  assessmentId: string | null; guideId: string | null; documentId: string | null; analysisNotes: string | null;
  analyzedAt: Date | null; createdByUsuarioId: string; createdAt: Date; updatedAt: Date;
};
export type TaxIntegrationRow = { id: string; integrationCode: string; eventType: string; idempotencyKey: string; protocol: string | null; externalReference: string | null; status: string; evidenceLevel: string; payload: JsonValue; result: JsonValue | null; taxpayerId: string | null; economicRegistrationId: string | null; receivedAt: Date; processedAt: Date | null; createdAt: Date; updatedAt: Date };
export type TaxRow = { id: string; name: string; taxType: string; isActive: boolean; code: string | null; governmentLevel: string | null; revenueNature: string | null; effectiveFrom: Date | null; effectiveUntil: Date | null; description: string | null; createdAt: Date; updatedAt: Date };
export type AssessmentRow = { id: string; year: number; originalValue: number; originalValueDecimal: Decimal | null; assessmentNumber: string | null; competence: Date | null; taxableBaseDecimal: Decimal | null; rate: Decimal | null; discountValueDecimal: Decimal | null; interestValueDecimal: Decimal | null; penaltyValueDecimal: Decimal | null; correctionValueDecimal: Decimal | null; finalValueDecimal: Decimal | null; calculationSnapshot: JsonValue | null; status: string; taxId: string; taxpayerId: string; realEstateId: string | null; economicRegistrationId: string | null; createdAt: Date; updatedAt: Date };
export type GuideRow = { id: string; barcode: string | null; totalValue: number; totalValueDecimal: Decimal | null; guideNumber: string | null; calculationSnapshot: JsonValue | null; documentId: string | null; dueDate: Date; status: string; assessmentId: string; createdAt: Date; updatedAt: Date };
export type PaymentRow = { id: string; amountPaid: number; amountPaidDecimal: Decimal | null; status: string; idempotencyKey: string | null; sourceModule: string; sourceType: string; sourceId: string | null; eventType: string; proofDocumentId: string | null; paymentDate: Date; clearanceDate: Date; paymentMethod: string; guideId: string; bankAccountId: string | null; createdAt: Date; updatedAt: Date };
export type AssessmentDetails = AssessmentRow & { tax: TaxRow; taxpayer: TaxpayerDetails; guides: (GuideRow & { payments: PaymentRow[] })[] };
export type GuideDetails = GuideRow & { assessment: AssessmentRow & { tax: TaxRow; taxpayer: TaxpayerDetails }; payments: PaymentRow[] };
export type BenefitRuleRow = { id: string; code: string; name: string; benefitType: string; legalReference: string; eligibility: JsonValue; calculation: JsonValue; effectiveFrom: Date; effectiveUntil: Date | null; active: boolean; createdByUsuarioId: string; createdAt: Date; updatedAt: Date };
export type ServiceActivityRow = { id: string; taxId: string; code: string; name: string; issRate: Decimal | null; isActive: boolean; createdAt: Date; updatedAt: Date };
export type TaxParameterRow = { id: string; taxId: string; code: string; name: string; calculationType: string; configuration: JsonValue; effectiveFrom: Date; effectiveUntil: Date | null; isActive: boolean; createdAt: Date; updatedAt: Date };
export type PropertyValuationRow = { id: string; realEstateId: string; year: number; landUnitValue: Decimal | null; constructionUnitValue: Decimal | null; venalValueDecimal: Decimal; source: string; notes: string | null; createdAt: Date; updatedAt: Date };
