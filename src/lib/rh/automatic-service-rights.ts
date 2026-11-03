import { and, eq, gte, lte, sql } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import type { DatabaseExecutor } from "@/db/transaction";
import { hrFunctionalRecords } from "@/db/schema/personnel-functional-management";
import { hrEmploymentRevisions, hrRightEntries } from "@/db/schema/personnel-workforce";
import { attendanceRecords, leaves } from "@/db/schema/personnel-records";
import type { FunctionalRecord } from "./functional-record-service";
import { completedCivilServiceYears } from "./civil-service-calendar";
import { z } from "zod";

const day = 86400000;
const civil = (date: Date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
type Contract = { id: string; employeeId: string; admittedAt: Date; endsAt: Date | null; salary: Decimal; regimeId: string; roleId: string };

/** Exclusions are unioned before applying any purpose; a day can never be deducted twice. */
export async function serviceTimeAssessment(db: DatabaseExecutor, contract: Contract, reference: Date, purpose: "ats" | "progression" | "retirement" | "vacation" | "thirteenth") {
  const through = civil(reference), start = civil(contract.admittedAt);
  if ((through.getTime() - start.getTime()) / day > 55000) throw new Error("Intervalo de tempo de serviço superior a 150 anos.");
  const records = await db.select().from(hrFunctionalRecords).where(and(eq(hrFunctionalRecords.contractId, contract.id), sql`${hrFunctionalRecords.kind} IN ('AFASTAMENTO','CESSAO','CATEGORIA_FOLHA')`, sql`${hrFunctionalRecords.status}<>'CANCELADO'`, lte(hrFunctionalRecords.startsAt, through), sql`(${hrFunctionalRecords.endsAt} IS NULL OR ${hrFunctionalRecords.endsAt}>=${start})`));
  const absences = await db.select().from(leaves).where(and(eq(leaves.employeeId, contract.employeeId), lte(leaves.startDate, through), gte(leaves.endDate, start), sql`${leaves.status} NOT IN ('Cancelada','Cancelado','Indeferida')`));
  const faults = await db.select({ date: attendanceRecords.date }).from(attendanceRecords).where(and(eq(attendanceRecords.employeeId, contract.employeeId), gte(attendanceRecords.date, start), lte(attendanceRecords.date, through), sql`${attendanceRecords.status} IN ('Falta','Falta injustificada')`));
  const exclusions = new Set<string>();
  const benefitOn = (date: Date) => records.some(row => row.kind === "CATEGORIA_FOLHA" && row.data.category !== "ATIVO" && civil(row.startsAt) <= date && (!row.endsAt || civil(row.endsAt) >= date));
  const inactiveDays = new Set<string>();
  const revisions = await db.select().from(hrEmploymentRevisions).where(and(eq(hrEmploymentRevisions.contractId, contract.id), lte(hrEmploymentRevisions.effectiveFrom, through))).orderBy(hrEmploymentRevisions.effectiveFrom, hrEmploymentRevisions.version);
  // Gaps after an inactive revision and a termination are not service time.
  // The first admitted-at snapshot documents the opening employment period.
  for (let at = start.getTime(); at <= through.getTime(); at += day) {
    const date = new Date(at);
    const revision = revisions.filter(row => row.effectiveFrom <= date).at(-1) ?? revisions[0];
    const state = revision?.snapshot as { status?: string; endsAt?: string | null } | undefined;
    const end = state ? state.endsAt ? new Date(state.endsAt) : null : contract.endsAt;
    if ((state?.status && state.status !== "ATIVO") || (end && date > civil(end))) {
      const key = date.toISOString().slice(0, 10);
      exclusions.add(key); inactiveDays.add(key);
    }
  }
  function exclude(from: Date, until: Date) { for (let at = Math.max(civil(from).getTime(), start.getTime()); at <= Math.min(civil(until).getTime(), through.getTime()); at += day) exclusions.add(new Date(at).toISOString().slice(0, 10)); }
  for (const record of records) if (record.data[purpose] === "NAO") {
    if (purpose !== "thirteenth") exclude(record.startsAt, record.endsAt ?? through);
    else for (let at = Math.max(civil(record.startsAt).getTime(), start.getTime()); at <= Math.min(civil(record.endsAt ?? through).getTime(), through.getTime()); at += day) if (!benefitOn(new Date(at))) exclusions.add(new Date(at).toISOString().slice(0, 10));
  }
  if (purpose !== "thirteenth") for (const record of records) if (record.kind === "CATEGORIA_FOLHA" && record.data.category !== "ATIVO") exclude(record.startsAt, record.endsAt ?? through);
  for (const absence of absences) {
    const policies = records.filter(row => row.kind === "AFASTAMENTO" && row.data.cause === absence.type);
    for (let at = Math.max(civil(absence.startDate).getTime(), start.getTime()); at <= Math.min(civil(absence.endDate).getTime(), through.getTime()); at += day) {
      const date = new Date(at), policy = policies.find(row => row.startsAt <= date && (!row.endsAt || row.endsAt >= date));
      if (purpose === "thirteenth" && benefitOn(date)) continue;
      if (!policy) throw new Error(`Defina os efeitos de ${absence.type} para ${purpose}, inclusive sua vigência.`);
      if (policy.data[purpose] === "NAO") exclusions.add(date.toISOString().slice(0, 10));
    }
  }
  const functionalExclusions = [...exclusions].sort();
  const faultDays = [...new Set(faults.filter(fault => purpose !== "thirteenth" || !benefitOn(civil(fault.date))).map(fault => civil(fault.date).toISOString().slice(0, 10)))].sort();
  for (const date of faultDays) exclusions.add(date);
  return { start: start.toISOString().slice(0, 10), through: through.toISOString().slice(0, 10), calendarDays: Math.max(0, (through.getTime() - start.getTime()) / day + 1), exclusions: [...exclusions].sort(), functionalExclusions, faultDays, inactiveDays: [...inactiveDays].sort(), records: records.map(row => ({ id: row.id, version: row.version })) };
}

export async function automaticServiceAllowances(db: DatabaseExecutor, contract: Contract, rules: FunctionalRecord[], period: { start: Date; end: Date }, scope: string) {
  const movements: Record<string, Decimal> = {};
  const memory: Array<{ ruleId: string; version: number; rubricCode: string; amount: string; creditedDays: number; excludedDays: number; dailyRates: Array<{ date: string; rate: string; completedYears: number; salary: string; monthlyAmount: string }>; legalReference: string }> = [];
  if (!rules.length) return { movements, memory };
  const counted = await serviceTimeAssessment(db, contract, period.end, "ats");
  const salaryRevisions = await db.select().from(hrEmploymentRevisions).where(and(eq(hrEmploymentRevisions.contractId, contract.id), lte(hrEmploymentRevisions.effectiveFrom, period.end))).orderBy(hrEmploymentRevisions.effectiveFrom, hrEmploymentRevisions.version);
  const commissions = await db.select().from(hrFunctionalRecords).where(and(eq(hrFunctionalRecords.contractId, contract.id), eq(hrFunctionalRecords.kind, "COMISSAO"), sql`${hrFunctionalRecords.status}<>'CANCELADO'`, lte(hrFunctionalRecords.startsAt, period.end), sql`(${hrFunctionalRecords.endsAt} IS NULL OR ${hrFunctionalRecords.endsAt}>=${period.start})`));
  const credits = await db.select().from(hrRightEntries).where(and(eq(hrRightEntries.contractId, contract.id), eq(hrRightEntries.kind, "TEMPO_SERVICO"), sql`coalesce(${hrRightEntries.details}->>'appliesTo','ATS') IN ('ATS','TODOS')`, sql`${hrRightEntries.details}->>'scope'=${scope}`, sql`${hrRightEntries.periodEnd}<${contract.admittedAt}`));
  const credited = credits.reduce((sum, row) => sum.add(row.quantity), new Decimal(0));
  if (!credited.isInteger() || credited.lt(0)) throw new Error("Saldo de averbação inválido para aquisição automática de ATS.");
  for (const rule of rules) {
    const beginning = rule.data.initialDate ? new Date(`${rule.data.initialDate}T00:00:00Z`) : civil(contract.admittedAt);
    if (beginning < civil(contract.admittedAt)) throw new Error("A contagem automática deve começar na admissão ou depois; use averbação para períodos anteriores.");
    const creditedDays = rule.data.priorCredit === "SIM" ? credited.toNumber() : 0;
    let amount = new Decimal(0), excludedDays = 0;
    const dailyRates: typeof memory[number]["dailyRates"] = [];
    for (let at = civil(period.start).getTime(); at <= civil(period.end).getTime(); at += day) {
      const date = new Date(at), iso = date.toISOString().slice(0, 10);
      if (date < beginning || date < rule.startsAt || rule.endsAt && date > rule.endsAt || contract.endsAt && date > contract.endsAt || counted.inactiveDays.includes(iso)) continue;
      excludedDays = counted.exclusions.filter(value => value >= beginning.toISOString().slice(0, 10) && value <= iso).length;
      const adjusted = new Date(date.getTime() + (creditedDays - excludedDays) * day);
      const completedYears = Math.max(0, completedCivilServiceYears(beginning, adjusted));
      const acquisitions = Math.floor(completedYears / Number(rule.data.intervalYears));
      const rate = Decimal.min(new Decimal(rule.data.rate).mul(acquisitions), new Decimal(rule.data.maximumRate));
      const commission = commissions.find(row => row.startsAt <= date && (!row.endsAt || row.endsAt >= date));
      const revision = salaryRevisions.filter(row => row.effectiveFrom <= date).at(-1);
      const originSalary = revision ? new Decimal(z.object({ salary: z.string() }).parse(revision.snapshot).salary) : contract.salary;
      const salary = commission?.data.payOption === "SUBSTITUIR" ? new Decimal(commission.data.salary) : originSalary;
      const monthlyAmount = salary.mul(rate).div(100);
      amount = amount.add(monthlyAmount.div(period.end.getUTCDate()));
      dailyRates.push({ date: iso, rate: rate.toString(), completedYears, salary: salary.toFixed(2), monthlyAmount: monthlyAmount.toString() });
    }
    amount = amount.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    if (memory.some(previous => previous.rubricCode === rule.data.rubricCode && previous.dailyRates.some(previousDay => dailyRates.some(currentDay => currentDay.date === previousDay.date)))) throw new Error("Duas regras automáticas de ATS usam a mesma rubrica no mesmo dia; configure rubricas próprias por direito.");
    movements[rule.data.rubricCode] = (movements[rule.data.rubricCode] ?? new Decimal(0)).add(amount);
    memory.push({ ruleId: rule.id, version: rule.version, rubricCode: rule.data.rubricCode, amount: amount.toFixed(2), creditedDays, excludedDays, dailyRates, legalReference: rule.data.legalReference });
  }
  return { movements, memory };
}
