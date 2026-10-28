import { and, eq, inArray, notInArray, or, sql } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import type { JsonObject } from "@/db/json";
import type { HrPortalRequest } from "@/lib/contracts/personnel";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseExecutor, type DatabaseTransaction } from "@/db/transaction";
import { hrIntegrationEvents, hrPortalRequests } from "@/db/schema/personnel-workforce";
import { costCenters } from "@/db/schema/master-data";
import { documents } from "@/db/schema/registry";
import { financialYears } from "@/db/schema/finance-years";
import { accountingEvents, accountingPlans, accountingRules } from "@/db/schema/finance-accounting";
import { findHrIntegrationEvent, requireHrIntegrationEvent, findActiveTravelAllowanceReport, lockPersonnel, personnelJson } from "@/db/repositories/personnel/integration";
import { requireEmploymentRegime, requireEmploymentHolderHistory, requireHrPortalRequest } from "@/db/repositories/personnel/workforce";
import { requirePersonnelEntityUnit, listPersonnelEntityUnits, requirePersonnelFinancialYear, requirePersonnelBank, requirePersonnelPayment, listPersonnelAllowancePayments, listPersonnelAllowanceRefunds, requirePersonnelRevenue, requirePersonnelTreasuryMovement, requirePersonnelAccountingTransaction, requirePersonnelCommitment } from "@/db/repositories/personnel/finance";
import { z } from "zod";
import { canPerformModuleOperation, isSystemAdministrator, type AppContext } from "@/lib/platform/tenant-context";
import { postAccountingEventInTransaction, postAccountingTransactionInTransaction, recordConfirmedRevenue, type FinanceActor } from "@/lib/financeiro";
import { assertTravelAllowanceAccess, assertTravelReportOperationDate } from "./travel-allowance";
import { resolveContractRevision } from "./contract-timeline";
import { enqueueHrIntegration } from "./workforce-service";

const money = z.string().regex(/^\d{1,12}(?:\.\d{1,2})?$/);
const inputSchema = z.object({ requestKey: z.string().trim().min(1).max(120), contractId: z.string().min(1), budgetUnitId: z.string().min(1), amount: money, date: z.iso.date(), reportDueDate: z.iso.date(), purpose: z.string().trim().min(10).max(3000) }).strict();
const memorySchema = z.object({ scope: z.literal("PRODUCAO"), input: inputSchema, assessment: z.object({ amountBRL: money }), contract: z.object({ employee: z.object({ personId: z.string() }) }) });
const actorFor = (context: AppContext) => ({ usuarioId: context.user.id, employeeId: context.user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds });

const cycleSchema = z.object({ cycle: z.number().int().nonnegative(), reopenedDate: z.iso.date().optional() });
async function advanceCycle(tx: DatabaseExecutor, requestId: string): Promise<z.infer<typeof cycleSchema>> {
  const event = await findHrIntegrationEvent(tx, `ADIANTAMENTO:CICLO:${requestId}`);
  return event ? cycleSchema.parse(event.result) : { cycle: 0 };
}
const cycleKey = (base: string, cycle: number) => cycle ? `${base}:CICLO:${cycle}` : base;

const reportInputSchema = z.object({ requestId: z.string().min(1), date: z.iso.date(), documentId: z.string().min(1), activities: z.string().trim().min(10).max(4000), spentAmount: money, returnedAmount: money.default("0.00"), restitutionRevenueId: z.string().trim().optional().transform(value => value || undefined) }).strict();

async function requireDocument(tx: DatabaseExecutor, id: string) {
  const [document] = await tx.select().from(documents).where(eq(documents.id, id)).limit(1);
  if (!document) throw new Error("Documento GED não encontrado.");
  return document;
}
async function requireEventId(tx: DatabaseExecutor, id: string) {
  const [event] = await tx.select().from(hrIntegrationEvents).where(eq(hrIntegrationEvents.id, id)).limit(1);
  if (!event) throw new Error("Origem da integração não encontrada.");
  return event;
}
async function correctiveAdvancePaymentIds(tx: DatabaseExecutor, requestId: string) {
  const events = await tx.select({ payload: hrIntegrationEvents.payload }).from(hrIntegrationEvents).where(and(inArray(hrIntegrationEvents.eventType, ["ADIANTAMENTO_RESTITUICAO_DESPESA", "ADIANTAMENTO_RESTITUICAO_DESPESA_ESTORNADA"]), or(sql`${hrIntegrationEvents.payload}#>>'{input,requestId}' = ${requestId}`, sql`${hrIntegrationEvents.payload}->>'requestId' = ${requestId}`)));
  return events.map(event => z.object({ correctionPaymentId: z.string() }).parse(event.payload).correctionPaymentId);
}

