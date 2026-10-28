import { canEditModule, getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { getBudgetAvailability } from "@/lib/financeiro";
import OrcamentoClient from "./OrcamentoClient"
import { db } from "@/db/client";
import { listFinancePageSources, listFinancePageYears } from "@/db/repositories/finance-pages/catalog";
import { listFinancePageAppropriations, listFinancePageDocuments, listFinancePageReservations, listFinancePageSuppliers } from "@/db/repositories/finance-pages/operations";
import { listFinancePageCreditRequests, listFinancePageExpenses, listFinancePageUnboundReceipts } from "@/db/repositories/finance-pages/budget";

export const dynamic = 'force-dynamic'

export default async function OrcamentoPage() {
  const context = await getTenantContextForModule("FINANCEIRO");
  const executor = context.database ?? db;
  const access = { allowedBudgetUnitIds: isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds };
  const [appropriations, reservations, financialYears, creditRequests, expenses, suppliers, resourceSources, legalDocuments, purchaseReceipts] = await Promise.all([
    listFinancePageAppropriations(executor, access), listFinancePageReservations(executor, access), listFinancePageYears(executor, access),
    listFinancePageCreditRequests(executor, access), listFinancePageExpenses(executor, access), listFinancePageSuppliers(executor, true),
    listFinancePageSources(executor), listFinancePageDocuments(executor, "legal"), listFinancePageUnboundReceipts(executor),
  ]);

  const availability = await Promise.all(appropriations.map(async appropriation => ({
    id: appropriation.id,
    ...(await getBudgetAvailability(executor, appropriation.id)),
  })));
  const availabilityById = new Map(availability.map(item => [item.id, item]));

  const displayAppropriations = appropriations.map(({ initialValueDecimal, updatedValueDecimal, committedValueDecimal, ...appropriation }) => ({
    ...appropriation,
    initialValue: Number(initialValueDecimal ?? appropriation.initialValue),
    updatedValue: Number(updatedValueDecimal ?? appropriation.updatedValue),
    committedValue: Number(committedValueDecimal ?? appropriation.committedValue),
    reservedValue: Number(availabilityById.get(appropriation.id)?.reserved ?? 0),
    availableValue: Number(availabilityById.get(appropriation.id)?.available ?? 0),
  }));

  const displayReservations = reservations.map(reservation => ({ id: reservation.id, number: reservation.number, status: reservation.status, appropriation: { code: reservation.appropriation.code }, value: Number(reservation.valueDecimal ?? reservation.value) }));
  const displayCreditRequests = creditRequests.map(({ totalValue, ...creditRequest }) => ({
    ...creditRequest,
    totalValue: Number(totalValue),
  }));

  return (
    <OrcamentoClient
      appropriations={displayAppropriations}
      reservations={displayReservations}
      financialYears={financialYears}
      creditRequests={displayCreditRequests}
      expenses={expenses.map(({ valueDecimal, ...expense }) => ({ ...expense, value: Number(valueDecimal ?? expense.value) }))}
      suppliers={suppliers.map((supplier) => ({ id: supplier.id, name: supplier.company?.corporateName ?? supplier.person?.fullName ?? "Fornecedor sem identificação" }))}
      resourceSources={resourceSources}
      legalDocuments={legalDocuments}
      purchaseReceipts={purchaseReceipts.map((receipt) => ({
        id: receipt.id,
        number: receipt.number,
        contractNumber: receipt.contract.number,
        secretariatId: receipt.contract.secretariatId,
        value: receipt.value,
      }))}
      canEdit={canEditModule(context.user, "FINANCEIRO")}
    />
  )
}
