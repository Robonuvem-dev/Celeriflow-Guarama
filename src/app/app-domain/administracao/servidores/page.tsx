import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import Link from "next/link";
import ServidoresClient from "./ServidoresClient";
import { Users } from "lucide-react";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { db } from "@/db/client";
import { listActiveDepartmentOptions, listActiveRoleOptions, listActiveSecretariatOptions, listEmployeeDetails } from "@/db/repositories/administration/queries";

export const dynamic = "force-dynamic";

export default async function ServidoresPage() {
  const context = await getTenantContextForModule("ADMINISTRACAO");
  const employees = await listEmployeeDetails(context.database ?? db);
  const roles = await listActiveRoleOptions(context.database ?? db);
  const secretariats = await listActiveSecretariatOptions(context.database ?? db);
  const departments = await listActiveDepartmentOptions(context.database ?? db);

  return (
    <PageFrame className="flex h-full min-h-0 flex-col">
      <PageHeader title="Servidores" icon={<Users className="size-4 shrink-0 text-emerald-600" />} action={<Link href="/administracao/servidores/novo" className="inline-flex h-7 items-center rounded bg-emerald-700 px-3 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-emerald-800">Adicionar servidor</Link>} />
      <ServidoresClient 
        employees={employees} 
        roles={roles}
        secretariats={secretariats}
        departments={departments}
      />
    </PageFrame>
  );
}
