import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { payrollPeriod } from "./calculation-engine";
import { resolveContractRevision } from "./contract-timeline";
import { enqueueHrIntegration } from "./workforce-service";
import { completedCivilServiceYears } from "./civil-service-calendar";

const day = 86400000;
const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value));
export const serviceTimeAllowancePolicySchema = z.object({ origin: z.literal("ATS"), rubricCode: z.string().min(1), legalReference: z.string().trim().min(3), basis: z.literal("SALARIO_TEMPORAL"), tiers: z.array(z.object({ minimumDays: z.number().int().min(0).max(55000), minimumYears: z.number().int().min(0).max(150).optional(), rate: z.string().regex(/^\d+(?:\.\d{1,4})?$/).refine(value => new Prisma.Decimal(value).lte(100)) }).strict()).min(1).max(100), absences: z.array(z.object({ type: z.string().trim().min(1), counts: z.boolean() }).strict()).max(100) }).strict().superRefine((policy, ctx) => {
  if (new Set(policy.tiers.map(row => row.minimumDays)).size !== policy.tiers.length || new Set(policy.absences.map(row => row.type)).size !== policy.absences.length) ctx.addIssue({ code: "custom", message: "Faixas ou tipos de afastamento duplicados." });
  if (policy.tiers.some(row => row.minimumYears !== undefined) && (policy.tiers.some(row => row.minimumYears === undefined) || new Set(policy.tiers.map(row => row.minimumYears)).size !== policy.tiers.length)) ctx.addIssue({ code: "custom", message: "Faixas civis exigem anos mínimos únicos em todas as linhas." });
});

export function calculateServiceTimeAllowance(rawPolicy: unknown, input: { admittedAt: Date; through: Date; salary: Prisma.Decimal.Value; creditedDays: number; absences: { type: string; startDate: Date; endDate: Date }[] }) {
  const policy = serviceTimeAllowancePolicySchema.parse(rawPolicy);
  if (input.through < input.admittedAt || !Number.isInteger(input.creditedDays) || input.creditedDays < 0) throw new Error("Tempo de serviço inválido.");
  const calendarDays = Math.floor((input.through.getTime() - input.admittedAt.getTime()) / day) + 1;
  if (calendarDays > 55000) throw new Error("Histórico superior a 150 anos exige saneamento.");
  const deductions = new Set<string>();
  for (const absence of input.absences) {
    if (absence.startDate > input.through || absence.endDate < input.admittedAt) continue;
    const effect = policy.absences.find(row => row.type === absence.type);
    if (!effect || absence.endDate < absence.startDate) throw new Error(`Defina a contagem do afastamento ${absence.type} para ATS.`);
    if (effect.counts) continue;
    for (let date = new Date(Math.max(absence.startDate.getTime(), input.admittedAt.getTime())); date <= input.through && date <= absence.endDate; date = new Date(date.getTime() + day)) deductions.add(date.toISOString().slice(0, 10));
  }
  const countedDays = calendarDays - deductions.size + input.creditedDays;
  const civilYears = policy.tiers[0].minimumYears !== undefined ? completedCivilServiceYears(input.admittedAt, new Date(input.through.getTime() + (input.creditedDays - deductions.size) * day)) : null;
  const tier = civilYears === null ? [...policy.tiers].sort((a, b) => b.minimumDays - a.minimumDays).find(row => row.minimumDays <= countedDays) : [...policy.tiers].sort((a, b) => b.minimumYears! - a.minimumYears!).find(row => row.minimumYears! <= civilYears);
  const rate = tier?.rate ?? "0";
  const salary = new Prisma.Decimal(input.salary);
  if (!salary.isFinite() || salary.lt(0)) throw new Error("Salário inválido para ATS.");
  return { calendarDays, excludedDays: deductions.size, creditedDays: input.creditedDays, countedDays, civilYears, rate, amount: salary.mul(rate).div(100).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toFixed(2), policy };
}

