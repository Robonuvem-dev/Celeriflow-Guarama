import { notFound } from "next/navigation";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { ConvenioForm } from "../../ConvenioForm";
import { databaseConnection } from "@/db/client";
import { loadCovenantHeader } from "@/db/repositories/procurement/instruments";

export default async function EditarConvenioPage({ params }: { params: Promise<{ id: string }> }) {
  await getTenantContextForModule("COMPRAS");
  const { id } = await params;
  const covenant = await loadCovenantHeader(databaseConnection.db, id);
  if (!covenant) notFound();

  return <ConvenioForm data={{
    id: covenant.id,
    number: covenant.number,
    grantor: covenant.grantor,
    description: covenant.description,
    totalValueDecimal: Number(covenant.totalValueDecimal),
    startDate: covenant.startDate.toISOString(),
    endDate: covenant.endDate.toISOString(),
    status: covenant.status,
  }} />;
}
