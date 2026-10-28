import { and, asc, desc, eq, gt, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import { databaseTimestamp } from "@/db/temporal";
import { materials, materialStocks, warehouses } from "@/db/schema/assets-stock";
import { employees } from "@/db/schema/administration";
import { people } from "@/db/schema/people";
import { suppliers, companies } from "@/db/schema/registry";
import { costCenters } from "@/db/schema/master-data";
import { sstExposureGroups, sstProgramGroups, sstPrograms } from "@/db/schema/sst-programs";
import type { SstEquipmentPageDto, SstPageOption, SstPagePerson, SstPageUnit, SstProgramGroupPageDto, SstProgramPageDto, SstSupplierPageDto } from "@/lib/contracts/sst-pages";

type EquipmentWire = Omit<SstEquipmentPageDto, "caValidUntil" | "createdAt"> & { caValidUntil: string | Date | null; createdAt: string | Date };
function equipmentDto(row: EquipmentWire): SstEquipmentPageDto {
  return { ...row, caValidUntil: row.caValidUntil === null ? null : databaseTimestamp(row.caValidUntil), createdAt: databaseTimestamp(row.createdAt) };
}
export async function findSstEquipmentPolicy(database: DatabaseExecutor, unitId: string): Promise<{ integrateStock: boolean } | undefined> {
  return (await database.execute<{ integrateStock: boolean }>(sql`SELECT "integrateStock" FROM "SstEquipmentPolicy" WHERE "budgetUnitId"=${unitId}`)).rows[0];
}
export async function readSstEquipmentCatalogOptions(database: DatabaseExecutor, params: { materialQ?: string; supplierQ?: string }): Promise<{
  materials: (SstPageOption & { code: string })[]; supplierRecords: SstSupplierPageDto[];
}> {
  const materialOptions = (params.materialQ?.trim().length || 0) >= 3 ? await database.select({ id: materials.id, name: materials.name, code: materials.code }).from(materials).where(and(eq(materials.isActive, true), or(ilike(materials.name, `%${params.materialQ}%`), ilike(materials.code, `%${params.materialQ}%`)))).orderBy(asc(materials.name), asc(materials.id)).limit(20) : [];
  const supplierRecords = (params.supplierQ?.trim().length || 0) >= 3 ? await database.select({ id: suppliers.id, person: { fullName: people.fullName }, company: { corporateName: companies.corporateName } }).from(suppliers).leftJoin(people, eq(people.id, suppliers.personId)).leftJoin(companies, eq(companies.id, suppliers.companyId)).where(and(eq(suppliers.status, "Ativo"), or(ilike(people.fullName, `%${params.supplierQ}%`), ilike(companies.corporateName, `%${params.supplierQ}%`)))).orderBy(asc(suppliers.id)).limit(20) : [];
  return { materials: materialOptions, supplierRecords };
}
export async function findSstEquipmentPage(database: DatabaseExecutor, id: string, scope: SQL): Promise<SstEquipmentPageDto | undefined> {
  const [row] = (await database.execute<EquipmentWire>(sql`SELECT e.*,m."name",m."code" FROM "SstEquipment" e JOIN "Material" m ON m."id"=e."materialId" WHERE e."id"=${id} AND e."budgetUnitId" ${scope}`)).rows;
  return row ? equipmentDto(row) : undefined;
}
export async function findSstEquipmentSupplier(database: DatabaseExecutor, id: string): Promise<Omit<SstSupplierPageDto, "id"> | undefined> {
  return (await database.select({ person: { fullName: people.fullName }, company: { corporateName: companies.corporateName } }).from(suppliers).leftJoin(people, eq(people.id, suppliers.personId)).leftJoin(companies, eq(companies.id, suppliers.companyId)).where(eq(suppliers.id, id)))[0];
}
export async function searchSstPageEquipment(database: DatabaseExecutor, unitId: string, term: string): Promise<SstEquipmentPageDto[]> {
  return (await database.execute<EquipmentWire>(sql`SELECT e.*,m."name",m."code" FROM "SstEquipment" e JOIN "Material" m ON m."id"=e."materialId" WHERE e."budgetUnitId"=${unitId} AND m."name" ILIKE ${`%${term}%`} ORDER BY m."name",e."id" LIMIT 20`)).rows.map(equipmentDto);
}
export async function readSstEquipmentDeliveryOptions(database: DatabaseExecutor, unit: SstPageUnit | undefined, params: { employeeQ?: string; personQ?: string; warehouseId?: string }): Promise<{
  employees: (SstPageOption & { registration: string | null })[]; people: SstPagePerson[];
  warehouses: SstPageOption[]; warehouse: SstPageOption | undefined;
}> {
  const workers = unit && (params.employeeQ?.trim().length || 0) >= 3 ? await database.select({ id: employees.id, name: employees.name, registration: employees.registration }).from(employees).where(and(eq(employees.secretariatId, unit.secretariatId), eq(employees.isActive, true), ilike(employees.name, `%${params.employeeQ}%`))).orderBy(asc(employees.name), asc(employees.id)).limit(20) : [];
  const persons = (params.personQ?.trim().length || 0) >= 3 ? await database.select({ id: people.id, fullName: people.fullName }).from(people).where(ilike(people.fullName, `%${params.personQ}%`)).orderBy(asc(people.fullName), asc(people.id)).limit(20) : [];
  const stores = unit ? await database.select({ id: warehouses.id, name: warehouses.name }).from(warehouses).innerJoin(costCenters, eq(costCenters.id, warehouses.costCenterId)).where(and(eq(warehouses.isActive, true), eq(costCenters.isActive, true), eq(costCenters.secretariatId, unit.secretariatId))).orderBy(asc(warehouses.name), asc(warehouses.id)) : [];
  return { employees: workers, people: persons, warehouses: stores, warehouse: stores.find(w => w.id === params.warehouseId) };
}
export async function readSstEquipmentLots(database: DatabaseExecutor, warehouseId: string, now: Date): Promise<{ id: string; batchNumber: string; quantity: number; material: { name: string } }[]> {
  return database.select({ id: materialStocks.id, batchNumber: materialStocks.batchNumber, quantity: materialStocks.quantity, material: { name: materials.name } }).from(materialStocks).innerJoin(materials, eq(materials.id, materialStocks.materialId)).where(and(eq(materialStocks.warehouseId, warehouseId), gt(materialStocks.quantity, 0), isNull(materialStocks.blockedAt), or(isNull(materialStocks.expirationDate), gt(materialStocks.expirationDate, now)))).orderBy(asc(materialStocks.materialId), asc(materialStocks.batchNumber), asc(materialStocks.id)).limit(20);
}
export async function readSstEquipmentRequirementOptions(database: DatabaseExecutor, unitId: string | undefined, unitIds: string[], params: { programQ?: string; programGroupId?: string }): Promise<{
  groups: (SstProgramGroupPageDto & { program: SstProgramPageDto; group: { name: string; code: string } })[];
  selected: (SstProgramGroupPageDto & { program: SstProgramPageDto }) | null | undefined;
}> {
  const groups = unitId ? await database.select({ version: sstProgramGroups, program: sstPrograms, group: { name: sstExposureGroups.name, code: sstExposureGroups.code } }).from(sstProgramGroups).innerJoin(sstPrograms, eq(sstPrograms.id, sstProgramGroups.programId)).innerJoin(sstExposureGroups, eq(sstExposureGroups.id, sstProgramGroups.groupId)).where(and(eq(sstPrograms.budgetUnitId, unitId), eq(sstPrograms.kind, "PGR"), ilike(sstPrograms.code, `%${params.programQ || ""}%`))).orderBy(desc(sstPrograms.createdAt), asc(sstProgramGroups.id)).limit(20).then(rows => rows.map(row => ({ ...row.version, program: row.program, group: row.group }))) : [];
  const selected = params.programGroupId ? (await database.select({ version: sstProgramGroups, program: sstPrograms }).from(sstProgramGroups).innerJoin(sstPrograms, eq(sstPrograms.id, sstProgramGroups.programId)).where(and(eq(sstProgramGroups.id, params.programGroupId), inArray(sstPrograms.budgetUnitId, unitIds), eq(sstPrograms.kind, "PGR"))).limit(1).then(rows => rows.map(row => ({ ...row.version, program: row.program }))))[0] : null;
  return { groups, selected };
}
