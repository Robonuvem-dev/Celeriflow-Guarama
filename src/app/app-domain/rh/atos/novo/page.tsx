import { AtoForm } from "../AtoForm";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { db } from "@/db/client";
import { readEmployeeOptions } from "@/db/repositories/personnel-pages/records";

export default async function NovoAtoPage() {
  const context = await getTenantContextForModule("RH");
  const employees = await readEmployeeOptions(context.database ?? db);
  
  return (
    <AtoForm employees={employees} />
  );
}
