import { assertHealthUnitAccess, getTenantContextForModule } from "@/lib/platform/tenant-context";
import { PanelDisplay } from "./PanelDisplay";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { healthCallPanels, healthPanelCalls } from "@/db/schema/health-regulation";
export default async function HealthPanelPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await getTenantContextForModule("SAUDE"), id = decodeURIComponent((await params).id);
  const database = context.database ?? db;
  const [base] = await database.select({ unitId: healthCallPanels.unitId, title: healthCallPanels.title, news: healthCallPanels.news }).from(healthCallPanels).where(eq(healthCallPanels.id, id)).limit(1);
  if (!base) throw new Error("Painel não encontrado.");
  const panel = { ...base, calls: await database.select({ id: healthPanelCalls.id, message: healthPanelCalls.message, calledAt: healthPanelCalls.calledAt }).from(healthPanelCalls).where(eq(healthPanelCalls.panelId, id)).orderBy(desc(healthPanelCalls.calledAt)).limit(8) };
  assertHealthUnitAccess(context.user, panel.unitId);
  return <PanelDisplay title={panel.title} news={panel.news} calls={panel.calls.map(call => ({ id: call.id, message: call.message, time: call.calledAt.toLocaleTimeString("pt-BR") }))} />;
}
