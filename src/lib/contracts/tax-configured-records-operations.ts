import type { JsonValue } from "@/db/json";
import type { TaxRegistryEntryRecord } from "./taxation-registry";

/** Complete public return, including nullable provenance and typed timestamps. */
export type ConfiguredFiscalEntry = TaxRegistryEntryRecord;
export type ConfiguredFiscalSubject = "REAL_ESTATE" | "ECONOMIC_REGISTRATION" | "ITBI_DECLARATION";
export type ConfiguredFiscalEntryInput = Pick<ConfiguredFiscalEntry, "entityType" | "entityId" | "category" | "title" | "version" | "status" | "actorUsuarioId" | "data">
  & Partial<Pick<ConfiguredFiscalEntry, "processId" | "documentId">>;
export type ConfiguredFiscalAuditInput = {
  action: string; entityType: string; entityId: string; authorUsuarioId: string; authorEmployeeId?: string | null; payload: JsonValue;
};
