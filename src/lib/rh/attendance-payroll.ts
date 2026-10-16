import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { payrollPeriod } from "./calculation-engine";
import { resolveContractRevision } from "./contract-timeline";
import { enqueueHrIntegration } from "./workforce-service";
import { attendancePostingKey } from "./attendance-reconciliation";

const policySchema = z.object({ origin: z.literal("HORAS_EXTRAS_PONTO"), rubricCode: z.string().min(1), additionalRate: z.string().regex(/^\d+(?:\.\d{1,6})?$/), legalReference: z.string().trim().min(3) }).strict();

export async function generateAttendanceOvertime(db: PrismaClient, actorId: string, raw: unknown) {
  const input = z.object({ contractId: z.string().min(1), ruleId: z.string().min(1), competence: z.string() }).strict().parse(raw);
  const period = payrollPeriod(input.competence);
  return db.$transaction(async tx => {
    const original = await tx.hrEmploymentContract.findUniqueOrThrow({ where: { id: input.contractId } });
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`RH:employee:${original.employeeId}`}))`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`RH:contract:${original.id}`}))`;
    const stored = await tx.hrEmploymentContract.findUniqueOrThrow({ where: { id: original.id }, include: { revisions: true } });
    const contract = resolveContractRevision(stored, stored.revisions, period).contract;
    const regime = await tx.hrEmploymentRegime.findUniqueOrThrow({ where: { id: contract.regimeId } });
    const rule = await tx.hrPayrollRule.findUniqueOrThrow({ where: { id: input.ruleId }, include: { ruleSet: true } });
    const policy = policySchema.parse(rule.value);
    const rate = new Prisma.Decimal(policy.additionalRate);
    if (rate.gt(1000)) throw new Error("Adicional de horas extras fora do limite suportado.");
    if (!regime.isActive || contract.status !== "ATIVO" || !rule.isActive || rule.ruleSetId !== regime.ruleSetId || rule.ruleSet.status !== "ATIVA" || rule.ruleSet.effectiveFrom > period.start || (rule.ruleSet.effectiveUntil && rule.ruleSet.effectiveUntil < period.end)) throw new Error("Regra/regime vigentes na competência inteira são obrigatórios.");
    const rubric = await tx.hrPayrollRubric.findFirst({ where: { ruleSetId: rule.ruleSetId, code: policy.rubricCode, isActive: true } });
    if (!rubric || rubric.calculationMethod !== "MANUAL" || rubric.type !== "PROVENTO") throw new Error("Horas extras exigem rubrica MANUAL de provento.");
    const records = await tx.attendanceRecord.findMany({ where: { employeeId: contract.employeeId, date: { gte: period.start, lte: period.end }, extraHours: { gt: 0 } }, orderBy: [{ date: "asc" }, { id: "asc" }] });
    const movements: string[] = [];
    for (const record of records) {
      await tx.$queryRaw`SELECT id FROM "AttendanceRecord" WHERE id=${record.id} FOR UPDATE`;
      const current = await tx.attendanceRecord.findUniqueOrThrow({ where: { id: record.id } });
      if (current.employeeId !== contract.employeeId || current.status !== "Presente" || current.date < contract.admittedAt || (contract.endsAt && current.date > contract.endsAt)) throw new Error("Horas extras fora do vínculo ou sem presença reconhecida.");
      const hours = new Prisma.Decimal(String(current.extraHours));
      if (!hours.isFinite() || hours.lt(0) || hours.gt(24) || !hours.eq(hours.toDecimalPlaces(4))) throw new Error("Horas extras devem ter até quatro casas e estar entre 0 e 24 por dia.");
      const hourlyValue = contract.salary.div(contract.monthlyHours);
      const amount = hourlyValue.mul(hours).mul(new Prisma.Decimal(1).add(rate.div(100))).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
       const sourceKey = await attendancePostingKey(tx, `PONTO:HORAS_EXTRAS:${record.id}`, current);
      await enqueueHrIntegration(tx, { sourceKey, domain: "AUDITORIA", environment: rule.ruleSet.scope, eventType: "HORAS_EXTRAS_CALCULADAS", payload: { contractId: contract.id, contractVersion: contract.version, competence: input.competence, ruleId: rule.id, policy, attendance: current, hourlyValue: hourlyValue.toString(), hours: hours.toString(), amount: amount.toFixed(2) } });
      const existing = await tx.hrMovement.findUnique({ where: { sourceKey } });
      if (existing) { movements.push(existing.id); continue; }
      const movement = await tx.hrMovement.create({ data: { contractId: contract.id, sourceKey, rubricCode: rubric.code, startsAt: period.start, endsAt: period.end, amount, reference: `${hours.toString()}h`, notes: `Ponto ${record.id} · ${policy.legalReference}`, actorId } });
      movements.push(movement.id);
    }
    return { movements, records: records.length };
  }, { timeout: 60000 });
}
