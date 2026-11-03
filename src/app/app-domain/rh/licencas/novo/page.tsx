import { LicencaForm } from "../LicencaForm";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { db } from "@/db/client";
import { readEmployeeOptions } from "@/db/repositories/personnel-pages/records";

export default async function NovaLicencaPage() {
  const context = await getTenantContextForModule("RH");
  const employees = await readEmployeeOptions(context.database ?? db, context.user);
  
  return (
    <LicencaForm employees={employees} />
  );
}
