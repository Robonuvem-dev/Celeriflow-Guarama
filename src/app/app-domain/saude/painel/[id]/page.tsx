import { assertHealthUnitAccess, getTenantContextForModule } from "@/lib/platform/tenant-context";
import { PanelDisplay } from "./PanelDisplay";
export default async function HealthPanelPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await getTenantContextForModule("SAUDE"), id = decodeURIComponent((await params).id);
  const panel = await context.prisma.healthCallPanel.findUniqueOrThrow({ where: { id }, include: { calls: { orderBy: { calledAt: "desc" }, take: 8 } } });
  assertHealthUnitAccess(context.user, panel.unitId);
  return <PanelDisplay title={panel.title} news={panel.news} calls={panel.calls.map(call => ({ id: call.id, message: call.message, time: call.calledAt.toLocaleTimeString("pt-BR") }))} />;
}
