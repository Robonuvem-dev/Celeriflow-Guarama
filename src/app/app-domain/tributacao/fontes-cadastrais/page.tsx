import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import RegistrySourcesClient from "./RegistrySourcesClient";
import { db } from "@/db/client";
import { listPageIntegrationEvents } from "@/db/repositories/taxation-pages/integration-events";

export const dynamic = "force-dynamic";

export default async function RegistrySourcesPage() {
  const context = await getTenantContextForModule("TRIBUTACAO");
  const events = await listPageIntegrationEvents(context.database ?? db, ["SERPRO_CPF", "SERPRO_CNPJ", "CORREIOS_DNE"]);
  return <RegistrySourcesClient events={events.map((event) => ({ id: event.id, source: event.integrationCode, status: event.status, evidenceLevel: event.evidenceLevel, payload: event.payload, createdAt: event.createdAt.toISOString() }))} />;
}
