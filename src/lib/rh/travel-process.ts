import { Prisma } from "@prisma/client";
import { z } from "zod";
import { assertBudgetUnitAccess, canPerformModuleOperation, isSystemAdministrator, type AppContext } from "@/lib/platform/tenant-context";
import { createValidatedProcess } from "@/lib/protocols/service";
import { createExpenseRequestInTransaction, approveExpenseRequestInTransaction, createBudgetReservationInTransaction, createCommitmentInTransaction } from "@/lib/financeiro";
import { assertTravelAllowanceAccess } from "./travel-allowance";
import { enqueueHrIntegration } from "./workforce-service";
import { recordAdvanceConcession } from "./municipal-advances";

const planSchema = z.object({ requestId: z.string().min(1), processTypeId: z.string().min(1), subjectId: z.string().min(1), appropriationId: z.string().min(1), supplierId: z.string().min(1), secretariatId: z.string().min(1), date: z.iso.date() }).strict();
const memorySchema = z.object({ input: z.object({ budgetUnitId: z.string(), purpose: z.string() }), assessment: z.object({ amountBRL: z.string() }), contract: z.object({ employee: z.object({ personId: z.string() }) }) });

async function assertPlanTarget(tx: Prisma.TransactionClient, context: AppContext, plan: z.infer<typeof planSchema>, payload: Prisma.JsonValue) {
  assertTravelAllowanceAccess(payload, context);
  const memory = memorySchema.parse(payload);
  const appropriation = await tx.budgetAppropriation.findUniqueOrThrow({ where: { id: plan.appropriationId } });
  assertBudgetUnitAccess(context.user, appropriation.budgetUnitId);
  const supplier = await tx.supplier.findUniqueOrThrow({ where: { id: plan.supplierId } });
  const unit = await tx.budgetUnit.findUniqueOrThrow({ where: { id: appropriation.budgetUnitId } });
  if (appropriation.budgetUnitId !== memory.input.budgetUnitId || unit.secretariatId !== plan.secretariatId || supplier.personId !== memory.contract.employee.personId || supplier.status !== "Ativo" || new Prisma.Decimal(memory.assessment.amountBRL).lte(0)) throw new Error("Plano de diária incompatível com UG, secretaria, titular ou valor elegível.");
  return memory;
}

