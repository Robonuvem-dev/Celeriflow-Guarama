import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { calculateInclusiveContractTermDays } from "@/lib/compras/contract-lifecycle";
import { ContratosListClient } from "./ContratosListClient";
import { databaseConnection } from "@/db/client";
import { listProcurementContracts } from "@/db/repositories/procurement/instruments";

export default async function ContratosPage() {
  await getTenantContextForModule("COMPRAS");
  const contracts = await listProcurementContracts(databaseConnection.db).catch(() => []);

  return <ContratosListClient contracts={contracts.map((contract) => ({
    id: contract.id,
    number: contract.number,
    supplierName: contract.supplier?.company?.corporateName || contract.supplier?.company?.tradeName || contract.supplier?.person?.fullName || "Não informado",
    object: contract.object,
    secretariatName: contract.secretariat.name,
    budgetUnitLabel: contract.sourceBudgetUnit ? `${contract.sourceBudgetUnit.code} - ${contract.sourceBudgetUnit.name}` : null,
    startDate: contract.startDate.toISOString(),
    endDate: contract.endDate.toISOString(),
    termDays: calculateInclusiveContractTermDays(contract.startDate, contract.endDate),
    updatedValue: contract.updatedValue,
    amendmentCount: contract._count.amendments,
    status: contract.status,
  }))} />;
}
