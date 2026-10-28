import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { Globe } from "lucide-react";
import { PortalClient } from "../components/PortalClient";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { db } from "@/db/client";
import { listPortalRequests } from "@/db/repositories/sanitation/queries";

export default async function PortalPage() {
  const context = await getTenantContextForModule("SANEAMENTO");
  const requests = await listPortalRequests(context.database ?? db);

  const serializedRequests = requests.map((request) => ({
    ...request,
    requestedAt: request.requestedAt.toISOString().slice(0, 10),
  }));

  return (
    <PageFrame className="flex h-full min-h-0 flex-col gap-2 overflow-hidden px-1 py-1 md:px-2">
      <PageHeader title="Portal do Consumidor" icon={<Globe className="size-4 shrink-0 text-indigo-500" />} className="dark:border-gray-700 dark:bg-gray-800 dark:[&>h1]:text-white" />
      <div className="min-h-0 flex-1"><PortalClient requests={serializedRequests} /></div>
    </PageFrame>
  );
}
