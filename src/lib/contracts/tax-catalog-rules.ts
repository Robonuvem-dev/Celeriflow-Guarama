import type { JsonValue } from "@/db/json";

/** Independent service input/receipt contracts; no generated ORM types. */
export type ItbiDeclarationInput = {
  transactionTypeId: string; realEstateId: string; processId: string; registryOffice: string; transmittedFractionPercent: number;
  declaredPropertyValue: number; sellerTaxpayerId: string; buyers: { taxpayerId: string; sharePercent: number }[];
  responsibleTaxpayerId?: string; responsibilityType?: "SOLIDARIO" | "SUBSIDIARIO"; isLeasehold?: boolean; leaseholdDetails?: string;
  cadastralUpdateMode: "MANUAL" | "AUTO_ON_APPROVAL" | "AUTO_ON_PAYMENT";
  debtorTaxpayerId?: string; dueDate?: string; valuationRuleId?: string;
  sellers?: { taxpayerId: string; sharePercent: number }[];
  forms?: { catalogId: string; values: Record<string, unknown>; documentIds: string[] }[];
};
export type TaxCatalogIntegrationRecord = {
  id: string; integrationCode: string; eventType: string; idempotencyKey: string;
  protocol: string | null; externalReference: string | null; status: string; evidenceLevel: string;
  payload: JsonValue; result: JsonValue | null; taxpayerId: string | null; economicRegistrationId: string | null;
  receivedAt: Date; processedAt: Date | null; createdAt: Date; updatedAt: Date;
};