async function assertAdvanceRestitution(tx: DatabaseTransaction, request: HrPortalRequest, input: z.infer<typeof reportInputSchema>, payments: { date: Date; commitment: { appropriation: { financialYearId: string } } }[]) {
  const memory = memorySchema.parse(request.payload);
  const returned = new Decimal(input.returnedAmount);
  if (!new Decimal(input.spentAmount).plus(returned).eq(memory.assessment.amountBRL)) throw new Error("Despesas comprovadas e restituição devem conciliar integralmente o valor concedido.");
  const nativeRevenues = await listPersonnelAllowanceRefunds(tx, "ADVANCE_ALLOWANCE_REFUND", request.id);
  const nativeExpenses = await tx.select({ payload: hrIntegrationEvents.payload }).from(hrIntegrationEvents).where(and(eq(hrIntegrationEvents.eventType, "ADIANTAMENTO_RESTITUICAO_DESPESA"), eq(hrIntegrationEvents.status, "CONCLUIDA"), sql`${hrIntegrationEvents.payload}#>>'{input,requestId}' = ${request.id}`));
  const actualReturned = nativeRevenues.reduce((sum, revenue) => { if (!revenue.valueDecimal) throw new Error("Restituição sem Decimal conciliado."); return sum.plus(revenue.valueDecimal); }, new Decimal(0)).plus(nativeExpenses.reduce((sum, event) => sum.plus(z.object({ input: z.object({ amount: money }) }).parse(event.payload).input.amount), new Decimal(0)));
  if (returned.isZero()) {
    if (input.restitutionRevenueId) throw new Error("Prestação sem devolução não deve referenciar receita de restituição.");
    if (!actualReturned.isZero()) throw new Error("Restituição não conciliada: inclua todas as devoluções financeiras vigentes.");
    return;
  }
  if (!input.restitutionRevenueId) throw new Error("Devolução exige referência da restituição financeira nativa.");
  if (!actualReturned.eq(returned)) throw new Error("Restituição não conciliada: inclua todas as devoluções financeiras vigentes.");
  const ids = input.restitutionRevenueId.split(",").map(id => id.trim());
  if (ids.some(id => !id) || new Set(ids).size !== ids.length) throw new Error("Referências de restituição vazias ou repetidas.");
  const years = await tx.select({ id: financialYears.id, year: financialYears.year, governmentEntityId: financialYears.governmentEntityId }).from(financialYears).where(inArray(financialYears.id, payments.map(payment => payment.commitment.appropriation.financialYearId)));
  let received = new Decimal(0);
  for (const id of [...ids].sort()) {
    if (id.startsWith("DESPESA:")) {
      const event = await requireEventId(tx, id.slice(8));
      const position = z.object({ input: z.object({ requestId: z.string(), date: z.iso.date(), amount: money }), budgetUnitId: z.string(), governmentEntityId: z.string(), financialYearId: z.string(), treasuryMovementId: z.string() }).parse(event.payload);
      const movement = await requirePersonnelTreasuryMovement(tx, { id: position.treasuryMovementId });
      if (event.eventType !== "ADIANTAMENTO_RESTITUICAO_DESPESA" || event.status !== "CONCLUIDA" || position.input.requestId !== request.id || position.budgetUnitId !== memory.input.budgetUnitId || position.input.date > input.date || !years.some(year => year.id === position.financialYearId && year.governmentEntityId === position.governmentEntityId) || movement.direction !== "Entrada" || movement.status !== "Confirmado" || !movement.valueDecimal.eq(position.input.amount)) throw new Error("Restituição de despesa não conciliada com prestação, exercício, UG ou caixa.");
      received = received.plus(position.input.amount);
      continue;
    }
    await tx.execute(sql`SELECT id FROM "Revenue" WHERE id=${id} FOR UPDATE`);
    const revenue = await requirePersonnelRevenue(tx, id);
    const revenueYear = revenue.financialYear;
    if (!revenueYear) throw new Error("Restituição legada sem exercício financeiro conciliado.");
    if (revenue.sourceModule !== "RH" || revenue.sourceType !== "ADVANCE_ALLOWANCE_REFUND" || revenue.sourceId !== request.id || revenue.budgetUnitId !== memory.input.budgetUnitId || revenue.stage !== "ARRECADADA" || revenue.reversedAt || !revenue.valueDecimal || revenue.valueDecimal.lte(0) || !revenue.treasuryMovement || revenue.treasuryMovement.direction !== "Entrada" || !revenue.treasuryMovement.valueDecimal.eq(revenue.valueDecimal) || revenue.date.toISOString().slice(0, 10) > input.date || payments.some(payment => revenue.date < payment.date)) throw new Error("Restituição não conciliada com adiantamento, UG, valor, caixa e data da prestação.");
    if (years.length !== new Set(payments.map(payment => payment.commitment.appropriation.financialYearId)).size || years.some(year => year.year >= revenueYear.year || year.governmentEntityId !== revenueYear.governmentEntityId)) throw new Error("Receita de restituição exige pagamento de exercício anterior do mesmo ente; devolução no exercício exige recomposição da execução da despesa.");
    received = received.plus(revenue.valueDecimal);
  }
  if (!received.eq(returned)) throw new Error("Restituições parciais referenciadas não conciliam o total devolvido da prestação.");
}

export async function receivePriorYearAdvanceRefund(connection: DatabaseConnection, context: AppContext, raw: unknown) {
  return receivePriorYearAllowanceRefund(connection, context, raw, "ADIANTAMENTO");
}

export async function receivePriorYearTravelRefund(connection: DatabaseConnection, context: AppContext, raw: unknown) {
  return receivePriorYearAllowanceRefund(connection, context, raw, "DIARIA");
}

