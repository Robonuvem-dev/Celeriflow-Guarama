import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import Link from "next/link";
import { Building2 } from "lucide-react";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import SecretariasClient from "./SecretariasClient";
import { db } from "@/db/client";
import { listManagerOptions, listSecretariatDetails } from "@/db/repositories/administration/queries";

export const dynamic = "force-dynamic";

export default async function SecretariasPage() {
  const context = await getTenantContextForModule("ADMINISTRACAO");
  const secretariats = await listSecretariatDetails(context.database ?? db);
  const employees = await listManagerOptions(context.database ?? db);

  return (
    <PageFrame className="flex h-full min-h-0 flex-col">
      <PageHeader title="Secretarias" icon={<Building2 className="size-4 shrink-0 text-blue-600" />} action={<Link href="/administracao/secretarias/novo" className="inline-flex h-7 items-center justify-center rounded bg-blue-700 px-3 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-blue-800">Adicionar secretaria</Link>} />
      <SecretariasClient secretariats={secretariats} employees={employees} />
    </PageFrame>
  );
}
