import { createHash } from "node:crypto";
import { db } from "@/db/client";
import { portalCertificateVersion } from "@/db/repositories/portal-content/taxpayer";
import { getCitizenApiAccount, portalApiError } from "@/lib/portal-cidadao/api-access";
import { authorizedTaxpayerIds } from "@/lib/portal-cidadao/tax-account";
import { getFile, downloadFilename } from "@/lib/platform/blob";
import { AccessError } from "@/lib/platform/tenant-context";
import { getVersionSignatureStatus } from "@/lib/documents/document-flow-policy";

export const runtime = "nodejs";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const account = await getCitizenApiAccount(), { id } = await params, ids = await authorizedTaxpayerIds(db, account.id, "CERTIDOES");
    const result = await portalCertificateVersion(db, id, ids, new Date());
    if (!result.authorized) throw new AccessError("Documento não disponível ao titular.", 404);
    const version = result.version;
    if (!version || getVersionSignatureStatus(version.signatures) === "PENDING_SIGNATURE" || (version.document.documentClass?.signaturePolicy !== "INTERNAL_ALLOWED" && version.status !== "SIGNED")) throw new AccessError("Documento indisponível ou assinatura pendente.", 423);
    const file = await getFile(version.fileUrl); if (!file?.stream) throw new AccessError("Arquivo indisponível.", 404);
    const bytes = new Uint8Array(await new Response(file.stream).arrayBuffer()); if (createHash("sha256").update(bytes).digest("hex") !== version.hashSha256) throw new AccessError("Integridade inválida.", 423);
    return new Response(bytes, { headers: { "Content-Type": file.blob.contentType || "application/octet-stream", "Content-Disposition": `attachment; filename="${downloadFilename(file.blob.pathname)}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return portalApiError(error); }
}