async function receivePriorYearAllowanceRefund(connection: DatabaseConnection, context: AppContext, raw: unknown, kind: "ADIANTAMENTO" | "DIARIA") {
  const schema = z.object({ requestId: z.string().min(1), requestKey: z.string().trim().min(1).max(120), date: z.iso.date(), amount: money, bankAccountId: z.string().min(1), revenueNatureId: z.string().min(1), resourceSourceId: z.string().min(1), documentId: z.string().min(1), reason: z.string().trim().min(10).max(3000) }).strict();
  const input = schema.parse(raw);
  input.amount = new Decimal(input.amount).toFixed(2);
  if (!canPerformModuleOperation(context.user, "FINANCEIRO", "create")) throw new Error("Restituição exige criação no Financeiro.");
  return withDatabaseTransaction(connection, async tx => {
    await tx.execute(sql`SELECT id FROM "HrPortalRequest" WHERE id=${input.requestId} FOR UPDATE`);
    const request = await requireHrPortalRequest(tx, input.requestId);
    assertTravelAllowanceAccess(request.payload, context);
    const memory = z.object({ scope: z.literal("PRODUCAO"), input: z.object({ budgetUnitId: z.string() }), assessment: z.object({ amountBRL: money }) }).parse(request.payload);
    const key = `${kind}:RESTITUICAO:${input.requestKey}`;
    const previous = await findHrIntegrationEvent(tx, key);
    if (previous) {
      const payload = z.object({ input: schema, revenueId: z.string() }).parse(previous.payload);
      if (JSON.stringify(payload.input) !== JSON.stringify(input)) throw new Error("Restituição já registrada com outros dados.");
      const revenue = await requirePersonnelRevenue(tx, payload.revenueId);
      if (revenue.reversedAt || revenue.stage !== "ARRECADADA") throw new Error("Restituição anterior estornada; registre nova operação fundamentada.");
      return revenue;
    }
    if (request.kind !== kind || request.status !== "DEFERIDA") throw new Error("Restituição exige concessão autorizada antes da apresentação da prestação.");
    if (kind === "DIARIA") await assertTravelReportOperationDate(tx, request.id, input.date);
    const activeTravelReport = kind === "DIARIA" ? await findActiveTravelAllowanceReport(tx, request.id) : null;
    if (activeTravelReport && activeTravelReport.status !== "ESTORNADA") throw new Error("Regularize a prestação ativa da diária antes de receber nova restituição.");
    const date = new Date(`${input.date}T12:00:00Z`);
    const amount = new Decimal(input.amount);
    if (amount.lte(0)) throw new Error("Restituição deve ter valor positivo.");
    const bank = await requirePersonnelBank(tx, input.bankAccountId);
    const binding = await requirePersonnelEntityUnit(tx, memory.input.budgetUnitId);
    if (!bank.isActive || bank.budgetUnitId !== memory.input.budgetUnitId) throw new Error("Conta da restituição deve pertencer à UG original do adiantamento.");
    const document = await requireDocument(tx, input.documentId);
    if (document.status !== "Válido") throw new Error("Restituição exige comprovante GED válido.");
    const corrections = await tx.select({ payload: hrIntegrationEvents.payload }).from(hrIntegrationEvents).where(and(inArray(hrIntegrationEvents.eventType, [`${kind}_RESTITUICAO_DESPESA`, `${kind}_RESTITUICAO_DESPESA_ESTORNADA`]), or(sql`${hrIntegrationEvents.payload}#>>'{input,requestId}' = ${request.id}`, sql`${hrIntegrationEvents.payload}->>'requestId' = ${request.id}`)));
    const correctionIds = corrections.map(event => z.object({ correctionPaymentId: z.string() }).parse(event.payload).correctionPaymentId);
    const payments = await listPersonnelAllowancePayments(tx, kind === "DIARIA" ? "TRAVEL_ALLOWANCE" : "ADVANCE_ALLOWANCE", request.id, correctionIds);
    let paid = new Decimal(0);
    for (const payment of payments) {
      await tx.execute(sql`SELECT id FROM "Payment" WHERE id=${payment.id} FOR UPDATE`);
      const current = await requirePersonnelPayment(tx, payment.id);
      const appropriation = payment.commitment.appropriation;
      if (current.status !== "Paga" || !current.valueDecimal || appropriation.budgetUnitId !== memory.input.budgetUnitId || appropriation.financialYear.governmentEntityId !== binding.governmentEntityId || appropriation.financialYear.year >= date.getUTCFullYear() || date < current.date) throw new Error("Receita de restituição exige pagamento conciliado de exercício anterior do mesmo ente; devolução do corrente exige recomposição da despesa.");
      if (!(current.netValueDecimal ?? current.valueDecimal).eq(current.valueDecimal)) throw new Error("Adiantamento com retenções exige conciliação da devolução pelo valor efetivamente entregue ao servidor.");
      paid = paid.plus(current.valueDecimal);
    }
    if (!payments.length || !paid.eq(memory.assessment.amountBRL)) throw new Error("Restituição exige pagamento integral conciliado do adiantamento original.");
    const [duplicateProof] = await tx.select({ payload: hrIntegrationEvents.payload }).from(hrIntegrationEvents).where(and(eq(hrIntegrationEvents.eventType, `${kind}_RESTITUICAO_RECEBIDA`), sql`${hrIntegrationEvents.payload}->>'requestId' = ${request.id}`, sql`${hrIntegrationEvents.payload}->>'documentId' = ${input.documentId}`)).limit(1);
    if (duplicateProof) {
      const previousRevenueId = (duplicateProof.payload as JsonObject).revenueId;
      if (typeof previousRevenueId !== "string") throw new Error("Comprovante anterior sem restituição financeira conciliada.");
      const priorRevenue = await requirePersonnelRevenue(tx, previousRevenueId);
      if (!priorRevenue.reversedAt) throw new Error("Comprovante já utilizado nesta restituição; repita a chave original para recuperar o mesmo recebimento.");
    }
    const refunds = await listPersonnelAllowanceRefunds(tx, kind === "DIARIA" ? "TRAVEL_ALLOWANCE_REFUND" : "ADVANCE_ALLOWANCE_REFUND", request.id);
    const expenseRefunds = await tx.select({ payload: hrIntegrationEvents.payload }).from(hrIntegrationEvents).where(and(eq(hrIntegrationEvents.eventType, `${kind}_RESTITUICAO_DESPESA`), eq(hrIntegrationEvents.status, "CONCLUIDA"), sql`${hrIntegrationEvents.payload}#>>'{input,requestId}' = ${request.id}`));
    const refunded = refunds.reduce((sum, revenue) => { if (!revenue.valueDecimal) throw new Error("Restituição histórica sem Decimal conciliado."); return sum.plus(revenue.valueDecimal); }, new Decimal(0)).plus(expenseRefunds.reduce((sum, event) => sum.plus(z.object({ input: z.object({ amount: money }) }).parse(event.payload).input.amount), new Decimal(0)));
    if (refunded.plus(amount).gt(paid)) throw new Error("Restituições parciais acumuladas excedem o valor pago do adiantamento.");
    const revenue = await recordConfirmedRevenue(tx, actorFor(context), { date, value: amount, bankAccountId: bank.id, revenueNatureId: input.revenueNatureId, resourceSourceId: input.resourceSourceId, history: input.reason, sourceModule: "RH", sourceType: kind === "DIARIA" ? "TRAVEL_ALLOWANCE_REFUND" : "ADVANCE_ALLOWANCE_REFUND", sourceId: request.id, eventType: kind === "DIARIA" ? "TRAVEL_PRIOR_YEAR_REFUNDED" : "ADVANCE_PRIOR_YEAR_REFUNDED", idempotencyKey: `${key}:REVENUE` });
    const event = await enqueueHrIntegration(tx, { sourceKey: key, domain: "FINANCEIRO", environment: "PRODUCAO", eventType: `${kind}_RESTITUICAO_RECEBIDA`, payload: { input, requestId: request.id, actorId: context.user.id, revenueId: revenue.id, documentId: input.documentId, paymentIds: payments.map(payment => payment.id), governmentEntityId: binding.governmentEntityId, budgetUnitId: bank.budgetUnitId, returnedTotal: refunded.plus(amount).toFixed(2) } });
    await tx.update(hrIntegrationEvents).set({ status: "CONCLUIDA" }).where(eq(hrIntegrationEvents.id, event.id));
    return revenue;
  }, { timeoutMs: 60000 });
}

