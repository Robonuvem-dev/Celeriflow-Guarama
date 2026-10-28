"use server";

import { revalidatePath } from "next/cache";
import { calendarDate, calendarEventSchema } from "@/lib/administration/calendar-event";
import { getTenantContextForSystemAdministration } from "@/lib/platform/tenant-context";
import { auditEventTypes } from "@/lib/contracts/audit";
import { insertAuditEvent } from "@/db/repositories/platform/audit";
import { insertCalendarEvent } from "@/db/repositories/administration/creation";
import { databaseConnection } from "@/db/client";
import { withDatabaseTransaction } from "@/db/transaction";

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
    await withDatabaseTransaction(databaseConnection, async tx => {
      const id = await insertCalendarEvent(tx, parsed.data);
      await insertAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "CALENDAR_EVENT", targetId: id });
    });
    revalidatePath("/administracao/calendario");
    revalidatePath("/saude/administracao");
    return { error: null };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Não foi possível adicionar o evento." };
  }
}
