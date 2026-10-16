import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { resolveContractRevision } from "./contract-timeline";
import { vacationEntitlementPolicySchema, vacationDaysForAbsences } from "./vacation-entitlement";

function civilDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Data deve ser AAAA-MM-DD.");
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error("Data civil inválida.");
  return date;
}

function addMonths(date: Date, months: number) {
  const first = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0));
  first.setUTCDate(Math.min(date.getUTCDate(), last.getUTCDate()));
  return first;
}

export async function acquireVacationRights(db: PrismaClient, actorId: string, contractId: string, asOf: string) {
  const through = civilDate(asOf);
  return db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`RH:contract:${contractId}`}))`;
    const stored = await tx.hrEmploymentContract.findUniqueOrThrow({ where: { id: contractId }, include: { revisions: true } });
    const contract = resolveContractRevision(stored, stored.revisions, { start: stored.admittedAt, end: stored.admittedAt }).contract;
    const terminal = resolveContractRevision(stored, stored.revisions, { start: through, end: through }).contract;
    if (stored.revisions.some(revision => revision.effectiveFrom <= through && (revision.snapshot as { regimeId: string }).regimeId !== contract.regimeId)) throw new Error("Mudança de regime no histórico exige política de transição para apuração dos aquisitivos.");
    const regime = await tx.hrEmploymentRegime.findUniqueOrThrow({ where: { id: contract.regimeId }, include: { vacationPolicy: true, ruleSet: true } });
    const policy = regime.vacationPolicy;
    if (!policy?.isActive || !regime.isActive || regime.ruleSet.status !== "ATIVA") throw new Error("Política de férias/regime ativo obrigatório.");
    if (through < contract.admittedAt || through > new Date()) throw new Error("Data de aquisição anterior à admissão ou futura.");
    const absenceRule = await tx.hrPayrollRule.findFirst({ where: { ruleSetId: regime.ruleSetId, code: "FALTAS_FERIAS_POC", isActive: true } });
    if (absenceRule && (!regime.ruleSet.isDemo || regime.ruleSet.scope !== "DEMONSTRACAO")) throw new Error("Mescla estimada de faltas/férias exige escopo de demonstração.");
    const absencePolicy = absenceRule ? vacationEntitlementPolicySchema.parse(absenceRule.value) : null;
    const result: string[] = [];
    for (let cycle = 0; cycle < 1000; cycle++) {
      const start = addMonths(contract.admittedAt, cycle * policy.acquisitionMonths);
      const next = addMonths(contract.admittedAt, (cycle + 1) * policy.acquisitionMonths);
      const end = new Date(next.getTime() - 86400000);
      if (end > through || (terminal.endsAt && end > terminal.endsAt)) break;
      const sourceKey = `FERIAS:AQUISICAO:${contractId}:${start.toISOString().slice(0, 10)}`;
      const existing = await tx.hrRightEntry.findUnique({ where: { sourceKey } });
      const attendance = absencePolicy ? await tx.attendanceRecord.findMany({ where: { employeeId: contract.employeeId, status: { in: absencePolicy.attendanceStatuses }, date: { gte: start, lt: next } }, select: { id: true, date: true }, orderBy: { id: "asc" } }) : [];
      const absenceCount = new Set(attendance.map(record => record.date.toISOString().slice(0, 10))).size;
      const entitlement = absencePolicy ? vacationDaysForAbsences(absencePolicy, absenceCount) : policy.entitlementDays;
      if (existing) {
        if (absencePolicy && (!existing.quantity.eq(entitlement) || (existing.details as { absenceCount?: number }).absenceCount !== absenceCount)) throw new Error("Faltas/política mudaram após aquisição de férias. Concilie o ledger antes de apurar novamente.");
        result.push(existing.id); continue;
      }
      const leave = await tx.leave.findFirst({ where: { employeeId: contract.employeeId, status: "Ativa", startDate: { lte: end }, endDate: { gte: start } } });
      if (leave) throw new Error("Aquisitivo com afastamento exige regra de perda/prorrogação aprovada antes da aquisição automática.");
      if (regime.ruleSet.effectiveFrom > start || (regime.ruleSet.effectiveUntil && regime.ruleSet.effectiveUntil < end)) throw new Error("Política deve cobrir todo o aquisitivo.");
      const entry = await tx.hrRightEntry.create({ data: { contractId, sourceKey, kind: "FERIAS", periodStart: start, periodEnd: end, quantity: entitlement, amount: 0, actorId, details: JSON.parse(JSON.stringify({ policy, contractVersion: contract.version, concessionEndsAt: addMonths(next, policy.concessionMonths), reason: "Aquisição por política vigente", scope: regime.ruleSet.scope, ...(absencePolicy ? { absencePolicy, absenceCount, attendanceIds: attendance.map(record => record.id), nominalDays: policy.entitlementDays, lostDays: policy.entitlementDays - entitlement } : {}) })) } });
      result.push(entry.id);
    }
    return result;
  });
}

export async function reserveVacationRight(db: PrismaClient, actorId: string, raw: unknown) {
  return db.$transaction(tx => reserveVacationRightInTransaction(tx, actorId, raw));
}

export async function reserveVacationRightInTransaction(tx: Prisma.TransactionClient, actorId: string, raw: unknown) {
  const input = z.object({ contractId: z.string().min(1), sourceKey: z.string().min(1), periodStart: z.string(), periodEnd: z.string(), kind: z.enum(["GOZO", "PECUNIA"]), start: z.string(), days: z.coerce.number().int().min(1).max(90), reason: z.string().min(3) }).strict().parse(raw);
  const periodStart = civilDate(input.periodStart); const periodEnd = civilDate(input.periodEnd);
  const start = civilDate(input.start); const end = new Date(start.getTime() + (input.days - 1) * 86400000);
  if (periodEnd < periodStart) throw new Error("Aquisitivo inválido.");
    const contract = await tx.hrEmploymentContract.findUniqueOrThrow({ where: { id: input.contractId } });
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`RH:employee:${contract.employeeId}`}))`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`RH:contract:${input.contractId}`}))`;
    const replay = await tx.hrRightEntry.findUnique({ where: { sourceKey: input.sourceKey } });
    if (replay) {
      const details = replay.details as { kind: string; start: string; reason: string };
      if (replay.contractId !== input.contractId || !replay.quantity.eq(-input.days) || replay.periodStart.getTime() !== periodStart.getTime() || replay.periodEnd.getTime() !== periodEnd.getTime() || details.kind !== input.kind || details.start !== input.start || details.reason !== input.reason) throw new Error("Solicitação repetida com dados diferentes.");
      return replay;
    }
    const stored = await tx.hrEmploymentContract.findUniqueOrThrow({ where: { id: input.contractId }, include: { revisions: true } });
    const applicable = resolveContractRevision(stored, stored.revisions, { start, end: start }).contract;
    if (start < applicable.admittedAt || (applicable.endsAt && end > applicable.endsAt)) throw new Error("Reserva fora do período do vínculo.");
    if (stored.revisions.some(revision => revision.effectiveFrom > start && revision.effectiveFrom <= end && ((revision.snapshot as { regimeId: string; status: string }).regimeId !== applicable.regimeId || (revision.snapshot as { status: string }).status !== "ATIVO"))) throw new Error("Reserva atravessa mudança de regime/situação que exige política de transição.");
    const regime = await tx.hrEmploymentRegime.findUniqueOrThrow({ where: { id: applicable.regimeId }, include: { vacationPolicy: true, ruleSet: true } });
    const policy = regime.vacationPolicy;
    if (!policy?.isActive || !regime.isActive || applicable.status !== "ATIVO" || regime.ruleSet.status !== "ATIVA") throw new Error("Contrato e política ativos obrigatórios.");
    if (regime.ruleSet.effectiveFrom > start || (regime.ruleSet.effectiveUntil && regime.ruleSet.effectiveUntil < end)) throw new Error("Política deve cobrir toda a reserva.");
    const entries = await tx.hrRightEntry.findMany({ where: { contractId: contract.id, kind: "FERIAS", periodStart, periodEnd } });
    const balance = entries.reduce((sum, entry) => sum.add(entry.quantity), new Prisma.Decimal(0));
    if (balance.lt(input.days)) throw new Error("Dias solicitados excedem saldo do aquisitivo.");
    const canceled = new Set(entries.map(entry => (entry.details as { cancelsId?: string }).cancelsId).filter(Boolean));
    const reservations = entries.filter(entry => entry.quantity.lt(0) && !canceled.has(entry.id));
    const totalCash = reservations.filter(entry => (entry.details as { kind?: string }).kind === "PECUNIA").reduce((sum, entry) => sum.sub(entry.quantity), new Prisma.Decimal(0));
    if (input.kind === "PECUNIA") {
      if (!policy.allowsCashAbono || totalCash.add(input.days).gt(policy.maxCashAbonoDays)) throw new Error("Pecúnia não permitida ou acima do limite.");
    } else {
      const gozos = reservations.filter(entry => (entry.details as { kind?: string }).kind === "GOZO");
      if (gozos.length >= policy.maxSplits || input.days < (gozos.length ? policy.minOtherSplitDays : policy.minFirstSplitDays)) throw new Error("Fracionamento/duração incompatível com a política.");
      if (start <= periodEnd) throw new Error("Gozo deve ocorrer após o período aquisitivo.");
      const vacation = await tx.vacation.findFirst({ where: { employeeId: contract.employeeId, status: { in: ["Programada", "Em gozo", "Concluída"] }, enjoymentStart: { lte: end }, enjoymentEnd: { gte: start } } });
      const leave = await tx.leave.findFirst({ where: { employeeId: contract.employeeId, status: "Ativa", startDate: { lte: end }, endDate: { gte: start } } });
      if (vacation || leave) throw new Error("Período conflita com férias ou afastamento vigente.");
    }
    const vacation = input.kind === "GOZO" ? await tx.vacation.create({ data: { employeeId: contract.employeeId, acquisitionStart: periodStart, acquisitionEnd: periodEnd, enjoymentStart: start, enjoymentEnd: end, days: input.days, status: "Programada" } }) : null;
    return tx.hrRightEntry.create({ data: { contractId: contract.id, sourceKey: input.sourceKey, kind: "FERIAS", periodStart, periodEnd, quantity: -input.days, amount: 0, actorId, details: JSON.parse(JSON.stringify({ kind: input.kind, start: input.start, end, reason: input.reason, vacationId: vacation?.id ?? null, policy })) } });
}

export async function cancelVacationReservation(db: PrismaClient, actorId: string, raw: unknown) {
  const input = z.object({ entryId: z.string().min(1), reason: z.string().trim().min(3).max(2000) }).strict().parse(raw);
  return db.$transaction(async tx => {
    const original = await tx.hrRightEntry.findUniqueOrThrow({ where: { id: input.entryId } });
    const details = original.details as { kind?: string; vacationId?: string; groupSourceKey?: string };
    if (details.groupSourceKey) throw new Error("Reserva de múltiplos aquisitivos exige cancelamento integral pelo fluxo do grupo.");
    if (original.kind !== "FERIAS" || !original.quantity.lt(0) || details.kind !== "GOZO" || !details.vacationId) throw new Error("Selecione uma reserva de gozo de férias com programação vinculada.");
    const contract = await tx.hrEmploymentContract.findUniqueOrThrow({ where: { id: original.contractId } });
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`RH:employee:${contract.employeeId}`}))`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`RH:contract:${contract.id}`}))`;
    const sourceKey = `FERIAS:CANCELAMENTO:${original.id}`;
    const previous = await tx.hrRightEntry.findUnique({ where: { sourceKey } });
    if (previous) {
      if ((previous.details as { reason: string }).reason !== input.reason) throw new Error("Reserva já cancelada com outro motivo; o histórico foi preservado.");
      return previous;
    }
    if (await tx.hrIntegrationEvent.findUnique({ where: { sourceKey: `FERIAS:FOLHA:${original.id}` } })) throw new Error("Reserva conciliada em folha fechada exige compensação financeira antes de cancelar.");
    await tx.$queryRaw`SELECT id FROM "Vacation" WHERE id=${details.vacationId} FOR UPDATE`;
    const vacation = await tx.vacation.findUniqueOrThrow({ where: { id: details.vacationId } });
    const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
    if (vacation.status !== "Programada" || !vacation.enjoymentStart || vacation.enjoymentStart <= today) throw new Error("Cancelamento automático exige férias programadas ainda não iniciadas.");
    if (vacation.employeeId !== contract.employeeId) throw new Error("Programação incompatível com o titular da reserva.");
    const from = vacation.enjoymentStart.toISOString().slice(0, 10); const until = vacation.enjoymentEnd?.toISOString().slice(0, 10) || from;
    const statements = await tx.hrPayrollStatement.findMany({ where: { contractId: contract.id, run: { status: "FECHADA" } }, select: { snapshot: true, run: { select: { payroll: { select: { competence: true } } } } } });
    if (statements.some(statement => {
      const [month, year] = statement.run.payroll.competence.split("/"); const competence = `${year}-${month}`;
      return competence >= from.slice(0, 7) && competence <= until.slice(0, 7);
    })) throw new Error("Período com folha fechada exige conciliação financeira antes de restaurar os direitos.");
    await tx.vacation.update({ where: { id: vacation.id }, data: { status: "Cancelada" } });
    return tx.hrRightEntry.create({ data: { contractId: original.contractId, sourceKey, kind: original.kind, periodStart: original.periodStart, periodEnd: original.periodEnd, quantity: original.quantity.negated(), amount: original.amount.negated(), actorId, details: { cancelsId: original.id, vacationId: vacation.id, reason: input.reason } } });
  });
}
