import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import NovaSecretariaForm from "./NovaSecretariaForm";
import { db } from "@/db/client";
import { listUnassignedManagerOptions } from "@/db/repositories/administration/queries";

export default async function NovaSecretariaPage() {
  const context = await getTenantContextForModule("ADMINISTRACAO");
  const employees = await listUnassignedManagerOptions(context.database ?? db);
  return <NovaSecretariaForm employees={employees} />;
}
