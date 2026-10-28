import { and, desc, eq, sql } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import type { JsonValue } from "@/db/json";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseTransaction } from "@/db/transaction";
import { departments } from "@/db/schema/administration";
import { suppliers } from "@/db/schema/registry";
import { genericWorkflowDefinitions, genericWorkflowInstances, genericWorkflowStages, processTypes } from "@/db/schema/processes";
import { hrIntegrationEvents, hrPortalRequests } from "@/db/schema/personnel-workforce";
import { findHrIntegrationEvent } from "@/db/repositories/personnel/integration";
import { requireEmployeeWithPerson, requireHrPortalRequest } from "@/db/repositories/personnel/workforce";
import { requirePersonnelAppropriation, requirePersonnelEntityUnit, listPersonnelEntityUnits } from "@/db/repositories/personnel/finance";
import { z } from "zod";
import { assertBudgetUnitAccess, canPerformModuleOperation, isSystemAdministrator, type AppContext } from "@/lib/platform/tenant-context";
import { createValidatedProcess } from "@/lib/protocols/service";
import { createExpenseRequestInTransaction, approveExpenseRequestInTransaction, createBudgetReservationInTransaction, createCommitmentInTransaction } from "@/lib/financeiro";
import { assertTravelAllowanceAccess } from "./travel-allowance";
import { enqueueHrIntegration } from "./workforce-service";
import { recordAdvanceConcession } from "./municipal-advances";

const planSchema = z.object({ requestId: z.string().min(1), processTypeId: z.string().min(1), subjectId: z.string().min(1), appropriationId: z.string().min(1), supplierId: z.string().min(1), secretariatId: z.string().min(1), date: z.iso.date() }).strict();
const memorySchema = z.object({ input: z.object({ budgetUnitId: z.string(), purpose: z.string() }), assessment: z.object({ amountBRL: z.string() }), contract: z.object({ employee: z.object({ personId: z.string() }) }) });

async function assertPlanTarget(tx: DatabaseTransaction, context: AppContext, plan: z.infer<typeof planSchema>, payload: JsonValue) {
  assertTravelAllowanceAccess(payload, context);
  const memory = memorySchema.parse(payload);
  const appropriation = await requirePersonnelAppropriation(tx, plan.appropriationId);
  assertBudgetUnitAccess(context.user, appropriation.budgetUnitId);
  const [supplier] = await tx.select().from(suppliers).where(eq(suppliers.id, plan.supplierId)).limit(1);
  if (!supplier) throw new Error("Fornecedor não encontrado.");
  if (appropriation.budgetUnitId !== memory.input.budgetUnitId || appropriation.secretariatId !== plan.secretariatId || supplier.personId !== memory.contract.employee.personId || supplier.status !== "Ativo" || new Decimal(memory.assessment.amountBRL).lte(0)) throw new Error("Plano de diária incompatível com UG, secretaria, titular ou valor elegível.");
  return memory;
}

/** The native published workflow owns stages, routing, receipts and signatures. */
async function requireWorkflowInstance(tx: DatabaseTransaction, processId: string) {
  const [instance] = await tx.select().from(genericWorkflowInstances).where(eq(genericWorkflowInstances.processId, processId)).limit(1);
  if (!instance) throw new Error("Roteiro do processo não encontrado.");
  return instance;
}