export async function registerServiceTimeCredit(db: PrismaClient, actorId: string, raw: unknown) {
  const input = z.object({ contractId: z.string().min(1), sourceKey: z.string().trim().min(1).max(120), start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), recognizedDays: z.coerce.number().int().min(1).max(55000), scope: z.enum(["DEMONSTRACAO", "HOMOLOGACAO", "PRODUCAO"]), reason: z.string().trim().min(10).max(2000) }).strict().parse(raw);
  const start = new Date(`${input.start}T00:00:00.000Z`); const end = new Date(`${input.end}T00:00:00.000Z`);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start.toISOString().slice(0, 10) !== input.start || end.toISOString().slice(0, 10) !== input.end || end < start || input.recognizedDays > (end.getTime() - start.getTime()) / day + 1) throw new Error("Período/dias da averbação inválidos.");
  return db.$transaction(async tx => {
    const initial = await tx.hrEmploymentContract.findUniqueOrThrow({ where: { id: input.contractId } });
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`RH:employee:${initial.employeeId}`}))`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`RH:contract:${initial.id}`}))`;
    const sourceKey = `AVERBACAO:ATS:${input.sourceKey}`;
    const previous = await tx.hrRightEntry.findUnique({ where: { sourceKey } });
    if (previous) {
      const memory = (previous.details as { input: typeof input }).input;
      if (Object.keys(input).some(key => memory[key as keyof typeof input] !== input[key as keyof typeof input])) throw new Error("Averbação repetida com dados diferentes.");
      return previous;
    }
    await tx.$queryRaw`SELECT id FROM "Employee" WHERE id=${initial.employeeId} FOR UPDATE`;
    const employee = await tx.employee.findUniqueOrThrow({ where: { id: initial.employeeId } });
    if (!employee.personId || !employee.isActive) throw new Error("Averbação exige titular ativo no Cadastro Único.");
    if (end >= initial.admittedAt) throw new Error("Averbação de tempo anterior deve terminar antes da admissão do vínculo.");
    const existing = await tx.hrRightEntry.findFirst({ where: { contract: { employeeId: initial.employeeId }, kind: "TEMPO_SERVICO", periodStart: { lte: end }, periodEnd: { gte: start }, details: { path: ["scope"], equals: input.scope } } });
    if (existing) throw new Error("Período já averbado para a identidade funcional; não duplique tempo entre vínculos.");
    const entry = await tx.hrRightEntry.create({ data: { contractId: initial.id, sourceKey, kind: "TEMPO_SERVICO", periodStart: start, periodEnd: end, quantity: input.recognizedDays, amount: 0, actorId, details: json({ input, scope: input.scope, appliesTo: "ATS", reason: input.reason }) } });
    await enqueueHrIntegration(tx, { sourceKey, domain: "AUDITORIA", environment: input.scope, eventType: "TEMPO_SERVICO_AVERBADO", payload: { entryId: entry.id, input, actorId } });
    return entry;
  }, { timeout: 60000 });
}

export async function reverseServiceTimeCredit(db: PrismaClient, actorId: string, raw: unknown) {
  const input = z.object({ entryId: z.string().min(1), reason: z.string().trim().min(10).max(2000) }).strict().parse(raw);
  return db.$transaction(async tx => {
    const original = await tx.hrRightEntry.findUniqueOrThrow({ where: { id: input.entryId } });
    if (original.kind !== "TEMPO_SERVICO" || !original.sourceKey.startsWith("AVERBACAO:ATS:") || !original.quantity.gt(0)) throw new Error("Selecione uma averbação original de tempo para ATS.");
    const scope = z.object({ scope: z.string() }).parse(original.details).scope;
    const contract = await tx.hrEmploymentContract.findUniqueOrThrow({ where: { id: original.contractId } });
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`RH:employee:${contract.employeeId}`}))`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`RH:contract:${contract.id}`}))`;
    await tx.$queryRaw`SELECT id FROM "Employee" WHERE id=${contract.employeeId} FOR UPDATE`;
    const sourceKey = `ESTORNO:AVERBACAO:${original.id}`;
    const previous = await tx.hrRightEntry.findUnique({ where: { sourceKey } });
    if (previous) { if ((previous.details as { reason: string }).reason !== input.reason) throw new Error("Averbação já estornada com outro fundamento."); return previous; }
    const entry = await tx.hrRightEntry.create({ data: { contractId: original.contractId, sourceKey, kind: original.kind, periodStart: original.periodStart, periodEnd: original.periodEnd, quantity: original.quantity.negated(), amount: 0, actorId, details: { scope, appliesTo: "ATS", originalEntryId: original.id, reason: input.reason } } });
    await enqueueHrIntegration(tx, { sourceKey, domain: "AUDITORIA", environment: scope, eventType: "AVERBACAO_ESTORNADA", payload: { entryId: entry.id, originalEntryId: original.id, actorId, reason: input.reason } });
    return entry;
  }, { timeout: 60000 });
}

