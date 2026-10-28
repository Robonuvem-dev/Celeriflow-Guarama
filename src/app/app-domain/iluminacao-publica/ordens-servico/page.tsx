import { canViewModule, getTenantContextForModule } from "@/lib/platform/tenant-context";
import { OrdensServicoClient } from "../../obras/components/OrdensServicoClient";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { db } from "@/db/client";
import { listInfrastructureServiceDetails } from "@/db/repositories/infrastructure/services";

export default async function OrdensServicoPage() {
  const { user } = await getTenantContextForModule("ILUMINACAO_PUBLICA");
  const ordens = await listInfrastructureServiceDetails(db);

  return <PageFrame className="px-1 py-1 md:px-2"><OrdensServicoClient canManageBase={canViewModule(user, "OBRAS")} ordens={ordens.map((ordem) => ({
    ...ordem,
    scheduledFor: ordem.scheduledFor?.toISOString() ?? null,
    completedAt: ordem.completedAt?.toISOString() ?? null,
  }))} /></PageFrame>;
}
