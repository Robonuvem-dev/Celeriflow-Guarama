"use server";

import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { revalidatePath } from "next/cache";
import { eq, inArray, sql } from "drizzle-orm";
import { databaseConnection } from "@/db/client";
import { withDatabaseTransaction } from "@/db/transaction";
import { attendanceRecords } from "@/db/schema/personnel-records";
import { hrIntegrationEvents } from "@/db/schema/personnel-workforce";


export async function savePonto(formData: FormData) {
  const id = formData.get("id") as string | null;
  await getTenantContextForModuleOperation("RH", id ? "update" : "create");
  try {
    const employeeId = formData.get("employeeId") as string;
    const dateStr = formData.get("date") as string;
    const entryTimeStr = formData.get("entryTime") as string; // "08:00"
    const exitTimeStr = formData.get("exitTime") as string; // "17:00"
    const status = formData.get("status") as string;
    const extraHours = Number(formData.get("extraHours") || 0);
    const bankHours = Number(formData.get("bankHours") || 0);

    if (!employeeId || !dateStr) {
      return { success: false, error: "Servidor e Data são obrigatórios." };
    }

    const date = new Date(dateStr);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== dateStr) throw new Error("Data civil inválida.");
    if (!["Presente", "Falta", "Atraso", "Férias", "Licença"].includes(status)) throw new Error("Situação do ponto inválida.");
    if (!Number.isFinite(extraHours) || extraHours < 0 || extraHours > 24 || Number(extraHours.toFixed(4)) !== extraHours) throw new Error("Horas extras reconhecidas devem estar entre 0 e 24, com até quatro casas.");
    if (!Number.isFinite(bankHours) || Math.abs(bankHours) > 24 || Number(bankHours.toFixed(4)) !== bankHours) throw new Error("Banco de horas reconhecido deve estar entre -24 e 24, com até quatro casas.");
    for (const time of [entryTimeStr, exitTimeStr]) if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error("Horário inválido.");
    
    // Convert times to proper Date objects if provided
    let entryTime: Date | null = null;
    let exitTime: Date | null = null;
    let hoursWorked = 0;

    if (entryTimeStr) {
      const [hours, minutes] = entryTimeStr.split(":").map(Number);
      entryTime = new Date(date);
      entryTime.setHours(hours, minutes, 0, 0);
    }

    if (exitTimeStr) {
      const [hours, minutes] = exitTimeStr.split(":").map(Number);
      exitTime = new Date(date);
      exitTime.setHours(hours, minutes, 0, 0);
    }

    if (entryTime && exitTime) {
      if (exitTime < entryTime) exitTime.setDate(exitTime.getDate() + 1);
      // Calculate hours worked
      const diffMs = exitTime.getTime() - entryTime.getTime();
      hoursWorked = Math.max(0, diffMs / (1000 * 60 * 60));
    }

    const data = {
      employeeId,
      date,
      entryTime,
      exitTime,
      status: status || "Presente",
      hoursWorked,
      extraHours,
      bankHours,
    };

    await withDatabaseTransaction(databaseConnection, async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`RH:employee:${employeeId}`}))`);
      if (id) {
        const [previous] = await tx.select().from(attendanceRecords).where(eq(attendanceRecords.id, id)).for("update");
        if (!previous) throw new Error("Ponto não encontrado.");
        if (previous.employeeId !== employeeId) throw new Error("Não é permitido trocar o titular do ponto.");
        const [integration] = await tx.select({ id: hrIntegrationEvents.id }).from(hrIntegrationEvents).where(inArray(hrIntegrationEvents.sourceKey, [`PONTO:HORAS_EXTRAS:${id}`, `PONTO:BANCO_HORAS:${id}`])).limit(1);
        if (integration) throw new Error("Ponto com reflexo na folha/direitos exige ajuste compensatório, preservando a origem.");
        await tx.update(attendanceRecords).set(data).where(eq(attendanceRecords.id, id));
      } else await tx.insert(attendanceRecords).values(data);
    });

    revalidatePath("/rh/ponto");
    return { success: true };
  } catch (error) {
    console.error("Erro ao salvar registro de ponto:", error);
    return { success: false, error: error instanceof Error ? error.message : "Falha ao salvar o registro de ponto." };
  }
}

export async function deletePonto(id: string) {
  await getTenantContextForModuleOperation("RH", "delete");
  try {
    await withDatabaseTransaction(databaseConnection, async tx => {
      const [previous] = await tx.select().from(attendanceRecords).where(eq(attendanceRecords.id, id)).limit(1);
      if (!previous) throw new Error("Ponto não encontrado.");
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`RH:employee:${previous.employeeId}`}))`);
      await tx.select({ id: attendanceRecords.id }).from(attendanceRecords).where(eq(attendanceRecords.id, id)).for("update");
      const [integration] = await tx.select({ id: hrIntegrationEvents.id }).from(hrIntegrationEvents).where(inArray(hrIntegrationEvents.sourceKey, [`PONTO:HORAS_EXTRAS:${id}`, `PONTO:BANCO_HORAS:${id}`])).limit(1);
      if (integration) throw new Error("Ponto com reflexo na folha/direitos não pode ser excluído.");
      const deleted = await tx.delete(attendanceRecords).where(eq(attendanceRecords.id, id)).returning({ id: attendanceRecords.id });
      if (!deleted.length) throw new Error("Ponto não encontrado.");
    });
    revalidatePath("/rh/ponto");
    return { success: true };
  } catch (error) {
    console.error("Erro ao excluir registro de ponto:", error);
    return { success: false, error: error instanceof Error ? error.message : "Falha ao excluir o registro de ponto." };
  }
}
