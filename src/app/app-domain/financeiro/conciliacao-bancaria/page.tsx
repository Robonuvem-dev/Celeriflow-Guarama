import { getActiveReconciliationSessionsAction } from "./actions";
import ConciliacaoBancariaClient from "./ConciliacaoBancariaClient";
import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";

export default async function ConciliacaoBancariaPage() {
  const sessionsRes = await getActiveReconciliationSessionsAction();
  const sessions = sessionsRes.data || [];
  const { prisma, user } = await getTenantContextForModule("FINANCEIRO");
  const accounts = await prisma.bankAccount.findMany({ where: { isActive: true, ...(isSystemAdministrator(user) ? {} : { budgetUnitId: { in: user.allowedBudgetUnitIds } }) }, select: { id: true, bankName: true, agency: true, accountNumber: true }, orderBy: [{ bankName: "asc" }, { accountNumber: "asc" }] });

  return <ConciliacaoBancariaClient initialSessions={JSON.parse(JSON.stringify(sessions))} accounts={accounts} />;
}
