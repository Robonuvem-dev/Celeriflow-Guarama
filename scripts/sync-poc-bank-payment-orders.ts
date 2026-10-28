import "dotenv/config";
import { createHash } from "crypto";
import { pocBankAccountExternalId, isPocVirtualBank } from "../src/lib/poc/poc-config";
import { and, asc, eq, isNotNull, or } from "drizzle-orm";
import { users } from "../src/db/schema/identity";
import { payments } from "../src/db/schema/finance-payments";
import { reconciliationBankAccounts } from "../src/db/schema/finance-reconciliation";
import { suppliers, companies } from "../src/db/schema/registry";
import { findFinancePayment } from "../src/db/repositories/finance/payments";

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

async function main() {
  const [{ db, databaseConnection }, { BankIntegrationClient }, { updatePaymentStatus, reversePayment }] = await Promise.all([
    import("../src/db/client"),
    import("../src/lib/financeiro/bank-integration-client"),
    import("../src/lib/financeiro"),
  ]);
  const [actor] = await db.select({ id: users.id, employeeId: users.employeeId }).from(users).where(and(eq(users.ativo, true), isNotNull(users.employeeId))).orderBy(asc(users.createdAt)).limit(1);
  if (!actor?.employeeId) throw new Error("A sincronizacao exige um usuario ativo vinculado a servidor.");

  const client = new BankIntegrationClient();
  const emittedPayments = await db.select({ payment: payments, bankAccount: { bankName: reconciliationBankAccounts.bankName, agency: reconciliationBankAccounts.agency, accountNumber: reconciliationBankAccounts.accountNumber }, company: { corporateName: companies.corporateName, cnpj: companies.cnpj } }).from(payments).innerJoin(reconciliationBankAccounts, eq(reconciliationBankAccounts.id, payments.bankAccountId)).innerJoin(suppliers, eq(suppliers.id, payments.supplierId)).leftJoin(companies, eq(companies.id, suppliers.companyId)).where(and(eq(payments.status, "Emitida"), eq(reconciliationBankAccounts.isActive, true)));

  let submitted = 0;
  for (const { payment, bankAccount, company } of emittedPayments) {
    if (!isPocVirtualBank(bankAccount.bankName)) continue;
    const externalAccountId = pocBankAccountExternalId(bankAccount.accountNumber);
    if (!externalAccountId) throw new Error(`Conta ${bankAccount.accountNumber} nao pertence a matriz bancária da POC.`);
    const paymentOrderExternalId = payment.orderNumber.startsWith("OP-") ? payment.orderNumber : `OP-${payment.orderNumber}`;
    const integrationEventId = `EVT-PAY-${payment.id}`;
    await client.submitPaymentOrder({
      paymentOrderExternalId,
      integrationEventId,
      bankAccountExternalId: externalAccountId,
      clientReference: paymentOrderExternalId,
      beneficiary: { name: company?.corporateName ?? `FORNECEDOR-${payment.supplierId}`, document: company?.cnpj },
      amount: Number(payment.netValueDecimal ?? payment.valueDecimal ?? payment.value),
      scheduledDate: payment.date,
      paymentMethod: payment.paymentMethod,
      purposeText: `Pagamento liquido da ordem ${paymentOrderExternalId}`,
      idempotencyKey: createHash("sha256").update(`celeriflow:payment:${payment.id}:v1`).digest("hex"),
    });
    submitted += 1;
    if (process.env.BANK_SANDBOX_PROCESS_PAYMENTS === "true") await client.processPaymentOrder(paymentOrderExternalId);
  }

  let settled = 0;
  let rejected = 0;
  let reversed = 0;
  const events = await client.fetchPendingInteractions();
  for (const event of events) {
    if (event.interactionType !== "PAYMENT_ORDER_STATUS_CHANGED") continue;
    const paymentOrderExternalId = stringValue(event.payload.payment_order_external_id);
    const bankStatus = stringValue(event.payload.status);
    if (!paymentOrderExternalId || !bankStatus) {
      await client.acknowledgeInteraction(event.externalId, "FAILED", "Retorno bancario sem ordem ou status.");
      continue;
    }
    const orderNumber = paymentOrderExternalId.replace(/^OP-/, "");
    const [payment] = await db.select({ id: payments.id, status: payments.status }).from(payments).where(or(eq(payments.orderNumber, orderNumber), eq(payments.orderNumber, paymentOrderExternalId))).limit(1);
    if (!payment) {
      await client.acknowledgeInteraction(event.externalId, "FAILED", `Pagamento ${paymentOrderExternalId} nao encontrado.`);
      continue;
    }
    if (bankStatus === "SETTLED" && payment.status === "Emitida") {
      await updatePaymentStatus(databaseConnection, { usuarioId: actor.id, employeeId: actor.employeeId }, payment.id, "Paga");
      settled += 1;
    } else if (bankStatus === "REJECTED") {
      rejected += 1;
    } else if (bankStatus === "REVERSED") {
      if (payment.status === "Emitida") await updatePaymentStatus(databaseConnection, { usuarioId: actor.id, employeeId: actor.employeeId }, payment.id, "Paga");
      const current = await findFinancePayment(db, payment.id);
      if (current?.status === "Paga") {
        await reversePayment(databaseConnection, { usuarioId: actor.id, employeeId: actor.employeeId }, payment.id, `Estorno confirmado pelo Banco Virtual: ${paymentOrderExternalId}`);
        reversed += 1;
      }
    }
    await client.acknowledgeInteraction(event.externalId, "COMPLETED");
  }

  console.log(JSON.stringify({ submitted, settled, rejected, reversed, pendingEvents: events.length }));
}

main().finally(async () => {
  const { databaseConnection } = await import("../src/db/client");
  await databaseConnection.pool.end();
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
