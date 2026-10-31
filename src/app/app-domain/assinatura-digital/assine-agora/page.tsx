import { canPerformModuleOperation, getTenantContextForModule } from "@/lib/platform/tenant-context";
import { listCentralDocumentTypes, listCentralSigners } from "@/lib/signatures/central-service";
import { listCentralA1Integrations } from "@/lib/signatures/central-a1";
import AssineAgoraClient from "./AssineAgoraClient";
import { randomUUID } from "node:crypto";
import { getGedContext } from "@/lib/documents/ged-access";
import { requireManagedDocument } from "@/db/repositories/documents/ged";
import type { GedBatchSource } from "./batch";

export const dynamic = "force-dynamic";

export default async function AssineAgoraPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await getTenantContextForModule("ASSINATURA_DIGITAL");
  const params = await searchParams;
  let gedSource: GedBatchSource | undefined;
  if (typeof params.gedDocumentId === "string") {
    const document = await requireManagedDocument(await getGedContext("edit"), params.gedDocumentId);
    gedSource = { documentId: document.id, versionId: document.versionId, filename: document.filename, mimeType: document.mimeType, byteLength: document.byteLength, requestId: randomUUID() };
  }
  const [signers, documentTypes, integrations] = await Promise.all([
    listCentralSigners(context), listCentralDocumentTypes(context), listCentralA1Integrations(context),
  ]);
  const ownSigners = signers.filter(signer => signer.accountUserId === context.user.id || (!signer.accountUserId && !!context.user.employeeId && signer.employeeId === context.user.employeeId));
  return <AssineAgoraClient gedSource={gedSource} signers={ownSigners} currentUserName={context.user.name} documentTypes={documentTypes} integrations={integrations} canCreate={canPerformModuleOperation(context.user, "ASSINATURA_DIGITAL", "create")} />;
}
