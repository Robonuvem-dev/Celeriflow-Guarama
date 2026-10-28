import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import MedicoesClient from "../components/MedicoesClient";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { db } from "@/db/client";
import { loadWorksMeasurements } from "@/db/repositories/works-pages/infrastructure";

export default async function FiscalizacaoMedicoesPage() {
  const context = await getTenantContextForModule("OBRAS");
  const { medicoes, obras } = await loadWorksMeasurements(context.database ?? db);

  return (
    <PageFrame className="h-full min-h-0 overflow-hidden p-2 sm:p-3">
      <MedicoesClient
      medicoes={medicoes.map((medicao) => ({
        ...medicao,
        data: medicao.data.toISOString().slice(0, 10),
      }))}
      obras={obras}
      />
    </PageFrame>
  );
}