/** Locks the originating request before Revenue, matching submission/review lock order. */
export async function assertAdvanceRefundReversalAllowed(tx: DatabaseTransaction, actor: FinanceActor, revenueId: string) {
  const revenue = await requirePersonnelRevenue(tx, revenueId);
  if (revenue.sourceModule !== "RH" || !["ADVANCE_ALLOWANCE_REFUND", "TRAVEL_ALLOWANCE_REFUND"].includes(revenue.sourceType ?? "")) return;
  if (!revenue.sourceId) throw new Error("Restituição do adiantamento sem solicitação original conciliada.");
  await tx.execute(sql`SELECT id FROM "HrPortalRequest" WHERE id=${revenue.sourceId} FOR UPDATE`);
  const request = await requireHrPortalRequest(tx, revenue.sourceId);
  if (revenue.sourceType === "TRAVEL_ALLOWANCE_REFUND") {
    const unit = z.object({ input: z.object({ budgetUnitId: z.string() }) }).parse(request.payload).input.budgetUnitId;
    if (request.kind !== "DIARIA" || unit !== revenue.budgetUnitId || actor.allowedBudgetUnitIds && !actor.allowedBudgetUnitIds.includes(unit)) throw new Error("Estorno da restituição fora da origem/UG da diária.");
    const report = await findActiveTravelAllowanceReport(tx, request.id);
    if (report && report.status !== "ESTORNADA") throw new Error("Regularize a prestação ativa da diária antes de estornar o recebimento.");
    return;
  }
  const memory = memorySchema.parse(request.payload);
  if (request.kind !== "ADIANTAMENTO" || memory.input.budgetUnitId !== revenue.budgetUnitId || (actor.allowedBudgetUnitIds && !actor.allowedBudgetUnitIds.includes(memory.input.budgetUnitId))) throw new Error("Estorno da restituição fora da origem/UG autorizada do adiantamento.");
  const cycle = await advanceCycle(tx, request.id);
  const report = await findHrIntegrationEvent(tx, cycleKey(`ADIANTAMENTO:PRESTACAO:${request.id}`, cycle.cycle));
  if (report?.status === "CONCLUIDA") {
    const input = reportInputSchema.parse((report.payload as JsonObject).input);
    if (input.restitutionRevenueId?.split(",").map(id => id.trim()).includes(revenueId)) throw new Error("Restituição vinculada à prestação ativa; regularize a prestação pela origem antes de estornar o recebimento.");
  }
}

export async function recordAdvanceRefundReversal(tx: DatabaseTransaction, actor: FinanceActor, input: { revenueId: string; reversalId: string; date: Date; reason: string }) {
  const revenue = await requirePersonnelRevenue(tx, input.revenueId);
  if (revenue.sourceModule !== "RH" || !["ADVANCE_ALLOWANCE_REFUND", "TRAVEL_ALLOWANCE_REFUND"].includes(revenue.sourceType ?? "")) return;
  const kind = revenue.sourceType === "TRAVEL_ALLOWANCE_REFUND" ? "DIARIA" : "ADIANTAMENTO";
  if (!revenue.sourceId || revenue.stage !== "ESTORNADA") throw new Error("Restituição sem origem ou estorno financeiro efetivo.");
  if (kind === "DIARIA") await assertTravelReportOperationDate(tx, revenue.sourceId, input.date.toISOString().slice(0, 10));
  const events = await tx.select({ id: hrIntegrationEvents.id }).from(hrIntegrationEvents).where(and(eq(hrIntegrationEvents.eventType, `${kind}_RESTITUICAO_RECEBIDA`), sql`${hrIntegrationEvents.payload}->>'revenueId' = ${input.revenueId}`));
  if (events.length > 1) throw new Error("Recebimento da restituição com eventos de origem ambíguos.");
  for (const event of events) await tx.update(hrIntegrationEvents).set({ status: "ESTORNADA" }).where(eq(hrIntegrationEvents.id, event.id));
  const reversalEvent = await enqueueHrIntegration(tx, { sourceKey: `${kind}:RESTITUICAO_ESTORNADA:${input.revenueId}`, domain: "FINANCEIRO", environment: "PRODUCAO", eventType: `${kind}_RESTITUICAO_ESTORNADA`, payload: { requestId: revenue.sourceId, revenueId: input.revenueId, reversalId: input.reversalId, date: input.date.toISOString(), reason: input.reason.trim(), actorId: actor.usuarioId, originalEventId: events[0]?.id ?? null } });
  await tx.update(hrIntegrationEvents).set({ status: "CONCLUIDA" }).where(eq(hrIntegrationEvents.id, reversalEvent.id));
}

async function controlPosting(tx: DatabaseTransaction, context: AppContext, request: HrPortalRequest, eventCode: string, date: Date, reason: string, cycle = 0) {
  assertTravelAllowanceAccess(request.payload, context);
  if (!canPerformModuleOperation(context.user, "FINANCEIRO", "create")) throw new Error("Controle do adiantamento exige criação no Financeiro.");
  const memory = memorySchema.parse(request.payload);
  const binding = await requirePersonnelEntityUnit(tx, memory.input.budgetUnitId);
  const year = await requirePersonnelFinancialYear(tx, binding.governmentEntityId, date.getUTCFullYear());
  const [event] = await tx.select().from(accountingEvents).where(eq(accountingEvents.code, eventCode)).limit(1);
  if (!event) throw new Error("Evento contábil não encontrado.");
  const rules = await tx.select().from(accountingRules).where(and(eq(accountingRules.eventId, event.id), eq(accountingRules.isActive, true)));
  const accounts = rules.length === 1 ? await tx.select({ code: accountingPlans.code }).from(accountingPlans).where(inArray(accountingPlans.id, [rules[0].debitAccountId, rules[0].creditAccountId])) : [];
  if (!event.isActive || rules.length !== 1 || rules[0].isReference || !accounts.length || !accounts.every(account => /^[78]\./.test(account.code))) throw new Error("Adiantamento exige matriz operacional de contas de controle classes 7/8.");
  return postAccountingEventInTransaction(tx, actorFor(context), { financialYearId: year.id, governmentEntityId: binding.governmentEntityId, budgetUnitId: memory.input.budgetUnitId, date, eventCode, value: memory.assessment.amountBRL, history: reason, sourceModule: "RH", sourceType: "ADVANCE_CONTROL", sourceId: request.id, idempotencyKey: cycleKey(`RH:ADVANCE:${request.id}:${eventCode}`, cycle) });
}

