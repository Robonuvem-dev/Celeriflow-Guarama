"use server";

import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { revalidatePath } from "next/cache";
import { eq, and, sql, inArray } from "drizzle-orm";
import { databaseConnection } from "@/db/client";
import { withDatabaseTransaction } from "@/db/transaction";
import { attendanceRecords, vacations, leaves } from "@/db/schema/personnel-records";
import { employees } from "@/db/schema/administration";
import { hrReferenceRecords } from "@/db/schema/personnel-reference-records";
import { hrIntegrationEvents } from "@/db/schema/personnel-workforce";
import { lockPersonnel } from "@/db/repositories/personnel/integration";
import { auditPersonnelMutation } from "@/lib/rh/personnel-mutation-audit";

export async function generateAutomaticScale(formData: FormData) {
  const context = await getTenantContextForModuleOperation("RH", "create");
  try {
    const scope = (formData.get("scope") as string) || "TODOS";
    const targetId = (formData.get("targetId") as string) || "";
    const month = (formData.get("month") as string) || new Date().toISOString().slice(0, 7);
    const scaleType = (formData.get("scaleType") as string) || "ADMINISTRATIVO_5X2";
    const rangeId = formData.get("rangeId") as string | null;
    const skipHolidays = formData.get("skipHolidays") === "true";
    const skipLeaves = formData.get("skipLeaves") === "true";

    const [yearStr, monthStr] = month.split("-");
    const year = parseInt(yearStr, 10);
    const monthIndex = parseInt(monthStr, 10) - 1;
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

    // Determine target employees
    let employeeQuery = databaseConnection
      .select({ id: employees.id, name: employees.name, registration: employees.registration })
      .from(employees)
      .where(eq(employees.isActive, true));

    if (scope === "SERVIDOR" && targetId) {
      employeeQuery = databaseConnection
        .select({ id: employees.id, name: employees.name, registration: employees.registration })
        .from(employees)
        .where(and(eq(employees.isActive, true), eq(employees.id, targetId)));
    } else if (scope === "DEPARTAMENTO" && targetId) {
      employeeQuery = databaseConnection
        .select({ id: employees.id, name: employees.name, registration: employees.registration })
        .from(employees)
        .where(and(eq(employees.isActive, true), eq(employees.departmentId, targetId)));
    }

    const targetEmployees = await employeeQuery;
    if (targetEmployees.length === 0) {
      return { success: false, error: "Nenhum servidor ativo elegível encontrado no escopo selecionado." };
    }

    // Load holidays if requested
    const holidaysSet = new Set<string>();
    if (skipHolidays) {
      const holidays = await databaseConnection
        .select()
        .from(hrReferenceRecords)
        .where(eq(hrReferenceRecords.kind, "FERIADO"));
      for (const h of holidays) {
        const d = (h.details as Record<string, string>)?.date;
        if (d) holidaysSet.add(d);
      }
    }

    let defaultEntryHour = 8;
    let defaultExitHour = 17;
    let dailyContracted = 8;
    let weekdaysPattern: number[] = [1, 2, 3, 4, 5]; // Mon-Fri

    if (scaleType === "PLANTAO_12X36_IMPAR" || scaleType === "PLANTAO_12X36_PAR") {
      defaultEntryHour = 7;
      defaultExitHour = 19;
      dailyContracted = 12;
    } else if (scaleType === "TURNO_6X1") {
      defaultEntryHour = 7;
      defaultExitHour = 14;
      dailyContracted = 6.75;
      weekdaysPattern = [1, 2, 3, 4, 5, 6];
    } else if (scaleType === "FAIXA_EXISTENTE" && rangeId) {
      const [faixa] = await databaseConnection
        .select()
        .from(hrReferenceRecords)
        .where(and(eq(hrReferenceRecords.id, rangeId), eq(hrReferenceRecords.kind, "FAIXA")))
        .limit(1);
      if (faixa) {
        const details = (faixa.details as Record<string, string>) || {};
        if (details.start) defaultEntryHour = parseInt(details.start.slice(0, 2), 10);
        if (details.end) defaultExitHour = parseInt(details.end.slice(0, 2), 10);
      }
    }

    let totalDaysGenerated = 0;

    await withDatabaseTransaction(databaseConnection, async (tx) => {
      await lockPersonnel(tx, "functional-configuration");
      await tx.execute(sql`SELECT set_config('celeriflow.actor_id', ${context.user.id}, true)`);

      for (const emp of targetEmployees) {
        // Save or update reference ESCALA in hrReferenceRecords
        const fromDateStr = `${month}-01`;
        const untilDateStr = `${month}-${String(daysInMonth).padStart(2, "0")}`;
        const scaleKey = `ESCALA_AUTO:${emp.id}:${month}`;

        await tx
          .insert(hrReferenceRecords)
          .values({
            kind: "ESCALA",
            code: scaleKey,
            name: `Escala Automática ${month} - ${scaleType}`,
            details: {
              employeeId: emp.id,
              rangeId: rangeId || "PADRAO",
              weekdays: weekdaysPattern.join(","),
              from: fromDateStr,
              until: untilDateStr,
              scaleType,
            },
          })
          .onConflictDoUpdate({
            target: [hrReferenceRecords.kind, hrReferenceRecords.code],
            set: {
              name: `Escala Automática ${month} - ${scaleType}`,
              details: {
                employeeId: emp.id,
                rangeId: rangeId || "PADRAO",
                weekdays: weekdaysPattern.join(","),
                from: fromDateStr,
                until: untilDateStr,
                scaleType,
              },
              updatedAt: new Date(),
            },
          });

        // Generate planned attendance entries for each matching day of month
        for (let day = 1; day <= daysInMonth; day++) {
          const date = new Date(year, monthIndex, day);
          const dateStr = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const isodow = date.getDay() === 0 ? 7 : date.getDay(); // 1=Mon, 7=Sun

          if (skipHolidays && holidaysSet.has(dateStr)) continue;

          let isWorkingDay = false;
          if (scaleType === "ADMINISTRATIVO_5X2") {
            isWorkingDay = isodow >= 1 && isodow <= 5;
          } else if (scaleType === "PLANTAO_12X36_IMPAR") {
            isWorkingDay = day % 2 !== 0;
          } else if (scaleType === "PLANTAO_12X36_PAR") {
            isWorkingDay = day % 2 === 0;
          } else if (scaleType === "TURNO_6X1") {
            isWorkingDay = day % 7 !== 0;
          } else {
            isWorkingDay = weekdaysPattern.includes(isodow);
          }

          if (!isWorkingDay) continue;

          // Check if already exists
          const [existing] = await tx
            .select({ id: attendanceRecords.id })
            .from(attendanceRecords)
            .where(
              and(
                eq(attendanceRecords.employeeId, emp.id),
                sql`${attendanceRecords.date}::date = ${dateStr}::date`
              )
            )
            .limit(1);

          if (!existing) {
            const entryTime = new Date(date);
            entryTime.setHours(defaultEntryHour, 0, 0, 0);

            const exitTime = new Date(date);
            exitTime.setHours(defaultExitHour, 0, 0, 0);

            const [created] = await tx
              .insert(attendanceRecords)
              .values({
                employeeId: emp.id,
                date,
                entryTime,
                exitTime,
                status: "Presente",
                hoursWorked: dailyContracted,
                contractedHours: dailyContracted,
                extraHours: 0,
                bankHours: 0,
              })
              .returning();

            totalDaysGenerated++;

            await auditPersonnelMutation(tx, context.user.id, {
              employeeId: emp.id,
              entity: "AttendanceRecord",
              id: created.id,
              operation: "INCLUIR",
              before: null,
              after: created,
            });
          }
        }
      }

      await tx.insert(hrIntegrationEvents).values({
        sourceKey: `PONTO:ESCALA_AUTOMATICA:${Date.now()}`,
        domain: "AUDITORIA",
        environment: "PORTAL_RH",
        eventType: "GERACAO_ESCALA_AUTOMATICA",
        status: "PROCESSADO",
        payload: {
          scaleType,
          month,
          employeesCount: targetEmployees.length,
          totalDaysGenerated,
          generatedBy: context.user.name || context.user.id,
        },
      });
    });

    revalidatePath("/rh/ponto/escalas");
    revalidatePath("/rh/ponto");
    revalidatePath("/rh/ponto/relatorios");

    return {
      success: true,
      employeesCount: targetEmployees.length,
      daysGenerated: totalDaysGenerated,
    };
  } catch (error) {
    console.error("Erro na geração de escala automática:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Falha ao gerar escala automática.",
    };
  }
}
