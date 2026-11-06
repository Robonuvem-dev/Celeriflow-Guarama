import { db } from "@/db/client";
import { loadContractsWorkspaceData } from "@/db/repositories/procurement/instruments";
import { calculateInclusiveContractTermDays } from "@/lib/compras/contract-lifecycle";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { formatCnpj, formatCpf } from "@/app/app-domain/cadastros/fornecedores/supplier-utils";
import { ContratosListClient, type ContractRow } from "./ContratosListClient";

export const dynamic = "force-dynamic";

export default async function ContratosPage() {
  const context = await getTenantContextForModule("COMPRAS");
  const { contracts, selectors } = await loadContractsWorkspaceData(context.database ?? db);

  const rows: ContractRow[] = contracts.map((contract) => {
    const isPj = Boolean(contract.supplier.company);
    const supplierName =
      contract.supplier.company?.corporateName ||
      contract.supplier.person?.fullName ||
      "Fornecedor não identificado";
    const document = contract.supplier.company?.cnpj
      ? formatCnpj(contract.supplier.company.cnpj)
      : contract.supplier.person?.cpf
        ? formatCpf(contract.supplier.person.cpf)
        : "Não informado";

    return {
      id: contract.id,
      number: contract.number,
      supplierId: contract.supplierId,
      supplierName,
      supplierDetails: {
        id: contract.supplier.id,
        type: isPj ? "PJ" : contract.supplier.person ? "PF" : "Não informado",
        name: supplierName,
        tradeName: contract.supplier.company?.tradeName || "—",
        document,
        companyType: isPj
          ? contract.supplier.company?.companyType || "Não informado"
          : "Pessoa Física",
        category: contract.supplier.category || "—",
        businessBranch: contract.supplier.businessBranch || "—",
        primaryCnae: contract.supplier.company?.primaryCnae || "Não informado",
        secondaryCnaes: contract.supplier.company?.secondaryCnaes || "Não informados",
        certificationsValidUntil: contract.supplier.certificationsValidUntil
          ? contract.supplier.certificationsValidUntil.toISOString()
          : null,
        bankData: contract.supplier.bankData || "Não informado",
        status: contract.supplier.status,
        notes: contract.supplier.notes || "Sem observações cadastradas",
      },
      processNumber: contract.processNumber,
      object: contract.object,
      secretariatName: contract.secretariat.name,
      budgetUnitLabel: contract.sourceBudgetUnit
        ? `${contract.sourceBudgetUnit.code} - ${contract.sourceBudgetUnit.name}`
        : "UG não vinculada",
      startDate: contract.startDate.toISOString(),
      endDate: contract.endDate.toISOString(),
      termDays: calculateInclusiveContractTermDays(contract.startDate, contract.endDate),
      initialValue: contract.initialValue,
      updatedValue: contract.updatedValue,
      amendmentCount: contract.amendments.length,
      status: contract.status,
      managerId: contract.managerId,
      inspectorId: contract.inspectorId,
      managerName: contract.managerName,
      inspectorName: contract.inspectorName,
      amendments: contract.amendments.map((item) => ({
        id: item.id,
        type: item.type,
        justification: item.justification,
        previousValue: item.previousValue,
        newValue: item.newValue,
        previousEndDate: item.previousEndDate ? item.previousEndDate.toISOString() : null,
        newEndDate: item.newEndDate ? item.newEndDate.toISOString() : null,
        status: item.status,
        createdAt: item.createdAt.toISOString(),
      })),
      responsibilityGroups: contract.responsibilityGroups,
      instrumentParties: contract.instrumentParties.map((p) => ({
        ...p,
        startDate: p.startDate ? p.startDate.toISOString() : null,
        endDate: p.endDate ? p.endDate.toISOString() : null,
      })),
    };
  });

  return <ContratosListClient contracts={rows} selectors={selectors} />;
}
