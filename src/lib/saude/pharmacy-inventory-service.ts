import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { databaseConnection } from "@/db/client";
import type { DatabaseConnection } from "@/db/connection";
import { inventorySessions, inventorySessionItems, materialStocks, warehouses } from "@/db/schema/assets-stock";
import { pharmacyVaccines } from "@/db/schema/health-pharmacy";
import { pharmacyRecord } from "@/db/repositories/health-pharmacy/records";
import type { HealthPharmacyContext } from "@/lib/contracts/health-pharmacy";
import { assertHealthUnitAccess } from "@/lib/platform/tenant-context";
import { closeApprovedInventory, createInventorySession, recordInventoryCount, submitInventoryForApproval } from "@/lib/patrimonio/inventory-service";
import { pharmacyDispensationAccess } from "./pharmacy-dispensation-service";

async function sessionForHealth(context: HealthPharmacyContext, sessionId: string, connection: DatabaseConnection) {
  const row = pharmacyRecord((await (context.database ?? connection.db).select({ session: inventorySessions, warehouse: warehouses }).from(inventorySessions).innerJoin(warehouses, eq(warehouses.id, inventorySessions.warehouseId)).where(eq(inventorySessions.id, sessionId)).limit(1))[0]);
  const session = { ...row.session, warehouse: row.warehouse };
  if (!session.warehouse.healthUnitId) throw new Error("O inventário não pertence a estoque de saúde.");
  assertHealthUnitAccess(context.user, session.warehouse.healthUnitId);
  return session;
}
export async function startPharmacyInventory(context: HealthPharmacyContext, warehouseId: string, connection: DatabaseConnection = databaseConnection) {
  z.string().min(1).parse(warehouseId);
  await pharmacyDispensationAccess(context.database ?? connection.db, context, warehouseId);
  return createInventorySession(connection, { warehouseId, actor: { usuarioId: context.user.id, employeeId: context.user.employeeId } });
}
export async function countPharmacyInventory(context: HealthPharmacyContext, raw: unknown, connection: DatabaseConnection = databaseConnection) {
  const input = z.object({ sessionId: z.string().min(1), itemId: z.string().min(1), countedQuantity: z.number().nonnegative(), divergenceType: z.string().optional(), countEvidence: z.string().optional(), adjustmentReason: z.string().optional() }).strict().parse(raw);
  const session = await sessionForHealth(context, input.sessionId, connection);
  if (session.createdByUsuarioId !== context.user.id) throw new Error("A contagem deve ser registrada pelo inventoriante responsável.");
  const [item] = await (context.database ?? connection.db).select({ vaccine: { id: pharmacyVaccines.id } }).from(inventorySessionItems).innerJoin(materialStocks, eq(materialStocks.id, inventorySessionItems.stockId)).leftJoin(pharmacyVaccines, eq(pharmacyVaccines.materialId, materialStocks.materialId)).where(and(eq(inventorySessionItems.id, input.itemId), eq(inventorySessionItems.sessionId, session.id))).limit(1);
  if (item?.vaccine && !Number.isInteger(input.countedQuantity)) throw new Error("Informe número inteiro de doses para o inventário do imunobiológico.");
  return recordInventoryCount(connection, input);
}
export async function submitPharmacyInventory(context: HealthPharmacyContext, sessionId: string, connection: DatabaseConnection = databaseConnection) {
  const session = await sessionForHealth(context, sessionId, connection);
  if (session.createdByUsuarioId !== context.user.id) throw new Error("O envio deve ser realizado pelo inventoriante responsável.");
  return submitInventoryForApproval(connection, sessionId);
}
export async function closePharmacyInventory(context: HealthPharmacyContext, raw: unknown, connection: DatabaseConnection = databaseConnection) {
  const input = z.object({ sessionId: z.string().min(1), approvalEvidence: z.string().trim().min(1).max(4000) }).strict().parse(raw);
  await sessionForHealth(context, input.sessionId, connection);
  return closeApprovedInventory(connection, { ...input, actor: { usuarioId: context.user.id, employeeId: context.user.employeeId } });
}
