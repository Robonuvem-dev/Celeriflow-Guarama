import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import { secretariats } from "@/db/schema/administration";
import { catalogItems } from "@/db/schema/master-data";
import { financialYears } from "@/db/schema/finance-years";
import { procurementAppropriations, procurementUnits, procurementExpenseNatures, procurementResourceSources } from "@/db/schema/procurement-budget";
import { purchaseProcesses, purchaseProcessItems } from "@/db/schema/procurement-core";
import { purchaseRequests, purchaseRequestItems, purchaseRequestBudgetAllocations, purchaseProcessItemOrigins, purchaseProcessRequestOrigins, purchaseReceiptItems, purchaseReceipts } from "@/db/schema/procurement-requests";
import type { RequestBudgetAllocation } from "./purchase-requests";

type Row<T extends { $inferSelect: unknown }> = T["$inferSelect"];
type PurchaseProcessListEntry = Row<typeof purchaseProcesses> & {
  secretariat: Row<typeof secretariats>; _count: { items: number; requestOrigins: number; preliminaryStudies: number; termsOfReference: number };
};
type PurchaseProcessForEdit = Row<typeof purchaseProcesses> & {
  items: (Row<typeof purchaseProcessItems> & {
    requestItemOrigins: Row<typeof purchaseProcessItemOrigins>[];
    receiptItems: { itemId: string; quantity: number; purchaseReceipt: { status: string } }[];
  })[];
};
type PurchaseProcessDetail = Row<typeof purchaseProcesses> & {
  secretariat: Row<typeof secretariats>;
  requestOrigins: (Row<typeof purchaseProcessRequestOrigins> & { purchaseRequest: Pick<Row<typeof purchaseRequests>, "id" | "number" | "object" | "estimatedValue"> })[];
  items: (Row<typeof purchaseProcessItems> & {
    catalogItem: Row<typeof catalogItems> | null;
    requestItemOrigins: (Row<typeof purchaseProcessItemOrigins> & {
      purchaseRequestItem: Row<typeof purchaseRequestItems> & { purchaseRequest: Pick<Row<typeof purchaseRequests>, "id" | "number">; budgetAllocations: RequestBudgetAllocation[] };
    })[];
  })[];
};
type UnprocessedPurchaseRequest = Row<typeof purchaseRequests> & {
  secretariat: Pick<Row<typeof secretariats>, "acronym" | "name">; _count: { items: number };
  items: (Row<typeof purchaseRequestItems> & { catalogItem: Pick<Row<typeof catalogItems>, "code" | "name" | "unit"> | null })[];
};

export async function listActiveProcessCatalog(db: DatabaseExecutor): Promise<Row<typeof catalogItems>[]> {
  return db.select().from(catalogItems).where(eq(catalogItems.isActive, true)).orderBy(asc(catalogItems.name));
}

export async function listPurchaseProcesses(db: DatabaseExecutor): Promise<PurchaseProcessListEntry[]> {
  const rows = await db.select({ process: purchaseProcesses, secretariat: secretariats,
    items: sql<number>`(SELECT count(*)::integer FROM "PurchaseProcessItem" i WHERE i."purchaseProcessId" = ${purchaseProcesses.id})`,
    origins: sql<number>`(SELECT count(*)::integer FROM "PurchaseProcessRequestOrigin" o WHERE o."purchaseProcessId" = ${purchaseProcesses.id})`,
    studies: sql<number>`(SELECT count(*)::integer FROM "PreliminaryTechnicalStudy" s WHERE s."processId" = ${purchaseProcesses.id})`,
    terms: sql<number>`(SELECT count(*)::integer FROM "TermOfReference" t WHERE t."processId" = ${purchaseProcesses.id})`,
  }).from(purchaseProcesses).innerJoin(secretariats, eq(secretariats.id, purchaseProcesses.secretariatId)).orderBy(desc(purchaseProcesses.createdAt));
  return rows.map(row => ({ ...row.process, secretariat: row.secretariat, _count: { items: row.items, requestOrigins: row.origins, preliminaryStudies: row.studies, termsOfReference: row.terms } }));
}

export async function loadPurchaseProcessForEdit(db: DatabaseExecutor, id: string): Promise<PurchaseProcessForEdit | null> {
  const [process] = await db.select().from(purchaseProcesses).where(eq(purchaseProcesses.id, id)).limit(1);
  if (!process) return null;
  const [items, origins, receipts] = await Promise.all([
    db.select().from(purchaseProcessItems).where(eq(purchaseProcessItems.purchaseProcessId, id)),
    db.select({ origin: purchaseProcessItemOrigins }).from(purchaseProcessItemOrigins).innerJoin(purchaseProcessItems, eq(purchaseProcessItems.id, purchaseProcessItemOrigins.purchaseProcessItemId)).where(eq(purchaseProcessItems.purchaseProcessId, id)),
    db.select({ itemId: purchaseReceiptItems.purchaseProcessItemId, quantity: purchaseReceiptItems.quantity, purchaseReceipt: { status: purchaseReceipts.status } }).from(purchaseReceiptItems).innerJoin(purchaseReceipts, eq(purchaseReceipts.id, purchaseReceiptItems.purchaseReceiptId)).where(eq(purchaseReceipts.purchaseProcessId, id)),
  ]);
  return { ...process, items: items.map(item => ({ ...item, requestItemOrigins: origins.filter(row => row.origin.purchaseProcessItemId === item.id).map(row => row.origin), receiptItems: receipts.filter(row => row.itemId === item.id) })) };
}

