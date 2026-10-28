import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { calculateInclusiveContractTermDays } from "@/lib/compras/contract-lifecycle";
import { ConveniosListClient } from "./ConveniosListClient";
import { databaseConnection } from "@/db/client";
import { listProcurementCovenants } from "@/db/repositories/procurement/instruments";

export default async function ConveniosPage() {
  await getTenantContextForModule("COMPRAS");
  const covenants = await listProcurementCovenants(databaseConnection.db);

  return <ConveniosListClient covenants={covenants.map((covenant) => ({
    id: covenant.id,
    number: covenant.number,
    grantor: covenant.grantor,
    description: covenant.description,
    totalValueDecimal: Number(covenant.totalValueDecimal),
    startDate: covenant.startDate.toISOString(),
    endDate: covenant.endDate.toISOString(),
    termDays: calculateInclusiveContractTermDays(covenant.startDate, covenant.endDate),
    status: covenant.status,
    partyCount: covenant._count.instrumentParties,
    measurementCount: covenant._count.measurements,
    installmentCount: covenant._count.installments,
  }))} />;
}
