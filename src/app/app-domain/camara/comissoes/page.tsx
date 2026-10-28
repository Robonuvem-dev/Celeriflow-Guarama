import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import ComissoesClient from "./ComissoesClient";
import { db } from "@/db/client";
import { listCommittees } from "@/db/repositories/chamber/queries";

export default async function ComissoesPage() {
  await getTenantContextForModule("CAMARA");
  const comissoes = await listCommittees(db);

  return <ComissoesClient comissoes={comissoes} />;
}
