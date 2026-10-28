import { DependenteForm } from "../DependenteForm";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { db } from "@/db/client";
import { readEmployeeOptions } from "@/db/repositories/personnel-pages/records";

export default async function NovoDependentePage({ searchParams }: { searchParams: Promise<{ employeeId?: string }> }) {
  const context = await getTenantContextForModule("RH");
  const { employeeId } = await searchParams;
  const employees = await readEmployeeOptions(context.database ?? db);
  
  return (
    <DependenteForm employees={employees} defaultEmployeeId={employeeId} />
  );
}
