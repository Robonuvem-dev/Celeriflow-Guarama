import { databaseConnection } from "@/db/client";
import { checkRateLimit } from "@/lib/platform/rate-limit";
import { readSignedLicenseArtifact } from "@/lib/tributacao/license-signatures";

export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || request.headers.get("x-real-ip") || "unknown";
  if (!checkRateLimit(`public-license-signature:${ip}`).allowed) return Response.json({ error: "Aguarde antes de consultar novamente." }, { status: 429 });
  try {
    const { code } = await params; const artifact = await readSignedLicenseArtifact(databaseConnection, code);
    const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
    if (new URL(request.url).searchParams.get("formato") === "pdf") return new Response(artifact.bytes, { headers: { ...headers, "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="alvara-original-assinado.pdf"' } });
    return Response.json({ signatureFormat: "DETACHED_DOCUMENT_HASH", signature: artifact.signature, currentLicenseStatus: artifact.licenseStatus, currentlyValid: artifact.valid, validationPath: `/validar-alvara/${code}` }, { headers: { ...headers, "Content-Disposition": 'attachment; filename="assinatura-alvara.json"' } });
  } catch { return Response.json({ error: "Original assinado indisponível ou sem integridade confirmada." }, { status: 404, headers: { "Cache-Control": "private, no-store" } }); }
}
