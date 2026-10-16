import { Prisma, type PrismaClient } from "@prisma/client";
import { reversePayment, updatePaymentStatusInTransaction, type FinanceActor } from "./index";
import { lockPaymentBankCorrelation } from "./annual-payment-program-transport";

const field = (payload: Record<string, unknown>, key: string) => typeof payload[key] === "string" && payload[key].trim() ? payload[key].trim() : null;

/** Correlation ownership and native execution commit together, including returns after annual transport. */
export async function applyPaymentBankReturn(db: PrismaClient, actor: FinanceActor, payload: Record<string, unknown>) {
  const externalId = field(payload, "payment_order_external_id");
  const status = field(payload, "status");
  if (!externalId || !status) throw new Error("Retorno de pagamento sem identificadores obrigatórios.");
  return db.$transaction(async tx => {
    await lockPaymentBankCorrelation(tx, externalId);
    const initial = await tx.payment.findUnique({ where: { paymentOrderExternalId: externalId } });
    if (!initial) throw new Error("Ordem de pagamento não encontrada no CeleriFlow.");
    await tx.$queryRaw`SELECT id FROM "Payment" WHERE id = ${initial.id} FOR UPDATE`;
    const payment = await tx.payment.findUniqueOrThrow({ where: { id: initial.id } });
    if (payment.paymentOrderExternalId !== externalId) throw new Error("Correlação bancária alterada; reprocesse o retorno.");
    if (field(payload, "integration_event_id") !== payment.integrationEventId || field(payload, "bank_account_external_id") !== payment.bankAccountExternalId) throw new Error("Retorno bancário não corresponde à ordem de pagamento emitida.");
    const rawAmount = payload.amount;
    if ((typeof rawAmount !== "number" && typeof rawAmount !== "string") || !String(rawAmount).trim()) throw new Error("Valor do retorno bancário inválido.");
    const amount = new Prisma.Decimal(rawAmount);
    if (!amount.isFinite() || !payment.netValueDecimal?.eq(amount)) throw new Error("Valor do retorno bancário não corresponde ao valor líquido da ordem.");
    const transactionId = field(payload, "bank_transaction_id");
    const rawDate = field(payload, "processed_at");
    const processedAt = rawDate ? new Date(rawDate) : new Date();
    if (!Number.isFinite(processedAt.getTime())) throw new Error("Data do retorno bancário inválida.");
    if (status === "SETTLED") {
      if (!transactionId) throw new Error("Confirmação bancária sem transação de débito.");
      if (payment.status === "Paga") {
        if (payment.bankTransactionId && payment.bankTransactionId !== transactionId) throw new Error("Ordem já confirmada com outra transação bancária.");
      } else {
        const transport = await tx.financialAuditLog.findFirst({ where: { action: "ANNUAL_PAYMENT_PROGRAM_COMPLETE", payload: { path: ["copies"], array_contains: [{ targetPaymentId: payment.id }] } } });
        if (transport) {
          const year = payment.executionFinancialYearId ? await tx.financialYear.findUniqueOrThrow({ where: { id: payment.executionFinancialYearId } }) : null;
          if (!rawDate || !year || processedAt < year.startDate || processedAt > year.endDate) throw new Error("Retorno da programação transportada exige data bancária no exercício de destino; concilie retornos do exercício anterior antes de transportar.");
          await tx.payment.update({ where: { id: payment.id }, data: { date: processedAt } });
        }
        await updatePaymentStatusInTransaction(tx, actor, payment.id, "Paga");
      }
      await tx.payment.update({ where: { id: payment.id }, data: { bankStatus: status, bankTransactionId: transactionId, bankProcessedAt: processedAt } });
    } else if (["REJECTED", "PENDING", "RECEIVED"].includes(status)) {
      if (payment.status !== "Emitida") throw new Error("Retorno pendente não pode alterar ordem já executada, cancelada ou transportada.");
      await tx.payment.update({ where: { id: payment.id }, data: { bankStatus: status, bankRejectionCode: field(payload, "rejection_code"), bankRejectionMessage: field(payload, "rejection_message") } });
    } else if (status === "REVERSED") {
      const reversalId = field(payload, "reversal_bank_transaction_id");
      if (!transactionId || transactionId !== payment.bankTransactionId || !reversalId) throw new Error("Estorno bancário sem transação original e novo crédito correspondentes.");
      if (payment.bankStatus === "REVERSED" && payment.reversalBankTransactionId === reversalId) return { paymentId: payment.id, replay: true };
      if (payment.status !== "Paga") throw new Error("O estorno bancário não possui pagamento liquidado correspondente.");
      const scopedDb = new Proxy(tx, { get(target, property) { if (property === "$transaction") return (callback: (client: Prisma.TransactionClient) => Promise<unknown>) => callback(tx); return Reflect.get(target, property); } }) as unknown as PrismaClient;
      await reversePayment(scopedDb, actor, payment.id, `Estorno confirmado pelo banco: ${transactionId}`);
      await tx.payment.update({ where: { id: payment.id }, data: { bankStatus: status, reversalOfBankTransactionId: transactionId, reversalBankTransactionId: reversalId, bankProcessedAt: processedAt } });
    } else throw new Error(`Status bancário não suportado: ${status}.`);
    return { paymentId: payment.id, replay: payment.status === "Paga" && status === "SETTLED" };
  }, { timeout: 120000 });
}
