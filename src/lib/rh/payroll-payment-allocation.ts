import { Prisma } from "@prisma/client";
import { z } from "zod";
import { AccessError, assertBudgetUnitAccess, canPerformModuleOperation, type AppContext } from "@/lib/platform/tenant-context";
import { assertPayrollBudgetScope } from "./payroll-access";
import { enqueueHrIntegration } from "./workforce-service";
import { payrollSnapshotHash } from "@/lib/portal-servidor/payroll-publication";
import { writeAuditEvent, auditEventTypes } from "@/lib/platform/audit-evidence";

export const payrollPaymentAllocationSchema = z.object({ statementId: z.string(), employeeId: z.string(), statementHash: z.string(), proofVersionId: z.string(), proofHash: z.string(), reference: z.string(), allocations: z.array(z.object({ paymentId: z.string(), amount: z.string() })), actorId: z.string() });
export async function allocateConfirmedPayrollPayment(context: AppContext, raw: unknown) {
  const input = z.object({ statementId: z.string().min(1), proofVersionId: z.string().min(1), reference: z.string().trim().min(10).max(2000), allocations: z.array(z.object({ paymentId: z.string().min(1), amount: z.string().regex(/^\d+(\.\d{1,2})?$/) }).strict()).min(1).max(100) }).strict().parse(raw);
  if (!canPerformModuleOperation(context.user, "RH", "update") || !canPerformModuleOperation(context.user, "FINANCEIRO", "update")) throw new AccessError("Conciliação individual exige RH e Financeiro.", 403);
  const original = await context.prisma.hrPayrollStatement.findUniqueOrThrow({ where: { id: input.statementId }, include: { run: true } });
  await assertPayrollBudgetScope(context, original.run.payrollId);
  return context.prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`RH:ALOCACAO_PAGAMENTO:${original.runId}`}))`;
    const statement = await tx.hrPayrollStatement.findUniqueOrThrow({ where: { id: original.id }, include: { run: true, contract: true } });
    if (statement.run.status !== "FECHADA" || statement.run.mode !== "OFICIAL" || statement.run.scope !== "PRODUCAO" || statement.revokedAt) throw new Error("Conciliação exige demonstrativo oficial fechado de produção, não revogado.");
    const source = await tx.hrIntegrationEvent.findUniqueOrThrow({ where: { sourceKey: `FINANCEIRO:PAGAMENTOS:${statement.runId}` } });
    if (source.status !== "CONCLUIDA" || source.eventType !== "PAGAMENTOS_FOLHA") throw new Error("Conclua o pagamento na origem financeira.");
    const ids = z.object({ paymentIds: z.array(z.string()) }).parse(source.result).paymentIds;
    const expenseOrigin = await tx.hrIntegrationEvent.findUniqueOrThrow({ where: { sourceKey: `FINANCEIRO:DESPESAS:${statement.runId}` } });
    const expensePlan = z.object({ lines: z.array(z.object({ component: z.enum(["GROSS", "EMPLOYER"]) })) }).parse(expenseOrigin.payload);
    const expenseIds = z.object({ expenseIds: z.array(z.string()) }).parse(expenseOrigin.result).expenseIds;
    if (new Set(input.allocations.map(row => row.paymentId)).size !== input.allocations.length || input.allocations.some(row => !ids.includes(row.paymentId))) throw new Error("Ordens divergentes ou repetidas no lote da folha.");
    const proof = await tx.documentVersion.findFirst({ where: { id: input.proofVersionId, status: { in: ["FINAL", "SIGNED"] }, document: { status: { in: ["Válido", "Assinado"] } } }, select: { hashSha256: true } });
    if (!proof) throw new Error("Selecione uma comprovação GED válida da conciliação individual.");
    const normalized = input.allocations.map(row => ({ paymentId: row.paymentId, amount: new Prisma.Decimal(row.amount).toFixed(2) })).sort((a, b) => a.paymentId.localeCompare(b.paymentId));
    if (!normalized.reduce((sum, row) => sum.add(row.amount), new Prisma.Decimal(0)).eq(statement.net)) throw new Error("Alocações individuais devem conciliar integralmente com o líquido do demonstrativo.");
    const key = `RH:ALOCACAO_PAGAMENTO:${statement.id}`, previous = await tx.hrIntegrationEvent.findUnique({ where: { sourceKey: key } });
    const payload = { statementId: statement.id, employeeId: statement.contract.employeeId, statementHash: payrollSnapshotHash(statement), proofVersionId: input.proofVersionId, proofHash: proof.hashSha256, reference: input.reference, allocations: normalized, actorId: context.user.id };
    if (previous) {
      const stored = payrollPaymentAllocationSchema.parse(previous.payload);
      if (previous.status !== "PROCESSADO" || stored.statementHash !== payload.statementHash || stored.proofVersionId !== payload.proofVersionId || stored.reference !== payload.reference || JSON.stringify(stored.allocations) !== JSON.stringify(normalized)) throw new Error("Conciliação individual já registrada com outros dados.");
      return previous.id;
    }
    for (const row of normalized) {
      await tx.$queryRaw`SELECT id FROM "Payment" WHERE id=${row.paymentId} FOR UPDATE`;
      const payment = await tx.payment.findUniqueOrThrow({ where: { id: row.paymentId }, include: { commitment: { include: { appropriation: true, reservation: { include: { expense: true } } } } } });
      assertBudgetUnitAccess(context.user, payment.commitment.appropriation.budgetUnitId);
      const expenseId = payment.commitment.reservation?.expense?.id;
      if (!expenseId || expensePlan.lines[expenseIds.indexOf(expenseId)]?.component !== "GROSS") throw new Error("Alocação individual deve usar pagamento de remuneração, não encargos patronais.");
      if (payment.status !== "Paga" || !payment.netValueDecimal || new Prisma.Decimal(row.amount).lt(0)) throw new Error("Ordem sem pagamento nativo confirmado ou valor líquido válido.");
      const existing = await tx.hrIntegrationEvent.findMany({ where: { eventType: "PAGAMENTO_FOLHA_ALOCADO_POR_TITULAR", status: "PROCESSADO" }, select: { payload: true } });
      const allocated = existing.flatMap(event => payrollPaymentAllocationSchema.parse(event.payload).allocations).filter(item => item.paymentId === payment.id).reduce((sum, item) => sum.add(item.amount), new Prisma.Decimal(0));
      if (allocated.add(row.amount).gt(payment.netValueDecimal)) throw new Error("Alocação excede o líquido efetivamente pago na ordem.");
    }
    const event = await enqueueHrIntegration(tx, { sourceKey: key, domain: "RH", environment: "PRODUCAO", eventType: "PAGAMENTO_FOLHA_ALOCADO_POR_TITULAR", payload });
    await tx.hrIntegrationEvent.update({ where: { id: event.id }, data: { status: "PROCESSADO" } });
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "PAYROLL_INDIVIDUAL_PAYMENT_ALLOCATION", targetId: statement.id });
    return event.id;
  }, { timeout: 60000 });
}
