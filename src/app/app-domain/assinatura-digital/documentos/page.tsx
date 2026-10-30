import { canPerformModuleOperation, getTenantContextForModule } from "@/lib/platform/tenant-context";
import { listCentralDocumentTypes } from "@/lib/signatures/central-service";
import { serializeDocumentType } from "./cadastro-model";
import { DocumentosClient } from "./DocumentosClient";

export const dynamic = "force-dynamic";

export default async function CentralDocumentTypesPage() {
  const context = await getTenantContextForModule("ASSINATURA_DIGITAL");
  return <DocumentosClient initialRows={(await listCentralDocumentTypes(context)).map(serializeDocumentType)}
    canCreate={canPerformModuleOperation(context.user, "ASSINATURA_DIGITAL", "create")}
    canUpdate={canPerformModuleOperation(context.user, "ASSINATURA_DIGITAL", "update")} />;
}
