"use server";

import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { revalidatePath } from "next/cache";
import { assertRhAbsenceDoesNotOverlap } from "@/lib/rh/absence-conflicts";

async function getTenantPrisma(operation: "create" | "update" | "delete") {
  return (await getTenantContextForModuleOperation("RH", operation)).prisma;
}

export async function saveFerias(formData: FormData) {
  const id = formData.get("id") as string | null;
  const prisma = await getTenantPrisma(id ? "update" : "create");
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

    await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`RH:employee:${employeeId}`}))`;
      if (data.acquisitionEnd < data.acquisitionStart || !Number.isInteger(data.days) || data.days <= 0) throw new Error("Aquisitivo/dias inválidos.");
      if (id) {
        const previous = await tx.vacation.findUniqueOrThrow({ where: { id } });
        if (previous.employeeId !== employeeId) throw new Error("Não é permitido trocar o titular de férias existentes.");
        if (await tx.hrRightEntry.findFirst({ where: { details: { path: ["vacationId"], equals: id } } })) throw new Error("Férias com reserva de direito exigem compensação da reserva; não edite a projeção diretamente.");
      }
      if (data.enjoymentStart && data.enjoymentEnd && ["Programada", "Em gozo", "Concluída"].includes(data.status)) await assertRhAbsenceDoesNotOverlap(tx, { employeeId, startsAt: data.enjoymentStart, endsAt: data.enjoymentEnd, kind: "FERIAS", excludeId: id || undefined });
      if (id) await tx.vacation.update({ where: { id }, data });
      else await tx.vacation.create({ data });
    });

    revalidatePath("/rh/ferias");
    return { success: true };
  } catch (error) {
    console.error("Erro ao salvar férias:", error);
    return { success: false, error: error instanceof Error ? error.message : "Falha ao salvar as férias." };
  }
}

export async function deleteFerias(id: string) {
  const prisma = await getTenantPrisma("delete");
  try {
    await prisma.$transaction(async tx => {
      const previous = await tx.vacation.findUniqueOrThrow({ where: { id } });
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`RH:employee:${previous.employeeId}`}))`;
      if (await tx.hrRightEntry.findFirst({ where: { details: { path: ["vacationId"], equals: id } } })) throw new Error("Férias com reserva de direito não podem ser excluídas; use compensação.");
      await tx.vacation.delete({ where: { id } });
    });
    revalidatePath("/rh/ferias");
    return { success: true };
  } catch (error) {
    console.error("Erro ao excluir férias:", error);
    return { success: false, error: error instanceof Error ? error.message : "Falha ao excluir o registro de férias." };
  }
}
