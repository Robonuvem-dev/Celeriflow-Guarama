import type { JsonValue } from "@/db/json";
import type { TaxpayerDetails } from "./registry";

type Timestamps = { id: string; createdAt: Date; updatedAt: Date };
export type CemeteryRecord = Timestamps & { code: string; name: string; address: string | null; phone: string | null; wakePlace: string | null; observations: string | null; active: boolean };
export type CemeteryGraveRecord = Timestamps & { cemeteryId: string; sectorId: string | null; lotId: string | null; code: string; graveType: string; capacity: number; occupantCount: number; status: string; active: boolean; ownerTaxpayerId: string | null; additionalData: JsonValue; notes: string | null };
export type CemeteryFuneralHomeRecord = { id: string; name: string; cnpj: string | null; phone: string | null; ownershipType: string; active: boolean; createdAt: Date };
export type CemeteryCauseRecord = { id: string; code: string; description: string; createdAt: Date };
export type CemeteryChapelRecord = Timestamps & { cemeteryId: string; name: string; address: string | null; personTaxpayerId: string | null; responsibleTaxpayerId: string; active: boolean };
export type CemeteryDeceasedRecord = Timestamps & {
  fullName: string; birthDate: Date | null; deathDate: Date; deathTime: string | null; gender: string | null; document: string | null; maritalStatus: string | null; fatherName: string | null; motherName: string | null; address: string | null;
  cemeteryId: string; graveId: string | null; funeralHomeId: string | null; funeralHomeName: string | null; causeId: string | null; causeText: string | null; doctorName: string; doctorCrm: string; groups: JsonValue; status: string; taxpayerId: string | null; deceasedTaxpayerId: string | null; declarantTaxpayerId: string | null; unidentified: boolean; createdByUsuarioId: string;
};
export type CemeteryProcessRecord = Timestamps & {
  receiptCode: string; processType: string; status: string; burialType: string | null; deceasedId: string; cemeteryId: string | null; graveId: string | null; chapelId: string | null; funeralHomeId: string | null; declarantTaxpayerId: string; declarantDebtSnapshot: JsonValue; scheduledAt: Date; performedAt: Date | null; notes: string | null; createdByUsuarioId: string;
};
export type CemeteryBurialReportRow = CemeteryProcessRecord & { deceased: CemeteryDeceasedRecord & { cause: CemeteryCauseRecord | null }; cemetery: CemeteryRecord | null; grave: CemeteryGraveRecord | null; funeralHome: CemeteryFuneralHomeRecord | null };
export type CemeteryProcessListRow = CemeteryBurialReportRow & { chapel: CemeteryChapelRecord | null; declarant: TaxpayerDetails | null };
export type CemeteryProcessPage = { items: CemeteryProcessListRow[]; total: number; page: number; pageSize: number };
export type CemeteryLookupPage = { items: { id: string; label: string }[]; total: number; page: number; pageSize: number };
