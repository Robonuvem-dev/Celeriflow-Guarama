import { and, eq, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { financeCheques } from "@/db/schema/finance-cheques";
import { reconciliationBankAccounts } from "@/db/schema/finance-reconciliation";
import { getTenantContextForModuleOperation, isSystemAdministrator } from "@/lib/platform/tenant-context";
export const dynamic = "force-dynamic";
export default async function ChequeReceipt({ params }: { params: Promise<{ id: string }> }) {
  const context = await getTenantContextForModuleOperation("FINANCEIRO", "issueReports");
  const { id } = await params;
  const [row] = await (context.database ?? db).select({ cheque: financeCheques, account: reconciliationBankAccounts }).from(financeCheques).innerJoin(reconciliationBankAccounts, eq(reconciliationBankAccounts.id, financeCheques.bankAccountId)).where(and(eq(financeCheques.id, id), isSystemAdministrator(context.user) ? undefined : inArray(reconciliationBankAccounts.budgetUnitId, context.user.allowedBudgetUnitIds)));
  if (!row) notFound();
  const { cheque, account } = row;
  return <main className="space-y-4 p-8"><h1 className="text-xl font-bold">Comprovante de emissão de cheque</h1><p>Banco: {account.bankName} · Agência: {account.agency} · Conta: {account.accountNumber}</p><p>Folha: {cheque.number} · Emissão: {cheque.issuedAt.toISOString().slice(0, 10)}</p><p>Favorecido: {cheque.payee}</p><p>Valor: R$ {cheque.amount.toFixed(2)}</p><p>Situação: {cheque.status}</p>{cheque.clearedAt && <p>Compensação: {cheque.clearedAt.toISOString().slice(0, 10)}</p>}{cheque.cancellationReason && <p>Cancelamento: {cheque.cancellationReason}</p>}<p>Registro: {cheque.id}</p><p>Documento de controle interno da folha emitida.</p></main>;
}
