"use server";

import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { revalidatePath } from "next/cache";
import { assertRhAbsenceDoesNotOverlap } from "@/lib/rh/absence-conflicts";
import { eq, sql } from "drizzle-orm";
import { databaseConnection } from "@/db/client";
import { withDatabaseTransaction } from "@/db/transaction";
import { vacations } from "@/db/schema/personnel-records";
import { hrRightEntries } from "@/db/schema/personnel-workforce";
import { lockPersonnel } from "@/db/repositories/personnel/integration";
import { assertFunctionalHolderAccess } from "@/lib/rh/functional-record-service";
import { auditPersonnelMutation } from "@/lib/rh/personnel-mutation-audit";
import { assertPersonnelPeriodOpen } from "@/lib/rh/personnel-period-access";

export async function saveFerias(formData: FormData) {
  const id = formData.get("id") as string | null;
  const context = await getTenantContextForModuleOperation("RH", id ? "update" : "create");
  try {
    const employeeId = formData.get("employeeId") as string;
    const acquisitionStart = formData.get("acquisitionStart") as string;
    const acquisitionEnd = formData.get("acquisitionEnd") as string;
    const enjoymentStart = formData.get("enjoymentStart") as string;
    const enjoymentEnd = formData.get("enjoymentEnd") as string;
    const days = parseInt(formData.get("days") as string, 10);
    const status = formData.get("status") as string;

    if (!employeeId || !acquisitionStart || !acquisitionEnd) {
      return { success: false, error: "Servidor e Período Aquisitivo são obrigatórios." };
    }

    const data = {
      employeeId,
      acquisitionStart: new Date(acquisitionStart),
      acquisitionEnd: new Date(acquisitionEnd),
      enjoymentStart: enjoymentStart ? new Date(enjoymentStart) : null,
      enjoymentEnd: enjoymentEnd ? new Date(enjoymentEnd) : null,
      days: isNaN(days) ? 30 : days,
      status: status || "A vencer",
    };

    await withDatabaseTransaction(databaseConnection, async tx => {
      await lockPersonnel(tx, "functional-configuration");
      await lockPersonnel(tx, `employee:${employeeId}`);
      await assertFunctionalHolderAccess(tx, context, employeeId);
      await tx.execute(sql`SELECT set_config('celeriflow.actor_id',${context.user.id},true)`);
      if (data.acquisitionEnd < data.acquisitionStart || !Number.isInteger(data.days) || data.days <= 0) throw new Error("Aquisitivo/dias inválidos.");
      const [previous] = id ? await tx.select().from(vacations).where(eq(vacations.id, id)).for("update") : [];
      if (data.enjoymentStart && data.enjoymentEnd) await assertPersonnelPeriodOpen(tx, employeeId, data.enjoymentStart, data.enjoymentEnd);
      if (id) {
        if (!previous) throw new Error("Férias não encontradas.");
        if (previous.enjoymentStart && previous.enjoymentEnd) await assertPersonnelPeriodOpen(tx, employeeId, previous.enjoymentStart, previous.enjoymentEnd);
        if (previous.employeeId !== employeeId) throw new Error("Não é permitido trocar o titular de férias existentes.");
        if ((await tx.select({ id: hrRightEntries.id }).from(hrRightEntries).where(sql`${hrRightEntries.details}->>'vacationId' = ${id}`).limit(1)).length) throw new Error("Férias com reserva de direito exigem compensação da reserva; não edite a projeção diretamente.");
      }
      if (data.enjoymentStart && data.enjoymentEnd && ["Programada", "Em gozo", "Concluída"].includes(data.status)) await assertRhAbsenceDoesNotOverlap(tx, { employeeId, startsAt: data.enjoymentStart, endsAt: data.enjoymentEnd, kind: "FERIAS", excludeId: id || undefined });
      const [saved] = id ? await tx.update(vacations).set(data).where(eq(vacations.id, id)).returning() : await tx.insert(vacations).values(data).returning();
      await auditPersonnelMutation(tx, context.user.id, { employeeId, entity: "Vacation", id: saved.id, operation: previous ? "ALTERAR" : "INCLUIR", before: previous ?? null, after: saved });
    });

    revalidatePath("/rh/ferias");
    return { success: true };
  } catch (error) {
    console.error("Erro ao salvar férias:", error);
    return { success: false, error: error instanceof Error ? error.message : "Falha ao salvar as férias." };
  }
}

export async function deleteFerias(id: string) {
  const context = await getTenantContextForModuleOperation("RH", "delete");
  try {
    await withDatabaseTransaction(databaseConnection, async tx => {
      await lockPersonnel(tx, "functional-configuration");
      const [previous] = await tx.select().from(vacations).where(eq(vacations.id, id)).limit(1);
      if (!previous) throw new Error("Férias não encontradas.");
      await lockPersonnel(tx, `employee:${previous.employeeId}`);
      await assertFunctionalHolderAccess(tx, context, previous.employeeId);
      if (previous.enjoymentStart && previous.enjoymentEnd) await assertPersonnelPeriodOpen(tx, previous.employeeId, previous.enjoymentStart, previous.enjoymentEnd);
      await tx.execute(sql`SELECT set_config('celeriflow.actor_id',${context.user.id},true)`);
      if ((await tx.select({ id: hrRightEntries.id }).from(hrRightEntries).where(sql`${hrRightEntries.details}->>'vacationId' = ${id}`).limit(1)).length) throw new Error("Férias com reserva de direito não podem ser excluídas; use compensação.");
      await tx.delete(vacations).where(eq(vacations.id, id));
      await auditPersonnelMutation(tx, context.user.id, { employeeId: previous.employeeId, entity: "Vacation", id, operation: "EXCLUIR", before: previous, after: null });
    });
    revalidatePath("/rh/ferias");
    return { success: true };
  } catch (error) {
    console.error("Erro ao excluir férias:", error);
    return { success: false, error: error instanceof Error ? error.message : "Falha ao excluir o registro de férias." };
  }
}
