import type { Decimal } from "@/db/decimal";

export type ExportProcess = {
  id: string; number: string; object: string; type: string; modality: string | null; estimatedValue: number | null; updatedAt: Date;
  items: { id: string; customName: string | null; quantity: number; estimatedUnitValue: number | null; catalogItem: { name: string; unit: string } | null; material: { name: string; unitOfMeasure: string } | null }[];
};
export type BiddingExportRecord = {
  id: string; number: string; modality: string; status: string; publicationDate: Date | null; sessionDate: Date | null; updatedAt: Date;
  process: ExportProcess;
  biddingLots: {
    id: string; number: number; description: string | null; status: string; estimatedValueDecimal: Decimal | null;
    results: { id: string; status: string; totalValueDecimal: Decimal; unitValueDecimal: Decimal | null; decidedAt: Date; participant: { id: string; displayCode: string | null; supplierId: string } }[];
  }[];
};
export type ContractExportRecord = {
  id: string; number: string; object: string; status: string; initialValue: number; updatedValue: number;
  startDate: Date; endDate: Date; updatedAt: Date; supplierId: string;
  sourceBudgetUnit: { code: string; name: string } | null;
  process: { id: string; number: string; object: string; modality: string | null };
  amendments: { id: string; type: string; status: string; newValue: number | null; newEndDate: Date | null; createdAt: Date }[];
};
export type PendingPriceResearchInvitation = {
  id: string;
  supplier: { person: { fullName: string } | null; company: { tradeName: string | null; corporateName: string } | null };
  research: { process: { number: string } };
};
export type ProcurementNotificationRecipient = {
  id: string;
  perfil: { codigo: string; permissoes: string; ativo: boolean; nome: string };
  permissoesModulo: { modulo: { codigo: string }; canView: boolean; canEdit: boolean }[];
};
