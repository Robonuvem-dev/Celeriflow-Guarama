import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { getAdministrationBi } from "@/lib/administration/bi-service";
import AdministrationDashboard from "./AdministrationDashboard";

export const dynamic = "force-dynamic";

export default async function AdministrationIndicatorsPage({ searchParams }: { searchParams: Promise<{ secretariatId?: string }> }) {
  const context = await getTenantContextForModule("ADMINISTRACAO");
  const params = await searchParams;
  const data = await getAdministrationBi(context, params.secretariatId || "");
  return <AdministrationDashboard data={data} />;
}
