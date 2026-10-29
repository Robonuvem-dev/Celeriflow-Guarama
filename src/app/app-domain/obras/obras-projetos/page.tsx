import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { ObrasProjetosClient } from "../components/ObrasProjetosClient";
import { db } from "@/db/client";
import { listWorksProjects } from "@/db/repositories/works-pages/infrastructure";

export default async function ObrasProjetosPage() {
  const context = await getTenantContextForModule("OBRAS");
  const obras = await listWorksProjects(context.database ?? db);

  return <ObrasProjetosClient obras={obras} />;
}
