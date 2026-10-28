import { accountingTrialBalance } from "@/lib/financeiro";
import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import ContabilidadeClient from "./ContabilidadeClient";
import { db } from "@/db/client";
import { listFinancePageAccounts, listFinancePageUnits, listFinancePageYears } from "@/db/repositories/finance-pages/catalog";
import { readFinanceAccountingOverview } from "@/db/repositories/finance-pages/accounting";

export const dynamic = "force-dynamic";

export default async function ContabilidadePage() {
  const { database, user } = await getTenantContextForModule("FINANCEIRO");
  const executor = database ?? db;
  const permittedUnits = await listFinancePageUnits(executor, { allowedBudgetUnitIds: isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds }, undefined, "code");
  const units = permittedUnits.map(unit => ({ id: unit.budgetUnitId, name: unit.budgetUnit.name, governmentEntityId: unit.governmentEntityId, governmentEntityName: unit.governmentEntity.name, governmentEntityType: unit.governmentEntity.type }));
  const entityIds = [...new Set(units.map((unit) => unit.governmentEntityId))];
  const budgetUnitIds = units.map((unit) => unit.id);
  const [years, accounts, { transactions, monthlyCloses, annualCloses }] = await Promise.all([
    listFinancePageYears(executor, {}, entityIds),
    listFinancePageAccounts(executor),
    readFinanceAccountingOverview(executor, entityIds, budgetUnitIds),
  ]);
  const activeYear = years.find((year) => year.status === "Aberto") ?? years[0];
  const trialBalance = activeYear ? await accountingTrialBalance(executor, activeYear.id, undefined, budgetUnitIds) : [];
  return <ContabilidadeClient units={units} years={years.map((year) => ({ id: year.id, year: year.year, status: year.status, governmentEntityId: year.governmentEntityId, governmentEntityName: year.governmentEntity?.name ?? "Legado sem entidade" }))} accounts={accounts.map((account) => ({ id: account.id, code: account.code, name: account.name }))} transactions={transactions.map((transaction) => ({ id: transaction.id, date: transaction.date.toISOString(), history: transaction.history, status: transaction.status, entries: transaction.entries.map((entry) => ({ id: entry.id, type: entry.type, value: entry.valueDecimal?.toString() ?? String(entry.value), account: `${entry.account.code} - ${entry.account.name}` })) }))} trialBalance={trialBalance.map((row) => ({ account: `${row.account.code} - ${row.account.name}`, debit: row.debit.toString(), credit: row.credit.toString(), balance: row.balance.toString() }))} monthlyCloses={monthlyCloses.map((close) => ({ id: close.id, year: close.financialYear.year, competence: close.competence.toISOString(), status: close.status, closedAt: close.closedAt?.toISOString(), events: close.events.map((event) => ({ id: event.id, action: event.action, justification: event.justification, requestedBy: event.requestedByUsuario.nome, authorizedBy: event.authorizedByUsuario?.nome, requestedAt: event.requestedAt.toISOString(), authorizedAt: event.authorizedAt?.toISOString() })) }))} annualCloses={annualCloses.map((close) => ({ id: close.id, year: close.financialYear.year, status: close.status, closedBy: close.closedByUsuario?.nome, closedAt: close.closedAt?.toISOString() }))} />;
}
