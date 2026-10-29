import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { PortalClient } from "../components/PortalClient";
import { db } from "@/db/client";
import { listPortalRequests } from "@/db/repositories/sanitation/queries";

export default async function PortalPage() {
  const context = await getTenantContextForModule("SANEAMENTO");
  const requests = await listPortalRequests(context.database ?? db);

  const serializedRequests = requests.map((request) => ({
    ...request,
    requestedAt: request.requestedAt.toISOString().slice(0, 10),
  }));

  return <PortalClient requests={serializedRequests} />;
}
