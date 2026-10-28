import { and, eq, inArray, sql } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseTransaction } from "@/db/transaction";
import { lockPersonnel, personnelJson as json } from "@/db/repositories/personnel/integration";
import { listEmploymentContracts, requireEmploymentContract, requireEmploymentRegime, requireEmploymentHolderHistory, requirePayroll, requirePayrollRule, requirePayrollRun, requirePayrollRunWithStatements } from "@/db/repositories/personnel/workforce";
import { hrEmploymentContracts, hrMovements, hrPayrollRuns, hrPayrollStatements, payrolls } from "@/db/schema/personnel-workforce";
import { hrPayrollRubrics } from "@/db/schema/personnel-configuration";
import { hrConsignmentAgreements as agreements, hrConsignmentEntries as entriesTable, hrConsignmentInstallments as installmentsTable } from "@/db/schema/personnel-consignment";
import { suppliers } from "@/db/schema/registry";
import { z } from "zod";
import { payrollPeriod } from "./calculation-engine";
import { resolveContractRevision } from "./contract-timeline";
import { consignmentMarginSchema } from "./consignment-margin";

type Tx = DatabaseTransaction;
const competence = (date: Date) => `${String(date.getUTCMonth() + 1).padStart(2, "0")}/${date.getUTCFullYear()}`;
const cents = z.string().regex(/^\d{1,15}(?:\.\d{1,2})?$/).refine(value => new Decimal(value).gt(0), "Parcela deve ser positiva.");

async function loadAgreementInstallments(tx: Tx, agreementId: string) {
  const rows = await tx.select().from(installmentsTable).where(eq(installmentsTable.agreementId, agreementId));
  const entries = await tx.select().from(entriesTable).where(inArray(entriesTable.installmentId, rows.map(row => row.id)));
  return rows.map(row => ({ ...row, entries: entries.filter(entry => entry.installmentId === row.id) }));
}
async function requireInstallment(tx: Tx, id: string) {
  const [row] = await tx.select({ installment: installmentsTable, agreement: agreements }).from(installmentsTable).innerJoin(agreements, eq(agreements.id, installmentsTable.agreementId)).where(eq(installmentsTable.id, id)).limit(1);
  if (!row) throw new Error("Parcela não encontrada.");
  return { ...row.installment, agreement: row.agreement };
}

export async function assertConsignmentSchedulePosted(tx: Tx, contractIds: string[], competenceAt: Date, scope: string, marginConfigured: boolean) {
  const rows = await tx.select({ installment: installmentsTable }).from(installmentsTable).innerJoin(agreements, eq(agreements.id, installmentsTable.agreementId)).where(and(eq(installmentsTable.competenceAt, competenceAt), inArray(agreements.contractId, contractIds), eq(agreements.scope, scope)));
  const installments = [];
  for (const { installment } of rows) installments.push({ ...installment, entries: await tx.select().from(entriesTable).where(eq(entriesTable.installmentId, installment.id)) });
  for (const installment of installments) {
    const balance = installment.entries.reduce((total, entry) => total.add(entry.amount), new Decimal(0));
    if (balance.isZero()) continue;
    if (!balance.eq(installment.amount)) throw new Error("Reserva de consignação inconsistente; concilie antes de calcular/fechar.");
    if (!marginConfigured) throw new Error("Cronograma de consignação exige política de margem ativa no cálculo.");
    if (!installment.entries.some(entry => entry.kind === "LANCAMENTO")) throw new Error("Há parcela consignada reservada e ainda não lançada na competência. Gere as parcelas antes de calcular/fechar.");
  }
}

async function lockEmployeeContracts(tx: Tx, contractId: string) {
  const initial = await requireEmploymentContract(tx, contractId);
  await lockPersonnel(tx, `employee:${initial.employeeId}`);
  const all = await listEmploymentContracts(tx, eq(hrEmploymentContracts.employeeId, initial.employeeId));
  for (const contract of all) await lockPersonnel(tx, `contract:${contract.id}`);
  return requireEmploymentHolderHistory(tx, contractId);
}

