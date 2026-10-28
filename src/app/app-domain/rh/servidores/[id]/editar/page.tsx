import { ServidorForm } from "../../ServidorForm";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { readEmployeeFormData, readEmployeeFormOptions } from "@/db/repositories/personnel-pages/records";

export default async function EditarServidorPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await getTenantContextForModule("RH"), database = context.database ?? db;
  const { id } = await params;
  const employee = await readEmployeeFormData(database, id);

  if (!employee) {
    notFound();
  }

  const { roles, departments, secretariats, benefitConfigs } = await readEmployeeFormOptions(database);

  return (
    <ServidorForm 
      data={employee} 
      roles={roles} 
      departments={departments} 
      secretariats={secretariats} 
      benefitConfigs={benefitConfigs}
    />
  );
}
