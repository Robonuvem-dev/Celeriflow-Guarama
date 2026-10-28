import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import NovoServidorForm from "./NovoServidorForm";
import { db } from "@/db/client";
import { listDepartments, listRoles, listSecretariats, listUnits } from "@/db/repositories/administration/queries";

export const dynamic = "force-dynamic";

export default async function NovoServidorPage() {
  const context = await getTenantContextForModule("ADMINISTRACAO");
  const roles = await listRoles(context.database ?? db);
  const secretariats = await listSecretariats(context.database ?? db);
  const departments = await listDepartments(context.database ?? db);
  const units = await listUnits(context.database ?? db);
  
  return <NovoServidorForm roles={roles} secretariats={secretariats} departments={departments} units={units} />;
}