async function assertOpenCompetence(tx: Tx, employeeId: string, date: Date) {
  if ((await tx.select({ id: hrPayrollStatements.id }).from(hrPayrollStatements).innerJoin(hrEmploymentContracts, eq(hrEmploymentContracts.id, hrPayrollStatements.contractId)).innerJoin(hrPayrollRuns, eq(hrPayrollRuns.id, hrPayrollStatements.runId)).innerJoin(payrolls, eq(payrolls.id, hrPayrollRuns.payrollId)).where(and(eq(hrEmploymentContracts.employeeId, employeeId), eq(hrPayrollRuns.status, "FECHADA"), eq(hrPayrollRuns.mode, "OFICIAL"), eq(payrolls.competence, competence(date)), eq(payrolls.type, "Mensal"))).limit(1)).length) throw new Error("Competência fechada exige conciliação; a consignação não pode alterar seu histórico.");
}

export async function reserveConsignmentAgreement(db: DatabaseConnection, actorId: string, raw: unknown) {
  return withDatabaseTransaction(db, tx => reserveConsignmentAgreementInTransaction(tx, actorId, raw), { timeoutMs: 60000 });
}

export async function reserveConsignmentAgreementInTransaction(tx: Tx, actorId: string, raw: unknown) {
  const input = z.object({ sourceKey: z.string().trim().min(1).max(160), contractId: z.string().min(1), supplierId: z.string().min(1), sourceRunId: z.string().min(1), ruleId: z.string().min(1), number: z.string().trim().min(1).max(100), rubricCode: z.string().min(1), firstCompetence: z.string(), count: z.coerce.number().int().min(1).max(120), amount: cents, reason: z.string().trim().min(10).max(2000) }).strict().parse(raw);
  const first = payrollPeriod(input.firstCompetence).start;
  const normalized = { ...input, amount: new Decimal(input.amount).toFixed(2) };
    await lockPersonnel(tx, `consignment:${input.sourceKey}`);
    const [prior] = await tx.select().from(agreements).where(eq(agreements.sourceKey, input.sourceKey)).limit(1);
    const previous = prior ? { ...prior, installments: await loadAgreementInstallments(tx, prior.id) } : null;
    if (previous) {
      const request = (previous.snapshot as { request: unknown }).request;
      // JSONB object ordering is not significant.
      if (Object.entries(normalized).some(([key, value]) => (request as Record<string, unknown>)[key] !== value)) throw new Error("Chave de consignação reutilizada com dados diferentes.");
      return previous;
    }
    const stored = await lockEmployeeContracts(tx, input.contractId);
    if (!stored.employee.isActive || !stored.employee.personId) throw new Error("Servidor sem identidade funcional ativa.");
    const sourceRun = await requirePayrollRunWithStatements(tx, input.sourceRunId);
    const titularContracts = await listEmploymentContracts(tx, eq(hrEmploymentContracts.employeeId, stored.employeeId));
    const run = { ...sourceRun, statements: sourceRun.statements.filter(row => titularContracts.some(contract => contract.id === row.contractId)) };
    if (run.mode !== "OFICIAL" || run.status !== "FECHADA" || run.payroll.type !== "Mensal" || !run.statements.length) throw new Error("Referência exige folha mensal oficial fechada do titular.");
    const referenceDate = payrollPeriod(run.payroll.competence).start;
    if (first <= referenceDate) throw new Error("A primeira parcela deve ser posterior à folha de referência.");
    const rule = await requirePayrollRule(tx, input.ruleId);
    const policy = z.object({ origin: z.literal("CONSIGNACAO_CONTRATOS"), maxInstallments: z.number().int().min(1).max(120), referenceValidityMonths: z.number().int().min(1).max(24), supplierIds: z.array(z.string().min(1)).min(1), legalReference: z.string().trim().min(3) }).strict().parse(rule.value);
    const interval = (first.getUTCFullYear() - referenceDate.getUTCFullYear()) * 12 + first.getUTCMonth() - referenceDate.getUTCMonth();
    if (!rule.isActive || rule.ruleSet.status !== "ATIVA" || rule.ruleSetId !== run.ruleSetId || rule.ruleSet.scope !== run.scope || input.count > policy.maxInstallments || interval > policy.referenceValidityMonths || !policy.supplierIds.includes(input.supplierId)) throw new Error("Política de consignação, prazo ou consignatária incompatível com a referência.");
    if (run.scope === "PRODUCAO" && (rule.ruleSet.isDemo || !rule.ruleSet.approvedAt || rule.ruleSet.approvedAt > new Date() || !rule.ruleSet.legalReference)) throw new Error("Consignações de produção exigem conjunto oficial aprovado e fundamento legal.");
    const [supplier] = await tx.select({ id: suppliers.id, status: suppliers.status, personId: suppliers.personId, companyId: suppliers.companyId }).from(suppliers).where(eq(suppliers.id, input.supplierId)).limit(1);
    if (!supplier) throw new Error("Consignatária não encontrada.");
    if (supplier.status !== "Ativo") throw new Error("Consignatária deve estar ativa no cadastro central de fornecedores/credores.");
    if ((await tx.select({ id: agreements.id }).from(agreements).where(and(eq(agreements.contractId, stored.id), eq(agreements.supplierId, supplier.id), eq(agreements.number, input.number), eq(agreements.scope, run.scope))).limit(1)).length) throw new Error("Contrato da consignatária já cadastrado para este vínculo/escopo; preserve a origem existente.");
    const otherRuns = await tx.select({ competence: payrolls.competence }).from(hrPayrollRuns).innerJoin(payrolls, eq(payrolls.id, hrPayrollRuns.payrollId)).innerJoin(hrPayrollStatements, eq(hrPayrollStatements.runId, hrPayrollRuns.id)).innerJoin(hrEmploymentContracts, eq(hrEmploymentContracts.id, hrPayrollStatements.contractId)).where(and(eq(hrPayrollRuns.mode, "OFICIAL"), eq(hrPayrollRuns.status, "FECHADA"), eq(hrPayrollRuns.scope, run.scope), eq(payrolls.type, "Mensal"), eq(hrEmploymentContracts.employeeId, stored.employeeId)));
    if (otherRuns.some(other => payrollPeriod(other.competence).start > referenceDate)) throw new Error("Use a folha de referência mais recente do titular.");
    const margin = z.object({ consignmentMargin: consignmentMarginSchema }).parse(run.statements[0].snapshot).consignmentMargin;
    if (!margin.contractIds.includes(stored.id) || !margin.policy.consignmentRubricCodes.includes(input.rubricCode)) throw new Error("Contrato/rubrica não integra a política de margem de referência.");
    const sourceMovementIds = run.statements.flatMap(statement => z.object({ contract: z.object({ movements: z.array(z.object({ id: z.string() })) }) }).parse(statement.snapshot).contract.movements.map(movement => movement.id));
    const managed = await tx.select({ amount: installmentsTable.amount }).from(entriesTable).innerJoin(installmentsTable, eq(installmentsTable.id, entriesTable.installmentId)).where(and(eq(entriesTable.kind, "LANCAMENTO"), inArray(entriesTable.movementId, sourceMovementIds)));
    const managedUsed = managed.reduce((total, entry) => total.add(entry.amount), new Decimal(0));
    const baselineUsed = new Decimal(margin.used).sub(managedUsed);
    if (baselineUsed.lt(0)) throw new Error("Parcelas gerenciadas divergem da margem histórica; concilie a referência.");
    const schedules = [];
    for (let index = 0; index < input.count; index++) {
      const date = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + index, 1));
      const period = payrollPeriod(competence(date));
      const contract = resolveContractRevision(stored, stored.revisions, period).contract;
      const regime = await requireEmploymentRegime(tx, contract.regimeId);
      if (contract.status !== "ATIVO" || contract.admittedAt > date || (contract.endsAt && contract.endsAt < period.end) || !regime.isActive || regime.ruleSetId !== run.ruleSetId || rule.ruleSet.effectiveFrom > date || (rule.ruleSet.effectiveUntil && rule.ruleSet.effectiveUntil < period.end)) throw new Error("Cronograma fora do vínculo/regime ou da vigência da política.");
      const [rubric] = await tx.select().from(hrPayrollRubrics).where(and(eq(hrPayrollRubrics.ruleSetId, regime.ruleSetId), eq(hrPayrollRubrics.code, input.rubricCode), eq(hrPayrollRubrics.isActive, true), eq(hrPayrollRubrics.type, "DESCONTO"), eq(hrPayrollRubrics.calculationMethod, "MANUAL"))).limit(1);
      if (!rubric) throw new Error("Parcela exige rubrica MANUAL de desconto ativa.");
      await assertOpenCompetence(tx, stored.employeeId, date);
      const [reserved] = await tx.select({ amount: sql<string | null>`sum(${entriesTable.amount})::text` }).from(entriesTable).innerJoin(installmentsTable, eq(installmentsTable.id, entriesTable.installmentId)).innerJoin(agreements, eq(agreements.id, installmentsTable.agreementId)).innerJoin(hrEmploymentContracts, eq(hrEmploymentContracts.id, agreements.contractId)).where(and(eq(installmentsTable.competenceAt, date), eq(agreements.scope, run.scope), eq(hrEmploymentContracts.employeeId, stored.employeeId)));
      if (new Decimal(reserved.amount || 0).add(baselineUsed).add(input.amount).gt(margin.limit)) throw new Error(`Reserva excede a margem de referência em ${competence(date)}.`);
      schedules.push({ sequence: index + 1, competenceAt: date, amount: input.amount });
    }
    const [agreement] = await tx.insert(agreements).values({ sourceKey: input.sourceKey, contractId: stored.id, supplierId: supplier.id, sourceRunId: run.id, scope: run.scope, number: input.number, rubricCode: input.rubricCode, actorId, snapshot: json({ request: normalized, policy, margin, baselineUsed: baselineUsed.toFixed(2), supplier }) }).returning();
    for (const schedule of schedules) {
      const [installment] = await tx.insert(installmentsTable).values({ ...schedule, amount: new Decimal(schedule.amount), agreementId: agreement.id }).returning();
      await tx.insert(entriesTable).values({ installmentId: installment.id, sourceKey: `CONSIGNACAO:RESERVA:${input.sourceKey}:${schedule.sequence}`, kind: "RESERVA", amount: new Decimal(schedule.amount), reason: input.reason, actorId });
    }
    return { ...agreement, installments: await loadAgreementInstallments(tx, agreement.id) };
}

