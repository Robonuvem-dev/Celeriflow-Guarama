import { and, eq, sql } from "drizzle-orm";
import type { DatabaseExecutor } from "../../transaction";
import { materials, materialCategories, materialSubcategories } from "../../schema/assets-stock";

/** Counts every legacy relation used by catalog editing/deletion. */
export async function materialCatalogUsage(db: DatabaseExecutor, id: string) {
  const [material] = await db.select({ id: materials.id, type: materials.type, unitOfMeasure: materials.unitOfMeasure }).from(materials).where(eq(materials.id, id)).limit(1);
  if (!material) return null;
  const result = await db.execute<{ stocks: number; movements: number; requests: number; purchaseRequestItems: number; purchaseProcessItems: number; receiptItems: number; obrasServiceMaterials: number }>(sql`SELECT
    (SELECT count(*)::int FROM "MaterialStock" WHERE "materialId"=${id}) AS stocks,
    (SELECT count(*)::int FROM "MaterialMovement" WHERE "materialId"=${id}) AS movements,
    (SELECT count(*)::int FROM "MaterialRequestItem" WHERE "materialId"=${id}) AS requests,
    (SELECT count(*)::int FROM "PurchaseRequestItem" WHERE "materialId"=${id}) AS "purchaseRequestItems",
    (SELECT count(*)::int FROM "PurchaseProcessItem" WHERE "materialId"=${id}) AS "purchaseProcessItems",
    (SELECT count(*)::int FROM "PurchaseReceiptItem" WHERE "materialId"=${id}) AS "receiptItems",
    (SELECT count(*)::int FROM "ObrasServicoMaterial" WHERE "materialId"=${id}) AS "obrasServiceMaterials"`);
  const receiptItems = (await db.execute<{ quantity: number; quantityIncorporated: number }>(sql`SELECT quantity, "quantityIncorporated" FROM "PurchaseReceiptItem" WHERE "materialId"=${id}`)).rows;
  return { ...material, _count: result.rows[0], receiptItems };
}

export async function activeMaterialCategory(db: DatabaseExecutor, id: string) {
  const [category] = await db.select({ id: materialCategories.id }).from(materialCategories).where(and(eq(materialCategories.id, id), eq(materialCategories.isActive, true))).limit(1);
  return category;
}

export async function activeMaterialSubcategory(db: DatabaseExecutor, id: string, categoryId: string) {
  return (await db.select({ id: materialSubcategories.id }).from(materialSubcategories).where(and(eq(materialSubcategories.id, id), eq(materialSubcategories.categoryId, categoryId), eq(materialSubcategories.isActive, true))).limit(1)).length > 0;
}
