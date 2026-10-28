import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import type { JsonValue } from "@/db/json";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction } from "@/db/transaction";
import { hrIntegrationEvents } from "@/db/schema/personnel-workforce";
import { expenses as expenseTable } from "@/db/schema/finance-expenses";
import { documents, suppliers } from "@/db/schema/registry";
import { findHrIntegrationEvent, requireHrIntegrationEvent } from "@/db/repositories/personnel/integration";
import { requirePayrollRun, requirePayrollRunWithStatements, requirePayrollRule } from "@/db/repositories/personnel/workforce";
import { requirePersonnelAppropriation, requirePersonnelCommitment, requirePersonnelSettlementWithRetentions, requirePersonnelPaymentWithRetentions } from "@/db/repositories/personnel/finance";
import { z } from "zod";
import { createExpenseRequest, createBudgetReservationInTransaction, createCommitmentInTransaction, createSettlementInTransaction, createPaymentInTransaction, updatePaymentStatusInTransaction, cancelCommitmentInTransaction } from "@/lib/financeiro";
import { AccessError, assertBudgetUnitAccess, canPerformModuleOperation, isSystemAdministrator, type AppContext } from "@/lib/platform/tenant-context";
import { assertPayrollBudgetScope } from "./payroll-access";
import { enqueueHrIntegration } from "./workforce-service";
import { allocateProratedStatementLocations } from "./prorated-statement-locations";

const targetSchema = z.object({ appropriationId: z.string().min(1), supplierId: z.string().min(1), secretariatId: z.string().min(1) }).strict();
const policySchema = z.object({ origin: z.literal("FOLHA_SOLICITACOES_DESPESA"), legalReference: z.string().min(3), mappings: z.array(z.object({ costCenterId: z.string().nullable(), gross: targetSchema, employer: targetSchema.optional() }).strict()).min(1) }).strict();
type PlanLine = z.infer<typeof targetSchema> & { key: string; costCenterId: string | null; component: "GROSS" | "EMPLOYER"; value: string };
const planLineSchema = targetSchema.extend({ key: z.string(), costCenterId: z.string().nullable(), component: z.enum(["GROSS", "EMPLOYER"]), value: z.string() });
const preparedSchema = z.object({ runId: z.string(), ruleId: z.string(), date: z.string(), legalReference: z.string(), lines: z.array(planLineSchema) });
const commitmentBatchSchema = z.object({ runId: z.string().min(1), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), commitments: z.array(z.object({ expenseId: z.string().min(1), number: z.string().trim().min(1).max(120), type: z.enum(["Ordinário", "Estimativo", "Global"]) }).strict()).min(1).max(1000) }).strict();

function payrollCommitmentKeys(runId: string) {
  const key = `FINANCEIRO:EMPENHOS:${runId}`;
  return and(eq(hrIntegrationEvents.eventType, "EMPENHOS_FOLHA"), or(eq(hrIntegrationEvents.sourceKey, key), sql`starts_with(${hrIntegrationEvents.sourceKey}, ${`${key}:CYCLE:`})`));
}

export function planPayrollExpenses(statements: { gross: Decimal; employer: Decimal; snapshot: JsonValue }[], rawPolicy: unknown): PlanLine[] {
  const policy = policySchema.parse(rawPolicy);
  if (new Set(policy.mappings.map(mapping => mapping.costCenterId)).size !== policy.mappings.length) throw new Error("Centro de custo duplicado no mapeamento financeiro.");
  const groups = new Map<string | null, { gross: Decimal; employer: Decimal }>();
  for (const statement of statements) {
    if ((statement.snapshot as { proration?: unknown }).proration) {
      for (const part of allocateProratedStatementLocations(statement.snapshot, statement.employer)) {
        const current = groups.get(part.costCenterId) ?? { gross: new Decimal(0), employer: new Decimal(0) };
        current.gross = current.gross.add(part.gross); current.employer = current.employer.add(part.employer); groups.set(part.costCenterId, current);
      }
      continue;
    }
    const { contract } = z.object({ contract: z.object({ costCenterId: z.string().nullable() }) }).parse(statement.snapshot);
    const current = groups.get(contract.costCenterId) || { gross: new Decimal(0), employer: new Decimal(0) };
    current.gross = current.gross.add(statement.gross); current.employer = current.employer.add(statement.employer); groups.set(contract.costCenterId, current);
  }
  const lines: PlanLine[] = [];
  for (const [costCenterId, group] of [...groups.entries()].sort(([a], [b]) => (a || "").localeCompare(b || ""))) {
    const mapping = policy.mappings.find(mapping => mapping.costCenterId === costCenterId);
    if (!mapping) throw new Error(`Mapeamento financeiro ausente para o centro ${costCenterId || "SEM_CENTRO"}.`);
    for (const component of ["GROSS", "EMPLOYER"] as const) {
      const value = component === "GROSS" ? group.gross : group.employer;
      if (value.isZero()) continue;
      if (!value.isFinite() || value.lt(0)) throw new Error("Componente financeiro negativo exige fluxo compensatório.");
      const target = component === "GROSS" ? mapping.gross : mapping.employer;
      if (!target) throw new Error("Encargos patronais exigem classificação própria no mapeamento.");
      lines.push({ ...target, key: JSON.stringify([costCenterId, component]), costCenterId, component, value: value.toFixed(2) });
    }
  }
  return lines;
}

