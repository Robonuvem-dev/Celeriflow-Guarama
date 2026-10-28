import type { JsonValue } from "@/db/json";

export type PlanningCatalogEntry = { id: string; versionId: string; kind: string; code: string; name: string; parentCode: string | null; degree: number; canonicalId: string; attributes: JsonValue };
export type PlanningCatalogVersion = { id: string; year: number; label: string; normativeReference: string; sourceHash: string; status: string; createdById: string; createdAt: Date };
export type CatalogVersionWithCount = PlanningCatalogVersion & { _count: { entries: number } };
export type CatalogEntryWithVersion = PlanningCatalogEntry & { version: PlanningCatalogVersion };
