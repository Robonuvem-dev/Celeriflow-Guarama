import { canPerformModuleOperation, getTenantContextForModuleOperation, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { MaterialRequestForm } from "./MaterialRequestForm";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { warehouses as warehouseTable, materialCategories } from "@/db/schema/assets-stock";
import { departments as departmentTable, employees } from "@/db/schema/administration";

export default async function NovaRequisicaoMaterialPage() {
  const { user } = await getTenantContextForModuleOperation("PATRIMONIO", "create");
  const [warehouses, departments, categories, requester] = await Promise.all([
    db.select({ id: warehouseTable.id, name: warehouseTable.name }).from(warehouseTable).where(eq(warehouseTable.isActive, true)).orderBy(asc(warehouseTable.name), asc(warehouseTable.id)),
    db.select({ id: departmentTable.id, name: departmentTable.name }).from(departmentTable).where(eq(departmentTable.isActive, true)).orderBy(asc(departmentTable.name)),
    db.select({ id: materialCategories.id, name: materialCategories.name }).from(materialCategories).where(eq(materialCategories.isActive, true)).orderBy(asc(materialCategories.name)),
    user.employeeId ? db.select({ id: employees.id, name: employees.name, departmentId: employees.departmentId, department: { name: departmentTable.name } }).from(employees).leftJoin(departmentTable, eq(departmentTable.id, employees.departmentId)).where(eq(employees.id, user.employeeId)).limit(1).then(rows => rows[0]) : null,
  ]);
  return <MaterialRequestForm warehouses={warehouses} departments={departments} categories={categories} initialRequester={requester ? { id: requester.id, label: requester.name, departmentId: requester.departmentId ?? undefined, departmentName: requester.department?.name } : null} canSelectRequester={isSystemAdministrator(user) || canPerformModuleOperation(user, "PATRIMONIO", "update")} />;
}
