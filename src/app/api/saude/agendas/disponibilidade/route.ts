import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { listHealthScheduleSlots } from "@/lib/saude/schedule-slots-service";
export async function GET(request: Request) {
  const context = await getTenantContextForModule("SAUDE"), query = new URL(request.url).searchParams;
  try { return Response.json({ slots: await listHealthScheduleSlots(context, { scheduleId: query.get("scheduleId"), day: query.get("day") }) }); } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Não foi possível consultar horários." }, { status: 400 }); }
}
