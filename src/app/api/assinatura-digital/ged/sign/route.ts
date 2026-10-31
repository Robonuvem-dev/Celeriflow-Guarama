import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { getGedContext } from "@/lib/documents/ged-access";
import { signGedVersionInCentral } from "@/lib/documents/ged-central-signature";
import { centralHttpError, centralMultipart, centralNoStore, centralText } from "@/lib/signatures/central-http";
import { centralAttemptLimit, centralCredentialFailure, centralCredentialLimit } from "@/lib/signatures/central-rate-limit";
import { CentralCredentialError } from "@/lib/signatures/central-error";
import type { CentralSignatureMethod } from "@/lib/contracts/signature-central";
export const runtime = "nodejs";
export const maxDuration = 120;
export async function POST(request: Request) {
  let signerId: string | undefined;
  try {
    const context = await getTenantContextForModuleOperation("ASSINATURA_DIGITAL", "create");
    await getGedContext("edit");
    const actorLimit = centralAttemptLimit("actor", context.user.id); if (actorLimit) return actorLimit;
    const data = await centralMultipart(request);
    signerId = centralText(data, "signerId");
    const limit = centralAttemptLimit("signer", signerId) || centralCredentialLimit(signerId); if (limit) return limit;
    const record = await signGedVersionInCentral(context, { documentId: centralText(data, "gedDocumentId"), versionId: centralText(data, "gedVersionId"), requestId: centralText(data, "requestId"), signerId, documentTypeId: centralText(data, "documentTypeId"), method: centralText(data, "method") as CentralSignatureMethod, integrationId: centralText(data, "integrationId") || undefined, password: centralText(data, "password") });
    return Response.json({ record }, { headers: centralNoStore });
  } catch (error) {
    if (error instanceof CentralCredentialError && signerId !== undefined) { const limit = centralCredentialFailure(signerId); if (limit) return limit; }
    return centralHttpError(error);
  }
}
