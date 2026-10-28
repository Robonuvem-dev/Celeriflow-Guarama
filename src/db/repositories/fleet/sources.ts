import { and, eq, getTableColumns, inArray, isNull, sql, type SQL } from "drizzle-orm";
import type { DatabaseExecutor } from "../../transaction";
import { Decimal } from "../../decimal";
import { suppliers, companies } from "../../schema/registry";
import { people } from "../../schema/people";
import { procurementContracts, purchaseProcesses, purchaseProcessItems } from "../../schema/procurement-core";
import { catalogItems } from "../../schema/master-data";
import { materials, materialStocks, materialMovements, warehouses } from "../../schema/assets-stock";
import { databaseTimestamp } from "../../temporal";

export async function readFleetSupplier(db: DatabaseExecutor, id: string, active = true) {
  return (await db.select({ ...getTableColumns(suppliers), person: { id: people.id, fullName: people.fullName }, company: { id: companies.id, corporateName: companies.corporateName, tradeName: companies.tradeName, cnpj: companies.cnpj, status: companies.status } }).from(suppliers).leftJoin(people, eq(people.id, suppliers.personId)).leftJoin(companies, eq(companies.id, suppliers.companyId)).where(and(eq(suppliers.id, id), active ? eq(suppliers.status, "Ativo") : undefined)).limit(1))[0] ?? null;
}
export async function readFleetContract(db: DatabaseExecutor, id: string, condition?: SQL) {
  return (await db.select({ ...getTableColumns(procurementContracts), process: { id: purchaseProcesses.id, number: purchaseProcesses.number, modality: purchaseProcesses.modality } }).from(procurementContracts).innerJoin(purchaseProcesses, eq(purchaseProcesses.id, procurementContracts.processId)).where(and(eq(procurementContracts.id, id), condition)).limit(1))[0] ?? null;
}
export async function readFleetPurchaseItem(db: DatabaseExecutor, id: string, processId: string) {
  return (await db.select({ ...getTableColumns(purchaseProcessItems), material: { id: materials.id, name: materials.name, unitOfMeasure: materials.unitOfMeasure }, catalogItem: { id: catalogItems.id, name: catalogItems.name, unit: catalogItems.unit } }).from(purchaseProcessItems).leftJoin(materials, eq(materials.id, purchaseProcessItems.materialId)).leftJoin(catalogItems, eq(catalogItems.id, purchaseProcessItems.catalogItemId)).where(and(eq(purchaseProcessItems.id, id), eq(purchaseProcessItems.purchaseProcessId, processId))).limit(1))[0] ?? null;
}
export async function readFleetStock(db: DatabaseExecutor, id: string, condition?: SQL) {
  return (await db.select({ ...getTableColumns(materialStocks), material: getTableColumns(materials) }).from(materialStocks).innerJoin(materials, eq(materials.id, materialStocks.materialId)).innerJoin(warehouses, eq(warehouses.id, materialStocks.warehouseId)).where(and(eq(materialStocks.id, id), eq(warehouses.isActive, true), condition)).limit(1))[0] ?? null;
}
export async function readFleetStockMovement(db: DatabaseExecutor, id: string, departmentId: string | null, unconsumed = false) {
  return (await db.select({ ...getTableColumns(materialMovements), material: getTableColumns(materials) }).from(materialMovements).innerJoin(materials, eq(materials.id, materialMovements.materialId)).where(and(eq(materialMovements.id, id), eq(materialMovements.type, "Saída"), departmentId ? eq(materialMovements.departmentId, departmentId) : isNull(materialMovements.departmentId), isNull(materialMovements.obrasServicoId), sql`not exists (select 1 from "Asset" a where a."stockMovementId"=${materialMovements.id})`, unconsumed ? sql`not exists (select 1 from "FleetConsumption" c where c."stockMovementId"=${materialMovements.id})` : undefined)).limit(1))[0] ?? null;
}
export async function fleetPaymentInBudgetScope(db: DatabaseExecutor, id: string, budgetUnits: string[]): Promise<boolean> {
  if (!budgetUnits.length) return false;
  const result = await db.execute<{ id: string }>(sql`select p."id" from "Payment" p join "BankAccount" b on b."id"=p."bankAccountId" where p."id"=${id} and ${inArray(sql`b."budgetUnitId"`, budgetUnits)} limit 1`);
  return result.rows.length > 0;
}
export async function readFleetPaidAmount(db: DatabaseExecutor, id: string): Promise<Decimal | null> {
  const result = await db.execute<{ value: string | null }>(sql`select "valueDecimal"::text as value from "Payment" where "id"=${id} and "status"='Pago' limit 1`);
  return result.rows[0]?.value == null ? null : new Decimal(result.rows[0].value);
}

export async function readFleetTfdBoarding(db: DatabaseExecutor, bookingId: string) {
  const initial = await db.execute<{ id: string }>(sql`select "id" from "HealthTfdTrip" where "fleetBookingId"=${bookingId} limit 1`);
  if (!initial.rows[0]) return null;
  const id = initial.rows[0].id;
  await db.execute(sql`select pg_advisory_xact_lock(hashtext(${id}))`);
  const trip = await db.execute<{ status: string; confirmedAt: string | null }>(sql`select "status","confirmedAt" from "HealthTfdTrip" where "id"=${id}`);
  // Membership is the installed NOT NULL patientId; both role DTO names come
  // from the real kind column. Optional request/report joins remain nullable.
  const passengers = await db.execute<{ patientId: string; kind: string; identityKind: string; presenceStatus: string; tfdRequest: { status: string; clinicalReport: { companionRequired: boolean } | null } | null }>(sql`select p."patientId",p."kind",p."kind" as "identityKind",p."presenceStatus",case when r."id" is null then null else jsonb_build_object('status',r."status",'clinicalReport',case when c."id" is null then null else jsonb_build_object('companionRequired',c."companionRequired") end) end as "tfdRequest" from "HealthTfdPassenger" p left join "HealthTfdRequest" r on r."id"=p."tfdRequestId" left join "HealthTfdClinicalReport" c on c."requestId"=r."id" where p."tripId"=${id} and not exists (select 1 from "HealthTfdPassengerRemoval" x where x."passengerId"=p."id" and x."status"='Confirmada')`);
  const row = trip.rows[0];
  return row ? { status: row.status, confirmedAt: row.confirmedAt === null ? null : databaseTimestamp(row.confirmedAt), passengers: passengers.rows } : null;
}
