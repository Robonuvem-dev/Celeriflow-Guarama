import { sql } from "drizzle-orm";
import type { DatabaseExecutor } from "../../src/db/transaction";
import { queryRows } from "./cross-domain-database";

export type CatalogEntry = { id: string; kind: string; code: string; name: string; parentCode: string | null; degree: number; canonicalId: string; attributes: unknown };
export type CatalogVersion = { id: string; year: number; label: string; sourceHash: string; status: string; entries: CatalogEntry[] } & Record<string, unknown>;

export function readPlanningCatalogs(db: DatabaseExecutor, ids: string[]): Promise<CatalogVersion[]> {
  return queryRows<CatalogVersion>(db, sql`SELECT v.*, COALESCE((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id) FROM "PlanningCatalogEntry" e WHERE e."versionId"=v.id),'[]'::jsonb) AS entries FROM "PlanningCatalogVersion" v WHERE v.id=ANY(${sql.param(ids)}::text[]) ORDER BY v.id`);
}
