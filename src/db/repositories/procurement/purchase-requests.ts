import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import { secretariats, departments, employees } from "@/db/schema/administration";
import { catalogItems } from "@/db/schema/master-data";
import { materials } from "@/db/schema/assets-stock";
import { financialYears } from "@/db/schema/finance-years";
import { procurementAppropriations, procurementUnits, procurementExpenseNatures, procurementResourceSources } from "@/db/schema/procurement-budget";
import { purchaseRequests, purchaseRequestItems, purchaseRequestBudgetAllocations, purchaseProcessItemOrigins } from "@/db/schema/procurement-requests";
import { purchaseProcesses, purchaseProcessItems } from "@/db/schema/procurement-core";
import { loadPurchaseRequestsWithAllocations } from "./lifecycle";

type Row<T extends { $inferSelect: unknown }> = T["$inferSelect"];
type RequestCatalogItem = { id: string; materials: Pick<Row<typeof materials>, "id" | "catalogItemId" | "isActive">[] };
type RequestAppropriationOption = Pick<Row<typeof procurementAppropriations>, "id" | "code"> & {
  budgetUnit: Pick<Row<typeof procurementUnits>, "name" | "secretariatId">;
  expenseNature: Pick<Row<typeof procurementExpenseNatures>, "code" | "name">;
  resourceSource: Pick<Row<typeof procurementResourceSources>, "code" | "name">;
  financialYear: Pick<Row<typeof financialYears>, "year">;
};
export type RequestBudgetAllocation = Row<typeof purchaseRequestBudgetAllocations> & {
  budgetAppropriation: Row<typeof procurementAppropriations> & {
    budgetUnit: Row<typeof procurementUnits>; expenseNature: Row<typeof procurementExpenseNatures>;
    resourceSource: Row<typeof procurementResourceSources>; financialYear: Row<typeof financialYears>;
  };
};
type PurchaseRequestFormOptions = {
  catalogItems: Row<typeof catalogItems>[]; secretarias: Row<typeof secretariats>[];
  departments: Pick<Row<typeof departments>, "id" | "name" | "secretariatId">[]; budgetAppropriations: RequestAppropriationOption[];
};
type PurchaseRequestListEntry = Row<typeof purchaseRequests> & {
  secretariat: Row<typeof secretariats>; department: Row<typeof departments>; requester: Row<typeof employees>; _count: { items: number };
};
type PurchaseRequestDetail = Row<typeof purchaseRequests> & {
  secretariat: Row<typeof secretariats> | undefined; department: Row<typeof departments> | undefined; requester: Row<typeof employees> | undefined;
  items: (Row<typeof purchaseRequestItems> & {
    catalogItem: Row<typeof catalogItems> | null; budgetAllocations: RequestBudgetAllocation[];
    processItemOrigins: (Row<typeof purchaseProcessItemOrigins> & { purchaseProcessItem: Row<typeof purchaseProcessItems> & { purchaseProcess: Pick<Row<typeof purchaseProcesses>, "id" | "number" | "status"> } })[];
  })[];
};

export async function loadRequestCatalogItems(db: DatabaseExecutor, ids: string[]): Promise<RequestCatalogItem[]> {
  if (!ids.length) return [];
  const [catalog, linkedMaterials] = await Promise.all([
    db.select({ id: catalogItems.id }).from(catalogItems).where(and(inArray(catalogItems.id, ids), eq(catalogItems.isActive, true))),
    db.select({ id: materials.id, catalogItemId: materials.catalogItemId, isActive: materials.isActive }).from(materials).where(inArray(materials.catalogItemId, ids)),
  ]);
  return catalog.map(item => ({ ...item, materials: linkedMaterials.filter(material => material.catalogItemId === item.id) }));
}

export async function listRequestAppropriations(db: DatabaseExecutor, scope: { allowedBudgetUnitIds?: string[]; ids?: string[]; secretariatId?: string } = {}): Promise<RequestAppropriationOption[]> {
  return db.select({ id: procurementAppropriations.id, code: procurementAppropriations.code,
    budgetUnit: { name: procurementUnits.name, secretariatId: procurementUnits.secretariatId },
    expenseNature: { code: procurementExpenseNatures.code, name: procurementExpenseNatures.name },
    resourceSource: { code: procurementResourceSources.code, name: procurementResourceSources.name }, financialYear: { year: financialYears.year },
  }).from(procurementAppropriations).innerJoin(procurementUnits, eq(procurementUnits.id, procurementAppropriations.budgetUnitId))
    .innerJoin(procurementExpenseNatures, eq(procurementExpenseNatures.id, procurementAppropriations.expenseNatureId))
    .innerJoin(procurementResourceSources, eq(procurementResourceSources.id, procurementAppropriations.resourceSourceId))
    .innerJoin(financialYears, eq(financialYears.id, procurementAppropriations.financialYearId))
    .where(and(scope.allowedBudgetUnitIds ? inArray(procurementAppropriations.budgetUnitId, scope.allowedBudgetUnitIds) : undefined,
      scope.ids ? inArray(procurementAppropriations.id, scope.ids) : undefined,
      scope.secretariatId ? eq(procurementUnits.secretariatId, scope.secretariatId) : undefined)).orderBy(asc(procurementAppropriations.code));
}

