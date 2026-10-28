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

export async function saveFerias(formData: FormData) {
  const id = formData.get("id") as string | null;
  await getTenantContextForModuleOperation("RH", id ? "update" : "create");
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
      await lockPersonnel(tx, `employee:${employeeId}`);
      if (data.acquisitionEnd < data.acquisitionStart || !Number.isInteger(data.days) || data.days <= 0) throw new Error("Aquisitivo/dias inválidos.");
      if (id) {
        const [previous] = await tx.select().from(vacations).where(eq(vacations.id, id)).limit(1);
        if (!previous) throw new Error("Férias não encontradas.");
        if (previous.employeeId !== employeeId) throw new Error("Não é permitido trocar o titular de férias existentes.");
        if ((await tx.select({ id: hrRightEntries.id }).from(hrRightEntries).where(sql`${hrRightEntries.details}->>'vacationId' = ${id}`).limit(1)).length) throw new Error("Férias com reserva de direito exigem compensação da reserva; não edite a projeção diretamente.");
      }
      if (data.enjoymentStart && data.enjoymentEnd && ["Programada", "Em gozo", "Concluída"].includes(data.status)) await assertRhAbsenceDoesNotOverlap(tx, { employeeId, startsAt: data.enjoymentStart, endsAt: data.enjoymentEnd, kind: "FERIAS", excludeId: id || undefined });
      if (id) await tx.update(vacations).set(data).where(eq(vacations.id, id));
      else await tx.insert(vacations).values(data);
    });

    revalidatePath("/rh/ferias");
    return { success: true };
  } catch (error) {
    console.error("Erro ao salvar férias:", error);
    return { success: false, error: error instanceof Error ? error.message : "Falha ao salvar as férias." };
  }
}

export async function deleteFerias(id: string) {
  await getTenantContextForModuleOperation("RH", "delete");
  try {
    await withDatabaseTransaction(databaseConnection, async tx => {
      const [previous] = await tx.select().from(vacations).where(eq(vacations.id, id)).limit(1);
      if (!previous) throw new Error("Férias não encontradas.");
      await lockPersonnel(tx, `employee:${previous.employeeId}`);
      if ((await tx.select({ id: hrRightEntries.id }).from(hrRightEntries).where(sql`${hrRightEntries.details}->>'vacationId' = ${id}`).limit(1)).length) throw new Error("Férias com reserva de direito não podem ser excluídas; use compensação.");
      await tx.delete(vacations).where(eq(vacations.id, id));
    });
    revalidatePath("/rh/ferias");
    return { success: true };
  } catch (error) {
    console.error("Erro ao excluir férias:", error);
    return { success: false, error: error instanceof Error ? error.message : "Falha ao excluir o registro de férias." };
  }
}
