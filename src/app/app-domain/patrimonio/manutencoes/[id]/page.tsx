import { notFound, redirect } from "next/navigation";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { assetOperationWhere } from "@/lib/patrimonio/asset-operations";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { assets, assetMaintenances } from "@/db/schema/assets";
export default async function AssetMaintenanceOrigin({ params }: { params: Promise<{ id: string }> }) {
  const context = await getTenantContextForModule("PATRIMONIO"), { id } = await params;
  const scope = assetOperationWhere(context);
  const [maintenance] = await db.select({ assetId: assetMaintenances.assetId }).from(assetMaintenances).innerJoin(assets, eq(assets.id, assetMaintenances.assetId))
    .where(and(eq(assetMaintenances.id, id), scope.departmentId ? eq(assets.departmentId, scope.departmentId) : undefined)).limit(1);
  if (!maintenance) notFound();
  redirect(`/patrimonio/bens/${encodeURIComponent(maintenance.assetId)}`);
}