/** Native Expense requests use a durable plan and independent idempotent steps.
 * A failure after one successful request is recoverable without duplicating it.
 * This does not bypass reservation, approval, accounting or payment gates. */
export async function dispatchPayrollExpenseRequests(connection: DatabaseConnection, context: AppContext, raw: unknown) {
  if (!canPerformModuleOperation(context.user, "RH", "update") || !canPerformModuleOperation(context.user, "FINANCEIRO", "create")) throw new AccessError("Integração exige alteração RH e criação no Financeiro.", 403);
  const input = z.object({ runId: z.string().min(1), ruleId: z.string().min(1), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), mode: z.enum(["PREVIA", "APLICAR"]) }).strict().parse(raw);
  const date = new Date(`${input.date}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== input.date) throw new Error("Data financeira inválida.");
  const db = connection.db;
  const run = await requirePayrollRunWithStatements(db, input.runId);
  await assertPayrollBudgetScope({ ...context, database: db }, run.payrollId);
  if (run.mode !== "OFICIAL" || run.status !== "FECHADA") throw new Error("Integração exige cálculo oficial fechado.");
  const sourceKey = `FINANCEIRO:DESPESAS:${run.id}`;
  const existing = await findHrIntegrationEvent(db, sourceKey);
  let prepared: z.infer<typeof preparedSchema>;
  if (existing) {
    prepared = preparedSchema.parse(existing.payload);
    if (prepared.ruleId !== input.ruleId || prepared.date !== input.date) throw new Error("Plano financeiro já preparado com outra classificação/data. Preserve a origem e use conciliação própria.");
  } else {
    const rule = await requirePayrollRule(db, input.ruleId);
    if (!rule.isActive || rule.ruleSet.status !== "ATIVA" || rule.ruleSetId !== run.ruleSetId) throw new Error("Mapeamento ativo do mesmo conjunto da folha é obrigatório.");
    const policy = policySchema.parse(rule.value);
    prepared = { runId: run.id, ruleId: rule.id, date: input.date, legalReference: policy.legalReference, lines: planPayrollExpenses(run.statements, policy) };
  }
  for (const line of prepared.lines) {
    const appropriation = await requirePersonnelAppropriation(db, line.appropriationId);
    assertBudgetUnitAccess(context.user, appropriation.budgetUnitId);
    if (appropriation.secretariatId !== line.secretariatId) throw new Error("Secretaria do mapeamento difere da unidade da dotação.");
    const [supplier] = await db.select().from(suppliers).where(eq(suppliers.id, line.supplierId)).limit(1);
    if (!supplier) throw new Error("Credor/fornecedor não encontrado.");
    if (supplier.status !== "Ativo") throw new Error("Credor/fornecedor inativo no mapeamento financeiro.");
  }
  if (input.mode === "PREVIA") return { applied: false, lines: prepared.lines, expenseIds: [] as string[] };
  if (run.scope !== "PRODUCAO") throw new Error("Folha demonstrativa/homologação não pode gerar despesas no Financeiro real.");
  if (!existing) {
    const set = (await requirePayrollRule(db, input.ruleId)).ruleSet;
    if (set.scope !== "PRODUCAO" || set.isDemo || !set.approvedAt || set.approvedAt > new Date() || !set.legalReference) throw new Error("Despesas reais exigem parâmetros oficiais aprovados e fundamento legal.");
  }
  const event = await withDatabaseTransaction(connection, tx => enqueueHrIntegration(tx, { sourceKey, domain: "FINANCEIRO", environment: run.scope, eventType: "SOLICITACOES_DESPESA_FOLHA", payload: prepared }));
  await db.update(hrIntegrationEvents).set({ status: "PROCESSANDO", attempts: sql`${hrIntegrationEvents.attempts} + 1` }).where(eq(hrIntegrationEvents.id, event.id));
  try {
    const expenseIds: string[] = [];
    for (const line of prepared.lines) {
      const idempotencyKey = `RH:RUN:${run.id}:DESPESA:${line.key}`;
      const [previous] = await db.select().from(expenseTable).where(eq(expenseTable.idempotencyKey, idempotencyKey)).limit(1);
      if (previous && (previous.sourceId !== run.id || previous.appropriationId !== line.appropriationId || previous.supplierId !== line.supplierId || previous.secretariatId !== line.secretariatId || !previous.valueDecimal?.eq(line.value))) throw new Error("Despesa existente diverge do plano imutável da folha.");
      const expense = await createExpenseRequest(connection, { usuarioId: context.user.id, employeeId: context.user.employeeId, allowedBudgetUnitIds: context.user.allowedBudgetUnitIds }, { date, description: `Folha ${run.id} · ${line.component} · ${line.costCenterId || "SEM_CENTRO"} · ${prepared.legalReference}`, value: line.value, appropriationId: line.appropriationId, supplierId: line.supplierId, secretariatId: line.secretariatId, sourceModule: "RH", sourceType: "PAYROLL_RUN", sourceId: run.id, eventType: "FOLHA_FECHADA", idempotencyKey });
      expenseIds.push(expense.id);
    }
    await db.update(hrIntegrationEvents).set({ status: "CONCLUIDA", result: { expenseIds, committed: false, paid: false } }).where(eq(hrIntegrationEvents.id, event.id));
    return { applied: true, lines: prepared.lines, expenseIds };
  } catch (error) {
    await db.update(hrIntegrationEvents).set({ status: "AGUARDANDO_RETRY", result: { message: error instanceof Error ? error.message : "Falha na criação de despesa." } }).where(eq(hrIntegrationEvents.id, event.id));
    throw error;
  }
}

/** Commits every approved expense in the immutable payroll plan as one native batch. */
export async function commitPayrollExpenseRequests(connection: DatabaseConnection, context: AppContext, raw: unknown) {
  if (!canPerformModuleOperation(context.user, "RH", "update") || !canPerformModuleOperation(context.user, "FINANCEIRO", "create")) throw new AccessError("Empenhamento exige alteração RH e criação no Financeiro.", 403);
  const input = commitmentBatchSchema.parse(raw);
  input.commitments.sort((a, b) => a.expenseId.localeCompare(b.expenseId));
  if (new Set(input.commitments.map((row) => row.expenseId)).size !== input.commitments.length || new Set(input.commitments.map((row) => row.number)).size !== input.commitments.length) throw new Error("Despesa ou número de empenho duplicado no lote da folha.");
  const date = new Date(`${input.date}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== input.date) throw new Error("Data financeira inválida.");
  const run = await requirePayrollRun(connection.db, input.runId);
  await assertPayrollBudgetScope({ ...context, database: connection.db }, run.payrollId);
  const actor = { usuarioId: context.user.id, employeeId: context.user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds };
  return withDatabaseTransaction(connection, async (tx) => {
    await tx.execute(sql`SELECT id FROM "HrPayrollRun" WHERE id = ${input.runId} FOR UPDATE`);
    const current = await requirePayrollRun(tx, input.runId);
    if (current.mode !== "OFICIAL" || current.status !== "FECHADA" || current.scope !== "PRODUCAO") throw new Error("Empenhamento exige folha oficial fechada de produção.");
    const origin = await requireHrIntegrationEvent(tx, `FINANCEIRO:DESPESAS:${run.id}`);
    if (origin.eventType !== "SOLICITACOES_DESPESA_FOLHA" || origin.status !== "CONCLUIDA") throw new Error("Conclua a geração das solicitações de despesa antes do empenhamento.");
    const prepared = preparedSchema.parse(origin.payload);
    const result = z.object({ expenseIds: z.array(z.string()) }).parse(origin.result);
    if (prepared.runId !== run.id || result.expenseIds.length !== prepared.lines.length || JSON.stringify([...result.expenseIds].sort()) !== JSON.stringify(input.commitments.map((row) => row.expenseId))) throw new Error("O lote deve incluir todas as despesas do plano da folha, sem outras origens.");
    const expenseRows = await tx.select().from(expenseTable).where(inArray(expenseTable.id, result.expenseIds)).orderBy(asc(expenseTable.appropriationId), asc(expenseTable.id));
    const expenses = [];
    for (const row of expenseRows) expenses.push({ ...row, appropriation: await requirePersonnelAppropriation(tx, row.appropriationId) });
    if (expenses.length !== result.expenseIds.length) throw new Error("Plano da folha possui despesas ausentes.");
    for (const expense of expenses) {
      assertBudgetUnitAccess(context.user, expense.appropriation.budgetUnitId);
      const index = result.expenseIds.indexOf(expense.id);
      const line = prepared.lines[index];
      if (expense.sourceModule !== "RH" || expense.sourceType !== "PAYROLL_RUN" || expense.sourceId !== run.id || expense.appropriationId !== line.appropriationId || expense.supplierId !== line.supplierId || expense.secretariatId !== line.secretariatId || !expense.valueDecimal?.eq(line.value)) throw new Error("Despesa diverge do plano imutável da folha.");
    }
    const eventFilter = payrollCommitmentKeys(run.id);
    const [previous] = await tx.select().from(hrIntegrationEvents).where(eventFilter).orderBy(desc(hrIntegrationEvents.createdAt)).limit(1);
    if (previous && previous.status !== "ESTORNADA") {
      if (previous.status !== "CONCLUIDA") throw new Error("Lote anterior de empenhos ainda não está concluído.");
      const stored = z.object({ input: commitmentBatchSchema }).parse(previous.payload);
      if (JSON.stringify(stored.input) !== JSON.stringify(input)) throw new Error("Folha já empenhada com outros números, tipos ou data.");
      return z.object({ commitmentIds: z.array(z.string()) }).parse(previous.result);
    }
    if (previous?.status === "ESTORNADA") {
      const [inverse] = await tx.select().from(hrIntegrationEvents).where(and(eq(hrIntegrationEvents.eventType, "DESMOVIMENTACAO_FOLHA"), eq(hrIntegrationEvents.status, "CONCLUIDA"), sql`${hrIntegrationEvents.payload}->>'commitmentEventId' = ${previous.id}`)).limit(1);
      if (!inverse) throw new Error("Desmovimentação conciliada não encontrada.");
      const reversedAt = z.object({ date: z.string() }).parse(inverse.payload).date;
      if (input.date < reversedAt) throw new Error("Nova geração não pode anteceder a desmovimentação do lote anterior.");
    }
    const cycle = (await tx.select({ id: hrIntegrationEvents.id }).from(hrIntegrationEvents).where(eventFilter)).length + 1;
    const sourceKey = cycle === 1 ? `FINANCEIRO:EMPENHOS:${run.id}` : `FINANCEIRO:EMPENHOS:${run.id}:CYCLE:${cycle}`;
    const commitmentIds: string[] = [];
    for (const expense of expenses) {
      if (expense.status !== "Aprovada" || !expense.supplierId || !expense.valueDecimal) throw new Error("Todas as despesas da folha devem estar aprovadas e possuir credor/Decimal conciliado.");
      const row = input.commitments.find((item) => item.expenseId === expense.id)!;
      const reservation = await createBudgetReservationInTransaction(tx, actor, { number: `RH:${row.number}`, date, value: expense.valueDecimal, appropriationId: expense.appropriationId, expenseId: expense.id, justification: prepared.legalReference });
      const commitment = await createCommitmentInTransaction(tx, actor, { number: row.number, date, value: expense.valueDecimal, type: row.type, history: expense.description, appropriationId: expense.appropriationId, supplierId: expense.supplierId, reservationId: reservation.id });
      commitmentIds.push(commitment.id);
    }
    const event = await enqueueHrIntegration(tx, { sourceKey, domain: "FINANCEIRO", environment: current.scope, eventType: "EMPENHOS_FOLHA", payload: { input, originEventId: origin.id, cycle, previousEventId: previous?.id ?? null } });
    await tx.update(hrIntegrationEvents).set({ status: "CONCLUIDA", result: { commitmentIds, committed: true, settled: false, paid: false } }).where(eq(hrIntegrationEvents.id, event.id));
    return { commitmentIds };
  }, { timeoutMs: 120000 });
}

