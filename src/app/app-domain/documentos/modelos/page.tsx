import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import ModelosClient from "./ModelosClient";
import { db } from "@/db/client";
import { listDocumentModels } from "@/db/repositories/documents/queries";

export const dynamic = "force-dynamic";

export default async function DocumentosModelosPage() {
  await getTenantContextForModule("DOCUMENTOS");
  const modelos = await listDocumentModels(db);

  return <ModelosClient initialModelos={modelos} />;
}
