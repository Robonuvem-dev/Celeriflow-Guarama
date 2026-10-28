import { FileSignature } from "lucide-react";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import AssinaturasClient from "./AssinaturasClient";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
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

  return (
    <PageFrame className="flex h-full min-h-0 max-w-6xl flex-col">
      <PageHeader title="Assinaturas Eletrônicas" icon={<FileSignature className="size-4 shrink-0 text-indigo-600" />} />
      {documents.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-sm">
              Você não possui documentos pendentes de assinatura no momento.
            </div>
          ) : (
            <AssinaturasClient initialDocuments={documents} />
          )}
    </PageFrame>
  );
}