export async function settlePayrollCommitments(connection: DatabaseConnection, context: AppContext, raw: unknown) {
  if (!canPerformModuleOperation(context.user, "RH", "update") || !canPerformModuleOperation(context.user, "FINANCEIRO", "create")) throw new AccessError("Liquidação exige alteração RH e criação no Financeiro.", 403);
  const schema = z.object({ runId: z.string().min(1), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), documents: z.array(z.object({ commitmentId: z.string().min(1), documentId: z.string().min(1), documentRef: z.string().trim().min(1), retentionRuleIds: z.array(z.string().min(1)).default([]) }).strict()).min(1).max(1000) }).strict();
  const input = schema.parse(raw);
  input.documents.sort((a, b) => a.commitmentId.localeCompare(b.commitmentId));
  for (const row of input.documents) row.retentionRuleIds.sort();
  if (new Set(input.documents.map((row) => row.commitmentId)).size !== input.documents.length) throw new Error("Empenho duplicado no lote de liquidação.");
  const date = new Date(`${input.date}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== input.date || !context.user.employeeId) throw new Error("Data válida e servidor responsável pelo ateste são obrigatórios.");
  const run = await requirePayrollRun(connection.db, input.runId);
  await assertPayrollBudgetScope({ ...context, database: connection.db }, run.payrollId);
  const actor = { usuarioId: context.user.id, employeeId: context.user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds };
  return withDatabaseTransaction(connection, async (tx) => {
    await tx.execute(sql`SELECT id FROM "HrPayrollRun" WHERE id = ${run.id} FOR UPDATE`);
    const current = await requirePayrollRun(tx, run.id);
    if (current.mode !== "OFICIAL" || current.status !== "FECHADA" || current.scope !== "PRODUCAO") throw new Error("Liquidação exige folha oficial fechada de produção.");
    const [source] = await tx.select().from(hrIntegrationEvents).where(and(payrollCommitmentKeys(run.id), eq(hrIntegrationEvents.status, "CONCLUIDA"))).orderBy(desc(hrIntegrationEvents.createdAt)).limit(1);
    if (!source) throw new Error("Conclua o empenhamento da folha antes da liquidação.");
    if (source.eventType !== "EMPENHOS_FOLHA" || source.status !== "CONCLUIDA") throw new Error("Conclua o empenhamento da folha antes da liquidação.");
    const committed = z.object({ commitmentIds: z.array(z.string()) }).parse(source.result);
    if (JSON.stringify([...committed.commitmentIds].sort()) !== JSON.stringify(input.documents.map((row) => row.commitmentId))) throw new Error("Liquidação deve incluir todos os empenhos do plano da folha.");
    const commitments = [];
    for (const id of [...new Set(committed.commitmentIds)].sort()) commitments.push(await requirePersonnelCommitment(tx, id));
    if (commitments.length !== committed.commitmentIds.length) throw new Error("Empenho do plano não encontrado.");
    for (const commitment of commitments) {
      assertBudgetUnitAccess(context.user, commitment.appropriation.budgetUnitId);
      const expense = commitment.reservation?.expense;
      if (!expense || expense.sourceModule !== "RH" || expense.sourceType !== "PAYROLL_RUN" || expense.sourceId !== run.id || !commitment.valueDecimal || !expense.valueDecimal?.eq(commitment.valueDecimal) || commitment.movements.length) throw new Error("Empenho diverge do plano da folha; concilie alterações antes de liquidar.");
    }
    const sourceKey = `FINANCEIRO:LIQUIDACOES:${run.id}`;
    const previous = await findHrIntegrationEvent(tx, sourceKey);
    if (previous) {
      const stored = z.object({ input: schema }).parse(previous.payload);
      if (JSON.stringify(stored.input) !== JSON.stringify(input)) throw new Error("Folha já liquidada com outros documentos, retenções ou data.");
      return z.object({ settlementIds: z.array(z.string()) }).parse(previous.result);
    }
    const settlementIds: string[] = [];
    for (const commitment of commitments) {
      const row = input.documents.find((item) => item.commitmentId === commitment.id)!;
      const settlement = await createSettlementInTransaction(tx, actor, { date, value: commitment.valueDecimal!, commitmentId: commitment.id, authorId: context.user.employeeId!, documentId: row.documentId, documentRef: row.documentRef, retentionRuleIds: row.retentionRuleIds, notes: `Folha ${run.id}` });
      settlementIds.push(settlement.id);
    }
    const event = await enqueueHrIntegration(tx, { sourceKey, domain: "FINANCEIRO", environment: current.scope, eventType: "LIQUIDACOES_FOLHA", payload: { input, originEventId: source.id } });
    await tx.update(hrIntegrationEvents).set({ status: "CONCLUIDA", result: { settlementIds, committed: true, settled: true, paid: false } }).where(eq(hrIntegrationEvents.id, event.id));
    return { settlementIds };
  }, { timeoutMs: 120000 });
}

/** Explicit manual confirmation with GED evidence, using the native treasury chain. */
export async function payPayrollSettlements(connection: DatabaseConnection, context: AppContext, raw: unknown) {
  if (!canPerformModuleOperation(context.user, "RH", "update") || !canPerformModuleOperation(context.user, "FINANCEIRO", "create") || !canPerformModuleOperation(context.user, "FINANCEIRO", "update")) throw new AccessError("Pagamento exige alteração RH, criação e alteração no Financeiro.", 403);
  const schema = z.object({ runId: z.string().min(1), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), proofDocumentId: z.string().min(1), payments: z.array(z.object({ settlementId: z.string().min(1), orderNumber: z.string().trim().min(1).max(120), bankAccountId: z.string().min(1), paymentMethod: z.string().trim().min(1) }).strict()).min(1).max(1000) }).strict();
  const input = schema.parse(raw);
  input.payments.sort((a, b) => a.settlementId.localeCompare(b.settlementId));
  if (new Set(input.payments.map((row) => row.settlementId)).size !== input.payments.length || new Set(input.payments.map((row) => row.orderNumber)).size !== input.payments.length) throw new Error("Liquidação ou ordem duplicada no lote de pagamento.");
  const date = new Date(`${input.date}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== input.date) throw new Error("Data de pagamento inválida.");
  const run = await requirePayrollRun(connection.db, input.runId);
  await assertPayrollBudgetScope({ ...context, database: connection.db }, run.payrollId);
  const actor = { usuarioId: context.user.id, employeeId: context.user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds };
  return withDatabaseTransaction(connection, async (tx) => {
    await tx.execute(sql`SELECT id FROM "HrPayrollRun" WHERE id = ${run.id} FOR UPDATE`);
    const current = await requirePayrollRun(tx, run.id);
    if (current.mode !== "OFICIAL" || current.status !== "FECHADA" || current.scope !== "PRODUCAO") throw new Error("Pagamento exige folha oficial fechada de produção.");
    const source = await requireHrIntegrationEvent(tx, `FINANCEIRO:LIQUIDACOES:${run.id}`);
    if (source.eventType !== "LIQUIDACOES_FOLHA" || source.status !== "CONCLUIDA") throw new Error("Conclua a liquidação de todas as despesas da folha.");
    const liquidated = z.object({ settlementIds: z.array(z.string()) }).parse(source.result);
    if (JSON.stringify([...liquidated.settlementIds].sort()) !== JSON.stringify(input.payments.map((row) => row.settlementId))) throw new Error("O lote de pagamento deve incluir todas as liquidações da folha.");
    const settlements = [];
    for (const id of [...new Set(liquidated.settlementIds)].sort()) settlements.push(await requirePersonnelSettlementWithRetentions(tx, id));
    if (settlements.length !== liquidated.settlementIds.length) throw new Error("Liquidação do plano não encontrada.");
    for (const settlement of settlements) {
      assertBudgetUnitAccess(context.user, settlement.commitment.appropriation.budgetUnitId);
      const expense = settlement.commitment.reservation?.expense;
      if (!expense || expense.sourceModule !== "RH" || expense.sourceType !== "PAYROLL_RUN" || expense.sourceId !== run.id || !settlement.valueDecimal || !expense.valueDecimal?.eq(settlement.valueDecimal) || date < settlement.date) throw new Error("Liquidação ou data diverge do plano da folha.");
    }
    const total = settlements.reduce((sum, row) => sum.plus(row.valueDecimal!), new Decimal(0));
    if (!total.eq(current.gross.plus(current.employer))) throw new Error("Bruto e encargos da folha não conciliam com as liquidações.");
    const expenseOrigin = await requireHrIntegrationEvent(tx, `FINANCEIRO:DESPESAS:${run.id}`);
    const expensePlan = preparedSchema.parse(expenseOrigin.payload);
    const expenseResult = z.object({ expenseIds: z.array(z.string()) }).parse(expenseOrigin.result);
    let gross = new Decimal(0);
    let employer = new Decimal(0);
    let deductions = new Decimal(0);
    for (const settlement of settlements) {
      const index = expenseResult.expenseIds.indexOf(settlement.commitment.reservation!.expense!.id);
      const line = expensePlan.lines[index];
      if (!line) throw new Error("Liquidação sem componente do plano imutável da folha.");
      if (line.component === "GROSS") {
        gross = gross.plus(settlement.valueDecimal!);
        deductions = deductions.plus(settlement.retentions.reduce((sum, retention) => sum.plus(retention.valueDecimal), new Decimal(0)));
      } else employer = employer.plus(settlement.valueDecimal!);
    }
    if (!gross.eq(current.gross) || !employer.eq(current.employer) || !deductions.eq(current.deductions) || !gross.minus(deductions).eq(current.net)) throw new Error("Bruto, descontos, líquido e encargos devem conciliar com os componentes e retenções da folha antes do pagamento.");
    const sourceKey = `FINANCEIRO:PAGAMENTOS:${run.id}`;
    const previous = await findHrIntegrationEvent(tx, sourceKey);
    if (previous) {
      const stored = z.object({ input: schema }).parse(previous.payload);
      if (JSON.stringify(stored.input) !== JSON.stringify(input)) throw new Error("Folha já paga com outras ordens, contas, comprovante ou data.");
      return z.object({ paymentIds: z.array(z.string()) }).parse(previous.result);
    }
    const [proof] = await tx.select().from(documents).where(eq(documents.id, input.proofDocumentId)).limit(1);
    if (!proof) throw new Error("Comprovante GED não encontrado.");
    if (proof.status !== "Válido") throw new Error("Comprovante GED deve estar válido.");
    for (const id of [...new Set(settlements.map((row) => row.commitmentId))].sort()) await tx.execute(sql`SELECT id FROM "Commitment" WHERE id = ${id} FOR UPDATE`);
    for (const id of [...new Set(input.payments.map((row) => row.bankAccountId))].sort()) await tx.execute(sql`SELECT id FROM "BankAccount" WHERE id = ${id} FOR UPDATE`);
    const paymentIds: string[] = [];
    for (const settlement of settlements) {
      const row = input.payments.find((item) => item.settlementId === settlement.id)!;
      const payment = await createPaymentInTransaction(tx, actor, { orderNumber: row.orderNumber, date, value: settlement.valueDecimal!, commitmentId: settlement.commitmentId, settlementId: settlement.id, bankAccountId: row.bankAccountId, supplierId: settlement.commitment.supplierId, paymentMethod: row.paymentMethod });
      await updatePaymentStatusInTransaction(tx, actor, payment.id, "Paga");
      paymentIds.push(payment.id);
    }
    const event = await enqueueHrIntegration(tx, { sourceKey, domain: "FINANCEIRO", environment: current.scope, eventType: "PAGAMENTOS_FOLHA", payload: { input, originEventId: source.id } });
    await tx.update(hrIntegrationEvents).set({ status: "CONCLUIDA", result: { paymentIds, committed: true, settled: true, paid: true, payrollCompleted: false } }).where(eq(hrIntegrationEvents.id, event.id));
    return { paymentIds };
  }, { timeoutMs: 120000 });
}

