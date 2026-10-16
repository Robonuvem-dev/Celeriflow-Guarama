import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { payrollPeriod } from "./calculation-engine";
import { resolveContractRevision } from "./contract-timeline";
import { consignmentMarginSchema } from "./consignment-margin";

type Tx = Prisma.TransactionClient;
const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value));
const competence = (date: Date) => `${String(date.getUTCMonth() + 1).padStart(2, "0")}/${date.getUTCFullYear()}`;
const cents = z.string().regex(/^\d{1,15}(?:\.\d{1,2})?$/).refine(value => new Prisma.Decimal(value).gt(0), "Parcela deve ser positiva.");

export async function assertConsignmentSchedulePosted(tx: Tx, contractIds: string[], competenceAt: Date, scope: string, marginConfigured: boolean) {
  const installments = await tx.hrConsignmentInstallment.findMany({ where: { competenceAt, agreement: { contractId: { in: contractIds }, scope } }, include: { entries: true } });
  for (const installment of installments) {
    const balance = installment.entries.reduce((total, entry) => total.add(entry.amount), new Prisma.Decimal(0));
    if (balance.isZero()) continue;
    if (!balance.eq(installment.amount)) throw new Error("Reserva de consignação inconsistente; concilie antes de calcular/fechar.");
    if (!marginConfigured) throw new Error("Cronograma de consignação exige política de margem ativa no cálculo.");
    if (!installment.entries.some(entry => entry.kind === "LANCAMENTO")) throw new Error("Há parcela consignada reservada e ainda não lançada na competência. Gere as parcelas antes de calcular/fechar.");
  }
}

async function lockEmployeeContracts(tx: Tx, contractId: string) {
  const initial = await tx.hrEmploymentContract.findUniqueOrThrow({ where: { id: contractId } });
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`RH:employee:${initial.employeeId}`}))`;
  const all = await tx.hrEmploymentContract.findMany({ where: { employeeId: initial.employeeId }, orderBy: { id: "asc" }, select: { id: true } });
  for (const contract of all) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`RH:contract:${contract.id}`}))`;
  return tx.hrEmploymentContract.findUniqueOrThrow({ where: { id: contractId }, include: { employee: true, revisions: true } });
}

async function assertOpenCompetence(tx: Tx, employeeId: string, date: Date) {
  if (await tx.hrPayrollStatement.findFirst({ where: { contract: { employeeId }, run: { status: "FECHADA", mode: "OFICIAL", payroll: { competence: competence(date), type: "Mensal" } } }, select: { id: true } })) throw new Error("Competência fechada exige conciliação; a consignação não pode alterar seu histórico.");
}

export async function reserveConsignmentAgreement(db: PrismaClient, actorId: string, raw: unknown) {
  return db.$transaction(tx => reserveConsignmentAgreementInTransaction(tx, actorId, raw), { timeout: 60000 });
}

