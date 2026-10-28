import type { JsonValue } from "@/db/json";
import type { Decimal } from "@/db/decimal";
import type { TaxpayerDetails } from "./registry";
import type { CemeteryRecord, CemeteryDeceasedRecord, CemeteryGraveRecord, CemeteryChapelRecord, CemeteryCauseRecord, CemeteryFuneralHomeRecord, CemeteryProcessRecord } from "./cemeteries";
import type { CemeteryFeeEvent } from "./cemeteries-fees";

export type StructureRecord = Record<string, unknown> & { id: string };
export type CemeteryFieldRecord = { id: string; cemeteryId: string; targetType: string; fieldKey: string; label: string; valueType: string; required: boolean; active: boolean; createdAt: Date; updatedAt: Date };
export type CemeteryHistoryRecord = { id: string; targetType: string; targetId: string; fieldName: string; previousValue: JsonValue | null; newValue: JsonValue | null; actorUsuarioId: string; createdAt: Date };
export type WorkflowProcess = CemeteryProcessRecord & { deceased: CemeteryDeceasedRecord; cemetery: CemeteryRecord | null; grave: CemeteryGraveRecord | null; chapel: CemeteryChapelRecord | null };
export type WorkflowProcessDetail = Omit<WorkflowProcess, "deceased"> & { deceased: CemeteryDeceasedRecord & { cause: CemeteryCauseRecord | null; funeralHome: CemeteryFuneralHomeRecord | null } };
export type WorkflowDeceased = CemeteryDeceasedRecord & { cause: CemeteryCauseRecord | null; funeralHome: CemeteryFuneralHomeRecord | null; grave: (CemeteryGraveRecord & { cemetery: CemeteryRecord }) | null };
export type CemeteryOssuaryRecord = { id: string; cemeteryId: string; code: string; address: string; ownerTaxpayerId: string | null; capacity: number; occupantCount: number; active: boolean; createdAt: Date; updatedAt: Date };
export type CemeteryMovementRecord = { id: string; deceasedId: string | null; graveId: string; fromGraveId: string | null; toGraveId: string | null; toOssuaryId: string | null; movementType: string; destinationType: string | null; destinationDescription: string | null; movementDate: Date; feeAssessmentId: string | null; notes: string | null; createdByUsuarioId: string; createdAt: Date };
export type CemeteryTransferPage = {
  rows: (CemeteryMovementRecord & { deceased: CemeteryDeceasedRecord | null; grave: CemeteryGraveRecord; toOssuary: CemeteryOssuaryRecord | null })[]; total: number; page: number;
  graves: (CemeteryGraveRecord & { cemetery: CemeteryRecord })[]; operators: { id: string; nome: string }[];
};
export type CemeteryPrintedGuide = {
  id: string; guideNumber: string | null; status: string; dueDate: Date; totalValue: number; totalValueDecimal: Decimal | null;
  payments: { amountPaid: number; amountPaidDecimal: Decimal | null }[];
  assessment: { assessmentNumber: string | null; tax: { name: string }; taxpayer: TaxpayerDetails };
};
export type CemeteryGuideDetail = { event: CemeteryFeeEvent | null; guide: CemeteryPrintedGuide | null };
