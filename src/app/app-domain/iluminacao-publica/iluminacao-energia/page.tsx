import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { IluminacaoEnergiaClient } from "../../obras/components/IluminacaoEnergiaClient";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { db } from "@/db/client";
import { listInfrastructureServiceDetails } from "@/db/repositories/infrastructure/services";

export default async function IluminacaoEnergiaPage() {
  await getTenantContextForModule("ILUMINACAO_PUBLICA");
  const servicos = await listInfrastructureServiceDetails(db, "Iluminação");

  return <PageFrame className="px-1 py-1 md:px-2"><IluminacaoEnergiaClient servicos={servicos} /></PageFrame>;
}
