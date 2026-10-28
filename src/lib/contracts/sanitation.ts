import type Decimal from "decimal.js";

export type ConsumerUnit = {
  id: string; code: string; address: string; streetAddress: string | null; neighborhood: string | null; postalCode: string | null;
  category: string; status: string; ownerName: string | null; ownerDocument: string | null; createdAt: Date; updatedAt: Date;
};

export type ConsumerUnitInput = {
  address: string; streetAddress: string; neighborhood: string; postalCode: string;
  category: string; ownerName: string; ownerDocument?: string; status?: string;
};

export type SanitationReading = {
  id: string; competence: string; previousValue: number; currentValue: number; consumption: number; readingDate: Date;
  readerName: string | null; status: string; unitId: string; meterId: string | null; createdAt: Date; updatedAt: Date;
};

export type SanitationServiceOrder = {
  id: string; orderNumber: string; orderType: string; description: string; priority: string; status: string;
  technician: string | null; unitId: string | null; createdAt: Date; updatedAt: Date;
};

export type LegacyWaterReading = {
  id: string; codigoMatricula: string; nomeConsumidor: string; endereco: string; numeroHidrometro: string;
  leituraAnterior: number; leituraAtual: number; consumoM3: number; valorFatura: Decimal; tipoTarifa: string;
  dataLeitura: Date; statusFatura: string; linhaDigitavel: string | null; qrCodePix: string | null; createdAt: Date;
};

export type ConsumerUnitListItem = Pick<ConsumerUnit, "id" | "code" | "address" | "streetAddress" | "neighborhood" | "postalCode" | "category" | "status" | "ownerName">;
export type SanitationReadingListItem = SanitationReading & { unit: { code: string } };
export type SanitationOrderListItem = SanitationServiceOrder & { unit: { code: string } | null };
export type SanitationInvoiceListItem = { id: string; invoiceNumber: string; competence: string; totalAmount: number; dueDate: Date; status: string; unit: { code: string } };
export type WaterQualityListItem = { id: string; collectionPoint: string; collectedAt: Date; parameter: string; result: string; limit: string; compliance: string; active: boolean };
export type SanitationRequestListItem = { id: string; requestType: string; requesterName: string; requestedAt: Date; source: string; status: string; active: boolean };
export type SanitationReportListItem = { id: string; name: string; type: string; period: string; format: string; active: boolean };
