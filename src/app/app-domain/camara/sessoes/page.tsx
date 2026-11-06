import { canPerformModuleOperation, getTenantContextForModule } from "@/lib/platform/tenant-context";
import SessoesClient from "./SessoesClient";
import { db } from "@/db/client";
import { listChamberSessions, listLegislatures } from "@/db/repositories/chamber/queries";

export default async function SessoesPage() {
  const context = await getTenantContextForModule("CAMARA");
  const database = context.database ?? db;
  const [sessoes, legislaturas] = await Promise.all([listChamberSessions(database), listLegislatures(database)]);

  const sessoesWithAtas = sessoes.map(({ ata, ...sessao }) => ({
    ...sessao,
    atas: ata ? [ata] : []
  }));

  return <SessoesClient sessoes={sessoesWithAtas} legislaturas={legislaturas.map(({ id, numero }) => ({ id, numero }))} canCreate={canPerformModuleOperation(context.user, "CAMARA", "create")} canUpdate={canPerformModuleOperation(context.user, "CAMARA", "update")} />;
}