export async function requestMunicipalAdvance(connection: DatabaseConnection, context: AppContext, raw: unknown) {
  if (!canPerformModuleOperation(context.user, "RH", "update")) throw new Error("Solicitação de adiantamento exige autorização RH.");
  const input = inputSchema.parse(raw);
  input.amount = new Decimal(input.amount).toFixed(2);
  if (new Decimal(input.amount).lte(0) || input.reportDueDate < input.date) throw new Error("Adiantamento exige valor positivo e prazo posterior ou igual à concessão.");
  return withDatabaseTransaction(connection, async tx => {
    await lockPersonnel(tx, `ADVANCE:REQUEST:${input.requestKey}`);
    assertTravelAllowanceAccess({ scope: "PRODUCAO", input }, context);
    const [previous] = await tx.select().from(hrPortalRequests).where(eq(hrPortalRequests.requestKey, `ADIANTAMENTO:${input.requestKey}`)).limit(1);
    if (previous) {
      assertTravelAllowanceAccess(previous.payload, context);
      if (JSON.stringify(memorySchema.parse(previous.payload).input) !== JSON.stringify(input)) throw new Error("Adiantamento já solicitado com outros dados.");
      return previous;
    }
    const date = new Date(`${input.date}T00:00:00Z`);
    const stored = await requireEmploymentHolderHistory(tx, input.contractId);
    const contract = resolveContractRevision(stored, stored.revisions, { start: date, end: date }).contract;
    const regime = await requireEmploymentRegime(tx, contract.regimeId);
    const binding = await requirePersonnelEntityUnit(tx, input.budgetUnitId);
    const [center] = contract.costCenterId ? await tx.select().from(costCenters).where(eq(costCenters.id, contract.costCenterId)).limit(1) : [];
    if (!contract.employee.personId || !contract.employee.isActive || contract.status !== "ATIVO" || date < contract.admittedAt || (contract.endsAt && date > contract.endsAt) || !regime.isActive || regime.ruleSet.isDemo || regime.ruleSet.scope !== "PRODUCAO" || regime.ruleSet.status !== "ATIVA" || regime.ruleSet.effectiveFrom > date || (regime.ruleSet.effectiveUntil && regime.ruleSet.effectiveUntil < date) || !center?.isActive || center.governmentEntityId !== binding.governmentEntityId) throw new Error("Adiantamento exige vínculo municipal vigente e centro do mesmo ente da UG.");
    await lockPersonnel(tx, `ADVANCE:HOLDER:${binding.governmentEntityId}:${contract.employee.personId}`);
    const units = await listPersonnelEntityUnits(tx, binding.governmentEntityId);
    const pending = await tx.select().from(hrPortalRequests).where(and(eq(hrPortalRequests.kind, "ADIANTAMENTO"), notInArray(hrPortalRequests.status, ["INDEFERIDA", "PRESTACAO_APROVADA", "CANCELADA"]), sql`${hrPortalRequests.payload}#>>'{contract,employee,personId}' = ${contract.employee.personId}`));
    if (pending.some(row => units.some(unit => unit.budgetUnitId === memorySchema.parse(row.payload).input.budgetUnitId))) throw new Error("Titular possui adiantamento pendente de prestação/aprovação neste ente; nova concessão bloqueada.");
    const payload = personnelJson({ scope: "PRODUCAO", input, assessment: { amountBRL: input.amount }, contract, parameterOrigin: "OWNER_ESTIMATE", policy: { legalReference: "Aurora das Veredas — procedimento inicial estimado: roteiro publicado, concessão em contas de controle e prestação sujeita à revisão independente." } });
    const [request] = await tx.insert(hrPortalRequests).values({ requestKey: `ADIANTAMENTO:${input.requestKey}`, kind: "ADIANTAMENTO", employeeId: contract.employeeId, actorId: context.user.id, payload }).returning();
    await enqueueHrIntegration(tx, { sourceKey: `ADIANTAMENTO:SOLICITACAO:${request.id}`, domain: "AUDITORIA", environment: "PRODUCAO", eventType: "ADIANTAMENTO_SOLICITADO", payload: { requestId: request.id, input, actorId: context.user.id } });
    return request;
  }, { timeoutMs: 60000 });
}

export async function recordAdvanceConcession(tx: DatabaseTransaction, context: AppContext, request: HrPortalRequest, commitmentId: string, date: Date) {
  if (request.kind !== "ADIANTAMENTO") return;
  const transaction = await controlPosting(tx, context, request, "ADVANCE_GRANTED", date, `Concessão do adiantamento ${request.id}, empenho ${commitmentId}`);
  const event = await enqueueHrIntegration(tx, { sourceKey: `ADIANTAMENTO:CONCESSAO:${request.id}`, domain: "FINANCEIRO", environment: "PRODUCAO", eventType: "ADIANTAMENTO_CONCEDIDO", payload: { requestId: request.id, commitmentId, transactionId: transaction.id } });
  await tx.update(hrIntegrationEvents).set({ status: "CONCLUIDA" }).where(eq(hrIntegrationEvents.id, event.id));
}

export async function submitAdvanceReport(connection: DatabaseConnection, context: AppContext, raw: unknown) {
  const schema = reportInputSchema;
  const input = schema.parse(raw);
  input.spentAmount = new Decimal(input.spentAmount).toFixed(2);
  input.returnedAmount = new Decimal(input.returnedAmount).toFixed(2);
  return withDatabaseTransaction(connection, async tx => {
    await tx.execute(sql`SELECT id FROM "HrPortalRequest" WHERE id=${input.requestId} FOR UPDATE`);
    const request = await requireHrPortalRequest(tx, input.requestId);
    assertTravelAllowanceAccess(request.payload, context);
    const memory = memorySchema.parse(request.payload);
    const currentCycle = await advanceCycle(tx, request.id);
    if (currentCycle.reopenedDate && input.date < currentCycle.reopenedDate) throw new Error("Reapresentação não pode anteceder a data de reabertura da prestação.");
    if (request.kind !== "ADIANTAMENTO" || !["DEFERIDA", "PRESTACAO_EM_ANALISE", "PRESTACAO_APROVADA", "PRESTACAO_IMPUGNADA"].includes(request.status) || input.date < memory.input.date) throw new Error("Prestação exige adiantamento concedido e data compatível com a origem.");
    const document = await requireDocument(tx, input.documentId);
    if (document.status !== "Válido") throw new Error("Prestação exige comprovantes GED válidos.");
    const payments = await listPersonnelAllowancePayments(tx, "ADVANCE_ALLOWANCE", request.id, await correctiveAdvancePaymentIds(tx, request.id));
    for (const payment of payments) {
      await tx.execute(sql`SELECT id FROM "Payment" WHERE id=${payment.id} FOR UPDATE`);
      const current = await requirePersonnelPayment(tx, payment.id);
      if (current.status !== "Paga" || payment.commitment.appropriation.budgetUnitId !== memory.input.budgetUnitId || payment.date.toISOString().slice(0, 10) > input.date) throw new Error("Pagamento do adiantamento não conciliado com UG/data da prestação.");
    }
    if (!payments.length || !payments.reduce((sum, payment) => { if (!payment.valueDecimal) throw new Error("Pagamento do adiantamento sem Decimal conciliado."); return sum.plus(payment.valueDecimal); }, new Decimal(0)).eq(memory.assessment.amountBRL)) throw new Error("Prestação exige pagamento integral pela execução financeira nativa.");
    await assertAdvanceRestitution(tx, request, input, payments);
    const key = cycleKey(`ADIANTAMENTO:PRESTACAO:${request.id}`, currentCycle.cycle);
    const previous = await findHrIntegrationEvent(tx, key);
    if (previous) {
      const original = schema.parse((previous.payload as { input: unknown }).input);
      original.spentAmount = new Decimal(original.spentAmount).toFixed(2);
      original.returnedAmount = new Decimal(original.returnedAmount).toFixed(2);
      if (JSON.stringify(original) !== JSON.stringify(input)) throw new Error("Prestação já registrada com outros documentos ou valores.");
      return previous;
    }
    const transaction = await controlPosting(tx, context, request, "ADVANCE_REPORTED", new Date(`${input.date}T00:00:00Z`), `Prestação do adiantamento ${request.id}`, currentCycle.cycle);
    await tx.update(hrPortalRequests).set({ status: "PRESTACAO_EM_ANALISE" }).where(eq(hrPortalRequests.id, request.id));
    const event = await enqueueHrIntegration(tx, { sourceKey: key, domain: "FINANCEIRO", environment: "PRODUCAO", eventType: "ADIANTAMENTO_PRESTACAO_APRESENTADA", payload: { input, actorId: context.user.id, paymentIds: payments.map(payment => payment.id), transactionId: transaction.id } });
    await tx.update(hrIntegrationEvents).set({ status: "CONCLUIDA" }).where(eq(hrIntegrationEvents.id, event.id));
    return event;
  }, { timeoutMs: 60000 });
}

