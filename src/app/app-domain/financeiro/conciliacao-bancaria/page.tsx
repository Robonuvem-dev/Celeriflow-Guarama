import { getActiveReconciliationSessionsAction } from "./actions";
import ConciliacaoBancariaClient from "./ConciliacaoBancariaClient";
import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { db } from "@/db/client";
import { and, asc, eq, inArray } from "drizzle-orm";
import { reconciliationBankAccounts } from "@/db/schema/finance-reconciliation";

export default async function ConciliacaoBancariaPage() {
  const sessionsRes = await getActiveReconciliationSessionsAction();
  const sessions = sessionsRes.data || [];
  const { database, user } = await getTenantContextForModule("FINANCEIRO");
  const accounts = await (database ?? db).select({ id: reconciliationBankAccounts.id, bankName: reconciliationBankAccounts.bankName, agency: reconciliationBankAccounts.agency, accountNumber: reconciliationBankAccounts.accountNumber }).from(reconciliationBankAccounts).where(and(eq(reconciliationBankAccounts.isActive, true), isSystemAdministrator(user) ? undefined : inArray(reconciliationBankAccounts.budgetUnitId, user.allowedBudgetUnitIds))).orderBy(asc(reconciliationBankAccounts.bankName), asc(reconciliationBankAccounts.accountNumber));

  return <ConciliacaoBancariaClient initialSessions={JSON.parse(JSON.stringify(sessions))} accounts={accounts} />;
}
