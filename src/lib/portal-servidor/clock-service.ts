import { z } from "zod";
import { AccessError, type AppContext } from "@/lib/platform/tenant-context";
import { enqueueHrIntegration } from "@/lib/rh/workforce-service";
import { auditEventTypes, writeAuditEvent } from "@/lib/platform/audit-evidence";

export const functionalClockPolicySchema = z.object({
  origin: z.literal("REGISTRO_PONTO_FUNCIONAL"), employeeIds: z.array(z.string().min(1)).min(1),
  timeZone: z.string().min(1), contractedHours: z.number().positive().max(24),
  breakMinutes: z.number().int().min(0).max(1440), countOvertime: z.boolean(), maxShiftHours: z.number().positive().max(24),
  legalReference: z.string().trim().min(3).max(2000),
}).strict();

export async function getOwnClockPolicy(context: AppContext, db: Pick<AppContext["prisma"], "hrPayrollRule"> = context.prisma) {
  const now = new Date();
  const rules = await db.hrPayrollRule.findMany({ where: { category: "PORTAL", isActive: true, valueType: "JSON", ruleSet: { status: "ATIVA", effectiveFrom: { lte: now }, OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: now } }] } } });
  const matching = rules.flatMap(rule => { const parsed = functionalClockPolicySchema.safeParse(rule.value); return parsed.success && parsed.data.employeeIds.includes(context.user.employeeId || "") ? [{ ruleId: rule.id, policy: parsed.data }] : []; });
  if (matching.length > 1) throw new Error("Há mais de uma política de marcação vigente para seu cadastro. Solicite conciliação ao RH.");
  if (!matching.length) return null;
  new Intl.DateTimeFormat("pt-BR", { timeZone: matching[0].policy.timeZone }).format(now);
  return matching[0];
}

export async function recordOwnClock(context: AppContext, raw: unknown) {
  const input = z.object({ requestKey: z.string().min(1).max(160), kind: z.enum(["ENTRY", "EXIT"]) }).strict().parse(raw);
  if (!context.user.employeeId) throw new AccessError("Conta sem vínculo funcional.", 403);
  const employeeId = context.user.employeeId;
  return context.prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`RH:employee:${employeeId}`}))`;
    if (!await tx.employee.findFirst({ where: { id: employeeId, isActive: true } })) throw new AccessError("Cadastro funcional inativo.", 403);
    const sourceKey = `PORTAL:PONTO:${input.requestKey}`;
    const previous = await tx.hrIntegrationEvent.findUnique({ where: { sourceKey } });
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
    const records = await tx.attendanceRecord.findMany({ where: input.kind === "ENTRY" ? { employeeId, date } : { employeeId, exitTime: null, entryTime: { gte: new Date(now.getTime() - policy.maxShiftHours * 3600000), lte: now } }, orderBy: { id: "asc" } });
    if (records.length > 1) throw new Error("Há registros concorrentes no dia. Solicite conciliação ao RH.");
    let record = records[0]; const before = record || null;
    const referenceDate = record?.date || date;
    const competence = `${String(referenceDate.getUTCMonth() + 1).padStart(2, "0")}/${referenceDate.getUTCFullYear()}`;
    if (await tx.payroll.count({ where: { competence, status: { in: ["Fechada", "Paga"] }, items: { some: { employeeId } } } })) throw new Error("Competência fechada exige conciliação de ponto pelo RH.");
    if (input.kind === "ENTRY") {
      if (record) throw new Error("O dia já possui registro de ponto. Utilize saída ou solicite ajuste ao RH.");
      const leave = await tx.leave.count({ where: { employeeId, status: "Ativa", startDate: { lte: date }, endDate: { gte: date } } });
      const vacation = await tx.vacation.count({ where: { employeeId, status: { in: ["Programada", "Em gozo"] }, enjoymentStart: { lte: date }, enjoymentEnd: { gte: date } } });
      if (leave || vacation) throw new Error("Marcação de entrada conflita com afastamento ou férias. Solicite análise ao RH.");
      record = await tx.attendanceRecord.create({ data: { employeeId, date, entryTime: now, status: "Presente", contractedHours: policy.contractedHours, hoursWorked: 0, extraHours: 0, bankHours: 0 } });
    } else {
      if (!record?.entryTime || record.exitTime) throw new Error("Não há entrada aberta neste dia para registrar saída.");
      const original = await tx.hrIntegrationEvent.findFirst({ where: { eventType: "PONTO_FUNCIONAL_REGISTRADO", payload: { path: ["attendanceId"], equals: record.id } } });
      if (!original) throw new Error("Registro de outra origem exige ajuste pelo RH.");
      const snapshot = original.payload as { policy: unknown; after: { updatedAt: string } };
      if (JSON.stringify(snapshot.policy) !== JSON.stringify(policy) || snapshot.after.updatedAt !== record.updatedAt.toISOString()) throw new Error("Política ou ponto alterado desde a entrada. Solicite conciliação ao RH.");
      const elapsed = (now.getTime() - record.entryTime.getTime()) / 3600000;
      if (elapsed <= 0 || elapsed > policy.maxShiftHours) throw new Error("Intervalo fora da política vigente. Solicite ajuste ao RH.");
      if (await tx.hrMovement.count({ where: { sourceKey: `PONTO:HORAS_EXTRAS:${record.id}` } })) throw new Error("Registro integrado à folha exige conciliação pelo RH.");
      const hoursWorked = Math.round(Math.max(0, elapsed - policy.breakMinutes / 60) * 10000) / 10000;
      record = await tx.attendanceRecord.update({ where: { id: record.id }, data: { exitTime: now, hoursWorked, extraHours: policy.countOvertime ? Math.round(Math.max(0, hoursWorked - policy.contractedHours) * 10000) / 10000 : 0 } });
    }
    await enqueueHrIntegration(tx, { sourceKey, domain: "AUDITORIA", environment: "INTERNO", eventType: "PONTO_FUNCIONAL_REGISTRADO", payload: { employeeId, actorId: context.user.id, kind: input.kind, attendanceId: record.id, recordedAt: now.toISOString(), ruleId: configured.ruleId, policy, before, after: record } });
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "EMPLOYEE_CLOCK", targetId: record.id });
    return { id: record.id, recordedAt: now.toISOString() };
  });
}
