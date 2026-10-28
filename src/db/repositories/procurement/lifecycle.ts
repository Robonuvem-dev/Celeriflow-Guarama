import { eq, inArray, sql } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import { purchaseRequests, purchaseRequestItems, purchaseRequestBudgetAllocations, purchaseProcessRequestOrigins } from "@/db/schema/procurement-requests";
import { purchaseProcesses } from "@/db/schema/procurement-core";

type Row<T extends { $inferSelect: unknown }> = T["$inferSelect"];
type RequestWithAllocations = Row<typeof purchaseRequests> & {
  items: (Row<typeof purchaseRequestItems> & { budgetAllocations: Row<typeof purchaseRequestBudgetAllocations>[] })[];
};
type MaterialFinancialOrigin = { budgetUnitId: string; valid: boolean | null; userActive: boolean; receiptLinked: boolean; materialLinked: boolean; consumptionNature: boolean };

export async function loadPurchaseRequestsWithAllocations(db: DatabaseExecutor, ids: string[]): Promise<RequestWithAllocations[]> {
  if (!ids.length) return [];
  const requests = await db.select().from(purchaseRequests).where(inArray(purchaseRequests.id, ids));
  const items = await db.select().from(purchaseRequestItems).where(inArray(purchaseRequestItems.purchaseRequestId, ids));
  const allocations = items.length ? await db.select().from(purchaseRequestBudgetAllocations).where(inArray(purchaseRequestBudgetAllocations.purchaseRequestItemId, items.map(item => item.id))) : [];
  return requests.map(request => ({ ...request, items: items.filter(item => item.purchaseRequestId === request.id).map(item => ({ ...item, budgetAllocations: allocations.filter(allocation => allocation.purchaseRequestItemId === item.id) })) }));
}

export async function purchaseRequestsWithinBudgetScope(db: DatabaseExecutor, ids: string[], allowed: string[]): Promise<boolean> {
  if (!ids.length || !allowed.length) return false;
  const rows = await db.execute<{ id: string }>(sql`
    SELECT r.id FROM "PurchaseRequest" r WHERE r.id IN (${sql.join(ids.map(id => sql`${id}`), sql`, `)})
      AND EXISTS (SELECT 1 FROM "PurchaseRequestItem" i WHERE i."purchaseRequestId" = r.id)
      AND NOT EXISTS (
        SELECT 1 FROM "PurchaseRequestItem" i WHERE i."purchaseRequestId" = r.id AND (
          NOT EXISTS (SELECT 1 FROM "PurchaseRequestItemBudgetAllocation" a WHERE a."purchaseRequestItemId" = i.id)
          OR EXISTS (
            SELECT 1 FROM "PurchaseRequestItemBudgetAllocation" a
            JOIN "BudgetAppropriation" b ON b.id = a."budgetAppropriationId"
            JOIN "BudgetUnit" u ON u.id = b."budgetUnitId"
            JOIN "FinancialYear" y ON y.id = b."financialYearId"
            LEFT JOIN "PlanningEntityUnit" e ON e."budgetUnitId" = u.id
            WHERE a."purchaseRequestItemId" = i.id AND (
              b."budgetUnitId" NOT IN (${sql.join(allowed.map(id => sql`${id}`), sql`, `)})
              OR u."secretariatId" IS DISTINCT FROM r."secretariatId"
              OR y."governmentEntityId" IS NULL
              OR e."governmentEntityId" IS DISTINCT FROM y."governmentEntityId"
            )
          )
        )
      )`);
  return rows.rows.length === ids.length;
}

export async function purchaseProcessRequestIds(db: DatabaseExecutor, processId: string): Promise<string[] | null> {
  const [process] = await db.select({ purchaseRequestId: purchaseProcesses.purchaseRequestId }).from(purchaseProcesses).where(eq(purchaseProcesses.id, processId)).limit(1);
  if (!process) return null;
  const origins = await db.select({ purchaseRequestId: purchaseProcessRequestOrigins.purchaseRequestId }).from(purchaseProcessRequestOrigins).where(eq(purchaseProcessRequestOrigins.purchaseProcessId, processId));
  return [...new Set([...(process.purchaseRequestId ? [process.purchaseRequestId] : []), ...origins.map(origin => origin.purchaseRequestId)])];
}

export async function materialRequestFinancialOrigin(db: DatabaseExecutor, input: { settlementId: string; stockId: string; departmentId: string; usuarioId: string }): Promise<MaterialFinancialOrigin | null> {
  const result = await db.execute<MaterialFinancialOrigin>(sql`
    SELECT a."budgetUnitId", (
      s.status = 'Liquidado' AND y."governmentEntityId" IS NOT NULL
      AND cc."governmentEntityId" = y."governmentEntityId"
      AND cc."secretariatId" = u."secretariatId" AND d."secretariatId" = u."secretariatId"
      AND m.type <> 'PATRIMONIO'
    ) AS valid,
      EXISTS (SELECT 1 FROM "Usuario" actor JOIN "UsuarioUnidadeGestora" ug ON ug."usuarioId" = actor.id
        WHERE actor.id = ${input.usuarioId} AND actor.ativo = true AND ug."budgetUnitId" = a."budgetUnitId") AS "userActive",
      c."purchaseReceiptId" IS NOT NULL AS "receiptLinked", EXISTS (
        SELECT 1 FROM "PurchaseReceiptItem" ri JOIN "MaterialMovement" mm ON mm.id = ri."stockMovementId"
        WHERE ri."purchaseReceiptId" = c."purchaseReceiptId" AND ri."materialId" = st."materialId"
          AND ri."warehouseId" = st."warehouseId" AND mm."stockId" = st.id
      ) AS "materialLinked", regexp_replace(n.code, '[^0-9]', '', 'g') LIKE '339030%' AS "consumptionNature"
    FROM "Settlement" s JOIN "Commitment" c ON c.id = s."commitmentId"
    JOIN "BudgetAppropriation" a ON a.id = c."appropriationId" JOIN "FinancialYear" y ON y.id = a."financialYearId"
    JOIN "BudgetUnit" u ON u.id = a."budgetUnitId" JOIN "ExpenseNature" n ON n.id = a."expenseNatureId"
    JOIN "MaterialStock" st ON st.id = ${input.stockId} JOIN "Warehouse" w ON w.id = st."warehouseId"
    LEFT JOIN "CostCenter" cc ON cc.id = w."costCenterId" JOIN "Material" m ON m.id = st."materialId"
    JOIN "Department" d ON d.id = ${input.departmentId} WHERE s.id = ${input.settlementId}`);
  return result.rows[0] ?? null;
}
