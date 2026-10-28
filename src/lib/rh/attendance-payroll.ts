import { and, asc, eq, gt, gte, lte, sql } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction } from "@/db/transaction";
import { attendanceRecords } from "@/db/schema/personnel-records";
import { hrPayrollRubrics } from "@/db/schema/personnel-configuration";
import { hrMovements } from "@/db/schema/personnel-workforce";
import { lockPersonnel } from "@/db/repositories/personnel/integration";
import { requireEmploymentContract, requireEmploymentHistory, requireEmploymentRegime, requirePayrollRule } from "@/db/repositories/personnel/workforce";
import { z } from "zod";
import { payrollPeriod } from "./calculation-engine";
import { resolveContractRevision } from "./contract-timeline";
import { enqueueHrIntegration } from "./workforce-service";
import { attendancePostingKey } from "./attendance-reconciliation";

const policySchema = z.object({ origin: z.literal("HORAS_EXTRAS_PONTO"), rubricCode: z.string().min(1), additionalRate: z.string().regex(/^\d+(?:\.\d{1,6})?$/), legalReference: z.string().trim().min(3) }).strict();

export async function generateAttendanceOvertime(db: DatabaseConnection, actorId: string, raw: unknown) {
  const input = z.object({ contractId: z.string().min(1), ruleId: z.string().min(1), competence: z.string() }).strict().parse(raw);
  const period = payrollPeriod(input.competence);
  return withDatabaseTransaction(db, async tx => {
    const original = await requireEmploymentContract(tx, input.contractId);
    await lockPersonnel(tx, `employee:${original.employeeId}`);
    await lockPersonnel(tx, `contract:${original.id}`);
    const stored = await requireEmploymentHistory(tx, original.id);
    const contract = resolveContractRevision(stored, stored.revisions, period).contract;
    const regime = await requireEmploymentRegime(tx, contract.regimeId);
    const rule = await requirePayrollRule(tx, input.ruleId);
    const policy = policySchema.parse(rule.value);
    const rate = new Decimal(policy.additionalRate);
    if (rate.gt(1000)) throw new Error("Adicional de horas extras fora do limite suportado.");
    if (!regime.isActive || contract.status !== "ATIVO" || !rule.isActive || rule.ruleSetId !== regime.ruleSetId || rule.ruleSet.status !== "ATIVA" || rule.ruleSet.effectiveFrom > period.start || (rule.ruleSet.effectiveUntil && rule.ruleSet.effectiveUntil < period.end)) throw new Error("Regra/regime vigentes na competência inteira são obrigatórios.");
    const [rubric] = await tx.select().from(hrPayrollRubrics).where(and(eq(hrPayrollRubrics.ruleSetId, rule.ruleSetId), eq(hrPayrollRubrics.code, policy.rubricCode), eq(hrPayrollRubrics.isActive, true))).limit(1);
    if (!rubric || rubric.calculationMethod !== "MANUAL" || rubric.type !== "PROVENTO") throw new Error("Horas extras exigem rubrica MANUAL de provento.");
    const records = await tx.select().from(attendanceRecords).where(and(eq(attendanceRecords.employeeId, contract.employeeId), gte(attendanceRecords.date, period.start), lte(attendanceRecords.date, period.end), gt(attendanceRecords.extraHours, 0))).orderBy(asc(attendanceRecords.date), asc(attendanceRecords.id));
    const movements: string[] = [];
    for (const record of records) {
      await tx.execute(sql`SELECT id FROM "AttendanceRecord" WHERE id=${record.id} FOR UPDATE`);
      const [current] = await tx.select().from(attendanceRecords).where(eq(attendanceRecords.id, record.id)).limit(1);
      if (!current) throw new Error("Registro de ponto não encontrado.");
      if (current.employeeId !== contract.employeeId || current.status !== "Presente" || current.date < contract.admittedAt || (contract.endsAt && current.date > contract.endsAt)) throw new Error("Horas extras fora do vínculo ou sem presença reconhecida.");
      const hours = new Decimal(String(current.extraHours));
      if (!hours.isFinite() || hours.lt(0) || hours.gt(24) || !hours.eq(hours.toDecimalPlaces(4))) throw new Error("Horas extras devem ter até quatro casas e estar entre 0 e 24 por dia.");
      const hourlyValue = contract.salary.div(contract.monthlyHours);
      const amount = hourlyValue.mul(hours).mul(new Decimal(1).add(rate.div(100))).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      const sourceKey = await attendancePostingKey(tx, `PONTO:HORAS_EXTRAS:${record.id}`, current);
      await enqueueHrIntegration(tx, { sourceKey, domain: "AUDITORIA", environment: rule.ruleSet.scope, eventType: "HORAS_EXTRAS_CALCULADAS", payload: { contractId: contract.id, contractVersion: contract.version, competence: input.competence, ruleId: rule.id, policy, attendance: current, hourlyValue: hourlyValue.toString(), hours: hours.toString(), amount: amount.toFixed(2) } });
      const [existing] = await tx.select().from(hrMovements).where(eq(hrMovements.sourceKey, sourceKey)).limit(1);
      if (existing) { movements.push(existing.id); continue; }
      const [movement] = await tx.insert(hrMovements).values({ contractId: contract.id, sourceKey, rubricCode: rubric.code, startsAt: period.start, endsAt: period.end, amount, reference: `${hours.toString()}h`, notes: `Ponto ${record.id} · ${policy.legalReference}`, actorId }).returning();
      movements.push(movement.id);
    }
    return { movements, records: records.length };
  }, { timeoutMs: 60000 });
}
