import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { AssetReceiptForm } from "./AssetReceiptForm";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { assetCategories } from "@/db/schema/assets";
import { departments as departmentTable } from "@/db/schema/administration";

export default async function NovoBemPatrimonialPage() {
  await getTenantContextForModule("PATRIMONIO");
  const [categories, departments] = await Promise.all([
    db.select({ id: assetCategories.id, name: assetCategories.name }).from(assetCategories).where(eq(assetCategories.isActive, true)).orderBy(asc(assetCategories.name)),
    db.select({ id: departmentTable.id, name: departmentTable.name }).from(departmentTable).where(eq(departmentTable.isActive, true)).orderBy(asc(departmentTable.name)),
  ]);

  return <AssetReceiptForm categories={categories} departments={departments} />;
}
