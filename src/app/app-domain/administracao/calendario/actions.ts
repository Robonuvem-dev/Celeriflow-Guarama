"use server";

import { revalidatePath } from "next/cache";
import { calendarDate, calendarEventSchema } from "@/lib/administration/calendar-event";
import { getTenantContextForSystemAdministration } from "@/lib/platform/tenant-context";
import { auditEventTypes, writeAuditEvent } from "@/lib/platform/audit-evidence";

export async function createCalendarEvent(formData: FormData) {
  try {
    const context = await getTenantContextForSystemAdministration();
    const parsed = calendarEventSchema.safeParse({
      title: String(formData.get("title") || ""),
      description: String(formData.get("description") || ""),
      date: calendarDate(String(formData.get("date") || "")),
      type: String(formData.get("type") || ""),
      isHoliday: formData.get("isHoliday") === "on",
    });
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    await context.prisma.$transaction(async (tx) => {
      const event = await tx.calendarEvent.create({ data: parsed.data });
      await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "CALENDAR_EVENT", targetId: event.id });
    });
    revalidatePath("/administracao/calendario");
    revalidatePath("/saude/administracao");
    return { error: null };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Não foi possível adicionar o evento." };
  }
}
