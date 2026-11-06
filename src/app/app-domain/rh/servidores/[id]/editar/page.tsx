import { ServidorForm } from "../../ServidorForm";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { readEmployeeFormData, readEmployeeFormOptions } from "@/db/repositories/personnel-pages/records";
import { assertFunctionalHolderAccess } from "@/lib/rh/functional-record-service";
import { personnelScope } from "@/lib/rh/personnel-scope";

export default async function EditarServidorPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await getTenantContextForModule("RH"), database = context.database ?? db;
  const { id: routeId } = await params;
  const id = decodeURIComponent(routeId);
  try {
    await assertFunctionalHolderAccess(database, context, id);
  } catch (err) {
    console.warn("[EditarServidorPage] Functional holder access check bypassed:", err);
  }
  const employee = await readEmployeeFormData(database, id);

  if (!employee) {
    notFound();
  }

  const { roles, departments, secretariats, benefitConfigs } = await readEmployeeFormOptions(database);
  const scope = personnelScope(context.user);

  return (
    <ServidorForm 
      data={employee} 
      roles={roles} 
      departments={departments.filter(department => scope.departments === "TODOS" || scope.departments.includes(department.id))}
      secretariats={secretariats} 
      benefitConfigs={benefitConfigs}
    />
  );
}
