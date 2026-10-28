import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import TerritorialBaseClient from "./TerritorialBaseClient";
import { db } from "@/db/client";
import { listFiscalEntries } from "@/db/repositories/taxation-pages/registry";

export const dynamic = "force-dynamic";

export default async function TerritorialBasePage() {
  const context = await getTenantContextForModule("TRIBUTACAO");
  const entries = await listFiscalEntries(context.database ?? db, { entityType: "TERRITORIAL_BASE", categories: ["SETOR", "FACE", "FAIXA"], order: "territorial" });
  return <TerritorialBaseClient entries={entries.map((entry) => ({ id: entry.id, code: entry.entityId, recordType: entry.category, data: entry.data, version: entry.version, effectiveFrom: entry.effectiveFrom.toISOString(), status: entry.status }))} />;
}