export async function reviewAdvanceReport(connection: DatabaseConnection, context: AppContext, raw: unknown) {
  const schema = z.object({ requestId: z.string().min(1), date: z.iso.date(), decision: z.enum(["APROVAR", "IMPUGNAR"]), reason: z.string().trim().min(10).max(3000), documentId: z.string().min(1) }).strict();
  const input = schema.parse(raw);
  return withDatabaseTransaction(connection, async tx => {
    await tx.execute(sql`SELECT id FROM "HrPortalRequest" WHERE id=${input.requestId} FOR UPDATE`);
    const request = await requireHrPortalRequest(tx, input.requestId);
    assertTravelAllowanceAccess(request.payload, context);
    const currentCycle = await advanceCycle(tx, request.id);
    const report = await requireHrIntegrationEvent(tx, cycleKey(`ADIANTAMENTO:PRESTACAO:${request.id}`, currentCycle.cycle));
    const memory = z.object({ actorId: z.string(), input: reportInputSchema, paymentIds: z.array(z.string()).min(1) }).parse(report.payload);
    if (memory.actorId === context.user.id || request.actorId === context.user.id || input.date < memory.input.date) throw new Error("Prestação exige revisão independente do solicitante/apresentante e data compatível.");
    if (!canPerformModuleOperation(context.user, "FINANCEIRO", "update")) throw new Error("Revisão exige alteração no Financeiro.");
    const requestMemory = memorySchema.parse(request.payload);
    let paid = new Decimal(0);
    const reportPayments = [];
    for (const id of [...memory.paymentIds].sort()) {
      await tx.execute(sql`SELECT id FROM "Payment" WHERE id=${id} FOR UPDATE`);
      const payment = await requirePersonnelPayment(tx, id);
      const expense = payment.commitment.reservation?.expense;
      if (payment.status !== "Paga" || payment.commitment.appropriation.budgetUnitId !== requestMemory.input.budgetUnitId || expense?.sourceModule !== "RH" || expense.sourceType !== "ADVANCE_ALLOWANCE" || expense.sourceId !== request.id) throw new Error("Pagamento da prestação foi estornado ou diverge da origem; regularize antes da revisão.");
      if (!payment.valueDecimal) throw new Error("Pagamento da prestação sem Decimal conciliado.");
      paid = paid.plus(payment.valueDecimal);
      reportPayments.push(payment);
    }
    if (!paid.eq(requestMemory.assessment.amountBRL)) throw new Error("Pagamento da prestação não corresponde ao valor concedido.");
    await assertAdvanceRestitution(tx, request, memory.input, reportPayments);
    const key = cycleKey(`ADIANTAMENTO:REVISAO:${request.id}`, currentCycle.cycle);
    const previous = await findHrIntegrationEvent(tx, key);
    if (previous) {
      if (JSON.stringify(schema.parse((previous.payload as { input: unknown }).input)) !== JSON.stringify(input)) throw new Error("Prestação já revisada com outra decisão ou documento.");
      return previous;
    }
    if (request.kind !== "ADIANTAMENTO" || request.status !== "PRESTACAO_EM_ANALISE") throw new Error("Selecione uma prestação em análise.");
    const document = await requireDocument(tx, input.documentId);
    if (document.status !== "Válido") throw new Error("Parecer da revisão exige GED válido.");
    const transaction = await controlPosting(tx, context, request, input.decision === "APROVAR" ? "ADVANCE_APPROVED" : "ADVANCE_DISALLOWED", new Date(`${input.date}T00:00:00Z`), input.reason, currentCycle.cycle);
    await tx.update(hrPortalRequests).set({ status: input.decision === "APROVAR" ? "PRESTACAO_APROVADA" : "PRESTACAO_IMPUGNADA" }).where(eq(hrPortalRequests.id, request.id));
    const event = await enqueueHrIntegration(tx, { sourceKey: key, domain: "FINANCEIRO", environment: "PRODUCAO", eventType: "ADIANTAMENTO_PRESTACAO_REVISADA", payload: { input, actorId: context.user.id, transactionId: transaction.id, reportEventId: report.id } });
    await tx.update(hrIntegrationEvents).set({ status: "CONCLUIDA" }).where(eq(hrIntegrationEvents.id, event.id));
    return event;
  }, { timeoutMs: 60000 });
}

