import type { Decimal } from "@/db/decimal";
import type { JsonValue } from "@/db/json";
import type { AddressRecord, CompanyRecord, PersonRecord, TaxpayerRecord } from "./registry";

export type TaxInvoiceRecord = { id: string; invoiceNumber: number; verificationCode: string; serviceValue: number; serviceValueDecimal: Decimal | null; deductions: number; deductionsDecimal: Decimal | null; issRetained: boolean; issValue: number; issValueDecimal: Decimal | null; competence: string; status: string; providerId: string; takerId: string | null; createdAt: Date; updatedAt: Date };
export type NfseFiscalRecord = { id: string; invoiceId: string; economicRegistrationId: string; serviceActivityId: string; parameterId: string; serviceDescription: string; serviceLocation: string | null; taxableBaseDecimal: Decimal; rate: Decimal; ownIssDecimal: Decimal; retainedIssDecimal: Decimal; retentionType: string; calculationSnapshot: JsonValue; source: string; authenticityUrl: string; qrPayload: string; replacedInvoiceId: string | null; replacementInvoiceId: string | null; rpsItemId: string | null; occasionalRequestId: string | null; createdAt: Date; updatedAt: Date };
export type NfsePartyRecord = TaxpayerRecord & { person: (PersonRecord & { addresses: AddressRecord[] }) | null; company: (CompanyRecord & { addresses: AddressRecord[] }) | null };
export type NfseDocumentData = { invoice: TaxInvoiceRecord & { provider: NfsePartyRecord; taker: NfsePartyRecord | null }; fiscal: NfseFiscalRecord | null };
export type TaxLicenseRecord = { id: string; licenseType: string; status: string; issueDate: Date | null; validUntil: Date | null; qrCode: string | null; taxpayerId: string; economicRegistrationId: string | null; createdAt: Date; updatedAt: Date };
export type TaxLicenseValidation = { license: TaxLicenseRecord; data: { [key: string]: JsonValue }; signature: { id: string } | null };
export type NfseEventRecord = { id: string; invoiceId: string; eventType: string; description: string; payload: JsonValue | null; actorUsuarioId: string | null; createdAt: Date };
export type NfseCorrectionLetterRecord = { id: string; invoiceId: string; reason: string; changes: JsonValue; status: string; createdByUsuarioId: string; createdAt: Date };
export type NfseDocumentHistory = { events: NfseEventRecord[]; letters: NfseCorrectionLetterRecord[] };