/** The native published workflow owns stages, routing, receipts and signatures. */
export async function openTravelAllowanceProcess(context: AppContext, raw: unknown) {
  if (!canPerformModuleOperation(context.user, "RH", "update") || !canPerformModuleOperation(context.user, "PROCESSOS", "create") || !context.user.employeeId) throw new Error("Abertura exige alteração RH, criação de processos e vínculo operacional.");
  const input = planSchema.parse(raw);
  return context.prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "HrPortalRequest" WHERE id=${input.requestId} FOR UPDATE`;
    const request = await tx.hrPortalRequest.findUniqueOrThrow({ where: { id: input.requestId } });
    const memory = await assertPlanTarget(tx, context, input, request.payload);
    if (!["DIARIA", "ADIANTAMENTO"].includes(request.kind)) throw new Error("Roteiro municipal exige solicitação de diária ou adiantamento municipal.");
    if (request.kind === "ADIANTAMENTO" && (request.payload as { input: { date: string } }).input.date !== input.date) throw new Error("Data do plano deve corresponder à concessão solicitada do adiantamento.");
    const sourceKey = `DIARIA:PROCESSO:${request.id}`;
    const previous = await tx.hrIntegrationEvent.findUnique({ where: { sourceKey } });
    if (previous) {
      const stored = z.object({ input: planSchema, processId: z.string() }).parse(previous.payload);
      if (JSON.stringify(stored.input) !== JSON.stringify(input)) throw new Error("Diária já protocolada com outro roteiro ou plano financeiro.");
      return { processId: stored.processId };
    }
    if (request.status !== "EM_ANALISE") throw new Error("Protocole a diária antes da decisão administrativa.");
    const definition = await tx.genericProcessWorkflowDefinition.findFirstOrThrow({ where: { processTypeId: input.processTypeId, status: "PUBLISHED", processType: { isActive: true, genericWorkflowEnabled: true } }, orderBy: { version: "desc" }, include: { stages: { include: { department: true } } } });
    const entity = await tx.planningEntityUnit.findUniqueOrThrow({ where: { budgetUnitId: memory.input.budgetUnitId } });
    const entityUnits = await tx.planningEntityUnit.findMany({ where: { governmentEntityId: entity.governmentEntityId }, include: { budgetUnit: { select: { secretariatId: true } } } });
    const secretariats = new Set(entityUnits.map(row => row.budgetUnit.secretariatId));
    if (!definition.stages.length || definition.stages.some(stage => !stage.department.isActive || !secretariats.has(stage.department.secretariatId))) throw new Error("Todas as etapas do roteiro devem pertencer ao ente da diária.");
    const employee = await tx.employee.findFirstOrThrow({ where: { id: context.user.employeeId!, isActive: true } });
    const process = await createValidatedProcess(tx, employee, context.user.id, { processTypeId: input.processTypeId, subjectId: input.subjectId, personId: memory.contract.employee.personId, description: `Diária ${request.id}: ${memory.input.purpose}` });
    const opened = await tx.genericProcessWorkflowInstance.findUniqueOrThrow({ where: { processId: process.id } });
    if (opened.definitionId !== definition.id) throw new Error("Roteiro foi atualizado durante a abertura; revise a versão publicada antes de repetir.");
    const event = await enqueueHrIntegration(tx, { sourceKey, domain: "AUDITORIA", environment: "PRODUCAO", eventType: "DIARIA_PROCESSO_ABERTO", payload: { input, processId: process.id, protocolNumber: process.protocolNumber, definitionId: definition.id, actorId: context.user.id } });
    await tx.hrIntegrationEvent.update({ where: { id: event.id }, data: { status: "CONCLUIDA" } });
    return { processId: process.id };
  }, { timeout: 60000 });
}

/** Called in the same transaction as the final native workflow decision. */
export async function completeTravelAllowanceProcess(tx: Prisma.TransactionClient, context: AppContext, processId: string, reason: string) {
  const source = await tx.hrIntegrationEvent.findFirst({ where: { eventType: "DIARIA_PROCESSO_ABERTO", payload: { path: ["processId"], equals: processId } } });
  if (!source) return;
  if (!canPerformModuleOperation(context.user, "FINANCEIRO", "create") || !canPerformModuleOperation(context.user, "FINANCEIRO", "update")) throw new Error("Conclusão da diária exige criação e alteração no Financeiro.");
  const plan = z.object({ input: planSchema, processId: z.literal(processId), definitionId: z.string() }).parse(source.payload);
  await tx.$queryRaw`SELECT id FROM "HrPortalRequest" WHERE id=${plan.input.requestId} FOR UPDATE`;
  const request = await tx.hrPortalRequest.findUniqueOrThrow({ where: { id: plan.input.requestId } });
  const memory = await assertPlanTarget(tx, context, plan.input, request.payload);
  const instance = await tx.genericProcessWorkflowInstance.findUniqueOrThrow({ where: { processId } });
  if (instance.status !== "CONCLUDED" || instance.definitionId !== plan.definitionId || instance.openedByUsuarioId === context.user.id || request.actorId === context.user.id || !["DIARIA", "ADIANTAMENTO"].includes(request.kind)) throw new Error("Emissão automática exige processo concluído por responsável distinto do solicitante.");
  const key = `FINANCEIRO:DIARIA:PROCESSO:${request.id}`;
  const previous = await tx.hrIntegrationEvent.findUnique({ where: { sourceKey: key } });
  if (previous) {
    if ((previous.payload as { reason: string }).reason !== reason) throw new Error("Processo de diária concluído com outro fundamento.");
    return z.object({ commitmentId: z.string() }).parse(previous.result);
  }
  const sourceType = request.kind === "ADIANTAMENTO" ? "ADVANCE_ALLOWANCE" : "TRAVEL_ALLOWANCE";
  if (request.status !== "EM_ANALISE" || await tx.expense.count({ where: { sourceModule: "RH", sourceType, sourceId: request.id } })) throw new Error("Solicitação já possui decisão ou origem financeira; concilie antes da conclusão.");
  const date = new Date(`${plan.input.date}T00:00:00Z`);
  const number = `${request.kind === "ADIANTAMENTO" ? "ADIANTAMENTO" : "DIARIA"}-${processId}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`DIARIA:AUTORIZACAO:${memory.input.budgetUnitId}:${number}`}))`;
  if (await tx.hrIntegrationEvent.findFirst({ where: { eventType: "DIARIA_DECIDIDA", environment: "PRODUCAO", AND: [{ payload: { path: ["input", "authorizationNumber"], equals: number } }, { payload: { path: ["requestPayload", "input", "budgetUnitId"], equals: memory.input.budgetUnitId } }] } })) throw new Error("Número de autorização já utilizado nesta UG.");
  const actor = { usuarioId: context.user.id, employeeId: context.user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds };
  const expense = await createExpenseRequestInTransaction(tx, { ...actor, usuarioId: request.actorId }, { date, description: `${request.kind}: ${memory.input.purpose}`, value: memory.assessment.amountBRL, appropriationId: plan.input.appropriationId, supplierId: plan.input.supplierId, secretariatId: plan.input.secretariatId, sourceModule: "RH", sourceType, sourceId: request.id, eventType: "DIARIA_PROCESSO_AUTORIZADO", idempotencyKey: key });
  await approveExpenseRequestInTransaction(tx, actor, expense.id);
  const reservation = await createBudgetReservationInTransaction(tx, actor, { number: `RES-${number}`, date, value: memory.assessment.amountBRL, appropriationId: plan.input.appropriationId, expenseId: expense.id, justification: reason });
  const commitment = await createCommitmentInTransaction(tx, actor, { number, date, value: memory.assessment.amountBRL, type: "Ordinário", history: `Diária autorizada: ${memory.input.purpose}`, appropriationId: plan.input.appropriationId, supplierId: plan.input.supplierId, reservationId: reservation.id, processId });
  await recordAdvanceConcession(tx, context, request, commitment.id, date);
  await tx.hrPortalRequest.update({ where: { id: request.id }, data: { status: "DEFERIDA", decision: reason, decidedBy: context.user.id, decidedAt: new Date() } });
  await enqueueHrIntegration(tx, { sourceKey: `DIARIA:DECISAO:${request.id}`, domain: "AUDITORIA", environment: "PRODUCAO", eventType: "DIARIA_DECIDIDA", payload: { input: { requestId: request.id, status: "DEFERIDA", decision: reason, authorizationNumber: number }, actorId: context.user.id, requestPayload: request.payload, processId } });
  const event = await enqueueHrIntegration(tx, { sourceKey: key, domain: "FINANCEIRO", environment: "PRODUCAO", eventType: "DIARIA_EMPENHO_AUTOMATICO", payload: { processId, sourceEventId: source.id, actorId: context.user.id, requesterId: request.actorId, reason } });
  await tx.hrIntegrationEvent.update({ where: { id: event.id }, data: { status: "CONCLUIDA", result: { expenseId: expense.id, reservationId: reservation.id, commitmentId: commitment.id } } });
  return { commitmentId: commitment.id };
}

export async function rejectTravelAllowanceProcess(tx: Prisma.TransactionClient, context: AppContext, processId: string, reason: string) {
  const source = await tx.hrIntegrationEvent.findFirst({ where: { eventType: "DIARIA_PROCESSO_ABERTO", payload: { path: ["processId"], equals: processId } } });
  if (!source) return;
  const plan = z.object({ input: planSchema }).parse(source.payload);
  await tx.$queryRaw`SELECT id FROM "HrPortalRequest" WHERE id=${plan.input.requestId} FOR UPDATE`;
  const request = await tx.hrPortalRequest.findUniqueOrThrow({ where: { id: plan.input.requestId } });
  assertTravelAllowanceAccess(request.payload, context);
  const instance = await tx.genericProcessWorkflowInstance.findUniqueOrThrow({ where: { processId } });
  if (instance.status !== "REJECTED" || request.status !== "EM_ANALISE") throw new Error("Rejeição exige processo rejeitado e diária ainda em análise.");
  await tx.hrPortalRequest.update({ where: { id: request.id }, data: { status: "INDEFERIDA", decision: reason, decidedBy: context.user.id, decidedAt: new Date() } });
  await enqueueHrIntegration(tx, { sourceKey: `DIARIA:DECISAO:${request.id}`, domain: "AUDITORIA", environment: "PRODUCAO", eventType: "DIARIA_DECIDIDA", payload: { input: { requestId: request.id, status: "INDEFERIDA", decision: reason, authorizationNumber: `DIARIA-${processId}` }, actorId: context.user.id, requestPayload: request.payload, processId } });
}
