import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { getBankAccountBalances } from "@/lib/financeiro";
import ContasBancariasClient from "./ContasBancariasClient"
import TreasuryTransferSection from "./TreasuryTransferSection";
import BankResourceSourcesClient from "./BankResourceSourcesClient";
import FinanceAuxiliaryForm from "../FinanceAuxiliaryForm";
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
    <>
      <ContasBancariasClient accounts={displayAccounts} resourceSources={resourceSources} budgetUnits={budgetUnits} accountingPlans={accountingPlans} banks={banks} />
      <FinanceAuxiliaryForm title="Fontes permitidas e disponibilidade por fonte"><BankResourceSourcesClient accounts={sourceAccounts} sources={resourceSources.map(source => ({ id: source.id, code: source.code, name: source.name }))} /></FinanceAuxiliaryForm>
      <FinanceAuxiliaryForm title="Transferências entre contas">
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
      </FinanceAuxiliaryForm>
    </>
  );
}
