import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { resolveContractRevision } from "./contract-timeline";
import { enqueueHrIntegration } from "./workforce-service";
import { assertRhAbsenceDoesNotOverlap } from "./absence-conflicts";
import { civilAnniversary } from "./civil-service-calendar";

const day = 86400000;
const civil = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Data civil inválida.");
const date = (value: string) => new Date(`${value}T00:00:00.000Z`);
const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value));
const fingerprint = (value: unknown) => JSON.stringify(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)));
export const serviceRightPolicySchema = z.object({
  origin: z.literal("LICENCA_PREMIO"), acquisitionDays: z.number().int().min(1).max(36500), entitlementDays: z.number().int().min(1).max(365),
  acquisitionYears: z.number().int().min(1).max(100).optional(),
  minSplitDays: z.number().int().min(1).max(365), maxSplits: z.number().int().min(1).max(100), allowsCash: z.boolean(), maxCashDays: z.number().int().min(0).max(365),
  absences: z.array(z.object({ type: z.string().trim().min(1), effect: z.enum(["CONTAR", "SUSPENDER", "REINICIAR"]) }).strict()).max(100), legalReference: z.string().trim().min(3),
}).strict().superRefine((policy, ctx) => {
  if (new Set(policy.absences.map(row => row.type)).size !== policy.absences.length || policy.minSplitDays > policy.entitlementDays || policy.maxCashDays > policy.entitlementDays) ctx.addIssue({ code: "custom", message: "Política com tipos duplicados ou limites incompatíveis." });
});

/** Count civil days once even when approved absences overlap. Reset has priority
 * over suspension; a suspended day extends the acquisition rather than creating
 * a credit. Policies select explicit days or civil years; the POC anniversary
 * convention is preserved in the policy and must be confirmed for production. */
export function calculateServiceAcquisitions(start: Date, through: Date, rawPolicy: unknown, absences: { type: string; startDate: Date; endDate: Date }[]) {
  const policy = serviceRightPolicySchema.parse(rawPolicy);
  if (through < start || (through.getTime() - start.getTime()) / day > 55000) throw new Error("Intervalo de aquisição inválido ou superior a 150 anos.");
  const effects = new Map(policy.absences.map(row => [row.type, row.effect]));
  const relevant = absences.filter(row => row.startDate <= through && row.endDate >= start);
  for (const absence of relevant) if (absence.endDate < absence.startDate || !effects.has(absence.type)) throw new Error(`Defina o efeito do afastamento ${absence.type} na política de licença-prêmio.`);
  const periods: { periodStart: Date; periodEnd: Date; suspendedDays: number; countedDays: number }[] = [];
  let periodStart = start; let countedDays = 0; let suspendedDays = 0;
  const targetDays = () => policy.acquisitionYears ? Math.round((civilAnniversary(periodStart, policy.acquisitionYears).getTime() - periodStart.getTime()) / day) : policy.acquisitionDays;
  for (let current = start; current <= through; current = new Date(current.getTime() + day)) {
    const applicable = relevant.filter(row => row.startDate <= current && row.endDate >= current).map(row => effects.get(row.type));
    if (applicable.includes("REINICIAR")) { periodStart = new Date(current.getTime() + day); countedDays = 0; suspendedDays = 0; continue; }
    if (applicable.includes("SUSPENDER")) { suspendedDays++; continue; }
    countedDays++;
    if (countedDays === targetDays()) {
      periods.push({ periodStart, periodEnd: current, suspendedDays, countedDays });
      periodStart = new Date(current.getTime() + day); countedDays = 0; suspendedDays = 0;
    }
  }
  return { periods, pending: { periodStart, countedDays, suspendedDays }, policy };
}

