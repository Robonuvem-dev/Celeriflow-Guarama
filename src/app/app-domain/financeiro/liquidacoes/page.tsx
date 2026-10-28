import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import LiquidacoesClient from "./LiquidacoesClient"
import { SettlementCostsPanel } from "../custos/SettlementCostsPanel";
import { readMunicipalCosts } from "@/lib/financeiro/cost-overview";
import { db, databaseConnection } from "@/db/client";
import { Decimal } from "@/db/decimal";
import { listFinancePageCommitments, listFinancePageDocuments, listFinancePageEmployees, listFinancePageRetentionRules, listFinancePageSettlements } from "@/db/repositories/finance-pages/operations";
import { listFinancePageYears } from "@/db/repositories/finance-pages/catalog";

export default async function LiquidacoesPage() {
  const context = await getTenantContextForModule("FINANCEIRO");
  const executor = context.database ?? db;
  const access = { allowedBudgetUnitIds: isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds };
  const [settlements, commitments, employees, documents, retentionRules] = await Promise.all([
    listFinancePageSettlements(executor, access, true), listFinancePageCommitments(executor, access),
    listFinancePageEmployees(executor), listFinancePageDocuments(executor), listFinancePageRetentionRules(executor),
  ]);

  const displaySettlements = settlements.map(({ valueDecimal, payments, ...settlement }) => ({
    ...settlement,
    value: Number(valueDecimal ?? settlement.value),
    paidValue: payments.reduce((total, payment) => total.plus(payment.valueDecimal ?? payment.value), new Decimal(0)).toNumber(),
  }))

  const displayCommitments = commitments.map(commitment => {
    const value = commitment.movements.reduce((total, movement) => movement.type === "Reforço" ? total.plus(movement.valueDecimal) : total.minus(movement.valueDecimal), new Decimal(commitment.valueDecimal ?? commitment.value));
    const settledValue = commitment.settlements.reduce((total, settlement) => total.plus(settlement.valueDecimal ?? settlement.value), new Decimal(0));
    return { id: commitment.id, number: commitment.number, purchaseReceipt: commitment.purchaseReceipt, value: value.toNumber(), settledValue: settledValue.toNumber(), availableToSettle: value.minus(settledValue).toNumber() };
  })

  const yearIds = new Set(settlements.map(row => row.commitment.appropriation.financialYearId));
  const years = (await listFinancePageYears(executor)).filter(year => year.governmentEntityId !== null && yearIds.has(year.id));
  const costData = await Promise.all(years.map(year => readMunicipalCosts(databaseConnection, { usuarioId: context.user.id, allowedBudgetUnitIds: isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds }, year.id)));
  const settlementIds = new Set(settlements.map(row => row.id));
  return <><LiquidacoesClient settlements={displaySettlements} commitments={displayCommitments} employees={employees} documents={documents} retentionRules={retentionRules.map((rule) => ({ ...rule, calculationBasePercentage: Number(rule.calculationBasePercentage), ratePercentage: Number(rule.ratePercentage) }))} /><SettlementCostsPanel sources={costData.flatMap(data => data.sources.filter(source => ["SETTLEMENT", "PAYROLL"].includes(source.sourceType) && settlementIds.has(source.settlementId ?? source.sourceId)).map(source => ({ ...source, financialYearId: data.year.id })))} objects={costData.flatMap(data => data.objects.filter(object => object.isActive))} items={costData.flatMap(data => data.items.filter(item => item.isActive))} /></>;
}
