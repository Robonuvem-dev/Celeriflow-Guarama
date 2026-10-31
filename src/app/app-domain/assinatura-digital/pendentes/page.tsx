import { canPerformModuleOperation } from "@/lib/platform/tenant-context";
import { db } from "@/db/client";
import { listPendingDocumentSignatures } from "@/db/repositories/documents/queries";
import { PendingSignaturesClient } from "../PendingSignaturesClient";
import { getUnifiedSignatureContext } from "@/lib/documents/ged-access";

export const dynamic = "force-dynamic";

export default async function DigitalSignaturePage() {
  const context = await getUnifiedSignatureContext();
  const signatures = await listPendingDocumentSignatures(context.database ?? db, context.user.id);
  return <PendingSignaturesClient
    canSign={canPerformModuleOperation(context.user, "ASSINATURA_DIGITAL", "create") || canPerformModuleOperation(context.user, "DOCUMENTOS", "create")}
    initialDocuments={signatures.map(signature => ({
      id: signature.documentId, title: signature.document.title,
      documentType: signature.document.documentType, requestedAt: signature.requestedAt.toISOString(),
    }))}
  />;
}
