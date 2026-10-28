import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { getBankAccountBalances } from "@/lib/financeiro";
import ContasBancariasClient from "./ContasBancariasClient"
import TreasuryTransferSection from "./TreasuryTransferSection";
import BankResourceSourcesClient from "./BankResourceSourcesClient";
import { getBankResourceSourceBalance } from "@/lib/financeiro/bank-resource-sources";
import { db } from "@/db/client";
import { listFinancePageAccounts, listFinancePageSources } from "@/db/repositories/finance-pages/catalog";
import { hasFinancePageUndocumentedMovement, listFinancePageBankAccounts, listFinancePageBanks, listFinancePageBudgetUnits, listFinancePageTransfers } from "@/db/repositories/finance-pages/banking";

export default async function ContasBancariasPage() {
  const context = await getTenantContextForModule("FINANCEIRO");
  const executor = context.database ?? db;
  const access = { allowedBudgetUnitIds: isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds };
  const accounts = await listFinancePageBankAccounts(executor, access);
  const resourceSources = await listFinancePageSources(executor, "name");
  const balances = await getBankAccountBalances(executor, accounts.map((account) => account.id));
  const sourceAccounts = await Promise.all(accounts.map(async account => {
    const sourceIds = [...new Set([...(account.resourceSourceId ? [account.resourceSourceId] : []), ...account.permittedSources.map(source => source.resourceSourceId)])];
    const undocumented = await hasFinancePageUndocumentedMovement(executor, account.id);
    return { id: account.id, label: `${account.bankName} · ${account.agency} · ${account.accountNumber}`, sourceIds, undocumented, balances: undocumented ? [] : await Promise.all(sourceIds.map(async sourceId => ({ sourceId, balance: (await getBankResourceSourceBalance(executor, account.id, sourceId)).toFixed(2) }))) };
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

  const [budgetUnits, accountingPlans, banks, transfers] = await Promise.all([
    listFinancePageBudgetUnits(executor, access), listFinancePageAccounts(executor), listFinancePageBanks(executor), listFinancePageTransfers(executor, access),
  ]);

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
