import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { ContratoForm } from "../../ContratoForm";
import { notFound } from "next/navigation";
import { databaseConnection } from "@/db/client";
import { loadContractHeader, loadContractOptions } from "@/db/repositories/procurement/instruments";

export default async function EditarContratoPage({ params }: { params: Promise<{ id: string }> }) {
  await getTenantContextForModule("COMPRAS");
  const resolvedParams = await params;
  const [contrato, { processos, secretarias, unidadesGestoras, fornecedores }] = await Promise.all([
    loadContractHeader(databaseConnection.db, resolvedParams.id),
    loadContractOptions(databaseConnection.db),
  ]);

  if (!contrato) {
    notFound();
  }

  return <ContratoForm data={contrato} processos={processos} secretarias={secretarias} unidadesGestoras={unidadesGestoras} fornecedores={fornecedores} />;
}