export async function reserveConsignmentAgreementInTransaction(tx: Tx, actorId: string, raw: unknown) {
  const input = z.object({ sourceKey: z.string().trim().min(1).max(160), contractId: z.string().min(1), supplierId: z.string().min(1), sourceRunId: z.string().min(1), ruleId: z.string().min(1), number: z.string().trim().min(1).max(100), rubricCode: z.string().min(1), firstCompetence: z.string(), count: z.coerce.number().int().min(1).max(120), amount: cents, reason: z.string().trim().min(10).max(2000) }).strict().parse(raw);
  const first = payrollPeriod(input.firstCompetence).start;
  const normalized = { ...input, amount: new Prisma.Decimal(input.amount).toFixed(2) };
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`RH:consignment:${input.sourceKey}`}))`;
    const previous = await tx.hrConsignmentAgreement.findUnique({ where: { sourceKey: input.sourceKey }, include: { installments: { include: { entries: true } } } });
    if (previous) {
      const request = (previous.snapshot as { request: unknown }).request;
      // JSONB object ordering is not significant.
      if (Object.entries(normalized).some(([key, value]) => (request as Record<string, unknown>)[key] !== value)) throw new Error("Chave de consignação reutilizada com dados diferentes.");
      return previous;
    }
    const stored = await lockEmployeeContracts(tx, input.contractId);
    if (!stored.employee.isActive || !stored.employee.personId) throw new Error("Servidor sem identidade funcional ativa.");
    const run = await tx.hrPayrollRun.findUniqueOrThrow({ where: { id: input.sourceRunId }, include: { payroll: true, statements: { where: { contract: { employeeId: stored.employeeId } } } } });
    if (run.mode !== "OFICIAL" || run.status !== "FECHADA" || run.payroll.type !== "Mensal" || !run.statements.length) throw new Error("Referência exige folha mensal oficial fechada do titular.");
    const referenceDate = payrollPeriod(run.payroll.competence).start;
    if (first <= referenceDate) throw new Error("A primeira parcela deve ser posterior à folha de referência.");
    const rule = await tx.hrPayrollRule.findUniqueOrThrow({ where: { id: input.ruleId }, include: { ruleSet: true } });
    const policy = z.object({ origin: z.literal("CONSIGNACAO_CONTRATOS"), maxInstallments: z.number().int().min(1).max(120), referenceValidityMonths: z.number().int().min(1).max(24), supplierIds: z.array(z.string().min(1)).min(1), legalReference: z.string().trim().min(3) }).strict().parse(rule.value);
    const interval = (first.getUTCFullYear() - referenceDate.getUTCFullYear()) * 12 + first.getUTCMonth() - referenceDate.getUTCMonth();
    if (!rule.isActive || rule.ruleSet.status !== "ATIVA" || rule.ruleSetId !== run.ruleSetId || rule.ruleSet.scope !== run.scope || input.count > policy.maxInstallments || interval > policy.referenceValidityMonths || !policy.supplierIds.includes(input.supplierId)) throw new Error("Política de consignação, prazo ou consignatária incompatível com a referência.");
    if (run.scope === "PRODUCAO" && (rule.ruleSet.isDemo || !rule.ruleSet.approvedAt || rule.ruleSet.approvedAt > new Date() || !rule.ruleSet.legalReference)) throw new Error("Consignações de produção exigem conjunto oficial aprovado e fundamento legal.");
    const supplier = await tx.supplier.findUniqueOrThrow({ where: { id: input.supplierId }, select: { id: true, status: true, personId: true, companyId: true } });
    if (supplier.status !== "Ativo") throw new Error("Consignatária deve estar ativa no cadastro central de fornecedores/credores.");
    if (await tx.hrConsignmentAgreement.findFirst({ where: { contractId: stored.id, supplierId: supplier.id, number: input.number, scope: run.scope }, select: { id: true } })) throw new Error("Contrato da consignatária já cadastrado para este vínculo/escopo; preserve a origem existente.");
    const otherRuns = await tx.hrPayrollRun.findMany({ where: { mode: "OFICIAL", status: "FECHADA", scope: run.scope, payroll: { type: "Mensal" }, statements: { some: { contract: { employeeId: stored.employeeId } } } }, select: { payroll: { select: { competence: true } } } });
    if (otherRuns.some(other => payrollPeriod(other.payroll.competence).start > referenceDate)) throw new Error("Use a folha de referência mais recente do titular.");
    const margin = z.object({ consignmentMargin: consignmentMarginSchema }).parse(run.statements[0].snapshot).consignmentMargin;
    if (!margin.contractIds.includes(stored.id) || !margin.policy.consignmentRubricCodes.includes(input.rubricCode)) throw new Error("Contrato/rubrica não integra a política de margem de referência.");
    const sourceMovementIds = run.statements.flatMap(statement => z.object({ contract: z.object({ movements: z.array(z.object({ id: z.string() })) }) }).parse(statement.snapshot).contract.movements.map(movement => movement.id));
    const managed = await tx.hrConsignmentEntry.findMany({ where: { kind: "LANCAMENTO", movementId: { in: sourceMovementIds } }, include: { installment: true } });
    const managedUsed = managed.reduce((total, entry) => total.add(entry.installment.amount), new Prisma.Decimal(0));
    const baselineUsed = new Prisma.Decimal(margin.used).sub(managedUsed);
    if (baselineUsed.lt(0)) throw new Error("Parcelas gerenciadas divergem da margem histórica; concilie a referência.");
    const schedules = [];
    for (let index = 0; index < input.count; index++) {
      const date = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + index, 1));
      const period = payrollPeriod(competence(date));
      const contract = resolveContractRevision(stored, stored.revisions, period).contract;
      const regime = await tx.hrEmploymentRegime.findUniqueOrThrow({ where: { id: contract.regimeId } });
      if (contract.status !== "ATIVO" || contract.admittedAt > date || (contract.endsAt && contract.endsAt < period.end) || !regime.isActive || regime.ruleSetId !== run.ruleSetId || rule.ruleSet.effectiveFrom > date || (rule.ruleSet.effectiveUntil && rule.ruleSet.effectiveUntil < period.end)) throw new Error("Cronograma fora do vínculo/regime ou da vigência da política.");
      const rubric = await tx.hrPayrollRubric.findFirst({ where: { ruleSetId: regime.ruleSetId, code: input.rubricCode, isActive: true, type: "DESCONTO", calculationMethod: "MANUAL" } });
      if (!rubric) throw new Error("Parcela exige rubrica MANUAL de desconto ativa.");
      await assertOpenCompetence(tx, stored.employeeId, date);
      const reserved = await tx.hrConsignmentEntry.aggregate({ where: { installment: { competenceAt: date, agreement: { scope: run.scope, contract: { employeeId: stored.employeeId } } } }, _sum: { amount: true } });
      if (new Prisma.Decimal(reserved._sum.amount || 0).add(baselineUsed).add(input.amount).gt(margin.limit)) throw new Error(`Reserva excede a margem de referência em ${competence(date)}.`);
      schedules.push({ sequence: index + 1, competenceAt: date, amount: input.amount });
    }
    return tx.hrConsignmentAgreement.create({ data: { sourceKey: input.sourceKey, contractId: stored.id, supplierId: supplier.id, sourceRunId: run.id, scope: run.scope, number: input.number, rubricCode: input.rubricCode, actorId, snapshot: json({ request: normalized, policy, margin, baselineUsed: baselineUsed.toFixed(2), supplier }), installments: { create: schedules.map(schedule => ({ ...schedule, entries: { create: { sourceKey: `CONSIGNACAO:RESERVA:${input.sourceKey}:${schedule.sequence}`, kind: "RESERVA", amount: schedule.amount, reason: input.reason, actorId } } })) } }, include: { installments: { include: { entries: true } } } });
}

export async function postConsignmentInstallment(db: PrismaClient, actorId: string, raw: unknown) {
  const input = z.object({ installmentId: z.string().min(1), payrollId: z.string().min(1) }).strict().parse(raw);
  return db.$transaction(async tx => {
    const installment = await tx.hrConsignmentInstallment.findUniqueOrThrow({ where: { id: input.installmentId }, include: { agreement: true } });
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`RH:payroll:${input.payrollId}`}))`;
    const stored = await lockEmployeeContracts(tx, installment.agreement.contractId);
    const entries = await tx.hrConsignmentEntry.findMany({ where: { installmentId: installment.id } });
    const posted = entries.find(entry => entry.kind === "LANCAMENTO");
    const payroll = await tx.payroll.findUniqueOrThrow({ where: { id: input.payrollId } });
    if (payroll.type !== "Mensal" || payroll.competence !== competence(installment.competenceAt)) throw new Error("Selecione a folha mensal da competência da parcela.");
    if (posted) return tx.hrMovement.findUniqueOrThrow({ where: { id: posted.movementId! } });
    if (["Fechada", "Paga"].includes(payroll.status)) throw new Error("Folha fechada não pode receber parcela.");
    if (!entries.reduce((total, entry) => total.add(entry.amount), new Prisma.Decimal(0)).eq(installment.amount)) throw new Error("Parcela cancelada ou reserva inconsistente.");
    await assertOpenCompetence(tx, stored.employeeId, installment.competenceAt);
    const period = payrollPeriod(payroll.competence);
    const contract = resolveContractRevision(stored, stored.revisions, period).contract;
    const regime = await tx.hrEmploymentRegime.findUniqueOrThrow({ where: { id: contract.regimeId }, include: { ruleSet: true } });
    const rubric = await tx.hrPayrollRubric.findFirst({ where: { ruleSetId: regime.ruleSetId, code: installment.agreement.rubricCode, isActive: true, type: "DESCONTO", calculationMethod: "MANUAL" } });
    const source = await tx.hrPayrollRun.findUniqueOrThrow({ where: { id: installment.agreement.sourceRunId } });
    if (!stored.employee.isActive || contract.status !== "ATIVO" || !regime.isActive || regime.ruleSetId !== source.ruleSetId || regime.ruleSet.scope !== installment.agreement.scope || regime.ruleSet.status !== "ATIVA" || regime.ruleSet.effectiveFrom > period.start || (regime.ruleSet.effectiveUntil && regime.ruleSet.effectiveUntil < period.end) || !rubric || contract.admittedAt > period.start || (contract.endsAt && contract.endsAt < period.end)) throw new Error("Vínculo/regra mudou; revise a parcela antes do lançamento.");
    const supplier = await tx.supplier.findUniqueOrThrow({ where: { id: installment.agreement.supplierId } });
    if (supplier.status !== "Ativo") throw new Error("Consignatária inativa.");
    const movement = await tx.hrMovement.create({ data: { contractId: contract.id, sourceKey: `CONSIGNACAO:PARCELA:${installment.id}`, rubricCode: rubric.code, startsAt: period.start, endsAt: period.end, amount: installment.amount, reference: `${installment.agreement.number} / ${installment.sequence}`, notes: `Consignatária ${supplier.id} · contrato ${installment.agreement.id}`, actorId } });
    await tx.hrConsignmentEntry.create({ data: { installmentId: installment.id, sourceKey: `CONSIGNACAO:LANCAMENTO:${installment.id}`, kind: "LANCAMENTO", amount: 0, movementId: movement.id, reason: `Lançamento na competência ${payroll.competence}`, actorId } });
    return movement;
  });
}