export async function postConsignmentInstallment(db: DatabaseConnection, actorId: string, raw: unknown) {
  const input = z.object({ installmentId: z.string().min(1), payrollId: z.string().min(1) }).strict().parse(raw);
  return withDatabaseTransaction(db, async tx => {
    const installment = await requireInstallment(tx, input.installmentId);
    await lockPersonnel(tx, `payroll:${input.payrollId}`);
    const stored = await lockEmployeeContracts(tx, installment.agreement.contractId);
    const entries = await tx.select().from(entriesTable).where(eq(entriesTable.installmentId, installment.id));
    const posted = entries.find(entry => entry.kind === "LANCAMENTO");
    const payroll = await requirePayroll(tx, input.payrollId);
    if (payroll.type !== "Mensal" || payroll.competence !== competence(installment.competenceAt)) throw new Error("Selecione a folha mensal da competência da parcela.");
    if (posted) {
      const [movement] = await tx.select().from(hrMovements).where(eq(hrMovements.id, posted.movementId!)).limit(1);
      if (!movement) throw new Error("Movimento da parcela não encontrado.");
      return movement;
    }
    if (["Fechada", "Paga"].includes(payroll.status)) throw new Error("Folha fechada não pode receber parcela.");
    if (!entries.reduce((total, entry) => total.add(entry.amount), new Decimal(0)).eq(installment.amount)) throw new Error("Parcela cancelada ou reserva inconsistente.");
    await assertOpenCompetence(tx, stored.employeeId, installment.competenceAt);
    const period = payrollPeriod(payroll.competence);
    const contract = resolveContractRevision(stored, stored.revisions, period).contract;
    const regime = await requireEmploymentRegime(tx, contract.regimeId);
    const [rubric] = await tx.select().from(hrPayrollRubrics).where(and(eq(hrPayrollRubrics.ruleSetId, regime.ruleSetId), eq(hrPayrollRubrics.code, installment.agreement.rubricCode), eq(hrPayrollRubrics.isActive, true), eq(hrPayrollRubrics.type, "DESCONTO"), eq(hrPayrollRubrics.calculationMethod, "MANUAL"))).limit(1);
    const source = await requirePayrollRun(tx, installment.agreement.sourceRunId);
    if (!stored.employee.isActive || contract.status !== "ATIVO" || !regime.isActive || regime.ruleSetId !== source.ruleSetId || regime.ruleSet.scope !== installment.agreement.scope || regime.ruleSet.status !== "ATIVA" || regime.ruleSet.effectiveFrom > period.start || (regime.ruleSet.effectiveUntil && regime.ruleSet.effectiveUntil < period.end) || !rubric || contract.admittedAt > period.start || (contract.endsAt && contract.endsAt < period.end)) throw new Error("Vínculo/regra mudou; revise a parcela antes do lançamento.");
    const [supplier] = await tx.select().from(suppliers).where(eq(suppliers.id, installment.agreement.supplierId)).limit(1);
    if (!supplier) throw new Error("Consignatária não encontrada.");
    if (supplier.status !== "Ativo") throw new Error("Consignatária inativa.");
    const [movement] = await tx.insert(hrMovements).values({ contractId: contract.id, sourceKey: `CONSIGNACAO:PARCELA:${installment.id}`, rubricCode: rubric.code, startsAt: period.start, endsAt: period.end, amount: installment.amount, reference: `${installment.agreement.number} / ${installment.sequence}`, notes: `Consignatária ${supplier.id} · contrato ${installment.agreement.id}`, actorId }).returning();
    await tx.insert(entriesTable).values({ installmentId: installment.id, sourceKey: `CONSIGNACAO:LANCAMENTO:${installment.id}`, kind: "LANCAMENTO", amount: new Decimal(0), movementId: movement.id, reason: `Lançamento na competência ${payroll.competence}`, actorId });
    return movement;
  });
}

