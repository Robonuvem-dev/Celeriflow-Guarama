import type { ConstructionAccess } from "./construction";
import type { Decimal } from "@/db/decimal";
import type { JsonValue } from "@/db/json";

/** Page query inputs are domain values, never ORM where/include expressions. */
export type WorksPageAccess = ConstructionAccess;
export type WorksActiveStatus = "active" | "inactive" | "all";
export type WorksSearch = { q: string; status: WorksActiveStatus; page?: string };
export type WorksCaseSearch = { q?: string; category?: string; id?: string };
export type WorksInspectionSearch = { q?: string; status?: string; inspectionTypeId?: string };
export type WorksExportSearch = { q: string; period: string; kind: string; receipt: string };
export type WorksEnforcementSearch = { q: string; status: string; locationType: string; permitStatus: string };
export type WorksEnforcementHistory = Record<string, string>;

/** Full scalar record at the page boundary. Numerics retain exact Decimal
 * values; timestamps/date columns are decoded Dates, never ISO-shaped casts. */
export type WorksCaseRecord = {
  id: string; requestKey: string; processId: string; configurationId: string;
  category: string; locationType: string; regularization: boolean;
  catalogSnapshot: JsonValue; calculationSnapshot: JsonValue;
  existingArea: Decimal; expandedArea: Decimal; irregularArea: Decimal;
  renovationArea: Decimal; demolitionArea: Decimal; totalArea: Decimal;
  assignedEmployeeId: string | null; createdBy: string; createdAt: Date;
  additionalValues: JsonValue; formSnapshot: JsonValue; reviewStatus: string;
  revisionCount: number; firstAnalystId: string | null; correctionDeadline: Date | null;
};
export type WorksConfigurationRecord = {
  id: string; version: number; freeRevisions: number; correctionDays: number;
  checkPropertyDebts: boolean; subjectIds: string[]; areaWeights: JsonValue;
  instructions: string; publishedBy: string; publishedAt: Date;
};
export type WorksCaseListRecord = {
  id: string; category: string; locationType: string; regularization: boolean; totalArea: Decimal;
  process: { protocolNumber: string; status: string; person: { fullName: string } | null;
    company: { corporateName: string } | null; currentDepartment: { name: string } | null };
};
export type WorksCaseDetail = WorksCaseRecord & {
  configuration: WorksConfigurationRecord;
  process: WorksCaseListRecord["process"] & { id: string; description: string | null };
  properties: { id: string; realEstateId: string; cadastralSnapshot: JsonValue }[];
};
