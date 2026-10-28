import { ContratoForm } from "../ContratoForm";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { databaseConnection } from "@/db/client";
import { loadContractOptions } from "@/db/repositories/procurement/instruments";

export default async function NovoContratoPage() {
  await getTenantContextForModule("COMPRAS");
  const { processos, secretarias, unidadesGestoras, fornecedores } = await loadContractOptions(databaseConnection.db);

  return <ContratoForm processos={processos} secretarias={secretarias} unidadesGestoras={unidadesGestoras} fornecedores={fornecedores} />;
}
