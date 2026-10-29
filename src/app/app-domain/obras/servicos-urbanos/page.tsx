import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { ServicosUrbanosClient } from "../components/ServicosUrbanosClient";
import { db } from "@/db/client";
import { listWorksServices } from "@/db/repositories/works-pages/infrastructure";

export default async function ServicosUrbanosPage() {
  const context = await getTenantContextForModule("OBRAS");
  const servicos = await listWorksServices(context.database ?? db);

  return <ServicosUrbanosClient servicos={servicos} />;
}
