import { and, asc, desc, eq, inArray, notInArray } from "drizzle-orm";
import type { DatabaseExecutor } from "../../transaction";
import { fleetCatalogVersions, fleetMachineTypes, fleetUnits } from "../../schema/fleet";
import { assets } from "../../schema/assets";
import { departments, employees, institutions } from "../../schema/administration";
import { fleetDepartmentFilter } from "./records";

type Scope = { administrator: boolean; departmentId: string | null };
export async function fleetSelectedUnit(db: DatabaseExecutor, scope: Scope, id: string): Promise<{ id: string; code: string; name: string; category: string } | null> {
  return (await db.select({ id: fleetUnits.id, code: fleetUnits.code, name: fleetUnits.name, category: fleetUnits.category }).from(fleetUnits).where(and(eq(fleetUnits.id, id), fleetDepartmentFilter(scope))).limit(1))[0] ?? null;
}
export async function fleetSelectedUnits(db: DatabaseExecutor, scope: Scope, ids: string[]): Promise<{ id: string; code: string; name: string }[]> {
  return db.select({ id: fleetUnits.id, code: fleetUnits.code, name: fleetUnits.name }).from(fleetUnits).where(and(inArray(fleetUnits.id, ids), fleetDepartmentFilter(scope))).orderBy(asc(fleetUnits.code));
}
export async function fleetManagementOptions(db: DatabaseExecutor, scope: Scope, departmentId: string, catalogs: boolean): Promise<{ departments: { id: string; name: string }[]; unitOptions: { id: string; code: string; name: string; plate: string | null }[]; catalogOptions: { id: string; reference: string }[] }> {
  const [departmentRows, unitOptions, catalogOptions] = await Promise.all([
    db.select({ id: departments.id, name: departments.name }).from(departments).where(scope.administrator ? undefined : eq(departments.id, scope.departmentId!)).orderBy(asc(departments.name)),
    db.select({ id: fleetUnits.id, code: fleetUnits.code, name: fleetUnits.name, plate: fleetUnits.plate }).from(fleetUnits).where(and(fleetDepartmentFilter(scope), departmentId ? eq(fleetUnits.departmentId, departmentId) : undefined)).orderBy(asc(fleetUnits.code)),
    catalogs ? db.select({ id: fleetCatalogVersions.id, reference: fleetCatalogVersions.reference }).from(fleetCatalogVersions).where(and(eq(fleetCatalogVersions.kind, "CTB"), eq(fleetCatalogVersions.published, true))).orderBy(desc(fleetCatalogVersions.createdAt)) : Promise.resolve([]),
  ]);
  return { departments: departmentRows, unitOptions, catalogOptions };
}
export async function fleetAssetReference(db: DatabaseExecutor, scope: Scope, id: string) {
  return (await db.select({ id: assets.id, patrimonyNumber: assets.patrimonyNumber, name: assets.name, brand: assets.brand, model: assets.model, departmentId: assets.departmentId, responsibleId: assets.responsibleId, department: { name: departments.name }, responsible: { name: employees.name } }).from(assets).leftJoin(departments, eq(departments.id, assets.departmentId)).leftJoin(employees, eq(employees.id, assets.responsibleId)).where(and(eq(assets.id, id), fleetDepartmentFilter(scope, assets.departmentId), notInArray(assets.status, ["Baixado", "Inativo"]))).limit(1))[0] ?? null;
}
export async function fleetMachineFields(db: DatabaseExecutor, id: string) {
  return (await db.select({ fields: fleetMachineTypes.fields, name: fleetMachineTypes.name }).from(fleetMachineTypes).where(and(eq(fleetMachineTypes.id, id), eq(fleetMachineTypes.active, true))).limit(1))[0] ?? null;
}
export async function fleetReportInstitution(db: DatabaseExecutor) {
  return (await db.select({ name: institutions.name, legalName: institutions.legalName, cnpj: institutions.cnpj, address: institutions.address, city: institutions.city, state: institutions.state }).from(institutions).limit(1))[0] ?? null;
}
