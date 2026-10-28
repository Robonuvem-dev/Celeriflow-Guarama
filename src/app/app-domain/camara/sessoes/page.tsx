import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import SessoesClient from "./SessoesClient";
import { db } from "@/db/client";
import { listChamberSessions } from "@/db/repositories/chamber/queries";

export default async function SessoesPage() {
  await getTenantContextForModule("CAMARA");
  const sessoes = await listChamberSessions(db);

  const sessoesWithAtas = sessoes.map(({ ata, ...sessao }) => ({
    ...sessao,
    atas: ata ? [ata] : []
  }));

  return <SessoesClient sessoes={sessoesWithAtas} />;
}
