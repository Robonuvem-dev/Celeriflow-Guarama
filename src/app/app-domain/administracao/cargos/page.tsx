import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import Link from "next/link";
import CargosClient from "./CargosClient";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { db } from "@/db/client";
import { listRoleDetails } from "@/db/repositories/administration/queries";

export const dynamic = "force-dynamic";

export default async function CargosPage() {
  const context = await getTenantContextForModule("ADMINISTRACAO");
  const roles = await listRoleDetails(context.database ?? db);

  return (
    <PageFrame className="flex h-full min-h-0 flex-col">
      <PageHeader title="Cargos e Funções" action={<Link href="/administracao/cargos/novo" className="inline-flex h-7 items-center rounded bg-purple-700 px-3 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-purple-800">Adicionar cargo</Link>} />
      <CargosClient roles={roles} />
    </PageFrame>
  );
}