export async function loadPurchaseRequestFormOptions(db: DatabaseExecutor, input: { origin: { secretariatId: string; departmentId: string } | null; canSelectAnyOrigin: boolean; allowedBudgetUnitIds?: string[] }): Promise<PurchaseRequestFormOptions> {
  const [catalog, secretarias, selectedDepartments, budgetAppropriations] = await Promise.all([
    db.select().from(catalogItems).where(and(eq(catalogItems.isActive, true), sql`NOT EXISTS (SELECT 1 FROM "Material" m WHERE m."catalogItemId" = ${catalogItems.id} AND m."isActive" = false)`)).orderBy(asc(catalogItems.name)),
    db.select().from(secretariats).where(input.origin ? eq(secretariats.id, input.origin.secretariatId) : input.canSelectAnyOrigin ? undefined : eq(secretariats.id, "__sem-origem-autorizada__")).orderBy(asc(secretariats.name)),
    db.select({ id: departments.id, name: departments.name, secretariatId: departments.secretariatId }).from(departments).where(and(eq(departments.isActive, true), input.origin ? eq(departments.id, input.origin.departmentId) : input.canSelectAnyOrigin ? undefined : eq(departments.id, "__sem-origem-autorizada__"))).orderBy(asc(departments.name)),
    listRequestAppropriations(db, { allowedBudgetUnitIds: input.allowedBudgetUnitIds }),
  ]);
  return { catalogItems: catalog, secretarias, departments: selectedDepartments, budgetAppropriations };
}

export async function listPurchaseRequests(db: DatabaseExecutor): Promise<PurchaseRequestListEntry[]> {
  const rows = await db.select({ request: purchaseRequests, secretariat: secretariats, department: departments, requester: employees,
    itemCount: sql<number>`(SELECT count(*)::integer FROM "PurchaseRequestItem" i WHERE i."purchaseRequestId" = ${purchaseRequests.id})`,
  }).from(purchaseRequests).innerJoin(secretariats, eq(secretariats.id, purchaseRequests.secretariatId)).innerJoin(departments, eq(departments.id, purchaseRequests.departmentId)).innerJoin(employees, eq(employees.id, purchaseRequests.requesterId)).orderBy(desc(purchaseRequests.createdAt));
  return rows.map(row => ({ ...row.request, secretariat: row.secretariat, department: row.department, requester: row.requester, _count: { items: row.itemCount } }));
}

export async function loadPurchaseRequestDetail(db: DatabaseExecutor, id: string): Promise<PurchaseRequestDetail | null> {
  const [request] = await loadPurchaseRequestsWithAllocations(db, [id]);
  if (!request) return null;
  const [[secretariat], [department], [requester], itemCatalog, allocationSources, processOrigins] = await Promise.all([
    db.select().from(secretariats).where(eq(secretariats.id, request.secretariatId)).limit(1),
    db.select().from(departments).where(eq(departments.id, request.departmentId)).limit(1),
    db.select().from(employees).where(eq(employees.id, request.requesterId)).limit(1),
    db.select({ itemId: purchaseRequestItems.id, catalogItem: catalogItems }).from(purchaseRequestItems).leftJoin(catalogItems, eq(catalogItems.id, purchaseRequestItems.catalogItemId)).where(eq(purchaseRequestItems.purchaseRequestId, id)),
    db.select({ allocationId: purchaseRequestBudgetAllocations.id, appropriation: procurementAppropriations, budgetUnit: procurementUnits, expenseNature: procurementExpenseNatures, resourceSource: procurementResourceSources, financialYear: financialYears }).from(purchaseRequestBudgetAllocations)
      .innerJoin(purchaseRequestItems, eq(purchaseRequestItems.id, purchaseRequestBudgetAllocations.purchaseRequestItemId))
      .innerJoin(procurementAppropriations, eq(procurementAppropriations.id, purchaseRequestBudgetAllocations.budgetAppropriationId))
      .innerJoin(procurementUnits, eq(procurementUnits.id, procurementAppropriations.budgetUnitId))
      .innerJoin(procurementExpenseNatures, eq(procurementExpenseNatures.id, procurementAppropriations.expenseNatureId))
      .innerJoin(procurementResourceSources, eq(procurementResourceSources.id, procurementAppropriations.resourceSourceId))
      .innerJoin(financialYears, eq(financialYears.id, procurementAppropriations.financialYearId)).where(eq(purchaseRequestItems.purchaseRequestId, id)),
    db.select({ origin: purchaseProcessItemOrigins, item: purchaseProcessItems, process: { id: purchaseProcesses.id, number: purchaseProcesses.number, status: purchaseProcesses.status } }).from(purchaseProcessItemOrigins)
      .innerJoin(purchaseRequestItems, eq(purchaseRequestItems.id, purchaseProcessItemOrigins.purchaseRequestItemId)).innerJoin(purchaseProcessItems, eq(purchaseProcessItems.id, purchaseProcessItemOrigins.purchaseProcessItemId))
      .innerJoin(purchaseProcesses, eq(purchaseProcesses.id, purchaseProcessItems.purchaseProcessId)).where(eq(purchaseRequestItems.purchaseRequestId, id)),
  ]);
  return { ...request, secretariat, department, requester, items: request.items.map(item => ({ ...item,
    catalogItem: itemCatalog.find(row => row.itemId === item.id)?.catalogItem ?? null,
    budgetAllocations: item.budgetAllocations.map(allocation => { const source = allocationSources.find(row => row.allocationId === allocation.id); if (!source) throw new Error("Dotação da solicitação não encontrada."); return { ...allocation, budgetAppropriation: { ...source.appropriation, budgetUnit: source.budgetUnit, expenseNature: source.expenseNature, resourceSource: source.resourceSource, financialYear: source.financialYear } }; }),
    processItemOrigins: processOrigins.filter(row => row.origin.purchaseRequestItemId === item.id).map(row => ({ ...row.origin, purchaseProcessItem: { ...row.item, purchaseProcess: row.process } })),
  })) };
}