export async function concludePayrollFinanceCycle(connection: DatabaseConnection, context: AppContext, raw: unknown) {
  if (!canPerformModuleOperation(context.user, "RH", "update") || !canPerformModuleOperation(context.user, "FINANCEIRO", "update")) throw new AccessError("Conclusão exige alteração RH e Financeiro.", 403);
  const input = z.object({ runId: z.string().min(1), documentId: z.string().min(1) }).strict().parse(raw);
  const run = await requirePayrollRun(connection.db, input.runId);
  await assertPayrollBudgetScope({ ...context, database: connection.db }, run.payrollId);
  return withDatabaseTransaction(connection, async (tx) => {
    await tx.execute(sql`SELECT id FROM "HrPayrollRun" WHERE id = ${run.id} FOR UPDATE`);
    const source = await requireHrIntegrationEvent(tx, `FINANCEIRO:PAGAMENTOS:${run.id}`);
    if (source.eventType !== "PAGAMENTOS_FOLHA" || source.status !== "CONCLUIDA") throw new Error("Conclua o pagamento de todas as liquidações da folha.");
    const result = z.object({ paymentIds: z.array(z.string()).min(1) }).parse(source.result);
    for (const id of [...result.paymentIds].sort()) await tx.execute(sql`SELECT id FROM "Payment" WHERE id = ${id} FOR UPDATE`);
    const payments = [];
    for (const id of [...new Set(result.paymentIds)].sort()) payments.push(await requirePersonnelPaymentWithRetentions(tx, id));
    if (payments.length !== result.paymentIds.length) throw new Error("Pagamento da folha não encontrado.");
    for (const payment of payments) {
      assertBudgetUnitAccess(context.user, payment.commitment.appropriation.budgetUnitId);
      if (payment.status !== "Paga") throw new Error("Folha possui pagamento cancelado ou estornado; concilie antes da conclusão.");
      if (payment.retentions.some((retention) => retention.withholdingPayable?.status !== "Recolhida")) throw new Error("Recolha as obrigações retidas da folha antes da conclusão financeira.");
    }
    const [document] = await tx.select().from(documents).where(eq(documents.id, input.documentId)).limit(1);
    if (!document) throw new Error("Documento GED de conclusão não encontrado.");
    if (document.status !== "Válido") throw new Error("Documento GED de conclusão deve estar válido.");
    const sourceKey = `FINANCEIRO:CONCLUSAO:${run.id}`;
    const previous = await findHrIntegrationEvent(tx, sourceKey);
    if (previous) {
      const stored = z.object({ input: z.object({ runId: z.string(), documentId: z.string() }) }).parse(previous.payload);
      if (stored.input.documentId !== input.documentId || stored.input.runId !== input.runId) throw new Error("Folha concluída com outro documento GED.");
      return { eventId: previous.id };
    }
    const event = await enqueueHrIntegration(tx, { sourceKey, domain: "FINANCEIRO", environment: run.scope, eventType: "CICLO_FINANCEIRO_FOLHA_CONCLUIDO", payload: { input, originEventId: source.id, paymentIds: result.paymentIds, actorId: context.user.id } });
    await tx.update(hrIntegrationEvents).set({ status: "CONCLUIDA", result: { documentId: document.id, payrollCompleted: true, paymentIds: result.paymentIds } }).where(eq(hrIntegrationEvents.id, event.id));
    return { eventId: event.id };
  }, { timeoutMs: 60000 });
}

