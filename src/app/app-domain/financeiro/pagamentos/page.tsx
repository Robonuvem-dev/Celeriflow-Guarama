import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import PagamentosClient from "./PagamentosClient"
import { getBankAccountBalances } from "@/lib/financeiro";
import { getBankResourceSourceBalance } from "@/lib/financeiro/bank-resource-sources";
import { db } from "@/db/client";
import { Decimal } from "@/db/decimal";
import { listFinancePageCommitments, listFinancePageDocuments, listFinancePageSettlements, listFinancePageSuppliers, listFinancePageWithholdings } from "@/db/repositories/finance-pages/operations";
import { hasFinancePageUndocumentedMovement, listFinancePageBankAccounts, listFinancePagePayments } from "@/db/repositories/finance-pages/banking";

export default async function PagamentosPage() {
  const context = await getTenantContextForModule("FINANCEIRO");
  const executor = context.database ?? db;
  const access = { allowedBudgetUnitIds: isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds };
  const [payments, commitments, settlements, bankAccounts, suppliers] = await Promise.all([
    listFinancePagePayments(executor, access),
    listFinancePageCommitments(executor, access),
    listFinancePageSettlements(executor, access),
    listFinancePageBankAccounts(executor, access, true),
    listFinancePageSuppliers(executor),
  ]);

  const displayPayments = payments.map(({ valueDecimal, netValueDecimal, retentions, commitment, bankAccount, ...payment }) => {
    const { valueDecimal: commitmentValueDecimal, ...displayCommitment } = commitment
    const { currentBalanceDecimal, ...displayBankAccount } = bankAccount

    return {
      ...payment,
      value: Number(valueDecimal ?? payment.value),
      netValue: Number(netValueDecimal ?? valueDecimal ?? payment.value),
      retentionValue: retentions.reduce((total, retention) => total.plus(retention.valueDecimal), new Decimal(0)).toNumber(),
      commitment: {
        ...displayCommitment,
        value: Number(commitmentValueDecimal ?? displayCommitment.value),
      },
      bankAccount: {
        ...displayBankAccount,
        currentBalance: Number(currentBalanceDecimal ?? displayBankAccount.currentBalance),
      },
    }
  })

  const displayCommitments = commitments.map(commitment => ({
    id: commitment.id, number: commitment.number, supplierId: commitment.supplierId, purchaseReceipt: commitment.purchaseReceipt,
    value: commitment.movements.reduce((total, movement) => movement.type === "Reforço" ? total.plus(movement.valueDecimal) : total.minus(movement.valueDecimal), new Decimal(commitment.valueDecimal ?? commitment.value)).toNumber(),
  }))

  const displaySettlements = settlements.map(settlement => {
    const value = new Decimal(settlement.valueDecimal ?? settlement.value);
    const paidValue = settlement.payments.reduce((total, payment) => total.plus(payment.valueDecimal ?? payment.value), new Decimal(0));
    return { id: settlement.id, commitmentId: settlement.commitmentId, documentRef: settlement.documentRef, value: value.toNumber(), paidValue: paidValue.toNumber(), availableToPay: value.minus(paidValue).toNumber() };
  });

  const bankBalances = await getBankAccountBalances(executor, bankAccounts.map(account => account.id));
  const displayBankAccounts = await Promise.all(bankAccounts.map(async account => {
    const sources = [...new Map([...(account.resourceSource ? [account.resourceSource] : []), ...account.permittedSources.map(permission => permission.resourceSource)].map(source => [source.id, source])).values()];
    const undocumented = await hasFinancePageUndocumentedMovement(executor, account.id);
    return { id: account.id, bankName: account.bankName, agency: account.agency, accountNumber: account.accountNumber, cashBalance: (bankBalances[account.id] ?? 0).toString(), sourceBalances: await Promise.all(sources.map(async source => ({ sourceCode: source.code, balance: undocumented ? null : (await getBankResourceSourceBalance(executor, account.id, source.id)).toFixed(2) }))) };
  }));

  const pendingWithholdings = await listFinancePageWithholdings(executor, access);
  const receiptDocuments = await listFinancePageDocuments(executor);

  const displayPendingWithholdings = pendingWithholdings.map((pw) => ({
    id: pw.id,
    type: pw.retention.type,
    description: pw.retention.description,
    value: Number(pw.valueDecimal),
    orderNumber: pw.retention.payment.orderNumber,
    dueDate: pw.dueDate ? pw.dueDate.toISOString().substring(0, 10) : null,
  }));

  return (
    <PagamentosClient
      payments={displayPayments}
      commitments={displayCommitments}
      settlements={displaySettlements}
      bankAccounts={displayBankAccounts}
      suppliers={suppliers}
      pendingWithholdings={displayPendingWithholdings}
      receiptDocuments={receiptDocuments}
    />
  );
}