export async function postServiceTimeAllowance(db: PrismaClient, actorId: string, raw: unknown) {
  const input = z.object({ contractId: z.string().min(1), payrollId: z.string().min(1), ruleId: z.string().min(1) }).strict().parse(raw);
  return db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`RH:payroll:${input.payrollId}`}))`;
    const payroll = await tx.payroll.findUniqueOrThrow({ where: { id: input.payrollId } });
    const sourceKey = `ATS:${input.contractId}:${payroll.competence}`;
    const previous = await tx.hrIntegrationEvent.findUnique({ where: { sourceKey } });
    if (previous) {
      const memory = previous.payload as { input: typeof input; movementId: string; assessment: ReturnType<typeof calculateServiceTimeAllowance> };
      if (memory.input.ruleId !== input.ruleId || memory.input.contractId !== input.contractId || memory.input.payrollId !== input.payrollId) throw new Error("ATS já apurado com outra política.");
      return { movementId: memory.movementId, assessment: memory.assessment };
    }
    if (payroll.type !== "Mensal" || ["Fechada", "Paga"].includes(payroll.status)) throw new Error("ATS exige folha mensal aberta.");
    const period = payrollPeriod(payroll.competence);
    const initial = await tx.hrEmploymentContract.findUniqueOrThrow({ where: { id: input.contractId } });
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`RH:employee:${initial.employeeId}`}))`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`RH:contract:${initial.id}`}))`;
    const stored = await tx.hrEmploymentContract.findUniqueOrThrow({ where: { id: initial.id }, include: { revisions: true, employee: true } });
    const contract = resolveContractRevision(stored, stored.revisions, period).contract;
    const rule = await tx.hrPayrollRule.findUniqueOrThrow({ where: { id: input.ruleId }, include: { ruleSet: true } });
    const regime = await tx.hrEmploymentRegime.findUniqueOrThrow({ where: { id: contract.regimeId } });
    const policy = serviceTimeAllowancePolicySchema.parse(rule.value);
    if (!stored.employee.personId || !stored.employee.isActive || contract.status !== "ATIVO" || contract.admittedAt > period.start || (contract.endsAt && contract.endsAt < period.end)) throw new Error("ATS parcial/intramês exige rateio específico do vínculo.");
    if (!rule.isActive || !regime.isActive || regime.ruleSetId !== rule.ruleSetId || rule.ruleSet.status !== "ATIVA" || rule.ruleSet.effectiveFrom > period.start || (rule.ruleSet.effectiveUntil && rule.ruleSet.effectiveUntil < period.end)) throw new Error("Política ATS ativa deve cobrir a competência no regime do vínculo.");
    if (rule.ruleSet.scope === "PRODUCAO" && (rule.ruleSet.isDemo || !rule.ruleSet.approvedAt || rule.ruleSet.approvedAt > new Date() || !rule.ruleSet.legalReference)) throw new Error("ATS de produção exige parâmetros oficiais aprovados.");
    const closed = await tx.hrPayrollStatement.findFirst({ where: { contract: { employeeId: contract.employeeId }, run: { mode: "OFICIAL", status: "FECHADA", payroll: { competence: payroll.competence } } } });
    if (closed) throw new Error("Competência do titular já fechada; use conciliação compensatória.");
    const rubric = await tx.hrPayrollRubric.findFirst({ where: { ruleSetId: rule.ruleSetId, code: policy.rubricCode, isActive: true, type: "PROVENTO", calculationMethod: "MANUAL" } });
    if (!rubric) throw new Error("ATS exige rubrica ativa de provento manual.");
    const absences = await tx.leave.findMany({ where: { employeeId: contract.employeeId, status: "Ativa", startDate: { lte: period.end }, endDate: { gte: contract.admittedAt } } });
    const credits = await tx.hrRightEntry.findMany({ where: { contract: { employeeId: contract.employeeId }, kind: "TEMPO_SERVICO", periodEnd: { lt: contract.admittedAt }, details: { path: ["scope"], equals: rule.ruleSet.scope } } });
    const creditedDays = credits.reduce((sum, entry) => sum.add(entry.quantity), new Prisma.Decimal(0)).toNumber();
    const assessment = calculateServiceTimeAllowance(policy, { admittedAt: contract.admittedAt, through: period.end, salary: contract.salary, creditedDays, absences });
    const movement = await tx.hrMovement.create({ data: { contractId: contract.id, sourceKey, rubricCode: rubric.code, startsAt: period.start, endsAt: period.end, amount: assessment.amount, reference: `${assessment.rate}%`, notes: `ATS: ${policy.legalReference}`, actorId } });
    await enqueueHrIntegration(tx, { sourceKey, domain: "AUDITORIA", environment: rule.ruleSet.scope, eventType: "ATS_APURADO", payload: json({ input, movementId: movement.id, assessment, contractVersion: contract.version, salary: contract.salary, absences: absences.map(row => ({ id: row.id, type: row.type, startDate: row.startDate, endDate: row.endDate })), creditIds: credits.map(row => row.id), actorId }) });
    return { movementId: movement.id, assessment };
  }, { timeout: 60000 });
}

export async function reverseServiceTimeAllowance(db: PrismaClient, actorId: string, raw: unknown) {
  const input = z.object({ originalSourceKey: z.string().min(1), reason: z.string().trim().min(10).max(2000) }).strict().parse(raw);
  return db.$transaction(async tx => {
    const original = await tx.hrIntegrationEvent.findUniqueOrThrow({ where: { sourceKey: input.originalSourceKey } });
    if (original.eventType !== "ATS_APURADO") throw new Error("Selecione uma apuração original de ATS.");
    const memory = z.object({ input: z.object({ payrollId: z.string(), contractId: z.string() }), movementId: z.string() }).parse(original.payload);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`RH:payroll:${memory.input.payrollId}`}))`;
    const payroll = await tx.payroll.findUniqueOrThrow({ where: { id: memory.input.payrollId } });
    const contract = await tx.hrEmploymentContract.findUniqueOrThrow({ where: { id: memory.input.contractId } });
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`RH:employee:${contract.employeeId}`}))`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`RH:contract:${contract.id}`}))`;
    const sourceKey = `ESTORNO:${original.sourceKey}`;
    const previous = await tx.hrIntegrationEvent.findUnique({ where: { sourceKey } });
    if (previous) {
      const evidence = previous.payload as { reason: string; movementId: string };
      if (evidence.reason !== input.reason) throw new Error("ATS estornado com outro fundamento.");
      return { movementId: evidence.movementId };
    }
    if (["Fechada", "Paga"].includes(payroll.status) || await tx.hrPayrollStatement.findFirst({ where: { contract: { employeeId: contract.employeeId }, run: { mode: "OFICIAL", status: "FECHADA", payroll: { competence: payroll.competence } } } })) throw new Error("Estorno ATS exige competência aberta do titular.");
    const movement = await tx.hrMovement.findUniqueOrThrow({ where: { id: memory.movementId } });
    const compensation = await tx.hrMovement.create({ data: { contractId: movement.contractId, sourceKey, rubricCode: movement.rubricCode, startsAt: movement.startsAt, endsAt: movement.endsAt, amount: movement.amount.negated(), reference: movement.reference, notes: input.reason, actorId } });
    await enqueueHrIntegration(tx, { sourceKey, domain: "AUDITORIA", environment: original.environment, eventType: "ATS_ESTORNADO", payload: { movementId: compensation.id, originalMovementId: movement.id, reason: input.reason, actorId } });
    return { movementId: compensation.id };
  }, { timeout: 60000 });
}

