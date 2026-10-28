import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { CulturaDocumentosClient, type CulturaDocumento } from "../components/CulturaDocumentosClient";
import { db } from "@/db/client";
import { listCulturalDocuments } from "@/db/repositories/culture/queries";

export default async function DocumentosPage() {
  await getTenantContextForModule("CULTURA");
  const documentos: CulturaDocumento[] = await listCulturalDocuments(db);

  return <CulturaDocumentosClient documentos={documentos} />;
}
