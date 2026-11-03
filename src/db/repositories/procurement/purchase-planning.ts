import { planningObjectives } from "@/db/schema/planning-legal";
import { procurementAppropriations } from "@/db/schema/procurement-budget";
import { asc, desc, eq, inArray } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import { catalogItems } from "@/db/schema/master-data";
import { purchasePlannings, purchaseRequests, purchaseRequestItems, purchaseRequestBudgetAllocations } from "@/db/schema/procurement-requests";

type Row<T extends { $inferSelect: unknown }> = T["$inferSelect"];
type PlanningCatalogItem = Pick<Row<typeof catalogItems>, "code" | "name" | "unit">;
type PlanningRequest = Pick<Row<typeof purchaseRequests>, "id" | "number" | "object" | "status">;
type PurchasePlanningEntry = Row<typeof purchasePlannings> & { catalogItem: PlanningCatalogItem | null; originPurchaseRequest: PlanningRequest | null };
type PurchasePlanningOptions = { catalogItems: (PlanningCatalogItem & { id: string })[]; purchaseRequests: PlanningRequest[]; objectives: Awaited<ReturnType<typeof listPcaObjectives>> };

export async function listPurchasePlannings(db: DatabaseExecutor, id?: string): Promise<PurchasePlanningEntry[]> {
  const rows = await db.select({ planning: purchasePlannings, catalogItem: { code: catalogItems.code, name: catalogItems.name, unit: catalogItems.unit }, originPurchaseRequest: { id: purchaseRequests.id, number: purchaseRequests.number, object: purchaseRequests.object, status: purchaseRequests.status } })
    .from(purchasePlannings).leftJoin(catalogItems, eq(catalogItems.id, purchasePlannings.catalogItemId)).leftJoin(purchaseRequests, eq(purchaseRequests.id, purchasePlannings.originPurchaseRequestId))
    .where(id ? eq(purchasePlannings.id, id) : undefined).orderBy(asc(purchasePlannings.expectedPeriodStart), desc(purchasePlannings.createdAt));
  return rows.map(row => ({ ...row.planning, catalogItem: row.catalogItem, originPurchaseRequest: row.originPurchaseRequest }));
}

export async function loadPurchasePlanningOptions(db: DatabaseExecutor): Promise<PurchasePlanningOptions> {
  const [catalog, requests, objectives] = await Promise.all([
    db.select({ id: catalogItems.id, code: catalogItems.code, name: catalogItems.name, unit: catalogItems.unit }).from(catalogItems).where(eq(catalogItems.isActive, true)).orderBy(asc(catalogItems.name)),
    db.select({ id: purchaseRequests.id, number: purchaseRequests.number, object: purchaseRequests.object, status: purchaseRequests.status }).from(purchaseRequests).orderBy(desc(purchaseRequests.createdAt)),
    listPcaObjectives(db),
  ]);
  return { catalogItems: catalog, purchaseRequests: requests, objectives };
}

export function listPlanningForPurchaseRequest(db: DatabaseExecutor, requestId: string) {
  return db.select({
    id: purchasePlannings.id,
    description: purchasePlannings.description,
    catalogName: catalogItems.name,
    status: purchasePlannings.status,
  }).from(purchasePlannings)
    .leftJoin(catalogItems, eq(catalogItems.id, purchasePlannings.catalogItemId))
    .where(eq(purchasePlannings.originPurchaseRequestId, requestId))
    .orderBy(asc(purchasePlannings.expectedPeriodStart), asc(purchasePlannings.id));
}

export function listPlanningOriginBudget(db: DatabaseExecutor, requestIds: string[]) {
  if (requestIds.length === 0) return Promise.resolve([]);
  return db.select({
    requestId: purchaseRequestItems.purchaseRequestId,
    itemId: purchaseRequestItems.id,
    quantity: purchaseRequestItems.quantity,
    estimatedUnitValue: purchaseRequestItems.estimatedUnitValue,
    allocationId: purchaseRequestBudgetAllocations.id,
    appropriationId: purchaseRequestBudgetAllocations.budgetAppropriationId,
    code: procurementAppropriations.code,
    allocatedQuantity: purchaseRequestBudgetAllocations.quantity,
    allocatedValue: purchaseRequestBudgetAllocations.valueDecimal,
  }).from(purchaseRequestItems)
    .leftJoin(purchaseRequestBudgetAllocations, eq(purchaseRequestBudgetAllocations.purchaseRequestItemId, purchaseRequestItems.id))
    .leftJoin(procurementAppropriations, eq(procurementAppropriations.id, purchaseRequestBudgetAllocations.budgetAppropriationId))
    .where(inArray(purchaseRequestItems.purchaseRequestId, requestIds));
}

export function listPcaObjectives(db: DatabaseExecutor) {
  return db.select({ id: planningObjectives.id, code: planningObjectives.code, description: planningObjectives.description })
    .from(planningObjectives).orderBy(asc(planningObjectives.code), asc(planningObjectives.description));
}
