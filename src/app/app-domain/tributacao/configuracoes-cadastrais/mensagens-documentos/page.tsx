import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { db } from "@/db/client";
import { listDocumentMessages } from "./repository";
import MensagensDocumentosClient from "./MensagensDocumentosClient";

export const dynamic = "force-dynamic";

export default async function MensagensDocumentosPage() {
  const context = await getTenantContextForModule("TRIBUTACAO");
  const database = context.database ?? db;
  const messages = await listDocumentMessages(database);

  return (
    <MensagensDocumentosClient messages={messages} />
  );
}
