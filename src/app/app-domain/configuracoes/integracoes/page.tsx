import { integrationCatalog } from "@/lib/integrations/registry";
import { db } from "@/db/client";
import { listIntegrationConnections } from "@/db/repositories/platform/integrations";
import { getTenantContextForSystemAdministration } from "@/lib/platform/tenant-context";
import IntegrationConnectionsClient from "./IntegrationConnectionsClient";

export const dynamic = "force-dynamic";

export default async function IntegrationConnectionsPage() {
  await getTenantContextForSystemAdministration();
  const connections = await listIntegrationConnections(db);

  return <IntegrationConnectionsClient catalog={[...integrationCatalog]} connections={connections.map((connection) => ({
    ...connection,
    configuration: connection.configuration ? JSON.stringify(connection.configuration, null, 2) : "",
    mockScenario: connection.mockScenario ? JSON.stringify(connection.mockScenario, null, 2) : "",
    runs: connection.runs.map((run) => ({
      ...run,
      payload: run.payload ? JSON.stringify(run.payload, null, 2) : null,
    })),
  }))} />;
}
