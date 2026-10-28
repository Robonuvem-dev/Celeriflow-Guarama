import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { ServicosUrbanosClient } from "../components/ServicosUrbanosClient";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { db } from "@/db/client";
import { listWorksServices } from "@/db/repositories/works-pages/infrastructure";

export default async function ServicosUrbanosPage() {
  const context = await getTenantContextForModule("OBRAS");
  const servicos = await listWorksServices(context.database ?? db);

  return <PageFrame className="h-full min-h-0 overflow-hidden p-2 sm:p-3"><ServicosUrbanosClient servicos={servicos} /></PageFrame>;
}
