"use server";

import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { revalidatePath } from "next/cache";
import { eq, and, sql } from "drizzle-orm";
import { databaseConnection } from "@/db/client";
import { withDatabaseTransaction } from "@/db/transaction";
import { attendanceRecords } from "@/db/schema/personnel-records";
import { hrFunctionalRecords } from "@/db/schema/personnel-functional-management";
import { lockPersonnel } from "@/db/repositories/personnel/integration";
import { auditPersonnelMutation } from "@/lib/rh/personnel-mutation-audit";

export async function saveManualAttendance(formData: FormData) {
  const context = await getTenantContextForModuleOperation("RH", "create");
  try {
    const employeeId = formData.get("employeeId") as string;
    const dateStr = formData.get("date") as string;
    const status = (formData.get("status") as string) || "Presente";
    const hoursWorked = Number(formData.get("hoursWorked") || 8);
    const extraHours = Number(formData.get("extraHours") || 0);
    const justification = (formData.get("justification") as string)?.trim() || "";
    const legalBase = (formData.get("legalBase") as string)?.trim() || "Folha de Frequência Física / Ponto Manual";

    if (!employeeId || !dateStr) {
      return { success: false, error: "Servidor e Data são obrigatórios." };
    }

    if (status === "Falta" && (!justification || justification.length < 5)) {
      return {
        success: false,
        error: "Para lançamento de falta manual, a digitação do histórico da justificativa é obrigatória (Requisito 20.14).",
      };
    }

    const date = new Date(dateStr);
    const entryTime = new Date(date);
    entryTime.setHours(8, 0, 0, 0);
    const exitTime = new Date(date);
    exitTime.setHours(8 + hoursWorked, 0, 0, 0);

    const data = {
      employeeId,
      date,
      entryTime: status === "Presente" ? entryTime : null,
      exitTime: status === "Presente" ? exitTime : null,
      status,
      hoursWorked: status === "Presente" ? hoursWorked : 0,
      contractedHours: 8,
      extraHours,
      bankHours: 0,
    };

    await withDatabaseTransaction(databaseConnection, async (tx) => {
      await lockPersonnel(tx, "functional-configuration");
      await tx.execute(sql`SELECT set_config('celeriflow.actor_id', ${context.user.id}, true)`);

      const [existing] = await tx
        .select({ id: attendanceRecords.id })
        .from(attendanceRecords)
        .where(
          and(
            eq(attendanceRecords.employeeId, employeeId),
            sql`${attendanceRecords.date}::date = ${dateStr}::date`
          )
        )
        .limit(1);

      let targetId = existing?.id;
      if (existing) {
        await tx.update(attendanceRecords).set(data).where(eq(attendanceRecords.id, existing.id));
        await auditPersonnelMutation(tx, context.user.id, {
          employeeId,
          entity: "AttendanceRecord",
          id: existing.id,
          operation: "ALTERAR",
          before: null,
          after: { id: existing.id, ...data },
        });
      } else {
        const [created] = await tx.insert(attendanceRecords).values(data).returning();
        targetId = created.id;
        await auditPersonnelMutation(tx, context.user.id, {
          employeeId,
          entity: "AttendanceRecord",
          id: created.id,
          operation: "INCLUIR",
          before: null,
          after: created,
        });
      }

      if (targetId) {
        await tx
          .insert(hrFunctionalRecords)
          .values({
            kind: "OCORRENCIA_PONTO",
            employeeId,
            key: `PONTO:MANUAL:${targetId}`,
            name: `Frequência Manual - ${status}`,
            startsAt: date,
            endsAt: date,
            status: "ATIVO",
            version: 1,
            data: {
              attendanceId: targetId,
              punchType: "MANUAL",
              status,
              legalBase,
              justification: justification || "Lançamento de controle de frequência manual (Requisito 20.17)",
              recordedBy: context.user.name || context.user.id,
            },
            actorId: context.user.id,
          })
          .onConflictDoUpdate({
            target: [hrFunctionalRecords.key],
            set: {
              name: `Frequência Manual - ${status}`,
              data: {
                attendanceId: targetId,
                punchType: "MANUAL",
                status,
                legalBase,
                justification: justification || "Lançamento de controle de frequência manual (Requisito 20.17)",
                recordedBy: context.user.name || context.user.id,
              },
              updatedAt: new Date(),
            },
          });
      }
    });

    revalidatePath("/rh/ponto/frequencia");
    revalidatePath("/rh/ponto");
    revalidatePath("/rh/ponto/relatorios");

    return { success: true };
  } catch (error) {
    console.error("Erro ao registrar frequência manual:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Falha ao registrar frequência manual.",
    };
  }
}
