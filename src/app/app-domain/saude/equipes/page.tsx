import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { Users } from 'lucide-react';
import EquipesClient from './EquipesClient';
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { healthTeams, healthUnits } from "@/db/schema/health-workforce";

export default async function Page() {
  const context = await getTenantContextForModule("SAUDE"), database = context.database ?? db;
  const items = await database.select({ id: healthTeams.id, name: healthTeams.name, code: healthTeams.code, microarea: healthTeams.microarea, unitId: healthTeams.unitId, isActive: healthTeams.isActive, unit: { id: healthUnits.id, name: healthUnits.name } }).from(healthTeams).innerJoin(healthUnits, eq(healthUnits.id, healthTeams.unitId)).orderBy(desc(healthTeams.createdAt));
  const units = await database.select({ id: healthUnits.id, name: healthUnits.name }).from(healthUnits).where(eq(healthUnits.isActive, true)).orderBy(asc(healthUnits.name));

  return (
    <PageFrame className="flex h-full min-h-0 flex-1 flex-col gap-1 overflow-hidden">
      <PageHeader title="Equipes ESF" icon={<Users className="size-4 shrink-0 text-emerald-600" />} className="dark:border-gray-700 dark:bg-gray-800 dark:[&>h1]:text-white" />
      <EquipesClient teams={items} units={units} />
    </PageFrame>
  );
}