export async function cancelConsignmentInstallment(db: DatabaseConnection, actorId: string, raw: unknown) {
  const input = z.object({ installmentId: z.string().min(1), reason: z.string().trim().min(10).max(2000) }).strict().parse(raw);
  return withDatabaseTransaction(db, async tx => {
    const installment = await requireInstallment(tx, input.installmentId);
    const stored = await lockEmployeeContracts(tx, installment.agreement.contractId);
    const entries = await tx.select().from(entriesTable).where(eq(entriesTable.installmentId, installment.id));
    const previous = entries.find(entry => entry.kind === "CANCELAMENTO");
    if (previous) {
      if (previous.reason !== input.reason) throw new Error("Parcela já cancelada com outro fundamento.");
      return previous;
    }
    if (entries.some(entry => entry.kind === "LANCAMENTO")) throw new Error("Parcela lançada exige conciliação e compensação; preserve sua origem.");
    await assertOpenCompetence(tx, stored.employeeId, installment.competenceAt);
    const [entry] = await tx.insert(entriesTable).values({ installmentId: installment.id, sourceKey: `CONSIGNACAO:CANCELAMENTO:${installment.id}`, kind: "CANCELAMENTO", amount: installment.amount.negated(), reason: input.reason, actorId }).returning();
    return entry;
  });
}
