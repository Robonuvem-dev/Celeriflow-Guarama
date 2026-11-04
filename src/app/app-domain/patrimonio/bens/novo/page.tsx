import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { AssetReceiptForm } from "./AssetReceiptForm";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { assetCategories } from "@/db/schema/assets";
import { assets } from "@/db/schema/assets";
import { assetOperationWhere } from "@/lib/patrimonio/asset-operations";
import { and } from "drizzle-orm";
import { departments as departmentTable } from "@/db/schema/administration";

export default async function NovoBemPatrimonialPage({ searchParams }: { searchParams: Promise<{ clone?: string }> }) {
  const context = await getTenantContextForModule("PATRIMONIO");
  const { clone } = await searchParams;
  const scope = assetOperationWhere(context);
  const source = clone ? (await db.select().from(assets).where(and(eq(assets.id, clone), scope.departmentId ? eq(assets.departmentId, scope.departmentId) : undefined)).limit(1))[0] : undefined;
  const [categories, departments] = await Promise.all([
    db.select({ id: assetCategories.id, name: assetCategories.name }).from(assetCategories).where(eq(assetCategories.isActive, true)).orderBy(asc(assetCategories.name)),
    db.select({ id: departmentTable.id, name: departmentTable.name }).from(departmentTable).where(eq(departmentTable.isActive, true)).orderBy(asc(departmentTable.name)),
  ]);

  return <AssetReceiptForm categories={categories} departments={departments} initial={source ? { name: source.name, categoryId: source.categoryId, departmentId: source.departmentId || "" } : undefined} />;
}
