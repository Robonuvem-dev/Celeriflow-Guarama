import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/platform/rate-limit";
import { renderConfiguredLicensePdf } from "@/lib/tributacao/license-pdf";

export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || request.headers.get("x-real-ip") || "unknown";
  if (!checkRateLimit(`public-license-pdf:${ip}`).allowed) return Response.json({ error: "Aguarde antes de consultar novamente." }, { status: 429 });
  try { const { code } = await params; const bytes = await renderConfiguredLicensePdf(prisma, code); return new Response(new Uint8Array(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": "attachment; filename=alvara.pdf", "Cache-Control": "private, no-store" } }); }
  catch { return Response.json({ error: "Alvará não encontrado." }, { status: 404, headers: { "Cache-Control": "private, no-store" } }); }
}