async function loadPolicy(tx: Prisma.TransactionClient, contractId: string, ruleId: string, start: Date, end: Date) {
  const stored = await tx.hrEmploymentContract.findUniqueOrThrow({ where: { id: contractId }, include: { revisions: true, employee: true } });
  const contract = resolveContractRevision(stored, stored.revisions, { start, end: start }).contract;
  if (!stored.employee.personId || !stored.employee.isActive || contract.status !== "ATIVO" || start < contract.admittedAt || (contract.endsAt && end > contract.endsAt)) throw new Error("Direito fora do vínculo ativo do titular.");
  if (stored.revisions.some(revision => revision.effectiveFrom > start && revision.effectiveFrom <= end && ((revision.snapshot as { regimeId: string; status: string }).regimeId !== contract.regimeId || (revision.snapshot as { status: string }).status !== "ATIVO"))) throw new Error("Transição de regime/situação exige apuração específica dos direitos.");
  const regime = await tx.hrEmploymentRegime.findUniqueOrThrow({ where: { id: contract.regimeId } });
  const rule = await tx.hrPayrollRule.findUniqueOrThrow({ where: { id: ruleId }, include: { ruleSet: true } });
  const policy = serviceRightPolicySchema.parse(rule.value);
  const set = rule.ruleSet;
  if (!rule.isActive || !regime.isActive || regime.ruleSetId !== set.id || set.status !== "ATIVA" || set.effectiveFrom > start || (set.effectiveUntil && set.effectiveUntil < end)) throw new Error("Política de licença-prêmio deve cobrir todo o período no regime do vínculo.");
  if (set.scope === "PRODUCAO" && (set.isDemo || !set.approvedAt || set.approvedAt > new Date() || !set.legalReference)) throw new Error("Direitos de produção exigem parâmetros oficiais aprovados.");
  return { contract, rule, policy };
}

export async function acquireServiceRights(db: PrismaClient, actorId: string, raw: unknown) {
  const input = z.object({ contractId: z.string().min(1), ruleId: z.string().min(1), through: civil }).strict().parse(raw);
  const through = date(input.through);
  if (through > new Date()) throw new Error("Aquisição futura não permitida.");
  return db.$transaction(async tx => {
    const initial = await tx.hrEmploymentContract.findUniqueOrThrow({ where: { id: input.contractId } });
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`RH:employee:${initial.employeeId}`}))`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`RH:contract:${initial.id}`}))`;
    const { contract, rule, policy } = await loadPolicy(tx, initial.id, input.ruleId, initial.admittedAt, through);
    const absences = await tx.leave.findMany({ where: { employeeId: contract.employeeId, status: "Ativa", startDate: { lte: through }, endDate: { gte: contract.admittedAt } }, orderBy: { id: "asc" } });
    const assessment = calculateServiceAcquisitions(contract.admittedAt, through, policy, absences);
    const existing = await tx.hrRightEntry.findMany({ where: { contractId: contract.id, kind: "LICENCA_PREMIO", AND: [{ details: { path: ["operation"], equals: "AQUISICAO" } }, { details: { path: ["scope"], equals: rule.ruleSet.scope } }] } });
    for (const entry of existing.filter(row => row.periodEnd <= through)) {
      if (!assessment.periods.some(period => period.periodStart.getTime() === entry.periodStart.getTime() && period.periodEnd.getTime() === entry.periodEnd.getTime()) || !entry.quantity.eq(policy.entitlementDays)) throw new Error("Afastamentos ou política alteraram aquisição já registrada; concilie o histórico antes de prosseguir.");
    }
    const ids = [];
    for (const period of assessment.periods) {
      const sourceKey = `LICENCA_PREMIO:AQUISICAO:${contract.id}:${rule.ruleSet.scope}:${period.periodStart.toISOString().slice(0, 10)}`;
      const previous = await tx.hrRightEntry.findUnique({ where: { sourceKey } });
      if (previous) { ids.push(previous.id); continue; }
      const entry = await tx.hrRightEntry.create({ data: { contractId: contract.id, sourceKey, kind: "LICENCA_PREMIO", periodStart: period.periodStart, periodEnd: period.periodEnd, quantity: policy.entitlementDays, amount: 0, actorId, details: json({ operation: "AQUISICAO", scope: rule.ruleSet.scope, policy, ruleId: rule.id, contractVersion: contract.version, countedDays: period.countedDays, suspendedDays: period.suspendedDays, absences: absences.map(row => ({ id: row.id, type: row.type, startDate: row.startDate, endDate: row.endDate })) }) } });
      await enqueueHrIntegration(tx, { sourceKey, domain: "AUDITORIA", environment: rule.ruleSet.scope, eventType: "LICENCA_PREMIO_ADQUIRIDA", payload: { entryId: entry.id, actorId } });
      ids.push(entry.id);
    }
    return { ids, pending: assessment.pending };
  }, { timeout: 60000 });
}

