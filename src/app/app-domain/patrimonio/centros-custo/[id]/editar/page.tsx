import { notFound } from "next/navigation";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { CostCenterForm } from "../../CostCenterForm";
import { updateCostCenterAction } from "../../actions";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { costCenters } from "@/db/schema/master-data";

export default async function EditarCentroCustoPage({ params }: { params: Promise<{ id: string }> }) {
  await getTenantContextForModule("PATRIMONIO");
  const { id } = await params;
  const [costCenter] = await db.select({ id: costCenters.id, code: costCenters.code, name: costCenters.name, description: costCenters.description }).from(costCenters).where(eq(costCenters.id, id)).limit(1);
  if (!costCenter) notFound();
  return <CostCenterForm title={`Editar Centro de Custo · ${costCenter.code}`} submitLabel="Salvar alterações" action={updateCostCenterAction.bind(null, costCenter.id)} initial={costCenter} />;
}
