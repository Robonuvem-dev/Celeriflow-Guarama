import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { db } from "@/db/client";
import { listPurchaseProcesses } from "@/db/repositories/procurement/purchase-processes";
import { ProcessosListClient } from "./ProcessosListClient";

export default async function ProcessosComprasPage() {
  const context = await getTenantContextForModule("COMPRAS");
  const processos = await listPurchaseProcesses(context.database ?? db).catch(() => []);

  return <ProcessosListClient processes={processos.map((process) => ({
    id: process.id,
    number: process.number,
    object: process.object,
    type: process.type,
    modality: process.modality,
    status: process.status,
    estimatedValue: process.estimatedValue,
    secretariatName: process.secretariat.acronym || process.secretariat.name,
    itemCount: process._count.items,
    originCount: process._count.requestOrigins,
    preliminaryStudyCount: process._count.preliminaryStudies,
    termOfReferenceCount: process._count.termsOfReference,
    createdAt: process.createdAt.toISOString(),
  }))} />;
}