export async function reserveServiceRight(db: PrismaClient, actorId: string, raw: unknown) {
  const input = z.object({ contractId: z.string().min(1), ruleId: z.string().min(1), sourceKey: z.string().trim().min(1).max(120), periodStart: civil, periodEnd: civil, start: civil, days: z.coerce.number().int().min(1).max(365), kind: z.enum(["GOZO", "PECUNIA"]), reason: z.string().trim().min(10).max(2000) }).strict().parse(raw);
  const start = date(input.start); const end = new Date(start.getTime() + (input.days - 1) * day);
  const periodStart = date(input.periodStart); const periodEnd = date(input.periodEnd);
  if (periodEnd < periodStart || start <= periodEnd) throw new Error("Gozo/pecúnia exige aquisitivo completo anterior ao início.");
  return db.$transaction(async tx => {
    const initial = await tx.hrEmploymentContract.findUniqueOrThrow({ where: { id: input.contractId } });
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`RH:employee:${initial.employeeId}`}))`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`RH:contract:${initial.id}`}))`;
    const sourceKey = `LICENCA_PREMIO:RESERVA:${input.sourceKey}`;
    const previous = await tx.hrRightEntry.findUnique({ where: { sourceKey } });
    if (previous) {
      if (fingerprint((previous.details as { input: unknown }).input) !== fingerprint(input)) throw new Error("Origem da licença-prêmio reutilizada com outros dados.");
      return previous;
    }
    const { contract, rule, policy } = await loadPolicy(tx, input.contractId, input.ruleId, start, end);
    const entries = await tx.hrRightEntry.findMany({ where: { contractId: contract.id, kind: "LICENCA_PREMIO", periodStart, periodEnd, details: { path: ["scope"], equals: rule.ruleSet.scope } } });
    if (entries.reduce((sum, entry) => sum.add(entry.quantity), new Prisma.Decimal(0)).lt(input.days)) throw new Error("Dias excedem saldo da licença-prêmio.");
    const cancelled = new Set(entries.map(entry => (entry.details as { cancelsId?: string }).cancelsId));
    const reservations = entries.filter(entry => entry.quantity.lt(0) && !cancelled.has(entry.id));
    const cash = reservations.filter(entry => (entry.details as { kind?: string }).kind === "PECUNIA").reduce((sum, row) => sum.sub(row.quantity), new Prisma.Decimal(0));
    let leaveId: string | null = null;
    if (input.kind === "PECUNIA") {
      if (!policy.allowsCash || cash.add(input.days).gt(policy.maxCashDays)) throw new Error("Pecúnia não autorizada ou superior ao limite da licença-prêmio.");
    } else {
      if (input.days < policy.minSplitDays || reservations.filter(entry => (entry.details as { kind?: string }).kind === "GOZO").length >= policy.maxSplits) throw new Error("Fracionamento incompatível com a licença-prêmio.");
      await assertRhAbsenceDoesNotOverlap(tx, { employeeId: contract.employeeId, startsAt: start, endsAt: end, kind: "LICENCA" });
      leaveId = (await tx.leave.create({ data: { employeeId: contract.employeeId, type: "Licença-prêmio", startDate: start, endDate: end, status: "Ativa", reason: input.reason } })).id;
    }
    const entry = await tx.hrRightEntry.create({ data: { contractId: contract.id, sourceKey, kind: "LICENCA_PREMIO", periodStart, periodEnd, quantity: -input.days, amount: 0, actorId, details: json({ operation: "RESERVA", input, kind: input.kind, scope: rule.ruleSet.scope, leaveId, policy, reason: input.reason }) } });
    await enqueueHrIntegration(tx, { sourceKey, domain: "AUDITORIA", environment: rule.ruleSet.scope, eventType: "LICENCA_PREMIO_RESERVADA", payload: { entryId: entry.id, leaveId, actorId, input } });
    return entry;
  }, { timeout: 60000 });
}

