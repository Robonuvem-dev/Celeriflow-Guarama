import Link from "next/link";
import { Network } from "lucide-react";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { OrganogramaClient } from "./OrganogramaClient";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { db } from "@/db/client";
import { loadRegistryOrganogram } from "@/db/repositories/registry/overview";

export const dynamic = "force-dynamic";

export default async function OrganogramaPage() {
  const context = await getTenantContextForModule("CADASTROS");
  const secretariats = await loadRegistryOrganogram(context.database ?? db);
  return <PageFrame className="flex h-full min-h-0 flex-col"><PageHeader title="Organograma" icon={<Network className="size-4 text-emerald-700" />} action={<div className="flex gap-2"><Link href="/administracao/secretarias" className="h-7 rounded border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700">Administrar secretarias</Link><Link href="/administracao/departamentos" className="h-7 rounded border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700">Administrar departamentos</Link></div>} /><OrganogramaClient secretariats={secretariats} /></PageFrame>;
}
