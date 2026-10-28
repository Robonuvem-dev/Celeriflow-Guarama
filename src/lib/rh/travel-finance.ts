import { eq, sql } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction } from "@/db/transaction";
import { hrIntegrationEvents } from "@/db/schema/personnel-workforce";
import { suppliers } from "@/db/schema/registry";
import { findHrIntegrationEvent } from "@/db/repositories/personnel/integration";
import { requireHrPortalRequest } from "@/db/repositories/personnel/workforce";
import { requirePersonnelAppropriation } from "@/db/repositories/personnel/finance";
import { z } from "zod";
import { createExpenseRequestInTransaction } from "@/lib/financeiro";
import { canPerformModuleOperation, isSystemAdministrator, type AppContext } from "@/lib/platform/tenant-context";
import { assertTravelAllowanceAccess } from "./travel-allowance";
import { enqueueHrIntegration } from "./workforce-service";

const expenseInputSchema = z.object({ requestId: z.string().min(1), date: z.iso.date(), appropriationId: z.string().min(1), supplierId: z.string().min(1), secretariatId: z.string().min(1) }).strict();

/** Durable dispatch to the native expenditure workflow; approval, commitment,
 * settlement and payment keep their own authorization and accounting gates. */
export async function dispatchTravelAllowanceExpense(connection: DatabaseConnection, context: AppContext, raw: unknown) {
  if (!canPerformModuleOperation(context.user, "RH", "update") || !canPerformModuleOperation(context.user, "FINANCEIRO", "create")) throw new Error("Diária financeira exige alteração RH e criação no Financeiro.");
  const input = expenseInputSchema.parse(raw);
  const date = new Date(`${input.date}T00:00:00Z`);
  const sourceKey = `FINANCEIRO:DIARIA:${input.requestId}`;
  return withDatabaseTransaction(connection, async tx => {
    await tx.execute(sql`SELECT id FROM "HrPortalRequest" WHERE id=${input.requestId} FOR UPDATE`);
    const request = await requireHrPortalRequest(tx, input.requestId);
    assertTravelAllowanceAccess(request.payload, context);
    if (request.kind !== "DIARIA" || request.status !== "DEFERIDA") throw new Error("Despesa exige diária municipal autorizada.");
    const memory = z.object({ input: z.object({ budgetUnitId: z.string(), purpose: z.string() }), assessment: z.object({ amountBRL: z.string() }), contract: z.object({ employee: z.object({ personId: z.string() }) }) }).parse(request.payload);
    const appropriation = await requirePersonnelAppropriation(tx, input.appropriationId);
    const [supplier] = await tx.select().from(suppliers).where(eq(suppliers.id, input.supplierId)).limit(1);
    if (!supplier) throw new Error("Fornecedor não encontrado.");
    if (appropriation.budgetUnitId !== memory.input.budgetUnitId || supplier.personId !== memory.contract.employee.personId || supplier.status !== "Ativo") throw new Error("Dotação e credor devem corresponder à UG e ao servidor da diária.");
    if (new Decimal(memory.assessment.amountBRL).lte(0)) throw new Error("Diária sem valor elegível não gera despesa.");
    const previous = await findHrIntegrationEvent(tx, sourceKey);
    if (previous) {
      const stored = expenseInputSchema.parse((previous.payload as { input: unknown }).input);
      if (JSON.stringify(stored) !== JSON.stringify(input)) throw new Error("Diária já encaminhada com outra classificação ou data.");
    } else {
      await enqueueHrIntegration(tx, { sourceKey, domain: "FINANCEIRO", environment: "PRODUCAO", eventType: "DESPESA_DIARIA", payload: { input, amount: memory.assessment.amountBRL } });
    }
    const actor = { usuarioId: context.user.id, employeeId: context.user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds };
    const expense = await createExpenseRequestInTransaction(tx, actor, { ...input, date, description: `Diária: ${memory.input.purpose}`, value: memory.assessment.amountBRL, sourceModule: "RH", sourceType: "TRAVEL_ALLOWANCE", sourceId: input.requestId, eventType: "DIARIA_AUTORIZADA", idempotencyKey: sourceKey });
    await tx.update(hrIntegrationEvents).set({ status: "CONCLUIDA", result: { expenseId: expense.id, paid: false } }).where(eq(hrIntegrationEvents.sourceKey, sourceKey));
    return { expenseId: expense.id };
  });
}
