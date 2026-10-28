import { and, asc, count, desc, eq, getTableColumns } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { DatabaseExecutor } from "../../transaction";
import type { PharmacyPageSearch, PharmacyPageUnits } from "../../../lib/contracts/health-pharmacy-pages";
import { inventorySessions as sessions, inventorySessionItems as items, materialStocks as stocks, materialMovements as movements, materials, warehouses } from "../../schema/assets-stock";
import { users } from "../../schema/identity";
import { pharmacyIds, pharmacyPageNumber, pharmacyWarehouses, pharmacyWarehouseScope } from "./common";
const creator = alias(users, "pharmacy_inventory_creator"), approver = alias(users, "pharmacy_inventory_approver");

export async function readPharmacyInventoryPage(db: DatabaseExecutor, units: PharmacyPageUnits, search: PharmacyPageSearch) {
  const where = and(pharmacyWarehouseScope(warehouses.healthUnitId, units), search.status ? eq(sessions.status, search.status) : undefined);
  const [{ total }] = await db.select({ total: count() }).from(sessions).innerJoin(warehouses, eq(warehouses.id, sessions.warehouseId)).where(where);
  const page = pharmacyPageNumber(search.page, total);
  const [rows, warehouseRows] = await Promise.all([
    db.select({ ...getTableColumns(sessions), warehouse: warehouses, createdByUsuario: { nome: creator.nome }, approvedByUsuario: { nome: approver.nome } }).from(sessions).innerJoin(warehouses, eq(warehouses.id, sessions.warehouseId)).innerJoin(creator, eq(creator.id, sessions.createdByUsuarioId)).leftJoin(approver, eq(approver.id, sessions.approvedByUsuarioId)).where(where).orderBy(desc(sessions.startedAt)).limit(20).offset((page - 1) * 20),
    pharmacyWarehouses(db, units),
  ]);
  const itemRows = await db.select({ item: items, stock: stocks, material: materials, adjustmentMovement: { id: movements.id, date: movements.date, quantity: movements.quantity } }).from(items).innerJoin(stocks, eq(stocks.id, items.stockId)).innerJoin(materials, eq(materials.id, stocks.materialId)).leftJoin(movements, eq(movements.id, items.adjustmentMovementId)).where(pharmacyIds(items.sessionId, rows.map(row => row.id))).orderBy(asc(materials.name));
  return { total, page, warehouses: warehouseRows, sessions: rows.map(row => ({ ...row, items: itemRows.filter(item => item.item.sessionId === row.id).map(item => ({ ...item.item, stock: { ...item.stock, material: item.material }, adjustmentMovement: item.adjustmentMovement })) })) };
}
