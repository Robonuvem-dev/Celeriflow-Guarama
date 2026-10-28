import { asc, desc, eq } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import { catalogItems } from "@/db/schema/master-data";
import { purchasePlannings, purchaseRequests } from "@/db/schema/procurement-requests";

type Row<T extends { $inferSelect: unknown }> = T["$inferSelect"];
type PlanningCatalogItem = Pick<Row<typeof catalogItems>, "code" | "name" | "unit">;
type PlanningRequest = Pick<Row<typeof purchaseRequests>, "id" | "number" | "object" | "status">;
type PurchasePlanningEntry = Row<typeof purchasePlannings> & { catalogItem: PlanningCatalogItem | null; originPurchaseRequest: PlanningRequest | null };
type PurchasePlanningOptions = { catalogItems: (PlanningCatalogItem & { id: string })[]; purchaseRequests: PlanningRequest[] };

export async function listPurchasePlannings(db: DatabaseExecutor, id?: string): Promise<PurchasePlanningEntry[]> {
  const rows = await db.select({ planning: purchasePlannings, catalogItem: { code: catalogItems.code, name: catalogItems.name, unit: catalogItems.unit }, originPurchaseRequest: { id: purchaseRequests.id, number: purchaseRequests.number, object: purchaseRequests.object, status: purchaseRequests.status } })
    .from(purchasePlannings).leftJoin(catalogItems, eq(catalogItems.id, purchasePlannings.catalogItemId)).leftJoin(purchaseRequests, eq(purchaseRequests.id, purchasePlannings.originPurchaseRequestId))
    .where(id ? eq(purchasePlannings.id, id) : undefined).orderBy(asc(purchasePlannings.expectedPeriodStart), desc(purchasePlannings.createdAt));
  return rows.map(row => ({ ...row.planning, catalogItem: row.catalogItem, originPurchaseRequest: row.originPurchaseRequest }));
}

export async function loadPurchasePlanningOptions(db: DatabaseExecutor): Promise<PurchasePlanningOptions> {
  const [catalog, requests] = await Promise.all([
    db.select({ id: catalogItems.id, code: catalogItems.code, name: catalogItems.name, unit: catalogItems.unit }).from(catalogItems).where(eq(catalogItems.isActive, true)).orderBy(asc(catalogItems.name)),
    db.select({ id: purchaseRequests.id, number: purchaseRequests.number, object: purchaseRequests.object, status: purchaseRequests.status }).from(purchaseRequests).orderBy(desc(purchaseRequests.createdAt)),
  ]);
  return { catalogItems: catalog, purchaseRequests: requests };
}
