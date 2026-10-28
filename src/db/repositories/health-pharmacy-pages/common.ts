import { and, asc, eq, getTableColumns, gt, gte, ilike, isNotNull, isNull, or, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import type { DatabaseExecutor } from "../../transaction";
import type { PharmacyPageUnits } from "../../../lib/contracts/health-pharmacy-pages";
import { materials, materialStocks, warehouses } from "../../schema/assets-stock";
import { healthMaterialProfiles } from "../../schema/health-pharmacy";
import { medicines, healthPrescriptions, healthPrescriptionItems } from "../../schema/health-prescriptions";
import { patients } from "../../schema/health-registration";
import { healthUnits, healthProfessionals } from "../../schema/health-workforce";
import { employees } from "../../schema/administration";
import { people } from "../../schema/people";

// A single bound PostgreSQL array, including the empty-array deny-all case.
export const pharmacyIds = (column: AnyPgColumn, ids: readonly string[]) => sql`${column} = ANY(${sql.param([...ids])}::text[])`;
export const pharmacyUnitScope = (column: AnyPgColumn, units: PharmacyPageUnits) => units === undefined ? undefined : pharmacyIds(column, units);
export const pharmacyWarehouseScope = (column: AnyPgColumn, units: PharmacyPageUnits) => units === undefined ? isNotNull(column) : pharmacyIds(column, units);
export const pharmacyPageNumber = (raw: string | undefined, total: number) => Math.min(Math.max(1, Number.parseInt(raw || "1") || 1), Math.max(1, Math.ceil(total / 20)));

export async function pharmacyPatients(db: DatabaseExecutor, units: PharmacyPageUnits, q: string | undefined, limit: number) {
  const rows = await db.select({ patient: patients, person: people }).from(patients).innerJoin(people, eq(people.id, patients.personId))
    .where(and(eq(patients.status, "Ativo"), pharmacyUnitScope(patients.referenceUnitId, units), q ? ilike(people.fullName, `%${q}%`) : undefined)).orderBy(asc(people.fullName)).limit(limit);
  return rows.map(row => ({ ...row.patient, person: row.person }));
}
export function pharmacyUnits(db: DatabaseExecutor, units: PharmacyPageUnits, ordered = false) {
  return db.select({ id: healthUnits.id, name: healthUnits.name }).from(healthUnits).where(and(eq(healthUnits.isActive, true), pharmacyUnitScope(healthUnits.id, units))).orderBy(...(ordered ? [asc(healthUnits.name)] : []));
}
export function pharmacyWarehouses(db: DatabaseExecutor, units: PharmacyPageUnits, ordered = false) {
  return db.select({ id: warehouses.id, name: warehouses.name }).from(warehouses).where(and(eq(warehouses.isActive, true), pharmacyWarehouseScope(warehouses.healthUnitId, units))).orderBy(...(ordered ? [asc(warehouses.name)] : []));
}
export function pharmacyProducts(db: DatabaseExecutor) {
  return db.select({ id: materials.id, name: materials.name }).from(materials).innerJoin(healthMaterialProfiles, eq(healthMaterialProfiles.materialId, materials.id)).where(and(eq(materials.isActive, true), eq(healthMaterialProfiles.isActive, true))).orderBy(asc(materials.name));
}
export function pharmacyPeople(db: DatabaseExecutor, q: string | undefined, ordered = false) {
  if (q === undefined) return Promise.resolve([]);
  return db.select({ id: people.id, fullName: people.fullName }).from(people).where(and(eq(people.status, "Ativo"), ilike(people.fullName, `%${q}%`))).orderBy(...(ordered ? [asc(people.fullName)] : [])).limit(50);
}
export function pharmacyProfessionals(db: DatabaseExecutor, employeeActive = false, ordered = false) {
  return db.select({ id: healthProfessionals.id, employee: { name: employees.name } }).from(healthProfessionals).innerJoin(employees, eq(employees.id, healthProfessionals.employeeId)).where(and(eq(healthProfessionals.isActive, true), employeeActive ? eq(employees.isActive, true) : undefined)).orderBy(...(ordered ? [asc(employees.name)] : []));
}
export async function pharmacyAvailableStocks(db: DatabaseExecutor, units: PharmacyPageUnits, options: { activeWarehouse: boolean; product?: "MEDICINE" | "PROFILE"; ordered?: boolean; materialId?: string; now?: Date }) {
  const rows = await db.select({ stock: materialStocks, material: materials, warehouse: warehouses }).from(materialStocks).innerJoin(materials, eq(materials.id, materialStocks.materialId)).innerJoin(warehouses, eq(warehouses.id, materialStocks.warehouseId))
    .where(and(gt(materialStocks.quantity, 0), isNull(materialStocks.blockedAt), or(isNull(materialStocks.expirationDate), gte(materialStocks.expirationDate, options.now ?? new Date())), pharmacyWarehouseScope(warehouses.healthUnitId, units), options.activeWarehouse ? eq(warehouses.isActive, true) : undefined,
      options.materialId ? eq(materialStocks.materialId, options.materialId) : undefined,
      options.product === "MEDICINE" ? sql`EXISTS (SELECT 1 FROM ${medicines} WHERE ${medicines.materialId} = ${materials.id} AND ${medicines.isActive} = true)` : options.product === "PROFILE" ? sql`EXISTS (SELECT 1 FROM ${healthMaterialProfiles} WHERE ${healthMaterialProfiles.materialId} = ${materials.id} AND ${healthMaterialProfiles.isActive} = true)` : undefined))
    .orderBy(...(options.ordered ? [asc(materials.name), sql`${materialStocks.expirationDate} ASC NULLS LAST`] : [])).limit(1000);
  return rows.map(row => ({ ...row.stock, material: row.material, warehouse: row.warehouse }));
}
export async function pharmacyPrescriptionOptions(db: DatabaseExecutor, units: PharmacyPageUnits) {
  const rows = await db.select({ ...getTableColumns(healthPrescriptionItems), prescription: healthPrescriptions }).from(healthPrescriptionItems).innerJoin(healthPrescriptions, eq(healthPrescriptions.id, healthPrescriptionItems.prescriptionId)).where(pharmacyUnitScope(healthPrescriptions.unitId, units)).orderBy(sql`${healthPrescriptionItems.createdAt} DESC`).limit(1000);
  return rows;
}