export async function openTravelAllowanceProcess(connection: DatabaseConnection, context: AppContext, raw: unknown) {
  if (!canPerformModuleOperation(context.user, "RH", "update") || !canPerformModuleOperation(context.user, "PROCESSOS", "create") || !context.user.employeeId) throw new Error("Abertura exige alteração RH, criação de processos e vínculo operacional.");
  const input = planSchema.parse(raw);
  return withDatabaseTransaction(connection, async tx => {
    await tx.execute(sql`SELECT id FROM "HrPortalRequest" WHERE id=${input.requestId} FOR UPDATE`);
    const request = await requireHrPortalRequest(tx, input.requestId);
    const memory = await assertPlanTarget(tx, context, input, request.payload);
    if (!["DIARIA", "ADIANTAMENTO"].includes(request.kind)) throw new Error("Roteiro municipal exige solicitação de diária ou adiantamento municipal.");
    if (request.kind === "ADIANTAMENTO" && (request.payload as { input: { date: string } }).input.date !== input.date) throw new Error("Data do plano deve corresponder à concessão solicitada do adiantamento.");
    const sourceKey = `DIARIA:PROCESSO:${request.id}`;
    const previous = await findHrIntegrationEvent(tx, sourceKey);
    if (previous) {
      const stored = z.object({ input: planSchema, processId: z.string() }).parse(previous.payload);
      if (JSON.stringify(stored.input) !== JSON.stringify(input)) throw new Error("Diária já protocolada com outro roteiro ou plano financeiro.");
      return { processId: stored.processId };
    }
    if (request.status !== "EM_ANALISE") throw new Error("Protocole a diária antes da decisão administrativa.");
    const [definition] = await tx.select({ definition: genericWorkflowDefinitions }).from(genericWorkflowDefinitions).innerJoin(processTypes, eq(processTypes.id, genericWorkflowDefinitions.processTypeId)).where(and(eq(genericWorkflowDefinitions.processTypeId, input.processTypeId), eq(genericWorkflowDefinitions.status, "PUBLISHED"), eq(processTypes.isActive, true), eq(processTypes.genericWorkflowEnabled, true))).orderBy(desc(genericWorkflowDefinitions.version)).limit(1);
    if (!definition) throw new Error("Roteiro publicado não encontrado.");
    const stages = await tx.select({ department: departments }).from(genericWorkflowStages).innerJoin(departments, eq(departments.id, genericWorkflowStages.departmentId)).where(eq(genericWorkflowStages.definitionId, definition.definition.id));
    const entity = await requirePersonnelEntityUnit(tx, memory.input.budgetUnitId);
    const entityUnits = await listPersonnelEntityUnits(tx, entity.governmentEntityId);
    const secretariats = new Set(entityUnits.map(row => row.secretariatId));
    if (!stages.length || stages.some(stage => !stage.department.isActive || !secretariats.has(stage.department.secretariatId))) throw new Error("Todas as etapas do roteiro devem pertencer ao ente da diária.");
    const employee = await requireEmployeeWithPerson(tx, context.user.employeeId!);
    if (!employee.isActive) throw new Error("Servidor operacional inativo.");
    const process = await createValidatedProcess(tx, employee, context.user.id, { processTypeId: input.processTypeId, subjectId: input.subjectId, personId: memory.contract.employee.personId, description: `Diária ${request.id}: ${memory.input.purpose}` });
    const opened = await requireWorkflowInstance(tx, process.id);
    if (opened.definitionId !== definition.definition.id) throw new Error("Roteiro foi atualizado durante a abertura; revise a versão publicada antes de repetir.");
    const event = await enqueueHrIntegration(tx, { sourceKey, domain: "AUDITORIA", environment: "PRODUCAO", eventType: "DIARIA_PROCESSO_ABERTO", payload: { input, processId: process.id, protocolNumber: process.protocolNumber, definitionId: definition.definition.id, actorId: context.user.id } });
    await tx.update(hrIntegrationEvents).set({ status: "CONCLUIDA" }).where(eq(hrIntegrationEvents.id, event.id));
    return { processId: process.id };
  }, { timeoutMs: 60000 });
}