/** Payment reversal invalidates report control stages atomically without deleting evidence. */
export async function reverseAdvancePaymentControl(tx: DatabaseTransaction, actor: FinanceActor, paymentId: string, reason: string) {
  const payment = await requirePersonnelPayment(tx, paymentId);
  const expense = payment.commitment.reservation?.expense;
  if (expense?.sourceModule !== "RH" || expense.sourceType !== "ADVANCE_ALLOWANCE" || !expense.sourceId) return;
  await tx.execute(sql`SELECT id FROM "HrPortalRequest" WHERE id=${expense.sourceId} FOR UPDATE`);
  const request = await requireHrPortalRequest(tx, expense.sourceId);
  const memory = memorySchema.parse(request.payload);
  if (actor.allowedBudgetUnitIds && !actor.allowedBudgetUnitIds.includes(memory.input.budgetUnitId)) throw new Error("Estorno do adiantamento exige UG autorizada.");
  const date = new Date();
  const binding = await requirePersonnelEntityUnit(tx, memory.input.budgetUnitId);
  const year = await requirePersonnelFinancialYear(tx, binding.governmentEntityId, date.getUTCFullYear());
  const currentCycle = await advanceCycle(tx, request.id);
  for (const sourceKey of [cycleKey(`ADIANTAMENTO:REVISAO:${request.id}`, currentCycle.cycle), cycleKey(`ADIANTAMENTO:PRESTACAO:${request.id}`, currentCycle.cycle)]) {
    const event = await findHrIntegrationEvent(tx, sourceKey);
    if (!event || event.status === "ESTORNADA") continue;
    const id = z.object({ transactionId: z.string() }).parse(event.payload).transactionId;
    const original = await requirePersonnelAccountingTransaction(tx, { id });
    await postAccountingTransactionInTransaction(tx, actor, { financialYearId: year.id, governmentEntityId: binding.governmentEntityId, budgetUnitId: memory.input.budgetUnitId, date, history: `Estorno da prestação do adiantamento: ${reason}`, sourceModule: "RH", sourceType: "ADVANCE_CONTROL_REVERSAL", sourceId: request.id, eventType: "ADVANCE_PAYMENT_REVERSED", idempotencyKey: `${sourceKey}:PAYMENT_REVERSAL:${payment.id}`, reversalOfId: original.id, lines: original.entries.map(entry => ({ originalEntryId: entry.id, accountId: entry.accountId, type: entry.type === "Débito" ? "Crédito" : "Débito", value: entry.valueDecimal! })) });
    await tx.update(hrIntegrationEvents).set({ status: "ESTORNADA" }).where(eq(hrIntegrationEvents.id, event.id));
  }
  await tx.update(hrPortalRequests).set({ status: "REGULARIZACAO_PENDENTE" }).where(eq(hrPortalRequests.id, request.id));
  await enqueueHrIntegration(tx, { sourceKey: `ADIANTAMENTO:ESTORNO_PAGAMENTO:${payment.id}`, domain: "FINANCEIRO", environment: "PRODUCAO", eventType: "ADIANTAMENTO_PAGAMENTO_ESTORNADO", payload: { requestId: request.id, paymentId, reason, actorId: actor.usuarioId } });
}

/** Native cancellation gates have already verified settlements and payments. */
export async function reverseAdvanceCommitmentControl(tx: DatabaseTransaction, actor: FinanceActor, commitmentId: string, date: Date, reason: string) {
  const commitment = await requirePersonnelCommitment(tx, commitmentId);
  const expense = commitment.reservation?.expense;
  if (expense?.sourceModule === "RH" && expense.sourceType === "TRAVEL_ALLOWANCE" && expense.sourceId) {
    if (commitment.status !== "Anulado") throw new Error("Cancelamento da diária exige empenho anulado.");
    await tx.execute(sql`SELECT id FROM "HrPortalRequest" WHERE id=${expense.sourceId} FOR UPDATE`);
    const request = await requireHrPortalRequest(tx, expense.sourceId);
    const unit = z.object({ scope: z.literal("PRODUCAO"), input: z.object({ budgetUnitId: z.string() }) }).parse(request.payload).input.budgetUnitId;
    if (request.kind !== "DIARIA" || actor.allowedBudgetUnitIds && !actor.allowedBudgetUnitIds.includes(unit)) throw new Error("Cancelamento fora da origem/UG da diária.");
    const report = await findActiveTravelAllowanceReport(tx, request.id);
    if (report && report.status !== "ESTORNADA") throw new Error("Regularize a prestação ativa antes de cancelar a diária.");
    await tx.update(hrPortalRequests).set({ status: "CANCELADA" }).where(eq(hrPortalRequests.id, request.id));
    const cancellation = await enqueueHrIntegration(tx, { sourceKey: `DIARIA:ANULACAO:${commitmentId}`, domain: "FINANCEIRO", environment: "PRODUCAO", eventType: "DIARIA_CONCESSAO_ANULADA", payload: { requestId: request.id, commitmentId, actorId: actor.usuarioId, date: date.toISOString(), reason } });
    await tx.update(hrIntegrationEvents).set({ status: "CONCLUIDA" }).where(eq(hrIntegrationEvents.id, cancellation.id));
    return;
  }
  if (expense?.sourceModule !== "RH" || expense.sourceType !== "ADVANCE_ALLOWANCE" || !expense.sourceId) return;
  if (commitment.status !== "Anulado") throw new Error("Estorno da concessão exige empenho anulado.");
  await tx.execute(sql`SELECT id FROM "HrPortalRequest" WHERE id=${expense.sourceId} FOR UPDATE`);
  const request = await requireHrPortalRequest(tx, expense.sourceId);
  const memory = memorySchema.parse(request.payload);
  const event = await requireHrIntegrationEvent(tx, `ADIANTAMENTO:CONCESSAO:${request.id}`);
  if (event.status === "ESTORNADA") return;
  const currentCycle = await advanceCycle(tx, request.id);
  if ((await tx.select({ id: hrIntegrationEvents.id }).from(hrIntegrationEvents).where(and(inArray(hrIntegrationEvents.sourceKey, [cycleKey(`ADIANTAMENTO:REVISAO:${request.id}`, currentCycle.cycle), cycleKey(`ADIANTAMENTO:PRESTACAO:${request.id}`, currentCycle.cycle)]), eq(hrIntegrationEvents.status, "CONCLUIDA"))).limit(1)).length) throw new Error("Prestação ativa exige regularização do pagamento antes de anular concessão.");
  const source = z.object({ transactionId: z.string(), commitmentId: z.literal(commitmentId) }).parse(event.payload);
  const original = await requirePersonnelAccountingTransaction(tx, { id: source.transactionId });
  const binding = await requirePersonnelEntityUnit(tx, memory.input.budgetUnitId);
  const year = await requirePersonnelFinancialYear(tx, binding.governmentEntityId, date.getUTCFullYear());
  await postAccountingTransactionInTransaction(tx, actor, { financialYearId: year.id, governmentEntityId: binding.governmentEntityId, budgetUnitId: memory.input.budgetUnitId, date, history: `Anulação da concessão de adiantamento: ${reason}`, sourceModule: "RH", sourceType: "ADVANCE_CONTROL_REVERSAL", sourceId: request.id, eventType: "ADVANCE_CONCESSION_REVERSED", idempotencyKey: `${event.sourceKey}:REVERSE`, reversalOfId: original.id, lines: original.entries.map(entry => ({ originalEntryId: entry.id, accountId: entry.accountId, type: entry.type === "Débito" ? "Crédito" : "Débito", value: entry.valueDecimal! })) });
  await tx.update(hrIntegrationEvents).set({ status: "ESTORNADA" }).where(eq(hrIntegrationEvents.id, event.id));
  await tx.update(hrPortalRequests).set({ status: "CANCELADA" }).where(eq(hrPortalRequests.id, request.id));
}

