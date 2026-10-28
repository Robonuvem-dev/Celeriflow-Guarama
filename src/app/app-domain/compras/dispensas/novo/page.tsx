import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { DispensaForm } from "../DispensaForm";
import { db } from "@/db/client";
import { loadDirectContractingOptions } from "@/db/repositories/procurement/direct-contracting";

export default async function NovaDispensaPage() {
  const context = await getTenantContextForModule("COMPRAS");
  const { processos, fornecedores } = await loadDirectContractingOptions(context.database ?? db);

  return <DispensaForm processos={processos} fornecedores={fornecedores} />;
}
