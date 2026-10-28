import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import NovoDepartamentoForm from "./NovoDepartamentoForm";
import { db } from "@/db/client";
import { listSecretariats } from "@/db/repositories/administration/queries";

export const dynamic = "force-dynamic";

export default async function NovaDepartamentoPage() {
  const context = await getTenantContextForModule("ADMINISTRACAO");
  const secretariats = await listSecretariats(context.database ?? db);
  
  return <NovoDepartamentoForm secretariats={secretariats} />;
}
