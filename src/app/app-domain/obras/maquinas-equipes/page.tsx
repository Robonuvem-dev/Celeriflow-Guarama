import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { MaquinasEquipesClient } from "../components/MaquinasEquipesClient";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { db } from "@/db/client";
import { loadWorksTeams } from "@/db/repositories/works-pages/infrastructure";

export default async function MaquinasEquipesPage() {
  const context = await getTenantContextForModule("OBRAS");
  const { teams, assets } = await loadWorksTeams(context.database ?? db);

  return <PageFrame className="px-1 py-1 md:px-2"><MaquinasEquipesClient teams={teams} assets={assets} /></PageFrame>;
}