export async function cancelServiceReservation(db: PrismaClient, actorId: string, raw: unknown) {
  const input = z.object({ entryId: z.string().min(1), reason: z.string().trim().min(10).max(2000) }).strict().parse(raw);
  return db.$transaction(async tx => {
    const original = await tx.hrRightEntry.findUniqueOrThrow({ where: { id: input.entryId } });
    const memory = z.object({ operation: z.literal("RESERVA"), input: z.object({ start: civil, days: z.number(), kind: z.enum(["GOZO", "PECUNIA"]) }), scope: z.string(), leaveId: z.string().nullable() }).parse(original.details);
    if (original.kind !== "LICENCA_PREMIO" || !original.quantity.lt(0)) throw new Error("Selecione uma reserva original de licença-prêmio.");
    const contract = await tx.hrEmploymentContract.findUniqueOrThrow({ where: { id: original.contractId } });
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`RH:employee:${contract.employeeId}`}))`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`RH:contract:${contract.id}`}))`;
    const sourceKey = `LICENCA_PREMIO:CANCELAMENTO:${original.id}`;
    const previous = await tx.hrRightEntry.findUnique({ where: { sourceKey } });
    if (previous) { if ((previous.details as { reason: string }).reason !== input.reason) throw new Error("Reserva cancelada com outro fundamento."); return previous; }
    const start = date(memory.input.start); const end = new Date(start.getTime() + (memory.input.days - 1) * day);
    if (start <= new Date(new Date().toISOString().slice(0, 10))) throw new Error("Cancelamento exige reserva futura ainda não iniciada.");
    const closed = await tx.hrPayrollStatement.findMany({ where: { contract: { employeeId: contract.employeeId }, run: { mode: "OFICIAL", status: "FECHADA" } }, select: { run: { select: { payroll: { select: { competence: true } } } } } });
    if (closed.some(row => { const [month, year] = row.run.payroll.competence.split("/"); return `${year}-${month}` >= start.toISOString().slice(0, 7) && `${year}-${month}` <= end.toISOString().slice(0, 7); })) throw new Error("Competência fechada exige conciliação antes de devolver direitos.");
    if (memory.leaveId) {
      await tx.$queryRaw`SELECT id FROM "Leave" WHERE id=${memory.leaveId} FOR UPDATE`;
      const leave = await tx.leave.findUniqueOrThrow({ where: { id: memory.leaveId } });
      if (leave.employeeId !== contract.employeeId || leave.status !== "Ativa" || leave.startDate.getTime() !== start.getTime() || leave.endDate.getTime() !== end.getTime()) throw new Error("Projeção de licença incompatível com a reserva.");
      await tx.leave.update({ where: { id: leave.id }, data: { status: "Cancelada" } });
    }
    const entry = await tx.hrRightEntry.create({ data: { contractId: original.contractId, sourceKey, kind: original.kind, periodStart: original.periodStart, periodEnd: original.periodEnd, quantity: original.quantity.negated(), amount: 0, actorId, details: { operation: "CANCELAMENTO", scope: memory.scope, cancelsId: original.id, reason: input.reason, leaveId: memory.leaveId } } });
    await enqueueHrIntegration(tx, { sourceKey, domain: "AUDITORIA", environment: memory.scope, eventType: "LICENCA_PREMIO_CANCELADA", payload: { entryId: entry.id, originalEntryId: original.id, actorId, reason: input.reason } });
    return entry;
  }, { timeout: 60000 });
}
