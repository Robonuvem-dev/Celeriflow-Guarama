import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { ObrasDocumentosClient } from "../components/ObrasDocumentosClient";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { db } from "@/db/client";
import { listWorksDocuments } from "@/db/repositories/works-pages/infrastructure";

export default async function DocumentosPage() {
  const context = await getTenantContextForModule("OBRAS");
  const documentos = await listWorksDocuments(context.database ?? db);

  return <PageFrame className="px-1 py-1 md:px-2"><ObrasDocumentosClient documentos={documentos} /></PageFrame>;
}
