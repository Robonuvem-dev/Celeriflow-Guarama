import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { BarChart3 } from "lucide-react";
import { ReportsClient } from "../components/ReportsClient";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";

export default async function RelatoriosPage() {
  const { prisma } = await getTenantContextForModule("SANEAMENTO");
  const reports = await prisma.sanSavedReport.findMany({
    select: { id: true, name: true, type: true, period: true, format: true, active: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <PageFrame className="flex h-full min-h-0 flex-col gap-2 overflow-hidden px-1 py-1 md:px-2">
      <PageHeader title="Relatórios Gerenciais" icon={<BarChart3 className="size-4 shrink-0 text-pink-500" />} className="dark:border-gray-700 dark:bg-gray-800 dark:[&>h1]:text-white" />
      <div className="min-h-0 flex-1"><ReportsClient reports={reports} /></div>
    </PageFrame>
  );
}
