import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { listCentralA1Integrations } from "@/lib/signatures/central-a1";
import { centralSigningConfigurationStatus } from "@/lib/signatures/central-a1-certificate";
import IntegrationsClient from "./IntegrationsClient";

export default async function IntegrationsPage() {
  const context = await getTenantContextForModule("ASSINATURA_DIGITAL");
  return <IntegrationsClient initial={await listCentralA1Integrations(context)} canManage={isSystemAdministrator(context.user)} status={centralSigningConfigurationStatus()} />;
}
