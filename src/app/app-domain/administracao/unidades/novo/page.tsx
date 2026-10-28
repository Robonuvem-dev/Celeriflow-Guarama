import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import NovaUnidadeForm from "./NovaUnidadeForm";
import { db } from "@/db/client";
import { listSecretariats } from "@/db/repositories/administration/queries";

export const dynamic = "force-dynamic";

export default async function NovaUnidadePage() {
  const context = await getTenantContextForModule("ADMINISTRACAO");
  const secretariats = await listSecretariats(context.database ?? db);
  
  return <NovaUnidadeForm secretariats={secretariats} />;
}
