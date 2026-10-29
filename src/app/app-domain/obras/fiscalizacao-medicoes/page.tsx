import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import MedicoesClient from "../components/MedicoesClient";
import { db } from "@/db/client";
import { loadWorksMeasurements } from "@/db/repositories/works-pages/infrastructure";

export default async function FiscalizacaoMedicoesPage() {
  const context = await getTenantContextForModule("OBRAS");
  const { medicoes, obras } = await loadWorksMeasurements(context.database ?? db);

  return (
      <MedicoesClient
      medicoes={medicoes.map((medicao) => ({
        ...medicao,
        data: medicao.data.toISOString().slice(0, 10),
      }))}
      obras={obras}
      />
  );
}
