import { isIP } from "node:net";
import { db } from "@/db/client";
import { isSameOriginRequest } from "@/lib/transparencia/request-origin";
import { checkRateLimit } from "@/lib/platform/rate-limit";
import { getDiscoverySettings } from "@/lib/transparencia/discovery-settings";
import { getTransparencySettings } from "@/lib/transparencia/presentation-settings";
import { publishedTransparencyCatalog } from "@/lib/transparencia/consultation-service";
import { pageFeedbackSchema, recordPageFeedback } from "@/lib/transparencia/page-feedback";

export async function POST(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  if (!isSameOriginRequest(request)) return Response.json({ error: "Origem não permitida." }, { status: 403, headers });
  const address = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || request.headers.get("x-real-ip") || "";
  const limit = checkRateLimit(`transparency-page-feedback:${isIP(address) ? address : "unknown"}`);
  if (!limit.allowed) return Response.json({ error: "Aguarde um pouco antes de tentar novamente." }, { status: 429, headers: { ...headers, "Retry-After": String(limit.retryAfterSeconds || 60) } });
  try {
    const text = await request.text();
    if (text.length > 12000) return Response.json({ error: "Avaliação muito extensa." }, { status: 413, headers });
    const parsed = pageFeedbackSchema.safeParse(JSON.parse(text));
    if (!parsed.success) return Response.json({ error: "Escolha uma nota de 1 a 5 e limite o comentário a 2.000 caracteres." }, { status: 400, headers });
    if (!(await getDiscoverySettings(db)).feedbackEnabled) return Response.json({ error: "A avaliação de páginas está desativada." }, { status: 409, headers });
    if (parsed.data.collectionSlug && !publishedTransparencyCatalog(await getTransparencySettings(db)).some(item => item.slug === parsed.data.collectionSlug)) return Response.json({ error: "Consulta não publicada." }, { status: 400, headers });
    await recordPageFeedback(db, parsed.data);
    return Response.json({ success: true }, { headers });
  } catch (error) {
    if (error instanceof SyntaxError) return Response.json({ error: "Formato de avaliação inválido." }, { status: 400, headers });
    console.error("[transparencia] Não foi possível registrar avaliação de página", error instanceof Error ? error.name : "erro");
    return Response.json({ error: "Não foi possível registrar a avaliação. Tente novamente." }, { status: 503, headers });
  }
}
