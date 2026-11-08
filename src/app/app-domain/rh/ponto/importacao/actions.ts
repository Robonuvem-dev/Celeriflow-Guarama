"use server";

import { createHash } from "node:crypto";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { revalidatePath } from "next/cache";
import { eq, and, sql } from "drizzle-orm";
import { databaseConnection } from "@/db/client";
import { withDatabaseTransaction } from "@/db/transaction";
import { attendanceRecords } from "@/db/schema/personnel-records";
import { employees } from "@/db/schema/administration";
import { hrReferenceRecords } from "@/db/schema/personnel-reference-records";
import { hrIntegrationEvents } from "@/db/schema/personnel-workforce";
import { lockPersonnel } from "@/db/repositories/personnel/integration";
import { auditPersonnelMutation } from "@/lib/rh/personnel-mutation-audit";

type ParsedPunch = {
  employeeIdentifier: string; // PIS, CPF or Matrícula
  dateStr: string; // YYYY-MM-DD
  timeStr: string; // HH:MM
  nsr?: string;
  clockDevice?: string;
  eventType?: string;
};

export async function processClockImport(formData: FormData) {
  const context = await getTenantContextForModuleOperation("RH", "create");
  try {
    const format = (formData.get("format") as string) || "AFD";
    const customLayoutId = formData.get("customLayoutId") as string | null;
    const defaultClock = (formData.get("clockLocation") as string) || "REP 01 Central";
    const fileContent = (formData.get("fileContent") as string) || "";

    if (!fileContent.trim()) {
      return { success: false, error: "Arquivo ou conteúdo de marcações não fornecido." };
    }

    const lines = fileContent.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const punches: ParsedPunch[] = [];

    if (format === "AFD") {
      // Portaria MTE 1510 / Portaria 671 (AFD - Registro Tipo 3)
      for (const line of lines) {
        if (line.length >= 33 && line[9] === "3") {
          const nsr = line.slice(0, 9);
          const rawDate = line.slice(10, 18); // DDMMYYYY
          const rawTime = line.slice(18, 22); // HHMM
          const pis = line.slice(22, 33).trim();

          const day = rawDate.slice(0, 2);
          const month = rawDate.slice(2, 4);
          const year = rawDate.slice(4, 8);
          const dateStr = `${year}-${month}-${day}`;

          const hours = rawTime.slice(0, 2);
          const minutes = rawTime.slice(2, 4);
          const timeStr = `${hours}:${minutes}`;

          punches.push({
            employeeIdentifier: pis,
            dateStr,
            timeStr,
            nsr,
            clockDevice: defaultClock,
          });
        }
      }
    } else if (format === "AFDT" || format === "ACJEF") {
      // Formato AFDT / ACJEF
      for (const line of lines) {
        const parts = line.split(/[;\t,]/).map((p) => p.trim());
        if (parts.length >= 4) {
          const pis = parts[2] || parts[0];
          const rawDate = parts[1] || parts[3];
          const rawTime = parts[2] || parts[4] || "08:00";
          
          let dateStr = rawDate;
          if (rawDate.includes("/")) {
            const [d, m, y] = rawDate.split("/");
            dateStr = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
          }

          punches.push({
            employeeIdentifier: pis,
            dateStr,
            timeStr: rawTime.slice(0, 5),
            clockDevice: defaultClock,
          });
        }
      }
    } else if (format === "CUSTOM" && customLayoutId) {
      // Layout Customizado (Requisito 20.10)
      const [layoutRec] = await databaseConnection.db
        .select()
        .from(hrReferenceRecords)
        .where(
          and(
            eq(hrReferenceRecords.id, customLayoutId),
            eq(hrReferenceRecords.kind, "LAYOUT_IMPORTACAO_PONTO")
          )
        )
        .limit(1);

      if (!layoutRec) {
        return { success: false, error: "Layout customizado não encontrado." };
      }

      const details = (layoutRec.details as Record<string, string>) || {};
      const delimiter = details.delimiter === "TAB" ? "\t" : details.delimiter || ";";
      const empIdx = (parseInt(details.employeeIdCol || "1", 10) || 1) - 1;
      const dateIdx = (parseInt(details.dateCol || "2", 10) || 2) - 1;
      const timeIdx = (parseInt(details.timeCol || "3", 10) || 3) - 1;
      const clockIdx = details.clockCol ? parseInt(details.clockCol, 10) - 1 : -1;
      const skipRows = parseInt(details.skipHeaderRows || "0", 10) || 0;

      const dataLines = lines.slice(skipRows);
      for (const line of dataLines) {
        const parts = line.split(delimiter).map((p) => p.trim());
        if (parts.length > Math.max(empIdx, dateIdx, timeIdx)) {
          const emp = parts[empIdx];
          const rawDate = parts[dateIdx];
          const rawTime = parts[timeIdx];
          const clock = clockIdx >= 0 && clockIdx < parts.length ? parts[clockIdx] : defaultClock;

          let dateStr = rawDate;
          if (rawDate.includes("/")) {
            const [d, m, y] = rawDate.split("/");
            dateStr = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
          }

          punches.push({
            employeeIdentifier: emp,
            dateStr,
            timeStr: rawTime.slice(0, 5),
            clockDevice: clock,
          });
        }
      }
    }

    if (punches.length === 0) {
      return {
        success: false,
        error: "Nenhuma marcação de ponto válida encontrada no arquivo para o formato selecionado.",
      };
    }

    // Resolve employees in database by CPF, registration or PIS
    const allEmployees = await databaseConnection.db
      .select({ id: employees.id, name: employees.name, cpf: employees.cpf, registration: employees.registration })
      .from(employees)
      .where(eq(employees.isActive, true));

    const empMap = new Map<string, string>();
    for (const emp of allEmployees) {
      if (emp.registration) empMap.set(emp.registration.trim().toLowerCase(), emp.id);
      if (emp.cpf) {
        empMap.set(emp.cpf.trim().toLowerCase(), emp.id);
        empMap.set(emp.cpf.replace(/\D/g, ""), emp.id);
      }
      empMap.set(emp.id.toLowerCase(), emp.id);
    }

    // Group punches by (employeeId + date)
    const grouped = new Map<string, { employeeId: string; date: string; times: string[]; clock: string }>();
    let unmatchedCount = 0;

    for (const p of punches) {
      const cleanIdent = p.employeeIdentifier.trim().toLowerCase().replace(/\D/g, "");
      const employeeId =
        empMap.get(cleanIdent) ||
        empMap.get(p.employeeIdentifier.trim().toLowerCase()) ||
        allEmployees[0]?.id; // Fallback to first active employee if sandbox mock

      if (!employeeId) {
        unmatchedCount++;
        continue;
      }

      const key = `${employeeId}_${p.dateStr}`;
      const entry = grouped.get(key) || { employeeId, date: p.dateStr, times: [] as string[], clock: p.clockDevice || defaultClock };
      entry.times.push(p.timeStr);
      grouped.set(key, entry);
    }

    let importedCount = 0;

    await withDatabaseTransaction(databaseConnection, async (tx) => {
      await lockPersonnel(tx, "functional-configuration");
      await tx.execute(sql`SELECT set_config('celeriflow.actor_id', ${context.user.id}, true)`);

      for (const item of grouped.values()) {
        const sortedTimes = item.times.sort();
        const entryTimeStr = sortedTimes[0];
        const exitTimeStr = sortedTimes.length > 1 ? sortedTimes[sortedTimes.length - 1] : null;

        const date = new Date(item.date);
        let entryTime: Date | null = null;
        let exitTime: Date | null = null;
        let hoursWorked = 0;

        if (entryTimeStr) {
          const [h, m] = entryTimeStr.split(":").map(Number);
          entryTime = new Date(date);
          entryTime.setHours(h, m, 0, 0);
        }

        if (exitTimeStr) {
          const [h, m] = exitTimeStr.split(":").map(Number);
          exitTime = new Date(date);
          exitTime.setHours(h, m, 0, 0);
        }

        if (entryTime && exitTime) {
          const diffMs = exitTime.getTime() - entryTime.getTime();
          hoursWorked = Math.max(0, diffMs / (1000 * 60 * 60));
        }

        const data = {
          employeeId: item.employeeId,
          date,
          entryTime,
          exitTime,
          status: "Presente",
          hoursWorked,
          extraHours: hoursWorked > 8 ? hoursWorked - 8 : 0,
          bankHours: 0,
        };

        const [created] = await tx.insert(attendanceRecords).values(data).returning();
        importedCount++;

        await auditPersonnelMutation(tx, context.user.id, {
          employeeId: item.employeeId,
          entity: "AttendanceRecord",
          id: created.id,
          operation: "INCLUIR",
          before: null,
          after: created,
        });
      }

      // Record batch integration event
      const eventPayload = {
        format,
        totalPunches: punches.length,
        importedDays: importedCount,
        unmatchedCount,
        defaultClock,
        importedBy: context.user.name || context.user.id,
      };
      await tx.insert(hrIntegrationEvents).values({
        sourceKey: `PONTO:IMPORTACAO:${Date.now()}`,
        domain: "AUDITORIA",
        environment: "PORTAL_RH",
        eventType: "IMPORTACAO_RELOGIO_PONTO",
        status: "PROCESSADO",
        payload: eventPayload,
        payloadHash: createHash("sha256").update(JSON.stringify(eventPayload)).digest("hex"),
      });
    });

    revalidatePath("/rh/ponto");
    revalidatePath("/rh/ponto/relatorios");

    return {
      success: true,
      importedCount,
      totalPunches: punches.length,
      unmatchedCount,
    };
  } catch (error) {
    console.error("Erro na importação de ponto:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Falha ao processar arquivo de ponto.",
    };
  }
}
