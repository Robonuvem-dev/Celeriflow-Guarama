import { BeneficioForm } from "../../BeneficioForm";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { readBenefit, readSupplierOptions } from "@/db/repositories/personnel-pages/records";

export default async function EditarBeneficioPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await getTenantContextForModule("RH"), database = context.database ?? db;
  const { id } = await params;
  const benefit = await readBenefit(database, id);

  if (!benefit) {
    notFound();
  }

  const suppliers = await readSupplierOptions(database);

  return (
    <BeneficioForm data={benefit} suppliers={suppliers} />
  );
}
