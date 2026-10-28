import type { Decimal } from "@/db/decimal";
import type { JsonValue } from "@/db/json";
import type { RealEstateRecord } from "./registry";

export type TaxRegistryEntryRecord = {
  id: string; entityType: string; entityId: string; category: string; title: string; data: JsonValue;
  status: string; source: string; effectiveFrom: Date; effectiveUntil: Date | null; processId: string | null;
  documentId: string | null; actorUsuarioId: string | null; reviewedByUsuarioId: string | null;
  reviewedAt: Date | null; version: number; createdAt: Date; updatedAt: Date;
};

export type TaxAuditCrossCheckRecord = {
  id: string; cnpjCpfContribuinte: string; razaoSocial: string; origemCruzamento: string;
  valorDeclarado: Decimal; valorApuradoBancos: Decimal; divergenciaImposto: Decimal;
  statusMalha: string; numeroAutoInfracao: string | null; dataCruzamento: Date; createdAt: Date;
};

export type AccountantDirectory = {
  taxpayers: { id: string; person: { fullName: string } | null; company: { corporateName: string } | null }[];
  entries: TaxRegistryEntryRecord[];
};

export type PropertyEditRestrictionInput = { propertyId: string; governmentEntityId: string; budgetUnitId: string; expectedVersion: number; enabled: boolean; reason: string };
export type PropertyEditApprovalInput = { propertyId: string; expectedUpdatedAt: string; operatorId: string; validMinutes: number; reason: string };
export type EffectivePropertyEditRestriction = { id: string; governmentEntityId: string; budgetUnitId: string };
export type PropertyEditControlData = {
  property: RealEstateRecord;
  restriction: TaxRegistryEntryRecord | null;
  approvals: TaxRegistryEntryRecord[];
  units: { budgetUnitId: string; governmentEntityId: string; governmentEntity: { name: string }; budgetUnit: { code: string } }[];
  operators: { id: string; nome: string }[];
  effective: EffectivePropertyEditRestriction[];
};
