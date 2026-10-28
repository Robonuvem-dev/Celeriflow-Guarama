import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { Building2 } from 'lucide-react';
import UnidadesClient from './UnidadesClient';
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { desc } from "drizzle-orm";
import { db } from "@/db/client";
import { healthUnits } from "@/db/schema/health-workforce";

export default async function Page() {
  const context = await getTenantContextForModule("SAUDE");
  const items = await (context.database ?? db).select({ id: healthUnits.id, name: healthUnits.name, type: healthUnits.type, cnes: healthUnits.cnes, phone: healthUnits.phone, isActive: healthUnits.isActive }).from(healthUnits).orderBy(desc(healthUnits.createdAt));

  return (
    <PageFrame className="flex h-full min-h-0 flex-1 flex-col gap-1 overflow-hidden">
      <PageHeader title="Unidades de Saúde" icon={<Building2 className="size-4 shrink-0 text-emerald-600" />} className="dark:border-gray-700 dark:bg-gray-800 dark:[&>h1]:text-white" />
      <UnidadesClient units={items} />
    </PageFrame>
  );
}
