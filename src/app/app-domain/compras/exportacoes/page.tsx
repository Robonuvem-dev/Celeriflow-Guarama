import { listProcurementExportBoard } from "@/lib/integrations/procurement-exports";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import ProcurementExportsClient from "./ProcurementExportsClient";
import { db } from "@/db/client";
import { countPendingProcurementInvitations } from "@/db/repositories/procurement/invitations";

export const dynamic = "force-dynamic";

export default async function ProcurementExportsPage() {
  const context = await getTenantContextForModule("COMPRAS");
  const executor = context.database ?? db;
  const [rows, pendingInvitationCount] = await Promise.all([
    listProcurementExportBoard(executor),
    countPendingProcurementInvitations(executor),
  ]);

  return <ProcurementExportsClient rows={rows} pendingInvitationCount={pendingInvitationCount} />;
}
