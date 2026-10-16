import { canPerformModuleOperation, getTenantContextForModuleOperation, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { MaterialRequestForm } from "./MaterialRequestForm";

export default async function NovaRequisicaoMaterialPage() {
  const { prisma, user } = await getTenantContextForModuleOperation("PATRIMONIO", "create");
  const [warehouses, departments, categories, requester] = await Promise.all([
    prisma.warehouse.findMany({ where: { isActive: true }, orderBy: [{ name: "asc" }, { id: "asc" }], select: { id: true, name: true } }),
    prisma.department.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.materialCategory.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    user.employeeId ? prisma.employee.findUnique({ where: { id: user.employeeId }, select: { id: true, name: true, departmentId: true, department: { select: { name: true } } } }) : null,
  ]);
  return <MaterialRequestForm warehouses={warehouses} departments={departments} categories={categories} initialRequester={requester ? { id: requester.id, label: requester.name, departmentId: requester.departmentId ?? undefined, departmentName: requester.department?.name } : null} canSelectRequester={isSystemAdministrator(user) || canPerformModuleOperation(user, "PATRIMONIO", "update")} />;
}
