import { z } from "zod";
import { sql } from "drizzle-orm";
import { db, databaseConnection } from "@/db/client";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseExecutor } from "@/db/transaction";
import { activePortalEmployee, activePortalPolicies, portalCount, portalEvent, portalRequired, portalRows } from "@/db/repositories/portal-servidor/records";
import type { AttendanceRecord } from "@/lib/contracts/personnel";
import { createId } from "@/db/ids";
import { AccessError, type AppContext } from "@/lib/platform/tenant-context";
import { enqueueHrIntegration } from "@/lib/rh/workforce-service";
import { auditEventTypes } from "@/lib/platform/audit-evidence";
import { insertAuditEvent as writeAuditEvent } from "@/db/repositories/platform/audit";

export const functionalClockPolicySchema = z.object({
  origin: z.literal("REGISTRO_PONTO_FUNCIONAL"), employeeIds: z.array(z.string().min(1)).min(1),
  timeZone: z.string().min(1), contractedHours: z.number().positive().max(24),
  breakMinutes: z.number().int().min(0).max(1440), countOvertime: z.boolean(), maxShiftHours: z.number().positive().max(24),
  legalReference: z.string().trim().min(3).max(2000),
}).strict();

export async function getOwnClockPolicy(context: AppContext, executor: DatabaseExecutor = context.database ?? db) {
  const now = new Date();
  const rules = await activePortalPolicies(executor, now);
  const matching = rules.flatMap(rule => { const parsed = functionalClockPolicySchema.safeParse(rule.value); return parsed.success && parsed.data.employeeIds.includes(context.user.employeeId || "") ? [{ ruleId: rule.id, policy: parsed.data }] : []; });
  if (matching.length > 1) throw new Error("Há mais de uma política de marcação vigente para seu cadastro. Solicite conciliação ao RH.");
  if (!matching.length) return null;
  new Intl.DateTimeFormat("pt-BR", { timeZone: matching[0].policy.timeZone }).format(now);
  return matching[0];
}

