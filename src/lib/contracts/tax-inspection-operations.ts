export type InspectionOperationsActor = { usuarioId: string; employeeId: string | null; budgetUnitId?: string | null; allowedBudgetUnitIds?: string[] };
export type NfseEmissionInput = {
  providerId: string; takerId?: string; economicRegistrationId: string; serviceActivityId: string; competence: string;
  serviceDescription: string; serviceLocation?: string; serviceValue: string | number; manualDeductions?: string | number;
  retained: boolean; creditUsages?: { creditId: string; amount: string | number }[]; source?: string; occasionalRequestId?: string; rpsItemId?: string;
};
export type NfseOccasionalInput = { providerTaxpayerId: string; takerTaxpayerId?: string; serviceActivityId: string; serviceDescription: string; serviceValue: number; deductions: number; paymentRequired: boolean };
export type NfseRpsInput = { batchNumber: string; providerTaxpayerId: string; source: "UPLOAD" | "WEBSERVICE"; items: { rpsNumber: string; payload: unknown }[] };
export type NfseDmsInput = { taxpayerId: string; economicRegistrationId?: string; competence: string; direction: string; channel: string; detailMode: string; noMovement: boolean; rectifiesDeclarationId?: string; serviceValue: number; deductions: number; ownIss: number; retainedIss: number; payload?: unknown };
