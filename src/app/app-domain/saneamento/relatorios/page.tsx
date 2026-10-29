import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { ReportsClient } from "../components/ReportsClient";
import { db } from "@/db/client";
import { listSavedReports } from "@/db/repositories/sanitation/queries";

export default async function RelatoriosPage() {
  const context = await getTenantContextForModule("SANEAMENTO");
  const reports = await listSavedReports(context.database ?? db);

  return <ReportsClient reports={reports} />;
}