export async function loadPurchaseProcessDetail(db: DatabaseExecutor, id: string): Promise<PurchaseProcessDetail | null> {
  const [process] = await db.select({ process: purchaseProcesses, secretariat: secretariats }).from(purchaseProcesses).innerJoin(secretariats, eq(secretariats.id, purchaseProcesses.secretariatId)).where(eq(purchaseProcesses.id, id)).limit(1);
  if (!process) return null;
  const [items, requestOrigins, origins, allocations] = await Promise.all([
    db.select({ item: purchaseProcessItems, catalogItem: catalogItems }).from(purchaseProcessItems).leftJoin(catalogItems, eq(catalogItems.id, purchaseProcessItems.catalogItemId)).where(eq(purchaseProcessItems.purchaseProcessId, id)),
    db.select({ origin: purchaseProcessRequestOrigins, purchaseRequest: { id: purchaseRequests.id, number: purchaseRequests.number, object: purchaseRequests.object, estimatedValue: purchaseRequests.estimatedValue } }).from(purchaseProcessRequestOrigins).innerJoin(purchaseRequests, eq(purchaseRequests.id, purchaseProcessRequestOrigins.purchaseRequestId)).where(eq(purchaseProcessRequestOrigins.purchaseProcessId, id)),
    db.select({ origin: purchaseProcessItemOrigins, requestItem: purchaseRequestItems, purchaseRequest: { id: purchaseRequests.id, number: purchaseRequests.number } }).from(purchaseProcessItemOrigins)
      .innerJoin(purchaseProcessItems, eq(purchaseProcessItems.id, purchaseProcessItemOrigins.purchaseProcessItemId)).innerJoin(purchaseRequestItems, eq(purchaseRequestItems.id, purchaseProcessItemOrigins.purchaseRequestItemId))
      .innerJoin(purchaseRequests, eq(purchaseRequests.id, purchaseRequestItems.purchaseRequestId)).where(eq(purchaseProcessItems.purchaseProcessId, id)),
    db.select({ allocation: purchaseRequestBudgetAllocations, appropriation: procurementAppropriations, budgetUnit: procurementUnits, expenseNature: procurementExpenseNatures, resourceSource: procurementResourceSources, financialYear: financialYears }).from(purchaseRequestBudgetAllocations)
      .innerJoin(procurementAppropriations, eq(procurementAppropriations.id, purchaseRequestBudgetAllocations.budgetAppropriationId))
      .innerJoin(procurementUnits, eq(procurementUnits.id, procurementAppropriations.budgetUnitId)).innerJoin(procurementExpenseNatures, eq(procurementExpenseNatures.id, procurementAppropriations.expenseNatureId))
      .innerJoin(procurementResourceSources, eq(procurementResourceSources.id, procurementAppropriations.resourceSourceId)).innerJoin(financialYears, eq(financialYears.id, procurementAppropriations.financialYearId))
      .where(sql`EXISTS (SELECT 1 FROM "PurchaseProcessItemOrigin" o JOIN "PurchaseProcessItem" i ON i.id = o."purchaseProcessItemId" WHERE o."purchaseRequestItemId" = ${purchaseRequestBudgetAllocations.purchaseRequestItemId} AND i."purchaseProcessId" = ${id})`),
  ]);
  return { ...process.process, secretariat: process.secretariat,
    requestOrigins: requestOrigins.map(row => ({ ...row.origin, purchaseRequest: row.purchaseRequest })),
    items: items.map(row => ({ ...row.item, catalogItem: row.catalogItem, requestItemOrigins: origins.filter(origin => origin.origin.purchaseProcessItemId === row.item.id).map(origin => ({ ...origin.origin, purchaseRequestItem: { ...origin.requestItem, purchaseRequest: origin.purchaseRequest,
      budgetAllocations: allocations.filter(allocation => allocation.allocation.purchaseRequestItemId === origin.requestItem.id).map(allocation => ({ ...allocation.allocation, budgetAppropriation: { ...allocation.appropriation, budgetUnit: allocation.budgetUnit, expenseNature: allocation.expenseNature, resourceSource: allocation.resourceSource, financialYear: allocation.financialYear } })),
    } })) })),
  };
}

export async function listUnprocessedApprovedRequests(db: DatabaseExecutor): Promise<UnprocessedPurchaseRequest[]> {
  const requests = await db.select({ request: purchaseRequests, secretariat: { acronym: secretariats.acronym, name: secretariats.name } }).from(purchaseRequests).innerJoin(secretariats, eq(secretariats.id, purchaseRequests.secretariatId))
    .where(and(eq(purchaseRequests.status, "Aprovada"), sql`NOT EXISTS (SELECT 1 FROM "PurchaseProcess" p WHERE p."purchaseRequestId" = ${purchaseRequests.id})`, sql`NOT EXISTS (SELECT 1 FROM "PurchaseProcessRequestOrigin" o WHERE o."purchaseRequestId" = ${purchaseRequests.id})`)).orderBy(desc(purchaseRequests.approvedAt));
  const items = requests.length ? await db.select({ item: purchaseRequestItems, catalogItem: { code: catalogItems.code, name: catalogItems.name, unit: catalogItems.unit } }).from(purchaseRequestItems).leftJoin(catalogItems, eq(catalogItems.id, purchaseRequestItems.catalogItemId)).where(inArray(purchaseRequestItems.purchaseRequestId, requests.map(row => row.request.id))) : [];
  return requests.map(row => { const lines = items.filter(item => item.item.purchaseRequestId === row.request.id); return { ...row.request, secretariat: row.secretariat, _count: { items: lines.length }, items: lines.map(item => ({ ...item.item, catalogItem: item.catalogItem })) }; });
}