export async function reversePayrollCommitments(connection: DatabaseConnection, context: AppContext, raw: unknown) {
  if (!canPerformModuleOperation(context.user, "RH", "update") || !canPerformModuleOperation(context.user, "FINANCEIRO", "update")) throw new AccessError("Desmovimentação exige alteração RH e Financeiro.", 403);
  const input = z.object({ runId: z.string().min(1), commitmentEventId: z.string().min(1), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), reason: z.string().trim().min(10).max(2000), idempotencyKey: z.string().trim().min(1).max(200) }).strict().parse(raw);
  const date = new Date(`${input.date}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== input.date) throw new Error("Data de desmovimentação inválida.");
  const run = await requirePayrollRun(connection.db, input.runId);
  await assertPayrollBudgetScope({ ...context, database: connection.db }, run.payrollId);
  const actor = { usuarioId: context.user.id, employeeId: context.user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds };
  return withDatabaseTransaction(connection, async (tx) => {
    await tx.execute(sql`SELECT id FROM "HrPayrollRun" WHERE id = ${run.id} FOR UPDATE`);
    const [source] = await tx.select().from(hrIntegrationEvents).where(and(payrollCommitmentKeys(run.id), eq(hrIntegrationEvents.id, input.commitmentEventId))).limit(1);
    if (!source) throw new Error("Lote de empenhos não encontrado.");
    const plan = z.object({ input: commitmentBatchSchema }).parse(source.payload);
    const result = z.object({ commitmentIds: z.array(z.string()).min(1) }).parse(source.result);
    if (plan.input.runId !== run.id) throw new Error("Lote de empenhos não pertence à folha.");
    const commitments = [];
    for (const id of [...new Set(result.commitmentIds)]) commitments.push(await requirePersonnelCommitment(tx, id));
    commitments.sort((a, b) => a.appropriationId.localeCompare(b.appropriationId) || a.id.localeCompare(b.id));
    if (commitments.length !== result.commitmentIds.length) throw new Error("Lote possui empenhos ausentes.");
    for (const commitment of commitments) {
      assertBudgetUnitAccess(context.user, commitment.appropriation.budgetUnitId);
      const expense = commitment.reservation?.expense;
      if (!expense || expense.sourceModule !== "RH" || expense.sourceType !== "PAYROLL_RUN" || expense.sourceId !== run.id || date < commitment.date) throw new Error("Origem ou data de empenho incompatível com a desmovimentação.");
    }
    const sourceKey = `FINANCEIRO:DESMOVIMENTACAO:${input.idempotencyKey}`;
    const previous = await findHrIntegrationEvent(tx, sourceKey);
    if (previous) {
      const stored = z.object({ runId: z.string(), commitmentEventId: z.string(), date: z.string(), reason: z.string(), idempotencyKey: z.string() }).parse(previous.payload);
      if (JSON.stringify(stored) !== JSON.stringify(input)) throw new Error("Desmovimentação já registrada com outros dados.");
      return { eventId: previous.id };
    }
    if (source.status !== "CONCLUIDA" || run.mode !== "OFICIAL" || run.status !== "FECHADA" || run.scope !== "PRODUCAO") throw new Error("Lote ou folha não está disponível para desmovimentação.");
    // Native cancellation locks commitment before appropriation; lock the full batch in ID order.
    for (const id of [...result.commitmentIds].sort()) await tx.execute(sql`SELECT id FROM "Commitment" WHERE id = ${id} FOR UPDATE`);
    for (const commitment of commitments) {
      await cancelCommitmentInTransaction(tx, actor, commitment.id, date, input.reason);
      await tx.update(expenseTable).set({ status: "Aprovada" }).where(eq(expenseTable.id, commitment.reservation!.expense!.id));
    }
    await tx.update(hrIntegrationEvents).set({ status: "ESTORNADA" }).where(eq(hrIntegrationEvents.id, source.id));
    const event = await enqueueHrIntegration(tx, { sourceKey, domain: "FINANCEIRO", environment: run.scope, eventType: "DESMOVIMENTACAO_FOLHA", payload: input });
    await tx.update(hrIntegrationEvents).set({ status: "CONCLUIDA", result: { reversedCommitmentIds: result.commitmentIds, previousEventId: source.id, newGenerationAllowed: true } }).where(eq(hrIntegrationEvents.id, event.id));
    return { eventId: event.id };
  }, { timeoutMs: 120000 });
}
