import { FileSignature } from "lucide-react";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { ContratosClient, type ContractRow } from "./ContratosClient";
import { db } from "@/db/client";
import { desc, eq } from "drizzle-orm";
import { procurementContracts } from "@/db/schema/procurement-core";
import { suppliers, companies } from "@/db/schema/registry";
import { people } from "@/db/schema/people";

export const dynamic = "force-dynamic";

export default async function ContratosPage() {
  await getTenantContextForModule("TRANSPARENCIA");
  const contractRows=await db.select({contract:procurementContracts,company:{tradeName:companies.tradeName,corporateName:companies.corporateName},person:{fullName:people.fullName}}).from(procurementContracts).innerJoin(suppliers,eq(suppliers.id,procurementContracts.supplierId)).leftJoin(companies,eq(companies.id,suppliers.companyId)).leftJoin(people,eq(people.id,suppliers.personId)).orderBy(desc(procurementContracts.startDate));
  const contracts=contractRows.map(row=>({...row.contract,supplier:{company:row.company,person:row.person}}));
  const rows: ContractRow[] = contracts.map((contract) => ({
    id: contract.id,
    number: contract.number,
    supplierName: contract.supplier.company?.tradeName || contract.supplier.company?.corporateName || contract.supplier.person?.fullName || "Desconhecido",
    object: contract.object,
    startDate: contract.startDate.toISOString(),
    endDate: contract.endDate.toISOString(),
    value: contract.updatedValue,
    status: contract.status,
  }));

  return (
    <PageFrame className="flex h-full min-h-0 flex-1 flex-col gap-1 overflow-hidden">
      <PageHeader title="Contratos públicos" icon={<FileSignature className="size-4 shrink-0 text-emerald-600" />} />
      <ContratosClient rows={rows} />
    </PageFrame>
  );
}