export async function reopenAdvanceReport(connection: DatabaseConnection, context: AppContext, raw: unknown) {
  const schema = z.object({ requestId: z.string().min(1), requestKey: z.string().trim().min(1).max(120), date: z.iso.date(), documentId: z.string().min(1), reason: z.string().trim().min(10).max(3000) }).strict();
  const input = schema.parse(raw);
  if (!canPerformModuleOperation(context.user, "FINANCEIRO", "create") || !canPerformModuleOperation(context.user, "FINANCEIRO", "update")) throw new Error("Reabertura exige criação e alteração no Financeiro.");
  return withDatabaseTransaction(connection, async tx => {
    await tx.execute(sql`SELECT id FROM "HrPortalRequest" WHERE id=${input.requestId} FOR UPDATE`);
    const request = await requireHrPortalRequest(tx, input.requestId);
    assertTravelAllowanceAccess(request.payload, context);
    const key = `ADIANTAMENTO:REABERTURA:${request.id}:${input.requestKey}`;
    const previous = await findHrIntegrationEvent(tx, key);
    if (previous) {
      const stored = z.object({ input: schema, presenterId: z.string() }).parse(previous.payload);
      if (request.actorId === context.user.id || stored.presenterId === context.user.id) throw new Error("Reabertura exige responsável distinto do solicitante/apresentante.");
      if (JSON.stringify(stored.input) !== JSON.stringify(input)) throw new Error("Reabertura já registrada com outros dados.");
      return previous;
    }
    if (request.kind !== "ADIANTAMENTO" || !["PRESTACAO_IMPUGNADA", "PRESTACAO_APROVADA"].includes(request.status)) throw new Error("Reapresentação exige prestação aprovada ou impugnada.");
    const current = await advanceCycle(tx, request.id);
    const reviewKey = cycleKey(`ADIANTAMENTO:REVISAO:${request.id}`, current.cycle);
    const reportKey = cycleKey(`ADIANTAMENTO:PRESTACAO:${request.id}`, current.cycle);
    const report = await requireHrIntegrationEvent(tx, reportKey);
    const review = await requireHrIntegrationEvent(tx, reviewKey);
    const presenterId = z.object({ actorId: z.string() }).parse(report.payload).actorId;
    const decision = z.object({ input: z.object({ date: z.iso.date(), decision: z.enum(["APROVAR", "IMPUGNAR"]) }) }).parse(review.payload);
    const expectedStatus = decision.input.decision === "APROVAR" ? "PRESTACAO_APROVADA" : "PRESTACAO_IMPUGNADA";
    if (request.status !== expectedStatus || request.actorId === context.user.id || presenterId === context.user.id || input.date < decision.input.date || report.status !== "CONCLUIDA" || review.status !== "CONCLUIDA") throw new Error("Reabertura exige revisão independente, decisão conciliada e competência posterior ou igual à revisão.");
    const document = await requireDocument(tx, input.documentId);
    if (document.status !== "Válido") throw new Error("Reabertura exige parecer GED válido.");
    const memory = memorySchema.parse(request.payload);
    const binding = await requirePersonnelEntityUnit(tx, memory.input.budgetUnitId);
    await lockPersonnel(tx, `ADVANCE:HOLDER:${binding.governmentEntityId}:${memory.contract.employee.personId}`);
    const date = new Date(`${input.date}T00:00:00Z`);
    const year = await requirePersonnelFinancialYear(tx, binding.governmentEntityId, date.getUTCFullYear());
    for (const event of [review, report]) {
      const id = z.object({ transactionId: z.string() }).parse(event.payload).transactionId;
      const original = await requirePersonnelAccountingTransaction(tx, { id });
      if (original.budgetUnitId !== memory.input.budgetUnitId || original.governmentEntityId !== binding.governmentEntityId || original.sourceId !== request.id || original.date > date || !original.entries.length || original.entries.some(entry => !entry.valueDecimal || entry.valueDecimal.lte(0))) throw new Error("Partida de prestação/revisão sem origem, escopo, data ou valores conciliados.");
      await postAccountingTransactionInTransaction(tx, actorFor(context), { financialYearId: year.id, governmentEntityId: binding.governmentEntityId, budgetUnitId: memory.input.budgetUnitId, date, history: `Reabertura de prestação: ${input.reason}`, sourceModule: "RH", sourceType: "ADVANCE_CONTROL_REVERSAL", sourceId: request.id, eventType: "ADVANCE_REPORT_REOPENED", idempotencyKey: `${key}:${event.id}`, reversalOfId: original.id, lines: original.entries.map(entry => ({ originalEntryId: entry.id, accountId: entry.accountId, type: entry.type === "Débito" ? "Crédito" : "Débito", value: entry.valueDecimal! })) });
      await tx.update(hrIntegrationEvents).set({ status: "ESTORNADA" }).where(eq(hrIntegrationEvents.id, event.id));
    }
    const result = { cycle: current.cycle + 1, reopenedDate: input.date };
    const event = await enqueueHrIntegration(tx, { sourceKey: key, domain: "FINANCEIRO", environment: "PRODUCAO", eventType: "ADIANTAMENTO_PRESTACAO_REABERTA", payload: { input, presenterId, actorId: context.user.id, previousReportId: report.id, previousReviewId: review.id, previousCycle: current.cycle, previousDecision: decision.input.decision, previousRequestStatus: request.status } });
    await tx.update(hrIntegrationEvents).set({ status: "CONCLUIDA", result }).where(eq(hrIntegrationEvents.id, event.id));
    const cycleSourceKey = `ADIANTAMENTO:CICLO:${request.id}`;
    await enqueueHrIntegration(tx, { sourceKey: cycleSourceKey, domain: "FINANCEIRO", environment: "PRODUCAO", eventType: "ADIANTAMENTO_CICLO_ATUAL", payload: { requestId: request.id } });
    await tx.update(hrIntegrationEvents).set({ status: "CONCLUIDA", result }).where(eq(hrIntegrationEvents.sourceKey, cycleSourceKey));
    await tx.update(hrPortalRequests).set({ status: "DEFERIDA" }).where(eq(hrPortalRequests.id, request.id));
    return event;
  }, { timeoutMs: 60000 });
}
