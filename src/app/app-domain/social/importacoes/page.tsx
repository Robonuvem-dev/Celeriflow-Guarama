import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { resolveSocialAccess } from "@/lib/social/access-policy";
import { socialWorkflowScope } from "@/db/repositories/social/workflow-queries";
import { socialImportBatches, socialImportRows } from "@/db/schema/social-workflows";
import { socialAccessibleUnitOptions } from "@/db/repositories/social/queries";
import { SocialImportClient } from "./SocialImportClient";
import { socialImportLayouts } from "@/db/schema/social-operation-models";
export default async function SocialImportsPage({ searchParams }: { searchParams: Promise<{ batch?: string }> }) {
  const context = await getTenantContextForModule("SOCIAL"), access = await resolveSocialAccess(context), database = context.database ?? db, query = await searchParams;
  const batches = await database.select().from(socialImportBatches).where(socialWorkflowScope(access, socialImportBatches.unitId)).orderBy(desc(socialImportBatches.createdAt));
  const selected = batches.find(b => b.id === query.batch);
  const rows = selected ? await database.select().from(socialImportRows).where(and(eq(socialImportRows.batchId, selected.id))).orderBy(socialImportRows.line) : [];
  const layouts=await database.select().from(socialImportLayouts).where(eq(socialImportLayouts.isActive,true));
  return <SocialImportClient units={await socialAccessibleUnitOptions(database, access)} layouts={layouts.map(l=>({id:l.id,name:l.name,version:l.version,configuration:l.configuration}))} batches={batches.map(b => ({ id: b.id, filename: b.filename, status: b.status, accepted: b.accepted, rejected: b.rejected, layout: b.layout }))} selected={selected?.id || ""} rows={rows.map(r => r.payload)} administrator={access.administrator} />;
}
