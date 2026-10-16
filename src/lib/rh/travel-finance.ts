import { Prisma } from "@prisma/client";
import { z } from "zod";
import { createExpenseRequest } from "@/lib/financeiro";
import { canPerformModuleOperation, isSystemAdministrator, type AppContext } from "@/lib/platform/tenant-context";
import { assertTravelAllowanceAccess } from "./travel-allowance";
import { enqueueHrIntegration } from "./workforce-service";

const expenseInputSchema = z.object({ requestId: z.string().min(1), date: z.iso.date(), appropriationId: z.string().min(1), supplierId: z.string().min(1), secretariatId: z.string().min(1) }).strict();

/** Durable dispatch to the native expenditure workflow; approval, commitment,
 * settlement and payment keep their own authorization and accounting gates. */
export async function dispatchTravelAllowanceExpense(context: AppContext, raw: unknown) {
  if (!canPerformModuleOperation(context.user, "RH", "update") || !canPerformModuleOperation(context.user, "FINANCEIRO", "create")) throw new Error("Diária financeira exige alteração RH e criação no Financeiro.");
  const input = expenseInputSchema.parse(raw);
  const date = new Date(`${input.date}T00:00:00Z`);
  const sourceKey = `FINANCEIRO:DIARIA:${input.requestId}`;
  const prepared = await context.prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "HrPortalRequest" WHERE id=${input.requestId} FOR UPDATE`;
    const request = await tx.hrPortalRequest.findUniqueOrThrow({ where: { id: input.requestId } });
    assertTravelAllowanceAccess(request.payload, context);
    if (request.kind !== "DIARIA" || request.status !== "DEFERIDA") throw new Error("Despesa exige diária municipal autorizada.");
    const memory = z.object({ input: z.object({ budgetUnitId: z.string(), purpose: z.string() }), assessment: z.object({ amountBRL: z.string() }), contract: z.object({ employee: z.object({ personId: z.string() }) }) }).parse(request.payload);
    const appropriation = await tx.budgetAppropriation.findUniqueOrThrow({ where: { id: input.appropriationId } });
    const supplier = await tx.supplier.findUniqueOrThrow({ where: { id: input.supplierId } });
    if (appropriation.budgetUnitId !== memory.input.budgetUnitId || supplier.personId !== memory.contract.employee.personId || supplier.status !== "Ativo") throw new Error("Dotação e credor devem corresponder à UG e ao servidor da diária.");
    if (new Prisma.Decimal(memory.assessment.amountBRL).lte(0)) throw new Error("Diária sem valor elegível não gera despesa.");
    const previous = await tx.hrIntegrationEvent.findUnique({ where: { sourceKey } });
    if (previous) {
      const stored = expenseInputSchema.parse((previous.payload as { input: unknown }).input);
      if (JSON.stringify(stored) !== JSON.stringify(input)) throw new Error("Diária já encaminhada com outra classificação ou data.");
    } else {
      await enqueueHrIntegration(tx, { sourceKey, domain: "FINANCEIRO", environment: "PRODUCAO", eventType: "DESPESA_DIARIA", payload: { input, amount: memory.assessment.amountBRL } });
    }
    return { amount: memory.assessment.amountBRL, purpose: memory.input.purpose };
  });
  const actor = { usuarioId: context.user.id, employeeId: context.user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds };
  const expense = await createExpenseRequest(context.prisma, actor, { ...input, date, description: `Diária: ${prepared.purpose}`, value: prepared.amount, sourceModule: "RH", sourceType: "TRAVEL_ALLOWANCE", sourceId: input.requestId, eventType: "DIARIA_AUTORIZADA", idempotencyKey: sourceKey });
  await context.prisma.hrIntegrationEvent.update({ where: { sourceKey }, data: { status: "CONCLUIDA", result: { expenseId: expense.id, paid: false } } });
  return { expenseId: expense.id };
}
