import type { JsonValue } from "@/db/json";
import type { RealEstateRecord } from "@/lib/contracts/registry";
import type { TaxRegistryEntryRecord } from "@/lib/contracts/taxation-registry";
import type { AssessmentRow } from "@/lib/contracts/taxation-pages";

export type PropertyRecord = RealEstateRecord;
export type PropertyCreateInput = Partial<PropertyRecord>;
export type PropertyMutation = Partial<PropertyRecord>;
export type PropertyRegistryRecord = TaxRegistryEntryRecord;
export type PropertyAssessmentRecord = AssessmentRow;
export type PropertyRegistryInput = Pick<PropertyRegistryRecord, "entityType" | "entityId" | "category" | "title" | "data"> & Partial<Pick<PropertyRegistryRecord, "status" | "source" | "effectiveFrom" | "effectiveUntil" | "processId" | "documentId" | "actorUsuarioId" | "version">>;
export type PropertyAuditInput = { action: string; entityType: string; entityId: string; authorUsuarioId: string; authorEmployeeId?: string | null; payload: JsonValue };
export type PropertyStructure = { land: { id: string; inscription: string }; totalUnitBuiltArea: string | null; units: { id: string; inscription: string; builtArea: number | null; mode: string }[] };
