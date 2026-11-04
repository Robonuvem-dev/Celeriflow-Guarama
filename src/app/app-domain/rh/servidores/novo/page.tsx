import { ServidorForm } from "../ServidorForm";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { db } from "@/db/client";
import { readEmployeeFormOptions } from "@/db/repositories/personnel-pages/records";
import { personnelScope } from "@/lib/rh/personnel-scope";

export default async function NovoServidorPage() {
  const context = await getTenantContextForModuleOperation("RH", "create");
  const { roles, departments, secretariats, benefitConfigs } = await readEmployeeFormOptions(context.database ?? db);
  const scope = personnelScope(context.user);

  return (
    <ServidorForm 
      roles={roles} 
      departments={departments.filter(department => scope.departments === "TODOS" || scope.departments.includes(department.id))}
      secretariats={secretariats} 
      benefitConfigs={benefitConfigs}
    />
  );
}
