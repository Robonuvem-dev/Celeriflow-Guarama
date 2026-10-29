import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import AssinaturasClient from "./AssinaturasClient";
import { db } from "@/db/client";
import { listPendingDocumentSignatures } from "@/db/repositories/documents/queries";

export const dynamic = "force-dynamic";

export default async function AssinaturasPage() {
  const { user } = await getTenantContextForModule("DOCUMENTOS");
  const pendingSignatures = await listPendingDocumentSignatures(db, user.id);
  const documents = pendingSignatures.map((signature) => ({
    id: signature.documentId,
    title: signature.document.title,
    documentType: signature.document.documentType,
    createdAt: signature.requestedAt,
    status: signature.document.status,
  }));

  return <AssinaturasClient initialDocuments={documents} />;
}
