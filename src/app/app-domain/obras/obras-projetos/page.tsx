import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { ObrasProjetosClient } from "../components/ObrasProjetosClient";
import { Building2 } from "lucide-react";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { db } from "@/db/client";
import { listWorksProjects } from "@/db/repositories/works-pages/infrastructure";

export default async function ObrasProjetosPage() {
  const context = await getTenantContextForModule("OBRAS");
  const obras = await listWorksProjects(context.database ?? db);

  return (
    <PageFrame className="flex h-full min-h-0 flex-col gap-2 overflow-hidden p-2 sm:p-3">
      <PageHeader title="Obras e Projetos" icon={<Building2 className="size-4 shrink-0 text-amber-600" />} className="dark:border-slate-700 dark:bg-slate-800 dark:[&>h1]:text-white" />
      <ObrasProjetosClient obras={obras} />
    </PageFrame>
  );
}