export async function assertServiceTimeAllowanceCurrent(tx: Prisma.TransactionClient, contractId: string, competence: string) {
  const event = await tx.hrIntegrationEvent.findUnique({ where: { sourceKey: `ATS:${contractId}:${competence}` } });
  if (!event || await tx.hrIntegrationEvent.findUnique({ where: { sourceKey: `ESTORNO:${event.sourceKey}` } })) return;
  const memory = z.object({ assessment: z.object({ policy: serviceTimeAllowancePolicySchema, amount: z.string(), rate: z.string(), countedDays: z.number() }), salary: z.string() }).parse(event.payload);
  const stored = await tx.hrEmploymentContract.findUniqueOrThrow({ where: { id: contractId }, include: { revisions: true } });
  const period = payrollPeriod(competence);
  const contract = resolveContractRevision(stored, stored.revisions, period).contract;
  const absences = await tx.leave.findMany({ where: { employeeId: contract.employeeId, status: "Ativa", startDate: { lte: period.end }, endDate: { gte: contract.admittedAt } } });
  const credits = await tx.hrRightEntry.findMany({ where: { contract: { employeeId: contract.employeeId }, kind: "TEMPO_SERVICO", periodEnd: { lt: contract.admittedAt }, details: { path: ["scope"], equals: event.environment } } });
  const assessment = calculateServiceTimeAllowance(memory.assessment.policy, { admittedAt: contract.admittedAt, through: period.end, salary: contract.salary, creditedDays: credits.reduce((sum, row) => sum.add(row.quantity), new Prisma.Decimal(0)).toNumber(), absences });
  if (!contract.salary.eq(memory.salary) || assessment.amount !== memory.assessment.amount || assessment.countedDays !== memory.assessment.countedDays || !new Prisma.Decimal(assessment.rate).eq(memory.assessment.rate)) throw new Error("Tempo/averbações/afastamentos/salário mudaram após apuração de ATS. Concilie o movimento antes de calcular ou fechar.");
}
