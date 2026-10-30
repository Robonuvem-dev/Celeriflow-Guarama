import { canPerformModuleOperation, getTenantContextForModule } from "@/lib/platform/tenant-context";
import { listCentralDocumentTypes, listCentralSigners } from "@/lib/signatures/central-service";
import { listCentralA1Integrations } from "@/lib/signatures/central-a1";
import AssineAgoraClient from "./AssineAgoraClient";

export const dynamic = "force-dynamic";

export default async function AssineAgoraPage() {
  const context = await getTenantContextForModule("ASSINATURA_DIGITAL");
  const [signers, documentTypes, integrations] = await Promise.all([
    listCentralSigners(context), listCentralDocumentTypes(context), listCentralA1Integrations(context),
  ]);
  return <AssineAgoraClient signers={signers} documentTypes={documentTypes} integrations={integrations} canCreate={canPerformModuleOperation(context.user, "ASSINATURA_DIGITAL", "create")} />;
}
