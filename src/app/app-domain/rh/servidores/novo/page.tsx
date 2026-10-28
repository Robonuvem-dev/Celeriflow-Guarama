import { ServidorForm } from "../ServidorForm";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { db } from "@/db/client";
import { readEmployeeFormOptions } from "@/db/repositories/personnel-pages/records";

export default async function NovoServidorPage() {
  const context = await getTenantContextForModule("RH");
  const { roles, departments, secretariats, benefitConfigs } = await readEmployeeFormOptions(context.database ?? db);

  return (
    <ServidorForm 
      roles={roles} 
      departments={departments} 
      secretariats={secretariats} 
      benefitConfigs={benefitConfigs}
    />
  );
}