export async function cancelConsignmentInstallment(db: PrismaClient, actorId: string, raw: unknown) {
  const input = z.object({ installmentId: z.string().min(1), reason: z.string().trim().min(10).max(2000) }).strict().parse(raw);
  return db.$transaction(async tx => {
    const installment = await tx.hrConsignmentInstallment.findUniqueOrThrow({ where: { id: input.installmentId }, include: { agreement: true } });
    const stored = await lockEmployeeContracts(tx, installment.agreement.contractId);
    const entries = await tx.hrConsignmentEntry.findMany({ where: { installmentId: installment.id } });
    const previous = entries.find(entry => entry.kind === "CANCELAMENTO");
    if (previous) {
      if (previous.reason !== input.reason) throw new Error("Parcela já cancelada com outro fundamento.");
      return previous;
    }
    if (entries.some(entry => entry.kind === "LANCAMENTO")) throw new Error("Parcela lançada exige conciliação e compensação; preserve sua origem.");
    await assertOpenCompetence(tx, stored.employeeId, installment.competenceAt);
    return tx.hrConsignmentEntry.create({ data: { installmentId: installment.id, sourceKey: `CONSIGNACAO:CANCELAMENTO:${installment.id}`, kind: "CANCELAMENTO", amount: installment.amount.negated(), reason: input.reason, actorId } });
  });
}
