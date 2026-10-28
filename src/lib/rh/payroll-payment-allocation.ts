import { and, eq, inArray, sql } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction } from "@/db/transaction";
import { hrIntegrationEvents, hrEmploymentContracts, hrPayrollRuns, hrPayrollStatements } from "@/db/schema/personnel-workforce";
import { documentVersions } from "@/db/schema/document-workflow";
import { documents } from "@/db/schema/registry";
import { findHrIntegrationEvent, lockPersonnel, requireHrIntegrationEvent } from "@/db/repositories/personnel/integration";
import { requirePersonnelPayment } from "@/db/repositories/personnel/finance";
import { insertAuditEvent as writeAuditEvent } from "@/db/repositories/platform/audit";
import { z } from "zod";
import { AccessError, assertBudgetUnitAccess, canPerformModuleOperation, type AppContext } from "@/lib/platform/tenant-context";
import { assertPayrollBudgetScope } from "./payroll-access";
import { enqueueHrIntegration } from "./workforce-service";
import { payrollSnapshotHash } from "@/lib/portal-servidor/payroll-publication";
import { auditEventTypes } from "@/lib/platform/audit-evidence";

export const payrollPaymentAllocationSchema = z.object({ statementId: z.string(), employeeId: z.string(), statementHash: z.string(), proofVersionId: z.string(), proofHash: z.string(), reference: z.string(), allocations: z.array(z.object({ paymentId: z.string(), amount: z.string() })), actorId: z.string() });
export async function allocateConfirmedPayrollPayment(connection: DatabaseConnection, context: AppContext, raw: unknown) {
  const input = z.object({ statementId: z.string().min(1), proofVersionId: z.string().min(1), reference: z.string().trim().min(10).max(2000), allocations: z.array(z.object({ paymentId: z.string().min(1), amount: z.string().regex(/^\d+(\.\d{1,2})?$/) }).strict()).min(1).max(100) }).strict().parse(raw);
  if (!canPerformModuleOperation(context.user, "RH", "update") || !canPerformModuleOperation(context.user, "FINANCEIRO", "update")) throw new AccessError("Conciliação individual exige RH e Financeiro.", 403);
  const [original] = await connection.db.select({ id: hrPayrollStatements.id, runId: hrPayrollStatements.runId, payrollId: hrPayrollRuns.payrollId }).from(hrPayrollStatements).innerJoin(hrPayrollRuns, eq(hrPayrollRuns.id, hrPayrollStatements.runId)).where(eq(hrPayrollStatements.id, input.statementId)).limit(1);
  if (!original) throw new Error("Demonstrativo não encontrado.");
  await assertPayrollBudgetScope({ ...context, database: connection.db }, original.payrollId);
  return withDatabaseTransaction(connection, async tx => {
    await lockPersonnel(tx, `ALOCACAO_PAGAMENTO:${original.runId}`);
    const [row] = await tx.select({ statement: hrPayrollStatements, run: hrPayrollRuns, contract: hrEmploymentContracts }).from(hrPayrollStatements).innerJoin(hrPayrollRuns, eq(hrPayrollRuns.id, hrPayrollStatements.runId)).innerJoin(hrEmploymentContracts, eq(hrEmploymentContracts.id, hrPayrollStatements.contractId)).where(eq(hrPayrollStatements.id, original.id)).limit(1);
    if (!row) throw new Error("Demonstrativo não encontrado.");
    const statement = { ...row.statement, run: row.run, contract: row.contract };
    if (statement.run.status !== "FECHADA" || statement.run.mode !== "OFICIAL" || statement.run.scope !== "PRODUCAO" || statement.revokedAt) throw new Error("Conciliação exige demonstrativo oficial fechado de produção, não revogado.");
    const source = await requireHrIntegrationEvent(tx, `FINANCEIRO:PAGAMENTOS:${statement.runId}`);
    if (source.status !== "CONCLUIDA" || source.eventType !== "PAGAMENTOS_FOLHA") throw new Error("Conclua o pagamento na origem financeira.");
    const ids = z.object({ paymentIds: z.array(z.string()) }).parse(source.result).paymentIds;
    const expenseOrigin = await requireHrIntegrationEvent(tx, `FINANCEIRO:DESPESAS:${statement.runId}`);
    const expensePlan = z.object({ lines: z.array(z.object({ component: z.enum(["GROSS", "EMPLOYER"]) })) }).parse(expenseOrigin.payload);
    const expenseIds = z.object({ expenseIds: z.array(z.string()) }).parse(expenseOrigin.result).expenseIds;
    if (new Set(input.allocations.map(row => row.paymentId)).size !== input.allocations.length || input.allocations.some(row => !ids.includes(row.paymentId))) throw new Error("Ordens divergentes ou repetidas no lote da folha.");
    const [proof] = await tx.select({ hashSha256: documentVersions.hashSha256 }).from(documentVersions).innerJoin(documents, eq(documents.id, documentVersions.documentId)).where(and(eq(documentVersions.id, input.proofVersionId), inArray(documentVersions.status, ["FINAL", "SIGNED"]), inArray(documents.status, ["Válido", "Assinado"]))).limit(1);
    if (!proof) throw new Error("Selecione uma comprovação GED válida da conciliação individual.");
    const normalized = input.allocations.map(row => ({ paymentId: row.paymentId, amount: new Decimal(row.amount).toFixed(2) })).sort((a, b) => a.paymentId.localeCompare(b.paymentId));
    if (!normalized.reduce((sum, row) => sum.add(row.amount), new Decimal(0)).eq(statement.net)) throw new Error("Alocações individuais devem conciliar integralmente com o líquido do demonstrativo.");
    const key = `RH:ALOCACAO_PAGAMENTO:${statement.id}`, previous = await findHrIntegrationEvent(tx, key);
    const payload = { statementId: statement.id, employeeId: statement.contract.employeeId, statementHash: payrollSnapshotHash(statement), proofVersionId: input.proofVersionId, proofHash: proof.hashSha256, reference: input.reference, allocations: normalized, actorId: context.user.id };
    if (previous) {
      const stored = payrollPaymentAllocationSchema.parse(previous.payload);
      if (previous.status !== "PROCESSADO" || stored.statementHash !== payload.statementHash || stored.proofVersionId !== payload.proofVersionId || stored.reference !== payload.reference || JSON.stringify(stored.allocations) !== JSON.stringify(normalized)) throw new Error("Conciliação individual já registrada com outros dados.");
      return previous.id;
    }
    for (const row of normalized) {
      await tx.execute(sql`SELECT id FROM "Payment" WHERE id=${row.paymentId} FOR UPDATE`);
      const payment = await requirePersonnelPayment(tx, row.paymentId);
      assertBudgetUnitAccess(context.user, payment.commitment.appropriation.budgetUnitId);
      const expenseId = payment.commitment.reservation?.expense?.id;
      if (!expenseId || expensePlan.lines[expenseIds.indexOf(expenseId)]?.component !== "GROSS") throw new Error("Alocação individual deve usar pagamento de remuneração, não encargos patronais.");
      if (payment.status !== "Paga" || !payment.netValueDecimal || new Decimal(row.amount).lt(0)) throw new Error("Ordem sem pagamento nativo confirmado ou valor líquido válido.");
      const existing = await tx.select({ payload: hrIntegrationEvents.payload }).from(hrIntegrationEvents).where(and(eq(hrIntegrationEvents.eventType, "PAGAMENTO_FOLHA_ALOCADO_POR_TITULAR"), eq(hrIntegrationEvents.status, "PROCESSADO")));
      const allocated = existing.flatMap(event => payrollPaymentAllocationSchema.parse(event.payload).allocations).filter(item => item.paymentId === payment.id).reduce((sum, item) => sum.add(item.amount), new Decimal(0));
      if (allocated.add(row.amount).gt(payment.netValueDecimal)) throw new Error("Alocação excede o líquido efetivamente pago na ordem.");
    }
    const event = await enqueueHrIntegration(tx, { sourceKey: key, domain: "RH", environment: "PRODUCAO", eventType: "PAGAMENTO_FOLHA_ALOCADO_POR_TITULAR", payload });
    await tx.update(hrIntegrationEvents).set({ status: "PROCESSADO" }).where(eq(hrIntegrationEvents.id, event.id));
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "PAYROLL_INDIVIDUAL_PAYMENT_ALLOCATION", targetId: statement.id });
    return event.id;
  }, { timeoutMs: 60000 });
}
