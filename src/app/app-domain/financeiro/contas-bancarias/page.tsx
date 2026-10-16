import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { getBankAccountBalances } from "@/lib/financeiro";
import ContasBancariasClient from "./ContasBancariasClient"
import TreasuryTransferSection from "./TreasuryTransferSection";
import BankResourceSourcesClient from "./BankResourceSourcesClient";
import { getBankResourceSourceBalance } from "@/lib/financeiro/bank-resource-sources";

export default async function ContasBancariasPage() {
  const context = await getTenantContextForModule("FINANCEIRO");
  const { prisma } = context;
  const accounts = await prisma.bankAccount.findMany({
    where: {
      ...(isSystemAdministrator(context.user) ? {} : { budgetUnitId: { in: context.user.allowedBudgetUnitIds } }),
    },
    include: {
      resourceSource: true,
      budgetUnit: true,
      bank: true,
      bankBranch: true,
      permittedSources: { where: { isActive: true } },
    },
    orderBy: {
      bankName: 'asc'
    }
  })

  const resourceSources = await prisma.resourceSource.findMany({
    orderBy: { name: 'asc' }
  })

  const balances = await getBankAccountBalances(prisma, accounts.map((account) => account.id));
  const sourceAccounts = await Promise.all(accounts.map(async account => {
    const sourceIds = [...new Set([...(account.resourceSourceId ? [account.resourceSourceId] : []), ...account.permittedSources.map(source => source.resourceSourceId)])];
    const undocumented = Boolean(await prisma.treasuryMovement.count({ where: { bankAccountId: account.id, status: "Confirmado", resourceSourceId: null } }));
    return { id: account.id, label: `${account.bankName} · ${account.agency} · ${account.accountNumber}`, sourceIds, undocumented, balances: undocumented ? [] : await Promise.all(sourceIds.map(async sourceId => ({ sourceId, balance: (await getBankResourceSourceBalance(prisma, account.id, sourceId)).toFixed(2) }))) };
  }));
  const displayAccounts = accounts.map((account) => ({
    id: account.id,
    bankName: account.bankName,
    agency: account.agency,
    bankId: account.bankId,
    bankBranchId: account.bankBranchId,
    accountNumber: account.accountNumber,
    accountType: account.accountType,
    resourceSourceId: account.resourceSourceId,
    budgetUnitId: account.budgetUnitId,
    accountingPlanId: account.accountingPlanId,
    purpose: account.purpose,
    isActive: account.isActive,
    resourceSource: account.resourceSource ? { id: account.resourceSource.id, name: account.resourceSource.name } : null,
    budgetUnit: account.budgetUnit ? { id: account.budgetUnit.id, code: account.budgetUnit.code, name: account.budgetUnit.name } : null,
    currentBalance: Number(balances[account.id] ?? 0),
  }))

  const budgetUnits = await prisma.budgetUnit.findMany({
    where: isSystemAdministrator(context.user) ? {} : { id: { in: context.user.allowedBudgetUnitIds } },
    orderBy: { code: "asc" },
  });
  const accountingPlans = await prisma.accountingPlan.findMany({
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true },
  });
  const banks = await prisma.bank.findMany({
    where: { status: "ATIVO" },
    include: { branches: { where: { status: "ATIVA" }, orderBy: { code: "asc" } } },
    orderBy: { compe: "asc" },
  });

  const transferAccountAccess = isSystemAdministrator(context.user) ? {} : { budgetUnitId: { in: context.user.allowedBudgetUnitIds } };
  const transfers = await prisma.treasuryTransfer.findMany({
    where: {
      AND: [
        { sourceBankAccount: transferAccountAccess },
        { destinationBankAccount: transferAccountAccess },
      ],
    },
    include: {
      sourceBankAccount: { select: { id: true, bankName: true, agency: true, accountNumber: true, isActive: true } },
      destinationBankAccount: { select: { id: true, bankName: true, agency: true, accountNumber: true, isActive: true } },
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 20,
  });

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 overflow-hidden">
      <div className="min-h-0 flex-1"><ContasBancariasClient accounts={displayAccounts} resourceSources={resourceSources} budgetUnits={budgetUnits} accountingPlans={accountingPlans} banks={banks} /></div>
      <details className="shrink-0 rounded-md border border-slate-200 bg-white px-2 py-1"><summary className="cursor-pointer text-xs font-semibold text-slate-700">Fontes permitidas e disponibilidade por fonte</summary><div className="max-h-[55vh] overflow-y-auto"><BankResourceSourcesClient accounts={sourceAccounts} sources={resourceSources.map(source => ({ id: source.id, code: source.code, name: source.name }))} /></div></details>
      <details className="shrink-0 rounded-md border border-slate-200 bg-white px-2 py-1">
        <summary className="cursor-pointer text-xs font-semibold text-slate-700">Transferências entre contas</summary>
      <div className="max-h-[55vh] overflow-y-auto px-1 pb-2 sm:px-2">
        <TreasuryTransferSection
          accounts={displayAccounts.map(({ id, bankName, agency, accountNumber, isActive }) => ({ id, bankName, agency, accountNumber, isActive, sourceIds: sourceAccounts.find(account => account.id === id)?.sourceIds ?? [] }))}
          sources={resourceSources.map(source => ({ id: source.id, code: source.code, name: source.name }))}
          transfers={transfers.map((transfer) => ({
            id: transfer.id,
            date: transfer.date.toISOString(),
            value: Number(transfer.valueDecimal),
            history: transfer.history,
            sourceBankAccount: transfer.sourceBankAccount,
            destinationBankAccount: transfer.destinationBankAccount,
          }))}
        />
      </div></details>
    </div>
  );
}