/** Called in the same transaction as the final native workflow decision. */
export async function completeTravelAllowanceProcess(tx: DatabaseTransaction, context: AppContext, processId: string, reason: string) {
  const [source] = await tx.select().from(hrIntegrationEvents).where(and(eq(hrIntegrationEvents.eventType, "DIARIA_PROCESSO_ABERTO"), sql`${hrIntegrationEvents.payload}->>'processId' = ${processId}`)).limit(1);
  if (!source) return;
  if (!canPerformModuleOperation(context.user, "FINANCEIRO", "create") || !canPerformModuleOperation(context.user, "FINANCEIRO", "update")) throw new Error("Conclusão da diária exige criação e alteração no Financeiro.");
  const plan = z.object({ input: planSchema, processId: z.literal(processId), definitionId: z.string() }).parse(source.payload);
  await tx.execute(sql`SELECT id FROM "HrPortalRequest" WHERE id=${plan.input.requestId} FOR UPDATE`);
  const request = await requireHrPortalRequest(tx, plan.input.requestId);
  const memory = await assertPlanTarget(tx, context, plan.input, request.payload);
  const instance = await requireWorkflowInstance(tx, processId);
  if (instance.status !== "CONCLUDED" || instance.definitionId !== plan.definitionId || instance.openedByUsuarioId === context.user.id || request.actorId === context.user.id || !["DIARIA", "ADIANTAMENTO"].includes(request.kind)) throw new Error("Emissão automática exige processo concluído por responsável distinto do solicitante.");
  const key = `FINANCEIRO:DIARIA:PROCESSO:${request.id}`;
  const previous = await findHrIntegrationEvent(tx, key);
  if (previous) {
    if ((previous.payload as { reason: string }).reason !== reason) throw new Error("Processo de diária concluído com outro fundamento.");
    return z.object({ commitmentId: z.string() }).parse(previous.result);
  }
  const sourceType = request.kind === "ADIANTAMENTO" ? "ADVANCE_ALLOWANCE" : "TRAVEL_ALLOWANCE";
  if (request.status !== "EM_ANALISE" || (await tx.execute<{ id: string }>(sql`SELECT id FROM "Expense" WHERE "sourceModule"='RH' AND "sourceType"=${sourceType} AND "sourceId"=${request.id} LIMIT 1`)).rows.length) throw new Error("Solicitação já possui decisão ou origem financeira; concilie antes da conclusão.");
  const date = new Date(`${plan.input.date}T00:00:00Z`);
  const number = `${request.kind === "ADIANTAMENTO" ? "ADIANTAMENTO" : "DIARIA"}-${processId}`;
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`DIARIA:AUTORIZACAO:${memory.input.budgetUnitId}:${number}`}))`);
  if ((await tx.select({ id: hrIntegrationEvents.id }).from(hrIntegrationEvents).where(and(eq(hrIntegrationEvents.eventType, "DIARIA_DECIDIDA"), eq(hrIntegrationEvents.environment, "PRODUCAO"), sql`${hrIntegrationEvents.payload}#>>'{input,authorizationNumber}' = ${number}`, sql`${hrIntegrationEvents.payload}#>>'{requestPayload,input,budgetUnitId}' = ${memory.input.budgetUnitId}`)).limit(1)).length) throw new Error("Número de autorização já utilizado nesta UG.");
  const actor = { usuarioId: context.user.id, employeeId: context.user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds };
  const expense = await createExpenseRequestInTransaction(tx, { ...actor, usuarioId: request.actorId }, { date, description: `${request.kind}: ${memory.input.purpose}`, value: memory.assessment.amountBRL, appropriationId: plan.input.appropriationId, supplierId: plan.input.supplierId, secretariatId: plan.input.secretariatId, sourceModule: "RH", sourceType, sourceId: request.id, eventType: "DIARIA_PROCESSO_AUTORIZADO", idempotencyKey: key });
  await approveExpenseRequestInTransaction(tx, actor, expense.id);
  const reservation = await createBudgetReservationInTransaction(tx, actor, { number: `RES-${number}`, date, value: memory.assessment.amountBRL, appropriationId: plan.input.appropriationId, expenseId: expense.id, justification: reason });
  const commitment = await createCommitmentInTransaction(tx, actor, { number, date, value: memory.assessment.amountBRL, type: "Ordinário", history: `Diária autorizada: ${memory.input.purpose}`, appropriationId: plan.input.appropriationId, supplierId: plan.input.supplierId, reservationId: reservation.id, processId });
  await recordAdvanceConcession(tx, context, request, commitment.id, date);
  await tx.update(hrPortalRequests).set({ status: "DEFERIDA", decision: reason, decidedBy: context.user.id, decidedAt: new Date() }).where(eq(hrPortalRequests.id, request.id));
  await enqueueHrIntegration(tx, { sourceKey: `DIARIA:DECISAO:${request.id}`, domain: "AUDITORIA", environment: "PRODUCAO", eventType: "DIARIA_DECIDIDA", payload: { input: { requestId: request.id, status: "DEFERIDA", decision: reason, authorizationNumber: number }, actorId: context.user.id, requestPayload: request.payload, processId } });
  const event = await enqueueHrIntegration(tx, { sourceKey: key, domain: "FINANCEIRO", environment: "PRODUCAO", eventType: "DIARIA_EMPENHO_AUTOMATICO", payload: { processId, sourceEventId: source.id, actorId: context.user.id, requesterId: request.actorId, reason } });
  await tx.update(hrIntegrationEvents).set({ status: "CONCLUIDA", result: { expenseId: expense.id, reservationId: reservation.id, commitmentId: commitment.id } }).where(eq(hrIntegrationEvents.id, event.id));
  return { commitmentId: commitment.id };
}

export async function rejectTravelAllowanceProcess(tx: DatabaseTransaction, context: AppContext, processId: string, reason: string) {
  const [source] = await tx.select().from(hrIntegrationEvents).where(and(eq(hrIntegrationEvents.eventType, "DIARIA_PROCESSO_ABERTO"), sql`${hrIntegrationEvents.payload}->>'processId' = ${processId}`)).limit(1);
  if (!source) return;
  const plan = z.object({ input: planSchema }).parse(source.payload);
  await tx.execute(sql`SELECT id FROM "HrPortalRequest" WHERE id=${plan.input.requestId} FOR UPDATE`);
  const request = await requireHrPortalRequest(tx, plan.input.requestId);
  assertTravelAllowanceAccess(request.payload, context);
  const instance = await requireWorkflowInstance(tx, processId);
  if (instance.status !== "REJECTED" || request.status !== "EM_ANALISE") throw new Error("Rejeição exige processo rejeitado e diária ainda em análise.");
  await tx.update(hrPortalRequests).set({ status: "INDEFERIDA", decision: reason, decidedBy: context.user.id, decidedAt: new Date() }).where(eq(hrPortalRequests.id, request.id));
  await enqueueHrIntegration(tx, { sourceKey: `DIARIA:DECISAO:${request.id}`, domain: "AUDITORIA", environment: "PRODUCAO", eventType: "DIARIA_DECIDIDA", payload: { input: { requestId: request.id, status: "INDEFERIDA", decision: reason, authorizationNumber: `DIARIA-${processId}` }, actorId: context.user.id, requestPayload: request.payload, processId } });
}