export async function recordOwnClock(context: AppContext, raw: unknown, connection: DatabaseConnection = databaseConnection) {
  const input = z.object({ requestKey: z.string().min(1).max(160), kind: z.enum(["ENTRY", "EXIT"]) }).strict().parse(raw);
  if (!context.user.employeeId) throw new AccessError("Conta sem vínculo funcional.", 403);
  const employeeId = context.user.employeeId;
  return withDatabaseTransaction(connection, async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`RH:employee:${employeeId}`}))`);
    if (!await activePortalEmployee(tx, employeeId)) throw new AccessError("Cadastro funcional inativo.", 403);
    const sourceKey = `PORTAL:PONTO:${input.requestKey}`;
    const previous = await portalEvent(tx, sql`"sourceKey"=${sourceKey}`);
    if (previous) {
      const stored = previous.payload as { employeeId: string; actorId: string; kind: string; attendanceId: string; recordedAt: string };
      if (stored.employeeId !== employeeId || stored.actorId !== context.user.id || stored.kind !== input.kind) throw new Error("Chave de marcação reutilizada com outros dados.");
      return { id: stored.attendanceId, recordedAt: stored.recordedAt };
    }
    const configured = await getOwnClockPolicy(context, tx);
    if (!configured) throw new AccessError("Registro de ponto não habilitado individualmente pelo RH.", 403);
    const { policy } = configured, now = new Date();
    const parts = new Intl.DateTimeFormat("en", { timeZone: policy.timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
    const get = (type: string) => parts.find(part => part.type === type)!.value;
    const date = new Date(`${get("year")}-${get("month")}-${get("day")}T00:00:00Z`);
    const records = await portalRows<AttendanceRecord>(tx, sql`SELECT * FROM "AttendanceRecord" WHERE "employeeId"=${employeeId} AND ${input.kind === "ENTRY" ? sql`date=${date}` : sql`"exitTime" IS NULL AND "entryTime">=${new Date(now.getTime() - policy.maxShiftHours * 3600000)} AND "entryTime"<=${now}`} ORDER BY id ASC`);
    if (records.length > 1) throw new Error("Há registros concorrentes no dia. Solicite conciliação ao RH.");
    let record = records[0]; const before = record || null;
    const referenceDate = record?.date || date;
    const competence = `${String(referenceDate.getUTCMonth() + 1).padStart(2, "0")}/${referenceDate.getUTCFullYear()}`;
    if (await portalCount(tx, sql`SELECT count(*) FROM "Payroll" p WHERE p.competence=${competence} AND p.status IN ('Fechada','Paga') AND EXISTS(SELECT 1 FROM "PayrollItem" i WHERE i."payrollId"=p.id AND i."employeeId"=${employeeId})`)) throw new Error("Competência fechada exige conciliação de ponto pelo RH.");
    if (input.kind === "ENTRY") {
      if (record) throw new Error("O dia já possui registro de ponto. Utilize saída ou solicite ajuste ao RH.");
      const leave = await portalCount(tx, sql`SELECT count(*) FROM "Leave" WHERE "employeeId"=${employeeId} AND status='Ativa' AND "startDate"<=${date} AND "endDate">=${date}`);
      const vacation = await portalCount(tx, sql`SELECT count(*) FROM "Vacation" WHERE "employeeId"=${employeeId} AND status IN ('Programada','Em gozo') AND "enjoymentStart"<=${date} AND "enjoymentEnd">=${date}`);
      if (leave || vacation) throw new Error("Marcação de entrada conflita com afastamento ou férias. Solicite análise ao RH.");
      record = await portalRequired<AttendanceRecord>(tx, sql`INSERT INTO "AttendanceRecord" (id,"employeeId",date,"entryTime",status,"contractedHours","hoursWorked","extraHours","bankHours","updatedAt") VALUES (${createId()},${employeeId},${date},${now},'Presente',${policy.contractedHours},0,0,0,${new Date()}) RETURNING *`);
    } else {
      if (!record?.entryTime || record.exitTime) throw new Error("Não há entrada aberta neste dia para registrar saída.");
      const original = await portalEvent(tx, sql`"eventType"='PONTO_FUNCIONAL_REGISTRADO' AND payload->>'attendanceId'=${record.id}`);
      if (!original) throw new Error("Registro de outra origem exige ajuste pelo RH.");
      const snapshot = original.payload as { policy: unknown; after: { updatedAt: string } };
      if (JSON.stringify(snapshot.policy) !== JSON.stringify(policy) || snapshot.after.updatedAt !== record.updatedAt.toISOString()) throw new Error("Política ou ponto alterado desde a entrada. Solicite conciliação ao RH.");
      const elapsed = (now.getTime() - record.entryTime.getTime()) / 3600000;
      if (elapsed <= 0 || elapsed > policy.maxShiftHours) throw new Error("Intervalo fora da política vigente. Solicite ajuste ao RH.");
      if (await portalCount(tx, sql`SELECT count(*) FROM "HrMovement" WHERE "sourceKey"=${`PONTO:HORAS_EXTRAS:${record.id}`}`)) throw new Error("Registro integrado à folha exige conciliação pelo RH.");
      const hoursWorked = Math.round(Math.max(0, elapsed - policy.breakMinutes / 60) * 10000) / 10000;
      record = await portalRequired<AttendanceRecord>(tx, sql`UPDATE "AttendanceRecord" SET "exitTime"=${now}, "hoursWorked"=${hoursWorked}, "extraHours"=${policy.countOvertime ? Math.round(Math.max(0, hoursWorked - policy.contractedHours) * 10000) / 10000 : 0}, "updatedAt"=${new Date()} WHERE id=${record.id} RETURNING *`);
    }
    await enqueueHrIntegration(tx, { sourceKey, domain: "AUDITORIA", environment: "INTERNO", eventType: "PONTO_FUNCIONAL_REGISTRADO", payload: { employeeId, actorId: context.user.id, kind: input.kind, attendanceId: record.id, recordedAt: now.toISOString(), ruleId: configured.ruleId, policy, before, after: record } });
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "EMPLOYEE_CLOCK", targetId: record.id });
    return { id: record.id, recordedAt: now.toISOString() };
  });
}
