import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import ReceitasClient from "./ReceitasClient";
import { db } from "@/db/client";
import { Decimal } from "@/db/decimal";
import { listFinancePageSources } from "@/db/repositories/finance-pages/catalog";
import { listFinancePageBankAccounts, listFinancePageBudgetUnits } from "@/db/repositories/finance-pages/banking";
import { listFinancePageRevenueNatures, listFinancePageRevenues } from "@/db/repositories/finance-pages/reports";

export default async function ReceitasPage() {
  const context = await getTenantContextForModule("FINANCEIRO");
  const executor = context.database ?? db;
  const access = { allowedBudgetUnitIds: isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds };
  const [revenues, revenueNatures, resourceSources, bankAccounts, budgetUnits] = await Promise.all([
    listFinancePageRevenues(executor, access), listFinancePageRevenueNatures(executor), listFinancePageSources(executor),
    listFinancePageBankAccounts(executor, access).then(rows => rows.map(row => ({ id: row.id, bankName: row.bankName, agency: row.agency, accountNumber: row.accountNumber, resourceSourceId: row.resourceSourceId, budgetUnitId: row.budgetUnitId, isActive: row.isActive }))),
    listFinancePageBudgetUnits(executor, access),
  ]);

  return <ReceitasClient
    revenues={revenues.map((revenue) => ({
      id: revenue.id,
      date: revenue.date.toISOString(),
      value: Number(revenue.valueDecimal ?? revenue.value),
      stage: revenue.stage,
      classification: revenue.classification,
      history: revenue.history,
      revenueNature: revenue.revenueNature,
      resourceSource: revenue.resourceSource,
      resourceSourceId: revenue.resourceSourceId,
      redistributedValue: revenue.resourceRedistributions.reduce((total, item) => total.plus(item.valueDecimal), new Decimal(0)).toNumber(),
      hasReversal: Boolean(revenue.reversal),
    }))}
    revenueNatures={revenueNatures}
    resourceSources={resourceSources}
    bankAccounts={bankAccounts}
    budgetUnits={budgetUnits.flatMap((unit) => unit.planningEntityUnit ? [{ id: unit.id, name: unit.name, governmentEntityName: unit.planningEntityUnit.governmentEntity.name }] : [])}
  />;
}
