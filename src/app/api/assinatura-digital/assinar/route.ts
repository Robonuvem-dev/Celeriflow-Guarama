import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { signCentralFile } from "@/lib/signatures/central-service";
import { centralFile, centralHttpError, centralMultipart, centralNoStore, centralText } from "@/lib/signatures/central-http";
import type { CentralSignatureMethod } from "@/lib/contracts/signature-central";
import { centralAttemptLimit, centralCredentialFailure, centralCredentialLimit } from "@/lib/signatures/central-rate-limit";
import { CentralCredentialError } from "@/lib/signatures/central-error";
export const runtime = "nodejs";
export async function POST(request: Request) {
  let signerId: string | undefined;
  try {
    const context = await getTenantContextForModuleOperation("ASSINATURA_DIGITAL", "create");
    const actorLimit = centralAttemptLimit("actor", context.user.id);
    if (actorLimit) return actorLimit;
    const data = await centralMultipart(request);
    signerId = centralText(data, "signerId");
    const signerLimit = centralAttemptLimit("signer", signerId);
    if (signerLimit) return signerLimit;
    const credentialLimit = centralCredentialLimit(signerId);
    if (credentialLimit) return credentialLimit;
    const record = await signCentralFile(context, { file: centralFile(data, true)!, signerId, documentTypeId: centralText(data, "documentTypeId"),
      method: centralText(data, "method") as CentralSignatureMethod, integrationId: centralText(data, "integrationId") || undefined, password: centralText(data, "password"), requestId: centralText(data, "requestId") });
    return Response.json({ record }, { headers: centralNoStore });
  } catch (error) {
    if (error instanceof CentralCredentialError && signerId !== undefined) {
      const limit = centralCredentialFailure(signerId);
      if (limit) return limit;
    }
    return centralHttpError(error);
  }
}
