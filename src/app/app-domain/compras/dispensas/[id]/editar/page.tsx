import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { DispensaForm } from "../../DispensaForm";
import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { loadDirectContracting, loadDirectContractingOptions } from "@/db/repositories/procurement/direct-contracting";

export default async function EditarDispensaPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await getTenantContextForModule("COMPRAS");
  const resolvedParams = await params;
  const [dispensa, { processos, fornecedores }] = await Promise.all([
    loadDirectContracting(context.database ?? db, resolvedParams.id),
    loadDirectContractingOptions(context.database ?? db),
  ]);

  if (!dispensa) {
    notFound();
  }

  return <DispensaForm data={dispensa} processos={processos} fornecedores={fornecedores} />;
}
